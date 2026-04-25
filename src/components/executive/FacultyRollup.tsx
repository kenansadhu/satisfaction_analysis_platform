"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, ReferenceLine, Cell,
} from "recharts";
import { GraduationCap, Users, Target, TrendingUp, TrendingDown, FileText } from "lucide-react";

interface FacultySentiment {
    positive: number; negative: number; neutral: number; total: number;
    positive_pct: number; negative_pct: number;
}
interface TopCategory {
    category_name: string;
    unit_name: string;
    unit_short_name: string;
    positive: number;
    negative: number;
    neutral: number;
    total: number;
}
interface FacultyData {
    faculty: string;
    respondents: number;
    enrolled: number;
    response_rate: number | null;
    sentiment: FacultySentiment;
    top_positive_categories: TopCategory[];
    top_negative_categories: TopCategory[];
}

function rateColor(rate: number | null, avg: number) {
    if (rate === null) return "text-slate-400";
    if (rate >= avg * 1.1) return "text-emerald-600 dark:text-emerald-400";
    if (rate >= avg * 0.9) return "text-amber-600 dark:text-amber-400";
    return "text-red-600 dark:text-red-400";
}
function rateBarColor(rate: number | null, avg: number) {
    if (rate === null) return "#94a3b8";
    if (rate >= avg * 1.1) return "#10b981";
    if (rate >= avg * 0.9) return "#f59e0b";
    return "#ef4444";
}
function sentColor(pct: number) {
    if (pct >= 60) return "text-emerald-600 dark:text-emerald-400";
    if (pct >= 40) return "text-amber-600 dark:text-amber-400";
    return "text-red-600 dark:text-red-400";
}

const CustomTooltip = ({ active, payload, label, avg }: any) => {
    if (!active || !payload?.length) return null;
    const rate = payload[0]?.value;
    return (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3 shadow-lg text-sm">
            <p className="font-bold text-slate-800 dark:text-slate-100 mb-1">{label}</p>
            <p className="text-slate-500">Response rate: <span className="font-semibold" style={{ color: rateBarColor(rate, avg) }}>{rate?.toFixed(1)}%</span></p>
            <p className="text-xs text-slate-400 mt-0.5">Avg: {avg?.toFixed(1)}%</p>
        </div>
    );
};

export default function FacultyRollup({ surveyId }: { surveyId?: string }) {
    const [faculties, setFaculties] = useState<FacultyData[]>([]);
    const [loading, setLoading] = useState(false);
    const [fromCache, setFromCache] = useState(false);

    useEffect(() => {
        if (!surveyId) { setFaculties([]); return; }
        setLoading(true);
        fetch(`/api/executive/faculty-rollup?surveyId=${surveyId}`)
            .then(r => r.json())
            .then(data => {
                setFaculties(data.faculties || []);
                setFromCache(data.fromCache || false);
            })
            .catch(() => setFaculties([]))
            .finally(() => setLoading(false));
    }, [surveyId]);

    if (!surveyId) {
        return (
            <div className="text-center py-20 space-y-3">
                <GraduationCap className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600" />
                <p className="text-slate-500 dark:text-slate-400 text-lg">Select a specific survey to view faculty data.</p>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="space-y-5">
                <Skeleton className="h-72 w-full rounded-2xl" />
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {[1, 2, 3, 4, 5, 6].map(i => <Skeleton key={i} className="h-40 rounded-2xl" />)}
                </div>
            </div>
        );
    }

    if (!faculties.length) {
        return (
            <div className="text-center py-20 space-y-3">
                <FileText className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600" />
                <p className="text-slate-500 dark:text-slate-400">No faculty data available for this survey.</p>
            </div>
        );
    }

    const withRates = faculties.filter(f => f.response_rate !== null);
    const avgRate = withRates.length > 0
        ? withRates.reduce((s, f) => s + (f.response_rate || 0), 0) / withRates.length
        : 0;

    const chartData = [...faculties]
        .filter(f => f.response_rate !== null)
        .sort((a, b) => (b.response_rate || 0) - (a.response_rate || 0))
        .map(f => ({ name: f.faculty, rate: f.response_rate }));

    const hasSentiment = faculties.some(f => f.sentiment.total > 0);
    const totalRespondents = faculties.reduce((s, f) => s + f.respondents, 0);
    const totalEnrolled = faculties.reduce((s, f) => s + f.enrolled, 0);

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">

            {fromCache && (
                <p className="text-xs text-slate-400 text-right">Served from cache · <span className="italic">data is static per survey</span></p>
            )}

            {/* Summary strip */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                    { label: "Faculties", value: faculties.length, icon: GraduationCap, color: "text-teal-600 dark:text-teal-400", bg: "bg-teal-100 dark:bg-teal-900/30" },
                    { label: "Respondents", value: totalRespondents.toLocaleString(), icon: Users, color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-100 dark:bg-blue-900/30" },
                    { label: "Enrolled", value: totalEnrolled.toLocaleString(), icon: Target, color: "text-violet-600 dark:text-violet-400", bg: "bg-violet-100 dark:bg-violet-900/30" },
                    { label: "Avg Response Rate", value: `${avgRate.toFixed(1)}%`, icon: TrendingUp, color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-100 dark:bg-emerald-900/30" },
                ].map(({ label, value, icon: Icon, color, bg }) => (
                    <div key={label} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
                        <div className={`inline-flex p-2 rounded-xl ${bg} mb-3`}>
                            <Icon className={`w-4 h-4 ${color}`} />
                        </div>
                        <p className="text-2xl font-black text-slate-900 dark:text-slate-100">{value}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 uppercase tracking-wider font-medium">{label}</p>
                    </div>
                ))}
            </div>

            {/* Response rate bar chart */}
            {chartData.length > 0 && (
                <Card className="border-slate-200 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-900">
                    <CardHeader className="pb-3 border-b border-slate-100 dark:border-slate-800">
                        <CardTitle className="flex items-center gap-2 text-slate-800 dark:text-slate-100">
                            <Target className="w-4 h-4 text-teal-500" />
                            Response Rate by Faculty
                        </CardTitle>
                        <CardDescription className="mt-0.5">
                            Dashed line = institutional average ({avgRate.toFixed(1)}%).
                            Faculties below 90% of average are highlighted in red.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-4">
                        <div className="h-64">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 40 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                                    <XAxis
                                        dataKey="name"
                                        tick={{ fontSize: 11, fill: "#64748b" }}
                                        angle={-25}
                                        textAnchor="end"
                                        height={55}
                                        interval={0}
                                    />
                                    <YAxis
                                        unit="%"
                                        domain={[0, 100]}
                                        tick={{ fontSize: 11, fill: "#94a3b8" }}
                                    />
                                    <Tooltip content={<CustomTooltip avg={avgRate} />} cursor={{ fill: "rgba(148,163,184,0.08)" }} />
                                    <ReferenceLine y={avgRate} stroke="#6366f1" strokeDasharray="5 4" strokeWidth={1.5}
                                        label={{ value: `avg ${avgRate.toFixed(1)}%`, position: 'right', fontSize: 10, fill: '#6366f1' }} />
                                    <Bar dataKey="rate" radius={[4, 4, 0, 0]}>
                                        {chartData.map((entry, i) => (
                                            <Cell key={i} fill={rateBarColor(entry.rate, avgRate)} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Faculty cards grid */}
            <div>
                <div className="flex items-center gap-2 mb-3">
                    <GraduationCap className="w-4 h-4 text-slate-400" />
                    <h2 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Per-Faculty Breakdown</h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {faculties.map(f => {
                        const isAbove = f.response_rate !== null && f.response_rate >= avgRate * 1.1;
                        const isBelow = f.response_rate !== null && f.response_rate < avgRate * 0.9;
                        const posPct = f.sentiment.positive_pct;
                        const negPct = f.sentiment.negative_pct;
                        const neuPct = f.sentiment.total > 0
                            ? parseFloat(((f.sentiment.neutral / f.sentiment.total) * 100).toFixed(1))
                            : 0;

                        return (
                            <div key={f.faculty} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
                                {/* Header */}
                                <div className="flex items-start justify-between gap-2">
                                    <h3 className="font-semibold text-slate-800 dark:text-slate-100 text-sm leading-snug">{f.faculty}</h3>
                                    {isAbove && <Badge className="shrink-0 bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-800 dark:text-emerald-400 text-[10px]">Above avg</Badge>}
                                    {isBelow && <Badge className="shrink-0 bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400 text-[10px]">Below avg</Badge>}
                                </div>

                                {/* Participation */}
                                <div>
                                    <div className="flex items-center justify-between mb-1.5 text-xs">
                                        <span className="text-slate-500 dark:text-slate-400">Participation</span>
                                        <span className={`font-bold ${rateColor(f.response_rate, avgRate)}`}>
                                            {f.response_rate !== null ? `${f.response_rate}%` : "—"}
                                        </span>
                                    </div>
                                    <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                        <div
                                            className="h-full rounded-full transition-all duration-700"
                                            style={{
                                                width: `${Math.min(f.response_rate || 0, 100)}%`,
                                                backgroundColor: rateBarColor(f.response_rate, avgRate),
                                            }}
                                        />
                                    </div>
                                    <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                                        <span>{f.respondents.toLocaleString()} respondents</span>
                                        {f.enrolled > 0 && <span>{f.enrolled.toLocaleString()} enrolled</span>}
                                    </div>
                                </div>

                                {/* Sentiment */}
                                {hasSentiment && (
                                    <div>
                                        <p className="text-xs text-slate-500 dark:text-slate-400 mb-1.5">Student Sentiment</p>
                                        {f.sentiment.total === 0 ? (
                                            <p className="text-xs text-slate-300 dark:text-slate-600 italic">No feedback analyzed</p>
                                        ) : (
                                            <>
                                                <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden flex mb-1.5">
                                                    <div className="h-full bg-emerald-500" style={{ width: `${posPct}%` }} title={`Positive: ${f.sentiment.positive}`} />
                                                    <div className="h-full bg-slate-300 dark:bg-slate-600" style={{ width: `${neuPct}%` }} title={`Neutral: ${f.sentiment.neutral}`} />
                                                    <div className="h-full bg-red-500" style={{ width: `${negPct}%` }} title={`Negative: ${f.sentiment.negative}`} />
                                                </div>
                                                <div className="flex items-center gap-3 text-[11px] font-semibold">
                                                    <span className={sentColor(posPct)}>{posPct}% pos</span>
                                                    <span className="text-slate-400">{neuPct}% neu</span>
                                                    <span className="text-red-500 dark:text-red-400">{negPct}% neg</span>
                                                    <span className="ml-auto text-slate-400 font-normal">{f.sentiment.total.toLocaleString()} segs</span>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                )}

                                {/* Top Categories */}
                                {(f.top_positive_categories?.length > 0 || f.top_negative_categories?.length > 0) && (
                                    <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2.5">
                                        {f.top_positive_categories?.length > 0 && (
                                            <div>
                                                <p className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mb-1.5">Top Praised</p>
                                                <div className="space-y-1">
                                                    {f.top_positive_categories.map((cat, i) => (
                                                        <div key={i} className="flex items-center justify-between gap-1.5">
                                                            <span className="text-[10px] text-slate-600 dark:text-slate-300 truncate flex-1">{cat.category_name}</span>
                                                            <span className="text-[10px] text-slate-400 dark:text-slate-500 shrink-0 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">{cat.unit_short_name}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        {f.top_negative_categories?.length > 0 && (
                                            <div>
                                                <p className="text-[10px] font-semibold text-red-500 dark:text-red-400 uppercase tracking-wider mb-1.5">Top Issues</p>
                                                <div className="space-y-1">
                                                    {f.top_negative_categories.map((cat, i) => (
                                                        <div key={i} className="flex items-center justify-between gap-1.5">
                                                            <span className="text-[10px] text-slate-600 dark:text-slate-300 truncate flex-1">{cat.category_name}</span>
                                                            <span className="text-[10px] text-slate-400 dark:text-slate-500 shrink-0 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">{cat.unit_short_name}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
