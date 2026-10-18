import {useMemo, useRef, useState} from "react";
import {useNavigate, useParams} from "react-router-dom";
import {format} from "date-fns";
import {AlertCircle, Download, Plus, RefreshCw, Search, Upload} from "lucide-react";
import {toast} from "sonner";
import {useOrg} from "@/hooks/useOrg";
import {useImportInvestors, useInvestors, useMoveStage, useRound} from "@/hooks/usePipeline";
import {AppShell} from "@/components/AppShell";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Checkbox} from "@/components/ui/checkbox";
import {Skeleton} from "@/components/ui/skeleton";
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "@/components/ui/select";
import {RaiseMeter} from "@/components/pipeline/RaiseMeter";
import {FollowUps} from "@/components/pipeline/FollowUps";
import {Board} from "@/components/pipeline/Board";
import {InvestorTable} from "@/components/pipeline/InvestorTable";
import {InvestorSheet} from "@/components/pipeline/InvestorSheet";
import {RoundSheet} from "@/components/pipeline/RoundSheet";
import {formatMoney, INVESTOR_TYPES, raiseMetrics} from "@/lib/pipeline";
import {downloadInvestorsCSV, investorsFromCSV} from "@/lib/importExport";
import {cn} from "@/lib/utils";

type View = "board" | "table";

function readView(): View {
    try {
        return localStorage.getItem("venture.view") === "table" ? "table" : "board";
    } catch {
        return "board";
    }
}

export default function Pipeline() {
    const {org, canEdit} = useOrg();
    const {investorId} = useParams();
    const navigate = useNavigate();
    const investorsQ = useInvestors(org.id);
    const roundQ = useRound(org.id);
    const move = useMoveStage(org.id);
    const importer = useImportInvestors(org.id);
    const base = `/o/${org.id}`;

    const [view, setView] = useState<View>(readView);
    const [query, setQuery] = useState("");
    const [priority, setPriority] = useState("all");
    const [type, setType] = useState("all");
    const [showPassed, setShowPassed] = useState(false);
    const [roundOpen, setRoundOpen] = useState(false);
    const fileInput = useRef<HTMLInputElement>(null);

    const investors = useMemo(() => investorsQ.data ?? [], [investorsQ.data]);
    const round = roundQ.data;
    const metrics = useMemo(() => raiseMetrics(investors, round?.target ?? 0), [investors, round?.target]);
    const passedCount = investors.filter((i) => i.stage === "passed").length;

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        return investors.filter((r) =>
            (showPassed || r.stage !== "passed") &&
            (priority === "all" || r.priority === priority) &&
            (type === "all" || r.type === type) &&
            (!q || [r.name, r.partner, r.via, r.notes, r.next_step, r.geo].join(" ").toLowerCase().includes(q)));
    }, [investors, query, priority, type, showPassed]);

    const isNew = investorId === "new";
    const selected = investorId && !isNew ? investors.find((i) => i.id === investorId) : undefined;
    const sheetOpen = isNew || Boolean(selected);
    const openInvestor = (id: string) => navigate(`${base}/investors/${id}`);
    const closeSheet = () => navigate(base);

    const changeView = (v: View) => {
        setView(v);
        try {
            localStorage.setItem("venture.view", v);
        } catch { /* storage unavailable */
        }
    };

    const onImport = async (file: File) => {
        const res = investorsFromCSV(await file.text());
        if (!res.ok) {
            toast.error(res.error);
            return;
        }
        importer.mutate(res.rows);
    };

    const roundFacts = round ? [
        round.name ? `${round.name} round` : "",
        round.instrument,
        round.cap ? `${formatMoney(round.cap)} cap` : "",
        round.close_date ? `closing ${format(new Date(round.close_date + "T00:00:00"), "MMM d, yyyy")}` : "",
    ].filter(Boolean) : [];

    return (
        <AppShell
            wide
            title="Pipeline"
            description={<>
                {roundFacts.length > 0 ? <span>{roundFacts.join(", ")}</span> : <span>No round details yet</span>}
                <button type="button" onClick={() => setRoundOpen(true)}
                        className="text-foreground underline decoration-foreground/30 underline-offset-4 hover:decoration-foreground">
                    {canEdit ? (roundFacts.length ? "Edit round" : "Add round details") : "Round details"}
                </button>
            </>}
            actions={<>
                <input ref={fileInput} type="file" accept=".csv,text/csv" hidden onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) onImport(f);
                    e.target.value = "";
                }}/>
                {canEdit && (
                    <Button variant="ghost" size="sm" onClick={() => fileInput.current?.click()} disabled={importer.isPending}>
                        <Upload/>Import
                    </Button>
                )}
                {investors.length > 0 && (
                    <Button variant="ghost" size="sm" onClick={() => downloadInvestorsCSV(investors, org.name)}><Download/>Export</Button>
                )}
                {canEdit && <Button onClick={() => navigate(`${base}/investors/new`)}><Plus/>Add investor</Button>}
            </>}
        >
            {investorsQ.isError ? (
                <div className="flex flex-col items-start gap-3 rounded-xl border bg-card p-6">
                    <AlertCircle className="h-6 w-6 text-destructive"/>
                    <h2 className="text-lg font-semibold">The pipeline didn't load</h2>
                    <p className="max-w-md text-muted-foreground">{(investorsQ.error as Error).message}</p>
                    <Button variant="outline" onClick={() => investorsQ.refetch()}><RefreshCw/>Try again</Button>
                </div>
            ) : investorsQ.isLoading ? (
                <div className="flex flex-col gap-6">
                    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
                        <Skeleton className="h-56 rounded-xl"/>
                        <Skeleton className="h-56 rounded-xl"/>
                    </div>
                    <Skeleton className="h-80 rounded-xl"/>
                </div>
            ) : investors.length === 0 ? (
                <EmptyPipeline canEdit={canEdit} onAdd={() => navigate(`${base}/investors/new`)} onImport={() => fileInput.current?.click()}/>
            ) : (
                <div className="flex flex-col gap-10">
                    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
                        <RaiseMeter metrics={metrics} investors={investors} onSetTarget={canEdit ? () => setRoundOpen(true) : undefined}/>
                        <FollowUps investors={investors} onOpen={openInvestor}/>
                    </div>

                    <section aria-label="Investors" className="flex flex-col gap-4">
                        <div className="flex flex-wrap items-center gap-2">
                            <div className="inline-flex rounded-lg bg-sunken p-0.5" role="tablist" aria-label="View">
                                {(["board", "table"] as const).map((v) => (
                                    <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => changeView(v)}
                                            className={cn("rounded-md px-3 py-1 text-[13px] font-medium capitalize text-muted-foreground transition-colors focus-visible:outline-2 focus-visible:outline-ring",
                                                view === v && "bg-card text-foreground shadow-[0_0_0_1px_var(--border)]")}>
                                        {v}
                                    </button>
                                ))}
                            </div>
                            <div className="relative min-w-0 flex-[1_1_220px] sm:max-w-xs">
                                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"/>
                                <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search investors"
                                       placeholder="Search" className="pl-8"/>
                            </div>
                            <Select value={priority} onValueChange={setPriority}>
                                <SelectTrigger className="w-auto min-w-[128px] gap-2" aria-label="Priority"><SelectValue/></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Any priority</SelectItem>
                                    <SelectItem value="A">A, must win</SelectItem>
                                    <SelectItem value="B">B, strong fit</SelectItem>
                                    <SelectItem value="C">C, long shot</SelectItem>
                                </SelectContent>
                            </Select>
                            <Select value={type} onValueChange={setType}>
                                <SelectTrigger className="w-auto min-w-[120px] gap-2" aria-label="Investor type"><SelectValue/></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Any type</SelectItem>
                                    {INVESTOR_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                                </SelectContent>
                            </Select>
                            {passedCount > 0 && (
                                <label className="ml-1 flex items-center gap-2 text-[13px] text-muted-foreground">
                                    <Checkbox checked={showPassed} onCheckedChange={(c) => setShowPassed(c === true)}/>
                                    Show {passedCount} passed
                                </label>
                            )}
                        </div>

                        {filtered.length === 0 ? (
                            <p className="rounded-xl border border-dashed px-4 py-8 text-center text-muted-foreground">No investors match these filters.</p>
                        ) : view === "board" ? (
                            <Board investors={filtered} showPassed={showPassed} canEdit={canEdit} onOpen={openInvestor}
                                   onMove={(id, stage) => move.mutate({id, stage})}/>
                        ) : <InvestorTable investors={filtered} onOpen={openInvestor}/>}
                    </section>
                </div>
            )}

            <InvestorSheet open={sheetOpen && (canEdit || !isNew)} investor={selected} canEdit={canEdit} onClose={closeSheet}/>
            <RoundSheet open={roundOpen} round={round} canEdit={canEdit} onClose={() => setRoundOpen(false)}/>
        </AppShell>
    );
}

function EmptyPipeline({canEdit, onAdd, onImport}: {canEdit: boolean; onAdd: () => void; onImport: () => void}) {
    return (
        <div className="grid gap-8 rounded-2xl border bg-card p-6 sm:p-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="flex flex-col items-start gap-4">
                <h2 className="text-2xl font-bold tracking-[-0.02em]">Start your investor list</h2>
                <p className="max-w-md text-muted-foreground">
                    Add the funds, angels and strategics you plan to talk to. Move them across stages as conversations
                    progress, and the meter shows how much of the round is committed.
                </p>
                {canEdit ? (
                    <div className="flex flex-wrap gap-2">
                        <Button onClick={onAdd}><Plus/>Add investor</Button>
                        <Button variant="outline" onClick={onImport}><Upload/>Import a CSV</Button>
                    </div>
                ) : <p className="text-sm text-muted-foreground">An editor or owner can add investors.</p>}
            </div>
            <div className="text-sm text-muted-foreground">
                <p className="mb-2 font-medium text-foreground">CSV columns we recognize</p>
                <p className="leading-relaxed">
                    Fund or Name (required), Partner, Email, Type, Stage, Priority, Mandate, Check min, Check max, Amount,
                    Intro via, Geo, Next step, Next date, Last contact, Notes. Stage can be free text such as "IC", "DD" or "passed".
                </p>
            </div>
        </div>
    );
}
