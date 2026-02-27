"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/layout/PageShell";
import { MetricCard } from "@/components/analytics/ExecutiveStats";
import { SentimentHeatmap, LeaderBoard } from "@/components/analytics/SentimentHeatmap";
import { IssuesRadar } from "@/components/analytics/IssuesRadar";
import { PraisesRadar } from "@/components/analytics/PraisesRadar";
import { DependencyGraph } from "@/components/analytics/DependencyGraph";
import { Users, MessageSquareQuote, AlertTriangle, Activity, Loader2, BarChart2, GitCompareArrows, FileText, Database } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Survey } from "@/types";
import YearComparison from "@/components/executive/YearComparison";
import SSIReport from "@/components/executive/SSIReport";
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
                title="Executive Overview"
                description="High-level performance metrics across the institution."
                actions={
                    activeSurvey ? (
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50/50 dark:bg-indigo-950/30 rounded-lg border border-indigo-200/50 dark:border-indigo-800/40">
                            <Database className="w-4 h-4 text-indigo-400" />
                            <span className="text-sm font-medium text-indigo-200">{activeSurvey.title}</span>
                            {activeSurvey.year && <span className="text-xs text-slate-400">({activeSurvey.year})</span>}
                        </div>
                    ) : null
                }
            />

            <div className="max-w-7xl mx-auto px-8 py-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <Tabs defaultValue="report" className="w-full">
                    <TabsList className="mb-8 p-0 bg-slate-200/50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-xl inline-flex h-12 items-center justify-center overflow-hidden">
                        <TabsTrigger value="report" className="rounded-none flex items-center gap-2 px-6 h-full data-[state=active]:bg-white dark:data-[state=active]:bg-slate-950 data-[state=active]:shadow-sm">
                            <FileText className="w-4 h-4 text-emerald-500" /> Report
                        </TabsTrigger>
                        <TabsTrigger value="insights" className="rounded-none flex items-center gap-2 px-6 h-full data-[state=active]:bg-white dark:data-[state=active]:bg-slate-950 data-[state=active]:shadow-sm">
                            <BarChart2 className="w-4 h-4 text-purple-500" /> Insights
                        </TabsTrigger>
                        <TabsTrigger value="comparison" className="rounded-none flex items-center gap-2 px-6 h-full data-[state=active]:bg-white dark:data-[state=active]:bg-slate-950 data-[state=active]:shadow-sm">
                            <GitCompareArrows className="w-4 h-4 text-amber-500" /> Year Comparison
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="report" className="mt-6 focus-visible:ring-0">
                        <SSIReport surveyId={selectedSurvey === "all" ? undefined : selectedSurvey} />
                    </TabsContent>

                    <TabsContent value="insights" className="space-y-8 mt-0 focus-visible:ring-0">

                        {/* 1. KEY METRICS ROW */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                            <MetricCard
                                title="Overall Sentiment Score"
                                value={loading ? <Loader2 className="w-5 h-5 animate-spin" /> : overallScore}
                                description={overallScore >= 70 ? "Healthy Institution" : overallScore >= 50 ? "Needs Attention" : "Critical Condition"}
                                trend={overallScore >= 70 ? "up" : overallScore >= 50 ? "flat" : "down"}
                                trendValue="Global Avg"
                                icon={Activity}
                                colorClass="text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30"
                            />
                            <MetricCard
                                title="Total Feedback Volume"
                                value={loading ? <Loader2 className="w-5 h-5 animate-spin" /> : totalComments.toLocaleString()}
                                description="Analyzed comments"
                                icon={MessageSquareQuote}
                                colorClass="text-purple-600 dark:text-purple-400 bg-purple-100 dark:bg-purple-900/30"
                            />
                            <MetricCard
                                title="Issues Detected"
                                value={loading ? <Loader2 className="w-5 h-5 animate-spin" /> : criticalIssues.toLocaleString()}
                                description="Negative sentiments"
                                trend="down"
                                trendValue="Action Req."
                                icon={AlertTriangle}
                                colorClass="text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30"
                            />
                            <MetricCard
                                title="Active Units"
                                value={loading ? <Loader2 className="w-5 h-5 animate-spin" /> : units.filter(u => u.total > 0).length}
                                description={`out of ${units.length} total units`}
                                icon={Users}
                                colorClass="text-indigo-600 dark:text-indigo-400 bg-indigo-100 dark:bg-indigo-900/30"
                            />
                        </div>

                        {/* 2. STRATEGIC INSIGHTS */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                            <div>
                                <PraisesRadar
                                    surveyId={selectedSurvey}
                                    maxDomain={maxRadarDomain}
                                    onMaxCalculated={setPraisesMax}
                                />
                            </div>
                            <div>
                                <IssuesRadar
                                    surveyId={selectedSurvey}
                                    maxDomain={maxRadarDomain}
                                    onMaxCalculated={setIssuesMax}
                                />
                            </div>
                        </div>

                        {/* 3. LEADERBOARDS & HEATMAP */}
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                            <div className="space-y-6">
                                <LeaderBoard title="🏆 Top Performing Units" units={units} type="top" loading={loading} />
                                <LeaderBoard title="⚠️ Units Needing Attention" units={units} type="bottom" loading={loading} />
                            </div>
                            <div className="lg:col-span-2 space-y-8">
                                {loading ? (
                                    <div className="h-96 w-full bg-slate-200/50 dark:bg-slate-800/50 rounded-xl animate-pulse backdrop-blur-sm border border-white/20" />
                                ) : (
                                    <SentimentHeatmap units={units} />
                                )}
                            </div>
                        </div>
                    </TabsContent>

                    <TabsContent value="comparison" className="mt-6 focus-visible:ring-0">
                        <YearComparison surveys={surveys as any} />
                    </TabsContent>
                </Tabs>
            </div>
        </div>
    );
}
