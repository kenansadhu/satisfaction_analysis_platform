"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { ArrowLeft, BarChart2, BrainCircuit, Database, ListChecks, PieChart, Sparkles } from "lucide-react";
import Link from "next/link";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { PageShell, PageHeader } from "@/components/layout/PageShell";

// --- IMPORT ENGINES & VIEWS ---
// --- IMPORT ENGINES & VIEWS ---
import QuantitativeView from "@/components/analysis/QuantitativeView";
import CategorizationEngine from "@/components/analysis/CategorizationEngine";
import AnalysisEngine from "@/components/analysis/AnalysisEngine";
import DataBrowser from "@/components/analysis/DataBrowser";
import QualitativeDashboard from "@/components/analysis/QualitativeDashboard";
import ComprehensiveDashboard from "@/components/analysis/ComprehensiveDashboard";
import DynamicAnalytics from "@/components/analysis/DynamicAnalytics";

export default function UnitWorkspace() {
    const params = useParams();
    const unitId = params.id as string;
    const [unitName, setUnitName] = useState("Loading...");

    useEffect(() => {
        const fetchUnitName = async () => {
            const { data } = await supabase
                .from('organization_units')
                .select('name')
                .eq('id', unitId)
                .single();
            if (data) setUnitName(data.name);
        };
        fetchUnitName();
    }, [unitId]);

    return (
        <PageShell>
            <PageHeader
                title={unitName}
                description="Analysis Workspace"
                backHref="/analysis"
                backLabel="Analysis Board"
            />

            <div className="max-w-7xl mx-auto px-8 py-10 space-y-6">

                {/* Main Workspace Tabs */}
                <Tabs defaultValue="categorization" className="w-full">
                    {/* Update grid-cols to 5 (Combined 4+5) */}
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
                            <CategorizationEngine unitId={unitId} />
                        </ErrorBoundary>
                    </TabsContent>

                    {/* TAB 2: DEEP ANALYSIS */}
                    <TabsContent value="analysis" className="focus-visible:ring-0 animate-in fade-in slide-in-from-bottom-2 duration-500">
                        <ErrorBoundary fallbackTitle="Analysis Engine crashed">
                            <AnalysisEngine unitId={unitId} />
                        </ErrorBoundary>
                    </TabsContent>

                    {/* TAB 3: DATA BROWSER (AUDIT) */}
                    <TabsContent value="results" className="focus-visible:ring-0 animate-in fade-in slide-in-from-bottom-2 duration-500">
                        <ErrorBoundary fallbackTitle="Data Browser crashed">
                            <DataBrowser unitId={unitId} />
                        </ErrorBoundary>
                    </TabsContent>

                    {/* TAB 4: COMPREHENSIVE DASHBOARD (Combined Qual + Quant) */}
                    <TabsContent value="insights" className="focus-visible:ring-0 animate-in fade-in slide-in-from-bottom-2 duration-500">
                        <ErrorBoundary fallbackTitle="Insights Dashboard crashed">
                            <ComprehensiveDashboard unitId={unitId} />
                        </ErrorBoundary>
                    </TabsContent>

                    {/* TAB 5: DYNAMIC AI ANALYTICS */}
                    <TabsContent value="datascience" className="focus-visible:ring-0 animate-in fade-in slide-in-from-bottom-2 duration-500">
                        <ErrorBoundary fallbackTitle="AI Analytics crashed">
                            <DynamicAnalytics unitId={unitId} />
                        </ErrorBoundary>
                    </TabsContent>

                </Tabs>

            </div>
        </PageShell>
    );
}
