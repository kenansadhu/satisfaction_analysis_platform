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
    // Sort by negative impact (High negatives first) for "At Risk" view or Score for "Performance"
    const sortedUnits = [...units].sort((a, b) => b.score - a.score);

    return (
        <Card className="col-span-2 border-slate-200 shadow-sm">
            <CardHeader>
                <CardTitle>Unit Performance Heatmap</CardTitle>
                <CardDescription>Sentiment distribution across all departments.</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="space-y-6">
                    {sortedUnits.map(unit => (
                        <div key={unit.id} className="group">
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-3">
                                    <div className={`w-2 h-8 rounded-full ${unit.score >= 70 ? "bg-green-500" : unit.score >= 40 ? "bg-amber-500" : "bg-red-500"
                                        }`} />
                                    <div>
                                        <div className="font-semibold text-slate-800 text-sm">{unit.name}</div>
                                        <div className="text-xs text-slate-500">{unit.total} comments</div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-4">
                                    <div className="text-right">
                                        <div className="text-sm font-bold text-slate-900">{unit.score}/100</div>
                                        <div className="text-xs text-slate-400">Sentiment Score</div>
                                    </div>
                                    <Link href={`/analysis/unit/${unit.id}`}>
                                        <div className="p-2 hover:bg-slate-100 rounded-full transition-colors cursor-pointer text-slate-400 hover:text-blue-600">
                                            <ArrowRight className="w-4 h-4" />
                                        </div>
                                    </Link>
                                </div>
                            </div>

                            {/* Stacked Bar */}
                            <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden flex">
                                <div style={{ width: `${(unit.positive / unit.total) * 100}%` }} className="h-full bg-green-500 hover:bg-green-600 transition-colors" title={`Positive: ${unit.positive}`} />
                                <div style={{ width: `${(unit.neutral / unit.total) * 100}%` }} className="h-full bg-slate-300 hover:bg-slate-400 transition-colors" title={`Neutral: ${unit.neutral}`} />
                                <div style={{ width: `${(unit.negative / unit.total) * 100}%` }} className="h-full bg-red-500 hover:bg-red-600 transition-colors" title={`Negative: ${unit.negative}`} />
                            </div>

                            <div className="flex justify-between mt-1 text-[10px] text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity">
                                <span>{Math.round((unit.positive / unit.total) * 100)}% Pos</span>
                                <span>{Math.round((unit.negative / unit.total) * 100)}% Neg</span>
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

export function LeaderBoard({ title, units, type }: { title: string, units: UnitPerformance[], type: "top" | "bottom" }) {
    const displayUnits = units
        .filter(u => u.total > 0)
        .sort((a, b) => type === "top" ? b.score - a.score : a.score - b.score)
        .slice(0, 5);

    return (
        <Card className={`border-slate-200 shadow-sm ${type === "bottom" ? "border-l-4 border-l-red-500" : "border-l-4 border-l-green-500"}`}>
            <CardHeader>
                <CardTitle className="text-base">{title}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                {displayUnits.map((unit, i) => (
                    <div key={unit.id} className="flex items-center justify-between border-b border-slate-50 last:border-0 pb-2 last:pb-0">
                        <div className="flex items-center gap-3">
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${type === "top" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                                }`}>
                                {i + 1}
                            </div>
                            <span className="text-sm font-medium text-slate-700 truncate max-w-[120px]" title={unit.name}>{unit.name}</span>
                        </div>
                        <Badge variant="outline" className={type === "top" ? "text-green-700 bg-green-50" : "text-red-700 bg-red-50"}>
                            {unit.score}
                        </Badge>
                    </div>
                ))}
                {displayUnits.length === 0 && (
                    <div className="text-center py-4 text-xs text-slate-400">Not enough data</div>
                )}
            </CardContent>
        </Card>
    )
}
