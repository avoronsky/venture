import {test} from "node:test";
import assert from "node:assert/strict";
import {isValidEmail, parseRecipients} from "./recipients.ts";

test("isValidEmail", () => {
    assert.equal(isValidEmail("ann@fund.vc"), true);
    assert.equal(isValidEmail("ann@fund"), false);
    assert.equal(isValidEmail("ann lee@fund.vc"), false);
});

test("parseRecipients reads bare emails, one per line or separated", () => {
    const {recipients} = parseRecipients("Ann@Fund.VC\nbob@angel.com, cara@x.io; dan@y.co");
    assert.deepEqual(recipients.map((r) => r.email), ["ann@fund.vc", "bob@angel.com", "cara@x.io", "dan@y.co"]);
});

test("parseRecipients reads names in Name <email> form, quoted or not", () => {
    const {recipients} = parseRecipients(`Ann Lee <ann@fund.vc>, "Smith, Bob" <bob@angel.com>`);
    assert.deepEqual(recipients, [
        {email: "ann@fund.vc", name: "Ann Lee", firm: ""},
        {email: "bob@angel.com", name: "Smith, Bob", firm: ""},
    ]);
});

test("parseRecipients reads name and firm from a spreadsheet row", () => {
    assert.deepEqual(parseRecipients("Ann Lee\tFund Capital\tann@fund.vc").recipients, [{email: "ann@fund.vc", name: "Ann Lee", firm: "Fund Capital"}]);
    assert.deepEqual(parseRecipients("Bob, bob@angel.com").recipients, [{email: "bob@angel.com", name: "Bob", firm: ""}]);
});

test("parseRecipients drops repeats and reports lines without an email", () => {
    const {recipients, skipped} = parseRecipients("ann@fund.vc\nANN@fund.vc\nCall Bob next week\n\n");
    assert.equal(recipients.length, 1);
    assert.deepEqual(skipped, ["Call Bob next week"]);
});
