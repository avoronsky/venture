// Minimal RFC 4180 CSV reader/writer. No imports so it can be unit-tested with plain Node.

export function parseCSV(text: string): string[][] {
    const out: string[][] = [];
    let row: string[] = [];
    let field = "";
    let quoted = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (quoted) {
            if (c === '"') {
                if (text[i + 1] === '"') {
                    field += '"';
                    i++;
                } else quoted = false;
            } else field += c;
        } else if (c === '"') quoted = true;
        else if (c === ",") {
            row.push(field);
            field = "";
        } else if (c === "\n" || c === "\r") {
            if (c === "\r" && text[i + 1] === "\n") i++;
            row.push(field);
            out.push(row);
            row = [];
            field = "";
        } else field += c;
    }
    if (field || row.length) {
        row.push(field);
        out.push(row);
    }
    return out.filter((r) => r.some((x) => x.trim()));
}

export function toCSV(header: string[], rows: unknown[][]): string {
    const q = (v: unknown) => {
        const s = v == null ? "" : String(v);
        return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    return [header.map(q).join(","), ...rows.map((r) => r.map(q).join(","))].join("\n");
}
