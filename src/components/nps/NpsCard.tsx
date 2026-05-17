"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Target } from "lucide-react";
import { NpsBucketBar } from "./NpsBucketBar";
import { computeNpsScore, npsBenchmark, npsBenchmarkColor, NpsCounts } from "@/lib/nps";

interface Props {
    title: string;
    subtitle?: string;
    counts: NpsCounts;
    /** Optional: comparison label to show on the right (e.g. "vs +35 last year"). */
    comparison?: string;
}

const BENCHMARK_LABEL: Record<ReturnType<typeof npsBenchmark>, string> = {
    excellent: "Excellent (≥ 50)",
    good: "Good (0–49)",
    concern: "Concern (< 0)",
    "no-data": "No data",
};

export function NpsCard({ title, subtitle, counts, comparison }: Props) {
    const score = computeNpsScore(counts);
    const benchmark = npsBenchmark(score);
    const color = npsBenchmarkColor(score);

    return (
        <Card className="shadow-sm border-slate-200 dark:border-slate-800">
            <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2 min-w-0 flex-1">
                        <div className="p-1.5 bg-blue-100 dark:bg-blue-950/40 rounded-lg shrink-0 mt-0.5">
                            <Target className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                        </div>
                        <div className="min-w-0 flex-1">
                            <CardTitle className="text-sm sm:text-base text-slate-800 dark:text-slate-100 leading-snug break-words">
                                {title}
                            </CardTitle>
                            {subtitle && (
                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 break-words">
                                    {subtitle}
                                </p>
                            )}
                        </div>
                    </div>
                    <Badge variant="outline" className="text-[10px] shrink-0 mt-0.5">NPS 0–10</Badge>
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Headline score */}
                <div className="flex items-baseline gap-3">
                    <span className={`text-5xl font-black tabular-nums leading-none ${color}`}>
                        {score === null ? "—" : score > 0 ? `+${score}` : score}
                    </span>
                    <div className="flex flex-col">
                        <span className={`text-xs font-semibold ${color}`}>{BENCHMARK_LABEL[benchmark]}</span>
                        <span className="text-[11px] text-slate-400 mt-0.5">n = {counts.total.toLocaleString()}</span>
                    </div>
                    {comparison && (
                        <span className="ml-auto text-xs text-slate-500 dark:text-slate-400">{comparison}</span>
                    )}
                </div>

                {/* Bucketed bar */}
                <NpsBucketBar counts={counts} variant="full" showLabels />
            </CardContent>
        </Card>
    );
}
