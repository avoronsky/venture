import {lazy, Suspense} from "react";
import {BrowserRouter, Navigate, Route, Routes} from "react-router-dom";
import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
import {ThemeProvider} from "next-themes";
import {Toaster} from "@/components/ui/sonner";
import {TooltipProvider} from "@/components/ui/tooltip";
import {AuthProvider} from "@/hooks/useAuth";
import {ProtectedRoute} from "@/components/ProtectedRoute";
import {FullPageSpinner} from "@/components/FullPageSpinner";
import {SetupRequired} from "@/pages/SetupRequired";
import {isSupabaseConfigured} from "@/lib/supabase";

const Auth = lazy(() => import("@/pages/Auth"));
const Pipeline = lazy(() => import("@/pages/Pipeline"));
const Team = lazy(() => import("@/pages/Team"));
const NotFound = lazy(() => import("@/pages/NotFound"));

const queryClient = new QueryClient({
    defaultOptions: {queries: {staleTime: 30_000, refetchOnWindowFocus: true, retry: 1}},
});

function App() {
    if (!isSupabaseConfigured) return <SetupRequired/>;

    return (
        <QueryClientProvider client={queryClient}>
            <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
                <TooltipProvider delayDuration={300}>
                    <AuthProvider>
                        <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, "")}>
                            <Suspense fallback={<FullPageSpinner/>}>
                                <Routes>
                                    <Route path="/auth" element={<Auth/>}/>
                                    <Route path="/" element={<ProtectedRoute><Pipeline/></ProtectedRoute>}/>
                                    <Route path="/investors/:investorId" element={<ProtectedRoute><Pipeline/></ProtectedRoute>}/>
                                    <Route path="/team" element={<ProtectedRoute ownerOnly><Team/></ProtectedRoute>}/>
                                    <Route path="/pipeline" element={<Navigate to="/" replace/>}/>
                                    <Route path="*" element={<NotFound/>}/>
                                </Routes>
                            </Suspense>
                        </BrowserRouter>
                        <Toaster position="bottom-center" richColors closeButton/>
                    </AuthProvider>
                </TooltipProvider>
            </ThemeProvider>
        </QueryClientProvider>
    );
}

export default App;
