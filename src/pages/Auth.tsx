import {type FormEvent, useState} from "react";
import {Navigate, useLocation} from "react-router-dom";
import {CheckCircle2, Loader2, Mail} from "lucide-react";
import {useAuth} from "@/hooks/useAuth";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {Separator} from "@/components/ui/separator";
import {AuthShell} from "@/components/AuthShell";
import {FullPageSpinner} from "@/components/FullPageSpinner";

function GoogleMark() {
    return (
        <svg viewBox="0 0 48 48" aria-hidden="true" className="h-4 w-4">
            <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/>
            <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
            <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
            <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/>
        </svg>
    );
}

export default function Auth() {
    const {session, loading, sendSignInLink, signInWithGoogle} = useAuth();
    const location = useLocation();
    const [email, setEmail] = useState("");
    const [sending, setSending] = useState(false);
    const [redirecting, setRedirecting] = useState(false);
    const [sentTo, setSentTo] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    if (loading) return <FullPageSpinner/>;
    if (session) {
        const from = (location.state as {from?: string} | null)?.from;
        return <Navigate to={from && from !== "/auth" ? from : "/"} replace/>;
    }

    const onEmail = async (e: FormEvent) => {
        e.preventDefault();
        setSending(true);
        setError(null);
        const {error: err} = await sendSignInLink(email.trim());
        setSending(false);
        if (err) setError(err);
        else setSentTo(email.trim());
    };

    const onGoogle = async () => {
        setRedirecting(true);
        setError(null);
        const {error: err} = await signInWithGoogle();
        if (err) {
            setRedirecting(false);
            setError(err);
        }
    };

    return (
        <AuthShell>
            <div>
                <h1 className="text-[1.75rem] font-bold leading-tight tracking-[-0.025em]">Sign in to Venture</h1>
                <p className="mt-1.5 text-muted-foreground">Use your Google account, or get a one-time sign-in link by email.</p>
            </div>

            {sentTo ? (
                <div className="flex w-full gap-3 rounded-lg bg-success-soft p-4 text-success">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0"/>
                    <p className="text-sm">We sent a sign-in link to <span className="font-semibold">{sentTo}</span>. Open it on this device to continue.</p>
                </div>
            ) : (
                <div className="flex w-full flex-col gap-4">
                    <Button type="button" variant="outline" size="lg" className="w-full" onClick={onGoogle} disabled={redirecting}>
                        {redirecting ? <Loader2 className="animate-spin"/> : <GoogleMark/>}
                        Continue with Google
                    </Button>

                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <Separator className="flex-1"/>or<Separator className="flex-1"/>
                    </div>

                    <form onSubmit={onEmail} className="flex flex-col gap-3">
                        <div className="flex flex-col gap-1.5">
                            <Label htmlFor="email">Work email</Label>
                            <Input id="email" type="email" autoComplete="email" required placeholder="you@company.com"
                                   value={email} onChange={(e) => setEmail(e.target.value)}/>
                        </div>
                        <Button type="submit" size="lg" disabled={sending}>
                            {sending ? <Loader2 className="animate-spin"/> : <Mail/>}
                            Email me a sign-in link
                        </Button>
                    </form>
                </div>
            )}
            {error && <p className="w-full rounded-md bg-destructive-soft px-3 py-2 text-sm text-destructive">{error}</p>}
        </AuthShell>
    );
}
