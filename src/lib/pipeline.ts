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

/** Currencies an organization can raise in (ISO 4217). The first is the default. */
export const CURRENCIES = [
    {code: "USD", name: "US dollar"},
    {code: "EUR", name: "Euro"},
    {code: "GBP", name: "British pound"},
    {code: "CHF", name: "Swiss franc"},
    {code: "UAH", name: "Ukrainian hryvnia"},
    {code: "PLN", name: "Polish złoty"},
    {code: "CZK", name: "Czech koruna"},
    {code: "SEK", name: "Swedish krona"},
    {code: "NOK", name: "Norwegian krone"},
    {code: "DKK", name: "Danish krone"},
    {code: "CAD", name: "Canadian dollar"},
    {code: "AUD", name: "Australian dollar"},
    {code: "ILS", name: "Israeli shekel"},
    {code: "SGD", name: "Singapore dollar"},
    {code: "JPY", name: "Japanese yen"},
] as const;
export const DEFAULT_CURRENCY = "USD";

/** "$", "€", "₴"; codes without a short symbol come back as "CHF ". Empty currency = no symbol. */
export function currencySymbol(currency: string = DEFAULT_CURRENCY): string {
    if (!currency) return "";
    let sym = currency;
    try {
        sym = new Intl.NumberFormat("en-US", {style: "currency", currency, currencyDisplay: "narrowSymbol"})
            .formatToParts(0).find((p) => p.type === "currency")?.value ?? currency;
    } catch { /* unknown code: show it as is */
    }
    return /^[A-Za-z]{2,}$/.test(sym) ? sym + "\u00a0" : sym;
}

/** "$1.5M", "€250K", "$0". Pass "" for a bare number ("1.5M"). */
export function formatMoney(value: unknown, currency: string = DEFAULT_CURRENCY): string {
    const sym = currencySymbol(currency);
    const n = num(value);
    if (!n) return sym + "0";
    const a = Math.abs(n);
    if (a >= 1e6) return sym + (n / 1e6).toFixed(a >= 1e7 ? 1 : 2).replace(/\.?0+$/, "") + "M";
    if (a >= 1e3) return sym + Math.round(n / 1e3) + "K";
    return sym + n;
}

/** Accepts "1.5M", "250k", "$2,000,000", "€300K", "CHF 1M". Returns 0 for blank or invalid. */
export function parseMoney(value: unknown): number {
    if (value == null || value === "") return 0;
    let s = String(value).trim().toLowerCase().replace(/[^0-9.km-]/g, "");
    let m = 1;
    if (s.endsWith("m")) {
        m = 1e6;
        s = s.slice(0, -1);
    } else if (s.endsWith("k")) {
        m = 1e3;
        s = s.slice(0, -1);
    }
    const n = Number(s);
    return s !== "" && Number.isFinite(n) && n > 0 ? Math.round(n * m) : 0;
}

export function checkRange(min: unknown, max: unknown, currency: string = DEFAULT_CURRENCY): string {
    const a = num(min), b = num(max);
    if (a && b) return `${formatMoney(a, currency)}–${formatMoney(b, currency)}`;
    if (a) return `${formatMoney(a, currency)}+`;
    if (b) return `≤${formatMoney(b, currency)}`;
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
