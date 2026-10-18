import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {toast} from "sonner";
import {errorMessage, supabase} from "@/lib/supabase";
import {useAuth} from "@/hooks/useAuth";
import type {Member, Membership, Organization, Role} from "@/lib/types";

export const orgKeys = {
    mine: (email: string | null) => ["memberships", email] as const,
    members: (orgId: string) => ["members", orgId] as const,
};

const LAST_ORG_KEY = "venture.lastOrg";

export function rememberOrg(orgId: string) {
    try {
        localStorage.setItem(LAST_ORG_KEY, orgId);
    } catch { /* storage unavailable */
    }
}

export function lastOrg(): string | null {
    try {
        return localStorage.getItem(LAST_ORG_KEY);
    } catch {
        return null;
    }
}

/** Organizations the signed-in user belongs to. New users have none. */
export function useMyOrganizations() {
    const {email} = useAuth();
    return useQuery({
        queryKey: orgKeys.mine(email),
        enabled: Boolean(email),
        queryFn: async (): Promise<Membership[]> => {
            const {data, error} = await supabase
                .from("organization_members")
                .select("role, org:organizations(id, name, created_at)")
                .eq("email", email!);
            if (error) throw error;
            return ((data ?? []) as unknown as {role: Role; org: Organization | null}[])
                .filter((m): m is Membership => Boolean(m.org))
                .sort((a, b) => a.org.name.localeCompare(b.org.name));
        },
    });
}

export function useCreateOrganization() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (name: string) => {
            const {data, error} = await supabase.rpc("create_organization", {p_name: name});
            if (error) throw error;
            return data as string;
        },
        onSuccess: async (orgId) => {
            rememberOrg(orgId);
            await qc.invalidateQueries({queryKey: ["memberships"]});
        },
        onError: (e) => toast.error(errorMessage(e)),
    });
}

export function useRenameOrganization(orgId: string) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (name: string) => {
            const {error} = await supabase.from("organizations").update({name: name.trim()}).eq("id", orgId);
            if (error) throw error;
        },
        onSuccess: () => {
            toast.success("Organization renamed");
            qc.invalidateQueries({queryKey: ["memberships"]});
        },
        onError: (e) => toast.error(errorMessage(e)),
    });
}

export function useDeleteOrganization() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (orgId: string) => {
            const {error} = await supabase.from("organizations").delete().eq("id", orgId);
            if (error) throw error;
        },
        onSuccess: () => {
            toast.success("Organization deleted");
            qc.invalidateQueries({queryKey: ["memberships"]});
        },
        onError: (e) => toast.error(errorMessage(e)),
    });
}

export function useMembers(orgId: string) {
    return useQuery({
        queryKey: orgKeys.members(orgId),
        queryFn: async (): Promise<Member[]> => {
            const {data, error} = await supabase.from("organization_members").select("*").eq("org_id", orgId).order("added_at");
            if (error) throw error;
            return data ?? [];
        },
    });
}

export function useMemberMutations(orgId: string) {
    const qc = useQueryClient();
    const {email: me} = useAuth();
    const refresh = () => {
        qc.invalidateQueries({queryKey: orgKeys.members(orgId)});
        qc.invalidateQueries({queryKey: ["memberships"]});
    };
    const add = useMutation({
        mutationFn: async ({email, role}: {email: string; role: Role}) => {
            const {error} = await supabase.from("organization_members").insert({org_id: orgId, email: email.trim().toLowerCase(), role, invited_by: me});
            if (error) throw error;
        },
        onSuccess: () => {
            toast.success("Access granted");
            refresh();
        },
        onError: (e) => toast.error((e as {code?: string}).code === "23505" ? "That email already has access." : errorMessage(e)),
    });
    const setRole = useMutation({
        mutationFn: async ({email, role}: {email: string; role: Role}) => {
            const {error} = await supabase.from("organization_members").update({role}).eq("org_id", orgId).eq("email", email);
            if (error) throw error;
        },
        onSuccess: () => {
            toast.success("Role updated");
            refresh();
        },
        onError: (e) => {
            toast.error(errorMessage(e));
            refresh();
        },
    });
    const remove = useMutation({
        mutationFn: async (email: string) => {
            const {error} = await supabase.from("organization_members").delete().eq("org_id", orgId).eq("email", email);
            if (error) throw error;
        },
        onSuccess: (_d, email) => {
            toast.success(email === me ? "You left the organization" : "Access removed");
            refresh();
        },
        onError: (e) => toast.error(errorMessage(e)),
    });
    return {add, setRole, remove};
}
