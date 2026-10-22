import {useEffect, useState} from "react";
import {useNavigate} from "react-router-dom";
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
import {useDeleteRound, useSaveRound} from "@/hooks/useRounds";
import {useOrg} from "@/hooks/useOrg";
import {parseMoney, STAGES} from "@/lib/pipeline";
import type {Round} from "@/lib/types";

const money = z.string().trim().refine((v) => v === "" || parseMoney(v) > 0, "Use a number like 5M");
const schema = z.object({
    name: z.string().trim().min(1, "Give the round a name").max(80),
    status: z.enum(["active", "closed"]),
    target: money,
    instrument: z.string().trim(),
    cap: money,
    close_date: z.string(),
});
type FormValues = z.infer<typeof schema>;

const toForm = (r: Round): FormValues => ({
    name: r.name,
    status: r.status,
    target: r.target ? r.target.toLocaleString("en-US") : "",
    instrument: r.instrument,
    cap: r.cap ? r.cap.toLocaleString("en-US") : "",
    close_date: r.close_date ?? "",
});

interface RoundSheetProps {
    open: boolean;
    round: Round;
    investorCount: number;
    onClose: () => void;
}

export function RoundSheet({open, round, investorCount, onClose}: RoundSheetProps) {
    const {org, canEdit, isOwner} = useOrg();
    const save = useSaveRound(org.id);
    const del = useDeleteRound(org.id);
    const navigate = useNavigate();
    const [confirmDelete, setConfirmDelete] = useState(false);
    const {register, handleSubmit, reset, control, formState: {errors, isDirty}} = useForm<FormValues>({resolver: zodResolver(schema), defaultValues: toForm(round)});
    useEffect(() => {
        if (open) reset(toForm(round));
    }, [open, round, reset]);

    const onSubmit = handleSubmit(async (v) => {
        await save.mutateAsync({
            id: round.id,
            values: {name: v.name, status: v.status, target: parseMoney(v.target), instrument: v.instrument, cap: parseMoney(v.cap), close_date: v.close_date || null},
        });
        onClose();
    });

    const weights = STAGES.filter((s) => s.weight > 0 && s.weight < 1).map((s) => `${s.name} ${Math.round(s.weight * 100)}%`).join(", ");

    return (
        <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
            <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
                <SheetHeader className="border-b px-6 py-4 text-left">
                    <SheetTitle className="text-xl">Round settings</SheetTitle>
                    <SheetDescription>The target sets the scale of the raise meter for this round.</SheetDescription>
                </SheetHeader>
                <form id="round-form" onSubmit={onSubmit} className="flex-1 overflow-y-auto px-6 py-5">
                    <fieldset disabled={!canEdit} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="flex flex-col gap-1.5 sm:col-span-2">
                            <Label htmlFor="r-name" className="text-xs text-muted-foreground">Round name</Label>
                            <Input id="r-name" {...register("name")} placeholder="Seed, Series A, Bridge…"/>
                            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <Label htmlFor="r-status" className="text-xs text-muted-foreground">Status</Label>
                            <Controller control={control} name="status" render={({field}) => (
                                <Select value={field.value} onValueChange={field.onChange} disabled={!canEdit}>
                                    <SelectTrigger id="r-status"><SelectValue/></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="active">Active</SelectItem>
                                        <SelectItem value="closed">Closed</SelectItem>
                                    </SelectContent>
                                </Select>
                            )}/>
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <Label htmlFor="r-target" className="text-xs text-muted-foreground">Target raise (USD)</Label>
                            <Input id="r-target" inputMode="decimal" placeholder="5M" {...register("target")}/>
                            {errors.target && <p className="text-xs text-destructive">{errors.target.message}</p>}
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <Label htmlFor="r-instrument" className="text-xs text-muted-foreground">Instrument</Label>
                            <Input id="r-instrument" {...register("instrument")} placeholder="Priced equity, SAFE…"/>
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <Label htmlFor="r-cap" className="text-xs text-muted-foreground">Valuation / cap (USD)</Label>
                            <Input id="r-cap" inputMode="decimal" {...register("cap")}/>
                            {errors.cap && <p className="text-xs text-destructive">{errors.cap.message}</p>}
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <Label htmlFor="r-close" className="text-xs text-muted-foreground">Target close</Label>
                            <Input id="r-close" type="date" {...register("close_date")}/>
                        </div>
                    </fieldset>
                    <p className="mt-5 text-xs text-muted-foreground">
                        Closed rounds move to the bottom of the sidebar and stay readable. Stage weights for the weighted pipeline: {weights}.
                    </p>
                </form>
                {canEdit && (
                    <SheetFooter className="flex-row items-center justify-between gap-2 border-t px-6 py-3 sm:justify-between">
                        {isOwner ? (
                            <Button type="button" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setConfirmDelete(true)}>
                                <Trash2/>Delete round
                            </Button>
                        ) : <span/>}
                        <div className="flex gap-2">
                            <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
                            <Button type="submit" form="round-form" disabled={save.isPending || !isDirty}>
                                {save.isPending && <Loader2 className="animate-spin"/>}Save round
                            </Button>
                        </div>
                    </SheetFooter>
                )}
            </SheetContent>

            <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete {round.name}?</AlertDialogTitle>
                        <AlertDialogDescription>
                            {investorCount > 0
                                ? `This deletes its ${investorCount} investor${investorCount === 1 ? "" : "s"} and all of their comments for everyone. Other rounds aren't affected. It can't be undone.`
                                : "The round is empty. Other rounds aren't affected."}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Keep</AlertDialogCancel>
                        <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                           onClick={async () => {
                                               await del.mutateAsync(round.id);
                                               onClose();
                                               navigate(`/o/${org.id}`, {replace: true});
                                           }}>
                            Delete round
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </Sheet>
    );
}
