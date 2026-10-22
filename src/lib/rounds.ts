// Pure helpers for rounds. No app imports so they can be unit-tested with plain Node.
import type {Round} from "./types";

/** Active rounds first (newest first), then closed rounds (newest first). */
export function sortRounds(rounds: Round[]): Round[] {
    return [...rounds].sort((a, b) =>
        a.status === b.status ? b.created_at.localeCompare(a.created_at) : a.status === "active" ? -1 : 1);
}

/** The round to open when none is named in the URL: the last one used, else the newest active one. */
export function defaultRound(rounds: Round[], remembered: string | null): Round | undefined {
    return rounds.find((r) => r.id === remembered) ?? sortRounds(rounds)[0];
}

