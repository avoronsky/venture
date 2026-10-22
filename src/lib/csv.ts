// Minimal RFC 4180 CSV writer for the pipeline export. No imports so it can be unit-tested with plain Node.

export function toCSV(header: string[], rows: unknown[][]): string {
    const q = (v: unknown) => {
        const s = v == null ? "" : String(v);
        return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    return [header.map(q).join(","), ...rows.map((r) => r.map(q).join(","))].join("\n");
}
