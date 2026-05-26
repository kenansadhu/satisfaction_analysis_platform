"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/layout/PageShell";
import { SentimentHeatmap } from "@/components/analytics/SentimentHeatmap";
import { IssuesRadar } from "@/components/analytics/IssuesRadar";
import { PraisesRadar } from "@/components/analytics/PraisesRadar";
import { CategoryInsightPanels } from "@/components/analytics/CategoryInsightPanels";
import { ActionPriorityMatrix } from "@/components/analytics/ActionPriorityMatrix";
import CrossUnitMentions from "@/components/analytics/CrossUnitMentions";
import { Users, MessageSquareQuote, AlertTriangle, Activity, Loader2, BarChart2, GitCompareArrows, FileText, Database, Sparkles, Lightbulb, TrendingUp, Share2, Target, LayoutDashboard } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Survey } from "@/types";
import YearComparison from "@/components/executive/YearComparison";
import SSIReport from "@/components/executive/SSIReport";
import SummaryTab from "@/components/executive/SummaryTab";
import SuggestionHub from "@/components/executive/SuggestionHub";
import { NpsTab } from "@/components/executive/NpsTab";
import { DependencyGraph } from "@/components/analytics/DependencyGraph";
import { CrossUnitComments } from "@/components/analytics/CrossUnitComments";
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

    // NPS totals (institution-wide, shown in the dark hero strip)
    const [npsTotals, setNpsTotals] = useState<{ nps_score: number | null; total: number } | null>(null);

    // Platform settings for unit filtering
    const [npsUnitIds, setNpsUnitIds] = useState<Set<number>>(new Set());
    const [excludedScoreUnitIds, setExcludedScoreUnitIds] = useState<Set<number>>(new Set());
    const [studyProgramUnitId, setStudyProgramUnitId] = useState<number | null>(null);

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
                const payload = await res.json().catch(() => ({}));
                if (!res.ok) {
                    const msg = payload?.detail || payload?.error || `HTTP ${res.status}`;
                    console.error("[/api/executive/metrics] failed:", payload);
                    throw new Error(msg);
                }
                const { stats, error } = payload;

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

    // Fetch platform settings once on mount
    useEffect(() => {
        Promise.all([
            fetch('/api/settings/nps-units').then(r => r.json()),
            fetch('/api/settings/excluded-score-units').then(r => r.json()),
            fetch('/api/settings/study-program-unit').then(r => r.json()),
        ]).then(([npsData, exclData, spData]) => {
            setNpsUnitIds(new Set<number>(npsData.npsUnitIds || []));
            setExcludedScoreUnitIds(new Set<number>(exclData.excludedUnitIds || []));
            setStudyProgramUnitId(spData.studyProgramUnitId ?? null);
        }).catch(console.error);
    }, []);

    // Fetch NPS totals for the dark hero strip (separate from the tab's full fetch).
    useEffect(() => {
        if (!selectedSurvey || selectedSurvey === "all") { setNpsTotals(null); return; }
        fetch(`/api/executive/nps?surveyId=${selectedSurvey}`)
            .then(r => r.json())
            .then(d => setNpsTotals(d.totals || null))
            .catch(() => setNpsTotals(null));
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
                <Tabs defaultValue="summary" className="w-full">
                    <TabsList className="mb-8 p-0 bg-slate-200/50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-xl inline-flex h-12 items-center justify-center overflow-hidden">
                        <TabsTrigger value="summary" className="rounded-none flex items-center gap-2 px-5 h-full data-[state=active]:bg-white dark:data-[state=active]:bg-slate-950 data-[state=active]:shadow-sm">
                            <LayoutDashboard className="w-4 h-4 text-sky-500" /> Summary
                        </TabsTrigger>
                        <TabsTrigger value="report" className="rounded-none flex items-center gap-2 px-5 h-full data-[state=active]:bg-white dark:data-[state=active]:bg-slate-950 data-[state=active]:shadow-sm">
                            <FileText className="w-4 h-4 text-emerald-500" /> SSI Index
                        </TabsTrigger>
                        <TabsTrigger value="insights" className="rounded-none flex items-center gap-2 px-5 h-full data-[state=active]:bg-white dark:data-[state=active]:bg-slate-950 data-[state=active]:shadow-sm">
                            <BarChart2 className="w-4 h-4 text-purple-500" /> Insights
                        </TabsTrigger>
                        <TabsTrigger value="nps" className="rounded-none flex items-center gap-2 px-5 h-full data-[state=active]:bg-white dark:data-[state=active]:bg-slate-950 data-[state=active]:shadow-sm">
                            <Target className="w-4 h-4 text-blue-500" /> NPS
                        </TabsTrigger>
                        <TabsTrigger value="suggestions" className="rounded-none flex items-center gap-2 px-5 h-full data-[state=active]:bg-white dark:data-[state=active]:bg-slate-950 data-[state=active]:shadow-sm">
                            <Lightbulb className="w-4 h-4 text-amber-500" /> Suggestions
                        </TabsTrigger>
                        <TabsTrigger value="depmap" className="rounded-none flex items-center gap-2 px-5 h-full data-[state=active]:bg-white dark:data-[state=active]:bg-slate-950 data-[state=active]:shadow-sm">
                            <TrendingUp className="w-4 h-4 text-indigo-500" /> Dependency Map
                        </TabsTrigger>
                        <TabsTrigger value="comparison" className="rounded-none flex items-center gap-2 px-5 h-full data-[state=active]:bg-white dark:data-[state=active]:bg-slate-950 data-[state=active]:shadow-sm">
                            <GitCompareArrows className="w-4 h-4 text-amber-500" /> Year Comparison
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="summary" className="mt-6 focus-visible:ring-0">
                        <SummaryTab surveyId={selectedSurvey === "all" ? undefined : selectedSurvey} />
                    </TabsContent>

                    <TabsContent value="report" className="mt-6 focus-visible:ring-0">
                        <SSIReport surveyId={selectedSurvey === "all" ? undefined : selectedSurvey} />
                    </TabsContent>

                    <TabsContent value="insights" className="space-y-6 mt-0 focus-visible:ring-0">

                        {/* 1. OVERVIEW — dark hero strip */}
                        <div className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 rounded-2xl p-7 shadow-lg">
                            <div className="absolute -top-10 -right-10 w-56 h-56 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none" />
                            <div className="absolute -bottom-8 left-1/3 w-40 h-40 bg-violet-500/15 rounded-full blur-3xl pointer-events-none" />
                            <div className="relative grid grid-cols-1 lg:grid-cols-6 gap-4 items-stretch">
                                {/* Big score — spans 2 of 5 cols */}
                                <div className="lg:col-span-2 flex flex-col justify-center py-2 pr-4 lg:border-r lg:border-white/10">
                                    <p className="text-xs font-semibold text-indigo-300 uppercase tracking-widest mb-4">Overall Sentiment Score</p>
                                    <div className="flex items-end gap-4">
                                        {loading
                                            ? <Loader2 className="w-16 h-16 animate-spin text-indigo-400" />
                                            : <span className={`text-8xl font-black leading-none tabular-nums ${overallScore >= 60 ? "text-emerald-400" : overallScore >= 40 ? "text-amber-400" : "text-red-400"}`}>{overallScore}</span>
                                        }
                                        <div className="mb-2 space-y-1.5">
                                            <span className="text-3xl text-indigo-300 font-light">/100</span>
                                            <p className={`text-sm font-semibold ${overallScore >= 60 ? "text-emerald-400" : overallScore >= 40 ? "text-amber-400" : "text-red-400"}`}>
                                                {overallScore >= 60 ? "Healthy Institution" : overallScore >= 40 ? "Needs Attention" : "Critical Condition"}
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
                                        {(() => {
                                            const activeUnits = units.filter(u => !npsUnitIds.has(u.id) && !excludedScoreUnitIds.has(u.id) && u.id !== studyProgramUnitId);
                                            return <>
                                                <span className="text-4xl font-black text-white tabular-nums">{loading ? "—" : activeUnits.filter(u => u.total > 0).length}</span>
                                                {!loading && <span className="text-xl font-normal text-slate-500">/{activeUnits.length}</span>}
                                            </>;
                                        })()}
                                    </div>
                                    <p className="text-xs text-slate-500 mt-2">with feedback data</p>
                                </div>

                                {/* NPS */}
                                <div className="bg-white/5 rounded-xl p-5 border border-white/10 flex flex-col justify-between">
                                    <div className="flex items-center gap-2">
                                        <Target className="w-4 h-4 text-blue-400 shrink-0" />
                                        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">NPS</p>
                                    </div>
                                    {npsTotals && npsTotals.total > 0 && npsTotals.nps_score !== null ? (
                                        <>
                                            <p className={`text-4xl font-black mt-3 tabular-nums ${
                                                npsTotals.nps_score >= 50 ? "text-emerald-400" :
                                                npsTotals.nps_score >= 0 ? "text-amber-400" : "text-red-400"
                                            }`}>
                                                {npsTotals.nps_score > 0 ? `+${npsTotals.nps_score}` : npsTotals.nps_score}
                                            </p>
                                            <p className="text-xs text-slate-500 mt-2">n = {npsTotals.total.toLocaleString()} · open NPS tab</p>
                                        </>
                                    ) : (
                                        <>
                                            <p className="text-4xl font-black text-slate-600 mt-3 tabular-nums">—</p>
                                            <p className="text-xs text-slate-500 mt-2">
                                                {npsTotals === null ? "select a survey" : "no NPS data"}
                                            </p>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* 2. CATEGORY INTELLIGENCE — what topics are driving praise or problems */}
                        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-5">
                            <div>
                                <div className="flex items-center gap-2 mb-0.5">
                                    <Sparkles className="w-4 h-4 text-violet-500" />
                                    <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Category Intelligence</h2>
                                </div>
                                <p className="text-xs text-slate-400 ml-6">Which topics are driving praise or problems across the institution</p>
                            </div>
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                <PraisesRadar surveyId={selectedSurvey} maxDomain={maxRadarDomain} onMaxCalculated={setPraisesMax} excludeUnitIds={[...npsUnitIds]} />
                                <IssuesRadar surveyId={selectedSurvey} maxDomain={maxRadarDomain} onMaxCalculated={setIssuesMax} excludeUnitIds={[...npsUnitIds]} />
                            </div>
                            <div className="border-t border-slate-100 dark:border-slate-800 pt-5">
                                <ActionPriorityMatrix units={units.filter(u => !npsUnitIds.has(u.id))} />
                            </div>
                        </div>

                        {/* 3. SENTIMENT BY UNIT — full sentiment breakdown */}
                        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-5">
                            <div>
                                <div className="flex items-center gap-2 mb-0.5">
                                    <Activity className="w-4 h-4 text-slate-500" />
                                    <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Sentiment by Unit</h2>
                                </div>
                                <p className="text-xs text-slate-400 ml-6">Full sentiment breakdown for units included in the Satisfaction Index</p>
                            </div>
                            {loading ? (
                                <div className="h-96 w-full bg-slate-100 dark:bg-slate-800 rounded-xl animate-pulse" />
                            ) : (
                                <SentimentHeatmap units={units.filter(u => !excludedScoreUnitIds.has(u.id))} surveyId={selectedSurvey ?? undefined} />
                            )}
                        </div>

                        {/* 4. SHARED CATEGORIES — ranked by satisfaction across all units */}
                        {selectedSurvey && selectedSurvey !== "all" && (
                            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-5">
                                <div>
                                    <div className="flex items-center gap-2 mb-0.5">
                                        <TrendingUp className="w-4 h-4 text-indigo-500" />
                                        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Shared Categories</h2>
                                    </div>
                                    <p className="text-xs text-slate-400 ml-6">Categories ranked by satisfaction across all units</p>
                                </div>
                                <CategoryInsightPanels surveyId={selectedSurvey} hideHeader excludeUnitIds={[...npsUnitIds]} />
                            </div>
                        )}

                    </TabsContent>

                    <TabsContent value="comparison" className="mt-6 focus-visible:ring-0">
                        <YearComparison surveys={surveys as any} />
                    </TabsContent>

                    <TabsContent value="suggestions" className="focus-visible:ring-0">
                        <SuggestionHub surveyId={selectedSurvey === "all" ? undefined : selectedSurvey} />
                    </TabsContent>

                    <TabsContent value="nps" className="mt-6 focus-visible:ring-0">
                        <NpsTab surveyId={selectedSurvey ?? null} />
                    </TabsContent>

                    <TabsContent value="depmap" className="focus-visible:ring-0 animate-in fade-in space-y-6">
                        <div className="h-[1080px] w-full bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
                            <DependencyGraph surveyId={selectedSurvey || "all"} npsUnitIds={[...npsUnitIds]} />
                        </div>
                        {selectedSurvey && selectedSurvey !== "all" && (
                            <>
                                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4">
                                    <div>
                                        <div className="flex items-center gap-2 mb-0.5">
                                            <Share2 className="w-4 h-4 text-slate-500" />
                                            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Cross-Unit References</h2>
                                        </div>
                                        <p className="text-xs text-slate-400 ml-6">Which units are students mentioning when giving feedback to other units</p>
                                    </div>
                                    <CrossUnitMentions surveyId={selectedSurvey} hideHeader npsUnitIds={[...npsUnitIds]} />
                                </div>
                                <CrossUnitComments surveyId={selectedSurvey} />
                            </>
                        )}
                    </TabsContent>
                </Tabs>
            </div>
        </div>
    );
}
