// Run with: npm test  (Node's built-in test runner; no extra dependencies)
import {test} from "node:test";
import assert from "node:assert/strict";
import {checkRange, daysUntil, formatMoney, mapMandate, mapStage, normalizeDate, parseMoney, raiseMetrics} from "./pipeline.ts";
import {parseCSV, toCSV} from "./csv.ts";

test("parseMoney understands K/M suffixes, symbols and commas", () => {
    assert.equal(parseMoney("1.5M"), 1_500_000);
    assert.equal(parseMoney("250k"), 250_000);
    assert.equal(parseMoney("$2,000,000"), 2_000_000);
    assert.equal(parseMoney("€300K"), 300_000);
    assert.equal(parseMoney(""), 0);
    assert.equal(parseMoney("abc"), 0);
    assert.equal(parseMoney("-5"), 0);
});

test("formatMoney is compact", () => {
    assert.equal(formatMoney(0), "$0");
    assert.equal(formatMoney(250_000), "$250K");
    assert.equal(formatMoney(1_500_000), "$1.5M");
    assert.equal(formatMoney(2_000_000), "$2M");
    assert.equal(formatMoney(12_500_000), "$12.5M");
});

test("checkRange", () => {
    assert.equal(checkRange(500_000, 2_000_000), "$500K–$2M");
    assert.equal(checkRange(500_000, 0), "$500K+");
    assert.equal(checkRange(0, 1_000_000), "≤$1M");
    assert.equal(checkRange(0, 0), "");
});

test("mapStage maps spreadsheet wording", () => {
    assert.equal(mapStage("Term Sheet"), "termsheet");
    assert.equal(mapStage("DD"), "diligence");
    assert.equal(mapStage("IC"), "ic");
    assert.equal(mapStage("declined"), "passed");
    assert.equal(mapStage("intro call"), "meeting");
    assert.equal(mapStage("wired"), "closed");
    assert.equal(mapStage(""), "target");
});

test("mapMandate", () => {
    assert.equal(mapMandate("Yes"), "yes");
    assert.equal(mapMandate("excluded"), "no");
    assert.equal(mapMandate("case by case"), "open");
    assert.equal(mapMandate(""), "unknown");
});

test("raiseMetrics splits firm, term-sheet and weighted money and ignores passed", () => {
    const m = raiseMetrics([
        {stage: "closed", amount: 1_000_000, next_date: null},
        {stage: "committed", amount: 500_000, next_date: null},
        {stage: "termsheet", amount: 2_000_000, next_date: null},
        {stage: "diligence", amount: 1_000_000, next_date: null},
        {stage: "passed", amount: 9_000_000, next_date: null},
    ], 5_000_000);
    assert.equal(m.committed, 1_500_000);
    assert.equal(m.termSheets, 2_000_000);
    assert.equal(m.earlyWeighted, 250_000);
    assert.equal(m.weighted, 1_000_000 + 475_000 + 1_500_000 + 250_000);
    assert.equal(m.remaining, 3_500_000);
});

test("daysUntil and normalizeDate", () => {
    const now = new Date(2026, 9, 18);
    assert.equal(daysUntil("2026-10-21", now), 3);
    assert.equal(daysUntil("2026-10-15", now), -3);
    assert.equal(daysUntil(null, now), null);
    assert.equal(normalizeDate("2026-10-18"), "2026-10-18");
    assert.equal(normalizeDate(""), null);
    assert.equal(normalizeDate("not a date"), null);
});

test("CSV round-trips quotes, commas and CRLF", () => {
    const t = parseCSV('Fund,Notes\r\n"A, Inc","say ""hi"""\nB,x\n\n');
    assert.deepEqual(t, [["Fund", "Notes"], ["A, Inc", 'say "hi"'], ["B", "x"]]);
    assert.equal(toCSV(["a", "b"], [["x,y", 'q"']]), 'a,b\n"x,y","q"""');
});
