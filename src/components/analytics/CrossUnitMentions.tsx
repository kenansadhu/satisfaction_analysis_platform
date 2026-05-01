"use client";

import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, TrendingDown, Minus, GitCompareArrows } from "lucide-react";

interface MentionedUnit {
    unit_id: number;
    unit_name: string;
    unit_short_name: string;
    total_mentions: number;
    source_unit_count: number;
    positive_count: number;
    negative_count: number;
    neutral_count: number;
}

export default function CrossUnitMentions({ surveyId, hideHeader }: { surveyId?: string; hideHeader?: boolean }) {
    const [mentions, setMentions] = useState<MentionedUnit[]>([]);
    const [loading, setLoading] = useState(false);
    const [fromCache, setFromCache] = useState(false);

    useEffect(() => {
        if (!surveyId || surveyId === "all") { setMentions([]); return; }
        setLoading(true);
        fetch(`/api/executive/cross-unit-mentions?surveyId=${surveyId}`)
            .then(r => r.json())
            .then(data => {
                setMentions(data.mentions || []);
                setFromCache(data.fromCache || false);
            })
            .catch(() => setMentions([]))
            .finally(() => setLoading(false));
    }, [surveyId]);

    if (!surveyId || surveyId === "all") return null;

    if (loading) {
        return (
            <div className="space-y-2">
                {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-11 w-full rounded-xl" />)}
            </div>
        );
    }

    if (!mentions.length) {
        return (
            <p className="text-sm text-slate-400 dark:text-slate-500 italic py-2">
                No cross-unit mentions detected for this survey.
            </p>
        );
    }

    const maxMentions = Math.max(...mentions.map(m => m.total_mentions), 1);

    return (
        <div className="space-y-3">
            {!hideHeader && (
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <GitCompareArrows className="w-4 h-4 text-orange-500" />
                        <h2 className="text-xs font-semibold text-orange-700 dark:text-orange-300 uppercase tracking-widest">
                            Cross-Unit Traffic
                        </h2>
                        <span className="text-xs text-slate-400 dark:text-slate-500 ml-1">
                            Units most referenced across other units&apos; feedback
                        </span>
                    </div>
                </div>
            )}

            {fromCache && (
                <p className="text-xs text-slate-400 text-right italic">Served from cache</p>
            )}

            {/* Column headers */}
            <div className="flex items-center gap-3 px-3 pb-1 text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                <span className="w-28 shrink-0">Unit</span>
                <span className="flex-1">Mention volume + sentiment</span>
                <span className="w-16 text-right shrink-0">Mentions</span>
                <span className="w-20 text-right shrink-0">From units</span>
            </div>

            {mentions.map((m, idx) => {
                const total = m.total_mentions;
                const posPct = total > 0 ? (m.positive_count / total) * 100 : 0;
                const negPct = total > 0 ? (m.negative_count / total) * 100 : 0;
                const neuPct = total > 0 ? (m.neutral_count / total) * 100 : 0;
                const barWidth = (total / maxMentions) * 100;
                const dominantSentiment =
                    m.positive_count >= m.negative_count && m.positive_count >= m.neutral_count ? "positive"
                    : m.negative_count >= m.neutral_count ? "negative"
                    : "neutral";

                return (
                    <div
                        key={m.unit_id}
                        className="group flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-orange-200 dark:hover:border-orange-800/50 transition-colors"
                    >
                        {/* Rank */}
                        <span className="text-[10px] font-bold text-slate-400 w-4 shrink-0 tabular-nums">{idx + 1}</span>

                        {/* Unit name */}
                        <div className="w-24 shrink-0 min-w-0">
                            <p className="text-xs font-semibold text-slate-800 dark:text-slate-100 truncate" title={m.unit_name}>
                                {m.unit_short_name}
                            </p>
                        </div>

                        {/* Stacked bar — width proportional to max */}
                        <div className="flex-1 h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                            <div className="h-full flex" style={{ width: `${barWidth}%` }}>
                                <div className="h-full bg-emerald-500" style={{ width: `${posPct}%` }} />
                                <div className="h-full bg-slate-300 dark:bg-slate-600" style={{ width: `${neuPct}%` }} />
                                <div className="h-full bg-red-500" style={{ width: `${negPct}%` }} />
                            </div>
                        </div>

                        {/* Sentiment mini-labels */}
                        <div className="flex items-center gap-1 shrink-0">
                            {dominantSentiment === "positive"
                                ? <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
                                : dominantSentiment === "negative"
                                ? <TrendingDown className="w-3.5 h-3.5 text-red-500" />
                                : <Minus className="w-3.5 h-3.5 text-slate-400" />}
                        </div>

                        {/* Total mentions */}
                        <span className="w-10 text-right text-sm font-black text-slate-700 dark:text-slate-200 tabular-nums shrink-0">
                            {total}
                        </span>

                        {/* Source unit count */}
                        <span className="w-16 text-right text-[10px] text-slate-400 shrink-0">
                            {m.source_unit_count} unit{m.source_unit_count !== 1 ? "s" : ""}
                        </span>
                    </div>
                );
            })}

            {/* Sentiment legend */}
            <div className="flex items-center gap-4 pt-1 text-[11px] text-slate-400 dark:text-slate-500">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" /> Positive</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-slate-300 dark:bg-slate-600 inline-block" /> Neutral</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> Negative</span>
            </div>
        </div>
    );
}
