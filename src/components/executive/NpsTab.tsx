"use client";

import { useEffect, useState } from "react";
import { NpsCard } from "@/components/nps/NpsCard";
import { NpsBucketBar } from "@/components/nps/NpsBucketBar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
    Target, MessageSquareQuote, Users, AlertCircle, BarChart3,
    Frown, Meh, Smile, TrendingDown, TrendingUp,
    Sparkles, Heart, LifeBuoy, Grid3x3,
} from "lucide-react";
import { computeNpsScore, npsBenchmarkColor, NpsCounts } from "@/lib/nps";

// ── Types from /api/executive/nps ────────────────────────────────────────────

interface NpsUnitRow {
    unit_id: number;
    unit_name: string;
    unit_short_name: string | null;
    unit_description: string | null;
    column: string;
    nps_score: number | null;
    detractors: number;
    passives: number;
    promoters: number;
    total: number;
}

interface NpsFacultyRow {
    unit_id: number;
    unit_name: string;
    column: string;
    faculty: string;
    nps_score: number | null;
    detractors: number;
    passives: number;
    promoters: number;
    total: number;
}

interface Quote { segment_text: string; faculty: string }

interface CatBucketBreakdown {
    category_name: string;
    detractor: number;
    passive: number;
    promoter: number;
    unknown: number;
    total: number;
    detractor_quote: Quote | null;
    promoter_quote: Quote | null;
}

interface QualUnit {
    unit_id: number;
    unit_name: string;
    unit_short_name: string | null;
    sentiment: { positive: number; negative: number; neutral: number; total: number };
    categories: { category_name: string; total: number; positive: number; negative: number; neutral: number }[];
    suggestion_count: number;
    sample_quotes: { sentiment: string; segment_text: string; faculty: string }[];
    categories_by_bucket: CatBucketBreakdown[];
    bucket_quotes: { detractor: Quote[]; passive: Quote[]; promoter: Quote[] };
    bucket_segment_counts: { detractor: number; passive: number; promoter: number; unknown: number };
    score_distribution: number[];
    sentiment_x_bucket: {
        detractor: { positive: { count: number }; neutral: { count: number }; negative: { count: number } };
        passive:   { positive: { count: number }; neutral: { count: number }; negative: { count: number } };
        promoter:  { positive: { count: number }; neutral: { count: number }; negative: { count: number } };
    };
    critical_fans_quotes: Quote[];
    recoverable_detractor_quotes: Quote[];
}

interface NpsData {
    units: NpsUnitRow[];
    faculties: NpsFacultyRow[];
    totals: { nps_score: number | null; total: number; detractors: number; passives: number; promoters: number };
    qualitative: QualUnit[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function toCounts(r: { detractors: number; passives: number; promoters: number; total: number }): NpsCounts {
    return { detractor: r.detractors, passive: r.passives, promoter: r.promoters, total: r.total };
}

// ── Public component ─────────────────────────────────────────────────────────

export function NpsTab({ surveyId }: { surveyId: string | null }) {
    const [data, setData] = useState<NpsData | null>(null);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState<string | null>(null);

    useEffect(() => {
        if (!surveyId || surveyId === "all") {
            setData(null);
            setLoading(false);
            return;
        }
        setLoading(true);
        setErr(null);
        fetch(`/api/executive/nps?surveyId=${surveyId}`)
            .then(r => r.json())
            .then(d => {
                if (d.error) setErr(d.error);
                else setData(d);
            })
            .catch(e => setErr(e.message || "Failed to load NPS data"))
            .finally(() => setLoading(false));
    }, [surveyId]);

    if (!surveyId || surveyId === "all") {
        return (
            <Card className="border-dashed border-slate-300 dark:border-slate-700">
                <CardContent className="py-10 text-center text-slate-500 dark:text-slate-400 text-sm">
                    Select a specific survey to view NPS data.
                </CardContent>
            </Card>
        );
    }

    if (loading) {
        return (
            <div className="space-y-4">
                <Skeleton className="h-40 w-full rounded-2xl" />
                <Skeleton className="h-60 w-full rounded-2xl" />
            </div>
        );
    }

    if (err) {
        return (
            <Card className="border-red-200 dark:border-red-900/40 bg-red-50/40 dark:bg-red-950/10">
                <CardContent className="py-6 flex items-start gap-3 text-sm text-red-700 dark:text-red-300">
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>{err}</span>
                </CardContent>
            </Card>
        );
    }

    if (!data || data.units.length === 0) {
        return (
            <Card className="border-dashed border-slate-300 dark:border-slate-700">
                <CardContent className="py-10 text-center text-sm text-slate-500 dark:text-slate-400 space-y-2">
                    <Target className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-700" />
                    <p>No NPS data for this survey.</p>
                    <p className="text-xs">
                        Mark an organization unit as an NPS unit in <strong>Settings → NPS Units</strong>, then set
                        its score column rule to <strong>NPS (0–10)</strong> on the survey manage page.
                    </p>
                </CardContent>
            </Card>
        );
    }

    // Match each NPS column to its qualitative data block (by unit_id).
    const qualByUnit = new Map(data.qualitative.map(q => [q.unit_id, q]));

    return (
        <div className="space-y-6">
            {/* 1. NPS score card + score distribution (overview) */}
            {data.units.map(u => {
                const qual = qualByUnit.get(u.unit_id);
                return (
                    <div key={`overview-${u.unit_id}::${u.column}`} className="space-y-4">
                        <NpsCard title={u.column} subtitle={u.unit_name} counts={toCounts(u)} />
                        {qual && u.total > 0 && <ScoreDistribution scores={qual.score_distribution} />}
                    </div>
                );
            })}

            {/* 2. Faculty leaderboard */}
            <PerFacultyTable rows={data.faculties} />

            {/* 3. Driver analysis + deep dives */}
            {data.units.map(u => {
                const qual = qualByUnit.get(u.unit_id);
                if (!qual) return null;
                if (qual.sentiment.total === 0) {
                    return (
                        <Card key={`empty-${u.unit_id}::${u.column}`} className="border-dashed border-slate-200 dark:border-slate-800">
                            <CardContent className="py-6 text-sm text-slate-500 dark:text-slate-400 text-center">
                                No analyzed comments for this NPS unit yet. Run analysis on its text column from the survey page.
                            </CardContent>
                        </Card>
                    );
                }
                return (
                    <div key={`detail-${u.unit_id}::${u.column}`} className="space-y-4">
                        <DriverAnalysis qual={qual} />
                        <SentimentBucketMatrix qual={qual} />
                        <HiddenInsights qual={qual} />
                        <CategoryBucketTable qual={qual} />
                    </div>
                );
            })}
        </div>
    );
}

// ── Score distribution histogram (0–10) ──────────────────────────────────────

function ScoreDistribution({ scores }: { scores: number[] }) {
    const max = Math.max(...scores, 1);
    const total = scores.reduce((a, b) => a + b, 0);
    if (total === 0) return null;

    // Fixed plot height in pixels — percent heights inside flex columns are unreliable.
    const CHART_HEIGHT = 160;

    return (
        <Card className="shadow-sm">
            <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-slate-500" />
                    <CardTitle className="text-base">Score distribution</CardTitle>
                </div>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                    How {total.toLocaleString()} respondents distributed across the 0–10 scale. The shape matters more than the
                    average — a flat spread signals polarization, a tall peak signals consensus.
                </p>
            </CardHeader>
            <CardContent>
                {/* Bar area */}
                <div className="flex items-end gap-2 px-1" style={{ height: CHART_HEIGHT }}>
                    {scores.map((count, score) => {
                        const heightPx = max > 0 ? Math.round((count / max) * CHART_HEIGHT) : 0;
                        // Always show a 2px sliver if the bucket has any count, so 0% bars are visually distinct from "no data".
                        const displayHeight = count > 0 ? Math.max(heightPx, 2) : 0;
                        const bucketColor =
                            score <= 6 ? "bg-red-500 dark:bg-red-500/80" :
                            score <= 8 ? "bg-amber-400 dark:bg-amber-400/80" :
                            "bg-emerald-500 dark:bg-emerald-500/80";
                        const pctOfTotal = total > 0 ? (count / total) * 100 : 0;
                        return (
                            <div
                                key={score}
                                className={`flex-1 rounded-t ${bucketColor} relative group`}
                                style={{ height: `${displayHeight}px`, minWidth: "12px" }}
                                title={`Score ${score}: ${count.toLocaleString()} (${pctOfTotal.toFixed(1)}%)`}
                            >
                                {/* Hover label floats above the bar */}
                                <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-xs font-semibold text-slate-700 dark:text-slate-300 tabular-nums opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                                    {count.toLocaleString()} ({pctOfTotal.toFixed(1)}%)
                                </span>
                            </div>
                        );
                    })}
                </div>
                {/* Axis labels */}
                <div className="flex gap-2 px-1 mt-1.5">
                    {scores.map((_, score) => {
                        const labelColor =
                            score <= 6 ? "text-red-600 dark:text-red-400" :
                            score <= 8 ? "text-amber-600 dark:text-amber-400" :
                            "text-emerald-600 dark:text-emerald-400";
                        return (
                            <span
                                key={score}
                                className={`flex-1 text-center text-xs font-bold tabular-nums ${labelColor}`}
                                style={{ minWidth: "12px" }}
                            >
                                {score}
                            </span>
                        );
                    })}
                </div>
                <div className="flex justify-between text-xs uppercase tracking-wider text-slate-400 mt-3 font-semibold">
                    <span><span className="text-red-500">●</span> Detractors (0–6)</span>
                    <span><span className="text-amber-500">●</span> Passives (7–8)</span>
                    <span><span className="text-emerald-500">●</span> Promoters (9–10)</span>
                </div>
            </CardContent>
        </Card>
    );
}

// ── Driver analysis: what detractors complain about vs what promoters praise ─

function DriverAnalysis({ qual }: { qual: QualUnit }) {
    const totalDetractors = qual.bucket_segment_counts.detractor;
    const totalPromoters = qual.bucket_segment_counts.promoter;

    // Top categories among detractors — sorted by detractor count, only categories with > 5 mentions.
    const detractorDrivers = [...qual.categories_by_bucket]
        .filter(c => c.detractor >= 5)
        .sort((a, b) => b.detractor - a.detractor)
        .slice(0, 5);

    const promoterDrivers = [...qual.categories_by_bucket]
        .filter(c => c.promoter >= 5)
        .sort((a, b) => b.promoter - a.promoter)
        .slice(0, 5);

    if (detractorDrivers.length === 0 && promoterDrivers.length === 0) return null;

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <DriverPanel
                title="Why detractors give low scores"
                accent="red"
                icon={<TrendingDown className="w-4 h-4" />}
                drivers={detractorDrivers}
                totalSegments={totalDetractors}
                bucketKey="detractor"
            />
            <DriverPanel
                title="What promoters praise"
                accent="emerald"
                icon={<TrendingUp className="w-4 h-4" />}
                drivers={promoterDrivers}
                totalSegments={totalPromoters}
                bucketKey="promoter"
            />
        </div>
    );
}

function DriverPanel({
    title, accent, icon, drivers, totalSegments, bucketKey,
}: {
    title: string;
    accent: "red" | "emerald";
    icon: React.ReactNode;
    drivers: CatBucketBreakdown[];
    totalSegments: number;
    bucketKey: "detractor" | "promoter";
}) {
    const headerClass = accent === "red"
        ? "text-red-700 dark:text-red-400 border-b-red-200 dark:border-b-red-900/40"
        : "text-emerald-700 dark:text-emerald-400 border-b-emerald-200 dark:border-b-emerald-900/40";
    const barClass = accent === "red" ? "bg-red-400" : "bg-emerald-500";
    const quoteBg = accent === "red"
        ? "bg-red-50/40 dark:bg-red-950/10 border-red-200 dark:border-red-900/40"
        : "bg-emerald-50/40 dark:bg-emerald-950/10 border-emerald-200 dark:border-emerald-900/40";

    if (drivers.length === 0) {
        return (
            <Card className="border-dashed border-slate-200 dark:border-slate-800">
                <CardHeader className={`pb-2 border-b ${headerClass}`}>
                    <CardTitle className={`text-sm font-bold flex items-center gap-2 ${accent === "red" ? "text-red-700 dark:text-red-400" : "text-emerald-700 dark:text-emerald-400"}`}>
                        {icon} {title}
                    </CardTitle>
                </CardHeader>
                <CardContent className="text-xs text-slate-500 dark:text-slate-400 py-4">
                    Not enough analyzed comments in this bucket yet.
                </CardContent>
            </Card>
        );
    }

    const maxBucketCount = Math.max(...drivers.map(d => d[bucketKey]), 1);

    return (
        <Card className="shadow-sm">
            <CardHeader className={`pb-3 border-b ${headerClass}`}>
                <CardTitle className={`text-sm font-bold flex items-center gap-2 ${accent === "red" ? "text-red-700 dark:text-red-400" : "text-emerald-700 dark:text-emerald-400"}`}>
                    {icon} {title}
                </CardTitle>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Categories most often mentioned by {bucketKey}s. Shows where to focus to {accent === "red" ? "reduce" : "amplify"} the signal.
                </p>
            </CardHeader>
            <CardContent className="space-y-3 pt-4">
                {drivers.map(d => {
                    const count = d[bucketKey];
                    const widthPct = (count / maxBucketCount) * 100;
                    const shareOfBucket = totalSegments > 0 ? (count / totalSegments) * 100 : 0;
                    const quote = bucketKey === "detractor" ? d.detractor_quote : d.promoter_quote;
                    return (
                        <div key={d.category_name} className="space-y-1.5">
                            <div className="flex items-baseline justify-between gap-2">
                                <span className="text-sm font-semibold text-slate-700 dark:text-slate-300 break-words">{d.category_name}</span>
                                <span className="text-xs text-slate-500 dark:text-slate-400 shrink-0 tabular-nums">
                                    {count.toLocaleString()} {bucketKey === "detractor" ? "detractor" : "promoter"} mention{count === 1 ? "" : "s"} · {shareOfBucket.toFixed(0)}% of bucket
                                </span>
                            </div>
                            <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                                <div className={`h-full rounded-full ${barClass}`} style={{ width: `${widthPct}%` }} />
                            </div>
                            {quote && (
                                <blockquote className={`text-xs text-slate-600 dark:text-slate-400 italic border-l-2 ${accent === "red" ? "border-l-red-300 dark:border-l-red-800" : "border-l-emerald-300 dark:border-l-emerald-800"} pl-2.5 py-0.5 mt-1 ${quoteBg} rounded-r`}>
                                    &ldquo;{quote.segment_text}&rdquo;
                                    <span className="block text-xs text-slate-400 not-italic mt-0.5">— {quote.faculty}</span>
                                </blockquote>
                            )}
                        </div>
                    );
                })}
            </CardContent>
        </Card>
    );
}

// ── Per-bucket sample voices ─────────────────────────────────────────────────

function BucketVoices({ qual }: { qual: QualUnit }) {
    const { detractor, passive, promoter } = qual.bucket_quotes;
    if (detractor.length === 0 && passive.length === 0 && promoter.length === 0) return null;

    return (
        <Card className="shadow-sm">
            <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                    <MessageSquareQuote className="w-4 h-4 text-slate-500" />
                    <CardTitle className="text-base">Voices by bucket</CardTitle>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Verbatim comments from each bucket — what they actually said, not just the categories.
                </p>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                    <VoiceColumn title="Detractors" subtitle="Score 0–6" icon={<Frown className="w-3.5 h-3.5" />} accent="red" quotes={detractor} />
                    <VoiceColumn title="Passives" subtitle="Score 7–8" icon={<Meh className="w-3.5 h-3.5" />} accent="amber" quotes={passive} />
                    <VoiceColumn title="Promoters" subtitle="Score 9–10" icon={<Smile className="w-3.5 h-3.5" />} accent="emerald" quotes={promoter} />
                </div>
            </CardContent>
        </Card>
    );
}

function VoiceColumn({
    title, subtitle, icon, accent, quotes,
}: {
    title: string;
    subtitle: string;
    icon: React.ReactNode;
    accent: "red" | "amber" | "emerald";
    quotes: Quote[];
}) {
    const headerClass: Record<typeof accent, string> = {
        red: "text-red-700 dark:text-red-400 border-red-200 dark:border-red-900/40",
        amber: "text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-900/40",
        emerald: "text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900/40",
    };
    const bgClass: Record<typeof accent, string> = {
        red: "bg-red-50/40 dark:bg-red-950/10",
        amber: "bg-amber-50/40 dark:bg-amber-950/10",
        emerald: "bg-emerald-50/40 dark:bg-emerald-950/10",
    };

    return (
        <div className={`border rounded-lg ${headerClass[accent]}`}>
            <div className={`flex items-center justify-between gap-2 px-3 py-2 border-b ${headerClass[accent]} ${bgClass[accent]} rounded-t-lg`}>
                <span className={`text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 ${headerClass[accent]}`}>
                    {icon} {title}
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400 font-semibold">{subtitle}</span>
            </div>
            <div className="p-3 space-y-3">
                {quotes.length === 0 ? (
                    <p className="text-xs text-slate-400">No comments in this bucket.</p>
                ) : (
                    quotes.map((q, i) => (
                        <div key={i} className="text-sm text-slate-700 dark:text-slate-300">
                            <p className="italic break-words">&ldquo;{q.segment_text}&rdquo;</p>
                            <p className="text-xs text-slate-400 not-italic mt-1">— {q.faculty}</p>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}

// ── Category breakdown table (all categories × bucket) ───────────────────────

function CategoryBucketTable({ qual }: { qual: QualUnit }) {
    const cats = qual.categories_by_bucket;
    if (cats.length === 0) return null;
    const maxTotal = Math.max(...cats.map(c => c.total), 1);

    return (
        <Card className="shadow-sm">
            <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-slate-500" />
                    <CardTitle className="text-base">Categories — bucket breakdown</CardTitle>
                </div>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                    For each theme students mentioned, which bucket the comment came from. A category dominated
                    by red is a recurring complaint area; one dominated by green is a strength.
                </p>
            </CardHeader>
            <CardContent>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-slate-200 dark:border-slate-800 text-xs uppercase tracking-wider text-slate-400">
                                <th className="text-left font-semibold py-2 pr-3 min-w-[180px]">Category</th>
                                <th className="text-left font-semibold py-2 px-2 w-full">Bucket distribution</th>
                                <th className="text-right font-semibold py-2 pl-2 w-20">Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            {cats.map(c => {
                                const dPct = c.total > 0 ? (c.detractor / c.total) * 100 : 0;
                                const pPct = c.total > 0 ? (c.passive / c.total) * 100 : 0;
                                const proPct = c.total > 0 ? (c.promoter / c.total) * 100 : 0;
                                const uPct = c.total > 0 ? (c.unknown / c.total) * 100 : 0;
                                const barWidth = (c.total / maxTotal) * 100;
                                return (
                                    <tr key={c.category_name} className="border-b border-slate-100 dark:border-slate-900 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-900/40 transition-colors">
                                        <td className="py-2 pr-3 text-slate-700 dark:text-slate-300 align-top">
                                            <span className="break-words leading-snug" title={c.category_name}>{c.category_name}</span>
                                        </td>
                                        <td className="py-2 px-2 align-middle">
                                            <div className="flex h-3 rounded-md overflow-hidden bg-slate-100 dark:bg-slate-800" style={{ width: `${barWidth}%`, minWidth: "60px" }}>
                                                {c.detractor > 0 && <div className="bg-red-400" style={{ width: `${dPct}%` }} title={`Detractors: ${c.detractor} (${dPct.toFixed(0)}%)`} />}
                                                {c.passive > 0 && <div className="bg-amber-300" style={{ width: `${pPct}%` }} title={`Passives: ${c.passive} (${pPct.toFixed(0)}%)`} />}
                                                {c.promoter > 0 && <div className="bg-emerald-500" style={{ width: `${proPct}%` }} title={`Promoters: ${c.promoter} (${proPct.toFixed(0)}%)`} />}
                                                {c.unknown > 0 && <div className="bg-slate-300 dark:bg-slate-600" style={{ width: `${uPct}%` }} title={`Did not answer NPS: ${c.unknown}`} />}
                                            </div>
                                            <div className="flex gap-3 text-xs text-slate-500 dark:text-slate-400 mt-1 tabular-nums">
                                                {c.detractor > 0 && <span className="text-red-600 dark:text-red-400">{c.detractor} D</span>}
                                                {c.passive > 0 && <span className="text-amber-600 dark:text-amber-400">{c.passive} Pa</span>}
                                                {c.promoter > 0 && <span className="text-emerald-600 dark:text-emerald-400">{c.promoter} Pr</span>}
                                                {c.unknown > 0 && <span>{c.unknown} ?</span>}
                                            </div>
                                        </td>
                                        <td className="py-2 pl-2 text-right text-slate-700 dark:text-slate-300 tabular-nums align-top font-semibold">
                                            {c.total.toLocaleString()}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                <p className="text-xs text-slate-400 mt-2">
                    Legend: <span className="text-red-600">D</span> = detractor (0–6) · <span className="text-amber-600">Pa</span> = passive (7–8) · <span className="text-emerald-600">Pr</span> = promoter (9–10) · ? = did not answer the NPS score column
                </p>
            </CardContent>
        </Card>
    );
}

// ── Sentiment × NPS bucket cross-tab ─────────────────────────────────────────

function SentimentBucketMatrix({ qual }: { qual: QualUnit }) {
    const m = qual.sentiment_x_bucket;
    // Row totals per bucket (denominators for "% within bucket").
    const rowTotal = {
        detractor: m.detractor.positive.count + m.detractor.neutral.count + m.detractor.negative.count,
        passive:   m.passive.positive.count   + m.passive.neutral.count   + m.passive.negative.count,
        promoter:  m.promoter.positive.count  + m.promoter.neutral.count  + m.promoter.negative.count,
    };
    const grandTotal = rowTotal.detractor + rowTotal.passive + rowTotal.promoter;
    if (grandTotal === 0) return null;

    // Cells classified by significance for visual emphasis.
    // The off-diagonal corners (detractor+positive, promoter+negative) are the most informative.
    type Significance = "expected" | "drift" | "hidden";
    type BucketKey = "detractor" | "passive" | "promoter";
    type SentKey = "negative" | "neutral" | "positive";
    const significance: Record<BucketKey, Record<SentKey, Significance>> = {
        detractor: { negative: "expected", neutral: "expected", positive: "hidden" },
        passive:   { negative: "drift",    neutral: "expected", positive: "drift"  },
        promoter:  { negative: "hidden",   neutral: "expected", positive: "expected" },
    };

    const sentCols: SentKey[] = ["negative", "neutral", "positive"];
    const buckets: { key: BucketKey; label: string; color: string }[] = [
        { key: "promoter",  label: "Promoter (9–10)", color: "text-emerald-600 dark:text-emerald-400" },
        { key: "passive",   label: "Passive (7–8)",   color: "text-amber-600 dark:text-amber-400" },
        { key: "detractor", label: "Detractor (0–6)", color: "text-red-600 dark:text-red-400" },
    ];

    function cellClass(sig: Significance): string {
        if (sig === "hidden") return "bg-violet-50 dark:bg-violet-950/30 border-violet-200 dark:border-violet-900/50";
        if (sig === "drift") return "bg-amber-50/50 dark:bg-amber-950/15 border-amber-100 dark:border-amber-900/30";
        return "bg-slate-50 dark:bg-slate-900/40 border-slate-100 dark:border-slate-800";
    }

    return (
        <Card className="shadow-sm">
            <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                    <Grid3x3 className="w-4 h-4 text-slate-500" />
                    <CardTitle className="text-base">Sentiment × NPS bucket</CardTitle>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Every analyzed comment lives in two dimensions: the NPS score the respondent gave, and the sentiment
                    of what they wrote. The diagonal is expected. The <span className="text-violet-700 dark:text-violet-400 font-semibold">violet corners</span> are
                    the gold — they&apos;re where loyal fans complain or dissatisfied students still see value.
                </p>
            </CardHeader>
            <CardContent>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm border-collapse">
                        <thead>
                            <tr>
                                <th className="text-left font-semibold text-xs uppercase tracking-wider text-slate-400 py-2 pr-3 min-w-[140px]"></th>
                                {sentCols.map(s => (
                                    <th key={s} className="text-center font-semibold text-xs uppercase tracking-wider py-2 px-2 min-w-[110px]">
                                        <span className={
                                            s === "negative" ? "text-red-600 dark:text-red-400" :
                                            s === "positive" ? "text-emerald-600 dark:text-emerald-400" :
                                            "text-slate-500 dark:text-slate-400"
                                        }>
                                            {s} comment
                                        </span>
                                    </th>
                                ))}
                                <th className="text-right font-semibold text-xs uppercase tracking-wider text-slate-400 py-2 pl-2 min-w-[60px]">Row n</th>
                            </tr>
                        </thead>
                        <tbody>
                            {buckets.map(b => (
                                <tr key={b.key}>
                                    <td className={`py-2 pr-3 font-semibold text-xs ${b.color}`}>{b.label}</td>
                                    {sentCols.map(s => {
                                        const cell = m[b.key][s];
                                        const rt = rowTotal[b.key];
                                        const pct = rt > 0 ? (cell.count / rt) * 100 : 0;
                                        const sig = significance[b.key][s];
                                        return (
                                            <td key={s} className="py-1 px-1 align-middle">
                                                <div className={`rounded-lg border px-2 py-2 text-center ${cellClass(sig)}`}>
                                                    <div className="text-base font-black tabular-nums text-slate-800 dark:text-slate-100 leading-none">
                                                        {cell.count.toLocaleString()}
                                                    </div>
                                                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 tabular-nums">
                                                        {pct.toFixed(0)}% of row
                                                    </div>
                                                </div>
                                            </td>
                                        );
                                    })}
                                    <td className="py-2 pl-2 text-right text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                                        {rowTotal[b.key].toLocaleString()}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <p className="text-xs text-slate-400 mt-3 leading-relaxed">
                    <span className="inline-block w-2 h-2 rounded-sm bg-violet-300 dark:bg-violet-800 mr-1 align-middle" /> hidden insight &nbsp;
                    <span className="inline-block w-2 h-2 rounded-sm bg-amber-200 dark:bg-amber-900 mr-1 align-middle" /> drift signal (passive leaning toward another bucket) &nbsp;
                    <span className="inline-block w-2 h-2 rounded-sm bg-slate-200 dark:bg-slate-700 mr-1 align-middle" /> expected
                </p>
            </CardContent>
        </Card>
    );
}

// ── Hidden insights: the two off-diagonal cohorts ────────────────────────────

function HiddenInsights({ qual }: { qual: QualUnit }) {
    const criticalFans = qual.critical_fans_quotes;
    const recoverableDetractors = qual.recoverable_detractor_quotes;
    if (criticalFans.length === 0 && recoverableDetractors.length === 0) return null;

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="shadow-sm border-violet-200 dark:border-violet-900/40 overflow-hidden">
                <div className="h-1 bg-gradient-to-r from-violet-500 to-purple-500" />
                <CardHeader className="pb-3 bg-violet-50/40 dark:bg-violet-950/15">
                    <div className="flex items-start gap-2">
                        <div className="p-1.5 bg-violet-100 dark:bg-violet-900/40 rounded-lg shrink-0">
                            <Heart className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                        </div>
                        <div>
                            <CardTitle className="text-sm font-bold text-violet-800 dark:text-violet-300">
                                Critical fans — promoters who still complain
                            </CardTitle>
                            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                                These respondents gave 9–10 (would recommend) <em>and</em> left negative feedback.
                                Their critiques are the most credible — they want you to succeed.
                            </p>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="pt-4">
                    {criticalFans.length === 0 ? (
                        <p className="text-xs text-slate-500 dark:text-slate-400">No promoters left negative comments — strong sign that your advocates are unconditional.</p>
                    ) : (
                        <div className="space-y-3">
                            {criticalFans.slice(0, 5).map((q, i) => (
                                <blockquote key={i} className="text-xs text-slate-700 dark:text-slate-300 border-l-2 border-violet-300 dark:border-violet-700 pl-3 py-0.5">
                                    <p className="italic break-words">&ldquo;{q.segment_text}&rdquo;</p>
                                    <p className="text-xs text-slate-400 not-italic mt-1">— {q.faculty}</p>
                                </blockquote>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            <Card className="shadow-sm border-blue-200 dark:border-blue-900/40 overflow-hidden">
                <div className="h-1 bg-gradient-to-r from-blue-500 to-cyan-500" />
                <CardHeader className="pb-3 bg-blue-50/40 dark:bg-blue-950/15">
                    <div className="flex items-start gap-2">
                        <div className="p-1.5 bg-blue-100 dark:bg-blue-900/40 rounded-lg shrink-0">
                            <LifeBuoy className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                        </div>
                        <div>
                            <CardTitle className="text-sm font-bold text-blue-800 dark:text-blue-300">
                                Recoverable detractors — they see strengths
                            </CardTitle>
                            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                                These respondents gave 0–6 (wouldn&apos;t recommend) <em>but</em> left positive comments.
                                They see real value — something specific tipped them over. Highest-leverage cohort.
                            </p>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="pt-4">
                    {recoverableDetractors.length === 0 ? (
                        <p className="text-xs text-slate-500 dark:text-slate-400">No detractors left positive comments — when they&apos;re unhappy, they&apos;re fully unhappy.</p>
                    ) : (
                        <div className="space-y-3">
                            {recoverableDetractors.slice(0, 5).map((q, i) => (
                                <blockquote key={i} className="text-xs text-slate-700 dark:text-slate-300 border-l-2 border-blue-300 dark:border-blue-700 pl-3 py-0.5">
                                    <p className="italic break-words">&ldquo;{q.segment_text}&rdquo;</p>
                                    <p className="text-xs text-slate-400 not-italic mt-1">— {q.faculty}</p>
                                </blockquote>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

// ── Per-faculty NPS table (existing, lightly polished) ───────────────────────

function PerFacultyTable({ rows }: { rows: NpsFacultyRow[] }) {
    if (rows.length === 0) return null;

    const groups = new Map<string, { unit_id: number; unit_name: string; column: string; rows: NpsFacultyRow[] }>();
    for (const r of rows) {
        const key = `${r.unit_id}::${r.column}`;
        if (!groups.has(key)) groups.set(key, { unit_id: r.unit_id, unit_name: r.unit_name, column: r.column, rows: [] });
        groups.get(key)!.rows.push(r);
    }

    return (
        <Card className="shadow-sm">
            <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-slate-500" />
                    <CardTitle className="text-base">NPS by Faculty</CardTitle>
                </div>
            </CardHeader>
            <CardContent className="space-y-6">
                {Array.from(groups.values()).map(g => (
                    <div key={`${g.unit_id}::${g.column}`} className="space-y-2">
                        {groups.size > 1 && (
                            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider break-words">{g.column}</p>
                        )}
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-slate-200 dark:border-slate-800 text-xs uppercase tracking-wider text-slate-400">
                                        <th className="text-left font-semibold py-2 pr-3">Faculty</th>
                                        <th className="text-right font-semibold py-2 px-2 w-20">NPS</th>
                                        <th className="text-left font-semibold py-2 px-2 w-64">Distribution</th>
                                        <th className="text-right font-semibold py-2 pl-2 w-16">n</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {[...g.rows]
                                        .sort((a, b) => (b.nps_score ?? -Infinity) - (a.nps_score ?? -Infinity))
                                        .map(r => (
                                            <tr key={r.faculty} className="border-b border-slate-100 dark:border-slate-900 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-900/40 transition-colors">
                                                <td className="py-2 pr-3 text-slate-700 dark:text-slate-300 break-words max-w-[260px]">{r.faculty}</td>
                                                <td className={`py-2 px-2 text-right font-bold tabular-nums ${npsBenchmarkColor(r.nps_score)}`}>
                                                    {r.nps_score === null ? "—" : r.nps_score > 0 ? `+${r.nps_score}` : r.nps_score}
                                                </td>
                                                <td className="py-2 px-2">
                                                    <NpsBucketBar counts={toCounts(r)} variant="mini" showLabels={false} />
                                                </td>
                                                <td className="py-2 pl-2 text-right text-slate-500 dark:text-slate-400 tabular-nums">{r.total.toLocaleString()}</td>
                                            </tr>
                                        ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                ))}
                <p className="text-xs text-slate-400">
                    Tip: an NPS column reflects how willing each faculty&apos;s students are to recommend their study program.
                    Top entries here are advocates worth amplifying; bottom entries are early-warning signals.
                </p>
            </CardContent>
        </Card>
    );
}
