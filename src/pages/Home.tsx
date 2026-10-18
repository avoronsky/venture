import {Navigate} from "react-router-dom";
import {AlertCircle} from "lucide-react";
import {useAuth} from "@/hooks/useAuth";
import {lastOrg, useMyOrganizations} from "@/hooks/useOrganizations";
import {Button} from "@/components/ui/button";
import {AuthShell} from "@/components/AuthShell";
import {FullPageSpinner} from "@/components/FullPageSpinner";
import {CreateOrganizationForm} from "@/components/CreateOrganizationForm";

/** Sends the user to their last organization; a new user creates their first one here. */
export default function Home() {
    const {email, signOut} = useAuth();
    const {data: memberships, isLoading, isError, refetch} = useMyOrganizations();

    if (isLoading) return <FullPageSpinner/>;
    if (isError) {
        return (
            <AuthShell showIntro={false}>
                <AlertCircle className="h-8 w-8 text-destructive"/>
                <h1 className="text-2xl font-bold">Couldn't load your organizations</h1>
                <Button variant="outline" onClick={() => refetch()}>Try again</Button>
            </AuthShell>
        );
    }

    if (memberships && memberships.length > 0) {
        const remembered = lastOrg();
        const target = memberships.find((m) => m.org.id === remembered) ?? memberships[0];
        return <Navigate to={`/o/${target.org.id}`} replace/>;
    }

    return (
        <AuthShell>
            <div>
                <h1 className="text-[1.75rem] font-bold leading-tight tracking-[-0.025em]">Set up your raise</h1>
            </div>
            <p className="text-muted-foreground">
                Create an organization for the company you're raising for. You'll be its owner and can give teammates
                access afterwards.
            </p>
            <CreateOrganizationForm autoFocus/>
            <p className="text-sm text-muted-foreground">
                Expecting to join a teammate's organization? Ask them to add <span className="font-medium text-foreground">{email}</span>,
                then reload this page.
            </p>
            <Button variant="link" className="h-auto p-0 text-muted-foreground" onClick={() => signOut()}>Sign out</Button>
        </AuthShell>
    );
}
