import {Link} from "react-router-dom";
import {Button} from "@/components/ui/button";
import {AuthShell} from "@/components/AuthShell";

export default function NotFound() {
    return (
        <AuthShell showIntro={false}>
            <h1 className="text-2xl font-bold">Nothing at this address</h1>
            <p className="text-muted-foreground">The link may be out of date.</p>
            <Button asChild><Link to="/">Back to the pipeline</Link></Button>
        </AuthShell>
    );
}
