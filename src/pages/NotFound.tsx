import {Link} from "react-router-dom";
import {Button} from "@/components/ui/button";
import {AuthShell} from "@/components/AuthShell";

export default function NotFound() {
    return (
        <AuthShell>
            <p className="eyebrow">404</p>
            <h1 className="text-2xl font-bold">This page doesn't exist</h1>
            <p className="text-muted-foreground">The link may be out of date.</p>
            <Button asChild><Link to="/">Back to the pipeline</Link></Button>
        </AuthShell>
    );
}
