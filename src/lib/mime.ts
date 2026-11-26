// Builds the raw email the Gmail API sends. No app imports so it can be unit-tested with plain Node.
//
// One message per recipient: multipart/alternative with a plain-text and an HTML part, both UTF-8
// and base64-encoded, so any language and any markup survive the trip.

export interface Address {
    email: string;
    name?: string;
}

export interface MessageInput {
    from: Address;
    to: Address;
    subject: string;
    html: string;
    /** Plain-text version; derived from the HTML when omitted. */
    text?: string;
    /** For tests: fixed boundary and date. */
    boundary?: string;
    date?: Date;
}

const encoder = new TextEncoder();

function bytesToBase64(bytes: Uint8Array): string {
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(bin);
}

export function base64Utf8(s: string): string {
    return bytesToBase64(encoder.encode(s));
}

/** base64url without padding, as the Gmail API's `raw` field expects. */
export function base64Url(s: string): string {
    return base64Utf8(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function wrap(s: string, width = 76): string {
    const lines: string[] = [];
    for (let i = 0; i < s.length; i += width) lines.push(s.slice(i, i + width));
    return lines.join("\r\n");
}

const isPrintableAscii = (s: string) => /^[\x20-\x7e]*$/.test(s);

/**
 * A header value safe for any language (RFC 2047): plain ASCII stays as it is; anything else becomes
 * UTF-8 encoded words of at most 75 characters, never splitting a character between two words.
 */
export function encodeHeader(value: string): string {
    const v = value.replace(/[\r\n]+/g, " ");
    if (isPrintableAscii(v)) return v;
    const words: string[] = [];
    let chunk = "";
    for (const ch of v) {
        if (encoder.encode(chunk + ch).length > 45) {
            words.push(chunk);
            chunk = "";
        }
        chunk += ch;
    }
    if (chunk) words.push(chunk);
    return words.map((w) => `=?UTF-8?B?${base64Utf8(w)}?=`).join("\r\n ");
}

export function formatAddress({email, name}: Address): string {
    const n = (name ?? "").replace(/[\r\n"<>\\]+/g, " ").replace(/\s+/g, " ").trim();
    if (!n) return email;
    return isPrintableAscii(n) ? `"${n}" <${email}>` : `${encodeHeader(n)} <${email}>`;
}

const ENTITIES: Record<string, string> = {amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ", mdash: "—", ndash: "–", hellip: "…", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", bull: "•", middot: "·", copy: "©"};

function decodeEntities(s: string): string {
    return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
        if (e[0] === "#") {
            const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
            return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
        }
        return ENTITIES[e.toLowerCase()] ?? m;
    });
}

/** A readable plain-text version of an HTML email: paragraphs, line breaks, list bullets and link targets kept. */
export function htmlToText(html: string): string {
    const text = html
        .replace(/<!--[\s\S]*?-->/g, "")
        .replace(/<(head|style|script|title)\b[\s\S]*?<\/\1>/gi, "")
        // Line breaks in the source mean nothing in HTML; only tags make lines.
        .replace(/\s+/g, " ")
        .replace(/<a\b[^>]*?href\s*=\s*["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi, (_m, href: string, inner: string) => {
            const label = inner.replace(/<[^>]+>/g, "").trim();
            const target = href.replace(/^mailto:/i, "");
            if (!label) return target;
            return label === target || /^(#|javascript:)/i.test(href) ? label : `${label} (${target})`;
        })
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<li\b[^>]*>/gi, "\n• ")
        .replace(/<hr\b[^>]*>/gi, "\n----------\n")
        .replace(/<\/(p|div|h[1-6]|table|ul|ol|blockquote|section|header|footer)>/gi, "\n\n")
        .replace(/<\/tr>/gi, "\n")
        .replace(/<\/t[dh]>/gi, "  ")
        .replace(/<[^>]+>/g, "");
    return decodeEntities(text)
        .split("\n")
        .map((l) => l.replace(/[ \t\u00a0]+/g, " ").trim())
        .join("\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

function randomBoundary(): string {
    const bytes = new Uint8Array(12);
    crypto.getRandomValues(bytes);
    return `venture_${[...bytes].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

/** The complete RFC 5322 message, CRLF line endings. */
export function buildMessage(input: MessageInput): string {
    const boundary = input.boundary ?? randomBoundary();
    const text = input.text ?? htmlToText(input.html);
    const part = (type: string, body: string) => [
        `--${boundary}`,
        `Content-Type: ${type}; charset="UTF-8"`,
        "Content-Transfer-Encoding: base64",
        "",
        wrap(base64Utf8(body)),
    ].join("\r\n");

    return [
        `From: ${formatAddress(input.from)}`,
        `To: ${formatAddress(input.to)}`,
        `Subject: ${encodeHeader(input.subject)}`,
        `Date: ${(input.date ?? new Date()).toUTCString().replace("GMT", "+0000")}`,
        "MIME-Version: 1.0",
        `Content-Type: multipart/alternative; boundary="${boundary}"`,
        "",
        part("text/plain", text),
        part("text/html", input.html),
        `--${boundary}--`,
        "",
    ].join("\r\n");
}
