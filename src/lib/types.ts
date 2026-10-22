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
    round_id: string;
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

export type InvestorInput = Omit<Investor, "id" | "org_id" | "round_id" | "created_by" | "created_at" | "updated_at">;

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

export type RoundStatus = "active" | "closed";

/** One fundraising round (Seed, Series A, a bridge...). Each round has its own pipeline of investors. */
export interface Round {
    id: string;
    org_id: string;
    name: string;
    status: RoundStatus;
    target: number;
    instrument: string;
    cap: number;
    close_date: string | null;
    created_at: string;
    updated_at: string;
}

export type RoundInput = Pick<Round, "name" | "status" | "target" | "instrument" | "cap" | "close_date">;

/** An entry in the signed-in user's private investor database. */
export interface MyInvestor {
    id: string;
    name: string;
    type: string;
    website: string;
    contact_name: string;
    contact_email: string;
    min_check: number;
    created_at: string;
    updated_at: string;
}

export type MyInvestorInput = Pick<MyInvestor, "name" | "type" | "website" | "contact_name" | "contact_email" | "min_check">;

export interface MyInvestorComment {
    id: number;
    investor_id: string;
    kind: "note";
    body: string;
    occurred_on: string;
    created_at: string;
    edited_at: string | null;
}
