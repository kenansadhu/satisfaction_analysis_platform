"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, Legend, Cell
} from "recharts";
import {
    TrendingUp, TrendingDown, Minus, ArrowRight,
    Loader2, Users, MessageSquareQuote, AlertTriangle,
    Activity, GraduationCap, BarChart3
} from "lucide-react";
import { Survey } from "@/types";

interface ComparisonData {
    surveyA: SurveyData;
    surveyB: SurveyData;
}

interface SurveyData {
    info: { id: number; title: string; year: number | null };
    metrics: {
        overallScore: number;
        totalComments: number;
        totalRespondents: number;
        totalFeedback: number;
        criticalIssues: number;
        unitScores: UnitScore[];
    };
    quantitative: QuantAvg[];
    responseRates: { totalEnrollment: number; totalRespondents: number; responseRate: number } | null;
}

interface UnitScore {
    unit_id: number;
    unit_name: string;
    positive: number;
    neutral: number;
    negative: number;
    total: number;
    score: number;
}

interface QuantAvg {
    unit_id: number;
    unit_name: string;
    unit_short_name: string;
    average: number;
    count: number;
}

export default function YearComparison({ surveys }: { surveys: Survey[] }) {
    const [surveyIdA, setSurveyIdA] = useState<string>("");
    const [surveyIdB, setSurveyIdB] = useState<string>("");
    const [data, setData] = useState<ComparisonData | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Filter surveys that have a year set, sort by year
    const yearSurveys = surveys
        .filter(s => s.year)
        .sort((a, b) => (a.year || 0) - (b.year || 0));

    // Auto-select if we have exactly 2 surveys with years
    useEffect(() => {
        if (yearSurveys.length >= 2 && !surveyIdA && !surveyIdB) {
            setSurveyIdA(yearSurveys[0].id.toString());
            setSurveyIdB(yearSurveys[yearSurveys.length - 1].id.toString());
        }
    }, [yearSurveys.length]);

    // Fetch comparison data
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

    const DeltaIndicator = ({ current, baseline, suffix = "", isScore = false }: {
        current: number; baseline: number; suffix?: string; isScore?: boolean;
    }) => {
        const delta = current - baseline;
        const pctChange = baseline > 0 ? ((delta / baseline) * 100) : 0;
        const isPositive = isScore ? delta > 0 : delta > 0;
        const isNeutral = delta === 0;

        return (
            <div className="flex items-center gap-1.5">
                {isNeutral ? (
                    <Minus className="w-4 h-4 text-slate-400" />
                ) : isPositive ? (
                    <TrendingUp className="w-4 h-4 text-green-600" />
                ) : (
                    <TrendingDown className="w-4 h-4 text-red-600" />
                )}
                <span className={`text-sm font-semibold ${isNeutral ? "text-slate-500" : isPositive ? "text-green-600" : "text-red-600"
                    }`}>
                    {delta > 0 ? "+" : ""}{delta.toLocaleString()}{suffix}
                    {baseline > 0 && (
                        <span className="text-xs font-normal ml-1">
                            ({pctChange > 0 ? "+" : ""}{pctChange.toFixed(1)}%)
                        </span>
                    )}
                </span>
            </div>
        );
    };

    const MetricCompareCard = ({ title, icon: Icon, valueA, valueB, suffix = "", isScore = false, iconColor = "text-blue-600" }: {
        title: string; icon: any; valueA: number; valueB: number; suffix?: string; isScore?: boolean; iconColor?: string;
    }) => (
        <Card className="border-slate-200 dark:border-slate-800 shadow-sm">
            <CardContent className="p-5">
                <div className="flex items-center gap-2 mb-4">
                    <Icon className={`w-4 h-4 ${iconColor}`} />
                    <span className="text-sm font-medium text-slate-600 dark:text-slate-400">{title}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 items-end">
                    <div>
                        <div className="text-xs text-slate-400 mb-1">Baseline</div>
                        <div className="text-lg font-bold text-slate-700 dark:text-slate-300">{valueA.toLocaleString()}{suffix}</div>
                    </div>
                    <div className="text-center">
                        <ArrowRight className="w-4 h-4 text-slate-300 mx-auto mb-1" />
                        <DeltaIndicator current={valueB} baseline={valueA} suffix={suffix} isScore={isScore} />
                    </div>
                    <div className="text-right">
                        <div className="text-xs text-slate-400 mb-1">Current</div>
                        <div className="text-lg font-bold text-slate-900 dark:text-slate-100">{valueB.toLocaleString()}{suffix}</div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );

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

            {/* Loading State */}
            {loading && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-32 w-full rounded-xl" />)}
                </div>
            )}

            {/* Error State */}
            {error && (
                <Card className="border-red-200 bg-red-50">
                    <CardContent className="py-4 text-red-700 text-sm">
                        Failed to load comparison: {error}
                    </CardContent>
                </Card>
            )}

            {/* Comparison Results */}
            {data && !loading && (
                <div className="space-y-6 animate-in fade-in duration-500">
                    {/* Delta Metric Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <MetricCompareCard
                            title="Overall Score"
                            icon={Activity}
                            valueA={data.surveyA.metrics.overallScore}
                            valueB={data.surveyB.metrics.overallScore}
                            suffix="%"
                            isScore={true}
                            iconColor="text-blue-600"
                        />
                        <MetricCompareCard
                            title="Feedback Volume"
                            icon={MessageSquareQuote}
                            valueA={data.surveyA.metrics.totalComments}
                            valueB={data.surveyB.metrics.totalComments}
                            iconColor="text-purple-600"
                        />
                        <MetricCompareCard
                            title="Critical Issues"
                            icon={AlertTriangle}
                            valueA={data.surveyA.metrics.criticalIssues}
                            valueB={data.surveyB.metrics.criticalIssues}
                            iconColor="text-red-600"
                        />
                        <MetricCompareCard
                            title="Respondents"
                            icon={Users}
                            valueA={data.surveyA.metrics.totalRespondents}
                            valueB={data.surveyB.metrics.totalRespondents}
                            iconColor="text-emerald-600"
                        />
                    </div>

                    {/* Response Rate Card (if enrollment data exists) */}
                    {(data.surveyA.responseRates || data.surveyB.responseRates) && (
                        <Card className="border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                            <div className="h-1 bg-gradient-to-r from-emerald-500 to-teal-500" />
                            <CardHeader className="pb-2">
                                <CardTitle className="flex items-center gap-2 text-base">
                                    <GraduationCap className="w-5 h-5 text-emerald-600" /> Response Rate
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                    {data.surveyA.responseRates && (
                                        <div className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl">
                                            <div className="text-xs text-slate-400 mb-1">Baseline ({data.surveyA.info?.year})</div>
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
                                            <div className="text-xs text-slate-400 mb-1">Current ({data.surveyB.info?.year})</div>
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

                    {/* Quantitative Averages (1-4 Scale) Comparison Chart */}
                    {(data.surveyA.quantitative.length > 0 || data.surveyB.quantitative.length > 0) && (
                        <Card className="border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                            <div className="h-1 bg-gradient-to-r from-blue-500 to-indigo-500" />
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2 text-base">
                                    <BarChart3 className="w-5 h-5 text-blue-600" /> Quantitative Metrics (1–4 Scale)
                                </CardTitle>
                                <CardDescription>Average scores per unit across both survey periods.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="h-[400px]">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart
                                            data={buildQuantChartData(data.surveyA.quantitative, data.surveyB.quantitative)}
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
                                                name={data.surveyA.info?.year ? `${data.surveyA.info.year}` : "Baseline"}
                                                fill="#94a3b8"
                                                radius={[4, 4, 0, 0]}
                                            />
                                            <Bar
                                                dataKey="current"
                                                name={data.surveyB.info?.year ? `${data.surveyB.info.year}` : "Current"}
                                                fill="#3b82f6"
                                                radius={[4, 4, 0, 0]}
                                            />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {/* Unit-by-Unit Sentiment Shift Table */}
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
                                                Score {data.surveyA.info?.year && `(${data.surveyA.info.year})`}
                                            </th>
                                            <th className="text-center py-3 px-4 font-medium text-slate-500">
                                                Score {data.surveyB.info?.year && `(${data.surveyB.info.year})`}
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
                </div>
            )}
        </div>
    );
}

// --- Data Helpers ---

function buildQuantChartData(quantA: QuantAvg[], quantB: QuantAvg[]) {
    const allUnits = new Map<number, { name: string; baseline: number; current: number }>();

    for (const q of quantA) {
        allUnits.set(q.unit_id, { name: q.unit_short_name, baseline: q.average, current: 0 });
    }
    for (const q of quantB) {
        const existing = allUnits.get(q.unit_id);
        if (existing) {
            existing.current = q.average;
        } else {
            allUnits.set(q.unit_id, { name: q.unit_short_name, baseline: 0, current: q.average });
        }
    }

    return Array.from(allUnits.values()).sort((a, b) => a.name.localeCompare(b.name));
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
