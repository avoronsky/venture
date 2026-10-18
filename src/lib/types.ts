import type {Mandate, Priority, StageId} from "./pipeline";

export type Role = "owner" | "editor" | "viewer";

export interface Investor {
    id: string;
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

export type InvestorInput = Omit<Investor, "id" | "created_by" | "created_at" | "updated_at">;

export interface Activity {
    id: number;
    investor_id: string;
    kind: "note" | "stage" | "system";
    body: string;
    occurred_on: string;
    created_by: string | null;
    created_at: string;
}

export interface FundRound {
    id: true;
    name: string;
    target: number;
    instrument: string;
    cap: number;
    close_date: string | null;
    updated_at: string;
}

export type FundRoundInput = Omit<FundRound, "id" | "updated_at">;

export interface Member {
    email: string;
    role: Role;
    added_at: string;
}
