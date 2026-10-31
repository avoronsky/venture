import {useEffect, useRef} from "react";
import {Plus, X} from "lucide-react";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {MAX_CONTACTS} from "@/lib/contacts";
import {type ContactDraft, emptyContact} from "./contactsForm";

type ContactErrors = Partial<Record<keyof ContactDraft, {message?: string}>> | undefined;

interface ContactsEditorProps {
    value: ContactDraft[];
    onChange: (rows: ContactDraft[]) => void;
    errors?: ContactErrors[];
    disabled?: boolean;
}

/** The people at an investor: one card per contact with name, role, email and LinkedIn. */
export function ContactsEditor({value, onChange, errors, disabled}: ContactsEditorProps) {
    const focusRow = useRef<number | null>(null);
    const listRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (focusRow.current === null) return;
        listRef.current?.querySelector<HTMLInputElement>(`[data-contact-row="${focusRow.current}"] input`)?.focus();
        focusRow.current = null;
    }, [value.length]);

    const update = (i: number, key: keyof ContactDraft, v: string) =>
        onChange(value.map((row, j) => (j === i ? {...row, [key]: v} : row)));
    const remove = (i: number) => onChange(value.length === 1 ? [emptyContact()] : value.filter((_, j) => j !== i));
    const add = () => {
        focusRow.current = value.length;
        onChange([...value, emptyContact()]);
    };

    return (
        <div ref={listRef} className="flex flex-col gap-3">
            {value.map((row, i) => {
                const err = errors?.[i];
                const label = row.name.trim() || `Contact ${i + 1}`;
                return (
                    <fieldset key={i} data-contact-row={i} className="relative rounded-lg border bg-card p-3 pt-2.5">
                        <legend className="sr-only">{label}</legend>
                        <div className="mb-2 flex items-center justify-between gap-2">
                            <span className="text-xs font-medium text-muted-foreground">{i === 0 ? "Main contact" : `Contact ${i + 1}`}</span>
                            {!disabled && (value.length > 1 || Object.values(row).some((v) => v.trim())) && (
                                <Button type="button" variant="ghost" size="icon" className="-my-1 -mr-1.5 h-7 w-7 text-muted-foreground"
                                        aria-label={`Remove ${label}`} onClick={() => remove(i)}>
                                    <X className="h-4 w-4"/>
                                </Button>
                            )}
                        </div>
                        <div className="grid grid-cols-1 gap-x-3 gap-y-2.5 sm:grid-cols-2">
                            <Cell id={`c${i}-name`} label="Name" error={err?.name?.message}>
                                <Input id={`c${i}-name`} value={row.name} onChange={(e) => update(i, "name", e.target.value)} placeholder="Full name"/>
                            </Cell>
                            <Cell id={`c${i}-role`} label="Role" error={err?.role?.message}>
                                <Input id={`c${i}-role`} value={row.role} onChange={(e) => update(i, "role", e.target.value)} placeholder="Partner, associate…"/>
                            </Cell>
                            <Cell id={`c${i}-email`} label="Email" error={err?.email?.message}>
                                <Input id={`c${i}-email`} type="email" value={row.email} onChange={(e) => update(i, "email", e.target.value)} placeholder="name@fund.vc"/>
                            </Cell>
                            <Cell id={`c${i}-li`} label="LinkedIn" error={err?.linkedin?.message}>
                                <Input id={`c${i}-li`} inputMode="url" value={row.linkedin} onChange={(e) => update(i, "linkedin", e.target.value)} placeholder="linkedin.com/in/name"/>
                            </Cell>
                        </div>
                    </fieldset>
                );
            })}
            {!disabled && value.length < MAX_CONTACTS && (
                <Button type="button" variant="outline" size="sm" className="self-start" onClick={add}><Plus/>Add contact</Button>
            )}
        </div>
    );
}

function Cell({id, label, error, children}: {id: string; label: string; error?: string; children: React.ReactNode}) {
    return (
        <div className="flex min-w-0 flex-col gap-1">
            <Label htmlFor={id} className="text-xs font-medium text-muted-foreground">{label}</Label>
            {children}
            {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
    );
}
