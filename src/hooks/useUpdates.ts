import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {toast} from "sonner";
import {errorMessage, supabase} from "@/lib/supabase";
import type {InvestorUpdate, RecipientInput, RecipientList, RecipientListMember, UpdateDelivery, UpdateStatus} from "@/lib/types";
import {renderTemplate} from "@/lib/emailTemplate";
import {GmailError, type GmailSender, sendGmail} from "@/lib/gmail";
import {normalizeContacts} from "@/lib/contacts";
import type {StageId} from "@/lib/pipeline";

// Every key starts with the org id, like the pipeline's (see usePipeline), so realtime can invalidate by prefix.
export const updateKeys = {
    lists: (orgId: string) => [orgId, "recipient-lists"] as const,
    listMembers: (orgId: string) => [orgId, "recipient-list-members"] as const,
    updates: (orgId: string) => [orgId, "updates"] as const,
    update: (orgId: string, id: string) => [orgId, "updates", id] as const,
    deliveries: (orgId: string, updateId?: string) => (updateId ? [orgId, "deliveries", updateId] : [orgId, "deliveries"]) as readonly string[],
    contacts: (orgId: string) => [orgId, "pipeline-contacts"] as const,
};

function onError(error: unknown) {
    toast.error(errorMessage(error));
}

/* ---------- recipient lists ---------- */

export function useRecipientLists(orgId: string) {
    return useQuery({
        queryKey: updateKeys.lists(orgId),
        queryFn: async (): Promise<RecipientList[]> => {
            const {data, error} = await supabase.from("recipient_lists").select("*").eq("org_id", orgId).order("name");
            if (error) throw error;
            return data ?? [];
        },
    });
}

/** Everyone on every list of the organization, grouped by list id. Lists are small, so one query. */
export function useListMembers(orgId: string) {
    return useQuery({
        queryKey: updateKeys.listMembers(orgId),
        queryFn: async (): Promise<Map<string, RecipientListMember[]>> => {
            const {data, error} = await supabase.from("recipient_list_members").select("*").eq("org_id", orgId).order("email").limit(10000);
            if (error) throw error;
            const byList = new Map<string, RecipientListMember[]>();
            for (const m of data ?? []) byList.set(m.list_id, [...(byList.get(m.list_id) ?? []), m]);
            return byList;
        },
    });
}

export function useListMutations(orgId: string) {
    const qc = useQueryClient();
    const refresh = () => {
        qc.invalidateQueries({queryKey: updateKeys.lists(orgId)});
        qc.invalidateQueries({queryKey: updateKeys.listMembers(orgId)});
    };

    const create = useMutation({
        mutationFn: async (values: {name: string; description?: string}) => {
            const {data, error} = await supabase.from("recipient_lists")
                .insert({org_id: orgId, name: values.name.trim(), description: values.description?.trim() ?? ""}).select().single();
            if (error) throw error;
            return data as RecipientList;
        },
        onSuccess: (l) => {
            toast.success(`${l.name} created`);
            refresh();
        },
        onError,
    });

    const save = useMutation({
        mutationFn: async ({id, name, description}: {id: string; name: string; description: string}) => {
            const {error} = await supabase.from("recipient_lists").update({name: name.trim(), description: description.trim()}).eq("id", id).eq("org_id", orgId);
            if (error) throw error;
        },
        onSuccess: refresh,
        onError,
    });

    const remove = useMutation({
        mutationFn: async (id: string) => {
            const {error} = await supabase.from("recipient_lists").delete().eq("id", id).eq("org_id", orgId);
            if (error) throw error;
        },
        onSuccess: () => {
            toast.success("List deleted");
            refresh();
            qc.invalidateQueries({queryKey: updateKeys.updates(orgId)});
        },
        onError,
    });

    /** Adds people; anyone already on the list (same email) is left as they are. Returns how many were new. */
    const addMembers = useMutation({
        mutationFn: async ({listId, people}: {listId: string; people: RecipientInput[]}) => {
            if (!people.length) return 0;
            const rows = people.map((p) => ({list_id: listId, org_id: orgId, email: p.email.trim().toLowerCase(), name: p.name, firm: p.firm, investor_id: p.investor_id ?? null}));
            const {data, error} = await supabase.from("recipient_list_members")
                .upsert(rows, {onConflict: "list_id,email", ignoreDuplicates: true}).select("id");
            if (error) throw error;
            return data?.length ?? 0;
        },
        onSuccess: (added, {people}) => {
            const skipped = people.length - added;
            toast.success(`${added} ${added === 1 ? "person" : "people"} added${skipped ? ` · ${skipped} already on the list` : ""}`);
            refresh();
        },
        onError,
    });

    const saveMember = useMutation({
        mutationFn: async ({id, values}: {id: string; values: Pick<RecipientListMember, "email" | "name" | "firm">}) => {
            const {error} = await supabase.from("recipient_list_members").update(values).eq("id", id).eq("org_id", orgId);
            if (error) throw error;
        },
        onSuccess: refresh,
        onError,
    });

    const removeMembers = useMutation({
        mutationFn: async (ids: string[]) => {
            const {error} = await supabase.from("recipient_list_members").delete().in("id", ids).eq("org_id", orgId);
            if (error) throw error;
        },
        onSuccess: refresh,
        onError,
    });

    return {create, save, remove, addMembers, saveMember, removeMembers};
}

/** A person with an email at a pipeline investor, for picking recipients. */
export interface PipelineContact {
    investorId: string;
    investorName: string;
    roundId: string;
    stage: StageId;
    email: string;
    name: string;
    role: string;
}

/** Every contact with an email across the organization's rounds. */
export function usePipelineContacts(orgId: string, enabled = true) {
    return useQuery({
        queryKey: updateKeys.contacts(orgId),
        enabled,
        queryFn: async (): Promise<PipelineContact[]> => {
            const {data, error} = await supabase.from("investors").select("id, name, round_id, stage, contacts").eq("org_id", orgId).order("name");
            if (error) throw error;
            return (data ?? []).flatMap((i) => normalizeContacts(i.contacts).filter((c) => c.email).map((c) => ({
                investorId: i.id as string,
                investorName: i.name as string,
                roundId: i.round_id as string,
                stage: i.stage as StageId,
                email: c.email!.trim().toLowerCase(),
                name: c.name ?? "",
                role: c.role ?? "",
            })));
        },
    });
}

/* ---------- updates ---------- */

/** The list the last update was sent to, so the next one starts with it. */
const lastListKey = (orgId: string) => `venture.lastUpdateList.${orgId}`;

export function rememberUpdateList(orgId: string, listId: string | null) {
    try {
        if (listId) localStorage.setItem(lastListKey(orgId), listId);
    } catch { /* storage unavailable */
    }
}

export function lastUpdateList(orgId: string): string | null {
    try {
        return localStorage.getItem(lastListKey(orgId));
    } catch {
        return null;
    }
}


export type UpdateSummary = Omit<InvestorUpdate, "body_html">;

export function useUpdates(orgId: string) {
    return useQuery({
        queryKey: updateKeys.updates(orgId),
        queryFn: async (): Promise<UpdateSummary[]> => {
            const {data, error} = await supabase.from("investor_updates")
                .select("id, org_id, subject, status, list_id, list_name, sender_email, author_email, created_at, updated_at, sent_at")
                .eq("org_id", orgId).order("created_at", {ascending: false});
            if (error) throw error;
            return (data ?? []) as UpdateSummary[];
        },
    });
}

export function useUpdate(orgId: string, id: string | undefined) {
    return useQuery({
        queryKey: updateKeys.update(orgId, id ?? ""),
        enabled: Boolean(id),
        queryFn: async (): Promise<InvestorUpdate | null> => {
            const {data, error} = await supabase.from("investor_updates").select("*").eq("id", id!).eq("org_id", orgId).maybeSingle();
            if (error) throw error;
            return data as InvestorUpdate | null;
        },
    });
}

/** Sent / failed counts for every update, for the history list. */
export function useDeliveryCounts(orgId: string) {
    return useQuery({
        queryKey: updateKeys.deliveries(orgId),
        queryFn: async (): Promise<Map<string, {sent: number; failed: number; total: number}>> => {
            const {data, error} = await supabase.from("update_deliveries").select("update_id, status").eq("org_id", orgId).limit(50000);
            if (error) throw error;
            const out = new Map<string, {sent: number; failed: number; total: number}>();
            for (const d of data ?? []) {
                const c = out.get(d.update_id) ?? {sent: 0, failed: 0, total: 0};
                c.total++;
                if (d.status === "sent") c.sent++;
                if (d.status === "failed") c.failed++;
                out.set(d.update_id, c);
            }
            return out;
        },
    });
}

export function useDeliveries(orgId: string, updateId: string | undefined) {
    return useQuery({
        queryKey: updateKeys.deliveries(orgId, updateId ?? ""),
        enabled: Boolean(updateId),
        queryFn: async (): Promise<UpdateDelivery[]> => {
            const {data, error} = await supabase.from("update_deliveries").select("*").eq("update_id", updateId!).order("email");
            if (error) throw error;
            return data ?? [];
        },
    });
}

export function useUpdateMutations(orgId: string) {
    const qc = useQueryClient();

    const create = useMutation({
        mutationFn: async (values: Pick<InvestorUpdate, "subject" | "body_html" | "list_id">) => {
            const {data, error} = await supabase.from("investor_updates").insert({org_id: orgId, ...values}).select().single();
            if (error) throw error;
            return data as InvestorUpdate;
        },
        onSuccess: (u) => {
            qc.setQueryData(updateKeys.update(orgId, u.id), u);
            qc.invalidateQueries({queryKey: updateKeys.updates(orgId), exact: true});
        },
        onError,
    });

    /** Saves a draft. Quiet on success: the composer saves as you type. */
    const saveDraft = useMutation({
        mutationFn: async ({id, values}: {id: string; values: Partial<Pick<InvestorUpdate, "subject" | "body_html" | "list_id">>}) => {
            const {data, error} = await supabase.from("investor_updates").update(values).eq("id", id).eq("org_id", orgId).select().single();
            if (error) throw error;
            return data as InvestorUpdate;
        },
        onSuccess: (u) => {
            qc.setQueryData(updateKeys.update(orgId, u.id), u);
            qc.invalidateQueries({queryKey: updateKeys.updates(orgId), exact: true});
        },
        onError,
    });

    const remove = useMutation({
        mutationFn: async (id: string) => {
            const {data, error} = await supabase.from("investor_updates").delete().eq("id", id).eq("org_id", orgId).select("id");
            if (error) throw error;
            if (!data?.length) throw new Error("Only an owner can delete an update that was sent.");
        },
        onSuccess: () => {
            toast.success("Update deleted");
            qc.invalidateQueries({queryKey: updateKeys.updates(orgId)});
            qc.invalidateQueries({queryKey: updateKeys.deliveries(orgId)});
        },
        onError,
    });

    return {create, saveDraft, remove};
}

/* ---------- sending ---------- */

export interface SendProgress {
    done: number;
    total: number;
    failed: number;
    current?: string;
}

/**
 * Sends a draft (or retries a partly sent update) from the connected Gmail account, one email per
 * recipient, personalized. The database freezes the update and lists the recipients first, then each
 * outcome is recorded as it happens, so closing the tab mid-way loses nothing: the rest can be retried.
 */
export async function sendUpdate(
    update: Pick<InvestorUpdate, "id" | "subject" | "body_html">,
    sender: GmailSender,
    onProgress: (p: SendProgress) => void,
    shouldStop: () => boolean = () => false,
): Promise<UpdateStatus> {
    const {data, error} = await supabase.rpc("begin_update_send", {p_update: update.id, p_sender: sender.email});
    if (error) throw error;
    const pending = (data ?? []) as UpdateDelivery[];
    const progress: SendProgress = {done: 0, total: pending.length, failed: 0};
    onProgress({...progress});

    let stopReason: string | null = null;
    for (const d of pending) {
        if (stopReason || shouldStop()) break;
        onProgress({...progress, current: d.email});
        let ok = false, gmailId: string | null = null, err: string | null = null;
        try {
            gmailId = await sendGmail(sender, {
                to: {email: d.email, name: d.name},
                subject: renderTemplate(update.subject, d),
                html: renderTemplate(update.body_html, d, {html: true}),
            });
            ok = true;
        } catch (e) {
            err = e instanceof Error ? e.message : String(e);
            // Lost access or hit the daily limit: every remaining email would fail the same way.
            if (e instanceof GmailError && (e.authExpired || /daily sending limit/i.test(e.message))) stopReason = err;
        }
        const rec = await supabase.rpc("record_delivery", {p_delivery: d.id, p_ok: ok, p_gmail_message_id: gmailId, p_error: err});
        if (rec.error && ok) {
            // The email went out but we couldn't record it. Don't send it again on retry by accident: stop and say so.
            stopReason = `Sent to ${d.email}, but saving that failed: ${errorMessage(rec.error)}`;
        }
        progress.done++;
        if (!ok) progress.failed++;
        onProgress({...progress});
    }

    const fin = await supabase.rpc("finish_update_send", {p_update: update.id});
    if (fin.error) throw fin.error;
    if (stopReason) throw new Error(stopReason);
    return fin.data as UpdateStatus;
}

/** Refreshes everything an update page shows after sending. */
export function useRefreshAfterSend(orgId: string) {
    const qc = useQueryClient();
    return (updateId: string) => {
        qc.invalidateQueries({queryKey: updateKeys.updates(orgId)});
        qc.invalidateQueries({queryKey: updateKeys.deliveries(orgId)});
        qc.invalidateQueries({queryKey: updateKeys.update(orgId, updateId)});
    };
}
