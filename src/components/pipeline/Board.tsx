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
const isWon = (s: StageId) => s === "committed" || s === "closed";

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
        <div className="-mx-4 overflow-x-auto px-4 pb-3 sm:-mx-8 sm:px-8">
            <div className="grid min-w-min auto-cols-[minmax(248px,1fr)] grid-flow-col gap-4">
                {stages.map((s) => {
                    const items = investors
                        .filter((i) => i.stage === s.id)
                        .sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority] || b.amount - a.amount);
                    const total = items.reduce((a, i) => a + i.amount, 0);
                    const isOver = over === s.id;
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
                                 className={cn("flex min-h-56 min-w-0 flex-col gap-2 rounded-xl p-1.5 transition-colors", isOver && "bg-sunken")}>
                            <div className="flex items-baseline justify-between gap-2 px-1.5 pb-1.5">
                                <h2 className="flex items-center gap-2 text-[13.5px] font-semibold">
                                    {isWon(s.id) && <span className="h-2 w-2 rounded-full bg-highlight ring-1 ring-foreground/20"/>}
                                    {s.name}
                                    <span className="tabular font-normal text-muted-foreground">{items.length}</span>
                                </h2>
                                {total > 0 && <span className="tabular text-xs text-muted-foreground">{formatMoney(total)}</span>}
                            </div>

                            {items.length === 0 ? (
                                <div className={cn("grid flex-1 place-items-center rounded-lg border border-dashed px-3 py-6 text-center text-xs text-muted-foreground",
                                    isOver && "border-foreground/40 text-foreground")}>
                                    {canEdit ? "Drag an investor here" : "No investors"}
                                </div>
                            ) : items.map((inv) => {
                                const amount = inv.amount ? formatMoney(inv.amount) : checkRange(inv.check_min, inv.check_max);
                                return (
                                    <button key={inv.id} type="button" draggable={canEdit}
                                            onDragStart={(e) => {
                                                e.dataTransfer.setData("text/plain", inv.id);
                                                e.dataTransfer.effectAllowed = "move";
                                                setDragging(inv.id);
                                            }}
                                            onDragEnd={() => setDragging(null)}
                                            onClick={() => onOpen(inv.id)}
                                            className={cn("group flex w-full flex-col gap-2 rounded-lg border bg-card p-3 text-left transition-[border-color,box-shadow] hover:border-foreground/25 hover:shadow-[0_2px_10px_-4px_rgb(0_0_0/0.12)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                                                canEdit && "cursor-grab active:cursor-grabbing",
                                                dragging === inv.id && "opacity-40")}>
                                        <span className="flex items-start gap-2.5">
                                            <PriorityChip priority={inv.priority}/>
                                            <span className="min-w-0 flex-1">
                                                <span className="block font-semibold leading-snug [overflow-wrap:anywhere]">{inv.name}</span>
                                                {(inv.partner || inv.type) && (
                                                    <span className="block truncate text-[12.5px] text-muted-foreground">{inv.partner || inv.type}</span>
                                                )}
                                            </span>
                                        </span>
                                        <span className="flex items-center justify-between gap-2">
                                            {amount ? (
                                                <span className={cn("text-[13px] font-semibold", isWon(inv.stage) && "rounded-[4px] bg-highlight px-1 text-highlight-foreground")}>
                                                    {amount}
                                                </span>
                                            ) : <span className="text-xs text-muted-foreground">No amount yet</span>}
                                            <MandateTag mandate={inv.mandate}/>
                                        </span>
                                        <NextChip date={inv.next_date} stage={inv.stage}/>
                                    </button>
                                );
                            })}
                        </section>
                    );
                })}
            </div>
        </div>
    );
}
