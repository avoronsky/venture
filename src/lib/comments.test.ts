import {test} from "node:test";
import assert from "node:assert/strict";
import {authorLabel, dayLabel, groupTimeline, shortDate, writtenOnOtherDay} from "./comments.ts";
import type {Activity} from "./types.ts";

const now = new Date(2026, 9, 20, 12, 0); // Tue Oct 20 2026

function entry(id: number, occurred_on: string, created_at: string, kind: Activity["kind"] = "note"): Activity {
    return {id, org_id: "o", investor_id: "i", kind, body: `#${id}`, occurred_on, author_email: "a@x.com", edited_at: null, created_by: null, created_at};
}

test("dayLabel names nearby days and formats the rest", () => {
    assert.equal(dayLabel("2026-10-20", now), "Today");
    assert.equal(dayLabel("2026-10-19", now), "Yesterday");
    assert.equal(dayLabel("2026-10-14", now), "Wed, Oct 14");
    assert.equal(dayLabel("2025-12-31", now), "Dec 31, 2025");
});

test("shortDate drops the year only for the current year", () => {
    assert.equal(shortDate("2026-03-05", now), "Mar 5");
    assert.equal(shortDate("2025-03-05", now), "Mar 5, 2025");
});

test("authorLabel", () => {
    assert.equal(authorLabel("Alex@X.com", "alex@x.com"), "You");
    assert.equal(authorLabel("maria.k@fund.vc", "alex@x.com"), "maria.k");
    assert.equal(authorLabel(null, "alex@x.com"), "Someone");
});

test("groupTimeline sorts by the chosen date, then by when it was written", () => {
    const days = groupTimeline([
        entry(1, "2026-10-14", "2026-10-14T10:00:00Z"),
        entry(2, "2026-10-20", "2026-10-20T09:00:00Z"),
        entry(3, "2026-10-14", "2026-10-20T11:00:00Z"), // backdated, written later
        entry(4, "2026-10-20", "2026-10-20T15:00:00Z", "stage"),
    ]);
    assert.deepEqual(days.map((d) => d.date), ["2026-10-20", "2026-10-14"]);
    assert.deepEqual(days[0].entries.map((e) => e.id), [4, 2]);
    assert.deepEqual(days[1].entries.map((e) => e.id), [3, 1]);
});

test("groupTimeline can hide stage history", () => {
    const days = groupTimeline([entry(1, "2026-10-20", "2026-10-20T09:00:00Z", "stage"), entry(2, "2026-10-19", "2026-10-19T09:00:00Z")], {includeHistory: false});
    assert.deepEqual(days.map((d) => d.date), ["2026-10-19"]);
});

test("writtenOnOtherDay flags backdated comments", () => {
    const t = new Date(2026, 9, 20, 11, 0).toISOString();
    assert.equal(writtenOnOtherDay({occurred_on: "2026-10-14", created_at: t}), true);
    assert.equal(writtenOnOtherDay({occurred_on: "2026-10-20", created_at: t}), false);
});
