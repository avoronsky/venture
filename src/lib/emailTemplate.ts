// Personalization for investor update emails. No app imports so it can be unit-tested with plain Node.
//
// A placeholder is {{key}} or {{key|fallback}}: "Hi {{first_name|there}}," becomes "Hi Ann," or "Hi there,".

/** What a placeholder can refer to, for one recipient. */
export interface RecipientFields {
    email: string;
    name: string;
    firm: string;
}

export const PLACEHOLDERS = [
    {key: "first_name", label: "First name", example: "{{first_name|there}}"},
    {key: "name", label: "Full name", example: "{{name}}"},
    {key: "firm", label: "Firm", example: "{{firm}}"},
    {key: "email", label: "Email", example: "{{email}}"},
] as const;

export type PlaceholderKey = (typeof PLACEHOLDERS)[number]["key"];

const KEYS = new Set<string>(PLACEHOLDERS.map((p) => p.key));
const PATTERN = /\{\{\s*([a-zA-Z_]+)\s*(?:\|([^{}]*))?\}\}/g;

/** The first word of a name, ignoring titles like "Dr." */
export function firstName(name: string): string {
    const words = name.trim().split(/\s+/).filter(Boolean);
    const first = words.find((w) => !/^(mr|mrs|ms|dr|prof)\.?$/i.test(w)) ?? "";
    return first.replace(/[,;]+$/, "");
}

export function placeholderValues(r: RecipientFields): Record<PlaceholderKey, string> {
    return {first_name: firstName(r.name), name: r.name.trim(), firm: r.firm.trim(), email: r.email.trim()};
}

export function escapeHtml(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/**
 * Fills the placeholders for one recipient. With html, recipient values are escaped (the fallback is
 * part of the author's HTML and kept as written). Unknown placeholders are left untouched.
 */
export function renderTemplate(template: string, recipient: RecipientFields, {html = false}: {html?: boolean} = {}): string {
    const values = placeholderValues(recipient);
    return template.replace(PATTERN, (match, rawKey: string, fallback: string | undefined) => {
        const key = rawKey.toLowerCase();
        if (!KEYS.has(key)) return match;
        const value = values[key as PlaceholderKey];
        if (value) return html ? escapeHtml(value) : value;
        return (fallback ?? "").trim();
    });
}

/** Placeholders the template uses that don't exist (typos like {{frist_name}}), each once. */
export function unknownPlaceholders(...templates: string[]): string[] {
    const found = new Set<string>();
    for (const t of templates) {
        for (const m of t.matchAll(PATTERN)) if (!KEYS.has(m[1].toLowerCase())) found.add(m[0]);
    }
    return [...found];
}

/** Recipients a placeholder without a fallback would leave blank, e.g. {{firm}} for an angel. */
export function blankPlaceholders(template: string, recipients: RecipientFields[]): {placeholder: string; count: number}[] {
    const out: {placeholder: string; count: number}[] = [];
    const seen = new Set<string>();
    for (const m of template.matchAll(PATTERN)) {
        const key = m[1].toLowerCase();
        if (!KEYS.has(key) || m[2] !== undefined || seen.has(key)) continue;
        seen.add(key);
        const count = recipients.filter((r) => !placeholderValues(r)[key as PlaceholderKey]).length;
        if (count) out.push({placeholder: m[0], count});
    }
    return out;
}

/** A subject for lists and titles: placeholders become their fallbacks (or nothing), without a dangling comma. */
export function subjectLabel(subject: string): string {
    return renderTemplate(subject, {email: "", name: "", firm: ""}).replace(/^[\s,;:·–—-]+/, "").replace(/\s{2,}/g, " ").trim();
}
