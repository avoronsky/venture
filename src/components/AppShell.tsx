import {type ReactNode, useState} from "react";
import {Link, NavLink, useLocation} from "react-router-dom";
import {useTheme} from "next-themes";
import {Check, ChevronsUpDown, Columns3, LogOut, Menu, Monitor, Moon, Plus, Sun, Users} from "lucide-react";
import {useRounds} from "@/hooks/useRounds";
import {useOptionalRound} from "@/hooks/useCurrentRound";
import {NewRoundForm} from "@/components/pipeline/NewRoundForm";
import {useAuth} from "@/hooks/useAuth";
import {useOptionalOrg} from "@/hooks/useOrg";
import {useMyOrganizations} from "@/hooks/useOrganizations";
import {Button} from "@/components/ui/button";
import {Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle} from "@/components/ui/sheet";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {cn} from "@/lib/utils";

interface AppShellProps {
    title: string;
    description?: ReactNode;
    actions?: ReactNode;
    children: ReactNode;
    /** Pages with wide content (the board) use the full width. */
    wide?: boolean;
}

/** Sidebar layout for every signed-in screen. */
export function AppShell({title, description, actions, children, wide = false}: AppShellProps) {
    const [menuOpen, setMenuOpen] = useState(false);
    const [newRoundOpen, setNewRoundOpen] = useState(false);
    const location = useLocation();
    const current = useOptionalOrg();
    const currentRound = useOptionalRound();
    const {data: rounds = []} = useRounds(current?.org.id);
    const openNewRound = () => {
        setMenuOpen(false);
        setNewRoundOpen(true);
    };

    return (
        <div className="min-h-svh lg:grid lg:grid-cols-[236px_minmax(0,1fr)]">
            {/* Desktop sidebar */}
            <aside className="sticky top-0 hidden h-svh flex-col border-r bg-background lg:flex">
                <SidebarContents onNewRound={openNewRound}/>
            </aside>

            {/* Mobile top bar */}
            <div className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b bg-background/90 px-4 py-2.5 backdrop-blur lg:hidden">
                <Brand label={current?.org.name ?? "Venture"}/>
                <Button variant="ghost" size="icon" aria-label="Open menu" onClick={() => setMenuOpen(true)}><Menu/></Button>
            </div>
            <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
                <SheetContent side="left" className="flex w-[280px] flex-col gap-0 p-0">
                    <SheetTitle className="sr-only">Menu</SheetTitle>
                    <SidebarContents key={location.pathname} onNavigate={() => setMenuOpen(false)} onNewRound={openNewRound}/>
                </SheetContent>
            </Sheet>

            {current && (
                <Sheet open={newRoundOpen} onOpenChange={setNewRoundOpen}>
                    <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
                        <SheetHeader className="border-b px-6 py-4 text-left">
                            <SheetTitle className="text-xl">New round</SheetTitle>
                            <SheetDescription>Each round has its own pipeline, target and follow-ups.</SheetDescription>
                        </SheetHeader>
                        <div className="flex-1 overflow-y-auto px-6 py-5">
                            {newRoundOpen && (
                                <NewRoundForm rounds={rounds} copyFromDefault={currentRound?.id} onCreated={() => setNewRoundOpen(false)}/>
                            )}
                        </div>
                    </SheetContent>
                </Sheet>
            )}

            <main className={cn("mx-auto w-full px-4 pb-16 pt-6 sm:px-8 lg:pt-9", wide ? "max-w-[1480px]" : "max-w-[880px]")}>
                <header className="mb-7 flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
                    <div className="min-w-0">
                        <h1 className="text-[1.875rem] font-bold leading-[1.15] tracking-[-0.025em]">{title}</h1>
                        {description && <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground">{description}</div>}
                    </div>
                    {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
                </header>
                {children}
            </main>
        </div>
    );
}

function Brand({label}: {label: string}) {
    return (
        <span className="flex min-w-0 items-center gap-2.5">
            <svg viewBox="0 0 32 32" className="h-7 w-7 shrink-0" aria-hidden="true">
                <rect width="32" height="32" rx="8" className="fill-foreground"/>
                <path d="M8 23h4v-6H8zm6 0h4V13h-4zm6 0h4V9h-4z" className="fill-highlight"/>
            </svg>
            <span className="truncate font-semibold">{label}</span>
        </span>
    );
}

function SidebarContents({onNavigate, onNewRound}: {onNavigate?: () => void; onNewRound: () => void}) {
    const {email, signOut} = useAuth();
    const current = useOptionalOrg();
    const {data: memberships = []} = useMyOrganizations();
    const {data: rounds = []} = useRounds(current?.org.id);
    const {theme, setTheme} = useTheme();
    const active = rounds.filter((r) => r.status === "active");
    const closed = rounds.filter((r) => r.status === "closed");

    const navItem = ({isActive}: {isActive: boolean}) => cn(
        "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13.5px] transition-colors",
        isActive ? "bg-card font-medium text-foreground shadow-[0_0_0_1px_var(--border)]" : "text-muted-foreground hover:bg-sunken hover:text-foreground",
    );

    return (
        <div className="flex h-full flex-col gap-6 px-3 py-4">
            <DropdownMenu>
                <DropdownMenuTrigger className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-sunken focus-visible:outline-2 focus-visible:outline-ring">
                    <Brand label={current?.org.name ?? "Venture"}/>
                    <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground"/>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-60">
                    <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">Switch organization</DropdownMenuLabel>
                    {memberships.map(({org, role}) => (
                        <DropdownMenuItem key={org.id} asChild>
                            <Link to={`/o/${org.id}`} onClick={onNavigate} className="flex items-center justify-between gap-2">
                                <span className="flex min-w-0 items-center gap-2">
                                    <Check className={cn("h-4 w-4 shrink-0", org.id !== current?.org.id && "invisible")}/>
                                    <span className="truncate">{org.name}</span>
                                </span>
                                <span className="text-xs capitalize text-muted-foreground">{role}</span>
                            </Link>
                        </DropdownMenuItem>
                    ))}
                    <DropdownMenuSeparator/>
                    <DropdownMenuItem asChild>
                        <Link to="/orgs" onClick={onNavigate}><Plus className="mr-2 h-4 w-4"/>New organization</Link>
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>

            {current ? (
                <nav className="flex min-h-0 flex-col gap-5" aria-label="Organization">
                    <div className="flex min-h-0 flex-col gap-0.5">
                        <div className="flex items-center justify-between px-2.5 pb-1">
                            <span className="text-xs font-medium text-muted-foreground">Rounds</span>
                            {current.canEdit && (
                                <button type="button" onClick={onNewRound} aria-label="New round" title="New round"
                                        className="grid h-6 w-6 place-items-center rounded-md text-muted-foreground hover:bg-sunken hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
                                    <Plus className="h-4 w-4"/>
                                </button>
                            )}
                        </div>
                        <div className="flex max-h-[45svh] flex-col gap-0.5 overflow-y-auto">
                            {active.map((r) => (
                                <NavLink key={r.id} to={`/o/${current.org.id}/r/${r.id}`} className={navItem} onClick={onNavigate}>
                                    <Columns3 className="h-4 w-4 shrink-0"/><span className="truncate">{r.name}</span>
                                </NavLink>
                            ))}
                            {closed.length > 0 && <span className="px-2.5 pb-0.5 pt-2 text-xs text-muted-foreground">Closed</span>}
                            {closed.map((r) => (
                                <NavLink key={r.id} to={`/o/${current.org.id}/r/${r.id}`} className={navItem} onClick={onNavigate}>
                                    <Columns3 className="h-4 w-4 shrink-0 opacity-50"/><span className="truncate">{r.name}</span>
                                </NavLink>
                            ))}
                            {rounds.length === 0 && current.canEdit && (
                                <button type="button" onClick={onNewRound} className={navItem({isActive: false})}>
                                    <Plus className="h-4 w-4"/>Create the first round
                                </button>
                            )}
                        </div>
                    </div>
                    <NavLink to={`/o/${current.org.id}/settings`} className={navItem} onClick={onNavigate}>
                        <Users className="h-4 w-4"/>People & settings
                    </NavLink>
                </nav>
            ) : (
                <nav className="flex flex-col gap-0.5" aria-label="Organizations">
                    <NavLink to="/orgs" className={navItem} onClick={onNavigate}><Columns3 className="h-4 w-4"/>Organizations</NavLink>
                </nav>
            )}

            <div className="mt-auto flex flex-col gap-3 border-t pt-4">
                <div className="flex rounded-md bg-sunken p-0.5" role="radiogroup" aria-label="Theme">
                    {([["light", Sun, "Light"], ["dark", Moon, "Dark"], ["system", Monitor, "System"]] as const).map(([value, Icon, label]) => (
                        <button key={value} type="button" role="radio" aria-checked={theme === value} aria-label={label} title={label}
                                onClick={() => setTheme(value)}
                                className={cn("flex flex-1 items-center justify-center rounded-[5px] py-1 text-muted-foreground transition-colors focus-visible:outline-2 focus-visible:outline-ring",
                                    theme === value && "bg-card text-foreground shadow-[0_0_0_1px_var(--border)]")}>
                            <Icon className="h-3.5 w-3.5"/>
                        </button>
                    ))}
                </div>
                <div className="flex items-center justify-between gap-2 px-1">
                    <span className="min-w-0">
                        <span className="block truncate text-[13px]">{email}</span>
                        {current && <span className="block text-xs capitalize text-muted-foreground">{current.role}</span>}
                    </span>
                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label="Sign out" title="Sign out" onClick={() => signOut()}>
                        <LogOut className="h-4 w-4"/>
                    </Button>
                </div>
            </div>
        </div>
    );
}
