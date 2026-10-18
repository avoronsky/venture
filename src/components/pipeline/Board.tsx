import {type DragEvent, useState} from "react";
import {cn} from "@/lib/utils";
import {checkRange, formatMoney, STAGES, type StageId} from "@/lib/pipeline";
import type {Investor} from "@/lib/types";
import {MandateTag, NextChip, PriorityChip} from "./badges";

interface BoardProps {
    investors: Investor[];
    showPassed: boolean;
    canEdit: boolean;
    onOpen: (id: string) => void;
    onMove: (id: string, stage: StageId) => void;
}

const priorityRank = {A: 0, B: 1, C: 2};

export function Board({investors, showPassed, canEdit, onOpen, onMove}: BoardProps) {
    const [over, setOver] = useState<StageId | null>(null);
    const [dragging, setDragging] = useState<string | null>(null);
    const stages = STAGES.filter((s) => s.id !== "passed" || showPassed);

    const onDrop = (e: DragEvent, stage: StageId) => {
        e.preventDefault();
        setOver(null);
        const id = e.dataTransfer.getData("text/plain");
        const inv = investors.find((i) => i.id === id);
        if (inv && inv.stage !== stage) onMove(id, stage);
    };

    return (
        <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
            <div className="grid min-w-min auto-cols-[minmax(232px,1fr)] grid-flow-col gap-2.5">
                {stages.map((s) => {
                    const items = investors
                        .filter((i) => i.stage === s.id)
                        .sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority] || b.amount - a.amount);
                    const total = items.reduce((a, i) => a + i.amount, 0);
                    return (
                        <section key={s.id} aria-label={s.name}
                                 onDragOver={(e) => {
                                     if (!canEdit) return;
                                     e.preventDefault();
                                     setOver(s.id);
                                 }}
                                 onDragLeave={(e) => {
                                     if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(null);
                                 }}
                                 onDrop={(e) => onDrop(e, s.id)}
                                 className={cn("flex min-h-44 min-w-0 flex-col gap-2 rounded-lg bg-sunken p-2 transition-colors",
                                     over === s.id && "outline-2 -outline-offset-2 outline-dashed outline-primary")}>
                            <div className={cn("flex items-baseline justify-between border-b-2 px-1 pb-1",
                                s.id === "committed" || s.id === "closed" ? "border-success"
                                    : s.id === "termsheet" ? "border-termsheet"
                                        : s.id === "passed" ? "border-destructive" : "border-border")}>
                                <h2 className="text-[13px] font-semibold uppercase tracking-wide">{s.name}</h2>
                                <span className="tabular text-xs text-muted-foreground">{items.length}{total ? ` · ${formatMoney(total)}` : ""}</span>
                            </div>
                            {items.length === 0 ? (
                                <div className="rounded-md border border-dashed px-2 py-4 text-center text-xs text-muted-foreground">
                                    {canEdit ? "Drop an investor here" : "None"}
                                </div>
                            ) : items.map((inv) => (
                                <button key={inv.id} type="button" draggable={canEdit}
                                        onDragStart={(e) => {
                                            e.dataTransfer.setData("text/plain", inv.id);
                                            e.dataTransfer.effectAllowed = "move";
                                            setDragging(inv.id);
                                        }}
                                        onDragEnd={() => setDragging(null)}
                                        onClick={() => onOpen(inv.id)}
                                        className={cn("flex w-full flex-col gap-1.5 rounded-md border bg-card p-2.5 text-left transition-colors hover:border-muted-foreground focus-visible:outline-2 focus-visible:outline-ring",
                                            canEdit && "cursor-grab active:cursor-grabbing",
                                            dragging === inv.id && "opacity-40")}>
                                    <span className="flex items-start justify-between gap-2">
                                        <span className="min-w-0 font-semibold leading-snug [overflow-wrap:anywhere]">{inv.name}</span>
                                        <PriorityChip priority={inv.priority}/>
                                    </span>
                                    {(inv.partner || inv.type) && (
                                        <span className="truncate text-[12.5px] text-muted-foreground">{[inv.partner, inv.type].filter(Boolean).join(" · ")}</span>
                                    )}
                                    <span className="flex flex-wrap items-center justify-between gap-1.5">
                                        <span className="tabular text-sm">
                                            {inv.amount ? formatMoney(inv.amount) : checkRange(inv.check_min, inv.check_max) || <span className="font-sans text-xs text-muted-foreground">No amount</span>}
                                        </span>
                                        <MandateTag mandate={inv.mandate}/>
                                    </span>
                                    <NextChip date={inv.next_date} stage={inv.stage}/>
                                </button>
                            ))}
                        </section>
                    );
                })}
            </div>
        </div>
    );
}
