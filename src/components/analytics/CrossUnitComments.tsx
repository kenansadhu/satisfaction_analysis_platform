"use client";

import { useEffect, useState } from "react";
import { MessageSquareQuote, ArrowRight, X, ChevronDown, Loader2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

interface Comment {
    id: number;
    segment_text: string;
    sentiment: string;
    source_unit_id: number;
    source_unit_name: string;
    mentioned_units: { id: number; name: string }[];
}

export interface UnitOption {
    id: number;
    name: string;
}

const SENTIMENT_STYLES: Record<string, { bg: string; text: string; border: string; dot: string }> = {
    Positive: {
        bg: "bg-emerald-50 dark:bg-emerald-950/30",
        text: "text-emerald-700 dark:text-emerald-400",
        border: "border-emerald-200 dark:border-emerald-800",
        dot: "bg-emerald-500",
    },
    Negative: {
        bg: "bg-red-50 dark:bg-red-950/30",
        text: "text-red-700 dark:text-red-400",
        border: "border-red-200 dark:border-red-800",
        dot: "bg-red-500",
    },
    Neutral: {
        bg: "bg-slate-50 dark:bg-slate-800/40",
        text: "text-slate-600 dark:text-slate-400",
        border: "border-slate-200 dark:border-slate-700",
        dot: "bg-slate-400",
    },
};

const LEFT_BORDER: Record<string, string> = {
    Positive: "border-l-emerald-400",
    Negative: "border-l-red-400",
    Neutral: "border-l-slate-300 dark:border-l-slate-600",
};

function CommentCard({ comment }: { comment: Comment }) {
    const style = SENTIMENT_STYLES[comment.sentiment] ?? SENTIMENT_STYLES.Neutral;
    const border = LEFT_BORDER[comment.sentiment] ?? LEFT_BORDER.Neutral;

    return (
        <div className={`border-l-4 ${border} bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-r-xl px-4 py-3.5 space-y-2.5`}>
            {/* Header row */}
            <div className="flex items-center flex-wrap gap-1.5">
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                    {comment.source_unit_name}
                </span>
                <span className="text-slate-300 dark:text-slate-600 text-xs">mentions</span>
                {comment.mentioned_units.map(u => (
                    <span
                        key={u.id}
                        className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-900/50"
                    >
                        {u.name}
                    </span>
                ))}
                <span className={`ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${style.bg} ${style.text} ${style.border}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
                    {comment.sentiment}
                </span>
            </div>

            {/* Quote */}
            <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed italic">
                &ldquo;{comment.segment_text}&rdquo;
            </p>
        </div>
    );
}

function CommentSkeleton() {
    return (
        <div className="border-l-4 border-l-slate-200 dark:border-l-slate-700 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-r-xl px-4 py-3.5 space-y-2.5">
            <div className="flex items-center gap-2">
                <Skeleton className="h-5 w-20 rounded-full" />
                <Skeleton className="h-3 w-10" />
                <Skeleton className="h-5 w-24 rounded-full" />
                <Skeleton className="h-5 w-16 rounded-full ml-auto" />
            </div>
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
        </div>
    );
}

export function CrossUnitComments({
    surveyId,
}: {
    surveyId: string;
}) {
    const [comments, setComments] = useState<Comment[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(0);
    const [loading, setLoading] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [sourceFilter, setSourceFilter] = useState<string>("all");
    const [targetFilter, setTargetFilter] = useState<string>("all");
    const [availableUnits, setAvailableUnits] = useState<UnitOption[]>([]);

    // Fetch comments whenever filters or survey change
    useEffect(() => {
        if (!surveyId || surveyId === "all") return;
        setPage(0);
        setComments([]);
        setLoading(true);

        const params = new URLSearchParams({ surveyId, page: "0" });
        if (sourceFilter !== "all") params.set("sourceUnitId", sourceFilter);
        if (targetFilter !== "all") params.set("targetUnitId", targetFilter);

        fetch(`/api/executive/cross-unit-comments?${params}`)
            .then(r => r.json())
            .then(d => {
                setComments(d.comments || []);
                setTotal(d.total ?? 0);
                if (d.availableUnits?.length) setAvailableUnits(d.availableUnits);
            })
            .catch(() => setComments([]))
            .finally(() => setLoading(false));
    }, [surveyId, sourceFilter, targetFilter]);

    const loadMore = () => {
        const nextPage = page + 1;
        setLoadingMore(true);

        const params = new URLSearchParams({ surveyId, page: String(nextPage) });
        if (sourceFilter !== "all") params.set("sourceUnitId", sourceFilter);
        if (targetFilter !== "all") params.set("targetUnitId", targetFilter);

        fetch(`/api/executive/cross-unit-comments?${params}`)
            .then(r => r.json())
            .then(d => {
                setComments(prev => [...prev, ...(d.comments || [])]);
                setPage(nextPage);
            })
            .catch(() => { })
            .finally(() => setLoadingMore(false));
    };

    const hasMore = comments.length < total;
    const isFiltered = sourceFilter !== "all" || targetFilter !== "all";

    const clearFilters = () => {
        setSourceFilter("all");
        setTargetFilter("all");
    };

    if (!surveyId || surveyId === "all") return null;

    return (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4">
            {/* Header */}
            <div className="flex items-start justify-between gap-3">
                <div>
                    <div className="flex items-center gap-2">
                        <MessageSquareQuote className="w-4 h-4 text-indigo-500" />
                        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                            Student Quotes — Cross-Unit Mentions
                        </h2>
                        {!loading && (
                            <Badge className="bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/50 text-[11px] px-2 py-0 h-5">
                                {total} comment{total !== 1 ? "s" : ""}
                            </Badge>
                        )}
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5 ml-6">
                        Actual student feedback segments that reference another unit
                    </p>
                </div>
            </div>

            {/* Filter bar */}
            <div className="flex items-center flex-wrap gap-2 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-700/50">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400 shrink-0">Filter:</span>

                <Select value={sourceFilter} onValueChange={setSourceFilter}>
                    <SelectTrigger className="h-8 w-44 text-xs bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700">
                        <SelectValue placeholder="From any unit" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">From any unit</SelectItem>
                        {availableUnits.map(u => (
                            <SelectItem key={u.id} value={String(u.id)}>
                                {u.name}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />

                <Select value={targetFilter} onValueChange={setTargetFilter}>
                    <SelectTrigger className="h-8 w-44 text-xs bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700">
                        <SelectValue placeholder="Mentioning any unit" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Mentioning any unit</SelectItem>
                        {availableUnits.map(u => (
                            <SelectItem key={u.id} value={String(u.id)}>
                                {u.name}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                {isFiltered && (
                    <button
                        onClick={clearFilters}
                        className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors ml-1"
                    >
                        <X className="w-3.5 h-3.5" /> Clear
                    </button>
                )}
            </div>

            {/* Comment list */}
            {loading ? (
                <div className="space-y-3">
                    {[1, 2, 3, 4].map(i => <CommentSkeleton key={i} />)}
                </div>
            ) : comments.length === 0 ? (
                <div className="py-10 flex flex-col items-center gap-2 text-slate-400">
                    <MessageSquareQuote className="w-8 h-8 opacity-20" />
                    <p className="text-sm font-medium">No comments found</p>
                    {isFiltered && (
                        <p className="text-xs">Try removing a filter to see more results.</p>
                    )}
                </div>
            ) : (
                <div className="space-y-2.5">
                    {comments.map(c => <CommentCard key={c.id} comment={c} />)}

                    {hasMore && (
                        <button
                            onClick={loadMore}
                            disabled={loadingMore}
                            className="w-full mt-1 flex items-center justify-center gap-2 py-2.5 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 border border-slate-200 dark:border-slate-700 hover:border-indigo-200 dark:hover:border-indigo-800 rounded-xl transition-colors disabled:opacity-50"
                        >
                            {loadingMore
                                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading...</>
                                : <><ChevronDown className="w-3.5 h-3.5" /> Show more ({total - comments.length} remaining)</>
                            }
                        </button>
                    )}

                    <p className="text-center text-[11px] text-slate-400 pt-1">
                        Showing {comments.length} of {total} comments
                    </p>
                </div>
            )}
        </div>
    );
}
