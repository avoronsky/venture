import {format} from "date-fns";
import {MessageSquare} from "lucide-react";
import {shortDate} from "@/lib/comments";
import type {CommentStats} from "@/lib/types";
import {cn} from "@/lib/utils";
import {daysUntil, type Mandate, MANDATES, type Priority, STAGE_BY_ID, type StageId} from "@/lib/pipeline";

const PRIORITY_TITLE: Record<Priority, string> = {A: "Priority A, must win", B: "Priority B, strong fit", C: "Priority C, long shot"};

/** A, B, C as a small square: solid ink for must-win, outlined for the rest. */
export function PriorityChip({priority}: {priority: Priority}) {
    return (
        <span title={PRIORITY_TITLE[priority]}
              className={cn("inline-grid h-5 w-5 shrink-0 place-items-center rounded-[5px] text-[11px] font-bold",
                  priority === "A" && "bg-foreground text-background",
                  priority === "B" && "border border-foreground/50 text-foreground",
                  priority === "C" && "border border-dashed border-muted-foreground/60 text-muted-foreground")}>
            {priority}
        </span>
    );
}

const mandateDot: Record<Mandate, string> = {
    yes: "bg-success",
    open: "bg-warning",
    no: "bg-destructive",
    unknown: "border border-muted-foreground/60",
};

export function MandateTag({mandate, compact = false}: {mandate: Mandate; compact?: boolean}) {
    return (
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground" title={`Defense mandate: ${MANDATES[mandate]}`}>
            <span className={cn("h-1.5 w-1.5 rounded-full", mandateDot[mandate])}/>
            {compact ? null : MANDATES[mandate]}
        </span>
    );
}

export function StagePill({stage}: {stage: StageId}) {
    return (
        <span className={cn("inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium",
            stage === "committed" || stage === "closed" ? "bg-highlight text-highlight-foreground"
                : stage === "termsheet" ? "bg-highlight-soft text-foreground"
                    : stage === "passed" ? "bg-destructive-soft text-destructive"
                        : "bg-sunken text-muted-foreground")}>
            {STAGE_BY_ID[stage].name}
        </span>
    );
}

/** Next follow-up date; red when overdue, amber within two days. Nothing for closed or passed deals. */
export function NextChip({date, stage}: {date: string | null; stage: StageId}) {
    if (!date || stage === "closed" || stage === "passed") return null;
    const d = daysUntil(date)!;
    const label = d < 0 ? `${-d}d overdue` : d === 0 ? "Due today" : d === 1 ? "Due tomorrow" : `Due ${format(new Date(date + "T00:00:00"), "MMM d")}`;
    return (
        <span className={cn("tabular inline-flex items-center gap-1 whitespace-nowrap text-xs",
            d < 0 ? "font-medium text-destructive" : d <= 2 ? "font-medium text-warning" : "text-muted-foreground")}>
            {label}
        </span>
    );
}

/** Comment count and the date of the latest comment, e.g. "3, latest Oct 18". */
export function CommentCount({stats}: {stats: CommentStats | undefined}) {
    if (!stats || stats.comment_count === 0) return null;
    return (
        <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs text-muted-foreground"
              title={`${stats.comment_count} comment${stats.comment_count === 1 ? "" : "s"}`}>
            <MessageSquare className="h-3.5 w-3.5"/>
            <span><span className="tabular">{stats.comment_count}</span>{stats.last_comment_on && `, latest ${shortDate(stats.last_comment_on)}`}</span>
        </span>
    );
}
