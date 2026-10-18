import {format} from "date-fns";
import {Card, CardContent} from "@/components/ui/card";
import {cn} from "@/lib/utils";
import {daysUntil} from "@/lib/pipeline";
import type {Investor} from "@/lib/types";

interface NextActionsProps {
    investors: Investor[];
    onOpen: (id: string) => void;
}

/** Follow-ups that are overdue or due within 7 days, most urgent first. */
export function NextActions({investors, onOpen}: NextActionsProps) {
    const due = investors
        .filter((r) => r.next_date && r.stage !== "passed" && r.stage !== "closed")
        .map((r) => ({r, d: daysUntil(r.next_date)!}))
        .filter((x) => x.d <= 7)
        .sort((a, b) => a.d - b.d);
    const overdue = due.filter((x) => x.d < 0).length;

    return (
        <Card className="min-w-0 shadow-none">
            <CardContent className="p-5">
                <div className="flex items-center justify-between gap-2">
                    <h2 className="text-base font-semibold">Next actions</h2>
                    {due.length > 0 && <span className="eyebrow">{overdue} overdue · {due.length} this week</span>}
                </div>
                {due.length === 0 ? (
                    <p className="mt-3 text-sm text-muted-foreground">
                        No follow-ups due in the next 7 days. Set a next step and due date on an investor to see it here.
                    </p>
                ) : (
                    <ul className="mt-2 flex max-h-56 flex-col gap-0.5 overflow-auto">
                        {due.map(({r, d}) => (
                            <li key={r.id}>
                                <button type="button" onClick={() => onOpen(r.id)}
                                        className="grid w-full grid-cols-[64px_minmax(0,1fr)] items-start gap-3 rounded-md p-1.5 text-left hover:bg-sunken focus-visible:outline-2 focus-visible:outline-ring">
                                    <span className={cn("tabular rounded-sm px-1.5 py-0.5 text-center text-xs",
                                        d < 0 ? "bg-destructive-soft text-destructive" : d === 0 ? "bg-warning-soft text-warning" : "bg-sunken")}>
                                        {d < 0 ? `${d}d` : d === 0 ? "Today" : format(new Date(r.next_date + "T00:00:00"), "MMM d")}
                                    </span>
                                    <span className="min-w-0">
                                        <span className="block font-semibold">{r.name}</span>
                                        <span className="block truncate text-[13px] text-muted-foreground">{r.next_step || "Follow up"}</span>
                                    </span>
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </CardContent>
        </Card>
    );
}
