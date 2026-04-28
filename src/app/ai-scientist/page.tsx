"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/layout/PageShell";
import AIAnalystChat from "@/components/analysis/AIAnalystChat";
import SavedChartsTab from "@/components/executive/SavedChartsTab";
import { useActiveSurvey } from "@/context/SurveyContext";
import { Database, Sparkles, Save } from "lucide-react";

export default function AIScientistPage() {
    const { activeSurveyId, activeSurvey } = useActiveSurvey();
    const surveyId = activeSurveyId === "all" ? undefined : activeSurveyId;

    return (
        <div className="min-h-full bg-slate-50 dark:bg-slate-950 pb-20 transition-colors">
            <PageHeader
                title="AI Data Scientist"
                description="Conversational AI analysis and saved chart library for deep dives into student feedback."
                actions={
                    activeSurvey ? (
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-violet-50/50 dark:bg-violet-950/30 rounded-lg border border-violet-200/50 dark:border-violet-800/40">
                            <Database className="w-4 h-4 text-violet-400" />
                            <span className="text-sm font-medium text-violet-700 dark:text-violet-200">{activeSurvey.title}</span>
                            {activeSurvey.year && <span className="text-xs text-slate-500 dark:text-slate-400">({activeSurvey.year})</span>}
                        </div>
                    ) : null
                }
            />

            <div className="max-w-7xl mx-auto px-8 py-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <Tabs defaultValue="analyst" className="w-full">
                    <TabsList className="mb-8 p-0 bg-slate-200/50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-xl inline-flex h-12 items-center justify-center overflow-hidden">
                        <TabsTrigger value="analyst" className="rounded-none flex items-center gap-2 px-5 h-full data-[state=active]:bg-white dark:data-[state=active]:bg-slate-950 data-[state=active]:shadow-sm">
                            <Sparkles className="w-4 h-4 text-violet-500" /> AI Analyst
                        </TabsTrigger>
                        <TabsTrigger value="saved" className="rounded-none flex items-center gap-2 px-5 h-full data-[state=active]:bg-white dark:data-[state=active]:bg-slate-950 data-[state=active]:shadow-sm">
                            <Save className="w-4 h-4" /> Saved Charts
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="analyst" className="focus-visible:ring-0">
                        <AIAnalystChat
                            surveyId={surveyId}
                            macroData={[]}
                            onChartSaved={() => {}}
                        />
                    </TabsContent>

                    <TabsContent value="saved" className="focus-visible:ring-0">
                        <SavedChartsTab />
                    </TabsContent>
                </Tabs>
            </div>
        </div>
    );
}
