"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PieChart, Sparkles } from "lucide-react";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { PageShell, PageHeader } from "@/components/layout/PageShell";
import ComprehensiveDashboard from "@/components/analysis/ComprehensiveDashboard";
import UnitInsightChat from "@/components/analysis/UnitInsightChat";
import { useActiveSurvey } from "@/context/SurveyContext";

export default function UnitInsightsDetailPage() {
    const params = useParams();
    const unitId = params.unitId as string;
    const { activeSurveyId, activeSurvey } = useActiveSurvey();

    const [unitName, setUnitName] = useState("Loading...");
    const [unitShortName, setUnitShortName] = useState<string | null>(null);

    useEffect(() => {
        supabase
            .from('organization_units')
            .select('name, short_name')
            .eq('id', unitId)
            .single()
            .then(({ data }) => {
                if (data) {
                    setUnitName(data.name);
                    setUnitShortName(data.short_name);
                }
            });
    }, [unitId]);

    const surveyId = activeSurveyId && activeSurveyId !== "all" ? activeSurveyId : undefined;

    return (
        <PageShell>
            <PageHeader
                title={unitName}
                description={activeSurvey ? `Unit Insights • ${activeSurvey.title}` : "Unit Insights"}
                backHref="/unit-insights"
                backLabel="All Units"
            />

            <div className="max-w-7xl mx-auto px-8 py-8 space-y-6">
                <Tabs defaultValue="dashboard" className="w-full">
                    <TabsList className="grid w-full grid-cols-2 mb-8 bg-slate-200/50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 p-0 h-12 shadow-sm rounded-xl overflow-hidden max-w-md">
                        <TabsTrigger value="dashboard" className="h-full rounded-none gap-2 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-950 data-[state=active]:text-indigo-700 data-[state=active]:shadow-sm">
                            <PieChart className="w-4 h-4" /> Dashboard
                        </TabsTrigger>
                        <TabsTrigger value="chat" className="h-full rounded-none gap-2 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-950 data-[state=active]:text-pink-600 data-[state=active]:shadow-sm">
                            <Sparkles className="w-4 h-4" /> AI Specialist
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="dashboard" className="focus-visible:ring-0 animate-in fade-in slide-in-from-bottom-2 duration-500">
                        <ErrorBoundary fallbackTitle="Dashboard crashed">
                            {surveyId ? (
                                <ComprehensiveDashboard unitId={unitId} surveyId={surveyId} />
                            ) : (
                                <div className="text-center py-16 text-slate-400">
                                    <PieChart className="w-10 h-10 mx-auto mb-3 opacity-30" />
                                    <p className="font-medium">Select a survey to view the dashboard</p>
                                </div>
                            )}
                        </ErrorBoundary>
                    </TabsContent>

                    <TabsContent value="chat" className="focus-visible:ring-0 animate-in fade-in slide-in-from-bottom-2 duration-500">
                        <ErrorBoundary fallbackTitle="AI Specialist crashed">
                            {surveyId ? (
                                <UnitInsightChat unitId={unitId} surveyId={surveyId} fullPage={true} />
                            ) : (
                                <div className="text-center py-16 text-slate-400">
                                    <Sparkles className="w-10 h-10 mx-auto mb-3 opacity-30" />
                                    <p className="font-medium">Select a survey to use the AI Specialist</p>
                                </div>
                            )}
                        </ErrorBoundary>
                    </TabsContent>
                </Tabs>
            </div>
        </PageShell>
    );
}
