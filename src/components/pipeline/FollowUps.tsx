import {format} from "date-fns";
import {cn} from "@/lib/utils";
import {daysUntil} from "@/lib/pipeline";
import type {Investor} from "@/lib/types";

interface FollowUpsProps {
    investors: Investor[];
    onOpen: (id: string) => void;
}

function when(d: number, iso: string) {
    if (d < 0) return `${-d}d late`;
    if (d === 0) return "Today";
    if (d === 1) return "Tomorrow";
    return format(new Date(iso + "T00:00:00"), "EEE d");
}

/** Next steps that are overdue or due within 7 days, most urgent first. */
export function FollowUps({investors, onOpen}: FollowUpsProps) {
    const due = investors
        .filter((r) => r.next_date && r.stage !== "passed" && r.stage !== "closed")
        .map((r) => ({r, d: daysUntil(r.next_date)!}))
        .filter((x) => x.d <= 7)
        .sort((a, b) => a.d - b.d);
    const overdue = due.filter((x) => x.d < 0).length;

    return (
        <section aria-labelledby="followups-title" className="flex min-w-0 flex-col rounded-xl border bg-card">
            <div className="flex items-baseline justify-between gap-2 border-b px-4 py-3">
                <h2 id="followups-title" className="text-[15px] font-semibold">Follow-ups</h2>
                <span className="text-xs text-muted-foreground">
                    {due.length === 0 ? "Next 7 days" : overdue ? <><span className="font-medium text-destructive">{overdue} late</span>, {due.length - overdue} upcoming</> : `${due.length} this week`}
                </span>
            </div>
            {due.length === 0 ? (
                <p className="px-4 py-5 text-sm text-muted-foreground">
                    Nothing due this week. Give an investor a next step and a due date and it shows up here.
                </p>
            ) : (
                <ul className="max-h-[300px] overflow-auto py-1">
                    {due.map(({r, d}) => (
                        <li key={r.id}>
                            <button type="button" onClick={() => onOpen(r.id)}
                                    className="grid w-full grid-cols-[72px_minmax(0,1fr)] items-baseline gap-3 px-4 py-2 text-left transition-colors hover:bg-sunken focus-visible:bg-sunken focus-visible:outline-none">
                                <span className={cn("tabular text-[13px]", d < 0 ? "font-semibold text-destructive" : d === 0 ? "font-semibold text-warning" : "text-muted-foreground")}>
                                    {when(d, r.next_date!)}
                                </span>
                                <span className="min-w-0">
                                    <span className="block truncate font-medium">{r.name}</span>
                                    <span className="block truncate text-[13px] text-muted-foreground">{r.next_step || "Follow up"}</span>
                                </span>
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}
