// Pure helpers for the investor comment timeline. No app imports so they can be unit-tested with plain Node.
/** Anything that can appear in a dated timeline: comments, and for pipelines, stage history. */
export interface TimelineEntry {
    id: string | number;
    kind: "note" | "stage" | "system";
    body: string;
    occurred_on: string;
    created_at: string;
    edited_at: string | null;
    author_email?: string | null;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function parseISODate(iso: string): Date {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d);
}

function isoOf(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** "Today", "Yesterday", "Tue, Oct 14", or "Oct 14, 2025" for another year. */
export function dayLabel(iso: string, now = new Date()): string {
    const today = isoOf(now);
    const yesterday = isoOf(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
    if (iso === today) return "Today";
    if (iso === yesterday) return "Yesterday";
    const d = parseISODate(iso);
    if (d.getFullYear() === now.getFullYear()) return `${WEEKDAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;
    return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

/** "Oct 14" this year, "Oct 14, 2025" otherwise. */
export function shortDate(iso: string, now = new Date()): string {
    const d = parseISODate(iso);
    const base = `${MONTHS[d.getMonth()]} ${d.getDate()}`;
    return d.getFullYear() === now.getFullYear() ? base : `${base}, ${d.getFullYear()}`;
}

/** "You" for the signed-in user, otherwise the part of the email before the @. */
export function authorLabel(email: string | null | undefined, me: string | null | undefined): string {
    if (!email) return "Someone";
    if (me && email.toLowerCase() === me.toLowerCase()) return "You";
    return email.split("@")[0];
}

export interface TimelineDay<T extends TimelineEntry = TimelineEntry> {
    date: string;
    entries: T[];
}

/**
 * Newest day first. Within a day, newest written first. Comments carry the date the user chose,
 * so a note backdated to last week sorts under last week.
 */
export function groupTimeline<T extends TimelineEntry>(entries: T[], {includeHistory = true} = {}): TimelineDay<T>[] {
    const visible = includeHistory ? entries : entries.filter((e) => e.kind === "note");
    const sorted = [...visible].sort((a, b) =>
        a.occurred_on === b.occurred_on
            ? b.created_at.localeCompare(a.created_at)
            : b.occurred_on.localeCompare(a.occurred_on));
    const days: TimelineDay<T>[] = [];
    for (const entry of sorted) {
        const last = days[days.length - 1];
        if (last && last.date === entry.occurred_on) last.entries.push(entry);
        else days.push({date: entry.occurred_on, entries: [entry]});
    }
    return days;
}

/** True when a comment was written on a different day than the one it's dated to. */
export function writtenOnOtherDay(entry: Pick<TimelineEntry, "occurred_on" | "created_at">): boolean {
    return isoOf(new Date(entry.created_at)) !== entry.occurred_on;
}

export function writtenOn(entry: Pick<TimelineEntry, "created_at">): string {
    return isoOf(new Date(entry.created_at));
}
