import {useEffect} from "react";
import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {toast} from "sonner";
import {errorMessage, supabase} from "@/lib/supabase";
import {STAGE_BY_ID, type StageId, todayISO} from "@/lib/pipeline";
import type {Activity, FundRound, FundRoundInput, Investor, InvestorInput, Member, Role} from "@/lib/types";

export const keys = {
    investors: ["investors"] as const,
    round: ["round"] as const,
    activity: (id: string) => ["activity", id] as const,
    members: ["members"] as const,
};

/* ---------- queries ---------- */

export function useInvestors() {
    return useQuery({
        queryKey: keys.investors,
        queryFn: async (): Promise<Investor[]> => {
            const {data, error} = await supabase.from("investors").select("*").order("created_at");
            if (error) throw error;
            return (data ?? []).map(normalizeInvestor);
        },
    });
}

export function useRound() {
    return useQuery({
        queryKey: keys.round,
        queryFn: async (): Promise<FundRound | null> => {
            const {data, error} = await supabase.from("fund_round").select("*").maybeSingle();
            if (error) throw error;
            return data ? {...data, target: Number(data.target) || 0, cap: Number(data.cap) || 0} : null;
        },
    });
}

export function useActivity(investorId: string | undefined) {
    return useQuery({
        queryKey: keys.activity(investorId ?? ""),
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

export function useMembers(enabled: boolean) {
    return useQuery({
        queryKey: keys.members,
        enabled,
        queryFn: async (): Promise<Member[]> => {
            const {data, error} = await supabase.from("members").select("*").order("added_at");
            if (error) throw error;
            return data ?? [];
        },
    });
}

/** Live updates: invalidate cached queries whenever another session changes data. */
export function usePipelineRealtime(enabled: boolean) {
    const qc = useQueryClient();
    useEffect(() => {
        if (!enabled) return;
        const channel = supabase
            .channel("pipeline")
            .on("postgres_changes", {event: "*", schema: "public", table: "investors"}, () =>
                qc.invalidateQueries({queryKey: keys.investors}))
            .on("postgres_changes", {event: "*", schema: "public", table: "fund_round"}, () =>
                qc.invalidateQueries({queryKey: keys.round}))
            .on("postgres_changes", {event: "INSERT", schema: "public", table: "investor_activity"}, (p) => {
                const id = (p.new as Partial<Activity>).investor_id;
                if (id) qc.invalidateQueries({queryKey: keys.activity(id)});
            })
            .subscribe();
        return () => {
            supabase.removeChannel(channel);
        };
    }, [enabled, qc]);
}

/* ---------- mutations ---------- */

function onError(error: unknown) {
    toast.error(errorMessage(error));
}

export function useSaveInvestor() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async ({id, values}: {id?: string; values: InvestorInput}) => {
            const res = id
                ? await supabase.from("investors").update(values).eq("id", id).select().single()
                : await supabase.from("investors").insert(values).select().single();
            if (res.error) throw res.error;
            return normalizeInvestor(res.data);
        },
        onSuccess: (inv, {id}) => {
            toast.success(id ? "Saved" : `${inv.name} added`);
            qc.invalidateQueries({queryKey: keys.investors});
            qc.invalidateQueries({queryKey: keys.activity(inv.id)});
        },
        onError,
    });
}

export function useMoveStage() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async ({id, stage}: {id: string; stage: StageId}) => {
            const {error} = await supabase.from("investors").update({stage}).eq("id", id);
            if (error) throw error;
        },
        // Optimistic: move the card immediately, roll back on failure.
        onMutate: async ({id, stage}) => {
            await qc.cancelQueries({queryKey: keys.investors});
            const prev = qc.getQueryData<Investor[]>(keys.investors);
            qc.setQueryData<Investor[]>(keys.investors, (rows) => rows?.map((r) => (r.id === id ? {...r, stage} : r)));
            return {prev};
        },
        onError: (error, _vars, ctx) => {
            if (ctx?.prev) qc.setQueryData(keys.investors, ctx.prev);
            onError(error);
        },
        onSuccess: (_d, {id, stage}) => {
            const name = qc.getQueryData<Investor[]>(keys.investors)?.find((r) => r.id === id)?.name;
            toast.success(`${name ?? "Investor"} → ${STAGE_BY_ID[stage].name}`);
            qc.invalidateQueries({queryKey: keys.activity(id)});
        },
        onSettled: () => qc.invalidateQueries({queryKey: keys.investors}),
    });
}

export function useDeleteInvestor() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (id: string) => {
            const {error} = await supabase.from("investors").delete().eq("id", id);
            if (error) throw error;
        },
        onSuccess: () => {
            toast.success("Deleted");
            qc.invalidateQueries({queryKey: keys.investors});
        },
        onError,
    });
}

export function useImportInvestors() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (rows: InvestorInput[]) => {
            const {error} = await supabase.from("investors").insert(rows);
            if (error) throw error;
            return rows.length;
        },
        onSuccess: (n) => {
            toast.success(`Imported ${n} investor${n === 1 ? "" : "s"}`);
            qc.invalidateQueries({queryKey: keys.investors});
        },
        onError,
    });
}

export function useLogActivity() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async ({investorId, body}: {investorId: string; body: string}) => {
            const {error} = await supabase.from("investor_activity").insert({investor_id: investorId, body});
            if (error) throw error;
            const {error: e2} = await supabase.from("investors").update({last_contact: todayISO()}).eq("id", investorId);
            if (e2) throw e2;
        },
        onSuccess: (_d, {investorId}) => {
            toast.success("Logged");
            qc.invalidateQueries({queryKey: keys.activity(investorId)});
            qc.invalidateQueries({queryKey: keys.investors});
        },
        onError,
    });
}

export function useSaveRound() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (values: FundRoundInput) => {
            const {error} = await supabase.from("fund_round").update(values).eq("id", true);
            if (error) throw error;
        },
        onSuccess: () => {
            toast.success("Round saved");
            qc.invalidateQueries({queryKey: keys.round});
        },
        onError,
    });
}

export function useMemberMutations() {
    const qc = useQueryClient();
    const done = (msg: string) => () => {
        toast.success(msg);
        qc.invalidateQueries({queryKey: keys.members});
    };
    const add = useMutation({
        mutationFn: async ({email, role}: {email: string; role: Role}) => {
            const {error} = await supabase.from("members").insert({email: email.toLowerCase(), role});
            if (error) throw error;
        },
        onSuccess: done("Member added"),
        onError: (e) => toast.error((e as {code?: string}).code === "23505" ? "That email is already on the list." : errorMessage(e)),
    });
    const setRole = useMutation({
        mutationFn: async ({email, role}: {email: string; role: Role}) => {
            const {error} = await supabase.from("members").update({role}).eq("email", email);
            if (error) throw error;
        },
        onSuccess: done("Role updated"),
        onError,
    });
    const remove = useMutation({
        mutationFn: async (email: string) => {
            const {error} = await supabase.from("members").delete().eq("email", email);
            if (error) throw error;
        },
        onSuccess: done("Member removed"),
        onError,
    });
    return {add, setRole, remove};
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
