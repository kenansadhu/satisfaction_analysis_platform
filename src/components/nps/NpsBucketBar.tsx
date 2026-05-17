"use client";

import { computePercentages, NpsCounts } from "@/lib/nps";

interface Props {
    counts: NpsCounts;
    /** Render as a tall stacked bar with labels (full) or a thin sparkline (mini). */
    variant?: "full" | "mini";
    showLabels?: boolean;
}

/**
 * Stacked horizontal bar showing the detractor / passive / promoter split.
 * Percentages always sum to 100 (largest bucket absorbs rounding remainder).
 */
export function NpsBucketBar({ counts, variant = "full", showLabels = true }: Props) {
    const { detractorPct, passivePct, promoterPct } = computePercentages(counts);
    const total = counts.total;
    const height = variant === "mini" ? "h-1.5" : "h-3";

    if (total === 0) {
        return (
            <div className={`w-full ${height} rounded-full bg-slate-100 dark:bg-slate-800`} />
        );
    }

    return (
        <div className="w-full">
            <div className={`flex w-full ${height} rounded-full overflow-hidden bg-slate-100 dark:bg-slate-800`}>
                {detractorPct > 0 && (
                    <div
                        style={{ width: `${detractorPct}%` }}
                        className="bg-red-500"
                        title={`Detractors: ${counts.detractor} (${detractorPct}%)`}
                    />
                )}
                {passivePct > 0 && (
                    <div
                        style={{ width: `${passivePct}%` }}
                        className="bg-amber-400"
                        title={`Passives: ${counts.passive} (${passivePct}%)`}
                    />
                )}
                {promoterPct > 0 && (
                    <div
                        style={{ width: `${promoterPct}%` }}
                        className="bg-emerald-500"
                        title={`Promoters: ${counts.promoter} (${promoterPct}%)`}
                    />
                )}
            </div>
            {showLabels && variant === "full" && (
                <div className="flex justify-between text-[10px] text-slate-500 dark:text-slate-400 mt-1.5 font-medium tabular-nums">
                    <span><span className="text-red-500">●</span> {detractorPct}% detractors ({counts.detractor})</span>
                    <span><span className="text-amber-500">●</span> {passivePct}% passives ({counts.passive})</span>
                    <span><span className="text-emerald-500">●</span> {promoterPct}% promoters ({counts.promoter})</span>
                </div>
            )}
        </div>
    );
}
