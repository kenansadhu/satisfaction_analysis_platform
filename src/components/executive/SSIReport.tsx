"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
    Users, MapPin, GraduationCap, BarChart3, TrendingUp, TrendingDown,
    Minus, MessageSquare, ThumbsUp, ThumbsDown,
    AlertCircle, Lightbulb, FileText, Award, ArrowUpDown, Hash, Percent,
    Building2, Target, Activity
} from "lucide-react";

interface SSIReportProps {
    surveyId?: string;
}

interface CampusParticipation {
    campus: string;
    respondents: number;
}
interface ProdiParticipation {
    prodi: string;
    respondents: number;
    faculty: string | null;
    enrolled: number | null;
    response_rate: number | null;
}
interface CampusSatisfaction {
    campus: string;
    satisfaction_index: number;
}
interface CampusScore {
    campus: string;
    average: number | null;
    count: number;
}
interface CategoryBreakdown {
    name: string;
    positive: number;
    negative: number;
    neutral: number;
    total: number;
}
interface UnitReport {
    unit_id: number;
    unit_name: string;
    short_name: string | null;
    satisfaction_index: number | null;
    score_count: number;
    campus_scores: CampusScore[];
    qualitative: {
        total: number;
        positive: number;
        negative: number;
        neutral: number;
        suggestions: number;
        positive_pct: number;
        negative_pct: number;
        categories: CategoryBreakdown[];
    } | null;
}
interface ReportData {
    survey: { id: number; title: string; year?: number; description?: string };
    totalRespondents: number;
    totalEnrolled: number;
    responseRate: number | null;
    campusParticipation: CampusParticipation[];
    prodiParticipation: ProdiParticipation[];
    globalSatisfactionIndex: number | null;
    campusSatisfaction: CampusSatisfaction[];
    campuses: string[];
    units: UnitReport[];
}

// Score color helper
function scoreColor(score: number | null): string {
    if (score === null) return "text-slate-400";
    if (score >= 3.20) return "text-emerald-600 dark:text-emerald-400";
    if (score >= 3.00) return "text-amber-600 dark:text-amber-400";
    return "text-red-600 dark:text-red-400";
}

function scoreBg(score: number | null): string {
    if (score === null) return "bg-slate-50 dark:bg-slate-800";
    if (score >= 3.20) return "bg-emerald-50 dark:bg-emerald-950/30";
    if (score >= 3.00) return "bg-amber-50 dark:bg-amber-950/30";
    return "bg-red-50 dark:bg-red-950/30";
}

function scoreRingColor(score: number | null): string {
    if (score === null) return "border-slate-300";
    if (score >= 3.20) return "border-emerald-500";
    if (score >= 3.00) return "border-amber-500";
    return "border-red-500";
}

// Shorten long campus names for table headers
function shortCampus(name: string): string {
    if (name.toLowerCase().includes("jakarta")) return "Jakarta";
    return name;
}

export default function SSIReport({ surveyId }: SSIReportProps) {
    const [data, setData] = useState<ReportData | null>(null);
    const [loading, setLoading] = useState(false);
    const [prodiSort, setProdiSort] = useState<"count" | "rate">("count");

    useEffect(() => {
        if (!surveyId) {
            setData(null);
            return;
        }
        const load = async () => {
            setLoading(true);
            try {
                const res = await fetch(`/api/executive/report?surveyId=${surveyId}`);
                const json = await res.json();
                if (res.ok) setData(json);
            } catch { /* ignore */ }
            setLoading(false);
        };
        load();
    }, [surveyId]);



    if (!surveyId) {
        return (
            <div className="text-center py-20 space-y-3">
                <FileText className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600" />
                <p className="text-slate-500 dark:text-slate-400 text-lg">Select a specific survey from the <strong>Data Scope</strong> dropdown to generate the report.</p>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="space-y-6">
                <Skeleton className="h-48 w-full rounded-2xl" />
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <Skeleton className="h-28 rounded-xl" />
                    <Skeleton className="h-28 rounded-xl" />
                    <Skeleton className="h-28 rounded-xl" />
                    <Skeleton className="h-28 rounded-xl" />
                </div>
                <Skeleton className="h-64 w-full rounded-xl" />
            </div>
        );
    }

    if (!data) return null;

    const { survey, totalRespondents, totalEnrolled, responseRate, campusParticipation, prodiParticipation, globalSatisfactionIndex, campusSatisfaction, campuses, units } = data;

    // Sort units by satisfaction index descending
    const sortedUnits = [...units].sort((a, b) => (b.satisfaction_index || 0) - (a.satisfaction_index || 0));

    // Sorted prodi: by count or by response rate
    const sortedProdi = [...prodiParticipation].sort((a, b) => {
        if (prodiSort === "rate") {
            return (b.response_rate || 0) - (a.response_rate || 0);
        }
        return b.respondents - a.respondents;
    });

    // Top/bottom units for quick vis
    const unitsWithScores = sortedUnits.filter(u => u.satisfaction_index !== null);
    const topUnits = unitsWithScores.slice(0, 3);
    const bottomUnits = unitsWithScores.slice(-3).reverse();

    // Qualitative totals
    const totalFeedback = units.reduce((sum, u) => sum + (u.qualitative?.total || 0), 0);
    const totalPositive = units.reduce((sum, u) => sum + (u.qualitative?.positive || 0), 0);
    const totalNegative = units.reduce((sum, u) => sum + (u.qualitative?.negative || 0), 0);

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">

            {/* === PREMIUM HEADER BANNER === */}
            <div className="relative rounded-2xl overflow-hidden shadow-2xl">
                {/* Gradient background */}
                <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-950" />
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(59,130,246,0.2),transparent_60%)]" />
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,rgba(139,92,246,0.15),transparent_60%)]" />

                {/* Subtle grid pattern */}
                <div className="absolute inset-0 opacity-[0.03]" style={{
                    backgroundImage: 'linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)',
                    backgroundSize: '40px 40px'
                }} />

                <div className="relative z-10 p-8 md:p-10">
                    {/* Title row */}
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-2.5 rounded-xl bg-blue-500/20 backdrop-blur-sm border border-blue-400/20">
                            <FileText className="w-5 h-5 text-blue-300" />
                        </div>
                        <div>
                            <h2 className="text-xl md:text-2xl font-bold text-white tracking-tight">{survey.title}</h2>
                            {survey.description && <p className="text-blue-200/60 text-sm mt-0.5">{survey.description}</p>}
                        </div>
                    </div>

                    {/* UPH Index — hero metric */}
                    <div className="flex flex-col md:flex-row md:items-end gap-6 md:gap-10 mb-8">
                        <div className="flex items-end gap-3">
                            <div className={`text-5xl md:text-6xl font-black tracking-tight ${globalSatisfactionIndex && globalSatisfactionIndex >= 3.20 ? 'text-emerald-400' : globalSatisfactionIndex && globalSatisfactionIndex >= 3.00 ? 'text-amber-400' : 'text-red-400'}`}>
                                {globalSatisfactionIndex?.toFixed(2) || "N/A"}
                            </div>
                            <div className="pb-1.5">
                                <div className="text-white font-semibold text-lg">UPH Index</div>
                                <div className="text-blue-300/60 text-xs">Overall satisfaction (1-4 scale)</div>
                            </div>
                        </div>

                        {/* Per-campus satisfaction */}
                        <div className="flex flex-wrap gap-4 md:gap-6 md:pb-1">
                            {campusSatisfaction.map(cs => (
                                <div key={cs.campus} className="flex items-center gap-2">
                                    <div className={`w-2.5 h-2.5 rounded-full ${cs.satisfaction_index >= 3.20 ? 'bg-emerald-400' : cs.satisfaction_index >= 3.00 ? 'bg-amber-400' : 'bg-red-400'}`} />
                                    <span className="text-blue-200/80 text-sm">{shortCampus(cs.campus)}</span>
                                    <span className={`font-bold text-sm ${cs.satisfaction_index >= 3.20 ? 'text-emerald-400' : cs.satisfaction_index >= 3.00 ? 'text-amber-400' : 'text-red-400'}`}>
                                        {cs.satisfaction_index.toFixed(2)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Stat cards row */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
                        <div className="bg-white/[0.06] backdrop-blur-md rounded-xl p-4 border border-white/[0.08]">
                            <div className="flex items-center gap-2 text-blue-300/70 text-xs font-medium mb-2">
                                <Users className="w-3.5 h-3.5" /> Respondents
                            </div>
                            <div className="text-2xl font-bold text-white">{totalRespondents.toLocaleString()}</div>
                        </div>
                        {totalEnrolled > 0 && (
                            <div className="bg-white/[0.06] backdrop-blur-md rounded-xl p-4 border border-white/[0.08]">
                                <div className="flex items-center gap-2 text-blue-300/70 text-xs font-medium mb-2">
                                    <Target className="w-3.5 h-3.5" /> Response Rate
                                </div>
                                <div className="text-2xl font-bold text-white">{responseRate}%</div>
                            </div>
                        )}
                        <div className="bg-white/[0.06] backdrop-blur-md rounded-xl p-4 border border-white/[0.08]">
                            <div className="flex items-center gap-2 text-blue-300/70 text-xs font-medium mb-2">
                                <Building2 className="w-3.5 h-3.5" /> Units Evaluated
                            </div>
                            <div className="text-2xl font-bold text-white">{units.length}</div>
                        </div>
                        <div className="bg-white/[0.06] backdrop-blur-md rounded-xl p-4 border border-white/[0.08]">
                            <div className="flex items-center gap-2 text-blue-300/70 text-xs font-medium mb-2">
                                <MessageSquare className="w-3.5 h-3.5" /> Feedback Segments
                            </div>
                            <div className="text-2xl font-bold text-white">{totalFeedback.toLocaleString()}</div>
                        </div>
                    </div>
                </div>
            </div>

            {/* === QUICK VISUALIZATIONS === */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Top 3 Units */}
                <Card className="border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                    <div className="h-1 bg-gradient-to-r from-emerald-500 to-green-400" />
                    <CardHeader className="pb-2">
                        <CardTitle className="flex items-center gap-2 text-sm">
                            <TrendingUp className="w-4 h-4 text-emerald-600" /> Top Performing
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2.5">
                        {topUnits.map((u, i) => (
                            <div key={u.unit_id} className="flex items-center justify-between">
                                <div className="flex items-center gap-2 min-w-0">
                                    <span className="text-xs font-bold text-emerald-500 w-4">{i + 1}</span>
                                    <span className="text-sm text-slate-700 dark:text-slate-300 truncate">{u.short_name || u.unit_name}</span>
                                </div>
                                <span className={`font-bold text-sm ${scoreColor(u.satisfaction_index)}`}>{u.satisfaction_index?.toFixed(2)}</span>
                            </div>
                        ))}
                    </CardContent>
                </Card>

                {/* Bottom 3 Units */}
                <Card className="border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                    <div className="h-1 bg-gradient-to-r from-red-500 to-orange-400" />
                    <CardHeader className="pb-2">
                        <CardTitle className="flex items-center gap-2 text-sm">
                            <AlertCircle className="w-4 h-4 text-red-600" /> Needs Attention
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2.5">
                        {bottomUnits.map((u, i) => (
                            <div key={u.unit_id} className="flex items-center justify-between">
                                <div className="flex items-center gap-2 min-w-0">
                                    <span className="text-xs font-bold text-red-500 w-4">{unitsWithScores.length - 2 + i}</span>
                                    <span className="text-sm text-slate-700 dark:text-slate-300 truncate">{u.short_name || u.unit_name}</span>
                                </div>
                                <span className={`font-bold text-sm ${scoreColor(u.satisfaction_index)}`}>{u.satisfaction_index?.toFixed(2)}</span>
                            </div>
                        ))}
                    </CardContent>
                </Card>

                {/* Feedback Sentiment Summary */}
                <Card className="border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                    <div className="h-1 bg-gradient-to-r from-violet-500 to-purple-400" />
                    <CardHeader className="pb-2">
                        <CardTitle className="flex items-center gap-2 text-sm">
                            <Activity className="w-4 h-4 text-violet-600" /> Sentiment Overview
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center gap-2 mb-3">
                            <div className="flex-1 h-5 rounded-full overflow-hidden flex bg-slate-100 dark:bg-slate-800">
                                <div className="bg-emerald-500 h-full transition-all" style={{ width: `${totalFeedback > 0 ? (totalPositive / totalFeedback * 100) : 0}%` }} />
                                <div className="bg-slate-400 h-full transition-all" style={{ width: `${totalFeedback > 0 ? ((totalFeedback - totalPositive - totalNegative) / totalFeedback * 100) : 0}%` }} />
                                <div className="bg-red-500 h-full transition-all" style={{ width: `${totalFeedback > 0 ? (totalNegative / totalFeedback * 100) : 0}%` }} />
                            </div>
                        </div>
                        <div className="grid grid-cols-3 gap-1 text-center text-xs">
                            <div>
                                <div className="font-bold text-emerald-600 text-sm">{totalFeedback > 0 ? (totalPositive / totalFeedback * 100).toFixed(0) : 0}%</div>
                                <div className="text-slate-400">Positive</div>
                            </div>
                            <div>
                                <div className="font-bold text-slate-500 text-sm">{totalFeedback > 0 ? ((totalFeedback - totalPositive - totalNegative) / totalFeedback * 100).toFixed(0) : 0}%</div>
                                <div className="text-slate-400">Neutral</div>
                            </div>
                            <div>
                                <div className="font-bold text-red-600 text-sm">{totalFeedback > 0 ? (totalNegative / totalFeedback * 100).toFixed(0) : 0}%</div>
                                <div className="text-slate-400">Negative</div>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Campus Quick Stats */}
                <Card className="border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                    <div className="h-1 bg-gradient-to-r from-blue-500 to-cyan-400" />
                    <CardHeader className="pb-2">
                        <CardTitle className="flex items-center gap-2 text-sm">
                            <MapPin className="w-4 h-4 text-blue-600" /> Campus Index
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2.5">
                        {campusSatisfaction.map(cs => (
                            <div key={cs.campus} className="flex items-center justify-between">
                                <span className="text-sm text-slate-700 dark:text-slate-300 truncate">{shortCampus(cs.campus)}</span>
                                <div className="flex items-center gap-2">
                                    <div className={`h-1.5 rounded-full ${cs.satisfaction_index >= 3.20 ? 'bg-emerald-500' : cs.satisfaction_index >= 3.00 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${Math.max(20, cs.satisfaction_index / 4 * 60)}px` }} />
                                    <span className={`font-bold text-sm ${scoreColor(cs.satisfaction_index)}`}>{cs.satisfaction_index.toFixed(2)}</span>
                                </div>
                            </div>
                        ))}
                    </CardContent>
                </Card>
            </div>

            {/* === SECTION 1: PARTICIPATION === */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Campus Participation */}
                <Card className="border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                    <div className="h-1 bg-gradient-to-r from-blue-500 to-cyan-500" />
                    <CardHeader className="pb-3">
                        <CardTitle className="flex items-center gap-2 text-base">
                            <MapPin className="w-5 h-5 text-blue-600" /> Participation by Campus
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-3">
                            {campusParticipation.map(cp => {
                                const pct = totalRespondents > 0 ? (cp.respondents / totalRespondents * 100).toFixed(1) : "0";
                                // Width for the progress bar
                                const barWidth = totalRespondents > 0 ? (cp.respondents / totalRespondents * 100) : 0;
                                return (
                                    <div key={cp.campus} className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900/50">
                                        <div className="flex items-center justify-between mb-2">
                                            <div className="font-medium text-sm text-slate-800 dark:text-slate-200">{cp.campus}</div>
                                            <div className="text-right">
                                                <span className="font-bold text-slate-800 dark:text-slate-200">{cp.respondents.toLocaleString()}</span>
                                                <span className="text-xs text-slate-500 ml-2">{pct}%</span>
                                            </div>
                                        </div>
                                        <div className="h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                                            <div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-400 transition-all duration-500" style={{ width: `${barWidth}%` }} />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </CardContent>
                </Card>

                {/* Study Programs — full list, scrollable, with sort toggle */}
                <Card className="border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                    <div className="h-1 bg-gradient-to-r from-purple-500 to-pink-500" />
                    <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                            <CardTitle className="flex items-center gap-2 text-base">
                                <GraduationCap className="w-5 h-5 text-purple-600" /> Study Programs
                            </CardTitle>
                            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5">
                                <Button
                                    size="sm"
                                    variant={prodiSort === "count" ? "default" : "ghost"}
                                    className={`h-7 px-2.5 text-xs gap-1 ${prodiSort === "count" ? "" : "text-slate-500"}`}
                                    onClick={() => setProdiSort("count")}
                                >
                                    <Hash className="w-3 h-3" /> Count
                                </Button>
                                <Button
                                    size="sm"
                                    variant={prodiSort === "rate" ? "default" : "ghost"}
                                    className={`h-7 px-2.5 text-xs gap-1 ${prodiSort === "rate" ? "" : "text-slate-500"}`}
                                    onClick={() => setProdiSort("rate")}
                                >
                                    <Percent className="w-3 h-3" /> Rate
                                </Button>
                            </div>
                        </div>
                        <CardDescription>
                            {sortedProdi.length} programs • sorted by {prodiSort === "count" ? "respondent count" : "response rate"}
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-1 max-h-[420px] overflow-y-auto custom-scrollbar pr-1">
                            {sortedProdi.map((pp, i) => (
                                <div key={pp.prodi} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <span className="text-xs font-bold text-slate-400 w-6 shrink-0">{i + 1}.</span>
                                        <div className="min-w-0">
                                            <span className="text-sm text-slate-700 dark:text-slate-300 truncate block">{pp.prodi}</span>
                                            {pp.faculty && <span className="text-xs text-slate-400">{pp.faculty}</span>}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0 ml-2">
                                        <Badge variant="secondary">{pp.respondents.toLocaleString()}</Badge>
                                        {pp.response_rate !== null && (
                                            <Badge className={`text-xs ${pp.response_rate >= 80 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : pp.response_rate >= 50 ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                                                {pp.response_rate}%
                                            </Badge>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* === SECTION 2: SATISFACTION INDEX OVERVIEW TABLE === */}
            <Card className="border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                <div className="h-1 bg-gradient-to-r from-emerald-500 to-teal-500" />
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                        <BarChart3 className="w-5 h-5 text-emerald-600" /> Satisfaction Index by Unit
                    </CardTitle>
                    <CardDescription>
                        Average score on 1-4 scale per unit. Target: ≥ 3.20.
                        <span className="inline-flex items-center gap-3 ml-3">
                            <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> ≥ 3.20</span>
                            <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" /> 3.00–3.19</span>
                            <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" /> &lt; 3.00</span>
                        </span>
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-slate-200 dark:border-slate-700">
                                    <th className="text-left py-3 px-4 font-semibold text-slate-600 dark:text-slate-400">Unit</th>
                                    {campuses.map(c => (
                                        <th key={c} className="text-center py-3 px-3 font-semibold text-slate-600 dark:text-slate-400 whitespace-nowrap">{shortCampus(c)}</th>
                                    ))}
                                    <th className="text-center py-3 px-4 font-bold text-slate-800 dark:text-slate-200">Average</th>
                                </tr>
                            </thead>
                            <tbody>
                                {sortedUnits.map(unit => (
                                    <tr key={unit.unit_id} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50/50 dark:hover:bg-slate-900/30 transition-colors">
                                        <td className="py-3 px-4 font-medium text-slate-800 dark:text-slate-200">
                                            {unit.unit_name}
                                            {unit.short_name && <span className="text-slate-400 ml-1 text-xs">({unit.short_name})</span>}
                                        </td>
                                        {unit.campus_scores.map(cs => (
                                            <td key={cs.campus} className="text-center py-3 px-3">
                                                {cs.average !== null ? (
                                                    <span className={`font-semibold ${scoreColor(cs.average)}`}>
                                                        {cs.average.toFixed(2)}
                                                    </span>
                                                ) : (
                                                    <span className="text-slate-300 dark:text-slate-600">n/a</span>
                                                )}
                                            </td>
                                        ))}
                                        <td className={`text-center py-3 px-4 ${scoreBg(unit.satisfaction_index)} rounded-lg`}>
                                            <span className={`font-bold text-lg ${scoreColor(unit.satisfaction_index)}`}>
                                                {unit.satisfaction_index?.toFixed(2) || "n/a"}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
