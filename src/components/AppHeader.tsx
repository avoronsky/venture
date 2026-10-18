import type {ReactNode} from "react";
import {Link} from "react-router-dom";
import {useTheme} from "next-themes";
import {ChevronDown, LogOut, Monitor, Moon, Sun, Users} from "lucide-react";
import {useAuth} from "@/hooks/useAuth";
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
    const {email, role, isOwner, signOut} = useAuth();
    const {theme, setTheme} = useTheme();

    return (
        <header className="flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0">
                <Link to="/" className="eyebrow hover:text-foreground">Mars Rovers</Link>
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
                    <DropdownMenuContent align="end" className="w-56">
                        <DropdownMenuLabel className="flex items-center justify-between gap-2 font-normal">
                            <span className="truncate text-muted-foreground">{email}</span>
                            <span className="eyebrow text-primary">{role}</span>
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator/>
                        {isOwner && (
                            <DropdownMenuItem asChild>
                                <Link to="/team"><Users className="mr-2 h-4 w-4"/>Team access</Link>
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
