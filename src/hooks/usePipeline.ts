import {useEffect} from "react";
import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {toast} from "sonner";
import {errorMessage, supabase} from "@/lib/supabase";
import {STAGE_BY_ID, type StageId, todayISO} from "@/lib/pipeline";
import type {Activity, FundRound, FundRoundInput, Investor, InvestorInput} from "@/lib/types";

// Every key starts with the org id so switching organizations never shows another org's cache.
export const keys = {
    investors: (orgId: string) => [orgId, "investors"] as const,
    round: (orgId: string) => [orgId, "round"] as const,
    activity: (orgId: string, investorId: string) => [orgId, "activity", investorId] as const,
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
            .on("postgres_changes", {event: "INSERT", schema: "public", table: "investor_activity", filter}, (p) => {
                const id = (p.new as Partial<Activity>).investor_id;
                if (id) qc.invalidateQueries({queryKey: keys.activity(orgId, id)});
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

export function useImportInvestors(orgId: string) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (rows: InvestorInput[]) => {
            const {error} = await supabase.from("investors").insert(rows.map((r) => ({...r, org_id: orgId})));
            if (error) throw error;
            return rows.length;
        },
        onSuccess: (n) => {
            toast.success(`Imported ${n} investor${n === 1 ? "" : "s"}`);
            qc.invalidateQueries({queryKey: keys.investors(orgId)});
        },
        onError,
    });
}

export function useLogActivity(orgId: string) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async ({investorId, body}: {investorId: string; body: string}) => {
            // org_id is set server-side from the investor; sent here only to satisfy the column.
            const {error} = await supabase.from("investor_activity").insert({org_id: orgId, investor_id: investorId, body});
            if (error) throw error;
            const {error: e2} = await supabase.from("investors").update({last_contact: todayISO()}).eq("id", investorId).eq("org_id", orgId);
            if (e2) throw e2;
        },
        onSuccess: (_d, {investorId}) => {
            toast.success("Logged");
            qc.invalidateQueries({queryKey: keys.activity(orgId, investorId)});
            qc.invalidateQueries({queryKey: keys.investors(orgId)});
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
