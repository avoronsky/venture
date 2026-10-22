import {useEffect} from "react";
import {Link, Navigate, Outlet, useParams} from "react-router-dom";
import {AlertCircle} from "lucide-react";
import {useOrg} from "@/hooks/useOrg";
import {defaultRound, lastRound, rememberRound, useRounds} from "@/hooks/useRounds";
import {RoundProvider} from "@/hooks/useCurrentRound";
import {supabase} from "@/lib/supabase";
import {useQuery} from "@tanstack/react-query";
import {AppShell} from "@/components/AppShell";
import {Button} from "@/components/ui/button";
import {FullPageSpinner} from "@/components/FullPageSpinner";
import {NewRoundForm} from "@/components/pipeline/NewRoundForm";

/** Resolves /o/:orgId/r/:roundId and provides the round to the pipeline. */
export function RoundRoute() {
    const {roundId} = useParams();
    const {org} = useOrg();
    const {data: rounds, isPending, isError, refetch} = useRounds(org.id);
    const round = rounds?.find((r) => r.id === roundId);

    useEffect(() => {
        if (round) rememberRound(org.id, round.id);
    }, [org.id, round]);

    if (isPending) return <FullPageSpinner/>;
    if (isError) {
        return (
            <AppShell title="Rounds didn't load">
                <Button variant="outline" onClick={() => refetch()}>Try again</Button>
            </AppShell>
        );
    }
    if (!round) {
        return (
            <AppShell title="Round not found" description={<span>It may have been deleted, or the link is out of date.</span>}>
                <Button asChild><Link to={`/o/${org.id}`}>Open the latest round</Link></Button>
            </AppShell>
        );
    }
    return <RoundProvider round={round}><Outlet/></RoundProvider>;
}

/** /o/:orgId opens the last-used round, or offers to create the first one. */
export function RoundIndex() {
    const {org, canEdit} = useOrg();
    const {data: rounds, isPending, isError, refetch} = useRounds(org.id);

    if (isPending) return <FullPageSpinner/>;
    if (isError) {
        return (
            <AppShell title="Rounds didn't load">
                <div className="flex items-center gap-3 text-destructive"><AlertCircle className="h-5 w-5"/>Check your connection.</div>
                <Button className="mt-4" variant="outline" onClick={() => refetch()}>Try again</Button>
            </AppShell>
        );
    }
    const target = defaultRound(rounds, lastRound(org.id));
    if (target) return <Navigate to={`/o/${org.id}/r/${target.id}`} replace/>;

    return (
        <AppShell title="No rounds yet" description={<span>Each round, such as a seed or a Series A, has its own investor pipeline.</span>}>
            <div className="max-w-md rounded-xl border bg-card p-5">
                {canEdit ? <NewRoundForm rounds={[]}/> : <p className="text-muted-foreground">An editor or owner can create the first round.</p>}
            </div>
        </AppShell>
    );
}

/** Links from before rounds existed (/o/:orgId/investors/:id) open the investor in its round. */
export function LegacyInvestorRedirect() {
    const {org} = useOrg();
    const {investorId} = useParams();
    const {data, isPending} = useQuery({
        queryKey: [org.id, "investor-round", investorId],
        queryFn: async () => {
            const {data, error} = await supabase.from("investors").select("round_id").eq("id", investorId!).maybeSingle();
            if (error) throw error;
            return data?.round_id as string | undefined;
        },
    });
    if (isPending) return <FullPageSpinner/>;
    return <Navigate to={data ? `/o/${org.id}/r/${data}/investors/${investorId}` : `/o/${org.id}`} replace/>;
}
