import type {ReactNode} from "react";
import {Card, CardContent} from "@/components/ui/card";

/** Centered single-card layout for sign-in and access screens. */
export function AuthShell({children}: {children: ReactNode}) {
    return (
        <main className="min-h-svh grid place-items-center px-4 py-10">
            <Card className="w-full max-w-md shadow-sm">
                <CardContent className="flex flex-col items-start gap-4 p-7">{children}</CardContent>
            </Card>
        </main>
    );
}
