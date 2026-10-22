import {createContext, type ReactNode, useContext} from "react";
import type {Round} from "@/lib/types";

const RoundContext = createContext<Round | null>(null);

export function RoundProvider({round, children}: {round: Round; children: ReactNode}) {
    return <RoundContext.Provider value={round}>{children}</RoundContext.Provider>;
}

/** The round in the current URL (/o/:orgId/r/:roundId/...). */
// eslint-disable-next-line react-refresh/only-export-components
export function useCurrentRound(): Round {
    const round = useContext(RoundContext);
    if (!round) throw new Error("useCurrentRound must be used inside a round route");
    return round;
}

/** Null outside round routes (settings, organizations). */
// eslint-disable-next-line react-refresh/only-export-components
export function useOptionalRound(): Round | null {
    return useContext(RoundContext);
}
