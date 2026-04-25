import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ArrowRight } from "lucide-react";
import Link from "next/link";

interface UnitPerformance {
    id: number;
    name: string;
    total: number;
    positive: number;
    neutral: number;
    negative: number;
    score: number; // 0-100 Sentiment Score
}

export function SentimentHeatmap({ units, surveyId }: { units: UnitPerformance[]; surveyId?: string }) {
    const sortedUnits = [...units].sort((a, b) => b.score - a.score);

    return (
        <Card className="col-span-2 border-slate-200 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-900">
            <CardHeader className="pb-3 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle className="text-slate-800 dark:text-slate-100">Unit Performance</CardTitle>
                        <CardDescription className="dark:text-slate-400 mt-0.5">Sentiment distribution across all departments.</CardDescription>
                    </div>
                    <div className="flex items-center gap-3 text-[11px] font-medium text-slate-400">
                        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />Positive</span>
                        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-slate-300 dark:bg-slate-600 inline-block" />Neutral</span>
                        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" />Negative</span>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="pt-3">
                {units.length === 0 ? (
                    <div className="text-center py-10 text-slate-400 italic">No sentiment data available.</div>
                ) : (
                    <div className="space-y-1">
                        {/* Column headers */}
                        <div className="flex items-center gap-4 px-4 pb-1">
                            <span className="w-5 shrink-0" />
                            <span className="w-1.5 shrink-0" />
                            <span className="w-44 shrink-0 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Unit</span>
                            <span className="flex-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Sentiment Distribution</span>
                            <span className="w-14 text-center shrink-0 text-[10px] font-semibold text-emerald-600 dark:text-emerald-500 uppercase tracking-wider">Pos</span>
                            <span className="w-14 text-center shrink-0 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Neu</span>
                            <span className="w-14 text-center shrink-0 text-[10px] font-semibold text-red-500 dark:text-red-400 uppercase tracking-wider">Neg</span>
                            <span className="w-16 text-right shrink-0 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Score</span>
                            {surveyId && surveyId !== "all" && <span className="w-7 shrink-0" />}
                        </div>

                        {sortedUnits.map((unit, i) => {
                            const posPct = Math.round((unit.positive / unit.total) * 100);
                            const neuPct = Math.round((unit.neutral / unit.total) * 100);
                            const negPct = Math.round((unit.negative / unit.total) * 100);
                            const scoreColor = unit.score >= 70
                                ? "text-emerald-600 dark:text-emerald-400"
                                : unit.score >= 40
                                ? "text-amber-600 dark:text-amber-400"
                                : "text-red-600 dark:text-red-400";
                            const indicatorColor = unit.score >= 70 ? "bg-emerald-500" : unit.score >= 40 ? "bg-amber-500" : "bg-red-500";

                            return (
                                <div key={unit.id} className="flex items-center gap-4 px-4 py-2.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group">
                                    {/* Rank */}
                                    <span className="text-xs font-bold text-slate-300 dark:text-slate-600 w-5 shrink-0 text-right tabular-nums">{i + 1}</span>

                                    {/* Score color indicator */}
                                    <div className={`w-1.5 h-7 rounded-full shrink-0 ${indicatorColor}`} />

                                    {/* Name + count */}
                                    <div className="w-44 shrink-0 min-w-0">
                                        <div className="font-semibold text-slate-800 dark:text-slate-100 text-sm truncate leading-tight" title={unit.name}>{unit.name}</div>
                                        <div className="text-xs text-slate-400 dark:text-slate-500 tabular-nums">{unit.total.toLocaleString()} comments</div>
                                    </div>

                                    {/* Stacked bar — fills remaining space */}
                                    <div className="flex-1 h-3 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden flex">
                                        <div style={{ width: `${posPct}%` }} className="h-full bg-emerald-500 transition-all duration-500" title={`Positive: ${unit.positive.toLocaleString()}`} />
                                        <div style={{ width: `${neuPct}%` }} className="h-full bg-slate-300 dark:bg-slate-600" title={`Neutral: ${unit.neutral.toLocaleString()}`} />
                                        <div style={{ width: `${negPct}%` }} className="h-full bg-red-500" title={`Negative: ${unit.negative.toLocaleString()}`} />
                                    </div>

                                    {/* Percentage columns */}
                                    <span className="w-14 text-center shrink-0 text-sm font-semibold text-emerald-600 dark:text-emerald-500 tabular-nums">{posPct}%</span>
                                    <span className="w-14 text-center shrink-0 text-sm font-semibold text-slate-400 dark:text-slate-500 tabular-nums">{neuPct}%</span>
                                    <span className="w-14 text-center shrink-0 text-sm font-semibold text-red-500 dark:text-red-400 tabular-nums">{negPct}%</span>

                                    {/* Score */}
                                    <div className="w-16 text-right shrink-0">
                                        <span className={`text-lg font-black tabular-nums ${scoreColor}`}>{unit.score}</span>
                                        <span className="text-xs text-slate-400">/100</span>
                                    </div>

                                    {/* Link */}
                                    {surveyId && surveyId !== "all" && (
                                        <Link href={`/surveys/${surveyId}/unit/${unit.id}`}>
                                            <div className="w-7 p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition-colors text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 opacity-0 group-hover:opacity-100">
                                                <ArrowRight className="w-3.5 h-3.5" />
                                            </div>
                                        </Link>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

export function LeaderBoard({ title, units, type, loading }: { title: string, units: UnitPerformance[], type: "top" | "bottom", loading?: boolean }) {
    const displayUnits = units
        .filter(u => u.total > 0)
        .sort((a, b) => type === "top" ? b.score - a.score : a.score - b.score)
        .slice(0, 5);

    return (
        <Card className={`border-slate-200 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-900 ${type === "bottom" ? "border-l-4 border-l-red-500" : "border-l-4 border-l-green-500"}`}>
            <CardHeader className="pb-3">
                <CardTitle className="text-base text-slate-800 dark:text-slate-100">{title}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                {loading ? (
                    Array.from({ length: 3 }).map((_, i) => (
                        <div key={i} className="flex items-center justify-between animate-pulse">
                            <div className="flex items-center gap-3">
                                <div className="w-6 h-6 rounded-full bg-slate-200 dark:bg-slate-800" />
                                <div className="h-4 w-24 bg-slate-200 dark:bg-slate-800 rounded" />
                            </div>
                            <div className="h-5 w-8 bg-slate-200 dark:bg-slate-800 rounded" />
                        </div>
                    ))
                ) : displayUnits.length > 0 ? (
                    displayUnits.map((unit, i) => (
                        <div key={unit.id} className="flex items-center justify-between border-b border-slate-50 dark:border-slate-800/50 last:border-0 pb-2 last:pb-0">
                            <div className="flex items-center gap-3">
                                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${type === "top" ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400" : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400"
                                    }`}>
                                    {i + 1}
                                </div>
                                <span className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate max-w-[120px]" title={unit.name}>{unit.name}</span>
                            </div>
                            <Badge variant="outline" className={type === "top" ? "text-green-700 bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800 dark:text-green-400" : "text-red-700 bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400"}>
                                {unit.score}
                            </Badge>
                        </div>
                    ))
                ) : (
                    <div className="text-center py-4 text-xs text-slate-400">Not enough data</div>
                )}
            </CardContent>
        </Card>
    )
}
