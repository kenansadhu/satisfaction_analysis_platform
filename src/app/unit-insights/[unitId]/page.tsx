"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart2, Sparkles, MessageSquare } from "lucide-react";
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

    useEffect(() => {
        supabase
            .from('organization_units')
            .select('name, short_name')
            .eq('id', unitId)
            .single()
            .then(({ data }) => {
                if (data) setUnitName(data.name);
            });
    }, [unitId]);

    const surveyId = activeSurveyId && activeSurveyId !== "all" ? activeSurveyId : undefined;

    const noSurveyPlaceholder = (icon: React.ReactNode, label: string) => (
        <div className="text-center py-20 text-slate-400">
            {icon}
            <p className="font-medium mt-3">{label}</p>
        </div>
    );

    return (
        <PageShell>
            <PageHeader
                title={unitName}
                description={activeSurvey ? `Unit Insights · ${activeSurvey.title}` : "Unit Insights"}
                backHref="/unit-insights"
                backLabel="All Units"
            />

            <div className="max-w-7xl mx-auto px-8 py-8">
                <Tabs defaultValue="insights" className="w-full">
                    <TabsList className="mb-8 p-0 bg-slate-200/50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-xl inline-flex h-12 items-center justify-center overflow-hidden">
                        <TabsTrigger value="insights" className="rounded-none flex items-center gap-2 px-6 h-full data-[state=active]:bg-white dark:data-[state=active]:bg-slate-950 data-[state=active]:text-indigo-700 data-[state=active]:shadow-sm">
                            <BarChart2 className="w-4 h-4" /> Insights
                        </TabsTrigger>
                        <TabsTrigger value="voices" className="rounded-none flex items-center gap-2 px-6 h-full data-[state=active]:bg-white dark:data-[state=active]:bg-slate-950 data-[state=active]:text-pink-600 data-[state=active]:shadow-sm">
                            <MessageSquare className="w-4 h-4" /> Voices
                        </TabsTrigger>
                        <TabsTrigger value="ai" className="rounded-none flex items-center gap-2 px-6 h-full data-[state=active]:bg-white dark:data-[state=active]:bg-slate-950 data-[state=active]:text-violet-600 data-[state=active]:shadow-sm">
                            <Sparkles className="w-4 h-4" /> AI Specialist
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="insights" className="focus-visible:ring-0 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <ErrorBoundary fallbackTitle="Insights crashed">
                            {surveyId ? (
                                <ComprehensiveDashboard unitId={unitId} surveyId={surveyId} view="insights" />
                            ) : noSurveyPlaceholder(<BarChart2 className="w-10 h-10 mx-auto opacity-30" />, "Select a survey to view insights")}
                        </ErrorBoundary>
                    </TabsContent>

                    <TabsContent value="voices" className="focus-visible:ring-0 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <ErrorBoundary fallbackTitle="Voices crashed">
                            {surveyId ? (
                                <ComprehensiveDashboard unitId={unitId} surveyId={surveyId} view="voices" />
                            ) : noSurveyPlaceholder(<MessageSquare className="w-10 h-10 mx-auto opacity-30" />, "Select a survey to view student voices")}
                        </ErrorBoundary>
                    </TabsContent>

                    <TabsContent value="ai" className="focus-visible:ring-0 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <ErrorBoundary fallbackTitle="AI Specialist crashed">
                            {surveyId ? (
                                <UnitInsightChat unitId={unitId} surveyId={surveyId} fullPage={true} />
                            ) : noSurveyPlaceholder(<Sparkles className="w-10 h-10 mx-auto opacity-30" />, "Select a survey to use the AI Specialist")}
                        </ErrorBoundary>
                    </TabsContent>
                </Tabs>
            </div>
        </PageShell>
    );
}
