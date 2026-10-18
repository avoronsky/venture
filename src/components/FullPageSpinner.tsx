import {Loader2} from "lucide-react";

export function FullPageSpinner({label = "Loading…"}: {label?: string}) {
    return (
        <div className="min-h-svh flex items-center justify-center bg-background">
            <div className="flex flex-col items-center gap-3 text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin text-primary"/>
                <p className="text-sm">{label}</p>
            </div>
        </div>
    );
}
