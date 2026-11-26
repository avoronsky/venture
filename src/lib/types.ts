import type {Mandate, Priority, StageId} from "./pipeline";
import type {Contact} from "./contacts";

export type {Contact};

export type Role = "owner" | "editor" | "viewer";

export interface Organization {
    id: string;
    name: string;
    /** ISO 4217 code; all rounds in the organization use it. */
    currency: string;
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
    website: string;
    /** People at the investor; the first one is shown on cards. */
    contacts: Contact[];
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
    contacts: Contact[];
    min_check: number;
    created_at: string;
    updated_at: string;
}

export type MyInvestorInput = Pick<MyInvestor, "name" | "type" | "website" | "contacts" | "min_check">;

export interface MyInvestorComment {
    id: number;
    investor_id: string;
    kind: "note";
    body: string;
    occurred_on: string;
    created_at: string;
    edited_at: string | null;
}

/** A named list of people an organization sends investor updates to. */
export interface RecipientList {
    id: string;
    org_id: string;
    name: string;
    description: string;
    created_at: string;
    updated_at: string;
}

export interface RecipientListMember {
    id: string;
    list_id: string;
    org_id: string;
    email: string;
    name: string;
    firm: string;
    /** The pipeline investor this person was picked from, if any. */
    investor_id: string | null;
    created_at: string;
}

export type RecipientInput = Pick<RecipientListMember, "email" | "name" | "firm"> & {investor_id?: string | null};

/** draft → sending → sent, partial (some failed) or failed (none went out). */
export type UpdateStatus = "draft" | "sending" | "sent" | "partial" | "failed";

/** One investor update email. Only drafts can change. */
export interface InvestorUpdate {
    id: string;
    org_id: string;
    subject: string;
    body_html: string;
    status: UpdateStatus;
    list_id: string | null;
    /** The list's name when it was sent, kept if the list is renamed or deleted. */
    list_name: string | null;
    /** The Gmail account it was sent from. */
    sender_email: string | null;
    author_email: string | null;
    created_at: string;
    updated_at: string;
    sent_at: string | null;
}

/** The outcome for one recipient of a sent update. */
export interface UpdateDelivery {
    id: number;
    update_id: string;
    org_id: string;
    email: string;
    name: string;
    firm: string;
    status: "pending" | "sent" | "failed";
    error: string | null;
    gmail_message_id: string | null;
    attempts: number;
    sent_at: string | null;
    updated_at: string;
}
