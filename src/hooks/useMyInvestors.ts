import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {toast} from "sonner";
import {errorMessage, supabase} from "@/lib/supabase";
import {useAuth} from "@/hooks/useAuth";
import type {CommentStats, MyInvestor, MyInvestorComment, MyInvestorInput} from "@/lib/types";

// Keyed by the signed-in user so switching accounts never shows someone else's cache.
export const myKeys = {
    all: (uid: string) => ["me", uid, "investors"] as const,
    comments: (uid: string, investorId: string) => ["me", uid, "comments", investorId] as const,
    stats: (uid: string) => ["me", uid, "comment-stats"] as const,
};

function useUid(): string {
    const {session} = useAuth();
    return session?.user.id ?? "";
}

const normalize = (r: MyInvestor): MyInvestor => ({...r, min_check: Number(r.min_check) || 0});

export function useMyInvestors() {
    const uid = useUid();
    return useQuery({
        queryKey: myKeys.all(uid),
        enabled: Boolean(uid),
        queryFn: async (): Promise<MyInvestor[]> => {
            const {data, error} = await supabase.from("my_investors").select("*").order("name");
            if (error) throw error;
            return (data ?? []).map(normalize);
        },
    });
}

export function useMyCommentStats() {
    const uid = useUid();
    return useQuery({
        queryKey: myKeys.stats(uid),
        enabled: Boolean(uid),
        queryFn: async (): Promise<Map<string, CommentStats>> => {
            const {data, error} = await supabase.from("my_investor_comment_stats").select("investor_id, comment_count, last_comment_on");
            if (error) throw error;
            return new Map((data ?? []).map((r) => [r.investor_id, r as CommentStats]));
        },
    });
}

export function useSaveMyInvestor() {
    const qc = useQueryClient();
    const uid = useUid();
    return useMutation({
        mutationFn: async ({id, values}: {id?: string; values: MyInvestorInput}) => {
            const res = id
                ? await supabase.from("my_investors").update(values).eq("id", id).select().single()
                : await supabase.from("my_investors").insert(values).select().single();
            if (res.error) throw res.error;
            return normalize(res.data);
        },
        onSuccess: (inv, {id}) => {
            toast.success(id ? "Saved" : `${inv.name} added to your database`);
            qc.invalidateQueries({queryKey: myKeys.all(uid)});
        },
        onError: (e) => toast.error(errorMessage(e)),
    });
}

export function useDeleteMyInvestor() {
    const qc = useQueryClient();
    const uid = useUid();
    return useMutation({
        mutationFn: async (id: string) => {
            const {error} = await supabase.from("my_investors").delete().eq("id", id);
            if (error) throw error;
        },
        onSuccess: () => {
            toast.success("Removed from your database");
            qc.invalidateQueries({queryKey: myKeys.all(uid)});
            qc.invalidateQueries({queryKey: myKeys.stats(uid)});
        },
        onError: (e) => toast.error(errorMessage(e)),
    });
}

export function useMyInvestorComments(investorId: string | undefined) {
    const uid = useUid();
    return useQuery({
        queryKey: myKeys.comments(uid, investorId ?? ""),
        enabled: Boolean(uid && investorId),
        queryFn: async (): Promise<MyInvestorComment[]> => {
            const {data, error} = await supabase.from("my_investor_comments").select("*")
                .eq("investor_id", investorId!).order("occurred_on", {ascending: false}).limit(500);
            if (error) throw error;
            return (data ?? []).map((c) => ({...c, kind: "note" as const}));
        },
    });
}

export function useMyCommentMutations(investorId: string) {
    const qc = useQueryClient();
    const uid = useUid();
    const refresh = () => {
        qc.invalidateQueries({queryKey: myKeys.comments(uid, investorId)});
        qc.invalidateQueries({queryKey: myKeys.stats(uid)});
    };
    const onError = (e: unknown) => toast.error(errorMessage(e));
    const add = useMutation({
        mutationFn: async ({body, occurredOn}: {body: string; occurredOn: string}) => {
            const {error} = await supabase.from("my_investor_comments").insert({investor_id: investorId, body, occurred_on: occurredOn});
            if (error) throw error;
        },
        onSuccess: () => {
            toast.success("Comment added");
            refresh();
        },
        onError,
    });
    const update = useMutation({
        mutationFn: async ({id, body, occurredOn}: {id: number; body: string; occurredOn: string}) => {
            const {error} = await supabase.from("my_investor_comments").update({body, occurred_on: occurredOn}).eq("id", id);
            if (error) throw error;
        },
        onSuccess: () => {
            toast.success("Comment updated");
            refresh();
        },
        onError,
    });
    const remove = useMutation({
        mutationFn: async (id: number) => {
            const {error} = await supabase.from("my_investor_comments").delete().eq("id", id);
            if (error) throw error;
        },
        onSuccess: () => {
            toast.success("Comment deleted");
            refresh();
        },
        onError,
    });
    return {add, update, remove};
}

/** Adding to a pipeline also saves to the database (done by the server), so refresh the list afterwards. */
export function useRefreshMyInvestors() {
    const qc = useQueryClient();
    const uid = useUid();
    return () => qc.invalidateQueries({queryKey: myKeys.all(uid)});
}
