import {test} from "node:test";
import assert from "node:assert/strict";
import {cleanContacts, contactKey, contactsSummary, contactsToText, mergeContacts, normalizeContacts} from "./contacts.ts";

test("normalizeContacts keeps known string fields only", () => {
    assert.deepEqual(normalizeContacts(null), []);
    assert.deepEqual(normalizeContacts([{name: "Ana", phone: "1", email: 5}, "x", null]), [{name: "Ana"}]);
});

test("cleanContacts trims and drops empty contacts", () => {
    assert.deepEqual(cleanContacts([{name: " Ana ", role: " ", email: "a@f.vc"}, {role: "Partner"}, {name: "", email: ""}]),
        [{name: "Ana", email: "a@f.vc"}]);
});

test("contactKey prefers email, then name, then LinkedIn", () => {
    assert.equal(contactKey({name: "Ana", email: "ANA@f.vc"}), "ana@f.vc");
    assert.equal(contactKey({name: " Ana "}), "name:ana");
    assert.equal(contactKey({linkedin: "linkedin.com/in/x"}), "li:linkedin.com/in/x");
    assert.equal(contactKey({role: "Partner"}), null);
});

test("mergeContacts adds only new people and keeps existing details", () => {
    const base = [{name: "Ana Ruiz", email: "ana@f.vc"}];
    const merged = mergeContacts(base, [{name: "Ana R.", email: "Ana@f.vc"}, {name: "Bo"}, {name: "bo", role: "Associate"}]);
    assert.deepEqual(merged, [{name: "Ana Ruiz", email: "ana@f.vc"}, {name: "Bo"}]);
});

test("summary and CSV text", () => {
    assert.equal(contactsSummary([]), "");
    assert.equal(contactsSummary([{email: "a@f.vc"}, {name: "Bo"}, {name: "Cy"}]), "a@f.vc +2");
    assert.equal(contactsToText([{name: "Ana", role: "Partner", email: "a@f.vc", linkedin: "linkedin.com/in/ana"}, {name: "Bo"}]),
        "Ana (Partner) <a@f.vc> linkedin.com/in/ana; Bo");
});
