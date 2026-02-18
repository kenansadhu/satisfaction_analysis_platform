"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { ArrowLeft, BarChart2, BrainCircuit, Database, ListChecks, PieChart, Sparkles } from "lucide-react";
import Link from "next/link";

// --- IMPORT ENGINES & VIEWS ---
import QuantitativeView from "@/components/analysis/QuantitativeView";
import CategorizationEngine from "@/components/analysis/CategorizationEngine";
import AnalysisEngine from "@/components/analysis/AnalysisEngine";
import DataBrowser from "@/components/analysis/DataBrowser";
import QualitativeDashboard from "@/components/analysis/QualitativeDashboard";
import DynamicAnalytics from "@/components/analysis/DynamicAnalytics"; // <--- New Import

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
        <div className="min-h-screen bg-slate-50 p-8 font-sans">
            <div className="max-w-7xl mx-auto space-y-6">

                {/* Header Section */}
                <div className="flex items-center gap-4">
                    <Link href="/analysis">
                        <Button variant="ghost" size="icon" className="hover:bg-slate-200">
                            <ArrowLeft className="w-5 h-5 text-slate-600" />
                        </Button>
                    </Link>
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900">{unitName}</h1>
                        <p className="text-slate-500 text-sm">Analysis Workspace</p>
                    </div>
                </div>

                {/* Main Workspace Tabs */}
                <Tabs defaultValue="quantitative" className="w-full">
                    {/* Update grid-cols to 6 to fit the new tab */}
                    <TabsList className="grid w-full grid-cols-6 mb-8 bg-white border border-slate-200 p-1 h-12 shadow-sm rounded-lg">

                        <TabsTrigger value="quantitative" className="gap-2 data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700">
                            <BarChart2 className="w-4 h-4" /> 1. Quantitative
                        </TabsTrigger>

                        <TabsTrigger value="categorization" className="gap-2 data-[state=active]:bg-purple-50 data-[state=active]:text-purple-700">
                            <BrainCircuit className="w-4 h-4" /> 2. Build Categories
                        </TabsTrigger>

                        <TabsTrigger value="analysis" className="gap-2 data-[state=active]:bg-green-50 data-[state=active]:text-green-700">
                            <Database className="w-4 h-4" /> 3. Run Analysis
                        </TabsTrigger>

                        <TabsTrigger value="results" className="gap-2 data-[state=active]:bg-amber-50 data-[state=active]:text-amber-700">
                            <ListChecks className="w-4 h-4" /> 4. Audit Results
                        </TabsTrigger>

                        <TabsTrigger value="insights" className="gap-2 data-[state=active]:bg-indigo-50 data-[state=active]:text-indigo-700">
                            <PieChart className="w-4 h-4" /> 5. Insights
                        </TabsTrigger>

                        {/* NEW TAB 6 */}
                        <TabsTrigger value="datascience" className="gap-2 data-[state=active]:bg-pink-50 data-[state=active]:text-pink-700">
                            <Sparkles className="w-4 h-4" /> 6. AI Data Scientist
                        </TabsTrigger>

                    </TabsList>

                    {/* TAB 1: CHARTS & STATS */}
                    <TabsContent value="quantitative" className="focus-visible:ring-0">
                        <QuantitativeView unitId={unitId} />
                    </TabsContent>

                    {/* TAB 2: AI CATEGORY DISCOVERY */}
                    <TabsContent value="categorization" className="focus-visible:ring-0">
                        <CategorizationEngine unitId={unitId} />
                    </TabsContent>

                    {/* TAB 3: DEEP ANALYSIS */}
                    <TabsContent value="analysis" className="focus-visible:ring-0">
                        <AnalysisEngine unitId={unitId} />
                    </TabsContent>

                    {/* TAB 4: DATA BROWSER (AUDIT) */}
                    <TabsContent value="results" className="focus-visible:ring-0">
                        <DataBrowser unitId={unitId} />
                    </TabsContent>

                    {/* TAB 5: EXECUTIVE DASHBOARD */}
                    <TabsContent value="insights" className="focus-visible:ring-0">
                        <QualitativeDashboard unitId={unitId} />
                    </TabsContent>

                    {/* TAB 6: DYNAMIC AI ANALYTICS */}
                    <TabsContent value="datascience" className="focus-visible:ring-0">
                        <DynamicAnalytics unitId={unitId} />
                    </TabsContent>

                </Tabs>

            </div>
        </div>
    );
}