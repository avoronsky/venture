import {AlertTriangle, CheckCircle2, Loader2, LogOut, Mail, Pencil, XCircle} from "lucide-react";
import {useGmail} from "@/hooks/useGmail";
import {Button} from "@/components/ui/button";
import type {UpdateStatus} from "@/lib/types";
import {cn} from "@/lib/utils";

const STATUS: Record<UpdateStatus, {label: string; className: string; icon: typeof Mail}> = {
    draft: {label: "Draft", className: "bg-sunken text-muted-foreground", icon: Pencil},
    sending: {label: "Sending", className: "bg-highlight-soft text-foreground", icon: Loader2},
    sent: {label: "Sent", className: "bg-highlight text-highlight-foreground", icon: CheckCircle2},
    partial: {label: "Partly sent", className: "bg-warning-soft text-warning", icon: AlertTriangle},
    failed: {label: "Not sent", className: "bg-destructive-soft text-destructive", icon: XCircle},
};

export function UpdateStatusPill({status}: {status: UpdateStatus}) {
    const s = STATUS[status];
    return (
        <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium", s.className)}>
            <s.icon className={cn("h-3 w-3", status === "sending" && "animate-spin")}/>{s.label}
        </span>
    );
}

/** Which Gmail account sends, with connect and disconnect. */
export function GmailAccount({compact = false}: {compact?: boolean}) {
    const {configured, sender, connecting, connect, disconnect} = useGmail();
    if (!configured) {
        return <span className="text-xs text-muted-foreground">Gmail sending isn't set up (VITE_GOOGLE_CLIENT_ID)</span>;
    }
    if (!sender) {
        return (
            <Button variant="outline" size="sm" onClick={() => connect()} disabled={connecting}>
                {connecting ? <Loader2 className="animate-spin"/> : <Mail/>}Connect Gmail
            </Button>
        );
    }
    return (
        <span className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground">
            <Mail className="h-3.5 w-3.5"/>
            {compact ? null : "Sending as "}<span className="font-medium text-foreground">{sender.email}</span>
            <button type="button" onClick={disconnect} title="Disconnect Gmail" aria-label="Disconnect Gmail"
                    className="grid h-6 w-6 place-items-center rounded-md hover:bg-sunken hover:text-foreground">
                <LogOut className="h-3.5 w-3.5"/>
            </button>
        </span>
    );
}

/** A thin progress bar for sending. */
export function SendProgressBar({done, total, failed, current}: {done: number; total: number; failed: number; current?: string}) {
    const pct = total ? Math.round((done / total) * 100) : 0;
    return (
        <div className="flex flex-col gap-2 rounded-lg border bg-card p-4" role="status" aria-live="polite">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="inline-flex items-center gap-2 font-medium"><Loader2 className="h-4 w-4 animate-spin"/>Sending {done} of {total}</span>
                {failed > 0 && <span className="text-destructive">{failed} failed</span>}
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-sunken">
                <div className="h-full bg-foreground transition-[width] duration-300" style={{width: `${pct}%`}}/>
            </div>
            {current && <span className="truncate text-xs text-muted-foreground">To {current}. Keep this tab open until it's done.</span>}
        </div>
    );
}
