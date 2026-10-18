import {useEffect} from "react";
import {Link, Outlet, useParams} from "react-router-dom";
import {AlertCircle, ShieldOff} from "lucide-react";
import {useAuth} from "@/hooks/useAuth";
import {rememberOrg, useMyOrganizations} from "@/hooks/useOrganizations";
import {OrgProvider} from "@/hooks/useOrg";
import {usePipelineRealtime} from "@/hooks/usePipeline";
import {Button} from "@/components/ui/button";
import {AuthShell} from "@/components/AuthShell";
import {FullPageSpinner} from "@/components/FullPageSpinner";

/** Resolves /o/:orgId against the user's memberships and provides the org to child routes. */
export function OrgRoute() {
    const {orgId} = useParams();
    const {email, signOut} = useAuth();
    const {data: memberships, isPending, isFetching, isError, refetch} = useMyOrganizations();
    const membership = memberships?.find((m) => m.org.id === orgId);
    usePipelineRealtime(membership?.org.id);

    useEffect(() => {
        if (membership) rememberOrg(membership.org.id);
    }, [membership]);

    const found = memberships?.some((m) => m.org.id === orgId);
    // Wait for a definite answer before showing "no access" (e.g. right after being added).
    if (isPending || (!found && isFetching)) return <FullPageSpinner/>;
    if (isError) {
        return (
            <AuthShell showIntro={false}>
                <AlertCircle className="h-8 w-8 text-destructive"/>
                <h1 className="text-2xl font-bold">Couldn't load your organizations</h1>
                <Button variant="outline" onClick={() => refetch()}>Try again</Button>
            </AuthShell>
        );
    }
    if (!membership) {
        return (
            <AuthShell showIntro={false}>
                <ShieldOff className="h-8 w-8 text-muted-foreground"/>
                <h1 className="text-2xl font-bold">No access to this organization</h1>
                <p className="text-muted-foreground">
                    You're signed in as <span className="font-medium text-foreground">{email}</span>. Ask an owner of the
                    organization to add this email, or open one of your own organizations.
                </p>
                <div className="flex flex-wrap gap-2">
                    <Button asChild><Link to="/orgs">Your organizations</Link></Button>
                    <Button variant="outline" onClick={() => signOut()}>Sign out</Button>
                </div>
            </AuthShell>
        );
    }

    const {org, role} = membership;
    return (
        <OrgProvider value={{org, role, canEdit: role === "owner" || role === "editor", isOwner: role === "owner"}}>
            <Outlet/>
        </OrgProvider>
    );
}
