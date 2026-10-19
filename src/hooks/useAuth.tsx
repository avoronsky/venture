import {createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState} from "react";
import type {Session} from "@supabase/supabase-js";
import {appBaseUrl, supabase} from "@/lib/supabase";

interface AuthContextValue {
    session: Session | null;
    /** Lower-cased verified email; memberships are matched on it. */
    email: string | null;
    loading: boolean;
    signInWithGoogle: () => Promise<{error: string | null}>;
    signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({children}: {children: ReactNode}) {
    const [session, setSession] = useState<Session | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const {data} = supabase.auth.onAuthStateChange((_event, next) => {
            setSession(next);
            setLoading(false);
        });
        return () => data.subscription.unsubscribe();
    }, []);

    const signInWithGoogle = useCallback(async () => {
        const {error} = await supabase.auth.signInWithOAuth({
            provider: "google",
            options: {redirectTo: appBaseUrl(), queryParams: {prompt: "select_account"}},
        });
        if (!error) return {error: null};
        return {
            error: /provider is not enabled|Unsupported provider/i.test(error.message)
                ? "Google sign-in isn't enabled in Supabase yet. Turn on the Google provider, then try again."
                : error.message,
        };
    }, []);

    const signOut = useCallback(async () => {
        await supabase.auth.signOut();
    }, []);

    const value = useMemo<AuthContextValue>(() => ({
        session,
        email: session?.user.email?.toLowerCase() ?? null,
        loading,
        signInWithGoogle,
        signOut,
    }), [session, loading, signInWithGoogle, signOut]);

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
    return ctx;
}
