import {type ReactNode, useMemo, useState} from "react";
import {useNavigate} from "react-router-dom";
import {CheckCircle2, Copy, Loader2, Monitor, RotateCw, Smartphone, Trash2, XCircle} from "lucide-react";
import {useOrg} from "@/hooks/useOrg";
import {useGmail} from "@/hooks/useGmail";
import {useDeliveries, useUpdateMutations} from "@/hooks/useUpdates";
import type {SendRunner} from "@/hooks/useSendRunner";
import {EmailPreview, Segmented} from "@/components/updates/EmailFrame";
import {GmailAccount, SendProgressBar} from "@/components/updates/bits";
import {when} from "@/lib/when";
import {Button} from "@/components/ui/button";
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "@/components/ui/select";
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from "@/components/ui/table";
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
import {type RecipientFields, renderTemplate} from "@/lib/emailTemplate";
import type {InvestorUpdate, UpdateDelivery} from "@/lib/types";
import {cn} from "@/lib/utils";

const SAMPLE: RecipientFields = {email: "ann@example.com", name: "Ann Lee", firm: "Example Capital"};

/** A sent update (or a draft a viewer opens): who got it, and exactly what they got. */
export function SentUpdate({update, runner}: {update: InvestorUpdate; runner: SendRunner}) {
    const {org, canEdit, isOwner} = useOrg();
    const navigate = useNavigate();
    const gmail = useGmail();
    const unsentDraft = update.status === "draft" && !runner.sending;
    const {data: deliveries = [], isPending} = useDeliveries(org.id, unsentDraft ? undefined : update.id);
    const {create, remove} = useUpdateMutations(org.id);
    const [previewEmail, setPreviewEmail] = useState<string | null>(null);
    const [width, setWidth] = useState<"desktop" | "mobile">("desktop");
    const [confirmDelete, setConfirmDelete] = useState(false);

    const previewAs: RecipientFields = deliveries.find((d) => d.email === previewEmail) ?? deliveries[0] ?? SAMPLE;
    const html = useMemo(() => renderTemplate(update.body_html, previewAs, {html: true}), [update.body_html, previewAs]);
    const unsent = deliveries.filter((d) => d.status !== "sent");
    const interrupted = update.status === "sending" && !runner.sending;

    const retry = async () => {
        const sender = await gmail.ensure(15 * 60_000);
        if (!sender) return;
        if (sender.email !== update.sender_email) {
            // Keep one update coming from one address.
            const ok = window.confirm(`This update was sent from ${update.sender_email}. Send the rest from ${sender.email}?`);
            if (!ok) return;
        }
        await runner.run(update, sender);
    };

    const duplicate = async () => {
        const u = await create.mutateAsync({subject: update.subject, body_html: update.body_html, list_id: update.list_id});
        navigate(`/o/${org.id}/updates/${u.id}`);
    };

    return (
        <div className="flex flex-col gap-6">
            {runner.progress && <SendProgressBar {...runner.progress}/>}

            {!runner.progress && canEdit && update.status !== "draft" && (unsent.length > 0 || interrupted) && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning/40 bg-warning-soft px-4 py-3">
                    <span className="text-sm">
                        {interrupted ? "Sending stopped before it finished. " : ""}
                        {unsent.length} {unsent.length === 1 ? "person hasn't" : "people haven't"} received it yet.
                    </span>
                    <span className="flex flex-wrap items-center gap-2">
                        <GmailAccount compact/>
                        <Button size="sm" onClick={retry} disabled={!gmail.configured || gmail.connecting}><RotateCw/>Retry {unsent.length}</Button>
                    </span>
                </div>
            )}

            <dl className="grid gap-x-6 gap-y-3 rounded-lg border bg-card p-4 text-sm sm:grid-cols-4">
                <Fact label="To">{update.list_name ?? "—"}</Fact>
                <Fact label="From">{update.sender_email ?? "—"}</Fact>
                <Fact label="Sent">{when(update.sent_at) || "Not yet"}</Fact>
                <Fact label="Written by">{update.author_email ?? "—"}</Fact>
            </dl>

            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
                <section className="flex min-w-0 flex-col gap-2" aria-label="Recipients">
                    <h2 className="eyebrow flex h-8 items-center">
                        Recipients{deliveries.length > 0 && ` · ${deliveries.length - unsent.length} of ${deliveries.length} delivered`}
                    </h2>
                    {unsentDraft ? (
                        <p className="text-sm text-muted-foreground">This draft hasn't been sent.</p>
                    ) : isPending ? (
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground"/>
                    ) : (
                        <div className="max-h-[68svh] overflow-y-auto rounded-lg border bg-card">
                            <Table>
                                <TableHeader>
                                    <TableRow><TableHead>Person</TableHead><TableHead className="text-right">Status</TableHead></TableRow>
                                </TableHeader>
                                <TableBody>
                                    {deliveries.map((d) => (
                                        <TableRow key={d.id} className={cn("cursor-pointer", d.email === previewAs.email && "bg-sunken")}
                                                  onClick={() => setPreviewEmail(d.email)} title="Show the email this person got">
                                            <TableCell>
                                                <span className="block [overflow-wrap:anywhere]">{d.name || d.email}</span>
                                                <span className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
                                                    {d.name ? d.email : ""}{d.name && d.firm ? " · " : ""}{d.firm}
                                                </span>
                                            </TableCell>
                                            <TableCell className="text-right align-top"><DeliveryStatus d={d}/></TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </section>

                <section className="flex min-w-0 flex-col gap-2" aria-label="Email">
                    <div className="flex h-8 items-center justify-between gap-2">
                        {deliveries.length > 0 ? (
                            <Select value={previewAs.email} onValueChange={setPreviewEmail}>
                                <SelectTrigger className="h-8 w-auto max-w-[60%] gap-1.5 text-[13px]" aria-label="Show as received by">
                                    <span className="text-muted-foreground">As</span><SelectValue/>
                                </SelectTrigger>
                                <SelectContent>
                                    {deliveries.map((d) => <SelectItem key={d.id} value={d.email}>{d.name || d.email}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        ) : <span className="text-[13px] text-muted-foreground">As a sample recipient</span>}
                        <Segmented label="Preview width" value={width} onChange={setWidth}
                                   options={[{value: "desktop", label: <Monitor/>, title: "Desktop"}, {value: "mobile", label: <Smartphone/>, title: "Phone"}]}/>
                    </div>
                    <div className="flex h-[68svh] min-h-[420px] flex-col overflow-hidden rounded-lg border">
                        <div className="border-b bg-card px-3 py-2 text-[13px]">
                            <span className="text-muted-foreground">Subject: </span>
                            <span className="font-medium">{renderTemplate(update.subject, previewAs)}</span>
                        </div>
                        <EmailPreview html={html} narrow={width === "mobile"} className="min-h-0 flex-1 rounded-none border-0"/>
                    </div>
                </section>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
                {isOwner && update.status !== "draft" ? (
                    <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setConfirmDelete(true)}><Trash2/>Delete from history</Button>
                ) : <span/>}
                {canEdit && (
                    <Button variant="outline" onClick={duplicate} disabled={create.isPending}
                            title="A new draft with this subject, text and list, to edit for the next update">
                        {create.isPending ? <Loader2 className="animate-spin"/> : <Copy/>}Start the next update from this one
                    </Button>
                )}
            </div>

            <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete this update from the history?</AlertDialogTitle>
                        <AlertDialogDescription>
                            The emails were already delivered and stay in people's inboxes and your Gmail Sent folder.
                            This only removes the record here, for everyone in {org.name}.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={async () => {
                            await remove.mutateAsync(update.id);
                            navigate(`/o/${org.id}/updates`, {replace: true});
                        }}>Delete</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}

function Fact({label, children}: {label: string; children: ReactNode}) {
    return (
        <div className="min-w-0">
            <dt className="eyebrow">{label}</dt>
            <dd className="[overflow-wrap:anywhere]">{children}</dd>
        </div>
    );
}

function DeliveryStatus({d}: {d: UpdateDelivery}) {
    if (d.status === "sent") {
        return <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs text-muted-foreground"><CheckCircle2 className="h-3.5 w-3.5 text-success"/>{when(d.sent_at)}</span>;
    }
    if (d.status === "pending") return <span className="text-xs text-muted-foreground">Waiting</span>;
    return (
        <span className="inline-flex max-w-[220px] flex-col items-end gap-0.5 text-xs">
            <span className="inline-flex items-center gap-1 font-medium text-destructive"><XCircle className="h-3.5 w-3.5"/>Not sent</span>
            {d.error && <span className="text-muted-foreground [overflow-wrap:anywhere]">{d.error}</span>}
        </span>
    );
}
