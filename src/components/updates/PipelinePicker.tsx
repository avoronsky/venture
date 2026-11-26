import {useMemo, useState} from "react";
import {Loader2, Plus, Search} from "lucide-react";
import {useOrg} from "@/hooks/useOrg";
import {useRounds} from "@/hooks/useRounds";
import {type PipelineContact, usePipelineContacts} from "@/hooks/useUpdates";
import {Button} from "@/components/ui/button";
import {Checkbox} from "@/components/ui/checkbox";
import {Input} from "@/components/ui/input";
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "@/components/ui/select";
import {StagePill} from "@/components/pipeline/badges";
import {STAGES, type StageId} from "@/lib/pipeline";
import type {RecipientInput} from "@/lib/types";
import {cn} from "@/lib/utils";

const DEFAULT_STAGES: StageId[] = ["committed", "closed"];

/** Pick people from the organization's pipelines: by default, contacts at investors who committed or closed. */
export function PipelinePicker({onList, onAdd, adding}: {onList: Set<string>; onAdd: (people: RecipientInput[]) => Promise<unknown>; adding: boolean}) {
    const {org} = useOrg();
    const {data: rounds = []} = useRounds(org.id);
    const {data: contacts = [], isPending} = usePipelineContacts(org.id);
    const [roundId, setRoundId] = useState("all");
    const [stages, setStages] = useState<Set<StageId>>(new Set(DEFAULT_STAGES));
    const [query, setQuery] = useState("");
    const [picked, setPicked] = useState<Map<string, PipelineContact>>(new Map());

    const shown = useMemo(() => {
        const q = query.trim().toLowerCase();
        const seen = new Set<string>();
        return contacts.filter((c) => {
            if (roundId !== "all" && c.roundId !== roundId) return false;
            if (stages.size && !stages.has(c.stage)) return false;
            if (q && ![c.name, c.email, c.investorName, c.role].join(" ").toLowerCase().includes(q)) return false;
            // The same person in several rounds shows once.
            if (seen.has(c.email)) return false;
            seen.add(c.email);
            return true;
        });
    }, [contacts, roundId, stages, query]);

    const selectable = shown.filter((c) => !onList.has(c.email));
    const allPicked = selectable.length > 0 && selectable.every((c) => picked.has(c.email));
    const toggle = (c: PipelineContact) => setPicked((p) => {
        const next = new Map(p);
        if (next.has(c.email)) next.delete(c.email);
        else next.set(c.email, c);
        return next;
    });
    const toggleAll = () => setPicked((p) => {
        const next = new Map(p);
        for (const c of selectable) {
            if (allPicked) next.delete(c.email);
            else next.set(c.email, c);
        }
        return next;
    });
    const toggleStage = (s: StageId) => setStages((prev) => {
        const next = new Set(prev);
        if (next.has(s)) next.delete(s);
        else next.add(s);
        return next;
    });

    const add = async () => {
        await onAdd([...picked.values()].map((c) => ({email: c.email, name: c.name, firm: c.investorName, investor_id: c.investorId})));
        setPicked(new Map());
    };

    return (
        <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-2">
                <div className="relative min-w-0 flex-[1_1_180px]">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"/>
                    <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search people or investors" className="pl-8" aria-label="Search"/>
                </div>
                {rounds.length > 1 && (
                    <Select value={roundId} onValueChange={setRoundId}>
                        <SelectTrigger className="w-40" aria-label="Round"><SelectValue/></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All rounds</SelectItem>
                            {rounds.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                        </SelectContent>
                    </Select>
                )}
            </div>
            <div className="flex flex-wrap gap-1" role="group" aria-label="Stages">
                {STAGES.map((s) => (
                    <button key={s.id} type="button" aria-pressed={stages.has(s.id)} onClick={() => toggleStage(s.id)}
                            className={cn("rounded-full border px-2 py-0.5 text-xs transition-colors",
                                stages.has(s.id) ? "border-foreground bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}>
                        {s.name}
                    </button>
                ))}
            </div>

            {isPending ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground"/> : shown.length === 0 ? (
                <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                    {contacts.length === 0 ? "No pipeline contacts have an email address yet." : "Nobody matches. Try other stages or rounds."}
                </p>
            ) : (
                <div className="flex flex-col rounded-md border">
                    <label className="flex cursor-pointer items-center gap-2.5 border-b bg-sunken/50 px-3 py-2 text-xs text-muted-foreground">
                        <Checkbox checked={allPicked} onCheckedChange={toggleAll} disabled={!selectable.length}/>
                        {selectable.length ? `Select all ${selectable.length}` : "Everyone shown is already on the list"}
                    </label>
                    <ul className="max-h-72 divide-y overflow-y-auto">
                        {shown.map((c) => {
                            const already = onList.has(c.email);
                            return (
                                <li key={c.email}>
                                    <label className={cn("flex items-center gap-2.5 px-3 py-2", already ? "opacity-60" : "cursor-pointer hover:bg-sunken")}>
                                        <Checkbox checked={already || picked.has(c.email)} disabled={already} onCheckedChange={() => toggle(c)}/>
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate text-sm">{c.name || c.email}{already && <span className="ml-1.5 text-xs text-muted-foreground">on the list</span>}</span>
                                            <span className="block truncate text-xs text-muted-foreground">{c.name ? `${c.email} · ` : ""}{c.investorName}</span>
                                        </span>
                                        <StagePill stage={c.stage}/>
                                    </label>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            )}
            <div>
                <Button onClick={add} disabled={!picked.size || adding}>{adding ? <Loader2 className="animate-spin"/> : <Plus/>}Add {picked.size || ""} {picked.size === 1 ? "person" : "people"}</Button>
            </div>
        </div>
    );
}
