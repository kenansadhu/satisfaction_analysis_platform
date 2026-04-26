"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { computeSentimentScore } from "@/lib/utils";
import { PageShell, PageHeader } from "@/components/layout/PageShell";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Building2, ArrowRight, Search, PieChart, BarChart3, TrendingUp, MessageSquare } from "lucide-react";
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
};

function SentimentBar({ positive = 0, neutral = 0, negative = 0 }: { positive?: number; neutral?: number; negative?: number }) {
    const total = positive + neutral + negative;
    if (total === 0) return null;
    return (
        <div className="flex h-1.5 rounded-full overflow-hidden bg-slate-100 dark:bg-slate-800">
            {positive > 0 && <div style={{ width: `${(positive / total) * 100}%` }} className="bg-emerald-500" />}
            {neutral > 0 && <div style={{ width: `${(neutral / total) * 100}%` }} className="bg-amber-400" />}
            {negative > 0 && <div style={{ width: `${(negative / total) * 100}%` }} className="bg-red-400" />}
        </div>
    );
}

function scoreColor(s: number) {
    if (s >= 70) return "text-emerald-600 dark:text-emerald-400";
    if (s >= 50) return "text-amber-500 dark:text-amber-400";
    return "text-red-500 dark:text-red-400";
}

function scoreBadgeStyle(s: number) {
    if (s >= 70) return "border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30";
    if (s >= 50) return "border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30";
    return "border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30";
}

export default function UnitInsightsPage() {
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
            const { data: orgUnits } = await supabase
                .from('organization_units')
                .select('id, name, short_name, description')
                .order('name');

            if (!orgUnits) { setUnits([]); return; }

            const scoreMap = new Map<number, { score?: number; total_segments: number; positive: number; negative: number; neutral: number }>();
            if (activeSurveyId && activeSurveyId !== "all") {
                const { data: qualAgg } = await supabase.rpc('get_qual_summary_by_unit', {
                    p_survey_id: parseInt(activeSurveyId),
                });
                const unitAgg = new Map<number, { pos: number; neg: number; neu: number; total: number }>();
                for (const row of (qualAgg || [])) {
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
            }

            setUnits(orgUnits.map(u => ({
                ...u,
                ...(scoreMap.get(u.id) || {}),
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
    const avgScore = analyzedUnits.length > 0
        ? Math.round(analyzedUnits.reduce((s, u) => s + (u.score || 0), 0) / analyzedUnits.length)
        : null;
    const totalSegments = units.reduce((s, u) => s + (u.total_segments || 0), 0);

    const summaryStats = [
        { label: "Total Units", value: units.length, icon: Building2, color: "text-indigo-600 dark:text-indigo-400", bg: "bg-indigo-50 dark:bg-indigo-950/40" },
        { label: "Analyzed", value: `${analyzedUnits.length} / ${units.length}`, icon: BarChart3, color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-950/40" },
        { label: "Avg. Score", value: avgScore !== null ? String(avgScore) : "—", icon: TrendingUp, color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-50 dark:bg-blue-950/40" },
        { label: "Total Segments", value: totalSegments.toLocaleString(), icon: MessageSquare, color: "text-purple-600 dark:text-purple-400", bg: "bg-purple-50 dark:bg-purple-950/40" },
    ];

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

                {/* Summary Strip */}
                {!loading && units.length > 0 && (
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        {summaryStats.map(stat => (
                            <div key={stat.label} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-5 py-4 flex items-center gap-3">
                                <div className={`p-2 rounded-lg ${stat.bg} shrink-0`}>
                                    <stat.icon className={`w-4 h-4 ${stat.color}`} />
                                </div>
                                <div className="min-w-0">
                                    <div className="text-xl font-black text-slate-900 dark:text-slate-100 tabular-nums leading-tight">{stat.value}</div>
                                    <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">{stat.label}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Search */}
                <div className="relative max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input
                        placeholder="Search units..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="pl-9"
                    />
                </div>

                {/* Grid */}
                {loading ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {Array.from({ length: 6 }).map((_, i) => (
                            <Skeleton key={i} className="h-52 rounded-2xl" />
                        ))}
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="text-center py-20 text-slate-400">
                        <Building2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
                        <p className="font-medium">No units found</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {filtered.map(unit => {
                            const hasAnalysis = unit.score !== undefined;
                            const total = unit.total_segments || 0;
                            const posPct = total > 0 ? Math.round(((unit.positive || 0) / total) * 100) : 0;
                            const negPct = total > 0 ? Math.round(((unit.negative || 0) / total) * 100) : 0;

                            return (
                                <Link key={unit.id} href={`/unit-insights/${unit.id}`} className="group">
                                    <div className="h-full bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 hover:border-indigo-300 dark:hover:border-indigo-700 hover:shadow-xl dark:hover:shadow-indigo-950/20 transition-all duration-200 group-hover:-translate-y-1 overflow-hidden flex flex-col">

                                        <div className="p-5 flex-1 space-y-4">
                                            {/* Top row: icon + score badge */}
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="p-2.5 bg-indigo-50 dark:bg-indigo-950/40 rounded-xl shrink-0">
                                                    <Building2 className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                                                </div>
                                                {hasAnalysis ? (
                                                    <div className={`rounded-xl border px-3 py-1.5 text-right ${scoreBadgeStyle(unit.score!)}`}>
                                                        <span className={`text-2xl font-black tabular-nums leading-none ${scoreColor(unit.score!)}`}>{unit.score}</span>
                                                        <span className="text-[10px] text-slate-400 ml-0.5">/100</span>
                                                    </div>
                                                ) : (
                                                    <Badge variant="outline" className="text-[10px] text-slate-400 border-slate-200 dark:border-slate-700 font-normal">
                                                        Not analyzed
                                                    </Badge>
                                                )}
                                            </div>

                                            {/* Name + short name */}
                                            <div>
                                                <h3 className="font-bold text-slate-900 dark:text-slate-100 text-base leading-snug group-hover:text-indigo-700 dark:group-hover:text-indigo-400 transition-colors">
                                                    {unit.name}
                                                </h3>
                                                {unit.short_name && (
                                                    <Badge variant="secondary" className="text-[10px] mt-1.5 font-medium">{unit.short_name}</Badge>
                                                )}
                                            </div>

                                            {/* Sentiment bar + stats */}
                                            {hasAnalysis && (
                                                <div className="space-y-2">
                                                    <SentimentBar positive={unit.positive} neutral={unit.neutral} negative={unit.negative} />
                                                    <div className="flex items-center gap-2 text-[10px] font-semibold">
                                                        <span className="text-emerald-600 dark:text-emerald-400">{posPct}% pos</span>
                                                        <span className="text-slate-300 dark:text-slate-700">·</span>
                                                        <span className="text-red-500 dark:text-red-400">{negPct}% neg</span>
                                                        <span className="text-slate-300 dark:text-slate-700">·</span>
                                                        <span className="text-slate-400">{total.toLocaleString()} segments</span>
                                                    </div>
                                                </div>
                                            )}

                                            {/* Description */}
                                            {unit.description && (
                                                <p className="text-xs text-slate-400 dark:text-slate-500 line-clamp-2 leading-relaxed">
                                                    {unit.description}
                                                </p>
                                            )}
                                        </div>

                                        {/* Footer */}
                                        <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex items-center justify-between">
                                            <span className="text-xs font-semibold text-slate-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 flex items-center gap-1 transition-colors">
                                                View Insights
                                                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                                            </span>
                                        </div>
                                    </div>
                                </Link>
                            );
                        })}
                    </div>
                )}
            </div>
        </PageShell>
    );
}
