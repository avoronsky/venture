import {type KeyboardEvent, useMemo, useState} from "react";
import {Loader2, MoreHorizontal, Pencil, Trash2} from "lucide-react";
import {useAuth} from "@/hooks/useAuth";
import {useOrg} from "@/hooks/useOrg";
import {useActivity, useAddComment, useDeleteComment, useUpdateComment} from "@/hooks/usePipeline";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {Textarea} from "@/components/ui/textarea";
import {Checkbox} from "@/components/ui/checkbox";
import {Skeleton} from "@/components/ui/skeleton";
import {DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger} from "@/components/ui/dropdown-menu";
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
import {authorLabel, dayLabel, groupTimeline, shortDate, writtenOn, writtenOnOtherDay} from "@/lib/comments";
import {todayISO} from "@/lib/pipeline";
import type {Activity} from "@/lib/types";
import {cn} from "@/lib/utils";

const HISTORY_KEY = "venture.comments.showHistory";

function readShowHistory(): boolean {
    try {
        return localStorage.getItem(HISTORY_KEY) !== "0";
    } catch {
        return true;
    }
}

/** Submit on Cmd/Ctrl+Enter, the usual shortcut for multi-line comment boxes. */
function submitOnModEnter(e: KeyboardEvent, submit: () => void) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        submit();
    }
}

export function InvestorComments({investorId}: {investorId: string}) {
    const {org, canEdit} = useOrg();
    const {data = [], isLoading, isError, refetch} = useActivity(org.id, investorId);
    const [showHistory, setShowHistory] = useState(readShowHistory);
    const days = useMemo(() => groupTimeline(data, {includeHistory: showHistory}), [data, showHistory]);
    const count = data.filter((a) => a.kind === "note").length;
    const historyCount = data.length - count;

    const toggleHistory = (v: boolean) => {
        setShowHistory(v);
        try {
            localStorage.setItem(HISTORY_KEY, v ? "1" : "0");
        } catch { /* storage unavailable */
        }
    };

    return (
        <div className="flex flex-col gap-6">
            {canEdit && <Composer investorId={investorId}/>}

            <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold">
                    {count === 0 ? "No comments yet" : `${count} comment${count === 1 ? "" : "s"}`}
                </h3>
                {historyCount > 0 && (
                    <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
                        <Checkbox checked={showHistory} onCheckedChange={(c) => toggleHistory(c === true)}/>
                        Show stage changes
                    </label>
                )}
            </div>

            {isLoading ? (
                <div className="flex flex-col gap-3"><Skeleton className="h-16"/><Skeleton className="h-16"/></div>
            ) : isError ? (
                <div className="flex items-center justify-between gap-3 rounded-lg bg-destructive-soft px-3 py-2 text-sm text-destructive">
                    Comments didn't load.
                    <Button size="sm" variant="outline" onClick={() => refetch()}>Try again</Button>
                </div>
            ) : days.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                    {canEdit ? "Add notes from calls, emails and meetings. Each one is dated, so you can see how the conversation went over time."
                        : "Nobody has commented on this investor yet."}
                </p>
            ) : (
                <ol className="flex flex-col gap-6">
                    {days.map((day) => (
                        <li key={day.date} className="flex flex-col gap-3">
                            <div className="flex items-center gap-3">
                                <span className="text-xs font-semibold text-muted-foreground">{dayLabel(day.date)}</span>
                                <span className="h-px flex-1 bg-border"/>
                            </div>
                            <ul className="flex flex-col gap-3">
                                {day.entries.map((entry) => entry.kind === "note"
                                    ? <CommentItem key={entry.id} entry={entry}/>
                                    : <HistoryItem key={entry.id} entry={entry}/>)}
                            </ul>
                        </li>
                    ))}
                </ol>
            )}
        </div>
    );
}

function Composer({investorId}: {investorId: string}) {
    const {org} = useOrg();
    const add = useAddComment(org.id);
    const [body, setBody] = useState("");
    const [date, setDate] = useState(todayISO);

    const submit = async () => {
        const text = body.trim();
        if (!text || add.isPending) return;
        await add.mutateAsync({investorId, body: text, occurredOn: date || todayISO()});
        setBody("");
        setDate(todayISO());
    };

    return (
        <div className="flex flex-col gap-2 rounded-xl border bg-card p-3 focus-within:border-foreground/30">
            <Label htmlFor="new-comment" className="sr-only">New comment</Label>
            <Textarea id="new-comment" rows={3} value={body} maxLength={10000}
                      onChange={(e) => setBody(e.target.value)} onKeyDown={(e) => submitOnModEnter(e, submit)}
                      placeholder="What happened? Call notes, questions they asked, what you promised to send…"
                      className="min-h-[76px] resize-y border-0 bg-transparent p-1 focus-visible:ring-0"/>
            <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
                    Date
                    <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Comment date"
                           className="h-8 w-[150px] px-2 text-[13px]"/>
                </label>
                <div className="flex items-center gap-3">
                    <span className="hidden text-xs text-muted-foreground sm:inline">Ctrl + Enter to post</span>
                    <Button type="button" size="sm" onClick={submit} disabled={!body.trim() || add.isPending}>
                        {add.isPending && <Loader2 className="animate-spin"/>}Post comment
                    </Button>
                </div>
            </div>
        </div>
    );
}

function CommentItem({entry}: {entry: Activity}) {
    const {email} = useAuth();
    const {org, canEdit, isOwner} = useOrg();
    const update = useUpdateComment(org.id);
    const del = useDeleteComment(org.id);
    const [editing, setEditing] = useState(false);
    const [body, setBody] = useState(entry.body);
    const [date, setDate] = useState(entry.occurred_on);
    const [confirmDelete, setConfirmDelete] = useState(false);

    const mine = Boolean(email && entry.author_email === email);
    const canChange = mine && canEdit;
    const canDelete = canChange || isOwner;

    const startEdit = () => {
        setBody(entry.body);
        setDate(entry.occurred_on);
        setEditing(true);
    };
    const save = async () => {
        const text = body.trim();
        if (!text) return;
        await update.mutateAsync({id: entry.id, investorId: entry.investor_id, body: text, occurredOn: date || entry.occurred_on});
        setEditing(false);
    };

    return (
        <li className="group flex gap-3">
            <Avatar email={entry.author_email} mine={mine}/>
            <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                    <p className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-[13px]">
                        <span className="font-semibold" title={entry.author_email ?? undefined}>{authorLabel(entry.author_email, email)}</span>
                        {writtenOnOtherDay(entry) && (
                            <span className="text-xs text-muted-foreground" title="The comment is dated to the day it happened">
                                written {shortDate(writtenOn(entry))}
                            </span>
                        )}
                        {entry.edited_at && <span className="text-xs text-muted-foreground" title={new Date(entry.edited_at).toLocaleString()}>edited</span>}
                    </p>
                    {(canChange || canDelete) && !editing && (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" aria-label="Comment actions"
                                        className="h-7 w-7 shrink-0 text-muted-foreground opacity-60 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100">
                                    <MoreHorizontal className="h-4 w-4"/>
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                {canChange && <DropdownMenuItem onSelect={startEdit}><Pencil className="mr-2 h-4 w-4"/>Edit</DropdownMenuItem>}
                                {canDelete && (
                                    <DropdownMenuItem onSelect={() => setConfirmDelete(true)} className="text-destructive focus:text-destructive">
                                        <Trash2 className="mr-2 h-4 w-4"/>Delete
                                    </DropdownMenuItem>
                                )}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    )}
                </div>

                {editing ? (
                    <div className="mt-1.5 flex flex-col gap-2">
                        <Textarea autoFocus rows={3} value={body} maxLength={10000} onChange={(e) => setBody(e.target.value)}
                                  onKeyDown={(e) => {
                                      submitOnModEnter(e, save);
                                      if (e.key === "Escape") {
                                          e.stopPropagation();
                                          setEditing(false);
                                      }
                                  }}/>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Comment date" className="h-8 w-[150px] px-2 text-[13px]"/>
                            <div className="flex gap-2">
                                <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
                                <Button size="sm" onClick={save} disabled={!body.trim() || update.isPending}>
                                    {update.isPending && <Loader2 className="animate-spin"/>}Save
                                </Button>
                            </div>
                        </div>
                    </div>
                ) : (
                    <p className="mt-0.5 whitespace-pre-wrap text-sm leading-relaxed [overflow-wrap:anywhere]">{entry.body}</p>
                )}
            </div>

            <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete this comment?</AlertDialogTitle>
                        <AlertDialogDescription>It's removed for everyone in {org.name}. This can't be undone.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Keep</AlertDialogCancel>
                        <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                           onClick={() => del.mutate({id: entry.id, investorId: entry.investor_id})}>
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </li>
    );
}

function HistoryItem({entry}: {entry: Activity}) {
    const {email} = useAuth();
    return (
        <li className="flex items-center gap-3 text-[13px] text-muted-foreground">
            <span className="grid w-7 shrink-0 place-items-center">
                <span className={cn("h-1.5 w-1.5 rounded-full", entry.kind === "stage" ? "bg-foreground/60" : "bg-muted-foreground/50")}/>
            </span>
            <span className="min-w-0">
                {entry.body.replace(" · ", ": ")}
                {entry.author_email && <span>, by {authorLabel(entry.author_email, email).replace(/^You$/, "you")}</span>}
            </span>
        </li>
    );
}

function Avatar({email, mine}: {email: string | null; mine: boolean}) {
    const initial = (email ?? "?").charAt(0).toUpperCase();
    return (
        <span aria-hidden="true"
              className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-semibold",
                  mine ? "bg-foreground text-background" : "bg-sunken text-foreground")}>
            {initial}
        </span>
    );
}
