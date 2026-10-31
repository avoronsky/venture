import {test} from "node:test";
import assert from "node:assert/strict";
import {linkedinHref, linkedinLabel, websiteHref, websiteLabel} from "./websites.ts";

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

test("linkedinHref accepts LinkedIn links and handles, rejects other sites", () => {
    assert.equal(linkedinHref("linkedin.com/in/ana-ruiz"), "https://linkedin.com/in/ana-ruiz");
    assert.equal(linkedinHref("https://www.linkedin.com/company/red-planet/"), "https://www.linkedin.com/company/red-planet/");
    assert.equal(linkedinHref("ua.linkedin.com/in/ana"), "https://ua.linkedin.com/in/ana");
    assert.equal(linkedinHref("ana-ruiz"), "https://www.linkedin.com/in/ana-ruiz");
    assert.equal(linkedinHref("@ana-ruiz"), "https://www.linkedin.com/in/ana-ruiz");
    assert.equal(linkedinHref("redplanet.vc/team"), null);
    assert.equal(linkedinHref("notlinkedin.com/in/x"), null);
    assert.equal(linkedinHref(""), null);
});

test("linkedinLabel shows the path", () => {
    assert.equal(linkedinLabel("https://www.linkedin.com/in/ana-ruiz/"), "in/ana-ruiz");
    assert.equal(linkedinLabel("linkedin.com/company/red-planet"), "company/red-planet");
    assert.equal(linkedinLabel("ana-ruiz"), "in/ana-ruiz");
});
