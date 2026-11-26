import {format} from "date-fns";

/** "Nov 26, 18:40" this year, "Nov 26, 2025" before. */
export function when(iso: string | null): string {
    if (!iso) return "";
    const d = new Date(iso);
    return format(d, d.getFullYear() === new Date().getFullYear() ? "MMM d, HH:mm" : "MMM d, yyyy");
}
