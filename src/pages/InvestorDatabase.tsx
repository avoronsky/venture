import {useMemo, useState} from "react";
import {useNavigate, useParams} from "react-router-dom";
import {ArrowDown, ArrowUp, Lock, Plus, RefreshCw, Search} from "lucide-react";
import {useMyCommentStats, useMyInvestors} from "@/hooks/useMyInvestors";
import {AppShell} from "@/components/AppShell";
import {MyInvestorSheet} from "@/components/database/MyInvestorSheet";
import {CommentCount} from "@/components/pipeline/badges";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Skeleton} from "@/components/ui/skeleton";
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "@/components/ui/select";
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from "@/components/ui/table";
import {formatMoney} from "@/lib/pipeline";
import {websiteHref, websiteLabel} from "@/lib/websites";
import type {CommentStats, MyInvestor} from "@/lib/types";

type SortKey = "name" | "type" | "contact" | "min_check" | "comments";

const COLUMNS: {key: SortKey; label: string; numeric?: boolean}[] = [
    {key: "name", label: "Investor"},
    {key: "type", label: "Type"},
    {key: "contact", label: "Contact"},
    {key: "min_check", label: "Min check", numeric: true},
    {key: "comments", label: "Comments"},
];

function sortValue(r: MyInvestor, k: SortKey, stats?: Map<string, CommentStats>): string | number {
    if (k === "min_check") return r.min_check;
    if (k === "comments") return stats?.get(r.id)?.last_comment_on ?? "";
    if (k === "contact") return (r.contact_name || r.contact_email).toLowerCase() || "￿";
    return String(r[k] ?? "").toLowerCase() || "￿";
}

export default function InvestorDatabase() {
    const {investorId} = useParams();
    const navigate = useNavigate();
    const listQ = useMyInvestors();
    const {data: stats} = useMyCommentStats();
    const [query, setQuery] = useState("");
    const [type, setType] = useState("all");
    const [sort, setSort] = useState<{key: SortKey; dir: 1 | -1}>({key: "name", dir: 1});

    const investors = useMemo(() => listQ.data ?? [], [listQ.data]);
    const types = useMemo(() => [...new Set(investors.map((i) => i.type).filter(Boolean))].sort(), [investors]);
    const rows = useMemo(() => {
        const q = query.trim().toLowerCase();
        return investors
            .filter((r) => (type === "all" || r.type === type) &&
                (!q || [r.name, r.contact_name, r.contact_email, r.website].join(" ").toLowerCase().includes(q)))
            .sort((a, b) => {
                const x = sortValue(a, sort.key, stats), y = sortValue(b, sort.key, stats);
                return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
            });
    }, [investors, query, type, sort, stats]);

    const isNew = investorId === "new";
    const selected = investorId && !isNew ? investors.find((i) => i.id === investorId) : undefined;

    return (
        <AppShell
            title="Investor database"
            description={<span className="inline-flex items-center gap-1.5"><Lock className="h-3.5 w-3.5"/>Only you can see this list. Investors you add to a pipeline are saved here too.</span>}
            actions={<Button onClick={() => navigate("/investors/new")}><Plus/>Add investor</Button>}
            wide
        >
            {listQ.isError ? (
                <div className="flex flex-col items-start gap-3 rounded-xl border bg-card p-6">
                    <h2 className="text-lg font-semibold">Your investor database didn't load</h2>
                    <p className="text-muted-foreground">{(listQ.error as Error).message}</p>
                    <Button variant="outline" onClick={() => listQ.refetch()}><RefreshCw/>Try again</Button>
                </div>
            ) : listQ.isPending ? (
                <Skeleton className="h-80 rounded-xl"/>
            ) : investors.length === 0 ? (
                <div className="flex flex-col items-start gap-4 rounded-2xl border bg-card p-6 sm:p-10">
                    <h2 className="text-2xl font-bold tracking-[-0.02em]">Build your list of investors</h2>
                    <p className="max-w-lg text-muted-foreground">
                        Keep every fund, angel and strategic you know in one place: website, who to talk to, their minimum
                        check, and dated notes. When you add an investor to a round, you can pick it from here.
                    </p>
                    <Button onClick={() => navigate("/investors/new")}><Plus/>Add investor</Button>
                </div>
            ) : (
                <section className="flex flex-col gap-4" aria-label="Investors">
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="relative min-w-0 flex-[1_1_240px] sm:max-w-sm">
                            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"/>
                            <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search your investors"
                                   placeholder="Search name, contact, email, website" className="pl-8"/>
                        </div>
                        {types.length > 1 && (
                            <Select value={type} onValueChange={setType}>
                                <SelectTrigger className="w-auto min-w-[120px] gap-2" aria-label="Investor type"><SelectValue/></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Any type</SelectItem>
                                    {types.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        )}
                        <span className="ml-auto text-sm text-muted-foreground tabular">
                            {rows.length === investors.length ? `${investors.length} investors` : `${rows.length} of ${investors.length}`}
                        </span>
                    </div>

                    {rows.length === 0 ? (
                        <p className="rounded-xl border border-dashed px-4 py-8 text-center text-muted-foreground">No investors match your search.</p>
                    ) : (
                        <div className="overflow-x-auto rounded-xl border bg-card">
                            <Table className="min-w-[820px]">
                                <TableHeader>
                                    <TableRow>
                                        {COLUMNS.map((c) => (
                                            <TableHead key={c.key} className={c.numeric ? "text-right" : undefined}
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
                                    {rows.map((r) => {
                                        const href = websiteHref(r.website);
                                        return (
                                            <TableRow key={r.id} tabIndex={0} className="cursor-pointer"
                                                      onClick={() => navigate(`/investors/${r.id}`)}
                                                      onKeyDown={(e) => e.key === "Enter" && navigate(`/investors/${r.id}`)}>
                                                <TableCell className="align-top">
                                                    <div className="font-semibold">{r.name}</div>
                                                    {href && (
                                                        <a href={href} target="_blank" rel="noreferrer noopener" onClick={(e) => e.stopPropagation()}
                                                           className="text-xs text-muted-foreground underline decoration-foreground/20 underline-offset-2 hover:text-foreground">
                                                            {websiteLabel(r.website)}
                                                        </a>
                                                    )}
                                                </TableCell>
                                                <TableCell className="align-top">{r.type}</TableCell>
                                                <TableCell className="align-top">
                                                    {r.contact_name && <div>{r.contact_name}</div>}
                                                    {r.contact_email && (
                                                        <a href={`mailto:${r.contact_email}`} onClick={(e) => e.stopPropagation()}
                                                           className="text-xs text-muted-foreground hover:text-foreground hover:underline">
                                                            {r.contact_email}
                                                        </a>
                                                    )}
                                                </TableCell>
                                                <TableCell className="tabular whitespace-nowrap text-right align-top">{r.min_check ? formatMoney(r.min_check) : ""}</TableCell>
                                                <TableCell className="align-top"><CommentCount stats={stats?.get(r.id)}/></TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </section>
            )}

            <MyInvestorSheet open={isNew || Boolean(selected)} investor={selected}
                             onClose={() => navigate("/investors")} onCreated={(id) => navigate(`/investors/${id}`, {replace: true})}/>
        </AppShell>
    );
}
