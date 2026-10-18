import {createClient} from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(url && key);

// Created with placeholders when unconfigured so imports never crash; the app shows a setup screen instead.
export const supabase = createClient(url || "http://localhost", key || "public-anon-key", {
    auth: {persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "pkce"},
});

/** Absolute URL of the app root, used as the sign-in link target. */
export function appBaseUrl(): string {
    return new URL(import.meta.env.BASE_URL, window.location.origin).toString();
}

export function errorMessage(error: unknown): string {
    const e = error as {code?: string; message?: string} | null;
    const m = e?.message ?? "";
    if (e?.code === "42501" || /row-level security/i.test(m)) return "You have view access only, so changes can't be saved.";
    if (e?.code === "23505") return "That record already exists.";
    if (/JWT|session/i.test(m)) return "Your session expired. Sign in again.";
    return m || "Something went wrong. Check your connection and try again.";
}
