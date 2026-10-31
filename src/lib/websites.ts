// Website and LinkedIn link helpers. No app imports so they can be unit-tested with plain Node.

/** A link that works whether the user typed "fund.vc", "www.fund.vc" or "https://fund.vc/". Null for blank or unusable input. */
export function websiteHref(raw: string): string | null {
    const value = raw.trim();
    if (!value) return null;
    const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    try {
        const url = new URL(withScheme);
        if (!url.hostname.includes(".")) return null;
        return url.toString();
    } catch {
        return null;
    }
}

/** Short form for display: "fund.vc" or "fund.vc/team". */
export function websiteLabel(raw: string): string {
    return raw.trim().replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/$/, "");
}

/**
 * A LinkedIn profile or company page. Accepts "linkedin.com/in/ana", "https://www.linkedin.com/company/fund/"
 * or a bare handle like "ana-ruiz" (taken as a personal profile). Null for blank input or other sites.
 */
export function linkedinHref(raw: string): string | null {
    const value = raw.trim().replace(/^@/, "");
    if (!value) return null;
    if (/^[a-z0-9][a-z0-9-]{1,99}$/i.test(value)) return `https://www.linkedin.com/in/${value}`;
    const href = websiteHref(value);
    if (!href) return null;
    const host = new URL(href).hostname.toLowerCase();
    return host === "linkedin.com" || host.endsWith(".linkedin.com") ? href : null;
}

/** Short form for display: "in/ana-ruiz" or "company/fund". */
export function linkedinLabel(raw: string): string {
    const href = linkedinHref(raw);
    if (!href) return raw.trim();
    const path = new URL(href).pathname.replace(/^\/|\/$/g, "");
    return path || "LinkedIn";
}
