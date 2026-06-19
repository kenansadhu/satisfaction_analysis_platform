"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { computeSentimentScore } from "@/lib/utils";
import { PageShell, PageHeader } from "@/components/layout/PageShell";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { InfoHint } from "@/components/ui/info-hint";
import { Building2, ArrowRight, Search, PieChart, TrendingUp, MessageSquare } from "lucide-react";
import Link from "next/link";
import { useActiveSurvey } from "@/context/SurveyContext";

type UnitRow = {
    id: number;
    name: string;
    short_name: string | null;
    description: string | null;
    score?: number;
    total_segments?: number;
    positive?: number;
    negative?: number;
    neutral?: number;
    ssiScore?: number | null;
};

function ssiColor(s: number | null | undefined) {
    if (s == null) return "text-slate-400 dark:text-slate-600";
    if (s >= 3.20) return "text-emerald-600 dark:text-emerald-400";
    if (s >= 3.00) return "text-amber-500 dark:text-amber-400";
    return "text-red-500 dark:text-red-400";
}
function ssiBorderBg(s: number | null | undefined) {
    if (s == null) return "border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50";
    if (s >= 3.20) return "border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30";
    if (s >= 3.00) return "border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30";
    return "border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30";
}
function scoreColor(s: number) {
    if (s >= 70) return "text-emerald-600 dark:text-emerald-400";
    if (s >= 50) return "text-amber-500 dark:text-amber-400";
    return "text-red-500 dark:text-red-400";
}

function scoreBg(s: number) {
    if (s >= 70) return "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800";
    if (s >= 50) return "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800";
    return "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900";
}

function SentimentBar({ positive = 0, neutral = 0, negative = 0 }: { positive?: number; neutral?: number; negative?: number }) {
    const total = positive + neutral + negative;
    if (total === 0) return <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800" />;
    return (
        <div className="flex h-1.5 rounded-full overflow-hidden bg-slate-100 dark:bg-slate-800">
            {positive > 0 && <div style={{ width: `${(positive / total) * 100}%` }} className="bg-emerald-500" />}
            {neutral > 0 && <div style={{ width: `${(neutral / total) * 100}%` }} className="bg-amber-400" />}
            {negative > 0 && <div style={{ width: `${(negative / total) * 100}%` }} className="bg-red-400" />}
        </div>
    );
}

export default function UnitInsightsPage() {
    useEffect(() => { document.title = "Unit Insights | Satisfaction Voice"; }, []);
    const { activeSurveyId, activeSurvey } = useActiveSurvey();
    const [units, setUnits] = useState<UnitRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");

    useEffect(() => {
        loadUnits();
    }, [activeSurveyId]);

    async function loadUnits() {
        setLoading(true);
        try {
            const [orgUnitsRes, npsRes, excludedRes, studyProgramRes, qualRes, reportRes] = await Promise.all([
                supabase.from('organization_units').select('id, name, short_name, description').order('name'),
                fetch("/api/settings/nps-units").then(r => r.json()).catch(() => ({ npsUnitIds: [] })),
                fetch("/api/settings/excluded-score-units").then(r => r.json()).catch(() => ({ excludedUnitIds: [] })),
                fetch("/api/settings/study-program-unit").then(r => r.json()).catch(() => ({ studyProgramUnitId: null })),
                activeSurveyId && activeSurveyId !== "all"
                    ? fetch(`/api/analytics/unit-qual-summary?surveyId=${activeSurveyId}`).then(r => r.json()).catch(() => ({ rows: [] }))
                    : Promise.resolve({ rows: [] }),
                activeSurveyId && activeSurveyId !== "all"
                    ? fetch(`/api/executive/report?surveyId=${activeSurveyId}`).then(r => r.ok ? r.json() : null).catch(() => null)
                    : Promise.resolve(null),
            ]);
            const npsUnitIds = new Set<number>(npsRes?.npsUnitIds || []);
            const excludedUnitIds = new Set<number>(excludedRes?.excludedUnitIds || []);
            const studyProgramUnitId: number | null = studyProgramRes?.studyProgramUnitId ?? null;
            const orgUnits = (orgUnitsRes.data || []).filter((u: any) =>
                !npsUnitIds.has(u.id) &&
                !excludedUnitIds.has(u.id) &&
                u.id !== studyProgramUnitId
            );

            if (!orgUnits.length) { setUnits([]); return; }

            const unitAgg = new Map<number, { pos: number; neg: number; neu: number; total: number }>();
            for (const row of (qualRes?.rows || [])) {
                const uId = row.target_unit_id;
                if (!uId) continue;
                if (!unitAgg.has(uId)) unitAgg.set(uId, { pos: 0, neg: 0, neu: 0, total: 0 });
                const u = unitAgg.get(uId)!;
                const cnt = parseInt(row.cnt) || 0;
                u.total += cnt;
                if (row.sentiment === 'Positive') u.pos += cnt;
                else if (row.sentiment === 'Negative') u.neg += cnt;
                else if (row.sentiment === 'Neutral') u.neu += cnt;
            }

            const scoreMap = new Map<number, { score: number; total_segments: number; positive: number; negative: number; neutral: number }>();
            for (const [unitId, agg] of unitAgg) {
                if (agg.total > 0) {
                    scoreMap.set(unitId, {
                        score: computeSentimentScore(agg.pos, agg.neu, agg.neg),
                        total_segments: agg.total,
                        positive: agg.pos,
                        negative: agg.neg,
                        neutral: agg.neu,
                    });
                }
            }

            const ssiMap = new Map<number, number | null>();
            for (const ru of ((reportRes?.units as any[]) || [])) {
                if (ru.unit_id != null) ssiMap.set(ru.unit_id, ru.satisfaction_index ?? null);
            }

            setUnits(orgUnits.map((u: any) => ({
                ...u,
                ...(scoreMap.get(u.id) || {}),
                ssiScore: ssiMap.has(u.id) ? ssiMap.get(u.id) : undefined,
            })));
        } finally {
            setLoading(false);
        }
    }

    const filtered = units.filter(u =>
        u.name.toLowerCase().includes(search.toLowerCase()) ||
        (u.short_name || '').toLowerCase().includes(search.toLowerCase())
    );

    const analyzedUnits = units.filter(u => u.score !== undefined);
    const totalSegments = units.reduce((s, u) => s + (u.total_segments || 0), 0);

    const goodUnits = analyzedUnits.filter(u => (u.score || 0) >= 70);
    const fairUnits = analyzedUnits.filter(u => { const s = u.score || 0; return s >= 50 && s < 70; });
    const poorUnits = analyzedUnits.filter(u => (u.score || 0) < 50);
    const totalPos = units.reduce((s, u) => s + (u.positive || 0), 0);
    const totalNeg = units.reduce((s, u) => s + (u.negative || 0), 0);
    // Macro average score — each unit weighted equally
    const avgScore = analyzedUnits.length > 0
        ? Math.round(analyzedUnits.reduce((s, u) => s + (u.score || 0), 0) / analyzedUnits.length)
        : null;
    // Macro percentages — average of per-unit percentages, consistent with avgScore
    const macroPosPct = analyzedUnits.length > 0
        ? Math.round(analyzedUnits.reduce((s, u) => s + ((u.total_segments || 0) > 0 ? (u.positive || 0) / u.total_segments * 100 : 0), 0) / analyzedUnits.length)
        : 0;
    const macroNeuPct = analyzedUnits.length > 0
        ? Math.round(analyzedUnits.reduce((s, u) => s + ((u.total_segments || 0) > 0 ? (u.neutral || 0) / u.total_segments * 100 : 0), 0) / analyzedUnits.length)
        : 0;
    const macroNegPct = analyzedUnits.length > 0
        ? Math.round(analyzedUnits.reduce((s, u) => s + ((u.total_segments || 0) > 0 ? (u.negative || 0) / u.total_segments * 100 : 0), 0) / analyzedUnits.length)
        : 0;
    const topUnit = analyzedUnits.length > 0 ? [...analyzedUnits].sort((a, b) => (b.score || 0) - (a.score || 0))[0] : null;

    return (
        <PageShell>
            <PageHeader
                title={<span className="flex items-center gap-2"><Building2 className="w-6 h-6 text-indigo-500" /> Unit Insights</span>}
                description="Dashboard and AI analysis results for each organizational unit."
                actions={
                    activeSurvey ? (
                        <Badge variant="outline" className="bg-indigo-50/50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/20 dark:text-indigo-300 dark:border-indigo-800 gap-1.5 px-3 py-1">
                            <PieChart className="w-3.5 h-3.5" /> {activeSurvey.title}
                        </Badge>
                    ) : null
                }
            />

            <div className="max-w-7xl mx-auto px-8 py-8 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">

                {/* Hero Card */}
                {!loading && units.length > 0 && analyzedUnits.length > 0 && (
                    <div className="relative rounded-2xl overflow-hidden bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 border border-indigo-900/50 shadow-2xl">
                        {/* Decorative blobs */}
                        <div className="absolute -top-20 -left-20 w-72 h-72 rounded-full bg-indigo-600/20 blur-3xl pointer-events-none" />
                        <div className="absolute -bottom-16 -right-16 w-64 h-64 rounded-full bg-violet-600/15 blur-3xl pointer-events-none" />
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-32 rounded-full bg-indigo-500/5 blur-2xl pointer-events-none" />

                        {/* Main content */}
                        <div className="relative flex flex-col lg:flex-row gap-0 divide-y lg:divide-y-0 lg:divide-x divide-white/10">

                            {/* Left: Avg Score */}
                            <div className="flex flex-col items-center justify-center px-10 py-8 lg:w-56 shrink-0 gap-1">
                                <div className="text-xs font-semibold uppercase tracking-widest text-indigo-300/70 mb-1 flex items-center gap-1.5">
                                    Overall Score
                                    <InfoHint side="bottom" iconClassName="text-indigo-300/60 hover:text-indigo-100">
                                        <strong>Average Sentiment Score (0–100)</strong> across all analyzed units. Each unit's score is derived from its student comments: positive segments = 1 pt, neutral = 0.5, negative = 0.
                                        <br /><br />Benchmarks: ≥70 healthy · 50–69 fair · &lt;50 needs attention.
                                    </InfoHint>
                                </div>
                                <div className={`text-5xl font-black tabular-nums leading-none ${
                                    avgScore !== null && avgScore >= 70 ? "text-emerald-400" :
                                    avgScore !== null && avgScore >= 50 ? "text-amber-400" : "text-red-400"
                                }`}>{avgScore ?? "—"}</div>
                                <div className="text-sm text-indigo-200/50 font-medium mt-1">out of 100</div>
                                {analyzedUnits.length > 0 && (
                                    <div className="grid grid-cols-3 gap-x-3 mt-2 w-full">
                                        <div>
                                            <p className="text-[11px] font-semibold text-emerald-400">{macroPosPct}% pos</p>
                                            <p className="text-[10px] text-emerald-400/50">×1</p>
                                        </div>
                                        <div>
                                            <p className="text-[11px] font-semibold text-slate-400">{macroNeuPct}% neu</p>
                                            <p className="text-[10px] text-slate-400/50">×0.5</p>
                                        </div>
                                        <div>
                                            <p className="text-[11px] font-semibold text-red-400">{macroNegPct}% neg</p>
                                            <p className="text-[10px] text-red-400/50">×0</p>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Center: Score Distribution */}
                            <div className="flex-1 px-8 py-8 flex flex-col justify-center gap-4">
                                <div className="text-xs font-semibold uppercase tracking-widest text-indigo-300/70 mb-1 flex items-center gap-1.5">
                                    Score Distribution
                                    <InfoHint side="bottom" iconClassName="text-indigo-300/60 hover:text-indigo-100">
                                        How the analyzed units split across performance tiers based on their sentiment score (0–100). Use this to spot whether the institution has a healthy core, a long tail of weak performers, or polarised results.
                                    </InfoHint>
                                </div>
                                <div className="space-y-3">
                                    <div className="flex items-center gap-3">
                                        <div className="w-3 h-3 rounded-full bg-emerald-400 shrink-0" />
                                        <div className="flex-1 min-w-0">
                                            <div className="flex justify-between items-baseline mb-1">
                                                <span className="text-xs font-semibold text-emerald-300">Healthy</span>
                                                <span className="text-xs text-white/40 tabular-nums">{goodUnits.length} unit{goodUnits.length !== 1 ? "s" : ""}</span>
                                            </div>
                                            <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                                                <div className="h-full rounded-full bg-emerald-400 transition-all duration-700"
                                                    style={{ width: analyzedUnits.length > 0 ? `${(goodUnits.length / analyzedUnits.length) * 100}%` : "0%" }} />
                                            </div>
                                        </div>
                                        <span className="text-xs font-bold text-white/50 tabular-nums w-10 text-right">≥ 70</span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <div className="w-3 h-3 rounded-full bg-amber-400 shrink-0" />
                                        <div className="flex-1 min-w-0">
                                            <div className="flex justify-between items-baseline mb-1">
                                                <span className="text-xs font-semibold text-amber-300">Fair</span>
                                                <span className="text-xs text-white/40 tabular-nums">{fairUnits.length} unit{fairUnits.length !== 1 ? "s" : ""}</span>
                                            </div>
                                            <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                                                <div className="h-full rounded-full bg-amber-400 transition-all duration-700"
                                                    style={{ width: analyzedUnits.length > 0 ? `${(fairUnits.length / analyzedUnits.length) * 100}%` : "0%" }} />
                                            </div>
                                        </div>
                                        <span className="text-xs font-bold text-white/50 tabular-nums w-10 text-right">50–69</span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <div className="w-3 h-3 rounded-full bg-red-400 shrink-0" />
                                        <div className="flex-1 min-w-0">
                                            <div className="flex justify-between items-baseline mb-1">
                                                <span className="text-xs font-semibold text-red-300">Needs Attention</span>
                                                <span className="text-xs text-white/40 tabular-nums">{poorUnits.length} unit{poorUnits.length !== 1 ? "s" : ""}</span>
                                            </div>
                                            <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                                                <div className="h-full rounded-full bg-red-400 transition-all duration-700"
                                                    style={{ width: analyzedUnits.length > 0 ? `${(poorUnits.length / analyzedUnits.length) * 100}%` : "0%" }} />
                                            </div>
                                        </div>
                                        <span className="text-xs font-bold text-white/50 tabular-nums w-10 text-right">&lt; 50</span>
                                    </div>
                                </div>
                            </div>

                            {/* Right: Top Performer + Total Segments */}
                            <div className="flex flex-col justify-center gap-6 px-8 py-8 lg:w-64 shrink-0">
                                <div>
                                    <div className="text-xs font-semibold uppercase tracking-widest text-indigo-300/70 mb-2 flex items-center gap-1.5">
                                        Top Performer
                                        <InfoHint side="left" iconClassName="text-indigo-300/60 hover:text-indigo-100">
                                            The unit with the highest sentiment score across its student comments. Click any row in the list below to drill into a unit.
                                        </InfoHint>
                                    </div>
                                    {topUnit ? (
                                        <div className="flex items-start gap-2.5">
                                            <div className="p-2 bg-emerald-500/20 rounded-lg shrink-0 mt-0.5">
                                                <TrendingUp className="w-4 h-4 text-emerald-400" />
                                            </div>
                                            <div className="min-w-0">
                                                <div className="text-sm font-bold text-white leading-snug truncate">{topUnit.name}</div>
                                                <div className={`text-xl font-black tabular-nums leading-none mt-0.5 ${scoreColor(topUnit.score!)}`}>{topUnit.score}<span className="text-sm font-medium text-white/30 ml-0.5">/100</span></div>
                                            </div>
                                        </div>
                                    ) : <span className="text-white/30 text-sm">—</span>}
                                </div>
                                <div>
                                    <div className="text-xs font-semibold uppercase tracking-widest text-indigo-300/70 mb-1 flex items-center gap-1.5">
                                        Total Comments
                                        <InfoHint side="left" iconClassName="text-indigo-300/60 hover:text-indigo-100">
                                            Total number of feedback segments analyzed across all units. One open-ended comment can be split into multiple segments (one per idea), which is why segments exceed respondent count.
                                        </InfoHint>
                                    </div>
                                    <div className="flex items-baseline gap-1.5">
                                        <MessageSquare className="w-4 h-4 text-indigo-400 shrink-0 self-center" />
                                        <span className="text-xl font-black text-white tabular-nums">{totalSegments.toLocaleString()}</span>
                                        <span className="text-sm text-white/30 font-medium">segments</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                    </div>
                )}

                {/* Search */}
                <div className="relative max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input placeholder="Search units..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
                </div>

                {/* Row list */}
                {loading ? (
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden divide-y divide-slate-100 dark:divide-slate-800">
                        {Array.from({ length: 6 }).map((_, i) => (
                            <div key={i} className="px-8 py-5 flex items-center gap-6">
                                <Skeleton className="w-8 h-6 rounded" />
                                <Skeleton className="w-10 h-10 rounded-xl shrink-0" />
                                <Skeleton className="h-5 flex-1 rounded" />
                                <Skeleton className="w-28 h-2 rounded-full" />
                                <Skeleton className="w-16 h-8 rounded-lg" />
                                <Skeleton className="w-24 h-4 rounded" />
                            </div>
                        ))}
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="text-center py-20 text-slate-400">
                        <Building2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
                        <p className="font-medium">No units found</p>
                    </div>
                ) : (
                    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-slate-50 dark:bg-slate-950">
                        {/* Column header */}
                        <div className="hidden lg:flex items-center gap-6 px-6 py-3 bg-slate-50 dark:bg-slate-950 text-[10px] font-semibold uppercase tracking-widest text-slate-400 border-b border-slate-200 dark:border-slate-800">
                            <span className="w-6 shrink-0" />
                            <span className="w-10 shrink-0" />
                            <span className="flex-1">Unit</span>
                            <span className="w-44 shrink-0">Sentiment</span>
                            <span className="w-24 shrink-0 text-center">SSI Score</span>
                            <span className="w-28 shrink-0">Comments</span>
                            <span className="w-5 shrink-0" />
                        </div>

                        <div className="p-2 space-y-1">
                        {filtered.map((unit, idx) => {
                            const hasAnalysis = unit.score !== undefined;
                            const total = unit.total_segments || 0;
                            const posPct = total > 0 ? Math.round(((unit.positive || 0) / total) * 100) : 0;
                            const negPct = total > 0 ? Math.round(((unit.negative || 0) / total) * 100) : 0;

                            return (
                                <Link key={unit.id} href={`/unit-insights/${unit.id}`} className="group block rounded-xl">
                                    <div className="relative flex items-center gap-6 px-5 py-4 rounded-xl overflow-hidden bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800/60 hover:border-indigo-200 dark:hover:border-indigo-800/60 hover:shadow-md dark:hover:shadow-indigo-950/20 transition-all duration-200 cursor-pointer">
                                        {/* Left accent — subtle always, bright on hover */}
                                        <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-indigo-200 dark:bg-indigo-900 group-hover:bg-indigo-500 transition-colors duration-200" />

                                        {/* Index */}
                                        <span className="text-2xl font-black text-slate-100 dark:text-slate-800 tabular-nums leading-none select-none w-6 shrink-0 text-right">
                                            {String(idx + 1).padStart(2, "0")}
                                        </span>

                                        {/* Icon */}
                                        <div className="p-2.5 bg-indigo-50 dark:bg-indigo-950/40 rounded-xl shrink-0 group-hover:bg-indigo-100 dark:group-hover:bg-indigo-900/60 transition-colors duration-200">
                                            <Building2 className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                                        </div>

                                        {/* Name */}
                                        <div className="flex-1 min-w-0">
                                            <p className="font-bold text-slate-900 dark:text-slate-100 text-base leading-snug group-hover:text-indigo-700 dark:group-hover:text-indigo-400 transition-colors truncate">
                                                {unit.name}
                                            </p>
                                            {unit.short_name && (
                                                <Badge variant="secondary" className="text-[10px] mt-0.5 font-medium">{unit.short_name}</Badge>
                                            )}
                                        </div>

                                        {/* Sentiment bar + score */}
                                        <div className="hidden lg:flex w-44 shrink-0 items-center gap-2">
                                            {hasAnalysis ? (
                                                <>
                                                    <div className="flex-1 min-w-0">
                                                        <SentimentBar positive={unit.positive} neutral={unit.neutral} negative={unit.negative} />
                                                    </div>
                                                    <span className={`text-xs font-bold tabular-nums shrink-0 ${scoreColor(unit.score!)}`}>
                                                        {unit.score}
                                                    </span>
                                                </>
                                            ) : (
                                                <div className="flex-1 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800" />
                                            )}
                                        </div>

                                        {/* SSI Score */}
                                        <div className="w-24 shrink-0 flex justify-center">
                                            {unit.ssiScore != null ? (
                                                <div className={`rounded-lg border px-2.5 py-1.5 text-center ${ssiBorderBg(unit.ssiScore)}`}>
                                                    <span className={`text-xl font-black tabular-nums leading-none ${ssiColor(unit.ssiScore)}`}>{unit.ssiScore.toFixed(2)}</span>
                                                    <span className="text-[10px] text-slate-400 ml-0.5">/4.00</span>
                                                </div>
                                            ) : hasAnalysis ? (
                                                <div className="rounded-lg border px-2.5 py-1.5 text-center border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                                                    <span className={`text-xl font-black tabular-nums leading-none ${scoreColor(unit.score!)}`}>{unit.score}</span>
                                                    <span className="text-[10px] text-slate-400 ml-0.5">/100</span>
                                                </div>
                                            ) : (
                                                <Badge variant="outline" className="text-[10px] text-slate-400 border-slate-200 dark:border-slate-700 font-normal">
                                                    No data
                                                </Badge>
                                            )}
                                        </div>

                                        {/* Segments */}
                                        <div className="hidden lg:flex w-28 shrink-0 items-center gap-1.5 text-[11px] text-slate-400">
                                            <MessageSquare className="w-3.5 h-3.5 shrink-0" />
                                            <span className="tabular-nums">{total > 0 ? total.toLocaleString() : "—"}</span>
                                        </div>

                                        {/* Arrow — always visible, animates on hover */}
                                        <ArrowRight className="w-4 h-4 text-slate-300 dark:text-slate-600 group-hover:text-indigo-500 group-hover:translate-x-1 transition-all duration-200 shrink-0" />
                                    </div>
                                </Link>
                            );
                        })}
                        </div>
                    </div>
                )}
            </div>
        </PageShell>
    );
}
