import {test} from "node:test";
import assert from "node:assert/strict";
import {base64Url, buildMessage, encodeHeader, formatAddress, htmlToText} from "./mime.ts";

const decode = (b64: string) => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s+/g, "")), (c) => c.charCodeAt(0)));

test("encodeHeader keeps ASCII and encodes everything else in short UTF-8 words", () => {
    assert.equal(encodeHeader("November update"), "November update");
    const subject = "Оновлення для інвесторів — листопад 2026 🚀";
    const encoded = encodeHeader(subject);
    const words = encoded.split("\r\n ");
    assert.ok(words.length > 1);
    for (const w of words) assert.ok(w.length <= 75, w);
    assert.equal(words.map((w) => decode(w.slice(10, -2))).join(""), subject);
});

test("formatAddress quotes ASCII names and encodes others", () => {
    assert.equal(formatAddress({email: "a@b.co"}), "a@b.co");
    assert.equal(formatAddress({email: "a@b.co", name: "Ann \"A\" Lee"}), "\"Ann A Lee\" <a@b.co>");
    assert.match(formatAddress({email: "a@b.co", name: "Олена"}), /^=\?UTF-8\?B\?.+\?= <a@b\.co>$/);
});

test("htmlToText ignores source line breaks and keeps table rows together", () => {
    const html = "<ul>\n  <li>One</li>\n  <li>Two</li>\n</ul>\n<table><tr><td>Cash</td><td>$1M</td></tr>\n<tr><td>Team</td><td>12</td></tr></table>";
    assert.equal(htmlToText(html), "• One\n• Two\n\nCash $1M\nTeam 12");
});

test("htmlToText keeps structure and link targets", () => {
    const html = `<html><head><style>p{color:red}</style></head><body>
        <h1>November</h1><p>Hi Ann,<br>we shipped&nbsp;v2 &amp; signed <a href="https://x.io/pr">a pilot</a>.</p>
        <ul><li>Revenue: $10k</li><li>Team: 12</li></ul><p>Reply to <a href="mailto:a@b.co">a@b.co</a></p></body></html>`;
    assert.equal(htmlToText(html), "November\n\nHi Ann,\nwe shipped v2 & signed a pilot (https://x.io/pr).\n\n• Revenue: $10k\n• Team: 12\n\nReply to a@b.co");
});

test("buildMessage makes a multipart message whose parts decode back", () => {
    const msg = buildMessage({
        from: {email: "alex@marsrovers.com", name: "Alex"},
        to: {email: "ann@fund.vc", name: "Ann Lee"},
        subject: "Update",
        html: "<p>Привіт, Ann</p>",
        boundary: "B",
        date: new Date(Date.UTC(2026, 10, 26, 17, 0)),
    });
    assert.ok(msg.startsWith("From: \"Alex\" <alex@marsrovers.com>\r\nTo: \"Ann Lee\" <ann@fund.vc>\r\nSubject: Update\r\nDate: Thu, 26 Nov 2026 17:00:00 +0000\r\n"));
    assert.ok(msg.includes("Content-Type: multipart/alternative; boundary=\"B\""));
    const parts = msg.split("--B").slice(1, 3).map((p) => p.split("\r\n\r\n")[1]);
    assert.equal(decode(parts[0]), "Привіт, Ann");
    assert.equal(decode(parts[1]), "<p>Привіт, Ann</p>");
    assert.ok(msg.endsWith("--B--\r\n"));
});

test("base64Url has no padding or URL-unsafe characters", () => {
    const s = base64Url("subjects?>>>~~~ ÿ");
    assert.doesNotMatch(s, /[+/=]/);
});
