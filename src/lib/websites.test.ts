import {test} from "node:test";
import assert from "node:assert/strict";
import {websiteHref, websiteLabel} from "./websites.ts";

test("websiteHref adds a scheme and rejects junk", () => {
    assert.equal(websiteHref("redplanet.vc"), "https://redplanet.vc/");
    assert.equal(websiteHref("http://fund.com/team"), "http://fund.com/team");
    assert.equal(websiteHref("  www.fund.com "), "https://www.fund.com/");
    assert.equal(websiteHref(""), null);
    assert.equal(websiteHref("not a site"), null);
});

test("websiteLabel strips scheme, www and trailing slash", () => {
    assert.equal(websiteLabel("https://www.redplanet.vc/"), "redplanet.vc");
    assert.equal(websiteLabel("fund.com/team"), "fund.com/team");
});
