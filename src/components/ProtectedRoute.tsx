import type {ReactNode} from "react";
import {Navigate, useLocation} from "react-router-dom";
import {ShieldOff} from "lucide-react";
import {useAuth} from "@/hooks/useAuth";
import {Button} from "@/components/ui/button";
import {FullPageSpinner} from "@/components/FullPageSpinner";
import {AuthShell} from "@/components/AuthShell";

interface ProtectedRouteProps {
    children: ReactNode;
    ownerOnly?: boolean;
}

export function ProtectedRoute({children, ownerOnly = false}: ProtectedRouteProps) {
    const {session, role, loading, email, signOut} = useAuth();
    const location = useLocation();

    if (loading) return <FullPageSpinner label="Checking access…"/>;
    if (!session) return <Navigate to="/auth" replace state={{from: location.pathname}}/>;

    if (!role) {
        return (
            <AuthShell>
                <ShieldOff className="h-8 w-8 text-muted-foreground"/>
                <h1 className="text-2xl font-bold">No access yet</h1>
                <p className="text-muted-foreground">
                    You're signed in as <span className="font-medium text-foreground">{email}</span>, but this email isn't on the
                    pipeline's member list. Ask the owner to add it, then reload this page.
                </p>
                <Button variant="outline" onClick={() => signOut()}>Sign out</Button>
            </AuthShell>
        );
    }

    if (ownerOnly && role !== "owner") return <Navigate to="/" replace/>;

    return <>{children}</>;
}
