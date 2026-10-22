import {lazy, Suspense} from "react";
import {BrowserRouter, Navigate, Route, Routes} from "react-router-dom";
import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
import {ThemeProvider} from "next-themes";
import {Toaster} from "@/components/ui/sonner";
import {TooltipProvider} from "@/components/ui/tooltip";
import {AuthProvider} from "@/hooks/useAuth";
import {ProtectedRoute} from "@/components/ProtectedRoute";
import {OrgRoute} from "@/components/OrgRoute";
import {LegacyInvestorRedirect, RoundIndex, RoundRoute} from "@/components/RoundRoute";
import {FullPageSpinner} from "@/components/FullPageSpinner";
import {SetupRequired} from "@/pages/SetupRequired";
import {isSupabaseConfigured} from "@/lib/supabase";

const Auth = lazy(() => import("@/pages/Auth"));
const Home = lazy(() => import("@/pages/Home"));
const Organizations = lazy(() => import("@/pages/Organizations"));
const Pipeline = lazy(() => import("@/pages/Pipeline"));
const OrgSettings = lazy(() => import("@/pages/OrgSettings"));
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
                                    {/* Last-used organization, or onboarding for a user with none */}
                                    <Route path="/" element={<ProtectedRoute><Home/></ProtectedRoute>}/>
                                    <Route path="/orgs" element={<ProtectedRoute><Organizations/></ProtectedRoute>}/>
                                    <Route path="/o/:orgId" element={<ProtectedRoute><OrgRoute/></ProtectedRoute>}>
                                        {/* Last-used round, or "create your first round" */}
                                        <Route index element={<RoundIndex/>}/>
                                        <Route path="r/:roundId" element={<RoundRoute/>}>
                                            <Route index element={<Pipeline/>}/>
                                            <Route path="investors/:investorId" element={<Pipeline/>}/>
                                        </Route>
                                        <Route path="investors/:investorId" element={<LegacyInvestorRedirect/>}/>
                                        <Route path="settings" element={<OrgSettings/>}/>
                                    </Route>
                                    <Route path="/o" element={<Navigate to="/orgs" replace/>}/>
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
