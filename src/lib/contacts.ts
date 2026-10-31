// Contacts on an investor (pipeline and investor database). No app imports so they can be unit-tested with plain Node.

/** One person at an investor. Every field is optional, but a saved contact has a name, email or LinkedIn page. */
export interface Contact {
    name?: string;
    role?: string;
    email?: string;
    linkedin?: string;
}

export const MAX_CONTACTS = 20;
const KEYS = ["name", "role", "email", "linkedin"] as const;

/** Whatever came from the database (or older data) as a list of contacts. */
export function normalizeContacts(raw: unknown): Contact[] {
    if (!Array.isArray(raw)) return [];
    return raw.filter((c): c is Record<string, unknown> => typeof c === "object" && c !== null).map((c) => {
        const out: Contact = {};
        for (const k of KEYS) if (typeof c[k] === "string" && c[k]) out[k] = c[k] as string;
        return out;
    });
}

/** Trimmed, empty fields removed, contacts with no name, email or LinkedIn dropped. What gets saved. */
export function cleanContacts(list: Contact[]): Contact[] {
    return list.map((c) => {
        const out: Contact = {};
        for (const k of KEYS) {
            const v = (c[k] ?? "").trim();
            if (v) out[k] = v;
        }
        return out;
    }).filter((c) => c.name || c.email || c.linkedin).slice(0, MAX_CONTACTS);
}

/** The same person: same email, otherwise same name, otherwise same LinkedIn page (case-insensitive). Matches the database. */
export function contactKey(c: Contact): string | null {
    const email = c.email?.trim().toLowerCase();
    if (email) return email;
    const name = c.name?.trim().toLowerCase();
    if (name) return `name:${name}`;
    const li = c.linkedin?.trim().toLowerCase();
    return li ? `li:${li}` : null;
}

/** base, then the contacts from extra that base doesn't have yet. */
export function mergeContacts(base: Contact[], extra: Contact[]): Contact[] {
    const seen = new Set(base.map(contactKey).filter(Boolean));
    const out = [...base];
    for (const c of extra) {
        const k = contactKey(c);
        if (k && !seen.has(k)) {
            seen.add(k);
            out.push(c);
        }
    }
    return out.slice(0, MAX_CONTACTS);
}

/** "Ana Ruiz", or the email or LinkedIn when there's no name. */
export function contactLabel(c: Contact): string {
    return c.name || c.email || c.linkedin || "";
}

/** "Ana Ruiz" or "Ana Ruiz +2" for cards and table cells. */
export function contactsSummary(list: Contact[]): string {
    if (!list.length) return "";
    return list.length === 1 ? contactLabel(list[0]) : `${contactLabel(list[0])} +${list.length - 1}`;
}

/** Everything searchable about the contacts, as one string. */
export function contactsSearchText(list: Contact[]): string {
    return list.flatMap((c) => KEYS.map((k) => c[k] ?? "")).join(" ");
}

/** "Ana Ruiz (Partner) <ana@fund.vc> linkedin.com/in/ana; Bo Lee <bo@fund.vc>" for CSV export. */
export function contactsToText(list: Contact[]): string {
    return list.map((c) => [
        c.name,
        c.role && `(${c.role})`,
        c.email && `<${c.email}>`,
        c.linkedin,
    ].filter(Boolean).join(" ")).join("; ");
}
