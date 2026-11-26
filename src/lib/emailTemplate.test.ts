import {test} from "node:test";
import assert from "node:assert/strict";
import {blankPlaceholders, firstName, renderTemplate, subjectLabel, unknownPlaceholders} from "./emailTemplate.ts";

const ann = {email: "ann@fund.vc", name: "Ann Lee", firm: "Fund <Capital> & Co"};
const nobody = {email: "x@y.com", name: "", firm: ""};

test("firstName takes the first word and skips titles", () => {
    assert.equal(firstName("Ann Lee"), "Ann");
    assert.equal(firstName("  Dr. Maria  Kowalska "), "Maria");
    assert.equal(firstName("Олександр Воронський"), "Олександр");
    assert.equal(firstName(""), "");
});

test("renderTemplate fills placeholders, with spaces and any case", () => {
    assert.equal(renderTemplate("Hi {{first_name}} ({{ Email }})", ann), "Hi Ann (ann@fund.vc)");
});

test("renderTemplate uses the fallback when a value is empty", () => {
    assert.equal(renderTemplate("Hi {{first_name|there}},", nobody), "Hi there,");
    assert.equal(renderTemplate("Hi {{first_name | there }},", ann), "Hi Ann,");
    assert.equal(renderTemplate("At {{firm}}.", nobody), "At .");
});

test("renderTemplate escapes recipient values in HTML only", () => {
    assert.equal(renderTemplate("<b>{{firm}}</b>", ann, {html: true}), "<b>Fund &lt;Capital&gt; &amp; Co</b>");
    assert.equal(renderTemplate("{{firm}}", ann), "Fund <Capital> & Co");
});

test("unknown placeholders are left as written and reported once", () => {
    assert.equal(renderTemplate("Hi {{frist_name}}", ann), "Hi {{frist_name}}");
    assert.deepEqual(unknownPlaceholders("{{frist_name}} {{name}}", "{{frist_name}} {{company}}"), ["{{frist_name}}", "{{company}}"]);
});

test("blankPlaceholders counts recipients a placeholder without fallback leaves empty", () => {
    assert.deepEqual(blankPlaceholders("Hi {{first_name|there}} at {{firm}} {{firm}}", [ann, nobody, nobody]), [{placeholder: "{{firm}}", count: 2}]);
});

test("subjectLabel shows a template subject without placeholders", () => {
    assert.equal(subjectLabel("{{first_name}}, our November update"), "our November update");
    assert.equal(subjectLabel("{{first_name|Hi}}, November update"), "Hi, November update");
    assert.equal(subjectLabel("November update"), "November update");
});
