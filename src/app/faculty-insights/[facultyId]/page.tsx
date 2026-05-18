"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { PageShell, PageHeader } from "@/components/layout/PageShell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useActiveSurvey } from "@/context/SurveyContext";
import { computeSentimentScore } from "@/lib/utils";
import {
    GraduationCap, Users, Target, CheckCircle2, AlertTriangle, XCircle,
    BookOpen, Building2, AlertCircle, ThumbsUp, ThumbsDown
} from "lucide-react";
import { NpsCard } from "@/components/nps/NpsCard";
import { emptyNpsCounts, NpsCounts } from "@/lib/nps";

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

function sentimentColor(s: number): string {
    if (s >= 70) return "text-emerald-600 dark:text-emerald-400";
    if (s >= 50) return "text-amber-500 dark:text-amber-400";
    return "text-red-500 dark:text-red-400";
}

function npsColor(score: number): string {
    if (score >= 50) return "text-emerald-600 dark:text-emerald-400";
    if (score >= 0) return "text-amber-600 dark:text-amber-400";
    return "text-red-600 dark:text-red-400";
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

function SentimentIcon({ score }: { score: number }) {
    if (score >= 70) return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />;
    if (score >= 50) return <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />;
    return <XCircle className="w-3.5 h-3.5 text-red-500" />;
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
    const [progSort, setProgSort] = useState<"score" | "respondents">("score");
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

        // Fetch NPS — keyed by faculty NAME (not ID), so we resolve the name first.
        fetch(`/api/executive/nps?surveyId=${surveyId}`)
            .then(r => r.json())
            .then((json: { faculties: Array<{ faculty: string; unit_name: string; column: string; detractors: number; passives: number; promoters: number; total: number }> }) => {
                // We need this faculty's NAME to match. Wait for `data` to load via the other request, but
                // since requests are independent, fetch the faculty name from the DB directly.
                import("@/lib/supabase").then(async ({ supabase }) => {
                    const { data: fac } = await supabase.from("faculties").select("name").eq("id", parseInt(facultyId)).single();
                    if (!fac) return;
                    const name = fac.name;
                    const rows = (json.faculties || []).filter(r => r.faculty === name);
                    // Group by (unitName, column) — preserves the multi-NPS-column case
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

    const sortedPrograms = data ? [...data.programQuality.studyPrograms].sort((a, b) =>
        progSort === "score"
            ? (b.avg_score ?? -1) - (a.avg_score ?? -1)
            : b.respondents - a.respondents
    ) : [];

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

            <div className="max-w-7xl mx-auto px-8 py-8 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">

                {/* No survey selected */}
                {!surveyId && (
                    <div className="text-center py-20">
                        <GraduationCap className="w-12 h-12 mx-auto mb-3 text-slate-300 dark:text-slate-600" />
                        <p className="text-slate-500 font-medium">Select a specific survey to view faculty insights.</p>
                    </div>
                )}

                {surveyId && loading && <LoadingSkeleton />}

                {surveyId && !loading && data && (() => {
                    const { totalRespondents, totalEnrolled, responseRate, programQuality, campusExperience } = data;
                    const pqSentScore = computeSentimentScore(
                        programQuality.overallSentiment.positive,
                        programQuality.overallSentiment.neutral,
                        programQuality.overallSentiment.negative,
                    );
                    const ceSentScore = campusExperience.overallSentiment
                        ? computeSentimentScore(
                            campusExperience.overallSentiment.positive,
                            campusExperience.overallSentiment.neutral,
                            campusExperience.overallSentiment.negative,
                          )
                        : null;

                    return (
                        <>
                            {/* ── Hero Card ── */}
                            <div className="relative overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700 bg-gradient-to-br from-teal-50 via-white to-slate-50 dark:from-teal-950/20 dark:via-slate-900 dark:to-slate-900 p-6">
                                <div className="absolute -top-10 -right-10 w-44 h-44 bg-teal-300/15 dark:bg-teal-600/10 rounded-full blur-3xl pointer-events-none" />
                                <div className="absolute -bottom-8 -left-8 w-44 h-44 bg-cyan-300/15 dark:bg-cyan-600/10 rounded-full blur-3xl pointer-events-none" />

                                <div className="relative space-y-4">
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
                                            <span className="flex items-center gap-1.5">
                                                <Users className="w-4 h-4" />
                                                {totalRespondents.toLocaleString()} respondents
                                            </span>
                                            {totalEnrolled > 0 && (
                                                <span className="flex items-center gap-1.5">
                                                    <Target className="w-4 h-4" />
                                                    {responseRate !== null ? `${responseRate}% response rate` : `${totalEnrolled.toLocaleString()} enrolled`}
                                                </span>
                                            )}
                                            <span className="flex items-center gap-1.5">
                                                <BookOpen className="w-4 h-4" />
                                                {programQuality.studyPrograms.length} study programs
                                            </span>
                                        </div>
                                    </div>

                                    {/* Two score blocks */}
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        {/* Program Quality */}
                                        <div className={`rounded-xl border p-4 ${scoreBg(programQuality.overallScore)}`}>
                                            <div className="flex items-center gap-1.5 mb-2">
                                                <BookOpen className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                                                <span className="text-xs font-bold text-violet-700 dark:text-violet-400 uppercase tracking-wide">Program Quality</span>
                                            </div>
                                            <div className="flex items-end gap-3 mb-2">
                                                {programQuality.overallScore !== null ? (
                                                    <span className={`text-3xl font-black tabular-nums leading-none ${scoreColor(programQuality.overallScore)}`}>
                                                        {programQuality.overallScore}
                                                    </span>
                                                ) : (
                                                    <span className="text-2xl font-bold text-slate-300">—</span>
                                                )}
                                            </div>
                                            {programQuality.overallSentiment.total > 0 && (
                                                <>
                                                    <SentimentBar sentiment={programQuality.overallSentiment} height="h-2" />
                                                    <div className="flex justify-between text-[10px] font-semibold mt-1">
                                                        <span className="text-emerald-600">{programQuality.overallSentiment.positive_pct}% positive</span>
                                                        <span className="text-red-500">{programQuality.overallSentiment.negative_pct}% negative</span>
                                                    </div>
                                                </>
                                            )}
                                        </div>

                                        {/* Campus Experience */}
                                        <div className={`rounded-xl border p-4 ${scoreBg(campusExperience.overallScore ?? null)}`}>
                                            <div className="flex items-center gap-1.5 mb-2">
                                                <Building2 className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                                                <span className="text-xs font-bold text-cyan-700 dark:text-cyan-400 uppercase tracking-wide">Campus Experience</span>
                                            </div>
                                            <div className="flex items-end gap-3 mb-2">
                                                {campusExperience.overallScore !== null ? (
                                                    <span className={`text-3xl font-black tabular-nums leading-none ${scoreColor(campusExperience.overallScore)}`}>
                                                        {campusExperience.overallScore}
                                                    </span>
                                                ) : (
                                                    <span className="text-2xl font-bold text-slate-300">—</span>
                                                )}
                                            </div>
                                            {campusExperience.overallSentiment?.total > 0 && (
                                                <>
                                                    <SentimentBar sentiment={campusExperience.overallSentiment} height="h-2" />
                                                    <div className="flex justify-between text-[10px] font-semibold mt-1">
                                                        <span className="text-emerald-600">{campusExperience.overallSentiment.positive_pct}% positive</span>
                                                        <span className="text-red-500">{campusExperience.overallSentiment.negative_pct}% negative</span>
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* ── NPS (only if any NPS unit has data for this faculty) ── */}
                            {npsByColumn.length > 0 && (
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
                            )}

                            {/* ══════════════════════════════════════════════
                                SECTION 1 — PROGRAM QUALITY
                            ══════════════════════════════════════════════ */}
                            <Card className="border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                                <div className="h-1 bg-gradient-to-r from-violet-500 to-purple-500" />
                                <CardHeader>
                                    <div className="flex items-start justify-between gap-4 flex-wrap">
                                        <div>
                                            <CardTitle className="flex items-center gap-2 text-lg">
                                                <BookOpen className="w-5 h-5 text-violet-600 dark:text-violet-400" />
                                                Program Quality
                                            </CardTitle>
                                            <CardDescription className="mt-1">
                                                What students say about the academic services of their own study program
                                            </CardDescription>
                                        </div>
                                    </div>

                                    {/* Sort toggle */}
                                    {programQuality.studyPrograms.length > 1 && (
                                        <div className="flex items-center gap-2 pt-2">
                                            <span className="text-xs text-slate-400">Sort by:</span>
                                            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5">
                                                {(["score", "respondents"] as const).map(key => (
                                                    <button
                                                        key={key}
                                                        onClick={() => setProgSort(key)}
                                                        className={`h-7 px-2.5 text-xs rounded-md font-medium transition-colors ${progSort === key ? "bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                                                    >
                                                        {key === "score" ? "Score" : "Respondents"}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </CardHeader>

                                <CardContent className="p-0">
                                    {programQuality.studyPrograms.length === 0 ? (
                                        <div className="flex items-center gap-3 p-6 text-slate-400">
                                            <AlertCircle className="w-5 h-5 shrink-0" />
                                            <p className="text-sm">No "Study Program" unit data found for this survey. Make sure the unit is named exactly "Study Program" and analysis has run.</p>
                                        </div>
                                    ) : (() => {
                                        const hasNps = sortedPrograms.some(sp => sp.nps != null);
                                        const gridCols = hasNps
                                            ? "grid-cols-[minmax(0,1fr)_4.5rem_4.5rem_7.5rem_5rem_5rem]"
                                            : "grid-cols-[minmax(0,1fr)_4.5rem_7.5rem_5rem_5rem]";
                                        return (
                                        <div className="divide-y divide-slate-100 dark:divide-slate-800">
                                            {/* Column headers */}
                                            <div className={`grid ${gridCols} gap-3 px-5 py-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wider bg-slate-50/60 dark:bg-slate-900/40`}>
                                                <span>Study Program</span>
                                                <span className="text-center">Score</span>
                                                {hasNps && <span className="text-center">NPS</span>}
                                                <span className="text-center">Sentiment</span>
                                                <span className="text-center">Respondents</span>
                                                <span className="text-right">Rate</span>
                                            </div>

                                            {sortedPrograms.map((sp, i) => {
                                                const hasCats = (sp.top_positive_categories?.length > 0) || (sp.top_negative_categories?.length > 0);
                                                return (
                                                    <div key={sp.study_program}>
                                                        <div className={`grid ${gridCols} gap-3 items-center px-5 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-900/40 transition-colors`}>
                                                            {/* Name + rank */}
                                                            <div className="flex items-center gap-3 min-w-0">
                                                                <span className="text-xs font-bold text-slate-300 dark:text-slate-600 w-5 shrink-0 tabular-nums">{i + 1}</span>
                                                                <span className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate">{sp.study_program}</span>
                                                            </div>

                                                            {/* Avg score */}
                                                            <div className="flex justify-center">
                                                                {sp.avg_score !== null ? (
                                                                    <span className={`text-base font-black tabular-nums ${scoreColor(sp.avg_score)}`}>
                                                                        {sp.avg_score}
                                                                    </span>
                                                                ) : (
                                                                    <span className="text-xs text-slate-300">—</span>
                                                                )}
                                                            </div>

                                                            {/* NPS */}
                                                            {hasNps && (
                                                                <div className="flex flex-col items-center gap-0.5">
                                                                    {sp.nps != null ? (
                                                                        <>
                                                                            <span className={`text-base font-black tabular-nums leading-none ${npsColor(sp.nps.nps_score)}`}>
                                                                                {sp.nps.nps_score > 0 ? "+" : ""}{sp.nps.nps_score}
                                                                            </span>
                                                                            <span className="text-[9px] text-slate-400 tabular-nums">{sp.nps.total} resp.</span>
                                                                        </>
                                                                    ) : (
                                                                        <span className="text-xs text-slate-300">—</span>
                                                                    )}
                                                                </div>
                                                            )}

                                                            {/* Comment Sentiment */}
                                                            <div className="space-y-1">
                                                                {sp.sentiment.total > 0 ? (
                                                                    <>
                                                                        <SentimentBar sentiment={sp.sentiment} />
                                                                        <div className="flex justify-between text-[9px] font-semibold">
                                                                            <span className="text-emerald-600">{sp.sentiment.positive_pct}%</span>
                                                                            <span className="text-red-500">{sp.sentiment.negative_pct}%</span>
                                                                        </div>
                                                                    </>
                                                                ) : (
                                                                    <span className="text-xs text-slate-300">—</span>
                                                                )}
                                                            </div>

                                                            {/* Respondents */}
                                                            <div className="text-center">
                                                                <span className="text-sm font-semibold text-slate-600 dark:text-slate-400 tabular-nums">{sp.respondents.toLocaleString()}</span>
                                                            </div>

                                                            {/* Response rate */}
                                                            <div className="text-right">
                                                                {sp.response_rate !== null ? (
                                                                    <span className={`text-sm font-bold tabular-nums ${sp.response_rate >= 80 ? "text-emerald-600" : sp.response_rate >= 50 ? "text-amber-600" : "text-red-500"}`}>
                                                                        {sp.response_rate}%
                                                                    </span>
                                                                ) : (
                                                                    <span className="text-xs text-slate-300">—</span>
                                                                )}
                                                            </div>
                                                        </div>

                                                        {/* Category chips — strengths and concerns on separate rows */}
                                                        {hasCats && (
                                                            <div className="px-5 pb-3 space-y-1.5">
                                                                {sp.top_positive_categories?.length > 0 && (
                                                                    <div className="flex flex-wrap gap-1.5 items-center pl-8">
                                                                        <span className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider mr-1">Strengths</span>
                                                                        {sp.top_positive_categories.map(cat => (
                                                                            <span key={`pos-${cat.category_name}`} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                                                                                <ThumbsUp className="w-2.5 h-2.5" /> {cat.category_name}
                                                                            </span>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                                {sp.top_negative_categories?.length > 0 && (
                                                                    <div className="flex flex-wrap gap-1.5 items-center pl-8">
                                                                        <span className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider mr-1">Concerns</span>
                                                                        {sp.top_negative_categories.map(cat => (
                                                                            <span key={`neg-${cat.category_name}`} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800">
                                                                                <ThumbsDown className="w-2.5 h-2.5" /> {cat.category_name}
                                                                            </span>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                        )
                                    })()}
                                </CardContent>
                            </Card>

                            {/* ══════════════════════════════════════════════
                                SECTION 2 — CAMPUS EXPERIENCE
                            ══════════════════════════════════════════════ */}
                            <Card className="border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                                <div className="h-1 bg-gradient-to-r from-blue-500 to-cyan-500" />
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2 text-lg">
                                        <Building2 className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                                        Campus Experience
                                    </CardTitle>
                                    <CardDescription>
                                        How students in this faculty rate shared campus service units
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
                                            {/* Column headers */}
                                            <div className="grid grid-cols-[minmax(0,1fr)_4.5rem_9rem_5rem] gap-3 px-5 py-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wider bg-slate-50/60 dark:bg-slate-900/40">
                                                <span>Service Unit</span>
                                                <span className="text-center">Score</span>
                                                <span className="text-center">Sentiment</span>
                                                <span className="text-right">Responses</span>
                                            </div>

                                            {campusExperience.units.map((unit, i) => (
                                                <div key={unit.unit_id} className="grid grid-cols-[minmax(0,1fr)_4.5rem_9rem_5rem] gap-3 items-center px-5 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-900/40 transition-colors">
                                                    {/* Name */}
                                                    <div className="flex items-center gap-3 min-w-0">
                                                        <span className="text-xs font-bold text-slate-300 dark:text-slate-600 w-5 shrink-0 tabular-nums">{i + 1}</span>
                                                        <div className="min-w-0">
                                                            <span className="text-sm font-medium text-slate-700 dark:text-slate-300 block truncate">{unit.unit_name}</span>
                                                            {unit.short_name && (
                                                                <span className="text-[10px] text-slate-400">{unit.short_name}</span>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {/* Score */}
                                                    <div className="flex justify-center">
                                                        {unit.avg_score !== null ? (
                                                            <span className={`text-base font-black tabular-nums ${scoreColor(unit.avg_score)}`}>
                                                                {unit.avg_score}
                                                            </span>
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
                                                                    <span className="text-slate-400">{Math.round(100 - unit.sentiment.positive_pct - unit.sentiment.negative_pct)}% neu</span>
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
                        </>
                    );
                })()}
            </div>
        </PageShell>
    );
}
