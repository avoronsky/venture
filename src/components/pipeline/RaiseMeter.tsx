import {formatMoney, type RaiseMetrics, STAGES} from "@/lib/pipeline";
import type {Investor} from "@/lib/types";
import {cn} from "@/lib/utils";

interface RaiseMeterProps {
    metrics: RaiseMetrics;
    investors: Investor[];
    onSetTarget?: () => void;
}

/**
 * The raise as one instrument: committed money (highlighter), term sheets, and the
 * stage-weighted rest of the pipeline (hatched), measured against the round target.
 */
export function RaiseMeter({metrics: m, investors, onSetTarget}: RaiseMeterProps) {
    const total = m.committed + m.termSheets + m.earlyWeighted;
    const scale = Math.max(m.target, total, 1);
    const pct = (v: number) => `${Math.min(100, (v / scale) * 100)}%`;
    const pctOfTarget = m.target ? Math.round((m.committed / m.target) * 100) : null;
    const counts = STAGES.filter((s) => s.id !== "passed").map((s) => ({stage: s, n: investors.filter((i) => i.stage === s.id).length}));

    return (
        <section aria-label="Raise progress" className="min-w-0">
            <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-4">
                <div>
                    <p className="text-sm text-muted-foreground">Committed</p>
                    <p className="mt-1 flex flex-wrap items-baseline gap-x-3 leading-none">
                        <span className="text-[3.25rem] font-bold tracking-[-0.04em]">{formatMoney(m.committed)}</span>
                        {m.target ? (
                            <span className="text-lg text-muted-foreground">of {formatMoney(m.target)}{pctOfTarget !== null && <span className="ml-2 text-foreground">{pctOfTarget}%</span>}</span>
                        ) : onSetTarget ? (
                            <button type="button" onClick={onSetTarget} className="text-base text-muted-foreground underline decoration-dotted underline-offset-4 hover:text-foreground">
                                Set a round target
                            </button>
                        ) : null}
                    </p>
                </div>
                <dl className="flex gap-8">
                    <Stat label="Term sheets" value={m.termSheets}/>
                    <Stat label="Weighted pipeline" value={m.weighted}/>
                    {m.target > 0 && <Stat label="Still to close" value={m.remaining}/>}
                </dl>
            </div>

            <div className="relative mt-5">
                <div className="flex h-3 overflow-hidden rounded-full bg-sunken" role="img"
                     aria-label={`Committed ${formatMoney(m.committed)}, term sheets ${formatMoney(m.termSheets)}, weighted earlier stages ${formatMoney(m.earlyWeighted)}${m.target ? `, target ${formatMoney(m.target)}` : ""}`}>
                    <span className="h-full bg-highlight" style={{width: pct(m.committed)}}/>
                    <span className="h-full bg-termsheet" style={{width: pct(m.termSheets)}}/>
                    <span className="h-full hatch-primary" style={{width: pct(m.earlyWeighted)}}/>
                </div>
                {m.target > 0 && total > m.target && (
                    <span className="absolute -top-1 -bottom-1 w-0.5 rounded-full bg-foreground" style={{left: pct(m.target)}} title={`Target ${formatMoney(m.target)}`}/>
                )}
            </div>
            <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
                <Key className="bg-highlight" label="Committed and closed"/>
                <Key className="bg-termsheet" label="Term sheets"/>
                <Key className="hatch-primary" label="Earlier stages, weighted by likelihood"/>
            </div>

            <ol className="mt-6 grid grid-cols-4 overflow-hidden rounded-xl border bg-card sm:grid-cols-8" aria-label="Investors by stage">
                {counts.map(({stage, n}, i) => (
                    <li key={stage.id}
                        className={cn("flex min-w-0 flex-col gap-0.5 px-3 py-2.5",
                            i % 4 !== 0 && "border-l", i >= 4 && "border-t sm:border-t-0", i === 4 && "sm:border-l")}>
                        <span className={cn("text-xl font-semibold leading-tight", n === 0 && "text-muted-foreground/50")}>{n}</span>
                        <span className="text-xs leading-tight text-muted-foreground">{stage.name}</span>
                    </li>
                ))}
            </ol>
        </section>
    );
}

function Stat({label, value}: {label: string; value: number}) {
    return (
        <div>
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="text-lg font-semibold">{formatMoney(value)}</dd>
        </div>
    );
}

function Key({className, label}: {className: string; label: string}) {
    return (
        <span className="inline-flex items-center gap-1.5">
            <i className={cn("inline-block h-2 w-3.5 rounded-full", className)}/>
            {label}
        </span>
    );
}
