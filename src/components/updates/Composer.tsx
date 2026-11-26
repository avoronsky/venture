import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {Link, useNavigate} from "react-router-dom";
import {AlertTriangle, Braces, Check, Code2, Eye, FlaskConical, Loader2, Monitor, PenLine, Send, Smartphone, Trash2} from "lucide-react";
import {toast} from "sonner";
import {useOrg} from "@/hooks/useOrg";
import {useGmail} from "@/hooks/useGmail";
import {rememberUpdateList, useListMembers, useRecipientLists, useUpdateMutations} from "@/hooks/useUpdates";
import type {SendRunner} from "@/hooks/useSendRunner";
import {EmailPreview, Segmented, VisualEditor} from "@/components/updates/EmailFrame";
import {GmailAccount, SendProgressBar} from "@/components/updates/bits";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {Textarea} from "@/components/ui/textarea";
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "@/components/ui/select";
import {DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger} from "@/components/ui/dropdown-menu";
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
import {blankPlaceholders, PLACEHOLDERS, type RecipientFields, renderTemplate, unknownPlaceholders} from "@/lib/emailTemplate";
import {sendGmail} from "@/lib/gmail";
import type {InvestorUpdate} from "@/lib/types";
import {cn} from "@/lib/utils";

const SAMPLE: RecipientFields = {email: "ann@example.com", name: "Ann Lee", firm: "Example Capital"};
const NO_LIST = "none";

type Saved = Pick<InvestorUpdate, "subject" | "body_html" | "list_id">;

/** Writing a draft: recipients, subject, body (visual or HTML), a live personalized preview, test and send. */
export function Composer({update, runner}: {update: InvestorUpdate; runner: SendRunner}) {
    const {org} = useOrg();
    const navigate = useNavigate();
    const gmail = useGmail();
    const {data: lists = []} = useRecipientLists(org.id);
    const {data: membersByList} = useListMembers(org.id);
    const {saveDraft, remove} = useUpdateMutations(org.id);

    const [subject, setSubject] = useState(update.subject);
    const [html, setHtml] = useState(update.body_html);
    const [listId, setListId] = useState<string | null>(update.list_id);
    const [mode, setMode] = useState<"visual" | "html">("visual");
    // Bumped when the HTML tab changes the source, so the visual editor reloads it.
    const [visualKey, setVisualKey] = useState(0);
    const [width, setWidth] = useState<"desktop" | "mobile">("desktop");
    const [pane, setPane] = useState<"edit" | "preview">("edit");
    const [previewEmail, setPreviewEmail] = useState<string | null>(null);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [testing, setTesting] = useState(false);

    /* ---- autosave ---- */
    const saved = useRef<Saved>({subject: update.subject, body_html: update.body_html, list_id: update.list_id});
    const [saveState, setSaveState] = useState<"saved" | "dirty" | "saving">("saved");
    const current = useMemo<Saved>(() => ({subject, body_html: html, list_id: listId}), [subject, html, listId]);
    const changes = useCallback((): Partial<Saved> => {
        const c: Partial<Saved> = {};
        if (current.subject !== saved.current.subject) c.subject = current.subject;
        if (current.body_html !== saved.current.body_html) c.body_html = current.body_html;
        if (current.list_id !== saved.current.list_id) c.list_id = current.list_id;
        return c;
    }, [current]);

    const save = useCallback(async () => {
        const c = changes();
        if (!Object.keys(c).length) return true;
        setSaveState("saving");
        try {
            await saveDraft.mutateAsync({id: update.id, values: c});
            saved.current = {...saved.current, ...c};
            setSaveState(Object.keys(changes()).length ? "dirty" : "saved");
            return true;
        } catch {
            setSaveState("dirty");
            return false;
        }
    }, [changes, saveDraft, update.id]);

    useEffect(() => {
        if (!Object.keys(changes()).length) return;
        setSaveState("dirty");
        const t = window.setTimeout(save, 900);
        return () => window.clearTimeout(t);
    }, [changes, save]);

    // Unsaved typing when leaving the page.
    const saveRef = useRef(save);
    useEffect(() => {
        saveRef.current = save;
    }, [save]);
    useEffect(() => () => void saveRef.current(), []);

    /* ---- recipients and preview ---- */
    const list = lists.find((l) => l.id === listId);
    const members = useMemo(() => (listId ? membersByList?.get(listId) ?? [] : []), [listId, membersByList]);
    const previewAs: RecipientFields = members.find((m) => m.email === previewEmail) ?? members[0] ?? SAMPLE;
    const renderedSubject = renderTemplate(subject, previewAs);
    const renderedHtml = useMemo(() => renderTemplate(html, previewAs, {html: true}), [html, previewAs]);

    const unknown = unknownPlaceholders(subject, html);
    const blanks = members.length ? blankPlaceholders(`${subject}\n${html}`, members) : [];
    const problems: string[] = [];
    if (!subject.trim()) problems.push("Add a subject.");
    if (!html.trim()) problems.push("Write the update.");
    if (!list) problems.push("Choose who gets it.");
    else if (!members.length) problems.push(`${list.name} has nobody on it yet.`);

    const switchMode = (m: "visual" | "html") => {
        if (m === "visual") setVisualKey((k) => k + 1);
        setMode(m);
    };

    const sendTest = async () => {
        setTesting(true);
        try {
            const sender = await gmail.ensure();
            if (!sender) return;
            await sendGmail(sender, {to: {email: sender.email, name: sender.name}, subject: `[Test] ${renderedSubject}`, html: renderedHtml});
            toast.success(`Test sent to ${sender.email}`, {description: `Personalized for ${previewAs.name || previewAs.email}.`});
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "The test didn't send.");
        } finally {
            setTesting(false);
        }
    };

    // Connect Gmail on the click itself (browsers block Google's popup later), then confirm.
    const askToSend = async () => {
        if (await gmail.ensure(15 * 60_000)) setConfirmOpen(true);
    };

    const send = async () => {
        setConfirmOpen(false);
        const sender = gmail.sender;
        if (!sender) return;
        if (!(await save())) return;
        rememberUpdateList(org.id, listId);
        await runner.run({id: update.id, subject, body_html: html}, sender);
    };

    const placeholderMenu = (insert: (text: string) => void, label = "Personalize") => (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm"><Braces/>{label}</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                    Filled in for each person. Text after | is used when it's empty.
                </DropdownMenuLabel>
                {PLACEHOLDERS.map((p) => (
                    <DropdownMenuItem key={p.key} onSelect={() => insert(p.example)} className="flex justify-between gap-3">
                        <span>{p.label}</span><code className="text-xs text-muted-foreground">{p.example}</code>
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );

    const htmlArea = useRef<HTMLTextAreaElement>(null);
    const insertIntoHtml = (text: string) => {
        const el = htmlArea.current;
        if (!el) return setHtml((h) => h + text);
        const {selectionStart: a, selectionEnd: b} = el;
        setHtml(el.value.slice(0, a) + text + el.value.slice(b));
        requestAnimationFrame(() => {
            el.focus();
            el.setSelectionRange(a + text.length, a + text.length);
        });
    };

    return (
        <div className="flex flex-col gap-5">
            {/* Recipients and subject */}
            <div className="grid gap-4 rounded-lg border bg-card p-4 md:grid-cols-[minmax(0,280px)_minmax(0,1fr)]">
                <div className="flex flex-col gap-1.5">
                    <Label htmlFor="update-list" className="text-xs text-muted-foreground">To</Label>
                    <Select value={listId ?? NO_LIST} onValueChange={(v) => setListId(v === NO_LIST ? null : v)}>
                        <SelectTrigger id="update-list"><SelectValue placeholder="Choose a list"/></SelectTrigger>
                        <SelectContent>
                            <SelectItem value={NO_LIST} disabled>Choose a list</SelectItem>
                            {lists.map((l) => (
                                <SelectItem key={l.id} value={l.id}>{l.name} · {membersByList?.get(l.id)?.length ?? 0}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <span className="text-xs text-muted-foreground">
                        {list ? `${members.length} ${members.length === 1 ? "person" : "people"}, one email each. ` : lists.length ? "" : "No lists yet. "}
                        <Link to={`/o/${org.id}/lists${listId ? `/${listId}` : ""}`} className="underline underline-offset-2 hover:text-foreground">
                            {lists.length ? "Edit lists" : "Create one"}
                        </Link>
                    </span>
                </div>
                <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between">
                        <Label htmlFor="update-subject" className="text-xs text-muted-foreground">Subject</Label>
                        {placeholderMenu((t) => setSubject((s) => s + t), "Add name")}
                    </div>
                    <Input id="update-subject" value={subject} maxLength={300} onChange={(e) => setSubject(e.target.value)}
                           placeholder="Investor update · November 2026"/>
                    {subject !== renderedSubject && <span className="truncate text-xs text-muted-foreground">Arrives as: {renderedSubject}</span>}
                </div>
            </div>

            {/* Small screens: one pane at a time */}
            <div className="lg:hidden">
                <Segmented label="Show" value={pane} onChange={setPane}
                           options={[{value: "edit", label: <><PenLine/>Write</>}, {value: "preview", label: <><Eye/>Preview</>}]}/>
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
                {/* Editor */}
                <section className={cn("flex min-w-0 flex-col gap-2", pane !== "edit" && "hidden lg:flex")} aria-label="Editor">
                    <div className="flex h-8 items-center justify-between gap-2">
                        <Segmented label="Editor" value={mode} onChange={switchMode}
                                   options={[{value: "visual", label: <><PenLine/>Write</>, title: "Edit it the way it looks; paste from Google Docs or Word"},
                                       {value: "html", label: <><Code2/>HTML</>, title: "Edit the HTML source"}]}/>
                        <SaveIndicator state={saveState}/>
                    </div>
                    {mode === "visual" ? (
                        <VisualEditor key={`${update.id}:${visualKey}`} initialHtml={html} onChange={setHtml} className="h-[68svh] min-h-[420px]"
                                      toolbarExtra={(insert) => placeholderMenu(insert)}/>
                    ) : (
                        <div className="flex h-[68svh] min-h-[420px] flex-col overflow-hidden rounded-lg border">
                            <div className="flex items-center justify-end border-b bg-card px-1.5 py-1">{placeholderMenu(insertIntoHtml)}</div>
                            <Textarea ref={htmlArea} value={html} onChange={(e) => setHtml(e.target.value)} spellCheck={false}
                                      aria-label="HTML source"
                                      className="min-h-0 flex-1 resize-none rounded-none border-0 font-mono text-[12.5px] leading-relaxed shadow-none focus-visible:ring-0"/>
                        </div>
                    )}
                </section>

                {/* Preview */}
                <section className={cn("flex min-w-0 flex-col gap-2", pane !== "preview" && "hidden lg:flex")} aria-label="Preview">
                    <div className="flex h-8 items-center justify-between gap-2">
                        {members.length > 0 ? (
                            <Select value={previewAs.email} onValueChange={setPreviewEmail}>
                                <SelectTrigger className="h-8 w-auto max-w-[60%] gap-1.5 text-[13px]" aria-label="Preview as">
                                    <span className="text-muted-foreground">As</span><SelectValue/>
                                </SelectTrigger>
                                <SelectContent>
                                    {members.map((m) => <SelectItem key={m.id} value={m.email}>{m.name || m.email}{m.firm && ` · ${m.firm}`}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        ) : <span className="text-[13px] text-muted-foreground">As a sample recipient</span>}
                        <Segmented label="Preview width" value={width} onChange={setWidth}
                                   options={[{value: "desktop", label: <Monitor/>, title: "Desktop"}, {value: "mobile", label: <Smartphone/>, title: "Phone"}]}/>
                    </div>
                    <div className="flex h-[68svh] min-h-[420px] flex-col overflow-hidden rounded-lg border">
                        <div className="border-b bg-card px-3 py-2 text-[13px]">
                            <span className="text-muted-foreground">Subject: </span><span className="font-medium">{renderedSubject || "(no subject)"}</span>
                        </div>
                        <EmailPreview html={renderedHtml} narrow={width === "mobile"} className="min-h-0 flex-1 rounded-none border-0"/>
                    </div>
                </section>
            </div>

            {(unknown.length > 0 || blanks.length > 0) && (
                <div className="flex flex-col gap-1 rounded-lg border border-warning/40 bg-warning-soft px-4 py-3 text-sm">
                    {unknown.length > 0 && (
                        <span className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning"/>
                            {unknown.join(", ")} {unknown.length === 1 ? "isn't a" : "aren't"} known {unknown.length === 1 ? "field" : "fields"} and will be sent as written.
                        </span>
                    )}
                    {blanks.map((b) => (
                        <span key={b.placeholder} className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning"/>
                            {b.placeholder} is empty for {b.count} {b.count === 1 ? "person" : "people"} on the list. Add a fallback, like {b.placeholder.replace("}}", "|…}}")}.
                        </span>
                    ))}
                </div>
            )}

            {runner.progress ? (
                <SendProgressBar {...runner.progress}/>
            ) : (
                <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
                    <div className="flex flex-wrap items-center gap-2">
                        <DeleteDraft onConfirm={async () => {
                            await remove.mutateAsync(update.id);
                            navigate(`/o/${org.id}/updates`, {replace: true});
                        }}/>
                        <GmailAccount/>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        {problems.length > 0 && <span className="text-sm text-muted-foreground">{problems[0]}</span>}
                        <Button variant="outline" onClick={sendTest} disabled={!gmail.configured || testing || !html.trim()}
                                title="Send this version to your own inbox, personalized as in the preview">
                            {testing ? <Loader2 className="animate-spin"/> : <FlaskConical/>}Send me a test
                        </Button>
                        <Button onClick={askToSend} disabled={!gmail.configured || problems.length > 0 || gmail.connecting}>
                            <Send/>Send to {members.length || "…"}
                        </Button>
                    </div>
                </div>
            )}

            <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Send to {members.length} {members.length === 1 ? "person" : "people"}?</AlertDialogTitle>
                        <AlertDialogDescription asChild>
                            <div className="flex flex-col gap-2">
                                <span>
                                    <span className="font-medium text-foreground">{subject}</span> goes to everyone on{" "}
                                    <span className="font-medium text-foreground">{list?.name}</span>, each as their own email
                                    {gmail.sender ? <> from <span className="font-medium text-foreground">{gmail.sender.email}</span></> : " from your Gmail"}.
                                </span>
                                <span>After sending, the update can't be edited. It stays here with who received it. Keep this tab open until it finishes.</span>
                            </div>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={send}><Send className="h-4 w-4"/>Send now</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}

function SaveIndicator({state}: {state: "saved" | "dirty" | "saving"}) {
    return (
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground" aria-live="polite">
            {state === "saving" ? <><Loader2 className="h-3 w-3 animate-spin"/>Saving</>
                : state === "dirty" ? "Unsaved changes" : <><Check className="h-3 w-3"/>Saved</>}
        </span>
    );
}

function DeleteDraft({onConfirm}: {onConfirm: () => void}) {
    const [open, setOpen] = useState(false);
    return (
        <>
            <Button variant="ghost" size="icon" aria-label="Delete draft" title="Delete draft" className="text-destructive hover:text-destructive" onClick={() => setOpen(true)}>
                <Trash2/>
            </Button>
            <AlertDialog open={open} onOpenChange={setOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete this draft?</AlertDialogTitle>
                        <AlertDialogDescription>It hasn't been sent to anyone. This can't be undone.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={onConfirm}>Delete</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
