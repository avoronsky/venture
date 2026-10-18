import {format} from "date-fns";
import {cn} from "@/lib/utils";
import {daysUntil, type Mandate, MANDATES, type Priority, STAGE_BY_ID, type StageId} from "@/lib/pipeline";

const chip = "inline-flex items-center rounded-sm px-1.5 py-px font-display text-[11px] font-semibold tracking-wide whitespace-nowrap";

export function PriorityChip({priority}: {priority: Priority}) {
    return (
        <span className={cn(chip,
            priority === "A" && "bg-primary text-primary-foreground",
            priority === "B" && "bg-primary-soft text-primary",
            priority === "C" && "bg-sunken text-muted-foreground")}>
            {priority}
        </span>
    );
}

const mandateDot: Record<Mandate, string> = {
    yes: "bg-success",
    open: "bg-warning",
    no: "bg-destructive",
    unknown: "bg-border",
};

export function MandateTag({mandate}: {mandate: Mandate}) {
    return (
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground" title="Defense mandate">
            <span className={cn("h-2 w-2 rounded-full", mandateDot[mandate])}/>
            {MANDATES[mandate]}
        </span>
    );
}

export function StagePill({stage}: {stage: StageId}) {
    return (
        <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs whitespace-nowrap",
            stage === "committed" || stage === "closed" ? "bg-success-soft text-success"
                : stage === "passed" ? "bg-destructive-soft text-destructive"
                    : "bg-primary-soft text-primary")}>
            {STAGE_BY_ID[stage].name}
        </span>
    );
}

/** "Overdue 3d" / "Next Oct 21"; nothing for closed or passed deals. */
export function NextChip({date, stage}: {date: string | null; stage: StageId}) {
    if (!date || stage === "closed" || stage === "passed") return null;
    const d = daysUntil(date)!;
    return (
        <span className={cn(chip, "font-mono font-medium tracking-normal",
            d < 0 ? "bg-destructive-soft text-destructive" : d <= 2 ? "bg-warning-soft text-warning" : "bg-sunken text-muted-foreground")}>
            {d < 0 ? `Overdue ${-d}d` : `Next ${format(new Date(date + "T00:00:00"), "MMM d")}`}
        </span>
    );
}
