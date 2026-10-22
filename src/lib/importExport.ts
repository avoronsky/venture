import {toCSV} from "./csv";
import {STAGE_BY_ID, todayISO} from "./pipeline";
import type {Investor} from "./types";

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
