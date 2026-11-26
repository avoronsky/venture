import {useCallback, useEffect, useState} from "react";
import {toast} from "sonner";
import {useAuth} from "@/hooks/useAuth";
import {connectGmail, disconnectGmail, type GmailSender, gmailSender, isGmailConfigured, preloadGmail} from "@/lib/gmail";

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

/**
 * The Gmail account this tab can send from. Shared by every component on the page; it drops back to
 * "not connected" when Google's token is about to expire, so sending never starts with a dead token.
 */
export function useGmail() {
    const {email} = useAuth();
    const [sender, setSender] = useState<GmailSender | null>(() => gmailSender());
    const [connecting, setConnecting] = useState(false);

    useEffect(() => {
        preloadGmail();
        const sync = () => setSender(gmailSender());
        listeners.add(sync);
        const timer = window.setInterval(sync, 30_000);
        return () => {
            listeners.delete(sync);
            window.clearInterval(timer);
        };
    }, []);

    /** Opens Google's popup. Call it straight from a click. Resolves to the account, or null if it didn't work. */
    const connect = useCallback(async (): Promise<GmailSender | null> => {
        setConnecting(true);
        try {
            const s = await connectGmail(email ?? undefined);
            notify();
            if (email && s.email !== email) toast.info(`Emails will be sent from ${s.email}`);
            return s;
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Couldn't connect Gmail.");
            return null;
        } finally {
            setConnecting(false);
        }
    }, [email]);

    const disconnect = useCallback(() => {
        disconnectGmail();
        notify();
    }, []);

    /** The connected account if it has at least `minMs` left, otherwise connect first. */
    const ensure = useCallback(async (minMs = 5 * 60_000) => gmailSender(minMs) ?? connect(), [connect]);

    return {configured: isGmailConfigured, sender, connecting, connect, disconnect, ensure};
}
