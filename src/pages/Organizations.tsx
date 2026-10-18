import {Link} from "react-router-dom";
import {ChevronRight, Loader2} from "lucide-react";
import {useMyOrganizations} from "@/hooks/useOrganizations";
import {AppShell} from "@/components/AppShell";
import {Card, CardContent} from "@/components/ui/card";
import {CreateOrganizationForm} from "@/components/CreateOrganizationForm";

export default function Organizations() {
    const {data: memberships = [], isPending: isLoading} = useMyOrganizations();

    return (
        <AppShell title="Organizations" description={<span>Each organization is one company's raise, with its own pipeline and people.</span>}>
        <div className="flex flex-col gap-6">
            <Card className="shadow-none">
                <CardContent className="p-0">
                    {isLoading ? <div className="p-5"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground"/></div>
                        : memberships.length === 0 ? <p className="p-5 text-muted-foreground">You don't belong to any organization yet.</p>
                            : (
                                <ul className="divide-y">
                                    {memberships.map(({org, role}) => (
                                        <li key={org.id}>
                                            <Link to={`/o/${org.id}`} className="flex items-center justify-between gap-3 px-5 py-3.5 hover:bg-sunken">
                                                <span className="min-w-0">
                                                    <span className="block truncate font-semibold">{org.name}</span>
                                                    <span className="text-xs capitalize text-muted-foreground">{role}</span>
                                                </span>
                                                <ChevronRight className="h-4 w-4 text-muted-foreground"/>
                                            </Link>
                                        </li>
                                    ))}
                                </ul>
                            )}
                </CardContent>
            </Card>
            <Card className="shadow-none">
                <CardContent className="flex flex-col gap-3 p-5">
                    <h2 className="text-base font-semibold">New organization</h2>
                    <CreateOrganizationForm/>
                </CardContent>
            </Card>
        </div>
        </AppShell>
    );
}
