"use client";

import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import {
    FileText, Target, Users, MessageSquare, ThumbsUp,
    Sparkles, TrendingUp, AlertTriangle, Lightbulb, Info,
    ArrowUpDown,
} from "lucide-react";

// ─── Data types ──────────────────────────────────────────────────────────────

interface CampusScore { campus: string; average: number | null; count: number; }
interface UnitReport {
    unit_id: number;
    unit_name: string;
    short_name: string | null;
    satisfaction_index: number | null;
    campus_scores: CampusScore[];
    qualitative: {
        total: number;
        positive: number;
        negative: number;
        neutral: number;
        positive_pct: number;
        negative_pct: number;
    } | null;
}
interface ReportData {
    survey: { id: number; title: string };
    globalSatisfactionIndex: number | null;
    campusSatisfaction: { campus: string; satisfaction_index: number }[];
    totalRespondents: number;
    units: UnitReport[];
}
interface NpsTotals { nps_score: number | null; total: number; }

interface AISummaryFinding { type: "strength" | "concern" | "notable"; title: string; body: string; }
interface AISummarySpotlight { type: "top" | "bottom"; unit: string; ssi: number; insight: string; }
interface AISummaryFocusArea { title: string; rationale: string; }
interface AISummary {
    overall_verdict: string;
    verdict_rationale: string;
    overview: string;
    key_findings: AISummaryFinding[];
    campus_notes: { campus: string; note: string }[];
    unit_spotlights: AISummarySpotlight[];
    sentiment_insight: string;
    nps_insight: string | null;
    focus_areas: AISummaryFocusArea[];
    generated_at?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function abbrCampus(name: string): string {
    const n = name.toLowerCase();
    if (n.includes("jakarta")) return "JKT";
    if (n.includes("medan")) return "MDN";
    if (n.includes("surabaya")) return "SBY";
    return name.slice(0, 3).toUpperCase();
}
function shortCampus(name: string): string {
    const n = name.toLowerCase();
    if (n.includes("jakarta")) return "Jakarta";
    if (n.includes("medan")) return "Medan";
    if (n.includes("surabaya")) return "Surabaya";
    return name;
}

function ssiTextColor(score: number | null): string {
    if (score === null) return "text-slate-400";
    if (score >= 3.20) return "text-emerald-400";
    if (score >= 3.00) return "text-amber-400";
    return "text-red-400";
}
function ssiBgColor(score: number | null): string {
    if (score === null) return "bg-slate-300 dark:bg-slate-600";
    if (score >= 3.20) return "bg-emerald-400";
    if (score >= 3.00) return "bg-amber-400";
    return "bg-red-400";
}
function ssiTextColorLight(score: number | null): string {
    if (score === null) return "text-slate-400";
    if (score >= 3.20) return "text-emerald-600 dark:text-emerald-400";
    if (score >= 3.00) return "text-amber-600 dark:text-amber-400";
    return "text-red-600 dark:text-red-400";
}
function sentimentTextColor(score: number): string {
    if (score >= 65) return "text-emerald-400";
    if (score >= 45) return "text-amber-400";
    return "text-red-400";
}
function sentimentTextColorLight(score: number): string {
    if (score >= 65) return "text-emerald-600 dark:text-emerald-400";
    if (score >= 45) return "text-amber-600 dark:text-amber-400";
    return "text-red-600 dark:text-red-400";
}
function computeSentiment(pos: number, neg: number, neu: number): number {
    const total = pos + neg + neu;
    if (total === 0) return 0;
    return Math.round((pos + 0.5 * neu) / total * 100);
}

const VERDICT_COLORS: Record<string, { badge: string; bar: string }> = {
    "Outstanding":       { badge: "bg-emerald-500 text-white",           bar: "bg-emerald-500" },
    "Strong":            { badge: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200", bar: "bg-emerald-400" },
    "Adequate":          { badge: "bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200",         bar: "bg-amber-400" },
    "Needs Improvement": { badge: "bg-orange-100 text-orange-800 dark:bg-orange-900/60 dark:text-orange-200",     bar: "bg-orange-400" },
    "Critical":          { badge: "bg-red-100 text-red-800 dark:bg-red-900/60 dark:text-red-200",                 bar: "bg-red-400" },
};

// ─── Main component ───────────────────────────────────────────────────────────

export default function SummaryTab({ surveyId }: { surveyId?: string }) {
    const [reportData, setReportData] = useState<ReportData | null>(null);
    const [npsData, setNpsData] = useState<NpsTotals | null>(null);
    const [aiSummary, setAiSummary] = useState<AISummary | null>(null);
    const [loading, setLoading] = useState(false);
    const [sortBy, setSortBy] = useState<"ssi" | "sentiment">("ssi");

    useEffect(() => {
        if (!surveyId) { setReportData(null); setNpsData(null); setAiSummary(null); return; }
        setLoading(true);
        Promise.all([
            fetch(`/api/executive/report?surveyId=${surveyId}`).then(r => r.ok ? r.json() : null),
            fetch(`/api/executive/nps?surveyId=${surveyId}`).then(r => r.ok ? r.json() : null),
            fetch(`/api/executive/ai-summary?surveyId=${surveyId}`).then(r => r.ok ? r.json() : null),
        ]).then(([report, nps, aiRes]) => {
            if (report) setReportData(report);
            if (nps?.totals) setNpsData(nps.totals);
            if (aiRes?.summary) setAiSummary(aiRes.summary);
        }).finally(() => setLoading(false));
    }, [surveyId]);

    if (!surveyId) {
        return (
            <div className="text-center py-20 space-y-3">
                <FileText className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600" />
                <p className="text-slate-500 dark:text-slate-400 text-lg">
                    Select a specific survey from the <strong>Data Scope</strong> dropdown to view the summary.
                </p>
            </div>
        );
    }
    if (loading) {
        return (
            <div className="space-y-6">
                <Skeleton className="h-52 w-full rounded-2xl" />
                <Skeleton className="h-80 w-full rounded-2xl" />
                <Skeleton className="h-96 w-full rounded-2xl" />
            </div>
        );
    }
    if (!reportData) return null;

    const { globalSatisfactionIndex, campusSatisfaction, totalRespondents, units } = reportData;

    const totalPos  = units.reduce((s, u) => s + (u.qualitative?.positive ?? 0), 0);
    const totalNeg  = units.reduce((s, u) => s + (u.qualitative?.negative ?? 0), 0);
    const totalQual = units.reduce((s, u) => s + (u.qualitative?.total ?? 0), 0);
    const totalNeu  = totalQual - totalPos - totalNeg;
    const globalSentiment = totalQual > 0 ? computeSentiment(totalPos, totalNeg, totalNeu) : null;
    const allCampuses = campusSatisfaction.map(c => c.campus);

    // Units with a score, with pre-computed sentiment
    const scoredUnits = units
        .filter(u => u.satisfaction_index !== null)
        .map(u => {
            const pos = u.qualitative?.positive ?? 0;
            const neg = u.qualitative?.negative ?? 0;
            const neu = (u.qualitative?.total ?? 0) - pos - neg;
            return { ...u, _sentScore: u.qualitative ? computeSentiment(pos, neg, neu) : null };
        });

    const sortedUnits = [...scoredUnits].sort((a, b) =>
        sortBy === "ssi"
            ? (b.satisfaction_index ?? 0) - (a.satisfaction_index ?? 0)
            : (b._sentScore ?? -1) - (a._sentScore ?? -1)
    );

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">

            {/* ── HERO STRIP ─────────────────────────────────────────────────── */}
            <div className="relative rounded-2xl overflow-hidden shadow-2xl">
                <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-950" />
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(59,130,246,0.2),transparent_60%)]" />
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,rgba(139,92,246,0.12),transparent_60%)]" />
                <div className="relative z-10 p-8 md:p-10 space-y-8">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                        <div>
                            <p className="text-xs font-semibold text-blue-300/70 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                                <FileText className="w-3.5 h-3.5" /> SSI Score
                            </p>
                            <div className={`text-5xl md:text-6xl font-black tracking-tight ${ssiTextColor(globalSatisfactionIndex)}`}>
                                {globalSatisfactionIndex?.toFixed(2) ?? "N/A"}
                            </div>
                            <p className="text-blue-200/40 text-xs mt-1">out of 4.00 · target ≥ 3.20</p>
                        </div>
                        <div>
                            <p className="text-xs font-semibold text-blue-300/70 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                                <ThumbsUp className="w-3.5 h-3.5" /> Sentiment Score
                            </p>
                            <div className={`text-5xl md:text-6xl font-black tracking-tight ${globalSentiment !== null ? sentimentTextColor(globalSentiment) : "text-slate-500"}`}>
                                {globalSentiment !== null ? globalSentiment : "—"}
                            </div>
                            <p className="text-blue-200/40 text-xs mt-1">out of 100 · pos=1, neutral=0.5, neg=0</p>
                        </div>
                        <div>
                            <p className="text-xs font-semibold text-blue-300/70 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                                <Target className="w-3.5 h-3.5" /> NPS
                            </p>
                            {npsData && npsData.total > 0 && npsData.nps_score !== null ? (
                                <>
                                    <div className={`text-5xl md:text-6xl font-black tracking-tight ${npsData.nps_score >= 50 ? "text-emerald-400" : npsData.nps_score >= 0 ? "text-amber-400" : "text-red-400"}`}>
                                        {npsData.nps_score > 0 ? `+${npsData.nps_score}` : npsData.nps_score}
                                    </div>
                                    <p className="text-blue-200/40 text-xs mt-1">net promoter · n = {npsData.total.toLocaleString()}</p>
                                </>
                            ) : (
                                <>
                                    <div className="text-5xl md:text-6xl font-black tracking-tight text-slate-600">—</div>
                                    <p className="text-blue-200/40 text-xs mt-1">no NPS data</p>
                                </>
                            )}
                        </div>
                        <div>
                            <p className="text-xs font-semibold text-blue-300/70 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                                <Users className="w-3.5 h-3.5" /> Respondents
                            </p>
                            <div className="text-5xl md:text-6xl font-black tracking-tight text-white">
                                {totalRespondents.toLocaleString()}
                            </div>
                            <p className="text-blue-200/40 text-xs mt-1">{scoredUnits.length} units evaluated</p>
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-3">
                        {campusSatisfaction.map(cs => (
                            <div key={cs.campus} className="flex items-center gap-2.5 bg-white/[0.06] border border-white/10 rounded-xl px-4 py-2.5 backdrop-blur-sm">
                                <div className={`w-2 h-2 rounded-full shrink-0 ${ssiBgColor(cs.satisfaction_index)}`} />
                                <span className="text-blue-200/70 text-sm font-medium">{shortCampus(cs.campus)}</span>
                                <span className={`font-bold text-base tabular-nums ${ssiTextColor(cs.satisfaction_index)}`}>
                                    {cs.satisfaction_index.toFixed(2)}
                                </span>
                            </div>
                        ))}
                        {totalQual > 0 && (
                            <div className="flex items-center gap-2.5 bg-white/[0.06] border border-white/10 rounded-xl px-4 py-2.5 backdrop-blur-sm">
                                <MessageSquare className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                                <span className="text-blue-200/70 text-sm">{totalQual.toLocaleString()} feedback segments</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* ── AI EXECUTIVE ANALYSIS (above unit table) ───────────────────── */}
            {aiSummary ? (
                <AISummaryCard summary={aiSummary} />
            ) : (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 shadow-sm">
                    <div className="flex items-start gap-4">
                        <div className="p-3 bg-indigo-50 dark:bg-indigo-950/40 rounded-xl border border-indigo-100 dark:border-indigo-900/40 shrink-0">
                            <Sparkles className="w-5 h-5 text-indigo-500" />
                        </div>
                        <div>
                            <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 mb-1">AI Executive Analysis</h3>
                            <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                                No AI analysis has been generated for this survey yet. Go to <strong>Settings → Data Cache</strong> and click
                                <strong> Generate AI Analysis</strong> to produce a structured executive summary covering strengths, concerns, campus breakdowns, and recommended focus areas.
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* ── UNIT PERFORMANCE TABLE ─────────────────────────────────────── */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
                {/* Table header + sort toggle */}
                <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-start justify-between gap-4 flex-wrap">
                    <div>
                        <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">Unit Performance Overview</h2>
                        <p className="text-xs text-slate-400 mt-0.5">
                            SSI: satisfaction score on a 1–4 scale (target ≥ 3.20). Sentiment: 0–100 score from open-ended comments (positive=1 pt, neutral=0.5, negative=0).
                        </p>
                    </div>
                    {/* Sort toggle */}
                    <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1 shrink-0">
                        <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 mx-1" />
                        <button
                            onClick={() => setSortBy("ssi")}
                            className={`text-xs font-semibold px-3 py-1.5 rounded-md transition-colors ${sortBy === "ssi" ? "bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 shadow-sm" : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"}`}
                        >
                            SSI Score
                        </button>
                        <button
                            onClick={() => setSortBy("sentiment")}
                            className={`text-xs font-semibold px-3 py-1.5 rounded-md transition-colors ${sortBy === "sentiment" ? "bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 shadow-sm" : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"}`}
                        >
                            Sentiment
                        </button>
                    </div>
                </div>

                {/* Column headers */}
                <div className="grid grid-cols-[2rem_minmax(8rem,1fr)_minmax(16rem,2fr)_minmax(16rem,2fr)] gap-x-6 px-6 py-2.5 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800">
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">#</span>
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Unit</span>
                    <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-emerald-400" />
                        <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wide">SSI Score</span>
                        <span className="text-[10px] text-slate-400 font-normal">1–4 scale</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-purple-400" />
                        <span className="text-xs font-bold text-purple-700 dark:text-purple-400 uppercase tracking-wide">Sentiment</span>
                        <span className="text-[10px] text-slate-400 font-normal">0–100 score</span>
                    </div>
                </div>

                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {sortedUnits.map((unit, i) => {
                        const ssi = unit.satisfaction_index!;
                        const barPct = Math.min(100, Math.max(0, ((ssi - 1) / 3) * 100));
                        const sentScore = unit._sentScore;
                        const sentBarPct = sentScore !== null ? sentScore : 0;

                        return (
                            <div key={unit.unit_id} className="grid grid-cols-[2rem_minmax(8rem,1fr)_minmax(16rem,2fr)_minmax(16rem,2fr)] gap-x-6 items-center px-6 py-4 hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition-colors">

                                {/* Rank */}
                                <span className="text-sm font-bold text-slate-400 tabular-nums">{i + 1}</span>

                                {/* Unit name */}
                                <div className="min-w-0">
                                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 truncate">
                                        {unit.short_name || unit.unit_name}
                                    </p>
                                </div>

                                {/* SSI section — score on LEFT of bar */}
                                <div className="space-y-1.5">
                                    <div className="flex items-center gap-2.5">
                                        <span className={`text-sm font-bold tabular-nums w-9 text-left shrink-0 ${ssiTextColorLight(ssi)}`}>
                                            {ssi.toFixed(2)}
                                        </span>
                                        <div className="flex-1 h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                            <div className={`h-full rounded-full ${ssiBgColor(ssi)}`} style={{ width: `${barPct}%` }} />
                                        </div>
                                    </div>
                                    {/* Campus labeled badges */}
                                    <div className="flex gap-1.5 flex-wrap pl-[2.5rem]">
                                        {allCampuses.map(campus => {
                                            const cs = unit.campus_scores.find(c => c.campus === campus);
                                            const avg = cs?.average ?? null;
                                            return (
                                                <span
                                                    key={campus}
                                                    className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-md tabular-nums
                                                        ${avg === null
                                                            ? "bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-600"
                                                            : avg >= 3.20
                                                                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400"
                                                                : avg >= 3.00
                                                                    ? "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400"
                                                                    : "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400"
                                                        }`}
                                                >
                                                    <span className={`w-1.5 h-1.5 rounded-full inline-block ${ssiBgColor(avg)}`} />
                                                    {abbrCampus(campus)}
                                                    {avg !== null ? ` ${avg.toFixed(2)}` : " n/a"}
                                                </span>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Sentiment section — score on RIGHT of bar */}
                                <div className="space-y-1.5">
                                    {sentScore !== null ? (
                                        <>
                                            <div className="flex items-center gap-2.5">
                                                <div className="flex-1 h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                                    <div
                                                        className={`h-full rounded-full ${sentScore >= 65 ? "bg-emerald-400" : sentScore >= 45 ? "bg-amber-400" : "bg-red-400"}`}
                                                        style={{ width: `${sentBarPct}%` }}
                                                    />
                                                </div>
                                                <span className={`text-sm font-bold tabular-nums w-9 text-right shrink-0 ${sentimentTextColorLight(sentScore)}`}>
                                                    {sentScore}
                                                </span>
                                            </div>
                                            <p className="text-[10px] text-slate-400 pr-[2.5rem]">
                                                {unit.qualitative!.positive_pct.toFixed(0)}% positive · {unit.qualitative!.negative_pct.toFixed(0)}% negative
                                                {unit.qualitative!.total > 0 && <span> · {unit.qualitative!.total.toLocaleString()} comments</span>}
                                            </p>
                                        </>
                                    ) : (
                                        <span className="text-sm text-slate-400">No comment data</span>
                                    )}
                                </div>

                            </div>
                        );
                    })}
                </div>
            </div>

        </div>
    );
}

// ─── AI Summary Display ───────────────────────────────────────────────────────

function SectionHeading({ number, title }: { number: number; title: string }) {
    return (
        <div className="flex items-center gap-3 mb-4">
            <div className="w-7 h-7 rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 text-sm font-black flex items-center justify-center shrink-0">
                {number}
            </div>
            <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">{title}</h3>
        </div>
    );
}

function AISummaryCard({ summary }: { summary: AISummary }) {
    const verdictStyle = VERDICT_COLORS[summary.overall_verdict] ?? VERDICT_COLORS["Adequate"];

    const topSpots   = summary.unit_spotlights?.filter(s => s.type === "top")    ?? [];
    const bottomSpots = summary.unit_spotlights?.filter(s => s.type === "bottom") ?? [];
    const strengths   = summary.key_findings?.filter(f => f.type === "strength")  ?? [];
    const concerns    = summary.key_findings?.filter(f => f.type === "concern")   ?? [];
    const notables    = summary.key_findings?.filter(f => f.type === "notable")   ?? [];

    return (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">

            {/* ── Header banner ── */}
            <div className="bg-gradient-to-r from-indigo-600 via-indigo-700 to-violet-700 px-8 py-6">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-white/15 rounded-xl backdrop-blur-sm">
                            <Sparkles className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-white">AI Executive Analysis</h2>
                            {summary.generated_at && (
                                <p className="text-indigo-200/70 text-sm mt-0.5">
                                    Generated {new Date(summary.generated_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
                                </p>
                            )}
                        </div>
                    </div>
                    <span className={`inline-flex items-center px-4 py-1.5 rounded-full text-sm font-bold ${verdictStyle.badge}`}>
                        {summary.overall_verdict}
                    </span>
                </div>

                {/* Verdict rationale — prominent in banner */}
                <div className="mt-5 pt-5 border-t border-white/10">
                    <p className="text-base font-semibold text-white/90 leading-relaxed">
                        {summary.verdict_rationale}
                    </p>
                </div>
            </div>

            {/* ── Body ── */}
            <div className="p-8 space-y-10">

                {/* Overview */}
                <div>
                    <SectionHeading number={1} title="Executive Overview" />
                    <p className="text-base text-slate-600 dark:text-slate-300 leading-relaxed">
                        {summary.overview}
                    </p>
                </div>

                <div className="border-t border-slate-100 dark:border-slate-800" />

                {/* Key findings */}
                {summary.key_findings?.length > 0 && (
                    <div>
                        <SectionHeading number={2} title="Key Findings" />
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Strengths */}
                            {strengths.length > 0 && (
                                <div className="space-y-3">
                                    <div className="flex items-center gap-2 mb-1">
                                        <TrendingUp className="w-4 h-4 text-emerald-500" />
                                        <span className="text-sm font-bold text-emerald-700 dark:text-emerald-400">Strengths</span>
                                    </div>
                                    {strengths.map((f, i) => <FindingCard key={i} finding={f} />)}
                                </div>
                            )}
                            {/* Concerns */}
                            {concerns.length > 0 && (
                                <div className="space-y-3">
                                    <div className="flex items-center gap-2 mb-1">
                                        <AlertTriangle className="w-4 h-4 text-red-500" />
                                        <span className="text-sm font-bold text-red-700 dark:text-red-400">Concerns</span>
                                    </div>
                                    {concerns.map((f, i) => <FindingCard key={i} finding={f} />)}
                                </div>
                            )}
                            {/* Notable (if any) — spans full width */}
                            {notables.length > 0 && (
                                <div className="md:col-span-2 space-y-3">
                                    <div className="flex items-center gap-2 mb-1">
                                        <Info className="w-4 h-4 text-blue-500" />
                                        <span className="text-sm font-bold text-blue-700 dark:text-blue-400">Notable</span>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        {notables.map((f, i) => <FindingCard key={i} finding={f} />)}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                <div className="border-t border-slate-100 dark:border-slate-800" />

                {/* Unit spotlights — before campus */}
                {(topSpots.length > 0 || bottomSpots.length > 0) && (
                    <div>
                        <SectionHeading number={3} title="Unit Spotlights" />
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Top performers */}
                            {topSpots.length > 0 && (
                                <div className="space-y-3">
                                    <div className="flex items-center gap-2 mb-2">
                                        <TrendingUp className="w-4 h-4 text-emerald-500" />
                                        <span className="text-sm font-bold text-emerald-700 dark:text-emerald-400">Top Performers</span>
                                    </div>
                                    {topSpots.map((s, i) => (
                                        <SpotlightCard key={i} spotlight={s} />
                                    ))}
                                </div>
                            )}
                            {/* Needs attention */}
                            {bottomSpots.length > 0 && (
                                <div className="space-y-3">
                                    <div className="flex items-center gap-2 mb-2">
                                        <AlertTriangle className="w-4 h-4 text-red-500" />
                                        <span className="text-sm font-bold text-red-700 dark:text-red-400">Needs Attention</span>
                                    </div>
                                    {bottomSpots.map((s, i) => (
                                        <SpotlightCard key={i} spotlight={s} />
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                <div className="border-t border-slate-100 dark:border-slate-800" />

                {/* Campus analysis */}
                {summary.campus_notes?.length > 0 && (
                    <div>
                        <SectionHeading number={4} title="Campus Analysis" />
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {summary.campus_notes.map((cn, i) => (
                                <div key={i} className="bg-slate-50 dark:bg-slate-800/50 rounded-xl px-5 py-4 space-y-2">
                                    <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{shortCampus(cn.campus)}</p>
                                    <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{cn.note}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <div className="border-t border-slate-100 dark:border-slate-800" />

                {/* Sentiment & NPS */}
                <div>
                    <SectionHeading number={5} title="Qualitative & NPS Insights" />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {summary.sentiment_insight && (
                            <div className="bg-purple-50 dark:bg-purple-950/20 border border-purple-100 dark:border-purple-900/30 rounded-xl p-5 space-y-2">
                                <div className="flex items-center gap-2">
                                    <ThumbsUp className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                                    <span className="text-sm font-bold text-slate-700 dark:text-slate-200">Comment Sentiment</span>
                                </div>
                                <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{summary.sentiment_insight}</p>
                            </div>
                        )}
                        {summary.nps_insight && (
                            <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/30 rounded-xl p-5 space-y-2">
                                <div className="flex items-center gap-2">
                                    <Target className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                                    <span className="text-sm font-bold text-slate-700 dark:text-slate-200">Net Promoter Score</span>
                                </div>
                                <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{summary.nps_insight}</p>
                            </div>
                        )}
                    </div>
                </div>

                <div className="border-t border-slate-100 dark:border-slate-800" />

                {/* Focus areas */}
                {summary.focus_areas?.length > 0 && (
                    <div>
                        <SectionHeading number={6} title="Recommended Focus Areas" />
                        <div className="space-y-4">
                            {summary.focus_areas.map((fa, i) => (
                                <div key={i} className="flex gap-4 items-start">
                                    <div className="w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 text-sm font-black flex items-center justify-center shrink-0 mt-0.5">
                                        {i + 1}
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                                            <Lightbulb className="w-4 h-4 text-amber-500 shrink-0" /> {fa.title}
                                        </p>
                                        <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{fa.rationale}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

function FindingCard({ finding }: { finding: AISummaryFinding }) {
    const styles = {
        strength: { border: "border-l-emerald-400", icon: <TrendingUp className="w-4 h-4 text-emerald-500" />, bg: "bg-emerald-50/50 dark:bg-emerald-950/10" },
        concern:  { border: "border-l-red-400",     icon: <AlertTriangle className="w-4 h-4 text-red-500" />,  bg: "bg-red-50/50 dark:bg-red-950/10" },
        notable:  { border: "border-l-blue-400",    icon: <Info className="w-4 h-4 text-blue-500" />,          bg: "bg-blue-50/50 dark:bg-blue-950/10" },
    };
    const s = styles[finding.type] ?? styles.notable;
    return (
        <div className={`border-l-4 ${s.border} ${s.bg} rounded-r-xl px-5 py-4 space-y-2`}>
            <div className="flex items-start gap-2">
                <span className="mt-0.5 shrink-0">{s.icon}</span>
                <span className="text-sm font-bold text-slate-800 dark:text-slate-100 leading-snug">{finding.title}</span>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{finding.body}</p>
        </div>
    );
}

function SpotlightCard({ spotlight }: { spotlight: AISummarySpotlight }) {
    const isTop = spotlight.type === "top";
    return (
        <div className={`flex gap-3 p-4 rounded-xl border ${isTop ? "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-100 dark:border-emerald-900/30" : "bg-red-50 dark:bg-red-950/20 border-red-100 dark:border-red-900/30"}`}>
            <div className={`text-sm font-black px-2.5 py-1.5 rounded-lg shrink-0 h-fit tabular-nums ${isTop ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300" : "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300"}`}>
                {spotlight.ssi.toFixed(2)}
            </div>
            <div>
                <p className="text-sm font-bold text-slate-800 dark:text-slate-100 mb-1">{spotlight.unit}</p>
                <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{spotlight.insight}</p>
            </div>
        </div>
    );
}
