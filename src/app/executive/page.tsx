"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/layout/PageShell";
import { SentimentHeatmap, LeaderBoard } from "@/components/analytics/SentimentHeatmap";
import { IssuesRadar } from "@/components/analytics/IssuesRadar";
import { PraisesRadar } from "@/components/analytics/PraisesRadar";
import { CategoryInsightPanels } from "@/components/analytics/CategoryInsightPanels";
import { ActionPriorityMatrix } from "@/components/analytics/ActionPriorityMatrix";
import CrossUnitMentions from "@/components/analytics/CrossUnitMentions";
import { Users, MessageSquareQuote, AlertTriangle, Activity, Loader2, BarChart2, GitCompareArrows, FileText, Database, Sparkles, Save, Lightbulb, TrendingUp, Share2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Survey } from "@/types";
import YearComparison from "@/components/executive/YearComparison";
import SSIReport from "@/components/executive/SSIReport";
import AIAnalystChat from "@/components/analysis/AIAnalystChat";
import SavedChartsTab from "@/components/executive/SavedChartsTab";
import SuggestionHub from "@/components/executive/SuggestionHub";
import { DependencyGraph } from "@/components/analytics/DependencyGraph";
import { useActiveSurvey } from "@/context/SurveyContext";

type UnitPerformance = {
    id: number;
    name: string;
    total: number;
    positive: number;
    neutral: number;
    negative: number;
    score: number;
};

export default function ExecutiveDashboard() {
    const { activeSurveyId, activeSurvey, surveys } = useActiveSurvey();
    const selectedSurvey = activeSurveyId; // alias for compatibility

    const [units, setUnits] = useState<UnitPerformance[]>([]);
    const [loading, setLoading] = useState(true);

    const [overallScore, setOverallScore] = useState(0);
    const [totalComments, setTotalComments] = useState(0);
    const [criticalIssues, setCriticalIssues] = useState(0);

    const [praisesMax, setPraisesMax] = useState<number>(0);
    const [issuesMax, setIssuesMax] = useState<number>(0);
    const maxRadarDomain = Math.max(praisesMax, issuesMax, 1);

    // Survey loading is now handled by SurveyContext

    // 2. Fetch metrics whenever selected survey changes
    useEffect(() => {
        const fetchMetrics = async () => {
            if (!selectedSurvey) return; // Wait until survey is loaded/selected

            setLoading(true);

            try {
                // Determine API URL based on "all" vs specific survey
                const url = selectedSurvey === "all"
                    ? `/api/executive/metrics`
                    : `/api/executive/metrics?surveyId=${selectedSurvey}`;

                const res = await fetch(url);
                if (!res.ok) throw new Error("API Route failed");
                const { stats, error } = await res.json();

                if (error) throw new Error(error);

                // Calculate globals
                let globalTotal = 0;
                let globalScoreSum = 0;
                let globalCritical = 0;

                (stats as UnitPerformance[]).forEach(u => {
                    globalTotal += u.total;
                    globalScoreSum += (u.score * u.total);
                    globalCritical += u.negative;
                });

                setUnits(stats);
                setTotalComments(globalTotal);
                setOverallScore(globalTotal > 0 ? Math.round(globalScoreSum / globalTotal) : 0);
                setCriticalIssues(globalCritical);

            } catch (err) {
                console.error("Error fetching metrics:", err);
                toast.error("Failed to calculate executive metrics from server.");

                // Reset stats on error
                setUnits([]);
                setTotalComments(0);
                setOverallScore(0);
                setCriticalIssues(0);
            } finally {
                setLoading(false);
            }
        };

        fetchMetrics();
    }, [selectedSurvey]);

    return (
        <div className="min-h-full bg-slate-50 dark:bg-slate-950 pb-20 transition-colors">
            <PageHeader
                title="Executive Insights"
                description="High-level performance metrics, AI analysis, and actionable intelligence across the institution."
                actions={
                    activeSurvey ? (
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50/50 dark:bg-indigo-950/30 rounded-lg border border-indigo-200/50 dark:border-indigo-800/40">
                            <Database className="w-4 h-4 text-indigo-400" />
                            <span className="text-sm font-medium text-indigo-700 dark:text-indigo-200">{activeSurvey.title}</span>
                            {activeSurvey.year && <span className="text-xs text-slate-500 dark:text-slate-400">({activeSurvey.year})</span>}
                        </div>
                    ) : null
                }
            />

            <div className="max-w-7xl mx-auto px-8 py-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <Tabs defaultValue="report" className="w-full">
                    <TabsList className="mb-8 p-0 bg-slate-200/50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-xl inline-flex h-12 items-center justify-center overflow-hidden">
                        <TabsTrigger value="report" className="rounded-none flex items-center gap-2 px-5 h-full data-[state=active]:bg-white dark:data-[state=active]:bg-slate-950 data-[state=active]:shadow-sm">
                            <FileText className="w-4 h-4 text-emerald-500" /> Report
                        </TabsTrigger>
                        <TabsTrigger value="insights" className="rounded-none flex items-center gap-2 px-5 h-full data-[state=active]:bg-white dark:data-[state=active]:bg-slate-950 data-[state=active]:shadow-sm">
                            <BarChart2 className="w-4 h-4 text-purple-500" /> Insights
                        </TabsTrigger>
                        <TabsTrigger value="comparison" className="rounded-none flex items-center gap-2 px-5 h-full data-[state=active]:bg-white dark:data-[state=active]:bg-slate-950 data-[state=active]:shadow-sm">
                            <GitCompareArrows className="w-4 h-4 text-amber-500" /> Year Comparison
                        </TabsTrigger>
                        <TabsTrigger value="analyst" className="rounded-none flex items-center gap-2 px-5 h-full data-[state=active]:bg-white dark:data-[state=active]:bg-slate-950 data-[state=active]:shadow-sm">
                            <Sparkles className="w-4 h-4 text-purple-500" /> AI Analyst
                        </TabsTrigger>
                        <TabsTrigger value="saved" className="rounded-none flex items-center gap-2 px-5 h-full data-[state=active]:bg-white dark:data-[state=active]:bg-slate-950 data-[state=active]:shadow-sm">
                            <Save className="w-4 h-4" /> Saved
                        </TabsTrigger>
                        <TabsTrigger value="suggestions" className="rounded-none flex items-center gap-2 px-5 h-full data-[state=active]:bg-white dark:data-[state=active]:bg-slate-950 data-[state=active]:shadow-sm">
                            <Lightbulb className="w-4 h-4 text-amber-500" /> Suggestions
                        </TabsTrigger>
                        <TabsTrigger value="depmap" className="rounded-none flex items-center gap-2 px-5 h-full data-[state=active]:bg-white dark:data-[state=active]:bg-slate-950 data-[state=active]:shadow-sm">
                            <TrendingUp className="w-4 h-4 text-indigo-500" /> Dependency Map
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="report" className="mt-6 focus-visible:ring-0">
                        <SSIReport surveyId={selectedSurvey === "all" ? undefined : selectedSurvey} />
                    </TabsContent>

                    <TabsContent value="insights" className="space-y-6 mt-0 focus-visible:ring-0">

                        {/* 1. DARK HERO STRIP */}
                        <div className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 rounded-2xl p-7 shadow-lg">
                            <div className="absolute -top-10 -right-10 w-56 h-56 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none" />
                            <div className="absolute -bottom-8 left-1/3 w-40 h-40 bg-violet-500/15 rounded-full blur-3xl pointer-events-none" />
                            <div className="relative grid grid-cols-1 lg:grid-cols-5 gap-4 items-stretch">
                                {/* Big score — spans 2 of 5 cols */}
                                <div className="lg:col-span-2 flex flex-col justify-center py-2 pr-4 lg:border-r lg:border-white/10">
                                    <p className="text-xs font-semibold text-indigo-300 uppercase tracking-widest mb-4">Overall Sentiment Score</p>
                                    <div className="flex items-end gap-4">
                                        {loading
                                            ? <Loader2 className="w-16 h-16 animate-spin text-indigo-400" />
                                            : <span className="text-8xl font-black text-white leading-none tabular-nums">{overallScore}</span>
                                        }
                                        <div className="mb-2 space-y-1.5">
                                            <span className="text-3xl text-indigo-300 font-light">/100</span>
                                            <p className={`text-sm font-semibold ${overallScore >= 70 ? "text-emerald-400" : overallScore >= 50 ? "text-amber-400" : "text-red-400"}`}>
                                                {overallScore >= 70 ? "Healthy Institution" : overallScore >= 50 ? "Needs Attention" : "Critical Condition"}
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                {/* Feedback */}
                                <div className="bg-white/5 rounded-xl p-5 border border-white/10 flex flex-col justify-between">
                                    <div className="flex items-center gap-2">
                                        <MessageSquareQuote className="w-4 h-4 text-purple-400 shrink-0" />
                                        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Feedback</p>
                                    </div>
                                    <p className="text-4xl font-black text-white mt-3 tabular-nums">{loading ? "—" : totalComments.toLocaleString()}</p>
                                    <p className="text-xs text-slate-500 mt-2">comments analyzed</p>
                                </div>

                                {/* Issues */}
                                <div className="bg-white/5 rounded-xl p-5 border border-white/10 flex flex-col justify-between">
                                    <div className="flex items-center gap-2">
                                        <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                                        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Issues</p>
                                    </div>
                                    <p className="text-4xl font-black text-red-400 mt-3 tabular-nums">{loading ? "—" : criticalIssues.toLocaleString()}</p>
                                    <p className="text-xs text-slate-500 mt-2">negative sentiments</p>
                                </div>

                                {/* Active Units */}
                                <div className="bg-white/5 rounded-xl p-5 border border-white/10 flex flex-col justify-between">
                                    <div className="flex items-center gap-2">
                                        <Users className="w-4 h-4 text-emerald-400 shrink-0" />
                                        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Active Units</p>
                                    </div>
                                    <div className="mt-3">
                                        <span className="text-4xl font-black text-white tabular-nums">{loading ? "—" : units.filter(u => u.total > 0).length}</span>
                                        {!loading && <span className="text-xl font-normal text-slate-500">/{units.length}</span>}
                                    </div>
                                    <p className="text-xs text-slate-500 mt-2">with feedback data</p>
                                </div>
                            </div>
                        </div>

                        {/* 2. STRATEGIC SIGNALS — violet tinted band */}
                        <div className="bg-violet-50/60 dark:bg-violet-950/20 border border-violet-100 dark:border-violet-900/40 rounded-2xl p-5 space-y-5">
                            <div className="flex items-center gap-2">
                                <Sparkles className="w-4 h-4 text-violet-500" />
                                <h2 className="text-xs font-semibold text-violet-700 dark:text-violet-300 uppercase tracking-widest">Strategic Signals</h2>
                                <span className="text-xs text-slate-400 dark:text-slate-500 ml-1">Top praised and flagged categories across units</span>
                            </div>
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                <PraisesRadar surveyId={selectedSurvey} maxDomain={maxRadarDomain} onMaxCalculated={setPraisesMax} />
                                <IssuesRadar surveyId={selectedSurvey} maxDomain={maxRadarDomain} onMaxCalculated={setIssuesMax} />
                            </div>
                        </div>

                        {/* 3. CROSS-UNIT BENCHMARKS — sky tinted band */}
                        {selectedSurvey && selectedSurvey !== "all" && (
                            <div className="bg-sky-50/60 dark:bg-sky-950/20 border border-sky-100 dark:border-sky-900/40 rounded-2xl p-5 space-y-5">
                                <div className="flex items-center gap-2">
                                    <BarChart2 className="w-4 h-4 text-sky-500" />
                                    <h2 className="text-xs font-semibold text-sky-700 dark:text-sky-300 uppercase tracking-widest">Cross-Unit Benchmarks</h2>
                                    <span className="text-xs text-slate-400 dark:text-slate-500 ml-1">Categories tracked across all units — ranked by positive sentiment</span>
                                </div>
                                <CategoryInsightPanels surveyId={selectedSurvey} hideHeader />
                            </div>
                        )}

                        {/* 4. ACTION PRIORITY MATRIX */}
                        <ActionPriorityMatrix units={units} />

                        {/* 5. CROSS-UNIT TRAFFIC — orange tinted band */}
                        {selectedSurvey && selectedSurvey !== "all" && (
                            <div className="bg-orange-50/60 dark:bg-orange-950/20 border border-orange-100 dark:border-orange-900/40 rounded-2xl p-5 space-y-4">
                                <div className="flex items-center gap-2">
                                    <Share2 className="w-4 h-4 text-orange-500" />
                                    <h2 className="text-xs font-semibold text-orange-700 dark:text-orange-300 uppercase tracking-widest">Cross-Unit Traffic</h2>
                                    <span className="text-xs text-slate-400 dark:text-slate-500 ml-1">Units most referenced across other units&apos; feedback</span>
                                </div>
                                <CrossUnitMentions surveyId={selectedSurvey} hideHeader />
                            </div>
                        )}

                        {/* 6. UNIT PERFORMANCE — bento: leaderboards side by side, heatmap full-width below */}
                        <div className="space-y-4">
                            <div className="flex items-center gap-2">
                                <Activity className="w-4 h-4 text-slate-400" />
                                <h2 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Unit Performance</h2>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <LeaderBoard title="🏆 Top Performing Units" units={units} type="top" loading={loading} />
                                <LeaderBoard title="⚠️ Units Needing Attention" units={units} type="bottom" loading={loading} />
                            </div>
                            {loading ? (
                                <div className="h-96 w-full bg-slate-200/50 dark:bg-slate-800/50 rounded-xl animate-pulse backdrop-blur-sm border border-white/20" />
                            ) : (
                                <SentimentHeatmap units={units} surveyId={selectedSurvey ?? undefined} />
                            )}
                        </div>
                    </TabsContent>

                    <TabsContent value="comparison" className="mt-6 focus-visible:ring-0">
                        <YearComparison surveys={surveys as any} />
                    </TabsContent>

                    <TabsContent value="analyst" className="focus-visible:ring-0">
                        <AIAnalystChat
                            surveyId={selectedSurvey === "all" ? undefined : selectedSurvey}
                            macroData={[]}
                            onChartSaved={() => {}}
                        />
                    </TabsContent>

                    <TabsContent value="saved" className="focus-visible:ring-0">
                        <SavedChartsTab />
                    </TabsContent>

                    <TabsContent value="suggestions" className="focus-visible:ring-0">
                        <SuggestionHub surveyId={selectedSurvey === "all" ? undefined : selectedSurvey} />
                    </TabsContent>

                    <TabsContent value="depmap" className="focus-visible:ring-0 animate-in fade-in">
                        <div className="h-[600px] w-full bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
                            <DependencyGraph surveyId={selectedSurvey || "all"} />
                        </div>
                    </TabsContent>
                </Tabs>
            </div>
        </div>
    );
}
