import {parseCSV, toCSV} from "./csv";
import {INVESTOR_TYPES, mapMandate, mapStage, normalizeDate, parseMoney, STAGE_BY_ID, todayISO} from "./pipeline";
import type {Investor, InvestorInput} from "./types";

const HEADERS: Record<string, string[]> = {
    name: ["name", "fund", "investor", "firm", "fund name"],
    partner: ["partner", "contact", "person"],
    email: ["email", "e-mail"],
    type: ["type", "investor type"],
    stage: ["stage", "status"],
    priority: ["priority", "pri", "tier"],
    mandate: ["mandate", "defense mandate", "defense"],
    check_min: ["check min", "min check", "check_min"],
    check_max: ["check max", "max check", "check_max"],
    amount: ["amount", "expected", "committed", "ask"],
    can_lead: ["can lead", "lead", "can_lead"],
    via: ["via", "intro", "intro via", "source", "referral"],
    geo: ["geo", "geography", "location", "country"],
    next_step: ["next step", "next action", "next", "next_step"],
    next_date: ["next date", "due", "follow up", "follow-up date", "next_date"],
    last_contact: ["last contact", "last touch", "last touched", "last_contact"],
    notes: ["notes", "comments"],
};

export type ImportResult = {ok: true; rows: InvestorInput[]} | {ok: false; error: string};

export function investorsFromCSV(text: string): ImportResult {
    const table = parseCSV(text);
    if (table.length < 2) return {ok: false, error: "That file has no data rows."};
    const head = table[0].map((h) => h.trim().toLowerCase());
    const idx: Record<string, number> = {};
    for (const [key, aliases] of Object.entries(HEADERS)) {
        const i = head.findIndex((h) => aliases.includes(h));
        if (i >= 0) idx[key] = i;
    }
    if (idx.name == null) return {ok: false, error: "Add a column named Fund or Name, then import again."};

    const rows: InvestorInput[] = [];
    for (const line of table.slice(1)) {
        const g = (k: string) => (idx[k] != null ? (line[idx[k]] ?? "").trim() : "");
        if (!g("name")) continue;
        const pr = g("priority").toUpperCase();
        rows.push({
            name: g("name"),
            partner: g("partner"),
            email: g("email"),
            type: INVESTOR_TYPES.find((t) => t.toLowerCase() === g("type").toLowerCase()) || g("type") || "VC",
            stage: mapStage(g("stage")),
            priority: pr === "A" || pr === "B" || pr === "C" ? pr : "B",
            mandate: mapMandate(g("mandate")),
            check_min: parseMoney(g("check_min")),
            check_max: parseMoney(g("check_max")),
            amount: parseMoney(g("amount")),
            can_lead: /^(y|yes|true|1)$/i.test(g("can_lead")),
            via: g("via"),
            geo: g("geo"),
            next_step: g("next_step"),
            next_date: normalizeDate(g("next_date")),
            last_contact: normalizeDate(g("last_contact")),
            notes: g("notes"),
        });
    }
    if (!rows.length) return {ok: false, error: "No rows with a fund name were found."};
    return {ok: true, rows};
}

const EXPORT_COLS: (keyof Investor)[] = ["name", "partner", "email", "type", "stage", "priority", "mandate", "check_min", "check_max", "amount", "can_lead", "via", "geo", "next_step", "next_date", "last_contact", "notes"];

export function downloadInvestorsCSV(investors: Investor[], orgName: string) {
    const csv = toCSV(EXPORT_COLS as string[], investors.map((r) => EXPORT_COLS.map((c) => (c === "stage" ? STAGE_BY_ID[r.stage].name : r[c]))));
    const url = URL.createObjectURL(new Blob([csv], {type: "text/csv;charset=utf-8"}));
    const a = Object.assign(document.createElement("a"), {href: url, download: `${orgName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "pipeline"}-pipeline-${todayISO()}.csv`});
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
