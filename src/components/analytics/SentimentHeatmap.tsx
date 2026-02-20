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

export function SentimentHeatmap({ units }: { units: UnitPerformance[] }) {
    const sortedUnits = [...units].sort((a, b) => b.score - a.score);

    return (
        <Card className="col-span-2 border-slate-200 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-900">
            <CardHeader className="pb-3 border-b border-slate-100 dark:border-slate-800 mb-4">
                <CardTitle className="text-slate-800 dark:text-slate-100">Unit Performance Heatmap</CardTitle>
                <CardDescription className="dark:text-slate-400">Sentiment distribution across all departments.</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="space-y-6">
                    {sortedUnits.map(unit => (
                        <div key={unit.id} className="group p-2 -mx-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-3">
                                    <div className={`w-2 h-8 rounded-full ${unit.score >= 70 ? "bg-green-500 shadow-sm shadow-green-500/20" : unit.score >= 40 ? "bg-amber-500 shadow-sm shadow-amber-500/20" : "bg-red-500 shadow-sm shadow-red-500/20"
                                        }`} />
                                    <div>
                                        <div className="font-semibold text-slate-800 dark:text-slate-100 text-sm">{unit.name}</div>
                                        <div className="text-xs text-slate-500 dark:text-slate-400">{unit.total} comments</div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-4">
                                    <div className="text-right">
                                        <div className="text-sm font-bold text-slate-900 dark:text-white">{unit.score}<span className="text-xs font-normal text-slate-400">/100</span></div>
                                        <div className="text-[10px] text-slate-400 uppercase tracking-wider">Score</div>
                                    </div>
                                    <Link href={`/analysis/unit/${unit.id}`}>
                                        <div className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition-colors cursor-pointer text-slate-400 dark:text-slate-500 hover:text-blue-600 dark:hover:text-blue-400">
                                            <ArrowRight className="w-4 h-4" />
                                        </div>
                                    </Link>
                                </div>
                            </div>

                            {/* Stacked Bar */}
                            <div className="h-3 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden flex ring-1 ring-inset ring-slate-200 dark:ring-slate-700">
                                <div style={{ width: `${(unit.positive / unit.total) * 100}%` }} className="h-full bg-green-500 hover:bg-green-400 dark:hover:bg-green-400 transition-colors cursor-help" title={`Positive: ${unit.positive}`} />
                                <div style={{ width: `${(unit.neutral / unit.total) * 100}%` }} className="h-full bg-slate-300 dark:bg-slate-600 hover:bg-slate-400 dark:hover:bg-slate-500 transition-colors cursor-help" title={`Neutral: ${unit.neutral}`} />
                                <div style={{ width: `${(unit.negative / unit.total) * 100}%` }} className="h-full bg-red-500 hover:bg-red-400 dark:hover:bg-red-400 transition-colors cursor-help" title={`Negative: ${unit.negative}`} />
                            </div>

                            <div className="flex justify-between mt-1 text-[10px] font-medium text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity">
                                <span className="text-green-600 dark:text-green-500">{Math.round((unit.positive / unit.total) * 100)}% Pos</span>
                                <span className="text-red-600 dark:text-red-500">{Math.round((unit.negative / unit.total) * 100)}% Neg</span>
                            </div>
                        </div>
                    ))}
                    {units.length === 0 && (
                        <div className="text-center py-10 text-slate-400 italic">No sentiment data available.</div>
                    )}
                </div>
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
