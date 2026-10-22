import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {toast} from "sonner";
import {errorMessage, supabase} from "@/lib/supabase";
import type {Round, RoundInput} from "@/lib/types";
import {sortRounds} from "@/lib/rounds";

export {defaultRound, sortRounds} from "@/lib/rounds";

export const roundKeys = {
    list: (orgId: string) => [orgId, "rounds"] as const,
};

const lastRoundKey = (orgId: string) => `venture.lastRound.${orgId}`;

export function rememberRound(orgId: string, roundId: string) {
    try {
        localStorage.setItem(lastRoundKey(orgId), roundId);
    } catch { /* storage unavailable */
    }
}

export function lastRound(orgId: string): string | null {
    try {
        return localStorage.getItem(lastRoundKey(orgId));
    } catch {
        return null;
    }
}

function normalizeRound(r: Round): Round {
    return {...r, target: Number(r.target) || 0, cap: Number(r.cap) || 0};
}

export function useRounds(orgId: string | undefined) {
    return useQuery({
        queryKey: roundKeys.list(orgId ?? ""),
        enabled: Boolean(orgId),
        queryFn: async (): Promise<Round[]> => {
            const {data, error} = await supabase.from("rounds").select("*").eq("org_id", orgId!).order("created_at");
            if (error) throw error;
            return sortRounds((data ?? []).map(normalizeRound));
        },
    });
}

export function useCreateRound(orgId: string) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async ({name, copyFrom, details}: {name: string; copyFrom: string | null; details?: Partial<RoundInput>}) => {
            const {data, error} = await supabase.rpc("create_round", {p_org: orgId, p_name: name, p_copy_from: copyFrom});
            if (error) throw error;
            const id = data as string;
            if (details && Object.keys(details).length) {
                const {error: e2} = await supabase.from("rounds").update(details).eq("id", id);
                if (e2) throw e2;
            }
            return id;
        },
        onSuccess: async (id, {name}) => {
            rememberRound(orgId, id);
            toast.success(`${name} created`);
            await qc.invalidateQueries({queryKey: roundKeys.list(orgId)});
            qc.invalidateQueries({queryKey: [orgId, "investors"]});
        },
        onError: (e) => toast.error(errorMessage(e)),
    });
}

export function useSaveRound(orgId: string) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async ({id, values}: {id: string; values: RoundInput}) => {
            const {error} = await supabase.from("rounds").update(values).eq("id", id).eq("org_id", orgId);
            if (error) throw error;
        },
        onSuccess: () => {
            toast.success("Round saved");
            qc.invalidateQueries({queryKey: roundKeys.list(orgId)});
        },
        onError: (e) => toast.error(errorMessage(e)),
    });
}

export function useDeleteRound(orgId: string) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (id: string) => {
            const {data, error} = await supabase.from("rounds").delete().eq("id", id).eq("org_id", orgId).select("id");
            if (error) throw error;
            if (!data?.length) throw new Error("Only an owner can delete a round.");
        },
        onSuccess: () => {
            toast.success("Round deleted");
            qc.invalidateQueries({queryKey: roundKeys.list(orgId)});
            qc.invalidateQueries({queryKey: [orgId, "investors"]});
            qc.invalidateQueries({queryKey: [orgId, "comment-stats"]});
        },
        onError: (e) => toast.error(errorMessage(e)),
    });
}
