import {useCallback, useEffect, useRef, useState} from "react";
import {toast} from "sonner";
import {errorMessage} from "@/lib/supabase";
import type {GmailSender} from "@/lib/gmail";
import type {InvestorUpdate} from "@/lib/types";
import {type SendProgress, sendUpdate, useRefreshAfterSend} from "@/hooks/useUpdates";

/**
 * Runs a send and reports progress. Lives on the update page (not in the composer) so the progress
 * stays on screen when the page switches from the draft to the sent view mid-way.
 */
export function useSendRunner(orgId: string) {
    const [progress, setProgress] = useState<SendProgress | null>(null);
    const stopRef = useRef(false);
    const refresh = useRefreshAfterSend(orgId);
    const sending = progress !== null;

    // Closing the tab mid-send stops it; ask first. What was sent is recorded either way.
    useEffect(() => {
        if (!sending) return;
        const warn = (e: BeforeUnloadEvent) => {
            e.preventDefault();
        };
        window.addEventListener("beforeunload", warn);
        return () => window.removeEventListener("beforeunload", warn);
    }, [sending]);

    const run = useCallback(async (update: Pick<InvestorUpdate, "id" | "subject" | "body_html">, sender: GmailSender) => {
        stopRef.current = false;
        setProgress({done: 0, total: 0, failed: 0});
        try {
            const status = await sendUpdate(update, sender, setProgress, () => stopRef.current);
            if (status === "sent") toast.success("Update sent to everyone");
            else if (status === "partial") toast.warning("Some emails didn't go out. You can retry them.");
            else toast.error("No emails went out. Check the errors and retry.");
        } catch (e) {
            toast.error(errorMessage(e));
        } finally {
            setProgress(null);
            refresh(update.id);
        }
    }, [refresh]);

    const stop = useCallback(() => {
        stopRef.current = true;
    }, []);

    return {progress, sending, run, stop};
}

export type SendRunner = ReturnType<typeof useSendRunner>;
