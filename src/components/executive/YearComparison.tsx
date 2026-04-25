"use client";

import { useState, useMemo, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, ReferenceLine, Legend,
} from "recharts";
import {
    TrendingUp, TrendingDown, Minus, AlertTriangle, Users, Activity,
    BarChart3, ChevronDown, ChevronRight, Sparkles, Target, Check,
    MapPin, Loader2,
} from "lucide-react";
import { Survey } from "@/types";

// ─── Constants ────────────────────────────────────────────────────────────────
const SURVEY_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

// ─── Types ───────────────────────────────────────────────────────────────────
interface UnitScore {
    unit_id: number; unit_name: string; short_name: string;
    positive: number; neutral: number; negative: number; total: number; score: number;
}
interface SurveyMetrics {
    overallScore: number; totalComments: number; totalRespondents: number;
    criticalIssues: number; unitScores: UnitScore[];
}
interface SurveyData {
    info: { id: number; title: string; year: number | null };
    metrics: SurveyMetrics;
    quantitative: Record<string, { sum: number; count: number }>;
    uphIndex: number | null;
    responseRates: { totalEnrollment: number; totalRespondents: number; responseRate: number } | null;
    campusParticipation: { campus: string; respondents: number }[];
}
interface CatCount { positive: number; negative: number; neutral: number; total: number; }
interface MultiUnitCategoryComparison {
    unit_id: number; unit_name: string; short_name: string;
    categories: { category_name: string; counts: CatCount[] }[];
}
interface MultiCompareData {
    surveys: SurveyData[];
    categoryComparison: MultiUnitCategoryComparison[];
}

// ─── Delta pill ───────────────────────────────────────────────────────────────
function Delta({ current, baseline, suffix = "", invert = false }: {
    current: number; baseline: number; suffix?: string; invert?: boolean;
}) {
    const delta = current - baseline;
    const isNeutral = Math.abs(delta) < 0.01;
    const isGood = invert ? delta < 0 : delta > 0;
    return (
        <span className={`inline-flex items-center gap-0.5 text-xs font-semibold px-2 py-0.5 rounded-full ${
            isNeutral ? 'bg-slate-100 text-slate-500'
            : isGood ? 'bg-emerald-100 text-emerald-700'
            : 'bg-red-100 text-red-700'
        }`}>
            {isNeutral ? <Minus className="w-3 h-3" /> : isGood ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {delta > 0 ? '+' : ''}{delta % 1 !== 0 ? delta.toFixed(1) : delta}{suffix}
        </span>
    );
}

// ─── Trend sparkline (SVG, no recharts dep) ───────────────────────────────────
function Sparkline({ values }: { values: (number | null)[] }) {
    const valid = values.filter((v): v is number => v !== null);
    if (valid.length < 2) return <span className="text-slate-300 dark:text-slate-600 text-xs italic">—</span>;

    const min = Math.min(...valid);
    const max = Math.max(...valid);
    const range = max - min || 1;
    const W = 56, H = 22, PAD = 2;

    const pts = values
        .map((v, i) => {
            if (v === null) return null;
            const x = PAD + (i / (values.length - 1)) * (W - PAD * 2);
            const y = PAD + (1 - (v - min) / range) * (H - PAD * 2);
            return `${x.toFixed(1)},${y.toFixed(1)}`;
        })
        .filter(Boolean)
        .join(' ');

    const last = valid[valid.length - 1];
    const first = valid[0];
    const color = Math.abs(last - first) < 0.5 ? '#94a3b8' : last > first ? '#10b981' : '#ef4444';

    return (
        <svg width={W} height={H} className="overflow-visible shrink-0">
            <polyline points={pts} fill="none" stroke={color} strokeWidth={1.75}
                strokeLinejoin="round" strokeLinecap="round" />
            <circle cx={parseFloat(pts.split(' ').pop()!.split(',')[0])}
                cy={parseFloat(pts.split(' ').pop()!.split(',')[1])}
                r={2.5} fill={color} />
        </svg>
    );
}

function scoreColorClass(score: number | null) {
    if (score === null) return "text-slate-300";
    if (score >= 70) return "text-emerald-700 font-bold";
    if (score >= 50) return "text-amber-700 font-bold";
    return "text-red-700 font-bold";
}
function scoreBgClass(score: number | null) {
    if (score === null) return "bg-slate-50";
    if (score >= 70) return "bg-emerald-50";
    if (score >= 50) return "bg-amber-50";
    return "bg-red-50";
}

// ─── Campus participation table (N surveys) ───────────────────────────────────
function CampusTable({ surveys, yearLabels }: { surveys: SurveyData[]; yearLabels: string[] }) {
    const allCampuses = [...new Set(surveys.flatMap(s => s.campusParticipation.map(c => c.campus)))];
    const rows = allCampuses.map(campus => ({
        campus,
        counts: surveys.map(s => s.campusParticipation.find(c => c.campus === campus)?.respondents || 0),
    })).sort((a, b) => b.counts.reduce((s, c) => s + c, 0) - a.counts.reduce((s, c) => s + c, 0));

    const maxCount = Math.max(...rows.flatMap(r => r.counts), 1);

    return (
        <div className="space-y-3">
            {rows.map(({ campus, counts }) => (
                <div key={campus} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-slate-700 truncate max-w-[200px]">
                            {campus.replace(/\s*\(.*?\)\s*/g, '')}
                        </span>
                        <div className="flex items-center gap-3">
                            {counts.map((count, i) => (
                                <span key={i} className="font-semibold text-[11px]" style={{ color: SURVEY_COLORS[i % SURVEY_COLORS.length] }}>
                                    {count.toLocaleString()}
                                </span>
                            ))}
                        </div>
                    </div>
                    <div className="flex flex-col gap-0.5">
                        {counts.map((count, i) => (
                            <div key={i} className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                <div
                                    className="h-full rounded-full transition-all duration-700"
                                    style={{ width: `${(count / maxCount) * 100}%`, backgroundColor: SURVEY_COLORS[i % SURVEY_COLORS.length] }}
                                />
                            </div>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function YearComparison({ surveys }: { surveys: Survey[] }) {
    const yearSurveys = surveys.filter(s => s.year).sort((a, b) => (a.year || 0) - (b.year || 0));

    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [data, setData] = useState<MultiCompareData | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'overview' | 'units' | 'categories'>('overview');
    const [expandedUnits, setExpandedUnits] = useState<Set<number>>(new Set());

    // Stable color per survey based on position in yearSurveys
    const colorOf = (id: string) => {
        const idx = yearSurveys.findIndex(s => s.id.toString() === id);
        return SURVEY_COLORS[Math.max(0, idx) % SURVEY_COLORS.length];
    };

    // Auto-select first and last on mount
    useEffect(() => {
        if (yearSurveys.length >= 2 && selectedIds.size === 0) {
            setSelectedIds(new Set([
                yearSurveys[0].id.toString(),
                yearSurveys[yearSurveys.length - 1].id.toString(),
            ]));
        }
    }, [yearSurveys.length]);

    const toggleSurvey = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
        setData(null);
    };

    const handleCompare = async () => {
        if (selectedIds.size < 2) return;
        const orderedIds = yearSurveys.filter(s => selectedIds.has(s.id.toString())).map(s => s.id);
        setLoading(true); setError(null);
        try {
            const res = await fetch(`/api/executive/compare?surveyIds=${orderedIds.join(',')}`);
            if (!res.ok) throw new Error("Failed to fetch comparison data");
            const json = await res.json();
            if (json.error) throw new Error(json.error);
            setData(json);
        } catch (e: any) { setError(e.message); }
        finally { setLoading(false); }
    };

    const toggleUnit = (uid: number) => setExpandedUnits(prev => {
        const next = new Set(prev);
        next.has(uid) ? next.delete(uid) : next.add(uid);
        return next;
    });

    // Year labels for chart axes / table headers
    const yearLabels = useMemo(() =>
        (data?.surveys || []).map((s, i) => s.info.year?.toString() || `Survey ${i + 1}`),
        [data]
    );

    // Quantitative satisfaction index per unit, one value per survey
    const quantChartData = useMemo(() => {
        if (!data) return [];
        const unitMap = new Map<number, Record<string, any>>();
        data.surveys.forEach((survey, i) => {
            const label = yearLabels[i];
            const nameMap = new Map(survey.metrics.unitScores.map(u => [u.unit_id, u.short_name || u.unit_name]));
            for (const [uid, entry] of Object.entries(survey.quantitative)) {
                const unitId = parseInt(uid);
                if (!unitMap.has(unitId)) unitMap.set(unitId, { name: nameMap.get(unitId) || `Unit ${uid}` });
                const e = entry as { sum: number; count: number };
                if (e.count > 0) unitMap.get(unitId)![label] = parseFloat((e.sum / e.count).toFixed(2));
            }
        });
        return Array.from(unitMap.values())
            .filter(u => yearLabels.some(y => u[y] != null))
            .sort((a, b) => a.name.localeCompare(b.name));
    }, [data, yearLabels]);

    // Sentiment score per unit per survey (for the units table)
    const unitsTableData = useMemo(() => {
        if (!data) return [];
        const unitMap = new Map<string, Record<string, any>>();
        data.surveys.forEach((survey, i) => {
            const label = yearLabels[i];
            for (const unit of survey.metrics.unitScores) {
                if (unit.total === 0) continue;
                if (!unitMap.has(unit.unit_name))
                    unitMap.set(unit.unit_name, { unit_name: unit.unit_name });
                unitMap.get(unit.unit_name)![label] = unit.score;
            }
        });
        const lastLabel = yearLabels[yearLabels.length - 1];
        return Array.from(unitMap.values())
            .sort((a, b) => (b[lastLabel] || 0) - (a[lastLabel] || 0));
    }, [data, yearLabels]);

    // Deltas first→last for insights & movers
    const scoreDeltas = useMemo(() => {
        if (!data || data.surveys.length < 2) return [];
        const first = data.surveys[0];
        const last = data.surveys[data.surveys.length - 1];
        const firstMap = new Map(first.metrics.unitScores.filter(u => u.total > 0).map(u => [u.unit_name, u.score]));
        const lastMap = new Map(last.metrics.unitScores.filter(u => u.total > 0).map(u => [u.unit_name, u.score]));
        const results: { unit_name: string; scoreFirst: number; scoreLast: number; delta: number }[] = [];
        for (const [name, scoreLast] of lastMap) {
            const scoreFirst = firstMap.get(name);
            if (scoreFirst !== undefined) results.push({ unit_name: name, scoreFirst, scoreLast, delta: scoreLast - scoreFirst });
        }
        return results.sort((a, b) => b.delta - a.delta);
    }, [data]);

    const topImproved = scoreDeltas.filter(d => d.delta > 0).slice(0, 3);
    const topDeclined = [...scoreDeltas].sort((a, b) => a.delta - b.delta).filter(d => d.delta < 0).slice(0, 3);

    if (yearSurveys.length < 2) {
        return (
            <div className="flex flex-col items-center justify-center py-24 text-center gap-4">
                <div className="p-4 bg-amber-50 dark:bg-amber-950/30 rounded-2xl">
                    <BarChart3 className="w-8 h-8 text-amber-500" />
                </div>
                <div>
                    <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-300">Year-on-Year Comparison</h3>
                    <p className="text-slate-500 text-sm max-w-sm mx-auto mt-1">
                        You need at least <strong>2 surveys</strong> with a <strong>year</strong> set.
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
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Select Surveys to Compare</p>
                <div className="flex flex-wrap gap-2 mb-4">
                    {yearSurveys.map(s => {
                        const isSelected = selectedIds.has(s.id.toString());
                        const color = colorOf(s.id.toString());
                        return (
                            <button
                                key={s.id}
                                onClick={() => toggleSurvey(s.id.toString())}
                                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium border-2 transition-all ${
                                    isSelected
                                        ? 'text-white shadow-sm'
                                        : 'bg-white dark:bg-slate-950 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-slate-300'
                                }`}
                                style={isSelected ? { backgroundColor: color, borderColor: color } : {}}
                            >
                                {isSelected && <Check className="w-3.5 h-3.5" />}
                                {s.title} {s.year && `(${s.year})`}
                            </button>
                        );
                    })}
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                    <Button
                        onClick={handleCompare}
                        disabled={selectedIds.size < 2 || loading}
                        className="bg-indigo-600 hover:bg-indigo-700"
                    >
                        {loading
                            ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            : <BarChart3 className="w-4 h-4 mr-2" />}
                        {selectedIds.size >= 2 ? `Compare ${selectedIds.size} Surveys` : 'Select 2+ surveys'}
                    </Button>
                    {selectedIds.size === 1 && (
                        <p className="text-sm text-amber-600 flex items-center gap-1">
                            <AlertTriangle className="w-3.5 h-3.5" /> Select at least one more
                        </p>
                    )}
                </div>
            </div>

            {/* ── LOADING ── */}
            {loading && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-36 rounded-2xl" />)}
                </div>
            )}

            {error && (
                <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm rounded-xl px-5 py-4">
                    Failed to load comparison: {error}
                </div>
            )}

            {/* ── RESULTS ── */}
            {data && !loading && (() => {
                const first = data.surveys[0];
                const last = data.surveys[data.surveys.length - 1];
                const yearA = first.info.year;
                const yearZ = last.info.year;

                return (
                    <div className="space-y-6 animate-in fade-in duration-500">

                        {/* Survey color legend */}
                        <div className="flex items-center gap-2 flex-wrap">
                            {data.surveys.map((s, i) => (
                                <span key={s.info.id} className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-sm font-medium text-white"
                                    style={{ backgroundColor: SURVEY_COLORS[i % SURVEY_COLORS.length] }}>
                                    {s.info.year || s.info.title}
                                </span>
                            ))}
                            <span className="text-slate-400 dark:text-slate-500 text-sm">{data.surveys.length}-survey comparison</span>
                        </div>

                        {/* ── HEADLINE METRICS (first vs last) ── */}
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                            {[
                                { label: "Satisfaction Index", icon: Target, iconBg: "bg-blue-100 text-blue-600", vA: first.uphIndex ?? 0, vZ: last.uphIndex ?? 0, fmt: (v: number) => v > 0 ? v.toFixed(2) : "N/A" },
                                { label: "Respondents", icon: Users, iconBg: "bg-emerald-100 text-emerald-600", vA: first.metrics.totalRespondents, vZ: last.metrics.totalRespondents },
                                { label: "Sentiment Score", icon: Activity, iconBg: "bg-violet-100 text-violet-600", vA: first.metrics.overallScore, vZ: last.metrics.overallScore, fmt: (v: number) => `${v}%` },
                                { label: "Issues Detected", icon: AlertTriangle, iconBg: "bg-red-100 text-red-600", vA: first.metrics.criticalIssues, vZ: last.metrics.criticalIssues, invert: true },
                            ].map(({ label, icon: Icon, iconBg, vA, vZ, fmt, invert }) => (
                                <div key={label} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-3 shadow-sm hover:shadow-md transition-shadow">
                                    <div className={`inline-flex p-2 rounded-xl ${iconBg}`}><Icon className="w-4 h-4" /></div>
                                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">{label}</p>
                                    <div className="flex items-end justify-between gap-2">
                                        <div>
                                            <p className="text-2xl font-black text-slate-900 dark:text-slate-100 leading-none">
                                                {fmt ? fmt(vZ) : vZ.toLocaleString()}
                                            </p>
                                            <p className="text-xs text-slate-400 mt-1">was {fmt ? fmt(vA) : vA.toLocaleString()} in {yearA}</p>
                                        </div>
                                        <Delta current={vZ} baseline={vA} invert={invert} />
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* ── KEY INSIGHTS STRIP ── */}
                        {scoreDeltas.length > 0 && (
                            <div className="bg-gradient-to-r from-slate-900 to-indigo-950 rounded-2xl p-5 text-white">
                                <div className="flex items-center gap-2 mb-4">
                                    <Sparkles className="w-4 h-4 text-amber-400" />
                                    <span className="text-sm font-semibold">{yearA} → {yearZ} Key Insights</span>
                                </div>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                    <div className="bg-white/10 rounded-xl p-3">
                                        <div className="text-2xl font-black text-emerald-400">{scoreDeltas.filter(d => d.delta > 0).length}</div>
                                        <div className="text-xs text-slate-300 mt-0.5">Units improved</div>
                                    </div>
                                    <div className="bg-white/10 rounded-xl p-3">
                                        <div className="text-2xl font-black text-red-400">{scoreDeltas.filter(d => d.delta < 0).length}</div>
                                        <div className="text-xs text-slate-300 mt-0.5">Units declined</div>
                                    </div>
                                    {topImproved[0] && (
                                        <div className="bg-white/10 rounded-xl p-3">
                                            <div className="text-sm font-bold text-emerald-300 truncate">▲ {topImproved[0].unit_name}</div>
                                            <div className="text-xs text-slate-300 mt-0.5">Biggest gain (+{topImproved[0].delta.toFixed(0)} pts)</div>
                                        </div>
                                    )}
                                    {topDeclined[0] && (
                                        <div className="bg-white/10 rounded-xl p-3">
                                            <div className="text-sm font-bold text-red-300 truncate">▼ {topDeclined[0].unit_name}</div>
                                            <div className="text-xs text-slate-300 mt-0.5">Biggest drop ({topDeclined[0].delta.toFixed(0)} pts)</div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* ── TABS ── */}
                        <div className="flex gap-1 bg-slate-100 dark:bg-slate-900 rounded-xl p-1 w-fit">
                            {(['overview', 'units', 'categories'] as const).map(tab => (
                                <button key={tab} onClick={() => setActiveTab(tab)}
                                    className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                                        activeTab === tab
                                            ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-sm'
                                            : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                                    }`}>
                                    {tab === 'overview' ? '📊 Overview' : tab === 'units' ? '🏫 Units' : '🗂️ Categories'}
                                </button>
                            ))}
                        </div>

                        {/* ── OVERVIEW TAB ── */}
                        {activeTab === 'overview' && (
                            <div className="space-y-6 animate-in fade-in duration-300">

                                {/* Biggest movers */}
                                {(topImproved.length > 0 || topDeclined.length > 0) && (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {topImproved.length > 0 && (
                                            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
                                                <div className="flex items-center gap-2 mb-3">
                                                    <TrendingUp className="w-4 h-4 text-emerald-600" />
                                                    <h3 className="font-semibold text-sm text-slate-800 dark:text-slate-200">Most Improved</h3>
                                                    <span className="text-xs text-slate-400">{yearA} → {yearZ}</span>
                                                </div>
                                                <div className="space-y-2">
                                                    {topImproved.map((u, i) => (
                                                        <div key={u.unit_name} className="flex items-center justify-between p-2.5 bg-emerald-50 dark:bg-emerald-950/20 rounded-xl">
                                                            <div className="flex items-center gap-2.5 min-w-0">
                                                                <span className="w-5 h-5 rounded-full bg-emerald-200 text-emerald-700 text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                                                                <span className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate">{u.unit_name}</span>
                                                            </div>
                                                            <div className="flex items-center gap-2 shrink-0 ml-2">
                                                                <span className="text-xs text-slate-400">{u.scoreFirst}→{u.scoreLast}</span>
                                                                <Delta current={u.scoreLast} baseline={u.scoreFirst} />
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        {topDeclined.length > 0 && (
                                            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
                                                <div className="flex items-center gap-2 mb-3">
                                                    <TrendingDown className="w-4 h-4 text-red-600" />
                                                    <h3 className="font-semibold text-sm text-slate-800 dark:text-slate-200">Most Declined</h3>
                                                    <span className="text-xs text-slate-400">{yearA} → {yearZ}</span>
                                                </div>
                                                <div className="space-y-2">
                                                    {topDeclined.map((u, i) => (
                                                        <div key={u.unit_name} className="flex items-center justify-between p-2.5 bg-red-50 dark:bg-red-950/20 rounded-xl">
                                                            <div className="flex items-center gap-2.5 min-w-0">
                                                                <span className="w-5 h-5 rounded-full bg-red-200 text-red-700 text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                                                                <span className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate">{u.unit_name}</span>
                                                            </div>
                                                            <div className="flex items-center gap-2 shrink-0 ml-2">
                                                                <span className="text-xs text-slate-400">{u.scoreFirst}→{u.scoreLast}</span>
                                                                <Delta current={u.scoreLast} baseline={u.scoreFirst} />
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Satisfaction index chart */}
                                {quantChartData.length > 0 ? (
                                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
                                        <div className="flex items-center gap-2 mb-5">
                                            <BarChart3 className="w-4 h-4 text-blue-600" />
                                            <h3 className="font-semibold text-slate-800 dark:text-slate-200 text-sm">Satisfaction Index per Unit (1–4 Scale)</h3>
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
                                                    <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                                                    <ReferenceLine y={2.5} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: 'Mid', position: 'insideRight', fontSize: 10, fill: '#f59e0b' }} />
                                                    {yearLabels.map((label, i) => (
                                                        <Bar key={label} dataKey={label} fill={SURVEY_COLORS[i % SURVEY_COLORS.length]} radius={[4, 4, 0, 0]} />
                                                    ))}
                                                </BarChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 text-center text-slate-400 text-sm italic shadow-sm">
                                        No quantitative satisfaction data available for these surveys.
                                    </div>
                                )}

                                {/* Campus participation */}
                                {first.campusParticipation.length > 0 && (
                                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
                                        <div className="flex items-center gap-2 mb-4">
                                            <MapPin className="w-4 h-4 text-sky-600" />
                                            <h3 className="font-semibold text-slate-800 dark:text-slate-200 text-sm">Campus Participation Across Surveys</h3>
                                        </div>
                                        <CampusTable surveys={data.surveys} yearLabels={yearLabels} />
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ── UNITS TAB ── */}
                        {activeTab === 'units' && (
                            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm animate-in fade-in duration-300">
                                <div className="flex items-center gap-2 mb-5">
                                    <Activity className="w-4 h-4 text-violet-600" />
                                    <h3 className="font-semibold text-slate-800 dark:text-slate-200 text-sm">Sentiment Score by Unit</h3>
                                    <span className="text-xs text-slate-400 ml-1">sorted by latest score · — = not yet analyzed</span>
                                </div>
                                {unitsTableData.length === 0 ? (
                                    <p className="text-sm text-slate-400 text-center py-8">No sentiment data available.</p>
                                ) : (
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm">
                                            <thead>
                                                <tr className="border-b border-slate-200 dark:border-slate-700">
                                                    <th className="text-left py-3 px-4 font-semibold text-slate-600 dark:text-slate-400 min-w-[160px]">Unit</th>
                                                    {yearLabels.map((label, i) => (
                                                        <th key={label} className="text-center py-3 px-4 font-semibold whitespace-nowrap"
                                                            style={{ color: SURVEY_COLORS[i % SURVEY_COLORS.length] }}>
                                                            {label}
                                                        </th>
                                                    ))}
                                                    {yearLabels.length >= 3 && (
                                                        <th className="text-center py-3 px-4 font-semibold text-slate-500 dark:text-slate-400">
                                                            Trajectory
                                                        </th>
                                                    )}
                                                    {yearLabels.length >= 2 && (
                                                        <th className="text-center py-3 px-4 font-semibold text-slate-500 dark:text-slate-400">
                                                            Trend
                                                        </th>
                                                    )}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {unitsTableData.map(unit => {
                                                    const firstScore: number | null = unit[yearLabels[0]] ?? null;
                                                    const lastScore: number | null = unit[yearLabels[yearLabels.length - 1]] ?? null;
                                                    return (
                                                        <tr key={unit.unit_name} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50/50 dark:hover:bg-slate-900/30 transition-colors">
                                                            <td className="py-3 px-4 font-medium text-slate-800 dark:text-slate-200">{unit.unit_name}</td>
                                                            {yearLabels.map(label => {
                                                                const score: number | null = unit[label] ?? null;
                                                                return (
                                                                    <td key={label} className="text-center py-3 px-4">
                                                                        {score !== null ? (
                                                                            <span className={`inline-block px-2.5 py-0.5 rounded-lg text-sm ${scoreColorClass(score)} ${scoreBgClass(score)}`}>
                                                                                {score}%
                                                                            </span>
                                                                        ) : (
                                                                            <span className="text-slate-300 dark:text-slate-600 text-xs italic">—</span>
                                                                        )}
                                                                    </td>
                                                                );
                                                            })}
                                                            {yearLabels.length >= 3 && (
                                                                <td className="text-center py-3 px-4">
                                                                    <div className="flex justify-center">
                                                                        <Sparkline values={yearLabels.map(y => unit[y] ?? null)} />
                                                                    </div>
                                                                </td>
                                                            )}
                                                            {yearLabels.length >= 2 && (
                                                                <td className="text-center py-3 px-4">
                                                                    {firstScore !== null && lastScore !== null
                                                                        ? <Delta current={lastScore} baseline={firstScore} suffix=" pts" />
                                                                        : <span className="text-slate-300 dark:text-slate-600 text-xs italic">—</span>
                                                                    }
                                                                </td>
                                                            )}
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                                <div className="flex items-center gap-4 mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500">
                                    <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-emerald-100 inline-block" />≥ 70% Good</span>
                                    <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-amber-100 inline-block" />50–69% Moderate</span>
                                    <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-red-100 inline-block" />&lt; 50% Needs attention</span>
                                </div>
                            </div>
                        )}

                        {/* ── CATEGORIES TAB ── */}
                        {activeTab === 'categories' && (
                            <div className="space-y-2 animate-in fade-in duration-300">
                                {data.categoryComparison.length === 0 ? (
                                    <div className="text-center py-12 text-slate-400 italic text-sm">
                                        No category data available for these surveys.
                                    </div>
                                ) : data.categoryComparison.map(unit => {
                                    const isExpanded = expandedUnits.has(unit.unit_id);
                                    return (
                                        <div key={unit.unit_id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
                                            <button
                                                onClick={() => toggleUnit(unit.unit_id)}
                                                className="w-full flex items-center justify-between p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors text-left"
                                            >
                                                <div className="flex items-center gap-3">
                                                    {isExpanded
                                                        ? <ChevronDown className="w-4 h-4 text-slate-400" />
                                                        : <ChevronRight className="w-4 h-4 text-slate-400" />}
                                                    <span className="font-semibold text-slate-800 dark:text-slate-200">{unit.unit_name}</span>
                                                    <Badge variant="outline" className="text-xs">{unit.categories.length} categories</Badge>
                                                </div>
                                            </button>

                                            {isExpanded && (
                                                <div className="border-t border-slate-100 dark:border-slate-800 px-4 pb-4 animate-in fade-in duration-200">
                                                    {/* Column headers */}
                                                    <div className="flex items-center gap-2 py-2 px-3 mt-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-100 dark:border-slate-800">
                                                        <span className="flex-1">Category</span>
                                                        {yearLabels.map((label, i) => (
                                                            <span key={label} className="w-28 text-center shrink-0" style={{ color: SURVEY_COLORS[i % SURVEY_COLORS.length] }}>
                                                                {label}
                                                            </span>
                                                        ))}
                                                    </div>

                                                    <div className="space-y-1.5 pt-2">
                                                        {unit.categories.map(cat => {
                                                            const activeIdx = cat.counts.map((c, i) => c.total > 0 ? i : -1).filter(i => i >= 0);
                                                            const onlyOne = activeIdx.length === 1;
                                                            const isNew = !onlyOne && activeIdx.length > 0 && activeIdx[0] > 0;
                                                            const isDropped = !onlyOne && activeIdx.length > 0 && !activeIdx.includes(cat.counts.length - 1);

                                                            return (
                                                                <div key={cat.category_name} className="flex items-start gap-2 p-3 rounded-xl bg-slate-50 dark:bg-slate-900/50">
                                                                    <div className="flex-1 min-w-0 pt-0.5">
                                                                        <div className="flex items-center gap-1.5 flex-wrap">
                                                                            <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">{cat.category_name}</span>
                                                                            {onlyOne && (
                                                                                <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-slate-500 border-slate-300">
                                                                                    Only in {yearLabels[activeIdx[0]]}
                                                                                </Badge>
                                                                            )}
                                                                            {isNew && (
                                                                                <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-emerald-600 border-emerald-300">
                                                                                    New in {yearLabels[activeIdx[0]]}
                                                                                </Badge>
                                                                            )}
                                                                            {isDropped && (
                                                                                <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-amber-600 border-amber-300">
                                                                                    Dropped after {yearLabels[activeIdx[activeIdx.length - 1]]}
                                                                                </Badge>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                    {cat.counts.map((count, i) => (
                                                                        <div key={i} className="w-28 shrink-0">
                                                                            {count.total === 0 ? (
                                                                                <div className="text-center text-slate-300 dark:text-slate-600 text-xs italic py-2">—</div>
                                                                            ) : (
                                                                                <div className="space-y-1">
                                                                                    <div className="text-center text-xs text-slate-500 font-medium">{count.total} segments</div>
                                                                                    <div className="h-2 rounded-full overflow-hidden flex bg-slate-200 dark:bg-slate-700">
                                                                                        <div className="h-full bg-emerald-500" style={{ width: `${(count.positive / count.total) * 100}%` }} title={`Positive: ${count.positive}`} />
                                                                                        <div className="h-full bg-slate-300 dark:bg-slate-500" style={{ width: `${(count.neutral / count.total) * 100}%` }} title={`Neutral: ${count.neutral}`} />
                                                                                        <div className="h-full bg-red-500" style={{ width: `${(count.negative / count.total) * 100}%` }} title={`Negative: ${count.negative}`} />
                                                                                    </div>
                                                                                    <div className="flex justify-between text-[10px]">
                                                                                        <span className="text-emerald-600">{Math.round(count.positive / count.total * 100)}%</span>
                                                                                        <span className="text-red-600">{Math.round(count.negative / count.total * 100)}%</span>
                                                                                    </div>
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    ))}
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
                );
            })()}
        </div>
    );
}
