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
    useEffect(() => { document.title = "Executive Insights | Satisfaction Voice"; }, []);
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

    // Sentiments tab hero — top praised/concern categories
    const [topCategories, setTopCategories] = useState<{
        praise: { name: string; count: number } | null;
        concern: { name: string; count: number } | null;
    }>({ praise: null, concern: null });

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

    // Fetch top praised / top concern categories for the Sentiments tab hero.
    useEffect(() => {
        if (!selectedSurvey || selectedSurvey === "all") { setTopCategories({ praise: null, concern: null }); return; }
        Promise.all([
            fetch(`/api/analytics/radar-aggregation?surveyId=${selectedSurvey}&sentiment=Positive`).then(r => r.json()),
            fetch(`/api/analytics/radar-aggregation?surveyId=${selectedSurvey}&sentiment=Negative`).then(r => r.json()),
        ]).then(([posData, negData]) => {
            const aggregate = (rows: any[]) => {
                const map = new Map<string, number>();
                for (const row of (rows || [])) {
                    if (npsUnitIds.has(row.unit_id)) continue;
                    const name = row.category_name as string;
                    if (!name || name.toLowerCase().startsWith("general") || name.toLowerCase().includes("other")) continue;
                    map.set(name, (map.get(name) || 0) + (row.segment_count as number));
                }
                const top = [...map.entries()].sort((a, b) => b[1] - a[1])[0];
                return top ? { name: top[0], count: top[1] } : null;
            };
            setTopCategories({
                praise: aggregate(posData.rows),
                concern: aggregate(negData.rows),
            });
        }).catch(console.error);
    }, [selectedSurvey, npsUnitIds]);

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
                            <BarChart2 className="w-4 h-4 text-purple-500" /> Sentiments
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

                        {/* ── SENTIMENTS HERO ──────────────────────────────────────────────── */}
                        {(() => {
                            const totalPos = units.reduce((s, u) => s + u.positive, 0);
                            const totalNeg = criticalIssues;
                            const totalNeu = totalComments - totalPos - totalNeg;
                            const posPct = totalComments > 0 ? Math.round(totalPos / totalComments * 100) : 0;
                            const neuPct = totalComments > 0 ? Math.round(totalNeu / totalComments * 100) : 0;
                            const negPct = totalComments > 0 ? 100 - posPct - neuPct : 0;
                            const sentUnits = units
                                .filter(u => !npsUnitIds.has(u.id) && !excludedScoreUnitIds.has(u.id) && u.id !== studyProgramUnitId && u.total >= 10)
                                .sort((a, b) => b.score - a.score);
                            const bestUnit = sentUnits[0] ?? null;
                            const worstUnit = sentUnits[sentUnits.length - 1] ?? null;
                            return (
                                <div className="relative rounded-2xl overflow-hidden shadow-2xl">
                                    <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-purple-950 to-indigo-950" />
                                    <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(168,85,247,0.18),transparent_60%)]" />
                                    <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,rgba(99,102,241,0.12),transparent_60%)]" />
                                    <div className="relative z-10 p-8 md:p-10 space-y-6">

                                        {/* Score + Volume strip */}
                                        <div className="flex items-center gap-8">
                                            {/* Overall score */}
                                            <div className="shrink-0">
                                                <p className="text-xs font-semibold text-purple-300/70 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                                                    <MessageSquareQuote className="w-3.5 h-3.5" /> Sentiment Score
                                                </p>
                                                <div className={`text-5xl md:text-6xl font-black tracking-tight ${overallScore >= 60 ? "text-emerald-400" : overallScore >= 40 ? "text-amber-400" : "text-red-400"}`}>
                                                    {loading ? "—" : overallScore}
                                                </div>
                                                <p className="text-purple-300/40 text-xs mt-1">pos%×1 · neu%×0.5 · neg%×0</p>
                                            </div>

                                            {/* Divider */}
                                            <div className="w-px self-stretch bg-white/10 shrink-0" />

                                            {/* Volume bar */}
                                            <div className="flex-1 space-y-2">
                                                <p className="text-xs font-semibold text-purple-300/70 uppercase tracking-widest flex items-center gap-1.5">
                                                    <Activity className="w-3.5 h-3.5" />
                                                    {loading ? "Loading…" : `${totalComments.toLocaleString()} feedback segments analyzed`}
                                                </p>
                                                {!loading && totalComments > 0 && (
                                                    <>
                                                        <div className="w-full h-2.5 rounded-full overflow-hidden flex">
                                                            <div className="bg-emerald-400 transition-all" style={{ width: `${posPct}%` }} />
                                                            <div className="bg-amber-300 transition-all" style={{ width: `${neuPct}%` }} />
                                                            <div className="bg-red-400 transition-all" style={{ width: `${negPct}%` }} />
                                                        </div>
                                                        <div className="flex flex-wrap gap-4 text-sm">
                                                            <span className="flex items-center gap-1.5 text-emerald-400/80"><span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />{posPct}% positive ({totalPos.toLocaleString()})</span>
                                                            <span className="flex items-center gap-1.5 text-amber-300/80"><span className="w-2 h-2 rounded-full bg-amber-300 shrink-0" />{neuPct}% neutral ({totalNeu.toLocaleString()})</span>
                                                            <span className="flex items-center gap-1.5 text-red-400/80"><span className="w-2 h-2 rounded-full bg-red-400 shrink-0" />{negPct}% negative ({totalNeg.toLocaleString()})</span>
                                                        </div>
                                                        <p className="text-xs text-purple-300/30">each comment is AI-classified as positive, neutral, or negative</p>
                                                    </>
                                                )}
                                            </div>
                                        </div>

                                        {/* 4 cards */}
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">

                                            {/* Top Praise */}
                                            <div className="bg-white/[0.06] border border-white/10 rounded-xl p-5 space-y-2">
                                                <p className="text-xs font-semibold text-emerald-300/70 uppercase tracking-widest flex items-center gap-1.5">
                                                    <Sparkles className="w-3.5 h-3.5" /> Top Praise
                                                </p>
                                                {loading || !topCategories.praise ? (
                                                    <p className="text-2xl font-black text-slate-500">—</p>
                                                ) : (
                                                    <>
                                                        <p className="text-lg font-black text-emerald-400 leading-snug">{topCategories.praise.name}</p>
                                                        <p className="text-sm text-emerald-300/60 tabular-nums">{topCategories.praise.count.toLocaleString()} positive segments</p>
                                                    </>
                                                )}
                                                <p className="text-xs text-purple-300/30 pt-1">topic with the most positive comments across all units</p>
                                            </div>

                                            {/* Top Concern */}
                                            <div className="bg-white/[0.06] border border-white/10 rounded-xl p-5 space-y-2">
                                                <p className="text-xs font-semibold text-red-300/70 uppercase tracking-widest flex items-center gap-1.5">
                                                    <AlertTriangle className="w-3.5 h-3.5" /> Top Concern
                                                </p>
                                                {loading || !topCategories.concern ? (
                                                    <p className="text-2xl font-black text-slate-500">—</p>
                                                ) : (
                                                    <>
                                                        <p className="text-lg font-black text-red-400 leading-snug">{topCategories.concern.name}</p>
                                                        <p className="text-sm text-red-300/60 tabular-nums">{topCategories.concern.count.toLocaleString()} negative segments</p>
                                                    </>
                                                )}
                                                <p className="text-xs text-purple-300/30 pt-1">topic with the most negative comments across all units</p>
                                            </div>

                                            {/* Best Sentiment Unit */}
                                            <div className="bg-white/[0.06] border border-white/10 rounded-xl p-5 space-y-2">
                                                <p className="text-xs font-semibold text-blue-300/70 uppercase tracking-widest flex items-center gap-1.5">
                                                    <TrendingUp className="w-3.5 h-3.5" /> Highest Sentiment
                                                </p>
                                                {loading || !bestUnit ? (
                                                    <p className="text-2xl font-black text-slate-500">—</p>
                                                ) : (
                                                    <>
                                                        <p className="text-lg font-black text-white leading-snug">{bestUnit.name}</p>
                                                        <p className="text-sm text-blue-300/60 tabular-nums">Score: <span className="text-emerald-400 font-bold">{bestUnit.score}/100</span></p>
                                                    </>
                                                )}
                                                <p className="text-xs text-purple-300/30 pt-1">pos%×1 + neu%×0.5 + neg%×0 · highest among units with ≥10 comments</p>
                                            </div>

                                            {/* Needs Attention */}
                                            <div className="bg-white/[0.06] border border-white/10 rounded-xl p-5 space-y-2">
                                                <p className="text-xs font-semibold text-amber-300/70 uppercase tracking-widest flex items-center gap-1.5">
                                                    <AlertTriangle className="w-3.5 h-3.5" /> Needs Attention
                                                </p>
                                                {loading || !worstUnit ? (
                                                    <p className="text-2xl font-black text-slate-500">—</p>
                                                ) : (
                                                    <>
                                                        <p className="text-lg font-black text-white leading-snug">{worstUnit.name}</p>
                                                        <p className="text-sm text-amber-300/60 tabular-nums">Score: <span className="text-red-400 font-bold">{worstUnit.score}/100</span></p>
                                                    </>
                                                )}
                                                <p className="text-xs text-purple-300/30 pt-1">pos%×1 + neu%×0.5 + neg%×0 · lowest among units with ≥10 comments</p>
                                            </div>

                                        </div>
                                    </div>
                                </div>
                            );
                        })()}

                        {/* CATEGORY INTELLIGENCE — what topics are driving praise or problems */}
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
