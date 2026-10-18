import type {ReactNode} from "react";
import {Link} from "react-router-dom";
import {useTheme} from "next-themes";
import {Building2, Check, ChevronDown, ChevronsUpDown, LogOut, Monitor, Moon, Plus, Settings, Sun} from "lucide-react";
import {useAuth} from "@/hooks/useAuth";
import {useOptionalOrg} from "@/hooks/useOrg";
import {useMyOrganizations} from "@/hooks/useOrganizations";
import {Button} from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface AppHeaderProps {
    title: string;
    subtitle?: ReactNode;
    actions?: ReactNode;
}

export function AppHeader({title, subtitle, actions}: AppHeaderProps) {
    const {email, signOut} = useAuth();
    const current = useOptionalOrg();
    const {data: memberships = []} = useMyOrganizations();
    const {theme, setTheme} = useTheme();

    return (
        <header className="flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0">
                <DropdownMenu>
                    <DropdownMenuTrigger className="eyebrow -ml-1 inline-flex max-w-full items-center gap-1 rounded-sm px-1 py-0.5 hover:bg-sunken hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
                        <span className="truncate">{current?.org.name ?? "Venture"}</span>
                        <ChevronsUpDown className="h-3 w-3 shrink-0"/>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-64">
                        <DropdownMenuLabel className="eyebrow">Organizations</DropdownMenuLabel>
                        {memberships.map(({org, role}) => (
                            <DropdownMenuItem key={org.id} asChild>
                                <Link to={`/o/${org.id}`} className="flex items-center justify-between gap-2">
                                    <span className="flex min-w-0 items-center gap-2">
                                        <Check className={`h-4 w-4 shrink-0 ${org.id === current?.org.id ? "" : "invisible"}`}/>
                                        <span className="truncate">{org.name}</span>
                                    </span>
                                    <span className="text-xs text-muted-foreground">{role}</span>
                                </Link>
                            </DropdownMenuItem>
                        ))}
                        <DropdownMenuSeparator/>
                        <DropdownMenuItem asChild>
                            <Link to="/orgs"><Plus className="mr-2 h-4 w-4"/>New organization</Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                            <Link to="/orgs"><Building2 className="mr-2 h-4 w-4"/>All organizations</Link>
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
                <h1 className="text-[1.75rem] font-bold leading-tight tracking-tight">{title}</h1>
                {subtitle && <div className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">{subtitle}</div>}
            </div>
            <div className="flex flex-wrap items-center gap-2">
                {actions}
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="max-w-56">
                            <span className="truncate">{email}</span>
                            <ChevronDown className="opacity-60"/>
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-60">
                        <DropdownMenuLabel className="flex items-center justify-between gap-2 font-normal">
                            <span className="truncate text-muted-foreground">{email}</span>
                            {current && <span className="eyebrow text-primary">{current.role}</span>}
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator/>
                        {current && (
                            <DropdownMenuItem asChild>
                                <Link to={`/o/${current.org.id}/settings`}><Settings className="mr-2 h-4 w-4"/>Organization & access</Link>
                            </DropdownMenuItem>
                        )}
                        <DropdownMenuLabel className="eyebrow pt-2">Theme</DropdownMenuLabel>
                        <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
                            <DropdownMenuRadioItem value="light"><Sun className="mr-2 h-4 w-4"/>Light</DropdownMenuRadioItem>
                            <DropdownMenuRadioItem value="dark"><Moon className="mr-2 h-4 w-4"/>Dark</DropdownMenuRadioItem>
                            <DropdownMenuRadioItem value="system"><Monitor className="mr-2 h-4 w-4"/>System</DropdownMenuRadioItem>
                        </DropdownMenuRadioGroup>
                        <DropdownMenuSeparator/>
                        <DropdownMenuItem onSelect={() => signOut()}>
                            <LogOut className="mr-2 h-4 w-4"/>Sign out
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </header>
    );
}
