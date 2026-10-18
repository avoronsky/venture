import {Card, CardContent} from "@/components/ui/card";
import {formatMoney, type RaiseMetrics, STAGES} from "@/lib/pipeline";
import type {Investor} from "@/lib/types";

interface RaiseGaugeProps {
    metrics: RaiseMetrics;
    investors: Investor[];
}

export function RaiseGauge({metrics: m, investors}: RaiseGaugeProps) {
    const scale = Math.max(m.target, m.committed + m.termSheets + m.earlyWeighted, 1);
    const pct = (v: number) => `${((v / scale) * 100).toFixed(2)}%`;
    const funnel = STAGES.filter((s) => s.id !== "passed").map((s) => ({stage: s, n: investors.filter((i) => i.stage === s.id).length}));
    const maxN = Math.max(1, ...funnel.map((f) => f.n));

    return (
        <Card className="min-w-0 shadow-none">
            <CardContent className="p-5">
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                    <div>
                        <p className="eyebrow">Committed + closed vs target</p>
                        <p className="tabular text-3xl font-medium tracking-tight">
                            {formatMoney(m.committed)}{" "}
                            <span className="text-base text-muted-foreground">of {m.target ? formatMoney(m.target) : "— (set a target)"}</span>
                        </p>
                    </div>
                    <div className="sm:text-right">
                        <p className="eyebrow">Weighted pipeline</p>
                        <p className="tabular text-lg">{formatMoney(m.weighted)}</p>
                    </div>
                </div>

                <div className="mt-4 mb-3 flex h-3.5 overflow-hidden rounded-full bg-sunken" role="img"
                     aria-label={`Committed ${formatMoney(m.committed)}, term sheets ${formatMoney(m.termSheets)}, weighted earlier stages ${formatMoney(m.earlyWeighted)}, target ${formatMoney(m.target)}`}>
                    <span className="h-full bg-success" style={{width: pct(m.committed)}}/>
                    <span className="h-full bg-termsheet" style={{width: pct(m.termSheets)}}/>
                    <span className="h-full hatch-primary" style={{width: pct(m.earlyWeighted)}}/>
                </div>

                <div className="flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-muted-foreground">
                    <Legend swatch="bg-success" label="Committed / closed" value={m.committed}/>
                    <Legend swatch="bg-termsheet" label="Term sheets" value={m.termSheets}/>
                    <Legend swatch="bg-primary" label="Earlier stages, weighted" value={m.earlyWeighted}/>
                    {m.target > 0 && <span>Still to close <b className="tabular font-medium text-foreground">{formatMoney(m.remaining)}</b></span>}
                </div>

                <div className="mt-5 grid grid-cols-4 gap-1 sm:grid-cols-8">
                    {funnel.map(({stage, n}) => (
                        <div key={stage.id} className="flex min-w-0 flex-col gap-0.5" title={stage.name}>
                            <div className="relative h-9 overflow-hidden rounded-sm bg-sunken">
                                {n > 0 && <span className="absolute inset-x-0 bottom-0 border-t-2 border-primary bg-primary-soft" style={{height: `${(n / maxN) * 100}%`}}/>}
                            </div>
                            <span className="tabular text-sm">{n}</span>
                            <span className="truncate text-[10.5px] text-muted-foreground">{stage.name}</span>
                        </div>
                    ))}
                </div>
            </CardContent>
        </Card>
    );
}

function Legend({swatch, label, value}: {swatch: string; label: string; value: number}) {
    return (
        <span className="inline-flex items-center gap-1.5">
            <i className={`inline-block h-2.5 w-2.5 rounded-xs ${swatch}`}/>
            {label} <b className="tabular font-medium text-foreground">{formatMoney(value)}</b>
        </span>
    );
}
