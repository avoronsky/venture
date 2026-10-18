import {Settings2} from "lucide-react";
import {AuthShell} from "@/components/AuthShell";

export function SetupRequired() {
    return (
        <AuthShell>
            <Settings2 className="h-8 w-8 text-muted-foreground"/>
            <h1 className="text-2xl font-bold">Supabase isn't configured</h1>
            <p className="text-muted-foreground">
                Set <code className="tabular text-sm">VITE_SUPABASE_URL</code> and{" "}
                <code className="tabular text-sm">VITE_SUPABASE_ANON_KEY</code> (see <code className="tabular text-sm">.env.example</code>), then rebuild.
            </p>
        </AuthShell>
    );
}
