import {useMemo, useState} from "react";
import {format} from "date-fns";
import {ArrowDown, ArrowUp} from "lucide-react";
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from "@/components/ui/table";
import {cn} from "@/lib/utils";
import {checkRange, formatMoney, STAGES} from "@/lib/pipeline";
import type {Investor} from "@/lib/types";
import {MandateTag, NextChip, PriorityChip, StagePill} from "./badges";

type SortKey = "name" | "stage" | "priority" | "type" | "amount" | "check" | "mandate" | "via" | "next_date" | "last_contact";

const COLUMNS: {key: SortKey; label: string; numeric?: boolean}[] = [
    {key: "name", label: "Investor"},
    {key: "stage", label: "Stage"},
    {key: "priority", label: "Pri"},
    {key: "type", label: "Type"},
    {key: "amount", label: "Expected", numeric: true},
    {key: "check", label: "Check range", numeric: true},
    {key: "mandate", label: "Defense mandate"},
    {key: "via", label: "Intro via"},
    {key: "next_date", label: "Next step"},
    {key: "last_contact", label: "Last touch"},
];

function sortValue(r: Investor, k: SortKey): string | number {
    if (k === "stage") return STAGES.findIndex((s) => s.id === r.stage);
    if (k === "amount") return r.amount;
    if (k === "check") return r.check_max || r.check_min;
    return String(r[k] ?? "").toLowerCase() || "￿";
}

export function InvestorTable({investors, onOpen}: {investors: Investor[]; onOpen: (id: string) => void}) {
    const [sort, setSort] = useState<{key: SortKey; dir: 1 | -1}>({key: "stage", dir: 1});
    const rows = useMemo(() => [...investors].sort((a, b) => {
        const x = sortValue(a, sort.key), y = sortValue(b, sort.key);
        return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
    }), [investors, sort]);

    return (
        <div className="overflow-x-auto rounded-lg border bg-card">
            <Table className="min-w-[960px]">
                <TableHeader>
                    <TableRow>
                        {COLUMNS.map((c) => (
                            <TableHead key={c.key} className={cn(c.numeric && "text-right")}
                                       aria-sort={sort.key === c.key ? (sort.dir > 0 ? "ascending" : "descending") : "none"}>
                                <button type="button" className="eyebrow inline-flex items-center gap-1 hover:text-foreground"
                                        onClick={() => setSort((s) => ({key: c.key, dir: s.key === c.key ? (-s.dir as 1 | -1) : 1}))}>
                                    {c.label}
                                    {sort.key === c.key && (sort.dir > 0 ? <ArrowUp className="h-3 w-3"/> : <ArrowDown className="h-3 w-3"/>)}
                                </button>
                            </TableHead>
                        ))}
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {rows.map((r) => (
                        <TableRow key={r.id} tabIndex={0} className="cursor-pointer"
                                  onClick={() => onOpen(r.id)}
                                  onKeyDown={(e) => e.key === "Enter" && onOpen(r.id)}>
                            <TableCell className="align-top">
                                <div className="font-semibold">{r.name}</div>
                                {r.partner && <div className="text-xs text-muted-foreground">{r.partner}</div>}
                            </TableCell>
                            <TableCell className="align-top"><StagePill stage={r.stage}/></TableCell>
                            <TableCell className="align-top"><PriorityChip priority={r.priority}/></TableCell>
                            <TableCell className="align-top">{r.type}</TableCell>
                            <TableCell className="tabular align-top text-right whitespace-nowrap">{r.amount ? formatMoney(r.amount) : ""}</TableCell>
                            <TableCell className="tabular align-top text-right whitespace-nowrap">{checkRange(r.check_min, r.check_max)}</TableCell>
                            <TableCell className="align-top"><MandateTag mandate={r.mandate}/></TableCell>
                            <TableCell className="align-top">{r.via}</TableCell>
                            <TableCell className="align-top">
                                <div>{r.next_step}</div>
                                <NextChip date={r.next_date} stage={r.stage}/>
                            </TableCell>
                            <TableCell className="tabular align-top">{r.last_contact ? format(new Date(r.last_contact + "T00:00:00"), "MMM d") : ""}</TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
}
