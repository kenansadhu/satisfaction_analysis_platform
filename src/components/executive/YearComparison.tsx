"use client";

import { useState, useEffect, useMemo } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, ReferenceLine, Cell
} from "recharts";
import {
    TrendingUp, TrendingDown, Minus, ArrowRight,
    AlertTriangle, Users, Activity, BarChart3, MapPin,
    MessageSquare, ChevronDown, ChevronRight, Sparkles,
    ThumbsUp, ThumbsDown, Target
} from "lucide-react";
import { Survey } from "@/types";

// --- Types ---
interface ComparisonData {
    surveyA: SurveyData;
    surveyB: SurveyData;
    categoryComparison: UnitCategoryComparison[];
}

interface SurveyData {
    info: { id: number; title: string; year: number | null };
    metrics: { overallScore: number; totalComments: number; totalRespondents: number; criticalIssues: number; unitScores: UnitScore[] };
    quantitative: any;
    uphIndex: number | null;
    responseRates: { totalEnrollment: number; totalRespondents: number; responseRate: number } | null;
    campusParticipation: { campus: string; respondents: number }[];
}

interface UnitScore {
    unit_id: number; unit_name: string; short_name: string;
    positive: number; neutral: number; negative: number; total: number; score: number;
}

interface UnitCategoryComparison {
    unit_id: number; unit_name: string; short_name: string;
    categories: {
        category_name: string;
        countA: { positive: number; negative: number; neutral: number; total: number };
        countB: { positive: number; negative: number; neutral: number; total: number };
    }[];
}

// ─── Delta pill ───────────────────────────────────────────────────────────────
function Delta({ current, baseline, suffix = "", invert = false }: {
    current: number; baseline: number; suffix?: string; invert?: boolean;
}) {
    const delta = current - baseline;
    const pct = baseline > 0 ? ((delta / baseline) * 100) : 0;
    const isNeutral = Math.abs(delta) < 0.01;
    const isGood = invert ? delta < 0 : delta > 0;

    return (
        <span className={`inline-flex items-center gap-0.5 text-xs font-semibold px-2 py-0.5 rounded-full ${
            isNeutral ? 'bg-slate-100 text-slate-500 dark:bg-slate-800'
            : isGood ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400'
            : 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400'
        }`}>
            {isNeutral ? <Minus className="w-3 h-3" /> : isGood ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {delta > 0 ? '+' : ''}{typeof delta === 'number' && delta % 1 !== 0 ? delta.toFixed(2) : delta.toLocaleString()}{suffix}
            {baseline > 0 && <span className="font-normal opacity-70 ml-0.5">({pct > 0 ? '+' : ''}{pct.toFixed(1)}%)</span>}
        </span>
    );
}

// ─── Big headline metric ───────────────────────────────────────────────────────
function HeadlineMetric({ icon: Icon, iconBg, label, valueA, valueB, yearA, yearB, format, invert }: {
    icon: any; iconBg: string; label: string;
    valueA: number; valueB: number;
    yearA?: number | null; yearB?: number | null;
    format?: (v: number) => string; invert?: boolean;
}) {
    const fmt = format || ((v: number) => v.toLocaleString());
    return (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-3 shadow-sm hover:shadow-md transition-shadow">
            <div className={`inline-flex p-2 rounded-xl ${iconBg}`}>
                <Icon className="w-4 h-4" />
            </div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">{label}</p>
            <div className="flex items-end justify-between gap-2">
                <div>
                    <p className="text-2xl font-black text-slate-900 dark:text-slate-100 leading-none">{fmt(valueB)}</p>
                    <p className="text-xs text-slate-400 mt-1">was {fmt(valueA)} in {yearA}</p>
                </div>
                <Delta current={valueB} baseline={valueA} invert={invert} />
            </div>
        </div>
    );
}

export default function YearComparison({ surveys }: { surveys: Survey[] }) {
    const [surveyIdA, setSurveyIdA] = useState<string>("");
    const [surveyIdB, setSurveyIdB] = useState<string>("");
    const [data, setData] = useState<ComparisonData | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [expandedUnits, setExpandedUnits] = useState<Set<number>>(new Set());
    const [activeTab, setActiveTab] = useState<'overview' | 'units' | 'categories'>('overview');

    const yearSurveys = surveys.filter(s => s.year).sort((a, b) => (a.year || 0) - (b.year || 0));

    useEffect(() => {
        if (yearSurveys.length >= 2 && !surveyIdA && !surveyIdB) {
            setSurveyIdA(yearSurveys[0].id.toString());
            setSurveyIdB(yearSurveys[yearSurveys.length - 1].id.toString());
        }
    }, [yearSurveys.length]);

    useEffect(() => {
        if (!surveyIdA || !surveyIdB || surveyIdA === surveyIdB) return;
        const fetchComparison = async () => {
            setLoading(true); setError(null);
            try {
                const res = await fetch(`/api/executive/compare?surveyIdA=${surveyIdA}&surveyIdB=${surveyIdB}`);
                if (!res.ok) throw new Error("Failed to fetch");
                setData(await res.json());
            } catch (e: any) { setError(e.message); }
            finally { setLoading(false); }
        };
        fetchComparison();
    }, [surveyIdA, surveyIdB]);

    const toggleUnit = (unitId: number) => setExpandedUnits(prev => {
        const next = new Set(prev);
        next.has(unitId) ? next.delete(unitId) : next.add(unitId);
        return next;
    });

    // Chart data derived from API response
    const sentimentChartData = useMemo(() => {
        if (!data) return [];
        return buildSentimentShiftData(data.surveyA.metrics.unitScores, data.surveyB.metrics.unitScores)
            .filter(r => r.scoreA !== null || r.scoreB !== null)
            .sort((a, b) => (b.delta || 0) - (a.delta || 0));
    }, [data]);

    const quantChartData = useMemo(() => {
        if (!data) return [];
        return buildQuantChartData(data.surveyA.metrics.unitScores, data.surveyB.metrics.unitScores, data.surveyA.quantitative, data.surveyB.quantitative);
    }, [data]);

    const yearA = data?.surveyA.info.year;
    const yearB = data?.surveyB.info.year;

    if (yearSurveys.length < 2) {
        return (
            <div className="flex flex-col items-center justify-center py-24 text-center gap-4">
                <div className="p-4 bg-amber-50 dark:bg-amber-950/30 rounded-2xl">
                    <BarChart3 className="w-8 h-8 text-amber-500" />
                </div>
                <div>
                    <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-300">Year-on-Year Comparison</h3>
                    <p className="text-slate-500 text-sm max-w-sm mx-auto mt-1">
                        You need at least <strong>2 surveys</strong> with a <strong>year</strong> set to use this feature.
                        Go to <strong>Manage Survey</strong> to set years.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* ── SURVEY SELECTOR ── */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">Compare Surveys</p>
                <div className="flex flex-col sm:flex-row items-start sm:items-end gap-4">
                    <div className="flex-1 w-full">
                        <label className="text-xs font-medium text-slate-500 mb-1.5 block">📅 Baseline (Older)</label>
                        <Select value={surveyIdA} onValueChange={setSurveyIdA}>
                            <SelectTrigger className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-700">
                                <SelectValue placeholder="Select baseline..." />
                            </SelectTrigger>
                            <SelectContent>
                                {yearSurveys.map(s => (
                                    <SelectItem key={s.id} value={s.id.toString()}>{s.title} ({s.year})</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="flex items-center justify-center pb-1 sm:pb-2">
                        <div className="h-px w-8 bg-slate-300 dark:bg-slate-600 sm:hidden" />
                        <ArrowRight className="w-5 h-5 text-slate-400 hidden sm:block" />
                    </div>
                    <div className="flex-1 w-full">
                        <label className="text-xs font-medium text-slate-500 mb-1.5 block">📅 Current (Newer)</label>
                        <Select value={surveyIdB} onValueChange={setSurveyIdB}>
                            <SelectTrigger className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-700">
                                <SelectValue placeholder="Select current..." />
                            </SelectTrigger>
                            <SelectContent>
                                {yearSurveys.map(s => (
                                    <SelectItem key={s.id} value={s.id.toString()}>{s.title} ({s.year})</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
                {surveyIdA === surveyIdB && surveyIdA && (
                    <p className="text-amber-600 text-sm mt-3 flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4" /> Please select two different surveys.
                    </p>
                )}
            </div>

            {/* ── LOADING ── */}
            {loading && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[1,2,3,4].map(i => <Skeleton key={i} className="h-36 rounded-2xl" />)}
                </div>
            )}

            {error && (
                <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm rounded-xl px-5 py-4">
                    Failed to load comparison: {error}
                </div>
            )}

            {/* ── RESULTS ── */}
            {data && !loading && (
                <div className="space-y-6 animate-in fade-in duration-500">
                    {/* Year headlines */}
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Sparkles className="w-4 h-4 text-amber-500" />
                            <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                                {yearA} → {yearB} Comparison
                            </span>
                        </div>
                        {data.surveyA.responseRates && data.surveyB.responseRates && (
                            <Badge variant="outline" className="text-xs gap-1.5">
                                <Users className="w-3 h-3" />
                                Response rate: {data.surveyA.responseRates.responseRate}% → {data.surveyB.responseRates.responseRate}%
                                <Delta current={data.surveyB.responseRates.responseRate} baseline={data.surveyA.responseRates.responseRate} suffix="%" />
                            </Badge>
                        )}
                    </div>

                    {/* ── KEY METRICS ── */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        <HeadlineMetric
                            icon={Target} iconBg="bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-400"
                            label="UPH Index" yearA={yearA} yearB={yearB}
                            valueA={data.surveyA.uphIndex ?? 0} valueB={data.surveyB.uphIndex ?? 0}
                            format={v => v > 0 ? v.toFixed(2) : "N/A"}
                        />
                        <HeadlineMetric
                            icon={Users} iconBg="bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400"
                            label="Respondents" yearA={yearA} yearB={yearB}
                            valueA={data.surveyA.metrics.totalRespondents} valueB={data.surveyB.metrics.totalRespondents}
                        />
                        <HeadlineMetric
                            icon={Activity} iconBg="bg-violet-100 text-violet-600 dark:bg-violet-950 dark:text-violet-400"
                            label="Sentiment Score" yearA={yearA} yearB={yearB}
                            valueA={data.surveyA.metrics.overallScore} valueB={data.surveyB.metrics.overallScore}
                            format={v => `${v}%`}
                        />
                        <HeadlineMetric
                            icon={AlertTriangle} iconBg="bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-400"
                            label="Issues Detected" yearA={yearA} yearB={yearB}
                            valueA={data.surveyA.metrics.criticalIssues} valueB={data.surveyB.metrics.criticalIssues}
                            invert
                        />
                    </div>

                    {/* ── TABS ── */}
                    <div className="flex gap-1 bg-slate-100 dark:bg-slate-900 rounded-xl p-1 w-fit">
                        {(['overview', 'units', 'categories'] as const).map(tab => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                                    activeTab === tab
                                        ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-sm'
                                        : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                                }`}
                            >
                                {tab === 'overview' ? '📊 Overview' : tab === 'units' ? '🏫 Units' : '🗂️ Categories'}
                            </button>
                        ))}
                    </div>

                    {/* ── OVERVIEW TAB ── */}
                    {activeTab === 'overview' && (
                        <div className="space-y-6 animate-in fade-in duration-300">
                            {/* UPH Index chart */}
                            {quantChartData.length > 0 && (
                                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
                                    <div className="flex items-center gap-2 mb-5">
                                        <BarChart3 className="w-4 h-4 text-blue-600" />
                                        <h3 className="font-semibold text-slate-800 dark:text-slate-200 text-sm">UPH Index per Unit (1–4 Scale)</h3>
                                    </div>
                                    <div className="h-72">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={quantChartData} margin={{ top: 10, right: 10, left: -20, bottom: 50 }}>
                                                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                                                <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#64748b" }} angle={-35} textAnchor="end" height={60} />
                                                <YAxis domain={[0, 4]} tick={{ fontSize: 11, fill: "#94a3b8" }} />
                                                <Tooltip
                                                    contentStyle={{ borderRadius: 10, border: 'none', boxShadow: '0 4px 24px rgba(0,0,0,0.12)', fontSize: 12 }}
                                                    formatter={(v: any) => [Number(v).toFixed(2), undefined]}
                                                />
                                                <ReferenceLine y={2.5} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: 'Avg', position: 'insideRight', fontSize: 10, fill: '#f59e0b' }} />
                                                <Bar dataKey="baseline" name={`${yearA || 'Baseline'}`} fill="#cbd5e1" radius={[4,4,0,0]} />
                                                <Bar dataKey="current" name={`${yearB || 'Current'}`} fill="#6366f1" radius={[4,4,0,0]} />
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                    <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
                                        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-slate-300 inline-block" />{yearA}</span>
                                        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-indigo-500 inline-block" />{yearB}</span>
                                    </div>
                                </div>
                            )}

                            {/* Campus participation */}
                            {data.surveyA.campusParticipation?.length > 0 && (
                                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
                                    <div className="flex items-center gap-2 mb-4">
                                        <MapPin className="w-4 h-4 text-sky-600" />
                                        <h3 className="font-semibold text-slate-800 dark:text-slate-200 text-sm">Campus Participation Shift</h3>
                                    </div>
                                    <div className="space-y-3">
                                        {buildCampusComparison(data.surveyA.campusParticipation, data.surveyB.campusParticipation).map(row => {
                                            const maxVal = Math.max(row.countA, row.countB, 1);
                                            return (
                                                <div key={row.campus} className="space-y-1">
                                                    <div className="flex items-center justify-between text-xs">
                                                        <span className="font-medium text-slate-700 dark:text-slate-300 truncate max-w-[200px]">{row.campus.replace(/\s*\(.*?\)\s*/g, '')}</span>
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-slate-400">{row.countA.toLocaleString()} → {row.countB.toLocaleString()}</span>
                                                            <Delta current={row.countB} baseline={row.countA} />
                                                        </div>
                                                    </div>
                                                    <div className="flex gap-1">
                                                        <div className="flex-1 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                                            <div className="h-full bg-slate-400 rounded-full transition-all duration-700" style={{ width: `${(row.countA / maxVal) * 100}%` }} />
                                                        </div>
                                                        <div className="flex-1 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                                            <div className="h-full bg-indigo-500 rounded-full transition-all duration-700" style={{ width: `${(row.countB / maxVal) * 100}%` }} />
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

                    {/* ── UNITS TAB ── */}
                    {activeTab === 'units' && (
                        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm animate-in fade-in duration-300">
                            <div className="flex items-center gap-2 mb-5">
                                <Activity className="w-4 h-4 text-violet-600" />
                                <h3 className="font-semibold text-slate-800 dark:text-slate-200 text-sm">Sentiment Shift by Unit</h3>
                            </div>
                            {sentimentChartData.length === 0 ? (
                                <p className="text-sm text-slate-400 text-center py-8">No sentiment data available for comparison.</p>
                            ) : (
                                <div className="h-[360px]">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={sentimentChartData} layout="vertical" margin={{ top: 0, right: 60, left: 0, bottom: 0 }}>
                                            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                                            <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={v => `${v}%`} />
                                            <YAxis type="category" dataKey="unit_name" tick={{ fontSize: 10, fill: '#64748b' }} width={110} />
                                            <Tooltip
                                                contentStyle={{ borderRadius: 10, border: 'none', boxShadow: '0 4px 24px rgba(0,0,0,0.12)', fontSize: 12 }}
                                                formatter={(v: any) => [`${v}%`, undefined]}
                                            />
                                            <ReferenceLine x={50} stroke="#e2e8f0" strokeDasharray="3 3" />
                                            <Bar dataKey="scoreA" name={`${yearA}`} fill="#cbd5e1" radius={[0,4,4,0]} />
                                            <Bar dataKey="scoreB" name={`${yearB}`} radius={[0,4,4,0]}>
                                                {sentimentChartData.map((entry: any, index: number) => (
                                                    <Cell key={index} fill={
                                                        entry.delta === null ? '#6366f1'
                                                        : entry.delta > 0 ? '#10b981'
                                                        : entry.delta < 0 ? '#ef4444'
                                                        : '#6366f1'
                                                    } />
                                                ))}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            )}
                            <div className="flex items-center gap-4 mt-3 text-xs text-slate-500">
                                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-slate-300 inline-block" />{yearA}</span>
                                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-emerald-500 inline-block" />{yearB} Improved</span>
                                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-red-500 inline-block" />{yearB} Declined</span>
                            </div>
                        </div>
                    )}

                    {/* ── CATEGORIES TAB ── */}
                    {activeTab === 'categories' && data.categoryComparison?.length > 0 && (
                        <div className="space-y-2 animate-in fade-in duration-300">
                            {data.categoryComparison.map(unit => {
                                const isExpanded = expandedUnits.has(unit.unit_id);
                                const totalDelta = unit.categories.reduce((sum, cat) => sum + (cat.countB.total - cat.countA.total), 0);
                                return (
                                    <div key={unit.unit_id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
                                        <button
                                            onClick={() => toggleUnit(unit.unit_id)}
                                            className="w-full flex items-center justify-between p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors text-left"
                                        >
                                            <div className="flex items-center gap-3">
                                                {isExpanded ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                                                <span className="font-semibold text-slate-800 dark:text-slate-200">{unit.unit_name}</span>
                                                <Badge variant="outline" className="text-xs">{unit.categories.length} categories</Badge>
                                            </div>
                                            <div className="flex items-center gap-2 text-xs text-slate-400">
                                                Volume change:
                                                <Delta current={unit.categories.reduce((s, c) => s + c.countB.total, 0)} baseline={unit.categories.reduce((s, c) => s + c.countA.total, 0)} />
                                            </div>
                                        </button>

                                        {isExpanded && (
                                            <div className="border-t border-slate-100 dark:border-slate-800 px-4 pb-4 animate-in fade-in duration-200">
                                                <div className="space-y-3 pt-3">
                                                    {unit.categories.map(cat => {
                                                        const volDelta = cat.countB.total - cat.countA.total;
                                                        const posPctA = cat.countA.total > 0 ? Math.round(cat.countA.positive / cat.countA.total * 100) : 0;
                                                        const posPctB = cat.countB.total > 0 ? Math.round(cat.countB.positive / cat.countB.total * 100) : 0;
                                                        const negPctA = cat.countA.total > 0 ? Math.round(cat.countA.negative / cat.countA.total * 100) : 0;
                                                        const negPctB = cat.countB.total > 0 ? Math.round(cat.countB.negative / cat.countB.total * 100) : 0;
                                                        return (
                                                            <div key={cat.category_name} className="p-3 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-100 dark:border-slate-800">
                                                                <div className="flex items-center justify-between mb-2">
                                                                    <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">{cat.category_name}</span>
                                                                    <div className="flex items-center gap-1.5 text-xs text-slate-400">
                                                                        {cat.countA.total} → <span className="font-bold text-slate-700 dark:text-slate-200">{cat.countB.total}</span>
                                                                        <Delta current={cat.countB.total} baseline={cat.countA.total} />
                                                                    </div>
                                                                </div>
                                                                <div className="grid grid-cols-2 gap-3">
                                                                    <div className="flex items-center gap-2 text-xs">
                                                                        <ThumbsUp className="w-3 h-3 text-emerald-500 shrink-0" />
                                                                        <span className="text-slate-400">Positive:</span>
                                                                        <span className="text-slate-600 dark:text-slate-300">{posPctA}%</span>
                                                                        <ArrowRight className="w-3 h-3 text-slate-300" />
                                                                        <span className={`font-bold ${posPctB > posPctA ? 'text-emerald-600' : posPctB < posPctA ? 'text-red-600' : 'text-slate-600'}`}>{posPctB}%</span>
                                                                    </div>
                                                                    <div className="flex items-center gap-2 text-xs">
                                                                        <ThumbsDown className="w-3 h-3 text-red-500 shrink-0" />
                                                                        <span className="text-slate-400">Negative:</span>
                                                                        <span className="text-slate-600 dark:text-slate-300">{negPctA}%</span>
                                                                        <ArrowRight className="w-3 h-3 text-slate-300" />
                                                                        <span className={`font-bold ${negPctB < negPctA ? 'text-emerald-600' : negPctB > negPctA ? 'text-red-600' : 'text-slate-600'}`}>{negPctB}%</span>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}

                </div>
            )}
        </div>
    );
}

// ─── Data helpers ──────────────────────────────────────────────────────────────

function buildQuantChartData(unitsA: UnitScore[], unitsB: UnitScore[], quantMapA: any, quantMapB: any) {
    const allUnits = new Map<number, { name: string; baseline: number; current: number }>();
    for (const u of unitsA) allUnits.set(u.unit_id, { name: u.short_name || u.unit_name, baseline: 0, current: 0 });
    for (const u of unitsB) if (!allUnits.has(u.unit_id)) allUnits.set(u.unit_id, { name: u.short_name || u.unit_name, baseline: 0, current: 0 });

    if (quantMapA && typeof quantMapA === 'object') {
        for (const [key, val] of Object.entries(quantMapA)) {
            const uid = parseInt(key);
            const entry = val as { sum: number; count: number };
            if (allUnits.has(uid) && entry.count > 0) allUnits.get(uid)!.baseline = parseFloat((entry.sum / entry.count).toFixed(2));
        }
    }
    if (quantMapB && typeof quantMapB === 'object') {
        for (const [key, val] of Object.entries(quantMapB)) {
            const uid = parseInt(key);
            const entry = val as { sum: number; count: number };
            if (allUnits.has(uid) && entry.count > 0) allUnits.get(uid)!.current = parseFloat((entry.sum / entry.count).toFixed(2));
        }
    }

    return Array.from(allUnits.values()).filter(u => u.baseline > 0 || u.current > 0).sort((a, b) => a.name.localeCompare(b.name));
}

function buildSentimentShiftData(scoresA: UnitScore[], scoresB: UnitScore[]) {
    const allUnits = new Map<string, { unit_name: string; scoreA: number | null; scoreB: number | null; delta: number | null }>();
    for (const u of scoresA) allUnits.set(u.unit_name, { unit_name: u.unit_name, scoreA: u.score, scoreB: null, delta: null });
    for (const u of scoresB) {
        const existing = allUnits.get(u.unit_name);
        if (existing) { existing.scoreB = u.score; existing.delta = existing.scoreA !== null ? u.score - existing.scoreA : null; }
        else allUnits.set(u.unit_name, { unit_name: u.unit_name, scoreA: null, scoreB: u.score, delta: null });
    }
    return Array.from(allUnits.values()).sort((a, b) => b.unit_name.localeCompare(a.unit_name));
}

function buildCampusComparison(campusA: { campus: string; respondents: number }[], campusB: { campus: string; respondents: number }[]) {
    const all = new Map<string, { campus: string; countA: number; countB: number }>();
    for (const c of campusA || []) all.set(c.campus, { campus: c.campus, countA: c.respondents, countB: 0 });
    for (const c of campusB || []) {
        const ex = all.get(c.campus);
        if (ex) ex.countB = c.respondents; else all.set(c.campus, { campus: c.campus, countA: 0, countB: c.respondents });
    }
    return Array.from(all.values()).sort((a, b) => (b.countA + b.countB) - (a.countA + a.countB));
}
