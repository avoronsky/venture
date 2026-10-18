import {type FormEvent, useState} from "react";
import {Link} from "react-router-dom";
import {ArrowLeft, Loader2, Trash2, UserPlus} from "lucide-react";
import {useAuth} from "@/hooks/useAuth";
import {useMemberMutations, useMembers} from "@/hooks/usePipeline";
import {AppHeader} from "@/components/AppHeader";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
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
    {value: "owner", label: "Owner", hint: "Everything, plus managing this list"},
    {value: "editor", label: "Editor", hint: "Read and change pipeline data"},
    {value: "viewer", label: "Viewer", hint: "Read only"},
];

export default function Team() {
    const {email: me} = useAuth();
    const {data: members = [], isLoading} = useMembers(true);
    const {add, setRole, remove} = useMemberMutations();
    const [email, setEmail] = useState("");
    const [role, setNewRole] = useState<Role>("editor");

    const onAdd = async (e: FormEvent) => {
        e.preventDefault();
        await add.mutateAsync({email: email.trim(), role});
        setEmail("");
    };

    return (
        <div className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-6 sm:px-6">
            <AppHeader title="Team access" subtitle={
                <Link to="/" className="inline-flex items-center gap-1 hover:text-foreground"><ArrowLeft className="h-3.5 w-3.5"/>Back to the pipeline</Link>
            }/>

            <Card className="shadow-none">
                <CardContent className="flex flex-col gap-5 p-5">
                    <p className="text-sm text-muted-foreground">
                        Only emails on this list can see the pipeline. New people sign in with the same email you add here.
                    </p>
                    <form onSubmit={onAdd} className="flex flex-wrap gap-2">
                        <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                               placeholder="name@company.com" aria-label="Email" className="min-w-0 flex-[1_1_240px]"/>
                        <Select value={role} onValueChange={(v) => setNewRole(v as Role)}>
                            <SelectTrigger className="w-32" aria-label="Role"><SelectValue/></SelectTrigger>
                            <SelectContent>{ROLES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
                        </Select>
                        <Button type="submit" disabled={add.isPending}>{add.isPending ? <Loader2 className="animate-spin"/> : <UserPlus/>}Add</Button>
                    </form>

                    {isLoading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground"/> : (
                        <ul className="flex flex-col divide-y rounded-md border">
                            {members.map((m) => {
                                const isMe = m.email === me?.toLowerCase();
                                return (
                                    <li key={m.email} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5">
                                        <span className="min-w-0 [overflow-wrap:anywhere]">
                                            {m.email}{isMe && <span className="ml-1.5 text-xs text-muted-foreground">(you)</span>}
                                        </span>
                                        {isMe ? <span className="eyebrow text-primary">{m.role}</span> : (
                                            <span className="flex items-center gap-2">
                                                <Select value={m.role} onValueChange={(v) => setRole.mutate({email: m.email, role: v as Role})}>
                                                    <SelectTrigger className="h-9 w-28" aria-label={`Role for ${m.email}`}><SelectValue/></SelectTrigger>
                                                    <SelectContent>{ROLES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
                                                </Select>
                                                <AlertDialog>
                                                    <AlertDialogTrigger asChild>
                                                        <Button variant="ghost" size="icon" aria-label={`Remove ${m.email}`} className="text-destructive hover:text-destructive"><Trash2/></Button>
                                                    </AlertDialogTrigger>
                                                    <AlertDialogContent>
                                                        <AlertDialogHeader>
                                                            <AlertDialogTitle>Remove {m.email}?</AlertDialogTitle>
                                                            <AlertDialogDescription>They lose access to the pipeline immediately.</AlertDialogDescription>
                                                        </AlertDialogHeader>
                                                        <AlertDialogFooter>
                                                            <AlertDialogCancel>Keep</AlertDialogCancel>
                                                            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                                                               onClick={() => remove.mutate(m.email)}>Remove</AlertDialogAction>
                                                        </AlertDialogFooter>
                                                    </AlertDialogContent>
                                                </AlertDialog>
                                            </span>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                    )}

                    <dl className="grid gap-1 text-sm sm:grid-cols-3">
                        {ROLES.map((r) => (
                            <div key={r.value}>
                                <dt className="eyebrow">{r.label}</dt>
                                <dd className="text-muted-foreground">{r.hint}</dd>
                            </div>
                        ))}
                    </dl>
                </CardContent>
            </Card>
        </div>
    );
}
