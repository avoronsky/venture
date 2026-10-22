import {test} from "node:test";
import assert from "node:assert/strict";
import {defaultRound, sortRounds} from "./rounds.ts";
import type {Round} from "./types.ts";

function round(id: string, status: Round["status"], created_at: string): Round {
    return {id, org_id: "o", name: id, status, target: 0, instrument: "", cap: 0, close_date: null, created_at, updated_at: created_at};
}

const seed = round("seed", "closed", "2026-01-10T00:00:00Z");
const bridge = round("bridge", "active", "2026-05-01T00:00:00Z");
const seriesA = round("seriesA", "active", "2026-10-01T00:00:00Z");

test("sortRounds lists active rounds newest first, then closed ones", () => {
    assert.deepEqual(sortRounds([seed, bridge, seriesA]).map((r) => r.id), ["seriesA", "bridge", "seed"]);
});

test("defaultRound prefers the last round used, else the newest active round", () => {
    assert.equal(defaultRound([seed, bridge, seriesA], "seed")?.id, "seed");
    assert.equal(defaultRound([seed, bridge, seriesA], "deleted-round")?.id, "seriesA");
    assert.equal(defaultRound([seed], null)?.id, "seed");
    assert.equal(defaultRound([], null), undefined);
});
