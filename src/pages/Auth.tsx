import {type FormEvent, useState} from "react";
import {Navigate} from "react-router-dom";
import {CheckCircle2, Loader2, Mail} from "lucide-react";
import {useAuth} from "@/hooks/useAuth";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {AuthShell} from "@/components/AuthShell";
import {FullPageSpinner} from "@/components/FullPageSpinner";

export default function Auth() {
    const {session, loading, sendSignInLink} = useAuth();
    const [email, setEmail] = useState("");
    const [sending, setSending] = useState(false);
    const [sentTo, setSentTo] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    if (loading) return <FullPageSpinner/>;
    if (session) return <Navigate to="/" replace/>;

    const onSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setSending(true);
        setError(null);
        const {error: err} = await sendSignInLink(email.trim());
        setSending(false);
        if (err) setError(err);
        else setSentTo(email.trim());
    };

    return (
        <AuthShell>
            <p className="eyebrow">Mars Rovers</p>
            <h1 className="text-3xl font-bold leading-tight">Raise Pipeline</h1>
            {sentTo ? (
                <div className="flex gap-3 rounded-lg bg-success-soft p-4 text-success">
                    <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5"/>
                    <p className="text-sm">
                        Check <span className="font-semibold">{sentTo}</span> for a sign-in link. You can close this tab.
                    </p>
                </div>
            ) : (
                <>
                    <p className="text-muted-foreground">Sign in with your work email. We'll send you a one-time sign-in link.</p>
                    <form onSubmit={onSubmit} className="flex w-full flex-col gap-3">
                        <div className="flex flex-col gap-1.5">
                            <Label htmlFor="email">Email</Label>
                            <Input id="email" type="email" autoComplete="email" required placeholder="you@company.com"
                                   value={email} onChange={(e) => setEmail(e.target.value)}/>
                        </div>
                        <Button type="submit" disabled={sending}>
                            {sending ? <Loader2 className="animate-spin"/> : <Mail/>}
                            Email me a sign-in link
                        </Button>
                        {error && <p className="rounded-md bg-destructive-soft px-3 py-2 text-sm text-destructive">{error}</p>}
                    </form>
                </>
            )}
        </AuthShell>
    );
}
