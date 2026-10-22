import {forwardRef, type InputHTMLAttributes, type KeyboardEvent, useId, useMemo, useState} from "react";
import {BookUser} from "lucide-react";
import {Input} from "@/components/ui/input";
import {useMyInvestors} from "@/hooks/useMyInvestors";
import {formatMoney} from "@/lib/pipeline";
import type {MyInvestor} from "@/lib/types";
import {cn} from "@/lib/utils";

interface DatabaseNameInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "onSelect"> {
    value: string;
    onPick: (investor: MyInvestor) => void;
}

/**
 * The investor name field when adding to a pipeline. As you type, it suggests matches from your
 * private investor database; picking one fills in the rest of the form.
 */
export const DatabaseNameInput = forwardRef<HTMLInputElement, DatabaseNameInputProps>(function DatabaseNameInput(
    {value, onPick, onKeyDown, onFocus, onBlur, ...inputProps}, ref) {
    const {data: mine = []} = useMyInvestors();
    const [open, setOpen] = useState(false);
    const [active, setActive] = useState(0);
    const listId = useId();

    const matches = useMemo(() => {
        const q = value.trim().toLowerCase();
        const pool = q
            ? mine.filter((m) => [m.name, m.contact_name, m.website].join(" ").toLowerCase().includes(q))
                .sort((a, b) => Number(!a.name.toLowerCase().startsWith(q)) - Number(!b.name.toLowerCase().startsWith(q)))
            : [...mine].sort((a, b) => b.updated_at.localeCompare(a.updated_at));
        return pool.slice(0, 6);
    }, [mine, value]);
    const exact = mine.some((m) => m.name.trim().toLowerCase() === value.trim().toLowerCase());
    const show = open && matches.length > 0 && !(exact && matches.length === 1);

    const pick = (m: MyInvestor) => {
        onPick(m);
        setOpen(false);
    };

    const handleKey = (e: KeyboardEvent<HTMLInputElement>) => {
        if (show) {
            if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((i) => (i + 1) % matches.length);
                return;
            }
            if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((i) => (i - 1 + matches.length) % matches.length);
                return;
            }
            if (e.key === "Enter") {
                e.preventDefault();
                pick(matches[active]);
                return;
            }
            if (e.key === "Escape") {
                e.stopPropagation();
                setOpen(false);
                return;
            }
        }
        onKeyDown?.(e);
    };

    return (
        <div className="relative">
            <Input ref={ref} {...inputProps} value={value} autoComplete="off"
                   role="combobox" aria-expanded={show} aria-controls={listId} aria-autocomplete="list"
                   aria-activedescendant={show ? `${listId}-${active}` : undefined}
                   onFocus={(e) => {
                       setOpen(true);
                       onFocus?.(e);
                   }}
                   onBlur={(e) => {
                       setOpen(false);
                       onBlur?.(e);
                   }}
                   onKeyDown={handleKey}
                   onInput={() => {
                       setOpen(true);
                       setActive(0);
                   }}/>
            {show && (
                <ul id={listId} role="listbox" aria-label="From your investor database"
                    className="absolute inset-x-0 top-full z-50 mt-1 max-h-72 overflow-auto rounded-lg border bg-popover p-1 shadow-lg">
                    <li className="flex items-center gap-1.5 px-2 pb-1 pt-0.5 text-xs text-muted-foreground" aria-hidden="true">
                        <BookUser className="h-3.5 w-3.5"/>From your investor database
                    </li>
                    {matches.map((m, i) => (
                        <li key={m.id} id={`${listId}-${i}`} role="option" aria-selected={i === active}
                            // mousedown, not click: the input's blur would otherwise close the list first
                            onMouseDown={(e) => {
                                e.preventDefault();
                                pick(m);
                            }}
                            onMouseEnter={() => setActive(i)}
                            className={cn("cursor-pointer rounded-md px-2 py-1.5", i === active && "bg-sunken")}>
                            <span className="block truncate text-sm font-medium">{m.name}</span>
                            <span className="block truncate text-xs text-muted-foreground">
                                {[m.type, m.contact_name, m.min_check ? `min ${formatMoney(m.min_check)}` : ""].filter(Boolean).join(", ")}
                            </span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
});
