import {type FormEvent, type ReactNode, useEffect, useState} from "react";
import {Link, useNavigate} from "react-router-dom";
import {ArrowLeft, Loader2, LogOut, Trash2, UserPlus} from "lucide-react";
import {useAuth} from "@/hooks/useAuth";
import {useOrg} from "@/hooks/useOrg";
import {useDeleteOrganization, useMemberMutations, useMembers, useRenameOrganization} from "@/hooks/useOrganizations";
import {AppHeader} from "@/components/AppHeader";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {Card, CardContent} from "@/components/ui/card";
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "@/components/ui/select";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import type {Role} from "@/lib/types";

const ROLES: {value: Role; label: string; hint: string}[] = [
    {value: "owner", label: "Owner", hint: "Everything, plus access, renaming and deleting the organization"},
    {value: "editor", label: "Editor", hint: "Read and change pipeline data"},
    {value: "viewer", label: "Viewer", hint: "Read only"},
];

export default function OrgSettings() {
    const {org, isOwner} = useOrg();
    const {email: me} = useAuth();
    const navigate = useNavigate();
    const {data: members = [], isLoading} = useMembers(org.id);
    const {add, setRole, remove} = useMemberMutations(org.id);
    const rename = useRenameOrganization(org.id);
    const del = useDeleteOrganization();

    const [name, setName] = useState(org.name);
    const [email, setEmail] = useState("");
    const [role, setNewRole] = useState<Role>("editor");
    const [confirmName, setConfirmName] = useState("");
    useEffect(() => setName(org.name), [org.name]);

    const owners = members.filter((m) => m.role === "owner").length;
    const myRow = members.find((m) => m.email === me);
    const canLeave = myRow && (myRow.role !== "owner" || owners > 1);

    const onAdd = async (e: FormEvent) => {
        e.preventDefault();
        await add.mutateAsync({email, role});
        setEmail("");
    };

    return (
        <div className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-6 sm:px-6">
            <AppHeader title="Organization & access" subtitle={
                <Link to={`/o/${org.id}`} className="inline-flex items-center gap-1 hover:text-foreground"><ArrowLeft className="h-3.5 w-3.5"/>Back to the pipeline</Link>
            }/>

            <Card className="shadow-none">
                <CardContent className="flex flex-col gap-3 p-5">
                    <h2 className="text-base font-semibold">Organization</h2>
                    <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => {
                        e.preventDefault();
                        if (name.trim() && name.trim() !== org.name) rename.mutate(name);
                    }}>
                        <div className="flex min-w-0 flex-[1_1_260px] flex-col gap-1.5">
                            <Label htmlFor="org-name" className="text-xs text-muted-foreground">Name</Label>
                            <Input id="org-name" value={name} maxLength={120} disabled={!isOwner} onChange={(e) => setName(e.target.value)}/>
                        </div>
                        {isOwner && (
                            <Button type="submit" variant="outline" disabled={rename.isPending || !name.trim() || name.trim() === org.name}>
                                {rename.isPending && <Loader2 className="animate-spin"/>}Rename
                            </Button>
                        )}
                    </form>
                </CardContent>
            </Card>

            <Card className="shadow-none">
                <CardContent className="flex flex-col gap-5 p-5">
                    <div>
                        <h2 className="text-base font-semibold">People with access</h2>
                        <p className="mt-1 text-sm text-muted-foreground">
                            Access is by email. People sign in with Google or an email link using the address listed here,
                            and the organization appears for them right away. Send them the app link yourself; no email is sent.
                        </p>
                    </div>

                    {isOwner && (
                        <form onSubmit={onAdd} className="flex flex-wrap gap-2">
                            <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                                   placeholder="name@company.com" aria-label="Email" className="min-w-0 flex-[1_1_240px]"/>
                            <Select value={role} onValueChange={(v) => setNewRole(v as Role)}>
                                <SelectTrigger className="w-32" aria-label="Role"><SelectValue/></SelectTrigger>
                                <SelectContent>{ROLES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
                            </Select>
                            <Button type="submit" disabled={add.isPending}>{add.isPending ? <Loader2 className="animate-spin"/> : <UserPlus/>}Give access</Button>
                        </form>
                    )}

                    {isLoading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground"/> : (
                        <ul className="flex flex-col divide-y rounded-md border">
                            {members.map((m) => {
                                const isMe = m.email === me;
                                const editable = isOwner && !isMe;
                                return (
                                    <li key={m.email} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5">
                                        <span className="min-w-0">
                                            <span className="block [overflow-wrap:anywhere]">
                                                {m.email}{isMe && <span className="ml-1.5 text-xs text-muted-foreground">(you)</span>}
                                            </span>
                                            {m.invited_by && m.invited_by !== m.email && (
                                                <span className="text-xs text-muted-foreground">Added by {m.invited_by}</span>
                                            )}
                                        </span>
                                        {editable ? (
                                            <span className="flex items-center gap-2">
                                                <Select value={m.role} onValueChange={(v) => setRole.mutate({email: m.email, role: v as Role})}>
                                                    <SelectTrigger className="h-9 w-28" aria-label={`Role for ${m.email}`}><SelectValue/></SelectTrigger>
                                                    <SelectContent>{ROLES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
                                                </Select>
                                                <ConfirmButton title={`Remove ${m.email}?`} description="They lose access to this organization immediately."
                                                               action="Remove" onConfirm={() => remove.mutate(m.email)}>
                                                    <Button variant="ghost" size="icon" aria-label={`Remove ${m.email}`} className="text-destructive hover:text-destructive"><Trash2/></Button>
                                                </ConfirmButton>
                                            </span>
                                        ) : <span className="eyebrow text-primary">{m.role}</span>}
                                    </li>
                                );
                            })}
                        </ul>
                    )}

                    <dl className="grid gap-2 text-sm sm:grid-cols-3">
                        {ROLES.map((r) => (
                            <div key={r.value}>
                                <dt className="eyebrow">{r.label}</dt>
                                <dd className="text-muted-foreground">{r.hint}</dd>
                            </div>
                        ))}
                    </dl>
                </CardContent>
            </Card>

            <Card className="border-destructive/40 shadow-none">
                <CardContent className="flex flex-col gap-4 p-5">
                    <h2 className="text-base font-semibold">Leave or delete</h2>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="max-w-md text-sm text-muted-foreground">
                            {canLeave ? "Leaving removes your access. An owner can add you back."
                                : "You're the only owner. Make someone else an owner before you leave."}
                        </p>
                        <ConfirmButton title={`Leave ${org.name}?`} description="You'll lose access to this pipeline." action="Leave"
                                       onConfirm={async () => {
                                           await remove.mutateAsync(me!);
                                           navigate("/", {replace: true});
                                       }}>
                            <Button variant="outline" disabled={!canLeave}><LogOut/>Leave organization</Button>
                        </ConfirmButton>
                    </div>
                    {isOwner && (
                        <div className="flex flex-col gap-2 border-t pt-4">
                            <p className="text-sm text-muted-foreground">
                                Deleting removes every investor, activity log and the round for everyone. It can't be undone.
                                Type <span className="font-semibold text-foreground">{org.name}</span> to confirm.
                            </p>
                            <div className="flex flex-wrap gap-2">
                                <Input value={confirmName} onChange={(e) => setConfirmName(e.target.value)} aria-label="Organization name to confirm"
                                       className="min-w-0 flex-[1_1_240px]"/>
                                <Button variant="destructive" disabled={confirmName !== org.name || del.isPending}
                                        onClick={async () => {
                                            await del.mutateAsync(org.id);
                                            navigate("/", {replace: true});
                                        }}>
                                    {del.isPending ? <Loader2 className="animate-spin"/> : <Trash2/>}Delete organization
                                </Button>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

function ConfirmButton({title, description, action, onConfirm, children}: {
    title: string; description: string; action: string; onConfirm: () => void | Promise<void>; children: ReactNode;
}) {
    return (
        <AlertDialog>
            <AlertDialogTrigger asChild>{children}</AlertDialogTrigger>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>{title}</AlertDialogTitle>
                    <AlertDialogDescription>{description}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => onConfirm()}>{action}</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
