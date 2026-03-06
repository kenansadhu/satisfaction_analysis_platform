"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BrainCircuit, Database, ListChecks, PieChart, Sparkles } from "lucide-react";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { PageShell, PageHeader } from "@/components/layout/PageShell";

// --- IMPORT ENGINES & VIEWS ---
import CategorizationEngine from "@/components/analysis/CategorizationEngine";
import AnalysisEngine from "@/components/analysis/AnalysisEngine";
import DataBrowser from "@/components/analysis/DataBrowser";
import ComprehensiveDashboard from "@/components/analysis/ComprehensiveDashboard";
import UnitInsightChat from "@/components/analysis/UnitInsightChat";

// Tab value mapping for URL shortcut
const TAB_MAP: Record<string, string> = {
    categories: "categorization",
    analysis: "analysis",
    audit: "results",
    insights: "insights",
    chat: "chat",
};

export default function ScopedUnitWorkspace() {
    const params = useParams();
    const searchParams = useSearchParams();
    const surveyId = params.id as string;
    const unitId = params.unitId as string;

    // Read ?tab= query param for direct navigation
    const tabParam = searchParams.get("tab") || "";
    const defaultTab = TAB_MAP[tabParam] || "categorization";

    const [unitName, setUnitName] = useState("Loading...");
    const [surveyTitle, setSurveyTitle] = useState("");

    useEffect(() => {
        const fetchData = async () => {
            // Fetch Unit Name
            const { data: unit } = await supabase
                .from('organization_units')
                .select('name')
                .eq('id', unitId)
                .single();
            if (unit) setUnitName(unit.name);

            // Fetch Survey Title (for context)
            const { data: survey } = await supabase
                .from('surveys')
                .select('title')
                .eq('id', surveyId)
                .single();
            if (survey) setSurveyTitle(survey.title);
        };
        fetchData();
    }, [unitId, surveyId]);

    return (
        <PageShell>
            <PageHeader
                title={unitName}
                description={`Analysis Workspace • ${surveyTitle}`}
                backHref={`/surveys/${surveyId}`}
                backLabel="Back to Survey"
            />

            <div className="max-w-7xl mx-auto px-8 py-10 space-y-6">

                {/* Main Workspace Tabs */}
                <Tabs defaultValue={defaultTab} className="w-full">
                    <TabsList className="grid w-full grid-cols-5 mb-8 bg-slate-200/50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 p-0 h-12 shadow-sm rounded-xl overflow-hidden">

                        <TabsTrigger value="categorization" className="h-full rounded-none gap-2 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-950 data-[state=active]:text-purple-700 data-[state=active]:shadow-sm">
                            <BrainCircuit className="w-4 h-4" /> 1. Build Categories
                        </TabsTrigger>

                        <TabsTrigger value="analysis" className="h-full rounded-none gap-2 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-950 data-[state=active]:text-green-700 data-[state=active]:shadow-sm">
                            <Database className="w-4 h-4" /> 2. Run Analysis
                        </TabsTrigger>

                        <TabsTrigger value="results" className="h-full rounded-none gap-2 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-950 data-[state=active]:text-amber-700 data-[state=active]:shadow-sm">
                            <ListChecks className="w-4 h-4" /> 3. Audit Results
                        </TabsTrigger>

                        <TabsTrigger value="insights" className="h-full rounded-none gap-2 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-950 data-[state=active]:text-indigo-700 data-[state=active]:shadow-sm">
                            <PieChart className="w-4 h-4" /> 4. Dashboard
                        </TabsTrigger>

                        <TabsTrigger value="chat" className="h-full rounded-none gap-2 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-950 data-[state=active]:text-pink-600 data-[state=active]:shadow-sm">
                            <Sparkles className="w-4 h-4" /> 5. AI Specialist
                        </TabsTrigger>

                    </TabsList>

                    {/* TAB 1: AI CATEGORY DISCOVERY */}
                    <TabsContent value="categorization" className="focus-visible:ring-0 animate-in fade-in slide-in-from-bottom-2 duration-500">
                        <ErrorBoundary fallbackTitle="Category Engine crashed">
                            <CategorizationEngine unitId={unitId} surveyId={surveyId} />
                        </ErrorBoundary>
                    </TabsContent>

                    {/* TAB 2: DEEP ANALYSIS */}
                    <TabsContent value="analysis" className="focus-visible:ring-0 animate-in fade-in slide-in-from-bottom-2 duration-500">
                        <ErrorBoundary fallbackTitle="Analysis Engine crashed">
                            <AnalysisEngine unitId={unitId} surveyId={surveyId} />
                        </ErrorBoundary>
                    </TabsContent>

                    {/* TAB 3: DATA BROWSER (AUDIT) */}
                    <TabsContent value="results" className="focus-visible:ring-0 animate-in fade-in slide-in-from-bottom-2 duration-500">
                        <ErrorBoundary fallbackTitle="Data Browser crashed">
                            <DataBrowser unitId={unitId} surveyId={surveyId} />
                        </ErrorBoundary>
                    </TabsContent>

                    {/* TAB 4: COMPREHENSIVE DASHBOARD (Combined Qual + Quant) */}
                    <TabsContent value="insights" className="focus-visible:ring-0 animate-in fade-in slide-in-from-bottom-2 duration-500">
                        <ErrorBoundary fallbackTitle="Insights Dashboard crashed">
                            <ComprehensiveDashboard unitId={unitId} surveyId={surveyId} />
                        </ErrorBoundary>
                    </TabsContent>

                    {/* TAB 5: AI CHAT ANALYST */}
                    <TabsContent value="chat" className="focus-visible:ring-0 animate-in fade-in slide-in-from-bottom-2 duration-500">
                        <ErrorBoundary fallbackTitle="AI Analyst crashed">
                            <UnitInsightChat unitId={unitId} surveyId={surveyId} fullPage={true} />
                        </ErrorBoundary>
                    </TabsContent>

                </Tabs>

            </div>
        </PageShell>
    );
}