import {createContext, type ReactNode, useContext} from "react";
import type {Organization, Role} from "@/lib/types";

export interface OrgContextValue {
    org: Organization;
    role: Role;
    canEdit: boolean;
    isOwner: boolean;
}

const OrgContext = createContext<OrgContextValue | null>(null);

export function OrgProvider({value, children}: {value: OrgContextValue; children: ReactNode}) {
    return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>;
}

/** Null outside organization routes (e.g. the organizations list). */
// eslint-disable-next-line react-refresh/only-export-components
export function useOptionalOrg(): OrgContextValue | null {
    return useContext(OrgContext);
}

/** The organization in the current URL (/o/:orgId/...) and the user's role in it. */
// eslint-disable-next-line react-refresh/only-export-components
export function useOrg(): OrgContextValue {
    const ctx = useContext(OrgContext);
    if (!ctx) throw new Error("useOrg must be used inside an organization route");
    return ctx;
}
