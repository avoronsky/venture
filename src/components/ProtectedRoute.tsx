import type {ReactNode} from "react";
import {Navigate, useLocation} from "react-router-dom";
import {useAuth} from "@/hooks/useAuth";
import {FullPageSpinner} from "@/components/FullPageSpinner";

/** Requires a signed-in user. Organization access is checked by OrgRoute. */
export function ProtectedRoute({children}: {children: ReactNode}) {
    const {session, loading} = useAuth();
    const location = useLocation();

    if (loading) return <FullPageSpinner/>;
    if (!session) return <Navigate to="/auth" replace state={{from: location.pathname}}/>;
    return <>{children}</>;
}
