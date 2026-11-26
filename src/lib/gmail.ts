// Sending email with the signed-in person's own Gmail account, straight from the browser.
//
// Google Identity Services gives the page a short-lived access token (about an hour) with the
// gmail.send scope after the person approves it in a Google popup. Nothing is stored: not in the
// database, not in localStorage. The token lives in memory until it expires or the tab closes.
//
// Setup: VITE_GOOGLE_CLIENT_ID is a Web OAuth client in a Google Cloud project with the Gmail API
// enabled, whose authorized JavaScript origins include the app's origin (see README).

import {base64Url, buildMessage, type MessageInput} from "./mime";

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
export const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";
const SCOPES = `${GMAIL_SEND_SCOPE} openid email profile`;

export const isGmailConfigured = Boolean(CLIENT_ID);

/** The Gmail account the page may send from, and until when. */
export interface GmailSender {
    email: string;
    name: string;
    accessToken: string;
    expiresAt: number;
}

/* ---------- Google Identity Services (minimal typings) ---------- */

interface TokenResponse {
    access_token?: string;
    expires_in?: number | string;
    scope?: string;
    error?: string;
    error_description?: string;
}

interface TokenClient {
    requestAccessToken(overrides?: {prompt?: string; login_hint?: string}): void;
}

interface GoogleOAuth2 {
    initTokenClient(config: {
        client_id: string;
        scope: string;
        login_hint?: string;
        include_granted_scopes?: boolean;
        callback: (r: TokenResponse) => void;
        error_callback?: (e: {type: string; message?: string}) => void;
    }): TokenClient;
    hasGrantedAllScopes(r: TokenResponse, ...scopes: string[]): boolean;
    revoke(token: string, done?: () => void): void;
}

declare global {
    interface Window {
        google?: {accounts?: {oauth2?: GoogleOAuth2}};
    }
}

let gisPromise: Promise<GoogleOAuth2> | null = null;

function loadGis(): Promise<GoogleOAuth2> {
    if (window.google?.accounts?.oauth2) return Promise.resolve(window.google.accounts.oauth2);
    gisPromise ??= new Promise<GoogleOAuth2>((resolve, reject) => {
        const s = document.createElement("script");
        s.src = "https://accounts.google.com/gsi/client";
        s.async = true;
        s.onload = () => (window.google?.accounts?.oauth2 ? resolve(window.google.accounts.oauth2) : reject(new Error("Google sign-in didn't load.")));
        s.onerror = () => {
            gisPromise = null;
            reject(new Error("Couldn't reach Google. Check your connection or ad blocker and try again."));
        };
        document.head.append(s);
    });
    return gisPromise;
}

/** Load Google's script ahead of time so the popup opens right on the click (browsers block late popups). */
export function preloadGmail(): void {
    if (isGmailConfigured) loadGis().catch(() => undefined);
}

let current: GmailSender | null = null;

/** The connected account if its token is still good for at least `minMs`. */
export function gmailSender(minMs = 60_000): GmailSender | null {
    return current && current.expiresAt - Date.now() > minMs ? current : null;
}

/**
 * Opens Google's popup and asks to send email as the person. Call it straight from a click.
 * `loginHint` pre-selects the account they signed in to the app with.
 */
export async function connectGmail(loginHint?: string): Promise<GmailSender> {
    if (!CLIENT_ID) throw new Error("Gmail sending isn't set up: VITE_GOOGLE_CLIENT_ID is missing.");
    const oauth2 = await loadGis();
    const response = await new Promise<TokenResponse>((resolve, reject) => {
        const client = oauth2.initTokenClient({
            client_id: CLIENT_ID,
            scope: SCOPES,
            login_hint: loginHint,
            include_granted_scopes: true,
            callback: resolve,
            error_callback: (e) => reject(new Error(
                e.type === "popup_closed" ? "The Google window was closed before access was given."
                    : e.type === "popup_failed_to_open" ? "The browser blocked Google's window. Allow pop-ups for this site and try again."
                        : e.message || "Google didn't give access.")),
        });
        client.requestAccessToken();
    });
    if (response.error || !response.access_token) {
        throw new Error(response.error === "access_denied" ? "Access to Gmail wasn't given." : response.error_description || response.error || "Google didn't give access.");
    }
    if (!oauth2.hasGrantedAllScopes(response, GMAIL_SEND_SCOPE)) {
        throw new Error("Tick the box that lets the app send email on your behalf, then try again.");
    }

    const info = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {headers: {Authorization: `Bearer ${response.access_token}`}});
    if (!info.ok) throw new Error("Couldn't read which Google account was chosen. Try again.");
    const me = await info.json() as {email?: string; name?: string};
    if (!me.email) throw new Error("Google didn't share the account's email address. Try again.");

    current = {
        email: me.email.toLowerCase(),
        name: me.name ?? "",
        accessToken: response.access_token,
        expiresAt: Date.now() + (Number(response.expires_in) || 3600) * 1000,
    };
    return current;
}

/** Forget the token here and revoke it at Google. */
export function disconnectGmail(): void {
    const token = current?.accessToken;
    current = null;
    if (token) window.google?.accounts?.oauth2?.revoke(token);
}

export class GmailError extends Error {
    /** Worth trying again later (rate limits, Google hiccups), as opposed to a bad address or lost access. */
    retryable: boolean;
    /** The token stopped working; connect again. */
    authExpired: boolean;

    constructor(message: string, {retryable = false, authExpired = false} = {}) {
        super(message);
        this.retryable = retryable;
        this.authExpired = authExpired;
    }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Sends one message from the connected account. Returns Gmail's message id. Retries rate limits a few times. */
export async function sendGmail(sender: GmailSender, message: Omit<MessageInput, "from">): Promise<string> {
    const raw = base64Url(buildMessage({...message, from: {email: sender.email, name: sender.name}}));
    for (let attempt = 0; ; attempt++) {
        let res: Response;
        try {
            res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
                method: "POST",
                headers: {Authorization: `Bearer ${sender.accessToken}`, "Content-Type": "application/json"},
                body: JSON.stringify({raw}),
            });
        } catch {
            if (attempt < 2) {
                await sleep(1500 * (attempt + 1));
                continue;
            }
            throw new GmailError("Couldn't reach Gmail. Check your connection.", {retryable: true});
        }
        if (res.ok) return ((await res.json()) as {id: string}).id;

        const body = await res.json().catch(() => null) as {error?: {message?: string; errors?: {reason?: string}[]}} | null;
        const reason = body?.error?.errors?.[0]?.reason ?? "";
        const text = body?.error?.message ?? `Gmail answered ${res.status}`;
        if (res.status === 401) {
            if (current?.accessToken === sender.accessToken) current = null;
            throw new GmailError("Gmail access expired. Connect Gmail again and retry.", {authExpired: true});
        }
        const rateLimited = res.status === 429 || /rateLimit|userRateLimit|quotaExceeded/i.test(reason);
        if ((rateLimited || res.status >= 500) && attempt < 3) {
            await sleep(2000 * 2 ** attempt);
            continue;
        }
        if (/dailyLimitExceeded|quotaExceeded/i.test(reason) || /sending limit/i.test(text)) {
            throw new GmailError("Gmail's daily sending limit was reached. Retry tomorrow.", {retryable: true});
        }
        throw new GmailError(text, {retryable: rateLimited || res.status >= 500});
    }
}
