"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { computeSentimentScore } from "@/lib/utils";
import { PageShell, PageHeader } from "@/components/layout/PageShell";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { GraduationCap, ArrowRight, Search, Users, BarChart3, TrendingUp, MessageSquare } from "lucide-react";
import Link from "next/link";
import { useActiveSurvey } from "@/context/SurveyContext";

type FacultyRow = {
    id: number;
    name: string;
    short_name: string | null;
    description: string | null;
    respondent_count?: number;
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

export default function FacultyInsightsPage() {
    const { activeSurveyId, activeSurvey } = useActiveSurvey();
    const [faculties, setFaculties] = useState<FacultyRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");

    useEffect(() => {
        loadFaculties();
    }, [activeSurveyId]);

    async function loadFaculties() {
        setLoading(true);
        try {
            const { data: facultyRows } = await supabase
                .from('faculties')
                .select('id, name, short_name, description')
                .order('name');

            if (!facultyRows) { setFaculties([]); return; }

            // Fetch rollup data for sentiment + respondent counts
            const rollupMap = new Map<string, any>();
            if (activeSurveyId && activeSurveyId !== "all") {
                try {
                    const res = await fetch(`/api/executive/faculty-rollup?surveyId=${activeSurveyId}`);
                    if (res.ok) {
                        const { faculties: rollupData } = await res.json();
                        for (const f of (rollupData || [])) rollupMap.set(f.faculty, f);
                    }
                } catch {}
            }

            setFaculties(facultyRows.map(f => {
                const rollup = rollupMap.get(f.name);
                const pos = rollup?.sentiment?.positive ?? 0;
                const neg = rollup?.sentiment?.negative ?? 0;
                const neu = rollup?.sentiment?.neutral ?? 0;
                const total = rollup?.sentiment?.total ?? 0;
                return {
                    ...f,
                    respondent_count: rollup?.respondents,
                    score: total > 0 ? computeSentimentScore(pos, neu, neg) : undefined,
                    total_segments: total || undefined,
                    positive: pos || undefined,
                    negative: neg || undefined,
                    neutral: neu || undefined,
                };
            }));
        } finally {
            setLoading(false);
        }
    }

    const filtered = faculties.filter(f =>
        f.name.toLowerCase().includes(search.toLowerCase()) ||
        (f.short_name || '').toLowerCase().includes(search.toLowerCase())
    );

    const totalRespondents = faculties.reduce((s, f) => s + (f.respondent_count || 0), 0);
    const analyzedFaculties = faculties.filter(f => f.score !== undefined);
    const avgScore = analyzedFaculties.length > 0
        ? Math.round(analyzedFaculties.reduce((s, f) => s + (f.score || 0), 0) / analyzedFaculties.length)
        : null;
    const totalSegments = faculties.reduce((s, f) => s + (f.total_segments || 0), 0);

    const summaryStats = [
        { label: "Total Faculties", value: faculties.length, icon: GraduationCap, color: "text-teal-600 dark:text-teal-400", bg: "bg-teal-50 dark:bg-teal-950/40" },
        { label: "Total Respondents", value: totalRespondents.toLocaleString(), icon: Users, color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-50 dark:bg-blue-950/40" },
        { label: "Avg. Score", value: avgScore !== null ? String(avgScore) : "—", icon: TrendingUp, color: "text-indigo-600 dark:text-indigo-400", bg: "bg-indigo-50 dark:bg-indigo-950/40" },
        { label: "Total Segments", value: totalSegments.toLocaleString(), icon: MessageSquare, color: "text-purple-600 dark:text-purple-400", bg: "bg-purple-50 dark:bg-purple-950/40" },
    ];

    return (
        <PageShell>
            <PageHeader
                title={<span className="flex items-center gap-2"><GraduationCap className="w-6 h-6 text-teal-500" /> Faculty Insights</span>}
                description="Breakdown of student satisfaction results by faculty."
                actions={
                    activeSurvey ? (
                        <Badge variant="outline" className="bg-teal-50/50 text-teal-700 border-teal-200 dark:bg-teal-950/20 dark:text-teal-300 dark:border-teal-800 gap-1.5 px-3 py-1">
                            <GraduationCap className="w-3.5 h-3.5" /> {activeSurvey.title}
                        </Badge>
                    ) : null
                }
            />

            <div className="max-w-7xl mx-auto px-8 py-8 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">

                {/* Summary Strip */}
                {!loading && faculties.length > 0 && (
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
                        placeholder="Search faculties..."
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
                        <GraduationCap className="w-10 h-10 mx-auto mb-3 opacity-30" />
                        <p className="font-medium">No faculties found</p>
                        {faculties.length === 0 && (
                            <p className="text-sm mt-1 text-slate-400">Add faculties in the management page first.</p>
                        )}
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {filtered.map(faculty => {
                            const hasAnalysis = faculty.score !== undefined;
                            const total = faculty.total_segments || 0;
                            const posPct = total > 0 ? Math.round(((faculty.positive || 0) / total) * 100) : 0;
                            const negPct = total > 0 ? Math.round(((faculty.negative || 0) / total) * 100) : 0;

                            return (
                                <Link key={faculty.id} href={`/faculty-insights/${faculty.id}`} className="group">
                                    <div className="h-full bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 hover:border-teal-300 dark:hover:border-teal-700 hover:shadow-xl dark:hover:shadow-teal-950/20 transition-all duration-200 group-hover:-translate-y-1 overflow-hidden flex flex-col">

                                        <div className="p-5 flex-1 space-y-4">
                                            {/* Top row: icon + score or respondent count */}
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="p-2.5 bg-teal-50 dark:bg-teal-950/40 rounded-xl shrink-0">
                                                    <GraduationCap className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                                                </div>
                                                {hasAnalysis ? (
                                                    <div className={`rounded-xl border px-3 py-1.5 text-right ${scoreBadgeStyle(faculty.score!)}`}>
                                                        <span className={`text-2xl font-black tabular-nums leading-none ${scoreColor(faculty.score!)}`}>{faculty.score}</span>
                                                        <span className="text-[10px] text-slate-400 ml-0.5">/100</span>
                                                    </div>
                                                ) : faculty.respondent_count !== undefined ? (
                                                    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-3 py-1.5 text-right">
                                                        <div className="text-2xl font-black tabular-nums leading-none text-slate-700 dark:text-slate-300">{faculty.respondent_count.toLocaleString()}</div>
                                                        <div className="text-[10px] text-slate-400">respondents</div>
                                                    </div>
                                                ) : null}
                                            </div>

                                            {/* Name + short name */}
                                            <div>
                                                <h3 className="font-bold text-slate-900 dark:text-slate-100 text-base leading-snug group-hover:text-teal-700 dark:group-hover:text-teal-400 transition-colors">
                                                    {faculty.name}
                                                </h3>
                                                {faculty.short_name && (
                                                    <Badge variant="secondary" className="text-[10px] mt-1.5 font-medium">{faculty.short_name}</Badge>
                                                )}
                                            </div>

                                            {/* Sentiment bar + stats */}
                                            {hasAnalysis && (
                                                <div className="space-y-2">
                                                    <SentimentBar positive={faculty.positive} neutral={faculty.neutral} negative={faculty.negative} />
                                                    <div className="flex items-center gap-2 text-[10px] font-semibold">
                                                        <span className="text-emerald-600 dark:text-emerald-400">{posPct}% pos</span>
                                                        <span className="text-slate-300 dark:text-slate-700">·</span>
                                                        <span className="text-red-500 dark:text-red-400">{negPct}% neg</span>
                                                        <span className="text-slate-300 dark:text-slate-700">·</span>
                                                        <span className="text-slate-400">{faculty.respondent_count?.toLocaleString() ?? 0} respondents</span>
                                                    </div>
                                                </div>
                                            )}

                                            {/* Respondent count row when no sentiment yet */}
                                            {!hasAnalysis && faculty.respondent_count !== undefined && (
                                                <div className="flex items-center gap-1.5 text-xs text-slate-400">
                                                    <Users className="w-3.5 h-3.5 shrink-0" />
                                                    <span>{faculty.respondent_count.toLocaleString()} respondents · No analysis yet</span>
                                                </div>
                                            )}

                                            {/* Description */}
                                            {faculty.description && (
                                                <p className="text-xs text-slate-400 dark:text-slate-500 line-clamp-2 leading-relaxed">
                                                    {faculty.description}
                                                </p>
                                            )}
                                        </div>

                                        {/* Footer */}
                                        <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
                                            <span className="text-xs font-semibold text-slate-400 group-hover:text-teal-600 dark:group-hover:text-teal-400 flex items-center gap-1 transition-colors">
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
