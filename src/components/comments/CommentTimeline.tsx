import {type KeyboardEvent, useMemo, useState} from "react";
import {Loader2, MoreHorizontal, Pencil, Trash2} from "lucide-react";
import {useAuth} from "@/hooks/useAuth";
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
import {authorLabel, dayLabel, groupTimeline, shortDate, type TimelineEntry, writtenOn, writtenOnOtherDay} from "@/lib/comments";
import {todayISO} from "@/lib/pipeline";
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

export interface CommentDraft {
    body: string;
    occurredOn: string;
}

interface CommentTimelineProps<T extends TimelineEntry> {
    entries: T[];
    isLoading: boolean;
    isError: boolean;
    onRetry: () => void;
    canAdd: boolean;
    /** Shared pipelines show who wrote each comment; a private list doesn't need to. */
    showAuthors: boolean;
    canChange: (entry: T) => boolean;
    canDelete: (entry: T) => boolean;
    onAdd: (draft: CommentDraft) => Promise<unknown>;
    onUpdate: (entry: T, draft: CommentDraft) => Promise<unknown>;
    onDelete: (entry: T) => void;
    deleteDescription: string;
    emptyText: string;
}

export function CommentTimeline<T extends TimelineEntry>(props: CommentTimelineProps<T>) {
    const {entries, isLoading, isError, onRetry, canAdd, emptyText} = props;
    const [showHistory, setShowHistory] = useState(readShowHistory);
    const days = useMemo(() => groupTimeline(entries, {includeHistory: showHistory}), [entries, showHistory]);
    const count = entries.filter((a) => a.kind === "note").length;
    const historyCount = entries.length - count;

    const toggleHistory = (v: boolean) => {
        setShowHistory(v);
        try {
            localStorage.setItem(HISTORY_KEY, v ? "1" : "0");
        } catch { /* storage unavailable */
        }
    };

    return (
        <div className="flex flex-col gap-6">
            {canAdd && <Composer onAdd={props.onAdd}/>}

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
                    <Button size="sm" variant="outline" onClick={onRetry}>Try again</Button>
                </div>
            ) : days.length === 0 ? (
                <p className="text-sm text-muted-foreground">{emptyText}</p>
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
                                    ? <CommentItem key={entry.id} entry={entry} {...props}/>
                                    : <HistoryItem key={entry.id} entry={entry}/>)}
                            </ul>
                        </li>
                    ))}
                </ol>
            )}
        </div>
    );
}

function Composer({onAdd}: {onAdd: (draft: CommentDraft) => Promise<unknown>}) {
    const [body, setBody] = useState("");
    const [date, setDate] = useState(todayISO);
    const [pending, setPending] = useState(false);

    const submit = async () => {
        const text = body.trim();
        if (!text || pending) return;
        setPending(true);
        try {
            await onAdd({body: text, occurredOn: date || todayISO()});
            setBody("");
            setDate(todayISO());
        } catch { /* the mutation shows the error */
        } finally {
            setPending(false);
        }
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
                    <Button type="button" size="sm" onClick={submit} disabled={!body.trim() || pending}>
                        {pending && <Loader2 className="animate-spin"/>}Post comment
                    </Button>
                </div>
            </div>
        </div>
    );
}

function CommentItem<T extends TimelineEntry>({entry, showAuthors, canChange: canChangeFn, canDelete: canDeleteFn, onUpdate, onDelete, deleteDescription}: CommentTimelineProps<T> & {entry: T}) {
    const {email} = useAuth();
    const [editing, setEditing] = useState(false);
    const [body, setBody] = useState(entry.body);
    const [date, setDate] = useState(entry.occurred_on);
    const [saving, setSaving] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const canChange = canChangeFn(entry);
    const canDelete = canDeleteFn(entry);
    const mine = Boolean(email && entry.author_email === email);

    const startEdit = () => {
        setBody(entry.body);
        setDate(entry.occurred_on);
        setEditing(true);
    };
    const save = async () => {
        const text = body.trim();
        if (!text || saving) return;
        setSaving(true);
        try {
            await onUpdate(entry, {body: text, occurredOn: date || entry.occurred_on});
            setEditing(false);
        } catch { /* the mutation shows the error */
        } finally {
            setSaving(false);
        }
    };

    const meta = (
        <>
            {writtenOnOtherDay(entry) && (
                <span className="text-xs text-muted-foreground" title="The comment is dated to the day it happened">
                    written {shortDate(writtenOn(entry))}
                </span>
            )}
            {entry.edited_at && <span className="text-xs text-muted-foreground" title={new Date(entry.edited_at).toLocaleString()}>edited</span>}
        </>
    );

    return (
        <li className="group flex gap-3">
            {showAuthors && <Avatar email={entry.author_email ?? null} mine={mine}/>}
            <div className="min-w-0 flex-1">
                {(showAuthors || writtenOnOtherDay(entry) || entry.edited_at) && (
                    <p className="flex min-h-5 min-w-0 flex-wrap items-baseline gap-x-2 text-[13px]">
                        {showAuthors && <span className="font-semibold" title={entry.author_email ?? undefined}>{authorLabel(entry.author_email, email)}</span>}
                        {meta}
                    </p>
                )}

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
                                <Button size="sm" onClick={save} disabled={!body.trim() || saving}>
                                    {saving && <Loader2 className="animate-spin"/>}Save
                                </Button>
                            </div>
                        </div>
                    </div>
                ) : (
                    <p className="mt-0.5 whitespace-pre-wrap text-sm leading-relaxed [overflow-wrap:anywhere]">{entry.body}</p>
                )}
            </div>

            {(canChange || canDelete) && !editing && (
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label="Comment actions"
                                className="-mt-1 h-7 w-7 shrink-0 text-muted-foreground opacity-60 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100">
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

            <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete this comment?</AlertDialogTitle>
                        <AlertDialogDescription>{deleteDescription}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Keep</AlertDialogCancel>
                        <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => onDelete(entry)}>
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </li>
    );
}

function HistoryItem({entry}: {entry: TimelineEntry}) {
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
