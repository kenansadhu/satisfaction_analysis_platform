"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, Legend, RadarChart, Radar, PolarGrid,
    PolarAngleAxis, PolarRadiusAxis
} from "recharts";
import {
    TrendingUp, TrendingDown, Minus, ArrowRight,
    AlertTriangle, Users, Activity, BarChart3, MapPin,
    ThumbsUp, ThumbsDown, ChevronDown, ChevronRight,
    Target, MessageSquare
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
    metrics: {
        overallScore: number;
        totalComments: number;
        totalRespondents: number;
        criticalIssues: number;
        unitScores: UnitScore[];
    };
    quantitative: Map<number, { sum: number; count: number }>;
    uphIndex: number | null;
    responseRates: { totalEnrollment: number; totalRespondents: number; responseRate: number } | null;
    campusParticipation: { campus: string; respondents: number }[];
}

interface UnitScore {
    unit_id: number;
    unit_name: string;
    short_name: string;
    positive: number;
    neutral: number;
    negative: number;
    total: number;
    score: number;
}

interface UnitCategoryComparison {
    unit_id: number;
    unit_name: string;
    short_name: string;
    categories: {
        category_name: string;
        countA: { positive: number; negative: number; neutral: number; total: number };
        countB: { positive: number; negative: number; neutral: number; total: number };
    }[];
}

export default function YearComparison({ surveys }: { surveys: Survey[] }) {
    const [surveyIdA, setSurveyIdA] = useState<string>("");
    const [surveyIdB, setSurveyIdB] = useState<string>("");
    const [data, setData] = useState<ComparisonData | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [expandedUnits, setExpandedUnits] = useState<Set<number>>(new Set());

    const yearSurveys = surveys
        .filter(s => s.year)
        .sort((a, b) => (a.year || 0) - (b.year || 0));

    useEffect(() => {
        if (yearSurveys.length >= 2 && !surveyIdA && !surveyIdB) {
            setSurveyIdA(yearSurveys[0].id.toString());
            setSurveyIdB(yearSurveys[yearSurveys.length - 1].id.toString());
        }
    }, [yearSurveys.length]);

    useEffect(() => {
        if (!surveyIdA || !surveyIdB || surveyIdA === surveyIdB) return;

        const fetchComparison = async () => {
            setLoading(true);
            setError(null);
            try {
                const res = await fetch(`/api/executive/compare?surveyIdA=${surveyIdA}&surveyIdB=${surveyIdB}`);
                if (!res.ok) throw new Error("Failed to fetch");
                const json = await res.json();
                setData(json);
            } catch (e: any) {
                setError(e.message);
            } finally {
                setLoading(false);
            }
        };
        fetchComparison();
    }, [surveyIdA, surveyIdB]);

    const toggleUnit = (unitId: number) => {
        setExpandedUnits(prev => {
            const next = new Set(prev);
            if (next.has(unitId)) next.delete(unitId);
            else next.add(unitId);
            return next;
        });
    };

    // Helper: Short campus name
    const shortCampus = (c: string) => c?.replace(/\s*\(.*?\)\s*/g, '') || c;

    // Helper: Delta display
    const DeltaIndicator = ({ current, baseline, suffix = "", isScore = false, showPct = true }: {
        current: number; baseline: number; suffix?: string; isScore?: boolean; showPct?: boolean;
    }) => {
        const delta = current - baseline;
        const pctChange = baseline > 0 ? ((delta / baseline) * 100) : 0;
        const isPositive = isScore ? delta > 0 : delta > 0;
        const isNeutral = Math.abs(delta) < 0.005;

        return (
            <div className="flex items-center gap-1.5">
                {isNeutral ? (
                    <Minus className="w-4 h-4 text-slate-400" />
                ) : isPositive ? (
                    <TrendingUp className="w-4 h-4 text-green-600" />
                ) : (
                    <TrendingDown className="w-4 h-4 text-red-600" />
                )}
                <span className={`text-sm font-semibold ${isNeutral ? "text-slate-500" : isPositive ? "text-green-600" : "text-red-600"}`}>
                    {delta > 0 ? "+" : ""}{typeof delta === "number" && delta % 1 !== 0 ? delta.toFixed(2) : delta.toLocaleString()}{suffix}
                    {showPct && baseline > 0 && (
                        <span className="text-xs font-normal ml-1">
                            ({pctChange > 0 ? "+" : ""}{pctChange.toFixed(1)}%)
                        </span>
                    )}
                </span>
            </div>
        );
    };

    // --- Metric Card ---
    const MetricCompareCard = ({ title, icon: Icon, valueA, valueB, suffix = "", isScore = false, iconColor = "text-blue-600", format }: {
        title: string; icon: any; valueA: number; valueB: number; suffix?: string; isScore?: boolean; iconColor?: string;
        format?: (v: number) => string;
    }) => {
        const fmt = format || ((v: number) => `${v.toLocaleString()}${suffix}`);
        return (
            <Card className="border-slate-200 dark:border-slate-800 shadow-sm">
                <CardContent className="p-5">
                    <div className="flex items-center gap-2 mb-4">
                        <Icon className={`w-4 h-4 ${iconColor}`} />
                        <span className="text-sm font-medium text-slate-600 dark:text-slate-400">{title}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 items-end">
                        <div>
                            <div className="text-xs text-slate-400 mb-1">Baseline</div>
                            <div className="text-lg font-bold text-slate-700 dark:text-slate-300">{fmt(valueA)}</div>
                        </div>
                        <div className="text-center">
                            <ArrowRight className="w-4 h-4 text-slate-300 mx-auto mb-1" />
                            <DeltaIndicator current={valueB} baseline={valueA} suffix={suffix} isScore={isScore} />
                        </div>
                        <div className="text-right">
                            <div className="text-xs text-slate-400 mb-1">Current</div>
                            <div className="text-lg font-bold text-slate-900 dark:text-slate-100">{fmt(valueB)}</div>
                        </div>
                    </div>
                </CardContent>
            </Card>
        );
    };

    // No surveys with year set
    if (yearSurveys.length < 2) {
        return (
            <Card className="border-slate-200 dark:border-slate-800">
                <CardContent className="py-16 text-center">
                    <BarChart3 className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-300 mb-2">
                        Year-on-Year Comparison
                    </h3>
                    <p className="text-slate-500 text-sm max-w-md mx-auto mb-4">
                        You need at least 2 surveys with a <strong>year</strong> assigned to use this feature.
                        Go to <strong>Manage Survey</strong> to set the year for your surveys.
                    </p>
                </CardContent>
            </Card>
        );
    }

    const yearA = data?.surveyA?.info?.year;
    const yearB = data?.surveyB?.info?.year;

    return (
        <div className="space-y-6">
            {/* Survey Selectors */}
            <Card className="border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                <div className="h-1 bg-gradient-to-r from-amber-500 to-orange-500" />
                <CardContent className="p-6">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                        <div className="flex-1 w-full">
                            <label className="text-xs font-medium text-slate-500 mb-1.5 block">Baseline (Older)</label>
                            <Select value={surveyIdA} onValueChange={setSurveyIdA}>
                                <SelectTrigger className="bg-white dark:bg-slate-900">
                                    <SelectValue placeholder="Select baseline survey..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {yearSurveys.map(s => (
                                        <SelectItem key={s.id} value={s.id.toString()}>
                                            {s.title} ({s.year})
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="flex items-center justify-center pt-5">
                            <ArrowRight className="w-5 h-5 text-slate-400" />
                        </div>
                        <div className="flex-1 w-full">
                            <label className="text-xs font-medium text-slate-500 mb-1.5 block">Current (Newer)</label>
                            <Select value={surveyIdB} onValueChange={setSurveyIdB}>
                                <SelectTrigger className="bg-white dark:bg-slate-900">
                                    <SelectValue placeholder="Select current survey..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {yearSurveys.map(s => (
                                        <SelectItem key={s.id} value={s.id.toString()}>
                                            {s.title} ({s.year})
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    {surveyIdA === surveyIdB && surveyIdA && (
                        <p className="text-amber-600 text-sm mt-3 flex items-center gap-1.5">
                            <AlertTriangle className="w-4 h-4" /> Please select two different surveys to compare.
                        </p>
                    )}
                </CardContent>
            </Card>

            {/* Loading */}
            {loading && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-32 w-full rounded-xl" />)}
                </div>
            )}

            {/* Error */}
            {error && (
                <Card className="border-red-200 bg-red-50">
                    <CardContent className="py-4 text-red-700 text-sm">
                        Failed to load comparison: {error}
                    </CardContent>
                </Card>
            )}

            {/* === COMPARISON RESULTS === */}
            {data && !loading && (
                <div className="space-y-6 animate-in fade-in duration-500">

                    {/* ──── SECTION 1: KEY METRIC DELTAS ──── */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <MetricCompareCard
                            title="UPH Index"
                            icon={Target}
                            valueA={data.surveyA.uphIndex ?? 0}
                            valueB={data.surveyB.uphIndex ?? 0}
                            isScore={true}
                            iconColor="text-blue-600"
                            format={(v) => v > 0 ? v.toFixed(2) : "N/A"}
                        />
                        <MetricCompareCard
                            title="Total Respondents"
                            icon={Users}
                            valueA={data.surveyA.metrics.totalRespondents}
                            valueB={data.surveyB.metrics.totalRespondents}
                            iconColor="text-emerald-600"
                        />
                        <MetricCompareCard
                            title="Sentiment Score"
                            icon={Activity}
                            valueA={data.surveyA.metrics.overallScore}
                            valueB={data.surveyB.metrics.overallScore}
                            suffix="%"
                            isScore={true}
                            iconColor="text-violet-600"
                        />
                        <MetricCompareCard
                            title="Issues Detected"
                            icon={AlertTriangle}
                            valueA={data.surveyA.metrics.criticalIssues}
                            valueB={data.surveyB.metrics.criticalIssues}
                            iconColor="text-red-600"
                        />
                    </div>

                    {/* ──── SECTION 2: RESPONSE RATE ──── */}
                    {(data.surveyA.responseRates || data.surveyB.responseRates) && (
                        <Card className="border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                            <div className="h-1 bg-gradient-to-r from-emerald-500 to-teal-500" />
                            <CardHeader className="pb-2">
                                <CardTitle className="flex items-center gap-2 text-base">
                                    <Users className="w-5 h-5 text-emerald-600" /> Response Rate Comparison
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                    {data.surveyA.responseRates && (
                                        <div className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl">
                                            <div className="text-xs text-slate-400 mb-1">Baseline ({yearA})</div>
                                            <div className="text-2xl font-bold text-slate-800 dark:text-slate-200">
                                                {data.surveyA.responseRates.responseRate}%
                                            </div>
                                            <div className="text-xs text-slate-500 mt-1">
                                                {data.surveyA.responseRates.totalRespondents.toLocaleString()} / {data.surveyA.responseRates.totalEnrollment.toLocaleString()} students
                                            </div>
                                        </div>
                                    )}
                                    {data.surveyA.responseRates && data.surveyB.responseRates && (
                                        <div className="flex items-center justify-center">
                                            <DeltaIndicator
                                                current={data.surveyB.responseRates.responseRate}
                                                baseline={data.surveyA.responseRates.responseRate}
                                                suffix="%"
                                                isScore={true}
                                            />
                                        </div>
                                    )}
                                    {data.surveyB.responseRates && (
                                        <div className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl">
                                            <div className="text-xs text-slate-400 mb-1">Current ({yearB})</div>
                                            <div className="text-2xl font-bold text-slate-800 dark:text-slate-200">
                                                {data.surveyB.responseRates.responseRate}%
                                            </div>
                                            <div className="text-xs text-slate-500 mt-1">
                                                {data.surveyB.responseRates.totalRespondents.toLocaleString()} / {data.surveyB.responseRates.totalEnrollment.toLocaleString()} students
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {/* ──── SECTION 3: CAMPUS PARTICIPATION SHIFT ──── */}
                    {data.surveyA.campusParticipation?.length > 0 && (
                        <Card className="border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                            <div className="h-1 bg-gradient-to-r from-blue-500 to-cyan-500" />
                            <CardHeader className="pb-2">
                                <CardTitle className="flex items-center gap-2 text-base">
                                    <MapPin className="w-5 h-5 text-blue-600" /> Campus Participation Shift
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="border-b border-slate-200 dark:border-slate-700">
                                                <th className="text-left py-2.5 px-4 font-medium text-slate-500">Campus</th>
                                                <th className="text-center py-2.5 px-4 font-medium text-slate-500">{yearA}</th>
                                                <th className="text-center py-2.5 px-4 font-medium text-slate-500">{yearB}</th>
                                                <th className="text-center py-2.5 px-4 font-medium text-slate-500">Change</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {buildCampusComparison(data.surveyA.campusParticipation, data.surveyB.campusParticipation).map(row => (
                                                <tr key={row.campus} className="border-b border-slate-100 dark:border-slate-800">
                                                    <td className="py-2.5 px-4 font-medium text-slate-700 dark:text-slate-300">{shortCampus(row.campus)}</td>
                                                    <td className="text-center py-2.5 px-4">{row.countA.toLocaleString()}</td>
                                                    <td className="text-center py-2.5 px-4 font-semibold">{row.countB.toLocaleString()}</td>
                                                    <td className="text-center py-2.5 px-4">
                                                        <DeltaIndicator current={row.countB} baseline={row.countA} isScore={true} />
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {/* ──── SECTION 4: UPH INDEX PER UNIT (BAR CHART) ──── */}
                    <Card className="border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                        <div className="h-1 bg-gradient-to-r from-blue-500 to-indigo-500" />
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-base">
                                <BarChart3 className="w-5 h-5 text-blue-600" /> UPH Index per Unit (1–4 Scale)
                            </CardTitle>
                            <CardDescription>Satisfaction index comparison across both survey periods.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="h-[400px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart
                                        data={buildQuantChartData(data.surveyA.metrics.unitScores, data.surveyB.metrics.unitScores, data.surveyA.quantitative, data.surveyB.quantitative)}
                                        margin={{ top: 20, right: 30, left: 0, bottom: 40 }}
                                    >
                                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                        <XAxis
                                            dataKey="name"
                                            tick={{ fontSize: 11, fill: "#64748b" }}
                                            angle={-35}
                                            textAnchor="end"
                                            height={60}
                                        />
                                        <YAxis domain={[0, 4]} tick={{ fontSize: 12 }} />
                                        <Tooltip
                                            contentStyle={{
                                                borderRadius: '8px',
                                                border: 'none',
                                                boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                                                fontSize: '12px'
                                            }}
                                        />
                                        <Legend />
                                        <Bar
                                            dataKey="baseline"
                                            name={yearA ? `${yearA}` : "Baseline"}
                                            fill="#94a3b8"
                                            radius={[4, 4, 0, 0]}
                                        />
                                        <Bar
                                            dataKey="current"
                                            name={yearB ? `${yearB}` : "Current"}
                                            fill="#3b82f6"
                                            radius={[4, 4, 0, 0]}
                                        />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </CardContent>
                    </Card>

                    {/* ──── SECTION 5: SENTIMENT SHIFT BY UNIT TABLE ──── */}
                    <Card className="border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                        <div className="h-1 bg-gradient-to-r from-violet-500 to-purple-500" />
                        <CardHeader>
                            <CardTitle className="text-base">Sentiment Shift by Unit</CardTitle>
                            <CardDescription>How each unit's sentiment score changed between periods.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-slate-200 dark:border-slate-700">
                                            <th className="text-left py-3 px-4 font-medium text-slate-500">Unit</th>
                                            <th className="text-center py-3 px-4 font-medium text-slate-500">
                                                Score {yearA && `(${yearA})`}
                                            </th>
                                            <th className="text-center py-3 px-4 font-medium text-slate-500">
                                                Score {yearB && `(${yearB})`}
                                            </th>
                                            <th className="text-center py-3 px-4 font-medium text-slate-500">Change</th>
                                            <th className="text-center py-3 px-4 font-medium text-slate-500">Direction</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {buildSentimentShiftData(
                                            data.surveyA.metrics.unitScores,
                                            data.surveyB.metrics.unitScores
                                        ).map((row) => (
                                            <tr key={row.unit_name} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900/50">
                                                <td className="py-3 px-4 font-medium text-slate-800 dark:text-slate-200">{row.unit_name}</td>
                                                <td className="text-center py-3 px-4">
                                                    {row.scoreA !== null ? `${row.scoreA}%` : "—"}
                                                </td>
                                                <td className="text-center py-3 px-4 font-semibold">
                                                    {row.scoreB !== null ? `${row.scoreB}%` : "—"}
                                                </td>
                                                <td className="text-center py-3 px-4">
                                                    {row.delta !== null ? (
                                                        <span className={`font-semibold ${row.delta > 0 ? 'text-green-600' : row.delta < 0 ? 'text-red-600' : 'text-slate-400'}`}>
                                                            {row.delta > 0 ? '+' : ''}{row.delta}
                                                        </span>
                                                    ) : "—"}
                                                </td>
                                                <td className="text-center py-3 px-4">
                                                    {row.delta !== null ? (
                                                        row.delta > 0 ? (
                                                            <Badge className="bg-green-100 text-green-700 border-green-200">↑ Improved</Badge>
                                                        ) : row.delta < 0 ? (
                                                            <Badge className="bg-red-100 text-red-700 border-red-200">↓ Declined</Badge>
                                                        ) : (
                                                            <Badge className="bg-slate-100 text-slate-600 border-slate-200">→ Stable</Badge>
                                                        )
                                                    ) : (
                                                        <Badge variant="outline" className="text-slate-400">New</Badge>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </CardContent>
                    </Card>

                    {/* ──── SECTION 6: CATEGORY-LEVEL SENTIMENT COMPARISON ──── */}
                    {data.categoryComparison && data.categoryComparison.length > 0 && (
                        <Card className="border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                            <div className="h-1 bg-gradient-to-r from-fuchsia-500 to-pink-500" />
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2 text-base">
                                    <MessageSquare className="w-5 h-5 text-fuchsia-600" /> Category Sentiment Comparison
                                </CardTitle>
                                <CardDescription>
                                    How feedback volume and sentiment shifted per category within each unit.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-2">
                                {data.categoryComparison.map(unit => {
                                    const isExpanded = expandedUnits.has(unit.unit_id);
                                    return (
                                        <div key={unit.unit_id} className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
                                            <button
                                                onClick={() => toggleUnit(unit.unit_id)}
                                                className="w-full flex items-center justify-between p-4 hover:bg-slate-50/50 dark:hover:bg-slate-900/30 transition-colors text-left"
                                            >
                                                <div className="flex items-center gap-3">
                                                    {isExpanded ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                                                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                                                        {unit.unit_name}
                                                        {unit.short_name !== unit.unit_name && (
                                                            <span className="text-slate-400 ml-1 text-xs font-normal">({unit.short_name})</span>
                                                        )}
                                                    </span>
                                                    <Badge variant="outline" className="ml-2 text-xs">{unit.categories.length} categories</Badge>
                                                </div>
                                            </button>

                                            {isExpanded && (
                                                <div className="border-t border-slate-100 dark:border-slate-800 p-4 animate-in fade-in duration-200">
                                                    <table className="w-full text-sm">
                                                        <thead>
                                                            <tr className="border-b border-slate-200 dark:border-slate-700 text-xs">
                                                                <th className="text-left py-2 px-3 font-medium text-slate-500">Category</th>
                                                                <th className="text-center py-2 px-3 font-medium text-slate-500" colSpan={2}>
                                                                    Volume
                                                                </th>
                                                                <th className="text-center py-2 px-3 font-medium text-emerald-600" colSpan={2}>
                                                                    <ThumbsUp className="w-3 h-3 inline mr-1" />Positive
                                                                </th>
                                                                <th className="text-center py-2 px-3 font-medium text-red-600" colSpan={2}>
                                                                    <ThumbsDown className="w-3 h-3 inline mr-1" />Negative
                                                                </th>
                                                            </tr>
                                                            <tr className="border-b border-slate-100 dark:border-slate-800 text-[11px]">
                                                                <th></th>
                                                                <th className="text-center py-1 px-2 text-slate-400">{yearA}</th>
                                                                <th className="text-center py-1 px-2 text-slate-400">{yearB}</th>
                                                                <th className="text-center py-1 px-2 text-slate-400">{yearA}</th>
                                                                <th className="text-center py-1 px-2 text-slate-400">{yearB}</th>
                                                                <th className="text-center py-1 px-2 text-slate-400">{yearA}</th>
                                                                <th className="text-center py-1 px-2 text-slate-400">{yearB}</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {unit.categories.map(cat => {
                                                                const volDelta = cat.countB.total - cat.countA.total;
                                                                const negPctA = cat.countA.total > 0 ? (cat.countA.negative / cat.countA.total * 100) : 0;
                                                                const negPctB = cat.countB.total > 0 ? (cat.countB.negative / cat.countB.total * 100) : 0;
                                                                const posPctA = cat.countA.total > 0 ? (cat.countA.positive / cat.countA.total * 100) : 0;
                                                                const posPctB = cat.countB.total > 0 ? (cat.countB.positive / cat.countB.total * 100) : 0;

                                                                return (
                                                                    <tr key={cat.category_name} className="border-b border-slate-50 dark:border-slate-800/50 hover:bg-slate-50/50 dark:hover:bg-slate-900/20">
                                                                        <td className="py-2 px-3 text-slate-700 dark:text-slate-300 font-medium">
                                                                            {cat.category_name}
                                                                        </td>
                                                                        <td className="text-center py-2 px-2 text-slate-500">{cat.countA.total}</td>
                                                                        <td className="text-center py-2 px-2">
                                                                            <span className="font-semibold">{cat.countB.total}</span>
                                                                            {volDelta !== 0 && (
                                                                                <span className={`text-[10px] ml-1 ${volDelta > 0 ? 'text-blue-500' : 'text-slate-400'}`}>
                                                                                    {volDelta > 0 ? '+' : ''}{volDelta}
                                                                                </span>
                                                                            )}
                                                                        </td>
                                                                        <td className="text-center py-2 px-2 text-emerald-600">
                                                                            {cat.countA.positive}
                                                                            <span className="text-[10px] text-slate-400 ml-0.5">({posPctA.toFixed(0)}%)</span>
                                                                        </td>
                                                                        <td className="text-center py-2 px-2">
                                                                            <span className="text-emerald-600 font-semibold">{cat.countB.positive}</span>
                                                                            <span className="text-[10px] text-slate-400 ml-0.5">({posPctB.toFixed(0)}%)</span>
                                                                        </td>
                                                                        <td className="text-center py-2 px-2 text-red-600">
                                                                            {cat.countA.negative}
                                                                            <span className="text-[10px] text-slate-400 ml-0.5">({negPctA.toFixed(0)}%)</span>
                                                                        </td>
                                                                        <td className="text-center py-2 px-2">
                                                                            <span className={`font-semibold ${negPctB > negPctA ? 'text-red-600' : negPctB < negPctA ? 'text-green-600' : 'text-red-600'}`}>
                                                                                {cat.countB.negative}
                                                                            </span>
                                                                            <span className="text-[10px] text-slate-400 ml-0.5">({negPctB.toFixed(0)}%)</span>
                                                                        </td>
                                                                    </tr>
                                                                );
                                                            })}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </CardContent>
                        </Card>
                    )}

                </div>
            )}
        </div>
    );
}

// --- Data Helpers ---

function buildQuantChartData(
    unitsA: UnitScore[], unitsB: UnitScore[],
    quantMapA: any, quantMapB: any
) {
    // quantMapA/B are now serialized from Map<number, {sum,count}> — may arrive as plain object
    // Build from unit scores and quant data
    const allUnits = new Map<number, { name: string; baseline: number; current: number }>();

    for (const u of unitsA) {
        allUnits.set(u.unit_id, { name: u.short_name || u.unit_name, baseline: 0, current: 0 });
    }
    for (const u of unitsB) {
        if (!allUnits.has(u.unit_id)) {
            allUnits.set(u.unit_id, { name: u.short_name || u.unit_name, baseline: 0, current: 0 });
        }
    }

    // Try to extract quantitative averages from quantMap objects
    // The API returns Map as serialized — needs careful handling
    if (quantMapA && typeof quantMapA === 'object') {
        for (const [key, val] of Object.entries(quantMapA)) {
            const uid = parseInt(key);
            const entry = val as { sum: number; count: number };
            if (allUnits.has(uid) && entry.count > 0) {
                allUnits.get(uid)!.baseline = parseFloat((entry.sum / entry.count).toFixed(2));
            }
        }
    }
    if (quantMapB && typeof quantMapB === 'object') {
        for (const [key, val] of Object.entries(quantMapB)) {
            const uid = parseInt(key);
            const entry = val as { sum: number; count: number };
            if (allUnits.has(uid) && entry.count > 0) {
                allUnits.get(uid)!.current = parseFloat((entry.sum / entry.count).toFixed(2));
            }
        }
    }

    return Array.from(allUnits.values())
        .filter(u => u.baseline > 0 || u.current > 0)
        .sort((a, b) => a.name.localeCompare(b.name));
}

function buildSentimentShiftData(scoresA: UnitScore[], scoresB: UnitScore[]) {
    const allUnits = new Map<string, { unit_name: string; scoreA: number | null; scoreB: number | null; delta: number | null }>();

    for (const u of scoresA) {
        allUnits.set(u.unit_name, { unit_name: u.unit_name, scoreA: u.score, scoreB: null, delta: null });
    }
    for (const u of scoresB) {
        const existing = allUnits.get(u.unit_name);
        if (existing) {
            existing.scoreB = u.score;
            existing.delta = existing.scoreA !== null ? u.score - existing.scoreA : null;
        } else {
            allUnits.set(u.unit_name, { unit_name: u.unit_name, scoreA: null, scoreB: u.score, delta: null });
        }
    }

    return Array.from(allUnits.values()).sort((a, b) => (b.delta || 0) - (a.delta || 0));
}

function buildCampusComparison(
    campusA: { campus: string; respondents: number }[],
    campusB: { campus: string; respondents: number }[]
) {
    const allCampuses = new Map<string, { campus: string; countA: number; countB: number }>();

    for (const c of campusA || []) {
        allCampuses.set(c.campus, { campus: c.campus, countA: c.respondents, countB: 0 });
    }
    for (const c of campusB || []) {
        const existing = allCampuses.get(c.campus);
        if (existing) {
            existing.countB = c.respondents;
        } else {
            allCampuses.set(c.campus, { campus: c.campus, countA: 0, countB: c.respondents });
        }
    }

    return Array.from(allCampuses.values()).sort((a, b) => (b.countA + b.countB) - (a.countA + a.countB));
}
