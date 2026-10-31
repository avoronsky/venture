import {z} from "zod";
import {cleanContacts, type Contact, MAX_CONTACTS} from "@/lib/contacts";
import {linkedinHref} from "@/lib/websites";

/** A contact while it's being edited: every field is a string. */
export interface ContactDraft {
    name: string;
    role: string;
    email: string;
    linkedin: string;
}

export const emptyContact = (): ContactDraft => ({name: "", role: "", email: "", linkedin: ""});

const contactSchema = z.object({
    name: z.string().trim().max(200, "Keep it under 200 characters"),
    role: z.string().trim().max(100, "Keep it under 100 characters"),
    email: z.union([z.literal(""), z.string().trim().email("Enter a valid email")]),
    linkedin: z.string().trim().max(500).refine((v) => v === "" || linkedinHref(v) !== null, "Paste a linkedin.com link"),
}).refine((c) => c.name || c.email || c.linkedin || !c.role, {message: "Add a name, email or LinkedIn", path: ["name"]});

/** Blank rows are allowed while editing; they're dropped on save. */
export const contactsSchema = z.array(contactSchema).max(MAX_CONTACTS, `Up to ${MAX_CONTACTS} contacts`);

/** Saved contacts as editable rows; one blank row when there are none, so there's somewhere to type. */
export function toContactDrafts(list: Contact[]): ContactDraft[] {
    const rows = list.map((c) => ({name: c.name ?? "", role: c.role ?? "", email: c.email ?? "", linkedin: c.linkedin ?? ""}));
    return rows.length ? rows : [emptyContact()];
}

export function fromContactDrafts(rows: ContactDraft[]): Contact[] {
    return cleanContacts(rows);
}
