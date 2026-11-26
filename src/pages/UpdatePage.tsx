import {Link, useParams} from "react-router-dom";
import {ArrowLeft, RefreshCw} from "lucide-react";
import {useOrg} from "@/hooks/useOrg";
import {useUpdate} from "@/hooks/useUpdates";
import {useSendRunner} from "@/hooks/useSendRunner";
import {AppShell} from "@/components/AppShell";
import {Composer} from "@/components/updates/Composer";
import {SentUpdate} from "@/components/updates/SentUpdate";
import {UpdateStatusPill} from "@/components/updates/bits";
import {Button} from "@/components/ui/button";
import {Skeleton} from "@/components/ui/skeleton";
import {subjectLabel} from "@/lib/emailTemplate";

/** One update: the composer while it's a draft, the record of who got it once sent. */
export default function UpdatePage() {
    const {updateId} = useParams();
    const {org, canEdit} = useOrg();
    const q = useUpdate(org.id, updateId);
    const runner = useSendRunner(org.id);
    const update = q.data;
    const back = <Link to={`/o/${org.id}/updates`} className="inline-flex items-center gap-1 hover:text-foreground"><ArrowLeft className="h-3.5 w-3.5"/>All updates</Link>;

    if (q.isPending) {
        return <AppShell title="Investor update" description={back} wide><Skeleton className="h-[60svh] rounded-xl"/></AppShell>;
    }
    if (q.isError || !update) {
        return (
            <AppShell title="Update not found" description={back}>
                <div className="flex flex-col items-start gap-3 rounded-xl border bg-card p-6">
                    <p className="text-muted-foreground">{q.isError ? (q.error as Error).message : "It may have been deleted."}</p>
                    {q.isError && <Button variant="outline" onClick={() => q.refetch()}><RefreshCw/>Try again</Button>}
                </div>
            </AppShell>
        );
    }

    const composing = update.status === "draft" && canEdit && !runner.sending;
    return (
        <AppShell
            title={composing ? "Draft update" : subjectLabel(update.subject) || "Untitled update"}
            description={<>{back}{!composing && <UpdateStatusPill status={runner.sending ? "sending" : update.status}/>}</>}
            wide
        >
            {composing ? <Composer key={update.id} update={update} runner={runner}/> : <SentUpdate update={update} runner={runner}/>}
        </AppShell>
    );
}
