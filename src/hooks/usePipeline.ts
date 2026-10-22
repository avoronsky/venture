import {useEffect} from "react";
import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {toast} from "sonner";
import {errorMessage, supabase} from "@/lib/supabase";
import {STAGE_BY_ID, type StageId} from "@/lib/pipeline";
import type {Activity, CommentStats, FundRound, FundRoundInput, Investor, InvestorInput} from "@/lib/types";

// Every key starts with the org id so switching organizations never shows another org's cache.
export const keys = {
    investors: (orgId: string) => [orgId, "investors"] as const,
    round: (orgId: string) => [orgId, "round"] as const,
    activity: (orgId: string, investorId: string) => [orgId, "activity", investorId] as const,
    commentStats: (orgId: string) => [orgId, "comment-stats"] as const,
};

/* ---------- queries ---------- */

export function useInvestors(orgId: string) {
    return useQuery({
        queryKey: keys.investors(orgId),
        queryFn: async (): Promise<Investor[]> => {
            const {data, error} = await supabase.from("investors").select("*").eq("org_id", orgId).order("created_at");
            if (error) throw error;
            return (data ?? []).map(normalizeInvestor);
        },
    });
}

export function useRound(orgId: string) {
    return useQuery({
        queryKey: keys.round(orgId),
        queryFn: async (): Promise<FundRound | null> => {
            const {data, error} = await supabase.from("fund_round").select("*").eq("org_id", orgId).maybeSingle();
            if (error) throw error;
            return data ? {...data, target: Number(data.target) || 0, cap: Number(data.cap) || 0} : null;
        },
    });
}

export function useActivity(orgId: string, investorId: string | undefined) {
    return useQuery({
        queryKey: keys.activity(orgId, investorId ?? ""),
        enabled: Boolean(investorId),
        queryFn: async (): Promise<Activity[]> => {
            const {data, error} = await supabase
                .from("investor_activity")
                .select("*")
                .eq("investor_id", investorId!)
                .order("created_at", {ascending: false})
                .limit(200);
            if (error) throw error;
            return data ?? [];
        },
    });
}

/** Comment count and latest comment date per investor, for the board and table. */
export function useCommentStats(orgId: string) {
    return useQuery({
        queryKey: keys.commentStats(orgId),
        queryFn: async (): Promise<Map<string, CommentStats>> => {
            const {data, error} = await supabase
                .from("investor_comment_stats")
                .select("investor_id, comment_count, last_comment_on")
                .eq("org_id", orgId);
            if (error) throw error;
            return new Map((data ?? []).map((r) => [r.investor_id, r as CommentStats]));
        },
    });
}

/** Live updates for one organization: invalidate its cached queries when anyone changes data. */
export function usePipelineRealtime(orgId: string | undefined) {
    const qc = useQueryClient();
    useEffect(() => {
        if (!orgId) return;
        const filter = `org_id=eq.${orgId}`;
        const channel = supabase
            .channel(`org:${orgId}`)
            .on("postgres_changes", {event: "*", schema: "public", table: "investors", filter}, () =>
                qc.invalidateQueries({queryKey: keys.investors(orgId)}))
            .on("postgres_changes", {event: "*", schema: "public", table: "fund_round", filter}, () =>
                qc.invalidateQueries({queryKey: keys.round(orgId)}))
            .on("postgres_changes", {event: "*", schema: "public", table: "investor_activity", filter}, (p) => {
                const id = (p.new as Partial<Activity>)?.investor_id ?? (p.old as Partial<Activity>)?.investor_id;
                if (id) qc.invalidateQueries({queryKey: keys.activity(orgId, id)});
                qc.invalidateQueries({queryKey: keys.commentStats(orgId)});
            })
            .on("postgres_changes", {event: "*", schema: "public", table: "organization_members", filter}, () => {
                qc.invalidateQueries({queryKey: ["members", orgId]});
                qc.invalidateQueries({queryKey: ["memberships"]});
            })
            .subscribe();
        return () => {
            supabase.removeChannel(channel);
        };
    }, [orgId, qc]);
}

/* ---------- mutations ---------- */

function onError(error: unknown) {
    toast.error(errorMessage(error));
}

export function useSaveInvestor(orgId: string) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async ({id, values}: {id?: string; values: InvestorInput}) => {
            const res = id
                ? await supabase.from("investors").update(values).eq("id", id).eq("org_id", orgId).select().single()
                : await supabase.from("investors").insert({...values, org_id: orgId}).select().single();
            if (res.error) throw res.error;
            return normalizeInvestor(res.data);
        },
        onSuccess: (inv, {id}) => {
            toast.success(id ? "Saved" : `${inv.name} added`);
            qc.invalidateQueries({queryKey: keys.investors(orgId)});
            qc.invalidateQueries({queryKey: keys.activity(orgId, inv.id)});
        },
        onError,
    });
}

export function useMoveStage(orgId: string) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async ({id, stage}: {id: string; stage: StageId}) => {
            const {error} = await supabase.from("investors").update({stage}).eq("id", id).eq("org_id", orgId);
            if (error) throw error;
        },
        // Optimistic: move the card immediately, roll back on failure.
        onMutate: async ({id, stage}) => {
            await qc.cancelQueries({queryKey: keys.investors(orgId)});
            const prev = qc.getQueryData<Investor[]>(keys.investors(orgId));
            qc.setQueryData<Investor[]>(keys.investors(orgId), (rows) => rows?.map((r) => (r.id === id ? {...r, stage} : r)));
            return {prev};
        },
        onError: (error, _vars, ctx) => {
            if (ctx?.prev) qc.setQueryData(keys.investors(orgId), ctx.prev);
            onError(error);
        },
        onSuccess: (_d, {id, stage}) => {
            const name = qc.getQueryData<Investor[]>(keys.investors(orgId))?.find((r) => r.id === id)?.name;
            toast.success(`${name ?? "Investor"} → ${STAGE_BY_ID[stage].name}`);
            qc.invalidateQueries({queryKey: keys.activity(orgId, id)});
        },
        onSettled: () => qc.invalidateQueries({queryKey: keys.investors(orgId)}),
    });
}

export function useDeleteInvestor(orgId: string) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (id: string) => {
            const {error} = await supabase.from("investors").delete().eq("id", id).eq("org_id", orgId);
            if (error) throw error;
        },
        onSuccess: () => {
            toast.success("Deleted");
            qc.invalidateQueries({queryKey: keys.investors(orgId)});
        },
        onError,
    });
}

function useCommentRefresh(orgId: string) {
    const qc = useQueryClient();
    return (investorId: string) => {
        qc.invalidateQueries({queryKey: keys.activity(orgId, investorId)});
        qc.invalidateQueries({queryKey: keys.commentStats(orgId)});
        qc.invalidateQueries({queryKey: keys.investors(orgId)}); // "last touch" moves with dated comments
    };
}

export function useAddComment(orgId: string) {
    const refresh = useCommentRefresh(orgId);
    return useMutation({
        mutationFn: async ({investorId, body, occurredOn}: {investorId: string; body: string; occurredOn: string}) => {
            // org_id and the author are set by the database; org_id is sent only because the column is required.
            const {error} = await supabase.from("investor_activity")
                .insert({org_id: orgId, investor_id: investorId, kind: "note", body, occurred_on: occurredOn});
            if (error) throw error;
        },
        onSuccess: (_d, {investorId}) => {
            toast.success("Comment added");
            refresh(investorId);
        },
        onError,
    });
}

export function useUpdateComment(orgId: string) {
    const refresh = useCommentRefresh(orgId);
    return useMutation({
        mutationFn: async ({id, body, occurredOn}: {id: number; investorId: string; body: string; occurredOn: string}) => {
            const {data, error} = await supabase.from("investor_activity")
                .update({body, occurred_on: occurredOn}).eq("id", id).select("id");
            if (error) throw error;
            if (!data?.length) throw new Error("You can only edit your own comments.");
        },
        onSuccess: (_d, {investorId}) => {
            toast.success("Comment updated");
            refresh(investorId);
        },
        onError,
    });
}

export function useDeleteComment(orgId: string) {
    const refresh = useCommentRefresh(orgId);
    return useMutation({
        mutationFn: async ({id}: {id: number; investorId: string}) => {
            const {data, error} = await supabase.from("investor_activity").delete().eq("id", id).select("id");
            if (error) throw error;
            if (!data?.length) throw new Error("Only the author or an owner can delete this comment.");
        },
        onSuccess: (_d, {investorId}) => {
            toast.success("Comment deleted");
            refresh(investorId);
        },
        onError,
    });
}

export function useSaveRound(orgId: string) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (values: FundRoundInput) => {
            const {error} = await supabase.from("fund_round").update(values).eq("org_id", orgId);
            if (error) throw error;
        },
        onSuccess: () => {
            toast.success("Round saved");
            qc.invalidateQueries({queryKey: keys.round(orgId)});
        },
        onError,
    });
}

/* ---------- helpers ---------- */

// Postgres numeric columns can arrive as strings; coerce once at the edge.
function normalizeInvestor(row: Investor): Investor {
    return {
        ...row,
        check_min: Number(row.check_min) || 0,
        check_max: Number(row.check_max) || 0,
        amount: Number(row.amount) || 0,
    };
}
