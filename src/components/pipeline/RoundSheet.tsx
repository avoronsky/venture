import {useEffect} from "react";
import {useForm} from "react-hook-form";
import {zodResolver} from "@hookform/resolvers/zod";
import {z} from "zod";
import {Loader2} from "lucide-react";
import {Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle} from "@/components/ui/sheet";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {useSaveRound} from "@/hooks/usePipeline";
import {parseMoney, STAGES} from "@/lib/pipeline";
import type {FundRound} from "@/lib/types";
import {useOrg} from "@/hooks/useOrg";

const money = z.string().trim().refine((v) => v === "" || parseMoney(v) > 0, "Use a number like 5M");
const schema = z.object({
    name: z.string().trim(),
    target: money,
    instrument: z.string().trim(),
    cap: money,
    close_date: z.string(),
});
type FormValues = z.infer<typeof schema>;

const toForm = (r?: FundRound | null): FormValues => ({
    name: r?.name ?? "",
    target: r?.target ? r.target.toLocaleString("en-US") : "",
    instrument: r?.instrument ?? "",
    cap: r?.cap ? r.cap.toLocaleString("en-US") : "",
    close_date: r?.close_date ?? "",
});

interface RoundSheetProps {
    open: boolean;
    round: FundRound | null | undefined;
    canEdit: boolean;
    onClose: () => void;
}

export function RoundSheet({open, round, canEdit, onClose}: RoundSheetProps) {
    const {org} = useOrg();
    const save = useSaveRound(org.id);
    const {register, handleSubmit, reset, formState: {errors}} = useForm<FormValues>({resolver: zodResolver(schema), defaultValues: toForm(round)});
    useEffect(() => {
        if (open) reset(toForm(round));
    }, [open, round, reset]);

    const onSubmit = handleSubmit(async (v) => {
        await save.mutateAsync({name: v.name, target: parseMoney(v.target), instrument: v.instrument, cap: parseMoney(v.cap), close_date: v.close_date || null});
        onClose();
    });

    const weights = STAGES.filter((s) => s.weight > 0 && s.weight < 1).map((s) => `${s.name} ${Math.round(s.weight * 100)}%`).join(", ");

    return (
        <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
            <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
                <SheetHeader className="border-b px-6 py-4 text-left">
                    <SheetTitle className="text-xl">Round details</SheetTitle>
                    <SheetDescription>The target sets the scale of the raise meter.</SheetDescription>
                </SheetHeader>
                <form id="round-form" onSubmit={onSubmit} className="flex-1 overflow-y-auto px-6 py-5">
                    <fieldset disabled={!canEdit} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="flex flex-col gap-1.5 sm:col-span-2">
                            <Label className="text-xs text-muted-foreground">Round name</Label>
                            <Input {...register("name")} placeholder="Seed, Seed+, Series A…"/>
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <Label className="text-xs text-muted-foreground">Target raise (USD)</Label>
                            <Input inputMode="decimal" placeholder="5M" {...register("target")}/>
                            {errors.target && <p className="text-xs text-destructive">{errors.target.message}</p>}
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <Label className="text-xs text-muted-foreground">Instrument</Label>
                            <Input {...register("instrument")} placeholder="Priced equity, SAFE…"/>
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <Label className="text-xs text-muted-foreground">Valuation / cap (USD)</Label>
                            <Input inputMode="decimal" {...register("cap")}/>
                            {errors.cap && <p className="text-xs text-destructive">{errors.cap.message}</p>}
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <Label className="text-xs text-muted-foreground">Target close</Label>
                            <Input type="date" {...register("close_date")}/>
                        </div>
                    </fieldset>
                    <p className="mt-5 text-xs text-muted-foreground">Stage weights for the weighted pipeline: {weights}.</p>
                </form>
                {canEdit && (
                    <SheetFooter className="flex-row justify-end gap-2 border-t px-6 py-3">
                        <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
                        <Button type="submit" form="round-form" disabled={save.isPending}>
                            {save.isPending && <Loader2 className="animate-spin"/>}Save round
                        </Button>
                    </SheetFooter>
                )}
            </SheetContent>
        </Sheet>
    );
}
