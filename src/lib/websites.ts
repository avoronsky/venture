// Website helpers for the investor database. No app imports so they can be unit-tested with plain Node.

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
