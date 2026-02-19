"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
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
import DynamicAnalytics from "@/components/analysis/DynamicAnalytics";

export default function ScopedUnitWorkspace() {
    const params = useParams();
    const surveyId = params.id as string;
    const unitId = params.unitId as string;

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
                <Tabs defaultValue="categorization" className="w-full">
                    <TabsList className="grid w-full grid-cols-5 mb-8 bg-white border border-slate-200 p-1 h-12 shadow-sm rounded-lg">

                        <TabsTrigger value="categorization" className="gap-2 data-[state=active]:bg-purple-50 data-[state=active]:text-purple-700">
                            <BrainCircuit className="w-4 h-4" /> 1. Build Categories
                        </TabsTrigger>

                        <TabsTrigger value="analysis" className="gap-2 data-[state=active]:bg-green-50 data-[state=active]:text-green-700">
                            <Database className="w-4 h-4" /> 2. Run Analysis
                        </TabsTrigger>

                        <TabsTrigger value="results" className="gap-2 data-[state=active]:bg-amber-50 data-[state=active]:text-amber-700">
                            <ListChecks className="w-4 h-4" /> 3. Audit Results
                        </TabsTrigger>

                        <TabsTrigger value="insights" className="gap-2 data-[state=active]:bg-indigo-50 data-[state=active]:text-indigo-700">
                            <PieChart className="w-4 h-4" /> 4. Comprehensive Insights
                        </TabsTrigger>

                        <TabsTrigger value="datascience" className="gap-2 data-[state=active]:bg-pink-50 data-[state=active]:text-pink-700">
                            <Sparkles className="w-4 h-4" /> 5. AI Data Scientist
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

                    {/* TAB 5: DYNAMIC AI ANALYTICS */}
                    <TabsContent value="datascience" className="focus-visible:ring-0 animate-in fade-in slide-in-from-bottom-2 duration-500">
                        <ErrorBoundary fallbackTitle="AI Analytics crashed">
                            <DynamicAnalytics unitId={unitId} surveyId={surveyId} />
                        </ErrorBoundary>
                    </TabsContent>

                </Tabs>

            </div>
        </PageShell>
    );
}