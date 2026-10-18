import {useMemo, useRef, useState} from "react";
import {useNavigate, useParams} from "react-router-dom";
import {format} from "date-fns";
import {AlertCircle, Download, LayoutGrid, Plus, RefreshCw, Rows3, Upload} from "lucide-react";
import {toast} from "sonner";
import {useAuth} from "@/hooks/useAuth";
import {useImportInvestors, useInvestors, useMoveStage, usePipelineRealtime, useRound} from "@/hooks/usePipeline";
import {AppHeader} from "@/components/AppHeader";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Checkbox} from "@/components/ui/checkbox";
import {Skeleton} from "@/components/ui/skeleton";
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "@/components/ui/select";
import {ToggleGroup, ToggleGroupItem} from "@/components/ui/toggle-group";
import {RaiseGauge} from "@/components/pipeline/RaiseGauge";
import {NextActions} from "@/components/pipeline/NextActions";
import {Board} from "@/components/pipeline/Board";
import {InvestorTable} from "@/components/pipeline/InvestorTable";
import {InvestorSheet} from "@/components/pipeline/InvestorSheet";
import {RoundSheet} from "@/components/pipeline/RoundSheet";
import {formatMoney, INVESTOR_TYPES, raiseMetrics} from "@/lib/pipeline";
import {downloadInvestorsCSV, investorsFromCSV} from "@/lib/importExport";

type View = "board" | "table";

function readView(): View {
    try {
        return localStorage.getItem("venture.view") === "table" ? "table" : "board";
    } catch {
        return "board";
    }
}

export default function Pipeline() {
    const {canEdit} = useAuth();
    const {investorId} = useParams();
    const navigate = useNavigate();
    const investorsQ = useInvestors();
    const roundQ = useRound();
    const move = useMoveStage();
    const importer = useImportInvestors();
    usePipelineRealtime(true);

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
    const openInvestor = (id: string) => navigate(`/investors/${id}`);
    const closeSheet = () => navigate("/");

    const changeView = (v: string) => {
        if (v !== "board" && v !== "table") return;
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

    const roundLine = round && [
        round.name,
        round.instrument,
        round.cap ? `cap ${formatMoney(round.cap)}` : "",
        round.close_date ? `target close ${format(new Date(round.close_date + "T00:00:00"), "MMM d, yyyy")}` : "",
    ].filter(Boolean).join(" · ");

    return (
        <div className="mx-auto flex max-w-[1400px] flex-col gap-5 px-4 py-6 sm:px-6">
            <AppHeader
                title="Raise Pipeline"
                subtitle={<>
                    <span>{roundLine || "Round details not set"}</span>
                    <Button variant="outline" size="sm" className="h-7 border-dashed px-2 text-xs" onClick={() => setRoundOpen(true)}>
                        {canEdit ? "Edit round" : "Round details"}
                    </Button>
                </>}
                actions={<>
                    {canEdit && (
                        <>
                            <input ref={fileInput} type="file" accept=".csv,text/csv" hidden onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) onImport(f);
                                e.target.value = "";
                            }}/>
                            <Button variant="outline" size="sm" onClick={() => fileInput.current?.click()} disabled={importer.isPending}>
                                <Upload/>Import CSV
                            </Button>
                        </>
                    )}
                    {investors.length > 0 && (
                        <Button variant="outline" size="sm" onClick={() => downloadInvestorsCSV(investors)}><Download/>Export CSV</Button>
                    )}
                    {canEdit && <Button size="sm" onClick={() => navigate("/investors/new")}><Plus/>Add investor</Button>}
                </>}
            />

            {investorsQ.isError ? (
                <div className="flex flex-col items-center gap-3 rounded-lg border bg-card px-6 py-12 text-center">
                    <AlertCircle className="h-8 w-8 text-destructive"/>
                    <h2 className="text-xl font-semibold">Couldn't load the pipeline</h2>
                    <p className="max-w-md text-muted-foreground">{(investorsQ.error as Error).message}</p>
                    <Button variant="outline" onClick={() => investorsQ.refetch()}><RefreshCw/>Try again</Button>
                </div>
            ) : investorsQ.isLoading ? (
                <div className="grid gap-3.5 lg:grid-cols-[2fr_1fr]">
                    <Skeleton className="h-60"/>
                    <Skeleton className="h-60"/>
                    <Skeleton className="h-72 lg:col-span-2"/>
                </div>
            ) : (
                <>
                    <section className="grid gap-3.5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                        <RaiseGauge metrics={metrics} investors={investors}/>
                        <NextActions investors={investors} onOpen={openInvestor}/>
                    </section>

                    {investors.length === 0 ? (
                        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed bg-card px-6 py-12 text-center">
                            <h2 className="text-xl font-semibold">No investors in the pipeline yet</h2>
                            <p className="max-w-lg text-muted-foreground">
                                Add the funds you plan to approach, or import a CSV with columns like Fund, Partner, Stage, Type,
                                Check min, Check max, Amount, Intro via, Next step, Next date, Notes.
                            </p>
                            {canEdit && (
                                <div className="flex gap-2">
                                    <Button onClick={() => navigate("/investors/new")}><Plus/>Add the first investor</Button>
                                    <Button variant="outline" onClick={() => fileInput.current?.click()}><Upload/>Import CSV</Button>
                                </div>
                            )}
                        </div>
                    ) : (
                        <>
                            <div className="flex flex-wrap items-center gap-2.5">
                                <ToggleGroup type="single" value={view} onValueChange={changeView} variant="outline" aria-label="View">
                                    <ToggleGroupItem value="board" aria-label="Board view"><LayoutGrid className="h-4 w-4"/><span className="ml-1.5">Board</span></ToggleGroupItem>
                                    <ToggleGroupItem value="table" aria-label="Table view"><Rows3 className="h-4 w-4"/><span className="ml-1.5">Table</span></ToggleGroupItem>
                                </ToggleGroup>
                                <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search"
                                       placeholder="Search fund, partner, intro, notes" className="h-10 min-w-0 flex-[1_1_220px] bg-card"/>
                                <Select value={priority} onValueChange={setPriority}>
                                    <SelectTrigger className="h-10 w-[150px] bg-card" aria-label="Priority"><SelectValue/></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All priorities</SelectItem>
                                        <SelectItem value="A">Priority A</SelectItem>
                                        <SelectItem value="B">Priority B</SelectItem>
                                        <SelectItem value="C">Priority C</SelectItem>
                                    </SelectContent>
                                </Select>
                                <Select value={type} onValueChange={setType}>
                                    <SelectTrigger className="h-10 w-[170px] bg-card" aria-label="Investor type"><SelectValue/></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All types</SelectItem>
                                        {INVESTOR_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <Checkbox checked={showPassed} onCheckedChange={(c) => setShowPassed(c === true)}/>
                                    Show passed
                                </label>
                            </div>

                            {view === "board"
                                ? <Board investors={filtered} showPassed={showPassed} canEdit={canEdit} onOpen={openInvestor}
                                         onMove={(id, stage) => move.mutate({id, stage})}/>
                                : <InvestorTable investors={filtered} onOpen={openInvestor}/>}
                        </>
                    )}
                </>
            )}

            <InvestorSheet open={sheetOpen && (canEdit || !isNew)} investor={selected} canEdit={canEdit} onClose={closeSheet}/>
            <RoundSheet open={roundOpen} round={round} canEdit={canEdit} onClose={() => setRoundOpen(false)}/>
        </div>
    );
}
