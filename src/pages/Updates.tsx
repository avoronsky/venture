import {useNavigate} from "react-router-dom";
import {Loader2, Mail, Plus, RefreshCw, Users} from "lucide-react";
import {useOrg} from "@/hooks/useOrg";
import {lastUpdateList, useDeliveryCounts, useRecipientLists, useUpdateMutations, useUpdates} from "@/hooks/useUpdates";
import {AppShell} from "@/components/AppShell";
import {GmailAccount, UpdateStatusPill} from "@/components/updates/bits";
import {when} from "@/lib/when";
import {Button} from "@/components/ui/button";
import {Skeleton} from "@/components/ui/skeleton";
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from "@/components/ui/table";
import {starterUpdate} from "@/lib/updateStarter";
import {authorLabel} from "@/lib/comments";
import {subjectLabel} from "@/lib/emailTemplate";
import {useAuth} from "@/hooks/useAuth";

/** Investor updates: drafts first, then everything sent, newest first. */
export default function Updates() {
    const {org, canEdit} = useOrg();
    const {email: me} = useAuth();
    const navigate = useNavigate();
    const updatesQ = useUpdates(org.id);
    const {data: counts} = useDeliveryCounts(org.id);
    const {data: lists = []} = useRecipientLists(org.id);
    const {create} = useUpdateMutations(org.id);

    const updates = updatesQ.data ?? [];
    const drafts = updates.filter((u) => u.status === "draft");
    const sent = updates.filter((u) => u.status !== "draft");

    const newUpdate = async () => {
        const remembered = lastUpdateList(org.id);
        const listId = lists.find((l) => l.id === remembered)?.id ?? (lists.length === 1 ? lists[0].id : null);
        const u = await create.mutateAsync({...starterUpdate(org.name), list_id: listId});
        navigate(`/o/${org.id}/updates/${u.id}`);
    };

    return (
        <AppShell
            title="Investor updates"
            description={<span>Write updates, send them from your Gmail, and keep a record of every one.</span>}
            actions={canEdit && (
                <>
                    <GmailAccount/>
                    <Button onClick={newUpdate} disabled={create.isPending}>{create.isPending ? <Loader2 className="animate-spin"/> : <Plus/>}New update</Button>
                </>
            )}
        >
            {updatesQ.isError ? (
                <div className="flex flex-col items-start gap-3 rounded-xl border bg-card p-6">
                    <h2 className="text-lg font-semibold">Updates didn't load</h2>
                    <p className="text-muted-foreground">{(updatesQ.error as Error).message}</p>
                    <Button variant="outline" onClick={() => updatesQ.refetch()}><RefreshCw/>Try again</Button>
                </div>
            ) : updatesQ.isPending ? (
                <Skeleton className="h-64 rounded-xl"/>
            ) : updates.length === 0 ? (
                <div className="flex flex-col items-start gap-4 rounded-2xl border bg-card p-6 sm:p-10">
                    <Mail className="h-8 w-8 text-muted-foreground"/>
                    <h2 className="text-2xl font-bold tracking-[-0.02em]">Keep your investors in the loop</h2>
                    <p className="max-w-lg text-muted-foreground">
                        Put the people you report to in a recipient list, write the update here, and send it from your own Gmail.
                        Everyone gets a personal email, and every update you send is kept here with who received it.
                    </p>
                    {canEdit && (
                        <div className="flex flex-wrap gap-2">
                            {lists.length === 0 && <Button variant="outline" onClick={() => navigate(`/o/${org.id}/lists`)}><Users/>Create a recipient list</Button>}
                            <Button onClick={newUpdate} disabled={create.isPending}><Plus/>Write the first update</Button>
                        </div>
                    )}
                </div>
            ) : (
                <div className="flex flex-col gap-8">
                    {drafts.length > 0 && (
                        <section className="flex flex-col gap-2">
                            <h2 className="eyebrow">Drafts</h2>
                            <ul className="flex flex-col divide-y rounded-lg border bg-card">
                                {drafts.map((u) => (
                                    <li key={u.id}>
                                        <button type="button" onClick={() => navigate(`/o/${org.id}/updates/${u.id}`)}
                                                className="flex w-full flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 text-left hover:bg-sunken">
                                            <span className="min-w-0 font-medium [overflow-wrap:anywhere]">{subjectLabel(u.subject) || "Untitled update"}</span>
                                            <span className="text-xs text-muted-foreground">
                                                {authorLabel(u.author_email, me)} · edited {when(u.updated_at)}
                                            </span>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </section>
                    )}
                    <section className="flex flex-col gap-2">
                        <h2 className="eyebrow">Sent</h2>
                        {sent.length === 0 ? (
                            <p className="text-sm text-muted-foreground">Nothing sent yet.</p>
                        ) : (
                            <div className="rounded-lg border bg-card">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Update</TableHead>
                                            <TableHead className="hidden md:table-cell">From</TableHead>
                                            <TableHead>Delivered</TableHead>
                                            <TableHead className="hidden text-right sm:table-cell">Sent</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {sent.map((u) => {
                                            const c = counts?.get(u.id);
                                            return (
                                                <TableRow key={u.id} className="cursor-pointer" onClick={() => navigate(`/o/${org.id}/updates/${u.id}`)}>
                                                    <TableCell className="max-w-[360px]">
                                                        <span className="block font-medium [overflow-wrap:anywhere]">{subjectLabel(u.subject) || "Untitled update"}</span>
                                                        <span className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
                                                            <span className="sm:hidden">{when(u.sent_at)} · </span>{u.list_name ?? `from ${u.sender_email}`}
                                                        </span>
                                                    </TableCell>
                                                    <TableCell className="hidden text-muted-foreground md:table-cell [overflow-wrap:anywhere]">{u.sender_email}</TableCell>
                                                    <TableCell>
                                                        <span className="flex flex-wrap items-center gap-2">
                                                            {u.status !== "sent" && <UpdateStatusPill status={u.status}/>}
                                                            {c && <span className="tabular text-sm">{c.sent} / {c.total}</span>}
                                                        </span>
                                                    </TableCell>
                                                    <TableCell className="tabular hidden whitespace-nowrap text-right text-muted-foreground sm:table-cell">{when(u.sent_at)}</TableCell>
                                                </TableRow>
                                            );
                                        })}
                                    </TableBody>
                                </Table>
                            </div>
                        )}
                    </section>
                </div>
            )}
        </AppShell>
    );
}
