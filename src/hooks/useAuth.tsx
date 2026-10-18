import {createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState} from "react";
import type {Session} from "@supabase/supabase-js";
import {appBaseUrl, supabase} from "@/lib/supabase";
import type {Role} from "@/lib/types";

interface AuthContextValue {
    session: Session | null;
    email: string | null;
    /** null = signed in but not on the member list. */
    role: Role | null;
    loading: boolean;
    canEdit: boolean;
    isOwner: boolean;
    sendSignInLink: (email: string) => Promise<{error: string | null}>;
    signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({children}: {children: ReactNode}) {
    const [session, setSession] = useState<Session | null>(null);
    const [role, setRole] = useState<Role | null>(null);
    const [loading, setLoading] = useState(true);
    const userId = useRef<string | null | undefined>(undefined);

    useEffect(() => {
        const {data} = supabase.auth.onAuthStateChange((event, next) => {
            const uid = next?.user.id ?? null;
            setSession(next);
            // Token refreshes keep the same user; only re-check the role when the user changes.
            if (uid === userId.current && event !== "SIGNED_OUT") return;
            userId.current = uid;
            if (!next) {
                setRole(null);
                setLoading(false);
                return;
            }
            setLoading(true);
            // Defer: calling Supabase inside the auth callback can deadlock the client.
            setTimeout(async () => {
                const {data: r, error} = await supabase.rpc("member_role");
                setRole(error ? null : ((r as Role | null) ?? null));
                setLoading(false);
            }, 0);
        });
        return () => data.subscription.unsubscribe();
    }, []);

    const sendSignInLink = useCallback(async (email: string) => {
        const {error} = await supabase.auth.signInWithOtp({email, options: {emailRedirectTo: appBaseUrl()}});
        if (!error) return {error: null};
        return {error: /rate/i.test(error.message) ? "Too many requests. Wait a minute and try again." : error.message};
    }, []);

    const signOut = useCallback(async () => {
        await supabase.auth.signOut();
    }, []);

    const value = useMemo<AuthContextValue>(() => ({
        session,
        email: session?.user.email ?? null,
        role,
        loading,
        canEdit: role === "owner" || role === "editor",
        isOwner: role === "owner",
        sendSignInLink,
        signOut,
    }), [session, role, loading, sendSignInLink, signOut]);

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
    return ctx;
}
