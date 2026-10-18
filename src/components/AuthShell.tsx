import type {ReactNode} from "react";

function Mark() {
    return (
        <svg viewBox="0 0 32 32" className="h-8 w-8" aria-hidden="true">
            <rect width="32" height="32" rx="8" className="fill-foreground"/>
            <path d="M8 23h4v-6H8zm6 0h4V13h-4zm6 0h4V9h-4z" className="fill-highlight"/>
        </svg>
    );
}

/**
 * Sign-in and standalone screens. On wide screens a quiet panel on the left shows what the
 * product does (a sample raise meter); the task itself sits on the right.
 */
export function AuthShell({children, showIntro = true}: {children: ReactNode; showIntro?: boolean}) {
    return (
        <main className="grid min-h-svh lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
            {showIntro && (
                <aside className="relative hidden flex-col justify-between overflow-hidden bg-[#191c1a] p-12 text-[#eceee9] dark:border-r lg:flex">
                    <div className="flex items-center gap-3">
                        <svg viewBox="0 0 32 32" className="h-8 w-8" aria-hidden="true">
                            <rect width="32" height="32" rx="8" className="fill-[#eceee9]"/>
                            <path d="M8 23h4v-6H8zm6 0h4V13h-4zm6 0h4V9h-4z" className="fill-[#191c1a]"/>
                        </svg>
                        <span className="text-lg font-semibold">Venture</span>
                    </div>

                    <div className="max-w-md">
                        <p className="text-[2.5rem] font-bold leading-[1.08] tracking-[-0.035em]">
                            Know exactly where your round stands.
                        </p>
                        <p className="mt-4 text-[15px] leading-relaxed text-white/65">
                            Track every fund from the first email to the wire, see who needs a follow-up today,
                            and share the pipeline with your co-founders.
                        </p>
                    </div>

                    {/* Illustration of the raise meter, not real data */}
                    <div aria-hidden="true" className="max-w-md">
                        <div className="flex items-baseline justify-between text-sm text-white/60">
                            <span><span className="text-2xl font-bold text-white">$1.9M</span> committed</span>
                            <span>of $5M</span>
                        </div>
                        <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-white/10">
                            <span className="h-full w-[38%] bg-highlight"/>
                            <span className="h-full w-[22%] bg-termsheet"/>
                            <span className="h-full w-[14%] bg-[repeating-linear-gradient(135deg,rgb(255_255_255/0.45)_0_2px,transparent_2px_6px)]"/>
                        </div>
                        <div className="mt-6 grid grid-cols-4 gap-px overflow-hidden rounded-lg bg-white/10 text-xs">
                            {[["11", "Contacted"], ["6", "Meetings"], ["3", "Diligence"], ["2", "Term sheets"]].map(([n, l]) => (
                                <div key={l} className="bg-[#191c1a] px-3 py-2.5">
                                    <div className="text-lg font-semibold text-white">{n}</div>
                                    <div className="text-white/55">{l}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                </aside>
            )}

            <div className="flex items-center justify-center px-5 py-12 sm:px-10">
                <div className="flex w-full max-w-[400px] flex-col items-start gap-5">
                    <div className={showIntro ? "lg:hidden" : ""}><Mark/></div>
                    {children}
                </div>
            </div>
        </main>
    );
}
