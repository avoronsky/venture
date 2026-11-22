// Run with: npm test  (Node's built-in test runner; no extra dependencies)
import {test} from "node:test";
import assert from "node:assert/strict";
import {checkRange, currencySymbol, daysUntil, formatMoney, parseMoney, raiseMetrics} from "./pipeline.ts";
import {toCSV} from "./csv.ts";

test("parseMoney understands K/M suffixes, symbols and commas", () => {
    assert.equal(parseMoney("1.5M"), 1_500_000);
    assert.equal(parseMoney("250k"), 250_000);
    assert.equal(parseMoney("$2,000,000"), 2_000_000);
    assert.equal(parseMoney("€300K"), 300_000);
    assert.equal(parseMoney(""), 0);
    assert.equal(parseMoney("abc"), 0);
    assert.equal(parseMoney("-5"), 0);
    assert.equal(parseMoney("£1.2m"), 1_200_000);
    assert.equal(parseMoney("CHF 750K"), 750_000);
    assert.equal(parseMoney("₴40M"), 40_000_000);
});

test("formatMoney is compact", () => {
    assert.equal(formatMoney(0), "$0");
    assert.equal(formatMoney(250_000), "$250K");
    assert.equal(formatMoney(1_500_000), "$1.5M");
    assert.equal(formatMoney(2_000_000), "$2M");
    assert.equal(formatMoney(12_500_000), "$12.5M");
});

test("formatMoney uses the organization's currency", () => {
    assert.equal(formatMoney(1_500_000, "EUR"), "€1.5M");
    assert.equal(formatMoney(250_000, "GBP"), "£250K");
    assert.equal(formatMoney(40_000_000, "UAH"), "₴40M");
    assert.equal(formatMoney(0, "EUR"), "€0");
    assert.equal(formatMoney(2_000_000, "CHF"), "CHF\u00a02M");
    assert.equal(formatMoney(2_000_000, ""), "2M");
    assert.equal(currencySymbol("USD"), "$");
    assert.equal(checkRange(500_000, 2_000_000, "EUR"), "€500K–€2M");
});

test("checkRange", () => {
    assert.equal(checkRange(500_000, 2_000_000), "$500K–$2M");
    assert.equal(checkRange(500_000, 0), "$500K+");
    assert.equal(checkRange(0, 1_000_000), "≤$1M");
    assert.equal(checkRange(0, 0), "");
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

test("daysUntil", () => {
    const now = new Date(2026, 9, 18);
    assert.equal(daysUntil("2026-10-21", now), 3);
    assert.equal(daysUntil("2026-10-15", now), -3);
    assert.equal(daysUntil(null, now), null);
});

test("CSV export quotes commas, quotes and line breaks", () => {
    assert.equal(toCSV(["a", "b"], [["x,y", 'q"']]), 'a,b\n"x,y","q"""');
    assert.equal(toCSV(["n"], [["line1\nline2"], [null]]), 'n\n"line1\nline2"\n');
});
