"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { PageShell, PageHeader } from "@/components/layout/PageShell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useActiveSurvey } from "@/context/SurveyContext";
import {
    GraduationCap, Users, Target, CheckCircle2, AlertTriangle,
    BookOpen, Building2, AlertCircle, ThumbsUp, ThumbsDown, Sparkles,
    LayoutDashboard, TrendingUp,
} from "lucide-react";
import { NpsCard } from "@/components/nps/NpsCard";
import { emptyNpsCounts, NpsCounts } from "@/lib/nps";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import FacultyInsightChat from "@/components/analysis/FacultyInsightChat";
import { FacultyStudentVoices } from "@/components/analysis/FacultyStudentVoices";

// ── Types ───────────────────────────────────────────────────────────────────

interface Sentiment {
    positive: number; negative: number; neutral: number; total: number;
    positive_pct: number; negative_pct: number;
}

interface CategoryCount {
    category_name: string;
    positive: number; negative: number; neutral: number; total: number;
}

interface NpsAgg {
    nps_score: number;
    promoters: number;
    passives: number;
    detractors: number;
    total: number;
}

interface StudyProgramRow {
    study_program: string;
    respondents: number;
    enrolled: number | null;
    response_rate: number | null;
    avg_score: number | null;
    sentiment: Sentiment;
    top_positive_categories: CategoryCount[];
    top_negative_categories: CategoryCount[];
    nps: NpsAgg | null;
}

interface CampusUnitRow {
    unit_id: number;
    unit_name: string;
    short_name: string | null;
    avg_score: number | null;
    score_count: number;
    sentiment: Sentiment;
}

interface DetailData {
    faculty: { id: number; name: string; short_name: string | null; description: string | null };
    npsUnitIds: number[];
    totalRespondents: number;
    totalEnrolled: number;
    responseRate: number | null;
    programQuality: {
        unit: { id: number; name: string; short_name: string | null } | null;
        overallScore: number | null;
        overallSentiment: Sentiment;
        studyPrograms: StudyProgramRow[];
    };
    campusExperience: {
        overallScore: number | null;
        overallSentiment: Sentiment;
        units: CampusUnitRow[];
    };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function scoreColor(score: number | null): string {
    if (score === null) return "text-slate-400";
    if (score >= 3.20) return "text-emerald-600 dark:text-emerald-400";
    if (score >= 3.00) return "text-amber-600 dark:text-amber-400";
    return "text-red-600 dark:text-red-400";
}

function scoreBg(score: number | null): string {
    if (score === null) return "bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700";
    if (score >= 3.20) return "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800";
    if (score >= 3.00) return "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800";
    return "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800";
}

function scoreBarColor(score: number | null): string {
    if (score === null) return "bg-slate-300";
    if (score >= 3.20) return "bg-emerald-500";
    if (score >= 3.00) return "bg-amber-400";
    return "bg-red-400";
}

function npsColor(score: number): string {
    if (score >= 50) return "text-emerald-600 dark:text-emerald-400";
    if (score >= 0) return "text-amber-600 dark:text-amber-400";
    return "text-red-600 dark:text-red-400";
}

function npsBg(score: number): string {
    if (score >= 50) return "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800";
    if (score >= 0) return "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800";
    return "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800";
}

function SentimentBar({ sentiment, height = "h-1.5" }: { sentiment: Sentiment; height?: string }) {
    if (sentiment.total === 0) return (
        <div className={`${height} rounded-full bg-slate-100 dark:bg-slate-800`} />
    );
    return (
        <div className={`flex ${height} rounded-full overflow-hidden bg-slate-100 dark:bg-slate-800`}>
            {sentiment.positive > 0 && <div style={{ width: `${sentiment.positive_pct}%` }} className="bg-emerald-500" />}
            {sentiment.neutral > 0 && <div style={{ width: `${100 - sentiment.positive_pct - sentiment.negative_pct}%` }} className="bg-slate-300 dark:bg-slate-600" />}
            {sentiment.negative > 0 && <div style={{ width: `${sentiment.negative_pct}%` }} className="bg-red-400" />}
        </div>
    );
}

function LoadingSkeleton() {
    return (
        <div className="space-y-6">
            <Skeleton className="h-52 rounded-2xl" />
            <Skeleton className="h-64 rounded-2xl" />
            <Skeleton className="h-48 rounded-2xl" />
        </div>
    );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function FacultyDetailPage() {
    const params = useParams();
    const facultyId = params.facultyId as string;
    const { activeSurveyId, activeSurvey } = useActiveSurvey();

    const [data, setData] = useState<DetailData | null>(null);
    const [loading, setLoading] = useState(false);
    const [progSort, setProgSort] = useState<"score" | "nps" | "sentiment">("score");
    const [npsByColumn, setNpsByColumn] = useState<{ column: string; unitName: string; counts: NpsCounts }[]>([]);

    const surveyId = activeSurveyId && activeSurveyId !== "all" ? activeSurveyId : null;

    useEffect(() => {
        if (!surveyId) { setData(null); setNpsByColumn([]); return; }
        setLoading(true);
        setData(null);
        setNpsByColumn([]);

        fetch(`/api/executive/faculty-detail?facultyId=${facultyId}&surveyId=${surveyId}`)
            .then(r => r.json())
            .then(json => { if (!json.error) setData(json); })
            .catch(() => {})
            .finally(() => setLoading(false));

        fetch(`/api/executive/nps?surveyId=${surveyId}`)
            .then(r => r.json())
            .then((json: { faculties: Array<{ faculty: string; unit_name: string; column: string; detractors: number; passives: number; promoters: number; total: number }> }) => {
                import("@/lib/supabase").then(async ({ supabase }) => {
                    const { data: fac } = await supabase.from("faculties").select("name").eq("id", parseInt(facultyId)).single();
                    if (!fac) return;
                    const name = fac.name;
                    const rows = (json.faculties || []).filter(r => r.faculty === name);
                    const grouped = new Map<string, { column: string; unitName: string; counts: NpsCounts }>();
                    for (const r of rows) {
                        const key = `${r.unit_name}::${r.column}`;
                        if (!grouped.has(key)) grouped.set(key, { column: r.column, unitName: r.unit_name, counts: emptyNpsCounts() });
                        const g = grouped.get(key)!;
                        g.counts.detractor += r.detractors;
                        g.counts.passive += r.passives;
                        g.counts.promoter += r.promoters;
                        g.counts.total += r.total;
                    }
                    setNpsByColumn(Array.from(grouped.values()));
                });
            })
            .catch(() => {});
    }, [facultyId, surveyId]);

    const facultyName = data?.faculty?.name ?? "Faculty";
    const facultyShortName = data?.faculty?.short_name ?? null;

    const sortedPrograms = data ? [...data.programQuality.studyPrograms].sort((a, b) => {
        if (progSort === "nps") return (b.nps?.nps_score ?? -999) - (a.nps?.nps_score ?? -999);
        if (progSort === "sentiment") return (b.sentiment.positive_pct ?? 0) - (a.sentiment.positive_pct ?? 0);
        return (b.avg_score ?? -1) - (a.avg_score ?? -1);
    }) : [];

    // Aggregate NPS across all columns for hero card
    const overallNps = npsByColumn.length > 0 ? (() => {
        const agg = { promoter: 0, passive: 0, detractor: 0, total: 0 };
        for (const n of npsByColumn) {
            agg.promoter += n.counts.promoter;
            agg.passive += n.counts.passive;
            agg.detractor += n.counts.detractor;
            agg.total += n.counts.total;
        }
        const score = agg.total > 0 ? Math.round(((agg.promoter - agg.detractor) / agg.total) * 100) : 0;
        const promoterPct = agg.total > 0 ? Math.round((agg.promoter / agg.total) * 100) : 0;
        const detractorPct = agg.total > 0 ? Math.round((agg.detractor / agg.total) * 100) : 0;
        return { ...agg, score, promoterPct, detractorPct };
    })() : null;

    // Key themes aggregated across all study programs
    const strengthCounts = new Map<string, number>();
    const concernCounts = new Map<string, number>();
    for (const sp of data?.programQuality?.studyPrograms ?? []) {
        for (const cat of sp.top_positive_categories ?? [])
            strengthCounts.set(cat.category_name, (strengthCounts.get(cat.category_name) ?? 0) + 1);
        for (const cat of sp.top_negative_categories ?? [])
            concernCounts.set(cat.category_name, (concernCounts.get(cat.category_name) ?? 0) + 1);
    }
    const topStrengths = [...strengthCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
    const topConcerns = [...concernCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
    const hasKeyThemes = topStrengths.length > 0 || topConcerns.length > 0;
    const numPrograms = data?.programQuality?.studyPrograms?.length ?? 0;

    return (
        <PageShell>
            <PageHeader
                title={
                    <span className="flex items-center gap-2">
                        <GraduationCap className="w-6 h-6 text-teal-500" />
                        {loading && !data ? "Loading..." : facultyName}
                    </span>
                }
                description={activeSurvey ? `Faculty Insights • ${activeSurvey.title}` : "Faculty Insights"}
                backHref="/faculty-insights"
                backLabel="All Faculties"
                actions={
                    facultyShortName ? (
                        <Badge variant="outline" className="bg-teal-50/50 text-teal-700 border-teal-200 dark:bg-teal-950/20 dark:text-teal-300 dark:border-teal-800 px-3 py-1">
                            {facultyShortName}
                        </Badge>
                    ) : null
                }
            />

            <div className="max-w-7xl mx-auto px-8 py-8 animate-in fade-in slide-in-from-bottom-4 duration-500">

                {!surveyId && (
                    <div className="text-center py-20">
                        <GraduationCap className="w-12 h-12 mx-auto mb-3 text-slate-300 dark:text-slate-600" />
                        <p className="text-slate-500 font-medium">Select a specific survey to view faculty insights.</p>
                    </div>
                )}

                {surveyId && (
                <Tabs defaultValue="overview" className="w-full">
                    <TabsList className="mb-8 p-0 bg-slate-200/50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-xl inline-flex h-12 items-center justify-center overflow-hidden">
                        <TabsTrigger value="overview" className="rounded-none flex items-center gap-2 px-5 h-full data-[state=active]:bg-white dark:data-[state=active]:bg-slate-950 data-[state=active]:text-teal-700 data-[state=active]:shadow-sm">
                            <LayoutDashboard className="w-4 h-4" /> Overview
                        </TabsTrigger>
                        <TabsTrigger value="study-programs" className="rounded-none flex items-center gap-2 px-5 h-full data-[state=active]:bg-white dark:data-[state=active]:bg-slate-950 data-[state=active]:text-violet-600 data-[state=active]:shadow-sm">
                            <BookOpen className="w-4 h-4" /> Study Programs
                        </TabsTrigger>
                        <TabsTrigger value="campus" className="rounded-none flex items-center gap-2 px-5 h-full data-[state=active]:bg-white dark:data-[state=active]:bg-slate-950 data-[state=active]:text-cyan-600 data-[state=active]:shadow-sm">
                            <Building2 className="w-4 h-4" /> Campus
                        </TabsTrigger>
                        <TabsTrigger value="ai" className="rounded-none flex items-center gap-2 px-5 h-full data-[state=active]:bg-white dark:data-[state=active]:bg-slate-950 data-[state=active]:text-violet-600 data-[state=active]:shadow-sm">
                            <Sparkles className="w-4 h-4" /> AI Specialist
                        </TabsTrigger>
                    </TabsList>

                    {/* ── OVERVIEW TAB ── */}
                    <TabsContent value="overview" className="focus-visible:ring-0 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <div className="space-y-6">
                            {loading && <LoadingSkeleton />}
                            {!loading && data && (() => {
                                const { totalRespondents, totalEnrolled, responseRate, programQuality, campusExperience } = data;
                                return (
                                    <>
                                        {/* Hero Card */}
                                        <div className="relative overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700 bg-gradient-to-br from-teal-50 via-white to-slate-50 dark:from-teal-950/20 dark:via-slate-900 dark:to-slate-900 p-6">
                                            <div className="absolute -top-10 -right-10 w-44 h-44 bg-teal-300/15 dark:bg-teal-600/10 rounded-full blur-3xl pointer-events-none" />
                                            <div className="absolute -bottom-8 -left-8 w-44 h-44 bg-cyan-300/15 dark:bg-cyan-600/10 rounded-full blur-3xl pointer-events-none" />
                                            <div className="relative space-y-5">
                                                {/* Faculty info */}
                                                <div>
                                                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                                                        <h2 className="text-xl font-black text-slate-900 dark:text-slate-100">{data.faculty.name}</h2>
                                                        {data.faculty.short_name && (
                                                            <Badge variant="secondary" className="font-semibold">{data.faculty.short_name}</Badge>
                                                        )}
                                                    </div>
                                                    {data.faculty.description && (
                                                        <p className="text-sm text-slate-500 dark:text-slate-400 mb-2">{data.faculty.description}</p>
                                                    )}
                                                    <div className="flex flex-wrap items-center gap-4 text-sm text-slate-500 dark:text-slate-400">
                                                        <span className="flex items-center gap-1.5"><Users className="w-4 h-4" />{totalRespondents.toLocaleString()} respondents</span>
                                                        {totalEnrolled > 0 && (
                                                            <span className="flex items-center gap-1.5"><Target className="w-4 h-4" />{responseRate !== null ? `${responseRate}% response rate` : `${totalEnrolled.toLocaleString()} enrolled`}</span>
                                                        )}
                                                        <span className="flex items-center gap-1.5"><BookOpen className="w-4 h-4" />{programQuality.studyPrograms.length} study programs</span>
                                                    </div>
                                                </div>

                                                {/* Metric blocks */}
                                                <div className={`grid grid-cols-1 gap-3 ${overallNps ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
                                                    {/* Program Quality */}
                                                    <div className={`rounded-xl border p-4 ${scoreBg(programQuality.overallScore)}`}>
                                                        <div className="flex items-center gap-1.5 mb-1">
                                                            <BookOpen className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" />
                                                            <span className="text-xs font-bold text-violet-700 dark:text-violet-400 uppercase tracking-wide">Program Quality</span>
                                                        </div>
                                                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-3 leading-relaxed">Academic feedback from students about their own study program</p>
                                                        <div className="mb-3">
                                                            {programQuality.overallScore !== null ? (
                                                                <span className={`text-3xl font-black tabular-nums leading-none ${scoreColor(programQuality.overallScore)}`}>
                                                                    {programQuality.overallScore}
                                                                </span>
                                                            ) : (
                                                                <span className="text-2xl font-bold text-slate-300">—</span>
                                                            )}
                                                            <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mt-0.5">SSI Index</div>
                                                        </div>
                                                        {programQuality.overallSentiment.total > 0 && (
                                                            <div className="space-y-1">
                                                                <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Sentiment</div>
                                                                <SentimentBar sentiment={programQuality.overallSentiment} height="h-2" />
                                                                <div className="flex justify-between text-[10px] font-semibold mt-0.5">
                                                                    <span className="text-emerald-600">{programQuality.overallSentiment.positive_pct}% pos</span>
                                                                    <span className="text-red-500">{programQuality.overallSentiment.negative_pct}% neg</span>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* NPS — if available */}
                                                    {overallNps && (
                                                        <div className={`rounded-xl border p-4 ${npsBg(overallNps.score)}`}>
                                                            <div className="flex items-center gap-1.5 mb-1">
                                                                <TrendingUp className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                                                                <span className="text-xs font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wide">Study Program NPS</span>
                                                            </div>
                                                            <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-3 leading-relaxed">Likelihood to recommend their study program to others</p>
                                                            <div className="mb-3">
                                                                <span className={`text-3xl font-black tabular-nums leading-none ${npsColor(overallNps.score)}`}>
                                                                    {overallNps.score > 0 ? "+" : ""}{overallNps.score}
                                                                </span>
                                                                <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mt-0.5">Net Promoter Score</div>
                                                            </div>
                                                            <div className="space-y-1.5">
                                                                <div className="flex h-2 rounded-full overflow-hidden bg-slate-100 dark:bg-slate-800">
                                                                    <div style={{ width: `${overallNps.promoterPct}%` }} className="bg-emerald-500" />
                                                                    <div style={{ width: `${100 - overallNps.promoterPct - overallNps.detractorPct}%` }} className="bg-slate-300 dark:bg-slate-600" />
                                                                    <div style={{ width: `${overallNps.detractorPct}%` }} className="bg-red-400" />
                                                                </div>
                                                                <div className="flex justify-between text-[10px] font-semibold">
                                                                    <span className="text-emerald-600">{overallNps.promoterPct}% promoters</span>
                                                                    <span className="text-red-500">{overallNps.detractorPct}% detractors</span>
                                                                </div>
                                                                <div className="text-[10px] text-slate-400 text-right">{overallNps.total.toLocaleString()} responses</div>
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Campus Experience */}
                                                    <div className={`rounded-xl border p-4 ${scoreBg(campusExperience.overallScore ?? null)}`}>
                                                        <div className="flex items-center gap-1.5 mb-1">
                                                            <Building2 className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                                                            <span className="text-xs font-bold text-cyan-700 dark:text-cyan-400 uppercase tracking-wide">Campus Experience</span>
                                                        </div>
                                                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-3 leading-relaxed">How students rate shared campus services and facilities</p>
                                                        <div className="mb-3">
                                                            {campusExperience.overallScore !== null ? (
                                                                <span className={`text-3xl font-black tabular-nums leading-none ${scoreColor(campusExperience.overallScore)}`}>
                                                                    {campusExperience.overallScore}
                                                                </span>
                                                            ) : (
                                                                <span className="text-2xl font-bold text-slate-300">—</span>
                                                            )}
                                                            <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mt-0.5">SSI Index</div>
                                                        </div>
                                                        {campusExperience.overallSentiment?.total > 0 && (
                                                            <div className="space-y-1">
                                                                <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Sentiment</div>
                                                                <SentimentBar sentiment={campusExperience.overallSentiment} height="h-2" />
                                                                <div className="flex justify-between text-[10px] font-semibold mt-0.5">
                                                                    <span className="text-emerald-600">{campusExperience.overallSentiment.positive_pct}% pos</span>
                                                                    <span className="text-red-500">{campusExperience.overallSentiment.negative_pct}% neg</span>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Key Themes */}
                                        {hasKeyThemes && (
                                            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4">
                                                <div className="flex items-center gap-2">
                                                    <Sparkles className="w-4 h-4 text-amber-500" />
                                                    <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Key Themes</h3>
                                                    {numPrograms > 1 && (
                                                        <Badge className="bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border border-amber-100 dark:border-amber-900/50 text-[11px] px-2 py-0 h-5">
                                                            across {numPrograms} programs
                                                        </Badge>
                                                    )}
                                                </div>
                                                <p className="text-xs text-slate-400 -mt-2 ml-6">Most common feedback categories across all study programs</p>
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                    {topStrengths.length > 0 && (
                                                        <div className="space-y-2">
                                                            <div className="flex items-center gap-1.5">
                                                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                                                                <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Strengths</span>
                                                            </div>
                                                            <div className="flex flex-wrap gap-1.5">
                                                                {topStrengths.map(([name, count]) => (
                                                                    <span key={name} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                                                                        <ThumbsUp className="w-3 h-3" />
                                                                        {name}
                                                                        {numPrograms > 1 && <span className="text-emerald-400 dark:text-emerald-600 font-bold">{count}/{numPrograms}</span>}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                    {topConcerns.length > 0 && (
                                                        <div className="space-y-2">
                                                            <div className="flex items-center gap-1.5">
                                                                <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                                                                <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Concerns</span>
                                                            </div>
                                                            <div className="flex flex-wrap gap-1.5">
                                                                {topConcerns.map(([name, count]) => (
                                                                    <span key={name} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800">
                                                                        <ThumbsUp className="w-3 h-3 rotate-180" />
                                                                        {name}
                                                                        {numPrograms > 1 && <span className="text-red-400 dark:text-red-600 font-bold">{count}/{numPrograms}</span>}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </>
                                );
                            })()}
                        </div>
                    </TabsContent>

                    {/* ── STUDY PROGRAMS TAB ── */}
                    <TabsContent value="study-programs" className="focus-visible:ring-0 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <div className="space-y-6">
                            {loading && <LoadingSkeleton />}
                            {!loading && data && (() => {
                                const { programQuality } = data;
                                return (
                                    <>
                                        {/* NPS Full Card — top of Study Programs tab */}
                                        {npsByColumn.length > 0 && (
                                            <div className="space-y-4">
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <TrendingUp className="w-4 h-4 text-amber-500" />
                                                        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Study Program NPS</h3>
                                                        <Badge className="bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border border-amber-100 dark:border-amber-900/50 text-[11px] px-2 py-0 h-5">Net Promoter Score</Badge>
                                                    </div>
                                                    <p className="text-xs text-slate-400 ml-6 mt-1 italic">
                                                        "Seberapa besar kemungkinan Anda akan merekomendasikan Prodi anda kepada teman atau kolega sebagai tempat studi?"
                                                    </p>
                                                    <p className="text-[11px] text-slate-400 ml-6 mt-0.5">Promoters (9–10) · Passives (7–8) · Detractors (0–6)</p>
                                                </div>

                                                {/* Overall NPS cards */}
                                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                                    {npsByColumn.map(n => (
                                                        <NpsCard
                                                            key={`${n.unitName}::${n.column}`}
                                                            title={n.column}
                                                            subtitle={`${n.unitName} • this faculty only`}
                                                            counts={n.counts}
                                                        />
                                                    ))}
                                                </div>

                                                {/* Per-program NPS breakdown */}
                                                {sortedPrograms.some(sp => sp.nps != null) && (
                                                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                                                        <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-900/60 border-b border-slate-100 dark:border-slate-800">
                                                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">NPS by Study Program</span>
                                                        </div>
                                                        <div className="divide-y divide-slate-100 dark:divide-slate-800">
                                                            {sortedPrograms.filter(sp => sp.nps != null).map(sp => {
                                                                const nps = sp.nps!;
                                                                const promoterPct = nps.total > 0 ? Math.round((nps.promoters / nps.total) * 100) : 0;
                                                                const passivePct = nps.total > 0 ? Math.round((nps.passives / nps.total) * 100) : 0;
                                                                const detractorPct = nps.total > 0 ? Math.round((nps.detractors / nps.total) * 100) : 0;
                                                                return (
                                                                    <div key={sp.study_program} className="flex items-center gap-4 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-900/40 transition-colors">
                                                                        <span className="text-sm font-medium text-slate-700 dark:text-slate-300 flex-1 min-w-0 truncate">{sp.study_program}</span>
                                                                        <div className="flex items-center gap-3 shrink-0">
                                                                            <span className={`text-base font-black tabular-nums w-10 text-right ${npsColor(nps.nps_score)}`}>
                                                                                {nps.nps_score > 0 ? "+" : ""}{nps.nps_score}
                                                                            </span>
                                                                            <div className="w-32 flex h-2 rounded-full overflow-hidden bg-slate-100 dark:bg-slate-800">
                                                                                <div className="bg-emerald-500" style={{ width: `${promoterPct}%` }} />
                                                                                <div className="bg-slate-300 dark:bg-slate-600" style={{ width: `${passivePct}%` }} />
                                                                                <div className="bg-red-400" style={{ width: `${detractorPct}%` }} />
                                                                            </div>
                                                                            <div className="text-[10px] text-slate-400 w-28 text-right">
                                                                                <span className="text-emerald-600 font-semibold">{nps.promoters}P</span>
                                                                                {" · "}
                                                                                <span className="text-slate-400">{nps.passives}Pa</span>
                                                                                {" · "}
                                                                                <span className="text-red-500 font-semibold">{nps.detractors}D</span>
                                                                                {" / "}
                                                                                {nps.total}
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {/* Program Quality Card */}
                                        <Card className="border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                                            <div className="h-1 bg-gradient-to-r from-violet-500 to-purple-500" />
                                            <CardHeader>
                                                <div className="flex items-start justify-between gap-4 flex-wrap">
                                                    <div>
                                                        <CardTitle className="flex items-center gap-2 text-lg">
                                                            <BookOpen className="w-5 h-5 text-violet-600 dark:text-violet-400" />
                                                            How students rate their study program
                                                        </CardTitle>
                                                        <CardDescription className="mt-1">
                                                            SSI Index (out of 4.00) · NPS · sentiment · top feedback themes
                                                        </CardDescription>
                                                    </div>
                                                    {programQuality.studyPrograms.length > 1 && (
                                                        <div className="flex items-center gap-2 shrink-0">
                                                            <span className="text-xs text-slate-400">Sort by:</span>
                                                            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5">
                                                                {([
                                                                    { key: "score", label: "SSI Score" },
                                                                    { key: "nps", label: "NPS Score" },
                                                                    { key: "sentiment", label: "Sentiment" },
                                                                ] as const).map(({ key, label }) => (
                                                                    <button
                                                                        key={key}
                                                                        onClick={() => setProgSort(key)}
                                                                        className={`h-7 px-2.5 text-xs rounded-md font-medium transition-colors ${progSort === key ? "bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 shadow-sm" : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"}`}
                                                                    >
                                                                        {label}
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </CardHeader>

                                            <CardContent className="p-0">
                                                {programQuality.studyPrograms.length === 0 ? (
                                                    <div className="flex items-center gap-3 p-6 text-slate-400">
                                                        <AlertCircle className="w-5 h-5 shrink-0" />
                                                        <p className="text-sm">No study program data found for this survey.</p>
                                                    </div>
                                                ) : (
                                                    <div className="divide-y divide-slate-100 dark:divide-slate-800">
                                                        {sortedPrograms.map((sp, i) => (
                                                            <div key={sp.study_program} className="px-5 py-4 hover:bg-slate-50 dark:hover:bg-slate-900/40 transition-colors">
                                                                <div className="flex items-start gap-3">
                                                                    <span className="text-xs font-bold text-slate-300 dark:text-slate-600 w-5 shrink-0 tabular-nums pt-0.5">{i + 1}</span>

                                                                    {/* Left: name + sentiment + chips */}
                                                                    <div className="flex-1 min-w-0 space-y-2">
                                                                        <div className="text-sm font-semibold text-slate-800 dark:text-slate-200 leading-snug">{sp.study_program}</div>

                                                                        {sp.sentiment.total > 0 && (
                                                                            <div className="flex items-center gap-2">
                                                                                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide shrink-0 w-[4.5rem]">Sentiment</span>
                                                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 tabular-nums">
                                                                                    ↑ {sp.sentiment.positive_pct}%
                                                                                </span>
                                                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 tabular-nums">
                                                                                    ↓ {sp.sentiment.negative_pct}%
                                                                                </span>
                                                                                <span className="text-[10px] text-slate-400 tabular-nums">{sp.sentiment.total} comments</span>
                                                                            </div>
                                                                        )}

                                                                        {sp.top_positive_categories?.length > 0 && (
                                                                            <div className="flex flex-wrap gap-1.5 items-center">
                                                                                <span className="text-[9px] font-bold text-emerald-600 uppercase tracking-wide shrink-0 w-[4.5rem]">Strengths</span>
                                                                                {sp.top_positive_categories.map(cat => (
                                                                                    <span key={`pos-${cat.category_name}`} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                                                                                        <ThumbsUp className="w-2.5 h-2.5" /> {cat.category_name}
                                                                                    </span>
                                                                                ))}
                                                                            </div>
                                                                        )}

                                                                        {sp.top_negative_categories?.length > 0 && (
                                                                            <div className="flex flex-wrap gap-1.5 items-center">
                                                                                <span className="text-[9px] font-bold text-red-500 uppercase tracking-wide shrink-0 w-[4.5rem]">Concerns</span>
                                                                                {sp.top_negative_categories.map(cat => (
                                                                                    <span key={`neg-${cat.category_name}`} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800">
                                                                                        <ThumbsDown className="w-2.5 h-2.5" /> {cat.category_name}
                                                                                    </span>
                                                                                ))}
                                                                            </div>
                                                                        )}
                                                                    </div>

                                                                    {/* Right: metrics panel */}
                                                                    <div className="shrink-0 flex items-start gap-4 pl-4 border-l border-slate-100 dark:border-slate-800">
                                                                        {sp.avg_score !== null && (
                                                                            <div className="text-center">
                                                                                <div className="text-[9px] font-semibold text-slate-400 uppercase tracking-wide">SSI</div>
                                                                                <div className={`text-lg font-black tabular-nums leading-tight ${scoreColor(sp.avg_score)}`}>{sp.avg_score}</div>
                                                                            </div>
                                                                        )}
                                                                        {sp.nps != null && (
                                                                            <div className="text-center">
                                                                                <div className="text-[9px] font-semibold text-slate-400 uppercase tracking-wide">NPS</div>
                                                                                <div className={`text-lg font-black tabular-nums leading-tight ${npsColor(sp.nps.nps_score)}`}>
                                                                                    {sp.nps.nps_score > 0 ? "+" : ""}{sp.nps.nps_score}
                                                                                </div>
                                                                            </div>
                                                                        )}
                                                                        <div className="text-center">
                                                                            <div className="text-[9px] font-semibold text-slate-400 uppercase tracking-wide">Resp.</div>
                                                                            <div className="text-sm font-semibold text-slate-600 dark:text-slate-400 tabular-nums leading-tight">{sp.respondents.toLocaleString()}</div>
                                                                        </div>
                                                                        {sp.response_rate !== null && (
                                                                            <div className="text-center">
                                                                                <div className="text-[9px] font-semibold text-slate-400 uppercase tracking-wide">Rate</div>
                                                                                <div className={`text-sm font-bold tabular-nums leading-tight ${sp.response_rate >= 80 ? "text-emerald-600" : sp.response_rate >= 50 ? "text-amber-600" : "text-red-500"}`}>
                                                                                    {sp.response_rate}%
                                                                                </div>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </CardContent>
                                        </Card>

                                        <FacultyStudentVoices
                                            facultyId={facultyId}
                                            surveyId={surveyId}
                                            title="Student Voices about their Study Program"
                                            restrictToUnitIds={[
                                                ...(data.programQuality.unit ? [data.programQuality.unit.id] : []),
                                                ...(data.npsUnitIds ?? []),
                                            ]}
                                            categoryUnitIds={data.programQuality.unit ? [data.programQuality.unit.id] : []}
                                        />
                                    </>
                                );
                            })()}
                        </div>
                    </TabsContent>

                    {/* ── CAMPUS TAB ── */}
                    <TabsContent value="campus" className="focus-visible:ring-0 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <div className="space-y-6">
                            {loading && <LoadingSkeleton />}
                            {!loading && data && (() => {
                                const { campusExperience } = data;
                                return (
                                    <>
                                        <Card className="border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                                            <div className="h-1 bg-gradient-to-r from-blue-500 to-cyan-500" />
                                            <CardHeader>
                                                <CardTitle className="flex items-center gap-2 text-lg">
                                                    <Building2 className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                                                    Campus Experience
                                                </CardTitle>
                                                <CardDescription>
                                                    How students in this faculty rate shared campus service units — SSI Index out of 4.00
                                                </CardDescription>
                                            </CardHeader>

                                            <CardContent className="p-0">
                                                {campusExperience.units.length === 0 ? (
                                                    <div className="flex items-center gap-3 p-6 text-slate-400">
                                                        <AlertCircle className="w-5 h-5 shrink-0" />
                                                        <p className="text-sm">No campus service unit data found for this faculty.</p>
                                                    </div>
                                                ) : (
                                                    <div className="divide-y divide-slate-100 dark:divide-slate-800">
                                                        {/* Header */}
                                                        <div className="grid grid-cols-[minmax(0,1fr)_10rem_9rem_5rem] gap-3 px-5 py-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wider bg-slate-50/60 dark:bg-slate-900/40">
                                                            <span>Service Unit</span>
                                                            <span className="text-center">SSI Index</span>
                                                            <span className="text-center">Sentiment</span>
                                                            <span className="text-right">Responses</span>
                                                        </div>
                                                        {campusExperience.units.map((unit, i) => (
                                                            <div key={unit.unit_id} className="grid grid-cols-[minmax(0,1fr)_10rem_9rem_5rem] gap-3 items-center px-5 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-900/40 transition-colors">
                                                                {/* Name */}
                                                                <div className="flex items-center gap-3 min-w-0">
                                                                    <span className="text-xs font-bold text-slate-300 dark:text-slate-600 w-5 shrink-0 tabular-nums">{i + 1}</span>
                                                                    <div className="min-w-0">
                                                                        <div className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">{unit.unit_name}</div>
                                                                        {unit.short_name && <div className="text-[10px] text-slate-400">{unit.short_name}</div>}
                                                                    </div>
                                                                </div>

                                                                {/* SSI + visual bar */}
                                                                <div className="flex items-center gap-2">
                                                                    {unit.avg_score !== null ? (
                                                                        <>
                                                                            <span className={`text-lg font-black tabular-nums w-10 shrink-0 ${scoreColor(unit.avg_score)}`}>
                                                                                {unit.avg_score}
                                                                            </span>
                                                                            <div className="flex-1 h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                                                                <div
                                                                                    className={`h-full rounded-full transition-all ${scoreBarColor(unit.avg_score)}`}
                                                                                    style={{ width: `${(unit.avg_score / 4) * 100}%` }}
                                                                                />
                                                                            </div>
                                                                        </>
                                                                    ) : (
                                                                        <span className="text-xs text-slate-300">—</span>
                                                                    )}
                                                                </div>

                                                                {/* Sentiment */}
                                                                <div className="space-y-1">
                                                                    {unit.sentiment.total > 0 ? (
                                                                        <>
                                                                            <SentimentBar sentiment={unit.sentiment} />
                                                                            <div className="flex justify-between text-[9px] font-semibold">
                                                                                <span className="text-emerald-600">{unit.sentiment.positive_pct}%</span>
                                                                                <span className="text-slate-400">{Math.round(100 - unit.sentiment.positive_pct - unit.sentiment.negative_pct)}%</span>
                                                                                <span className="text-red-500">{unit.sentiment.negative_pct}%</span>
                                                                            </div>
                                                                        </>
                                                                    ) : (
                                                                        <span className="text-xs text-slate-300">—</span>
                                                                    )}
                                                                </div>

                                                                {/* Response count */}
                                                                <div className="text-right">
                                                                    <span className="text-sm font-semibold text-slate-600 dark:text-slate-400 tabular-nums">
                                                                        {unit.score_count > 0 ? unit.score_count.toLocaleString() : unit.sentiment.total.toLocaleString()}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </CardContent>
                                        </Card>

                                        {/* Student Voices — scoped to campus service units only */}
                                        <FacultyStudentVoices
                                            facultyId={facultyId}
                                            surveyId={surveyId}
                                            title="Student Voices about the Campus Experience"
                                            restrictToUnitIds={data.campusExperience.units.map(u => u.unit_id)}
                                        />
                                    </>
                                );
                            })()}
                        </div>
                    </TabsContent>

                    {/* ── AI TAB ── */}
                    <TabsContent value="ai" className="focus-visible:ring-0 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <ErrorBoundary fallbackTitle="AI Specialist crashed">
                            <FacultyInsightChat
                                facultyId={facultyId}
                                surveyId={surveyId ?? undefined}
                                facultyName={data?.faculty?.name ?? facultyName}
                                surveyTitle={activeSurvey?.title}
                            />
                        </ErrorBoundary>
                    </TabsContent>
                </Tabs>
                )}
            </div>
        </PageShell>
    );
}
