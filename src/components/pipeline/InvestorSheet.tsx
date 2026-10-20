import {type ReactNode, useEffect, useState} from "react";
import {Controller, useForm} from "react-hook-form";
import {zodResolver} from "@hookform/resolvers/zod";
import {z} from "zod";
import {Loader2, Trash2} from "lucide-react";
import {Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle} from "@/components/ui/sheet";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {Textarea} from "@/components/ui/textarea";
import {Checkbox} from "@/components/ui/checkbox";
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "@/components/ui/select";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {useCommentStats, useDeleteInvestor, useSaveInvestor} from "@/hooks/usePipeline";
import {InvestorComments} from "./InvestorComments";
import {INVESTOR_TYPES, MANDATES, parseMoney, PRIORITIES, STAGE_IDS, STAGES} from "@/lib/pipeline";
import type {Investor, InvestorInput} from "@/lib/types";
import {cn} from "@/lib/utils";
import {useOrg} from "@/hooks/useOrg";

const money = z.string().trim().refine((v) => v === "" || parseMoney(v) > 0, "Use a number like 250K or 1.5M");

const schema = z.object({
    name: z.string().trim().min(1, "Add the fund or investor name"),
    partner: z.string().trim(),
    email: z.union([z.literal(""), z.string().trim().email("Enter a valid email")]),
    type: z.string(),
    geo: z.string().trim(),
    mandate: z.enum(["yes", "open", "no", "unknown"]),
    via: z.string().trim(),
    stage: z.enum(STAGE_IDS),
    priority: z.enum(["A", "B", "C"]),
    check_min: money,
    check_max: money,
    amount: money,
    can_lead: z.boolean(),
    next_step: z.string().trim(),
    next_date: z.string(),
    last_contact: z.string(),
    notes: z.string(),
});
type FormValues = z.infer<typeof schema>;

const moneyText = (n: number) => (n ? n.toLocaleString("en-US") : "");

function toForm(inv?: Investor): FormValues {
    return {
        name: inv?.name ?? "",
        partner: inv?.partner ?? "",
        email: inv?.email ?? "",
        type: inv?.type || "VC",
        geo: inv?.geo ?? "",
        mandate: inv?.mandate ?? "unknown",
        via: inv?.via ?? "",
        stage: inv?.stage ?? "target",
        priority: inv?.priority ?? "B",
        check_min: moneyText(inv?.check_min ?? 0),
        check_max: moneyText(inv?.check_max ?? 0),
        amount: moneyText(inv?.amount ?? 0),
        can_lead: inv?.can_lead ?? false,
        next_step: inv?.next_step ?? "",
        next_date: inv?.next_date ?? "",
        last_contact: inv?.last_contact ?? "",
        notes: inv?.notes ?? "",
    };
}

function toInput(v: FormValues): InvestorInput {
    return {
        ...v,
        check_min: parseMoney(v.check_min),
        check_max: parseMoney(v.check_max),
        amount: parseMoney(v.amount),
        next_date: v.next_date || null,
        last_contact: v.last_contact || null,
    };
}

interface InvestorSheetProps {
    open: boolean;
    /** undefined = create a new investor */
    investor?: Investor;
    canEdit: boolean;
    onClose: () => void;
}

export function InvestorSheet({open, investor, canEdit, onClose}: InvestorSheetProps) {
    const isNew = !investor;
    const {org} = useOrg();
    const save = useSaveInvestor(org.id);
    const del = useDeleteInvestor(org.id);
    const {data: stats} = useCommentStats(org.id);
    const commentCount = investor ? stats?.get(investor.id)?.comment_count ?? 0 : 0;
    const [tab, setTab] = useState<"comments" | "details">("comments");
    const showing = isNew ? "details" : tab;
    const {register, handleSubmit, control, reset, formState: {errors, isDirty}} = useForm<FormValues>({
        resolver: zodResolver(schema),
        defaultValues: toForm(investor),
    });

    // Reset when switching investors; keep in-progress edits when the same record refreshes in the background.
    useEffect(() => {
        reset(toForm(investor));
        setTab("comments");
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [investor?.id, open, reset]);

    const onSubmit = handleSubmit(async (values) => {
        await save.mutateAsync({id: investor?.id, values: toInput(values)});
        onClose();
    });

    const types = investor?.type && !INVESTOR_TYPES.includes(investor.type) ? [...INVESTOR_TYPES, investor.type] : INVESTOR_TYPES;

    return (
        <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
            <SheetContent className="flex w-full flex-col gap-0 p-0 outline-none sm:max-w-xl"
                          // Existing investors open on the comments timeline; don't drop focus (and a focus ring) on the first tab.
                          onOpenAutoFocus={(e) => {
                              if (!isNew) e.preventDefault();
                          }}>
                <SheetHeader className="border-b px-6 py-4 text-left">
                    <SheetTitle className="text-xl [overflow-wrap:anywhere]">{isNew ? "Add investor" : investor.name}</SheetTitle>
                    <SheetDescription>{isNew ? "Add a fund, angel or strategic to the pipeline." : `${investor.type || "Investor"}, ${STAGES.find((s) => s.id === investor.stage)?.name.toLowerCase()}`}</SheetDescription>
                    {!isNew && (
                        <div className="-mb-4 mt-3 flex gap-5" role="tablist" aria-label="Investor">
                            {([["comments", "Comments"], ["details", "Details"]] as const).map(([value, label]) => (
                                <button key={value} type="button" role="tab" aria-selected={showing === value} onClick={() => setTab(value)}
                                        className={cn("-mb-px flex items-center gap-1.5 border-b-2 pb-2.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ring",
                                            showing === value ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
                                    {label}
                                    {value === "comments" && commentCount > 0 && (
                                        <span className="rounded-full bg-foreground/10 px-1.5 text-xs tabular">{commentCount}</span>
                                    )}
                                </button>
                            ))}
                        </div>
                    )}
                </SheetHeader>

                {showing === "comments" && investor && (
                    <div className="flex-1 overflow-y-auto px-6 py-5">
                        <InvestorComments investorId={investor.id}/>
                    </div>
                )}

                <form id="investor-form" onSubmit={onSubmit} hidden={showing !== "details"} className="flex-1 overflow-y-auto px-6 py-5">
                    <fieldset disabled={!canEdit} className="flex flex-col gap-6">
                        <Section title="Investor">
                            <Field label="Fund / investor" error={errors.name?.message} full>
                                <Input {...register("name")} placeholder="e.g. Fund name" autoFocus={isNew}/>
                            </Field>
                            <Field label="Partner / contact"><Input {...register("partner")}/></Field>
                            <Field label="Email" error={errors.email?.message}><Input type="email" {...register("email")}/></Field>
                            <Field label="Type">
                                <Controller control={control} name="type" render={({field}) => (
                                    <Select value={field.value} onValueChange={field.onChange} disabled={!canEdit}>
                                        <SelectTrigger><SelectValue/></SelectTrigger>
                                        <SelectContent>{types.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                                    </Select>
                                )}/>
                            </Field>
                            <Field label="Geography"><Input {...register("geo")} placeholder="US, EU, UA…"/></Field>
                            <Field label="Defense mandate" hint="Can their LPs back weapons / strike platforms?">
                                <Controller control={control} name="mandate" render={({field}) => (
                                    <Select value={field.value} onValueChange={field.onChange} disabled={!canEdit}>
                                        <SelectTrigger><SelectValue/></SelectTrigger>
                                        <SelectContent>{Object.entries(MANDATES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                                    </Select>
                                )}/>
                            </Field>
                            <Field label="Intro via"><Input {...register("via")} placeholder="Warm intro source"/></Field>
                        </Section>

                        <Section title="Deal">
                            <Field label="Stage">
                                <Controller control={control} name="stage" render={({field}) => (
                                    <Select value={field.value} onValueChange={field.onChange} disabled={!canEdit}>
                                        <SelectTrigger><SelectValue/></SelectTrigger>
                                        <SelectContent>{STAGES.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                                    </Select>
                                )}/>
                            </Field>
                            <Field label="Priority">
                                <Controller control={control} name="priority" render={({field}) => (
                                    <Select value={field.value} onValueChange={field.onChange} disabled={!canEdit}>
                                        <SelectTrigger><SelectValue/></SelectTrigger>
                                        <SelectContent>{Object.entries(PRIORITIES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                                    </Select>
                                )}/>
                            </Field>
                            <Field label="Check min (USD)" error={errors.check_min?.message}><Input inputMode="decimal" placeholder="250K" {...register("check_min")}/></Field>
                            <Field label="Check max (USD)" error={errors.check_max?.message}><Input inputMode="decimal" placeholder="2M" {...register("check_max")}/></Field>
                            <Field label="Expected / committed" hint="Counts toward the raise meter" error={errors.amount?.message}>
                                <Input inputMode="decimal" placeholder="1.5M" {...register("amount")}/>
                            </Field>
                            <Controller control={control} name="can_lead" render={({field}) => (
                                <label className="flex items-center gap-2 self-end pb-2 text-sm">
                                    <Checkbox checked={field.value} onCheckedChange={(c) => field.onChange(c === true)} disabled={!canEdit}/>
                                    Can lead the round
                                </label>
                            )}/>
                        </Section>

                        <Section title="Next step">
                            <Field label="What happens next" full><Input {...register("next_step")} placeholder="Send data room access"/></Field>
                            <Field label="Due"><Input type="date" {...register("next_date")}/></Field>
                            <Field label="Last touch"><Input type="date" {...register("last_contact")}/></Field>
                            <Field label="Notes" hint="Standing notes about this investor. Use Comments for dated updates." full><Textarea rows={4} {...register("notes")}/></Field>
                        </Section>
                    </fieldset>

                </form>

                <SheetFooter hidden={showing !== "details"} className="flex-row items-center justify-between gap-2 border-t px-6 py-3 sm:justify-between">
                    {!isNew && canEdit ? (
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button variant="ghost" className="text-destructive hover:text-destructive"><Trash2/>Delete</Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>Delete {investor.name}?</AlertDialogTitle>
                                    <AlertDialogDescription>This removes the investor and all of its comments for everyone. It can't be undone.</AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Keep</AlertDialogCancel>
                                    <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                                       onClick={async () => {
                                                           await del.mutateAsync(investor.id);
                                                           onClose();
                                                       }}>
                                        Delete
                                    </AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    ) : <span/>}
                    {canEdit ? (
                        <div className="flex gap-2">
                            <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
                            <Button type="submit" form="investor-form" disabled={save.isPending || (!isNew && !isDirty)}>
                                {save.isPending && <Loader2 className="animate-spin"/>}
                                {isNew ? "Add investor" : "Save changes"}
                            </Button>
                        </div>
                    ) : <span className="text-sm text-muted-foreground">View only</span>}
                </SheetFooter>
            </SheetContent>
        </Sheet>
    );
}

function Section({title, children}: {title: string; children: ReactNode}) {
    return (
        <section className="flex flex-col gap-3">
            <h3 className="text-sm font-semibold">{title}</h3>
            <div className="grid grid-cols-1 gap-x-3 gap-y-3 sm:grid-cols-2">{children}</div>
        </section>
    );
}

function Field({label, hint, error, full, children}: {label: string; hint?: string; error?: string; full?: boolean; children: ReactNode}) {
    return (
        <div className={cn("flex min-w-0 flex-col gap-1.5", full && "sm:col-span-2")}>
            <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
            {children}
            {error ? <p className="text-xs text-destructive">{error}</p> : hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
        </div>
    );
}
