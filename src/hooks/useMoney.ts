import {useOptionalOrg} from "@/hooks/useOrg";
import {checkRange, currencySymbol, formatMoney} from "@/lib/pipeline";

/**
 * Money formatting in the current organization's currency.
 * Outside organization routes (the personal investor database) amounts are shown without a symbol,
 * because that database is shared across organizations that may use different currencies.
 */
export function useMoney() {
    const currency = useOptionalOrg()?.org.currency ?? "";
    return {
        currency,
        symbol: currencySymbol(currency),
        format: (v: unknown) => formatMoney(v, currency),
        range: (min: unknown, max: unknown) => checkRange(min, max, currency),
        /** "Target raise (EUR)" */
        label: (text: string) => (currency ? `${text} (${currency})` : text),
    };
}
