// Reading recipients pasted as text. No app imports so it can be unit-tested with plain Node.

export interface ParsedRecipient {
    email: string;
    name: string;
    firm: string;
}

/** Same rule as the database: something@something.something, no spaces. */
export function isValidEmail(email: string): boolean {
    return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) && email.length <= 320;
}

export function normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
}

const BARE = /[^\s<>,;"'()[\]]+@[^\s<>,;"'()[\]]+\.[^\s<>,;"'()[\]]+/g;
const ANGLE = /(?:"([^"]*)"|([^<>",;\n]*?))\s*<\s*([^<>\s]+)\s*>/g;

function clean(s: string): string {
    return s.replace(/^[\s,;"'|-]+|[\s,;"'|-]+$/g, "").replace(/\s+/g, " ");
}

/**
 * Accepts what people usually paste: one person per line, or several separated by commas or semicolons.
 *   ann@fund.vc
 *   Ann Lee <ann@fund.vc>, "Bob Smith" <bob@angel.com>
 *   Ann Lee, Fund Capital, ann@fund.vc      (a row copied from a spreadsheet; tabs work too)
 * On a line with exactly one email and no <...>, the text around it is read as name, then firm.
 * Emails are lower-cased; repeats keep the first. Lines with no email come back in `skipped`.
 */
export function parseRecipients(text: string): {recipients: ParsedRecipient[]; skipped: string[]} {
    const recipients: ParsedRecipient[] = [];
    const skipped: string[] = [];
    const seen = new Set<string>();
    const add = (email: string, name = "", firm = "") => {
        const e = normalizeEmail(email);
        if (!isValidEmail(e) || seen.has(e)) return;
        seen.add(e);
        recipients.push({email: e, name: clean(name).slice(0, 200), firm: clean(firm).slice(0, 200)});
    };

    for (const raw of text.split(/\r?\n/)) {
        const line = raw.trim();
        if (!line) continue;
        let found = 0;

        if (line.includes("<")) {
            const rest = line.replace(ANGLE, (_m, quoted: string | undefined, plain: string | undefined, email: string) => {
                if (isValidEmail(email)) {
                    add(email, quoted ?? plain ?? "");
                    found++;
                }
                return " ";
            });
            for (const email of rest.match(BARE) ?? []) {
                add(email);
                found++;
            }
        } else {
            const emails = line.match(BARE) ?? [];
            if (emails.length === 1) {
                const parts = line.replace(emails[0], "\t").split(/[\t,;|]/).map(clean).filter(Boolean);
                add(emails[0], parts[0] ?? "", parts[1] ?? "");
            } else {
                for (const email of emails) add(email);
            }
            found = emails.length;
        }
        if (!found) skipped.push(line);
    }
    return {recipients, skipped};
}
