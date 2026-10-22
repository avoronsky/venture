import {type FormEvent, useState} from "react";
import {useNavigate} from "react-router-dom";
import {Loader2, Plus} from "lucide-react";
import {useCreateOrganization} from "@/hooks/useOrganizations";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";

export function CreateOrganizationForm({autoFocus = false}: {autoFocus?: boolean}) {
    const [name, setName] = useState("");
    const [roundName, setRoundName] = useState("");
    const create = useCreateOrganization();
    const navigate = useNavigate();

    const onSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (!name.trim()) return;
        const orgId = await create.mutateAsync({name: name.trim(), roundName: roundName.trim()});
        navigate(`/o/${orgId}`);
    };

    return (
        <form onSubmit={onSubmit} className="flex w-full flex-col gap-3">
            <div className="flex flex-col gap-1.5">
                <Label htmlFor="org-name">Company you're raising for</Label>
                <Input id="org-name" required maxLength={120} autoFocus={autoFocus} placeholder="e.g. Mars Rovers Inc."
                       value={name} onChange={(e) => setName(e.target.value)}/>
            </div>
            <div className="flex flex-col gap-1.5">
                <Label htmlFor="org-round">Round you're raising now</Label>
                <Input id="org-round" maxLength={80} placeholder="e.g. Seed" value={roundName} onChange={(e) => setRoundName(e.target.value)}/>
                <p className="text-xs text-muted-foreground">You can add more rounds later, each with its own pipeline.</p>
            </div>
            <Button type="submit" disabled={create.isPending || !name.trim()}>
                {create.isPending ? <Loader2 className="animate-spin"/> : <Plus/>}
                Create organization
            </Button>
        </form>
    );
}
