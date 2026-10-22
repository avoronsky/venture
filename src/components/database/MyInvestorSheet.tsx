import {type ReactNode, useEffect, useState} from "react";
import {Controller, useForm} from "react-hook-form";
import {zodResolver} from "@hookform/resolvers/zod";
import {z} from "zod";
import {Loader2, Trash2} from "lucide-react";
import {Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle} from "@/components/ui/sheet";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
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
} from "@/components/ui/alert-dialog";
import {CommentTimeline} from "@/components/comments/CommentTimeline";
import {useDeleteMyInvestor, useMyCommentMutations, useMyCommentStats, useMyInvestorComments, useSaveMyInvestor} from "@/hooks/useMyInvestors";
import {INVESTOR_TYPES, parseMoney} from "@/lib/pipeline";
import {websiteHref} from "@/lib/websites";
import type {MyInvestor, MyInvestorInput} from "@/lib/types";
import {cn} from "@/lib/utils";

const schema = z.object({
    name: z.string().trim().min(1, "Add the investor's name").max(200),
    type: z.string(),
    website: z.string().trim().max(500).refine((v) => v === "" || websiteHref(v) !== null, "Use an address like fund.vc"),
    contact_name: z.string().trim().max(200),
    contact_email: z.union([z.literal(""), z.string().trim().email("Enter a valid email")]),
    min_check: z.string().trim().refine((v) => v === "" || parseMoney(v) > 0, "Use a number like 250K or 1.5M"),
});
type FormValues = z.infer<typeof schema>;

const toForm = (inv?: MyInvestor): FormValues => ({
    name: inv?.name ?? "",
    type: inv?.type || "VC",
    website: inv?.website ?? "",
    contact_name: inv?.contact_name ?? "",
    contact_email: inv?.contact_email ?? "",
    min_check: inv?.min_check ? inv.min_check.toLocaleString("en-US") : "",
});

const toInput = (v: FormValues): MyInvestorInput => ({
    name: v.name, type: v.type, website: v.website, contact_name: v.contact_name, contact_email: v.contact_email,
    min_check: parseMoney(v.min_check),
});

interface MyInvestorSheetProps {
    open: boolean;
    /** undefined = add a new investor */
    investor?: MyInvestor;
    onClose: () => void;
    onCreated: (id: string) => void;
}

export function MyInvestorSheet({open, investor, onClose, onCreated}: MyInvestorSheetProps) {
    const isNew = !investor;
    const save = useSaveMyInvestor();
    const del = useDeleteMyInvestor();
    const {data: stats} = useMyCommentStats();
    const commentCount = investor ? stats?.get(investor.id)?.comment_count ?? 0 : 0;
    const [tab, setTab] = useState<"comments" | "details">("comments");
    const [confirmDelete, setConfirmDelete] = useState(false);
    const showing = isNew ? "details" : tab;
    const {register, handleSubmit, control, reset, formState: {errors, isDirty}} = useForm<FormValues>({resolver: zodResolver(schema), defaultValues: toForm(investor)});

    useEffect(() => {
        reset(toForm(investor));
        setTab("comments");
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [investor?.id, open, reset]);

    const onSubmit = handleSubmit(async (values) => {
        const saved = await save.mutateAsync({id: investor?.id, values: toInput(values)});
        if (isNew) onCreated(saved.id);
        else onClose();
    });

    const types = investor?.type && !INVESTOR_TYPES.includes(investor.type) ? [...INVESTOR_TYPES, investor.type] : INVESTOR_TYPES;

    return (
        <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
            <SheetContent className="flex w-full flex-col gap-0 p-0 outline-none sm:max-w-xl"
                          onOpenAutoFocus={(e) => {
                              if (!isNew) e.preventDefault();
                          }}>
                <SheetHeader className="border-b px-6 py-4 text-left">
                    <SheetTitle className="text-xl [overflow-wrap:anywhere]">{isNew ? "Add to your database" : investor.name}</SheetTitle>
                    <SheetDescription>{isNew ? "Only you can see your investor database." : [investor.type, investor.contact_name].filter(Boolean).join(", ")}</SheetDescription>
                    {!isNew && (
                        <div className="-mb-4 mt-3 flex gap-5" role="tablist" aria-label="Investor">
                            {([["comments", "Comments"], ["details", "Details"]] as const).map(([value, label]) => (
                                <button key={value} type="button" role="tab" aria-selected={showing === value} onClick={() => setTab(value)}
                                        className={cn("-mb-px flex items-center gap-1.5 border-b-2 pb-2.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ring",
                                            showing === value ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
                                    {label}
                                    {value === "comments" && commentCount > 0 && <span className="tabular rounded-full bg-foreground/10 px-1.5 text-xs">{commentCount}</span>}
                                </button>
                            ))}
                        </div>
                    )}
                </SheetHeader>

                {showing === "comments" && investor && (
                    <div className="flex-1 overflow-y-auto px-6 py-5">
                        <MyComments investorId={investor.id}/>
                    </div>
                )}

                <form id="my-investor-form" onSubmit={onSubmit} hidden={showing !== "details"} className="flex-1 overflow-y-auto px-6 py-5">
                    <div className="grid grid-cols-1 gap-x-3 gap-y-4 sm:grid-cols-2">
                        <Field label="Investor name" error={errors.name?.message} full>
                            <Input {...register("name")} placeholder="e.g. Red Planet Ventures" autoFocus={isNew}/>
                        </Field>
                        <Field label="Type">
                            <Controller control={control} name="type" render={({field}) => (
                                <Select value={field.value} onValueChange={field.onChange}>
                                    <SelectTrigger><SelectValue/></SelectTrigger>
                                    <SelectContent>{types.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                                </Select>
                            )}/>
                        </Field>
                        <Field label="Website" error={errors.website?.message}>
                            <Input {...register("website")} placeholder="fund.vc" inputMode="url"/>
                        </Field>
                        <Field label="Contact person"><Input {...register("contact_name")} placeholder="Partner or associate"/></Field>
                        <Field label="Contact email" error={errors.contact_email?.message}>
                            <Input type="email" {...register("contact_email")} placeholder="name@fund.vc"/>
                        </Field>
                        <Field label="Minimum check (USD)" error={errors.min_check?.message}>
                            <Input inputMode="decimal" {...register("min_check")} placeholder="250K"/>
                        </Field>
                    </div>
                </form>

                <SheetFooter hidden={showing !== "details"} className="flex-row items-center justify-between gap-2 border-t px-6 py-3 sm:justify-between">
                    {!isNew ? (
                        <Button type="button" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setConfirmDelete(true)}>
                            <Trash2/>Remove
                        </Button>
                    ) : <span/>}
                    <div className="flex gap-2">
                        <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
                        <Button type="submit" form="my-investor-form" disabled={save.isPending || (!isNew && !isDirty)}>
                            {save.isPending && <Loader2 className="animate-spin"/>}{isNew ? "Add investor" : "Save changes"}
                        </Button>
                    </div>
                </SheetFooter>
            </SheetContent>

            {investor && (
                <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Remove {investor.name} from your database?</AlertDialogTitle>
                            <AlertDialogDescription>
                                Its comments are deleted too. Pipelines aren't affected: if this investor is in a round, it stays there.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Keep</AlertDialogCancel>
                            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                               onClick={async () => {
                                                   await del.mutateAsync(investor.id);
                                                   onClose();
                                               }}>
                                Remove
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            )}
        </Sheet>
    );
}

function MyComments({investorId}: {investorId: string}) {
    const {data = [], isLoading, isError, refetch} = useMyInvestorComments(investorId);
    const {add, update, remove} = useMyCommentMutations(investorId);
    return (
        <CommentTimeline
            entries={data}
            isLoading={isLoading}
            isError={isError}
            onRetry={() => refetch()}
            canAdd
            showAuthors={false}
            canChange={() => true}
            canDelete={() => true}
            onAdd={(d) => add.mutateAsync(d)}
            onUpdate={(e, d) => update.mutateAsync({id: e.id as number, ...d})}
            onDelete={(e) => remove.mutate(e.id as number)}
            deleteDescription="This can't be undone."
            emptyText="Keep dated notes on this investor: intros, what they invest in, past conversations. Only you can see them."
        />
    );
}

function Field({label, error, full, children}: {label: string; error?: string; full?: boolean; children: ReactNode}) {
    return (
        <div className={cn("flex min-w-0 flex-col gap-1.5", full && "sm:col-span-2")}>
            <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
            {children}
            {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
    );
}
