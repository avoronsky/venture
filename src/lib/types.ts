import type {Mandate, Priority, StageId} from "./pipeline";

export type Role = "owner" | "editor" | "viewer";

export interface Organization {
    id: string;
    name: string;
    created_at: string;
}

/** An organization the signed-in user belongs to, with their role in it. */
export interface Membership {
    org: Organization;
    role: Role;
}

export interface Member {
    org_id: string;
    email: string;
    role: Role;
    invited_by: string | null;
    added_at: string;
}

export interface Investor {
    id: string;
    org_id: string;
    name: string;
    partner: string;
    email: string;
    type: string;
    stage: StageId;
    priority: Priority;
    mandate: Mandate;
    check_min: number;
    check_max: number;
    amount: number;
    can_lead: boolean;
    via: string;
    geo: string;
    next_step: string;
    next_date: string | null;
    last_contact: string | null;
    notes: string;
    created_by: string | null;
    created_at: string;
    updated_at: string;
}

export type InvestorInput = Omit<Investor, "id" | "org_id" | "created_by" | "created_at" | "updated_at">;

export interface Activity {
    id: number;
    org_id: string;
    investor_id: string;
    kind: "note" | "stage" | "system";
    body: string;
    /** The day it happened, chosen by the author (defaults to the day it was written). */
    occurred_on: string;
    /** Who wrote it, or who caused a stage change. Null for history recorded before comments existed. */
    author_email: string | null;
    edited_at: string | null;
    created_by: string | null;
    created_at: string;
}

export interface CommentStats {
    investor_id: string;
    comment_count: number;
    last_comment_on: string | null;
}

export interface FundRound {
    org_id: string;
    name: string;
    target: number;
    instrument: string;
    cap: number;
    close_date: string | null;
    updated_at: string;
}

export type FundRoundInput = Omit<FundRound, "org_id" | "updated_at">;
