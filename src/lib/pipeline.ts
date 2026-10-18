// Pure pipeline logic: stages, money parsing/formatting, metrics, dates.
// No imports from the app so it can be unit-tested with plain Node.

export const STAGES = [
    {id: "target", name: "Target", weight: 0.02},
    {id: "contacted", name: "Contacted", weight: 0.05},
    {id: "meeting", name: "First meeting", weight: 0.1},
    {id: "diligence", name: "Diligence", weight: 0.25},
    {id: "ic", name: "Partner / IC", weight: 0.45},
    {id: "termsheet", name: "Term sheet", weight: 0.75},
    {id: "committed", name: "Committed", weight: 0.95},
    {id: "closed", name: "Closed", weight: 1},
    {id: "passed", name: "Passed", weight: 0},
] as const;

export type StageId = (typeof STAGES)[number]["id"];
export const STAGE_IDS = STAGES.map((s) => s.id) as [StageId, ...StageId[]];
export const STAGE_BY_ID: Record<StageId, (typeof STAGES)[number]> =
    Object.fromEntries(STAGES.map((s) => [s.id, s])) as Record<StageId, (typeof STAGES)[number]>;

export const INVESTOR_TYPES = ["VC", "Defense VC", "CVC / Strategic", "Angel", "Family office", "Gov / Grant", "Accelerator"];

export const MANDATES = {
    yes: "Defense OK",
    open: "Case by case",
    no: "Excluded",
    unknown: "Unverified",
} as const;
export type Mandate = keyof typeof MANDATES;

export const PRIORITIES = {
    A: "A · must win",
    B: "B · strong fit",
    C: "C · long shot",
} as const;
export type Priority = keyof typeof PRIORITIES;

/** Minimal shape the metrics need; the full row type lives in types.ts. */
export interface PipelineRow {
    stage: StageId;
    amount: number | null;
    next_date: string | null;
}

export function num(v: unknown): number {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
}

/** "$1.5M", "$250K", "$0". */
export function formatMoney(value: unknown): string {
    const n = num(value);
    if (!n) return "$0";
    const a = Math.abs(n);
    if (a >= 1e6) return "$" + (n / 1e6).toFixed(a >= 1e7 ? 1 : 2).replace(/\.?0+$/, "") + "M";
    if (a >= 1e3) return "$" + Math.round(n / 1e3) + "K";
    return "$" + n;
}

/** Accepts "1.5M", "250k", "$2,000,000", "€300K". Returns 0 for blank or invalid. */
export function parseMoney(value: unknown): number {
    if (value == null || value === "") return 0;
    let s = String(value).trim().toLowerCase().replace(/[$,\s€]/g, "");
    let m = 1;
    if (s.endsWith("m")) {
        m = 1e6;
        s = s.slice(0, -1);
    } else if (s.endsWith("k")) {
        m = 1e3;
        s = s.slice(0, -1);
    }
    const n = parseFloat(s);
    return Number.isFinite(n) && n > 0 ? Math.round(n * m) : 0;
}

export function checkRange(min: unknown, max: unknown): string {
    const a = num(min), b = num(max);
    if (a && b) return `${formatMoney(a)}–${formatMoney(b)}`;
    if (a) return `${formatMoney(a)}+`;
    if (b) return `≤${formatMoney(b)}`;
    return "";
}

export function todayISO(now = new Date()): string {
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/** Whole days from today to an ISO date (negative = overdue). */
export function daysUntil(iso: string | null | undefined, now = new Date()): number | null {
    if (!iso) return null;
    const a = new Date(iso + "T00:00:00").getTime();
    const b = new Date(todayISO(now) + "T00:00:00").getTime();
    return Math.round((a - b) / 864e5);
}

export interface RaiseMetrics {
    committed: number;
    termSheets: number;
    earlyWeighted: number;
    weighted: number;
    target: number;
    remaining: number;
}

export function raiseMetrics(rows: PipelineRow[], target: number): RaiseMetrics {
    const live = rows.filter((r) => r.stage !== "passed");
    const sum = (pred: (r: PipelineRow) => boolean) => live.filter(pred).reduce((a, r) => a + num(r.amount), 0);
    const weightOf = (r: PipelineRow) => num(r.amount) * STAGE_BY_ID[r.stage].weight;
    const committed = sum((r) => r.stage === "committed" || r.stage === "closed");
    const termSheets = sum((r) => r.stage === "termsheet");
    const earlyWeighted = live
        .filter((r) => !["committed", "closed", "termsheet"].includes(r.stage))
        .reduce((a, r) => a + weightOf(r), 0);
    const weighted = live.reduce((a, r) => a + weightOf(r), 0);
    return {committed, termSheets, earlyWeighted, weighted, target, remaining: target ? Math.max(0, target - committed) : 0};
}

/** Map free-text stage labels from spreadsheets onto stage ids. */
export function mapStage(value: unknown): StageId {
    const v = String(value ?? "").toLowerCase().trim();
    const exact = STAGES.find((s) => s.id === v || s.name.toLowerCase() === v);
    if (exact) return exact.id;
    if (/pass|declin/.test(v)) return "passed";
    if (/term/.test(v)) return "termsheet";
    if (/commit/.test(v)) return "committed";
    if (/close|wired|signed/.test(v)) return "closed";
    if (/\bic\b|partner/.test(v)) return "ic";
    if (/dilig|\bdd\b/.test(v)) return "diligence";
    if (/meet|call/.test(v)) return "meeting";
    if (/contact|reach|email/.test(v)) return "contacted";
    return "target";
}

export function mapMandate(value: unknown): Mandate {
    const v = String(value ?? "").toLowerCase().trim();
    if (v in MANDATES) return v as Mandate;
    if (/yes|ok|allow/.test(v)) return "yes";
    if (/no|excl/.test(v)) return "no";
    if (/case|open|maybe/.test(v)) return "open";
    return "unknown";
}

export function normalizeDate(value: unknown): string | null {
    const v = String(value ?? "").trim();
    if (!v) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : todayISO(d);
}
