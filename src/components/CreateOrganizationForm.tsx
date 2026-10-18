import {type FormEvent, useState} from "react";
import {useNavigate} from "react-router-dom";
import {Loader2, Plus} from "lucide-react";
import {useCreateOrganization} from "@/hooks/useOrganizations";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";

export function CreateOrganizationForm({autoFocus = false}: {autoFocus?: boolean}) {
    const [name, setName] = useState("");
    const create = useCreateOrganization();
    const navigate = useNavigate();

    const onSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (!name.trim()) return;
        const orgId = await create.mutateAsync(name.trim());
        navigate(`/o/${orgId}`);
    };

    return (
        <form onSubmit={onSubmit} className="flex w-full flex-col gap-3">
            <div className="flex flex-col gap-1.5">
                <Label htmlFor="org-name">Company you're raising for</Label>
                <Input id="org-name" required maxLength={120} autoFocus={autoFocus} placeholder="e.g. Mars Rovers Inc."
                       value={name} onChange={(e) => setName(e.target.value)}/>
            </div>
            <Button type="submit" disabled={create.isPending || !name.trim()}>
                {create.isPending ? <Loader2 className="animate-spin"/> : <Plus/>}
                Create organization
            </Button>
        </form>
    );
}
