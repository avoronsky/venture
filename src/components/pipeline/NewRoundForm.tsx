import {type FormEvent, useState} from "react";
import {useNavigate} from "react-router-dom";
import {Loader2, Plus} from "lucide-react";
import {useOrg} from "@/hooks/useOrg";
import {useCreateRound} from "@/hooks/useRounds";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "@/components/ui/select";
import {parseMoney} from "@/lib/pipeline";
import type {Round} from "@/lib/types";

const NO_COPY = "none";

interface NewRoundFormProps {
    /** Existing rounds, offered as a source of investors to start from. */
    rounds: Round[];
    /** Pre-select a round to copy investors from (usually the one being viewed). */
    copyFromDefault?: string;
    onCreated?: () => void;
}

export function NewRoundForm({rounds, copyFromDefault, onCreated}: NewRoundFormProps) {
    const {org} = useOrg();
    const create = useCreateRound(org.id);
    const navigate = useNavigate();
    const [name, setName] = useState("");
    const [target, setTarget] = useState("");
    const [copyFrom, setCopyFrom] = useState(copyFromDefault ?? NO_COPY);
    const targetValid = target.trim() === "" || parseMoney(target) > 0;

    const onSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (!name.trim() || !targetValid) return;
        const id = await create.mutateAsync({
            name: name.trim(),
            copyFrom: copyFrom === NO_COPY ? null : copyFrom,
            details: target.trim() ? {target: parseMoney(target)} : undefined,
        });
        onCreated?.();
        navigate(`/o/${org.id}/r/${id}`);
    };

    return (
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
                <Label htmlFor="round-name">Round name</Label>
                <Input id="round-name" required maxLength={80} autoFocus placeholder="e.g. Series A"
                       value={name} onChange={(e) => setName(e.target.value)}/>
            </div>
            <div className="flex flex-col gap-1.5">
                <Label htmlFor="round-target">Target raise (USD, optional)</Label>
                <Input id="round-target" inputMode="decimal" placeholder="e.g. 8M" value={target} onChange={(e) => setTarget(e.target.value)}/>
                {!targetValid && <p className="text-xs text-destructive">Use a number like 8M or 750K.</p>}
            </div>
            {rounds.length > 0 && (
                <div className="flex flex-col gap-1.5">
                    <Label htmlFor="round-copy">Start with investors from</Label>
                    <Select value={copyFrom} onValueChange={setCopyFrom}>
                        <SelectTrigger id="round-copy"><SelectValue/></SelectTrigger>
                        <SelectContent>
                            <SelectItem value={NO_COPY}>Nobody, start empty</SelectItem>
                            {rounds.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                        </SelectContent>
                    </Select>
                    {copyFrom !== NO_COPY && (
                        <p className="text-xs leading-relaxed text-muted-foreground">
                            Every investor from that round is added at Target, with contact details, type, priority, mandate
                            and notes. Stages, amounts, next steps and comments stay with the original round.
                        </p>
                    )}
                </div>
            )}
            <Button type="submit" className="self-start" disabled={!name.trim() || !targetValid || create.isPending}>
                {create.isPending ? <Loader2 className="animate-spin"/> : <Plus/>}Create round
            </Button>
        </form>
    );
}
