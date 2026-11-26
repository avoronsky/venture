import {type FormEvent, useEffect, useMemo, useState} from "react";
import {useNavigate, useParams} from "react-router-dom";
import {Check, ClipboardPaste, Columns3, Loader2, Pencil, Plus, RefreshCw, Search, Trash2, Users, X} from "lucide-react";
import {useOrg} from "@/hooks/useOrg";
import {useListMembers, useListMutations, useRecipientLists} from "@/hooks/useUpdates";
import {AppShell} from "@/components/AppShell";
import {PipelinePicker} from "@/components/updates/PipelinePicker";
import {Segmented} from "@/components/updates/EmailFrame";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {Textarea} from "@/components/ui/textarea";
import {Skeleton} from "@/components/ui/skeleton";
import {Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle} from "@/components/ui/sheet";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {isValidEmail, parseRecipients} from "@/lib/recipients";
import type {RecipientList, RecipientListMember} from "@/lib/types";

/** The organization's recipient lists for investor updates. */
export default function RecipientLists() {
    const {listId} = useParams();
    const navigate = useNavigate();
    const {org, canEdit} = useOrg();
    const listsQ = useRecipientLists(org.id);
    const {data: members} = useListMembers(org.id);
    const lists = listsQ.data ?? [];
    const base = `/o/${org.id}/lists`;
    const isNew = listId === "new";
    const selected = listId && !isNew ? lists.find((l) => l.id === listId) : undefined;
    const open = isNew || Boolean(selected);

    return (
        <AppShell
            title="Recipient lists"
            description={<span>Who gets your investor updates. Each person gets their own email.</span>}
            actions={canEdit && <Button onClick={() => navigate(`${base}/new`)}><Plus/>New list</Button>}
        >
            {listsQ.isError ? (
                <div className="flex flex-col items-start gap-3 rounded-xl border bg-card p-6">
                    <h2 className="text-lg font-semibold">Lists didn't load</h2>
                    <p className="text-muted-foreground">{(listsQ.error as Error).message}</p>
                    <Button variant="outline" onClick={() => listsQ.refetch()}><RefreshCw/>Try again</Button>
                </div>
            ) : listsQ.isPending ? (
                <Skeleton className="h-40 rounded-xl"/>
            ) : lists.length === 0 ? (
                <div className="flex flex-col items-start gap-4 rounded-2xl border bg-card p-6 sm:p-10">
                    <Users className="h-8 w-8 text-muted-foreground"/>
                    <h2 className="text-2xl font-bold tracking-[-0.02em]">Make your first list</h2>
                    <p className="max-w-lg text-muted-foreground">
                        For example, <span className="text-foreground">Current investors</span> for regular updates and{" "}
                        <span className="text-foreground">Warm prospects</span> for people you're keeping close before the next round.
                        Add people from your pipeline or paste email addresses.
                    </p>
                    {canEdit && <Button onClick={() => navigate(`${base}/new`)}><Plus/>New list</Button>}
                </div>
            ) : (
                <ul className="grid gap-3 sm:grid-cols-2">
                    {lists.map((l) => {
                        const people = members?.get(l.id) ?? [];
                        return (
                            <li key={l.id}>
                                <button type="button" onClick={() => navigate(`${base}/${l.id}`)}
                                        className="flex h-full w-full flex-col gap-1.5 rounded-lg border bg-card p-4 text-left transition-colors hover:border-foreground/30">
                                    <span className="flex items-baseline justify-between gap-3">
                                        <span className="font-semibold [overflow-wrap:anywhere]">{l.name}</span>
                                        <span className="tabular shrink-0 text-sm text-muted-foreground">{people.length} {people.length === 1 ? "person" : "people"}</span>
                                    </span>
                                    {l.description && <span className="text-sm text-muted-foreground">{l.description}</span>}
                                    {people.length > 0 && (
                                        <span className="truncate text-xs text-muted-foreground">
                                            {people.slice(0, 4).map((p) => p.name || p.email).join(", ")}{people.length > 4 && `, +${people.length - 4}`}
                                        </span>
                                    )}
                                </button>
                            </li>
                        );
                    })}
                </ul>
            )}

            <Sheet open={open} onOpenChange={(o) => !o && navigate(base)}>
                <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-xl">
                    {isNew ? (
                        <NewList onCreated={(id) => navigate(`${base}/${id}`, {replace: true})}/>
                    ) : selected ? (
                        <ListDetails key={selected.id} list={selected} people={members?.get(selected.id) ?? []} onDeleted={() => navigate(base, {replace: true})}/>
                    ) : null}
                </SheetContent>
            </Sheet>
        </AppShell>
    );
}

function NewList({onCreated}: {onCreated: (id: string) => void}) {
    const {org} = useOrg();
    const {create} = useListMutations(org.id);
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const submit = async (e: FormEvent) => {
        e.preventDefault();
        const l = await create.mutateAsync({name, description});
        onCreated(l.id);
    };
    return (
        <>
            <SheetHeader className="border-b px-6 py-4 text-left">
                <SheetTitle className="text-xl">New list</SheetTitle>
                <SheetDescription>Next, you'll add people to it.</SheetDescription>
            </SheetHeader>
            <form onSubmit={submit} className="flex flex-col gap-4 px-6 py-5">
                <div className="flex flex-col gap-1.5">
                    <Label htmlFor="list-name">Name</Label>
                    <Input id="list-name" autoFocus required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="Current investors"/>
                </div>
                <div className="flex flex-col gap-1.5">
                    <Label htmlFor="list-description">Description <span className="font-normal text-muted-foreground">(optional)</span></Label>
                    <Input id="list-description" maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Everyone on the cap table"/>
                </div>
                <div><Button type="submit" disabled={!name.trim() || create.isPending}>{create.isPending && <Loader2 className="animate-spin"/>}Create list</Button></div>
            </form>
        </>
    );
}

function ListDetails({list, people, onDeleted}: {list: RecipientList; people: RecipientListMember[]; onDeleted: () => void}) {
    const {org, canEdit} = useOrg();
    const {save, remove, addMembers, removeMembers} = useListMutations(org.id);
    const [name, setName] = useState(list.name);
    const [description, setDescription] = useState(list.description);
    const [source, setSource] = useState<"pipeline" | "paste">("pipeline");
    const [pasted, setPasted] = useState("");
    const [skipped, setSkipped] = useState<string[]>([]);
    const [query, setQuery] = useState("");
    const [confirmDelete, setConfirmDelete] = useState(false);
    useEffect(() => {
        setName(list.name);
        setDescription(list.description);
    }, [list.name, list.description]);

    const onList = useMemo(() => new Set(people.map((p) => p.email)), [people]);
    const shown = useMemo(() => {
        const q = query.trim().toLowerCase();
        return q ? people.filter((p) => [p.name, p.email, p.firm].join(" ").toLowerCase().includes(q)) : people;
    }, [people, query]);
    const detailsChanged = name.trim() !== list.name || description.trim() !== list.description;

    const addPasted = async () => {
        const {recipients, skipped: bad} = parseRecipients(pasted);
        setSkipped(bad);
        if (!recipients.length) return;
        await addMembers.mutateAsync({listId: list.id, people: recipients});
        setPasted(bad.join("\n"));
    };

    return (
        <>
            <SheetHeader className="border-b px-6 py-4 text-left">
                <SheetTitle className="text-xl [overflow-wrap:anywhere]">{list.name}</SheetTitle>
                <SheetDescription>{people.length} {people.length === 1 ? "person" : "people"}</SheetDescription>
            </SheetHeader>
            <div className="flex flex-1 flex-col gap-7 overflow-y-auto px-6 py-5">
                {canEdit && (
                    <form className="flex flex-col gap-3" onSubmit={(e) => {
                        e.preventDefault();
                        if (name.trim()) save.mutate({id: list.id, name, description});
                    }}>
                        <div className="grid gap-3 sm:grid-cols-2">
                            <div className="flex flex-col gap-1.5">
                                <Label htmlFor="list-name" className="text-xs text-muted-foreground">Name</Label>
                                <Input id="list-name" required maxLength={80} value={name} onChange={(e) => setName(e.target.value)}/>
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <Label htmlFor="list-description" className="text-xs text-muted-foreground">Description</Label>
                                <Input id="list-description" maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)}/>
                            </div>
                        </div>
                        {detailsChanged && <div><Button type="submit" variant="outline" size="sm" disabled={!name.trim() || save.isPending}>Save</Button></div>}
                    </form>
                )}

                {canEdit && (
                    <section className="flex flex-col gap-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <h3 className="font-semibold">Add people</h3>
                            <Segmented label="Add from" value={source} onChange={setSource}
                                       options={[{value: "pipeline", label: <><Columns3/>From pipeline</>}, {value: "paste", label: <><ClipboardPaste/>Paste emails</>}]}/>
                        </div>
                        {source === "pipeline" ? (
                            <PipelinePicker onList={onList} adding={addMembers.isPending}
                                            onAdd={(p) => addMembers.mutateAsync({listId: list.id, people: p})}/>
                        ) : (
                            <div className="flex flex-col gap-2">
                                <Textarea value={pasted} onChange={(e) => setPasted(e.target.value)} rows={5} aria-label="Emails to add"
                                          placeholder={"ann@fund.vc\nBob Smith <bob@angel.com>\nCara Diaz, Seed Partners, cara@seed.vc"}/>
                                <p className="text-xs text-muted-foreground">
                                    One person per line, or separated by commas. Names in <code>Name &lt;email&gt;</code> form are kept, and so are
                                    rows copied from a spreadsheet (name, firm, email).
                                </p>
                                {skipped.length > 0 && (
                                    <p className="text-xs text-destructive">No email found in {skipped.length === 1 ? "this line" : "these lines"}: {skipped.join(" · ")}</p>
                                )}
                                <div>
                                    <Button onClick={addPasted} disabled={!pasted.trim() || addMembers.isPending}>
                                        {addMembers.isPending ? <Loader2 className="animate-spin"/> : <Plus/>}Add
                                    </Button>
                                </div>
                            </div>
                        )}
                    </section>
                )}

                <section className="flex flex-col gap-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="font-semibold">On this list</h3>
                        {people.length > 8 && (
                            <div className="relative w-48">
                                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"/>
                                <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search" className="h-8 pl-8" aria-label="Search the list"/>
                            </div>
                        )}
                    </div>
                    {people.length === 0 ? (
                        <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">Nobody yet.</p>
                    ) : (
                        <ul className="flex flex-col divide-y rounded-md border">
                            {shown.map((p) => <MemberRow key={p.id} person={p} canEdit={canEdit} onRemove={() => removeMembers.mutate([p.id])}/>)}
                        </ul>
                    )}
                </section>

                {canEdit && (
                    <div className="mt-auto border-t pt-4">
                        <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setConfirmDelete(true)}><Trash2/>Delete list</Button>
                    </div>
                )}
            </div>

            <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete {list.name}?</AlertDialogTitle>
                        <AlertDialogDescription>
                            The list and its {people.length} {people.length === 1 ? "person" : "people"} are removed. Updates already sent to it
                            stay in the history with who received them.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={async () => {
                            await remove.mutateAsync(list.id);
                            onDeleted();
                        }}>Delete</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}

function MemberRow({person, canEdit, onRemove}: {person: RecipientListMember; canEdit: boolean; onRemove: () => void}) {
    const {org} = useOrg();
    const {saveMember} = useListMutations(org.id);
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState({email: person.email, name: person.name, firm: person.firm});
    const valid = isValidEmail(draft.email.trim().toLowerCase());

    if (editing) {
        return (
            <li className="flex flex-col gap-2 px-3 py-2.5">
                <div className="grid gap-2 sm:grid-cols-3">
                    <Input value={draft.name} onChange={(e) => setDraft({...draft, name: e.target.value})} placeholder="Name" aria-label="Name" maxLength={200}/>
                    <Input value={draft.firm} onChange={(e) => setDraft({...draft, firm: e.target.value})} placeholder="Firm" aria-label="Firm" maxLength={200}/>
                    <Input value={draft.email} onChange={(e) => setDraft({...draft, email: e.target.value})} placeholder="Email" aria-label="Email" type="email"/>
                </div>
                <div className="flex gap-2">
                    <Button size="sm" disabled={!valid || saveMember.isPending} onClick={async () => {
                        await saveMember.mutateAsync({id: person.id, values: {...draft, email: draft.email.trim().toLowerCase()}});
                        setEditing(false);
                    }}><Check/>Save</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(false)}><X/>Cancel</Button>
                </div>
            </li>
        );
    }
    return (
        <li className="flex items-center justify-between gap-3 px-3 py-2">
            <span className="min-w-0">
                <span className="block truncate text-sm">{person.name || person.email}</span>
                <span className="block truncate text-xs text-muted-foreground">{person.name ? person.email : ""}{person.name && person.firm ? " · " : ""}{person.firm}</span>
            </span>
            {canEdit && (
                <span className="flex shrink-0 items-center">
                    <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Edit ${person.email}`} onClick={() => {
                        setDraft({email: person.email, name: person.name, firm: person.firm});
                        setEditing(true);
                    }}><Pencil/></Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" aria-label={`Remove ${person.email}`} onClick={onRemove}><X/></Button>
                </span>
            )}
        </li>
    );
}
