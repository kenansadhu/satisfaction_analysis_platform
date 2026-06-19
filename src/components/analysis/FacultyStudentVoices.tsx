"use client";

import { useEffect, useState } from "react";
import { MessageSquareQuote, X, ChevronLeft, ChevronRight, Search, Lightbulb } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface Comment {
    id: number;
    segment_text: string;
    sentiment: string;
    category_name: string | null;
    unit_id: number;
    unit_name: string;
    is_suggestion: boolean;
}

interface CategoryRow {
    name: string;
    positive: number;
    negative: number;
    neutral: number;
    total: number;
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

function dotColor(cat: CategoryRow) {
    const posPct = cat.total > 0 ? cat.positive / cat.total : 0;
    const negPct = cat.total > 0 ? cat.negative / cat.total : 0;
    if (negPct >= 0.4) return "bg-red-400";
    if (posPct >= 0.6) return "bg-emerald-400";
    return "bg-amber-400";
}

function countColor(cat: CategoryRow, active: boolean) {
    if (active) return "text-violet-600 dark:text-violet-400";
    const posPct = cat.total > 0 ? cat.positive / cat.total : 0;
    const negPct = cat.total > 0 ? cat.negative / cat.total : 0;
    if (negPct >= 0.4) return "text-red-500 dark:text-red-400";
    if (posPct >= 0.6) return "text-emerald-600 dark:text-emerald-400";
    return "text-amber-500 dark:text-amber-400";
}

function CategoryChip({ cat, active, onClick }: { cat: CategoryRow; active: boolean; onClick: () => void }) {
    const posPct = cat.total > 0 ? Math.round((cat.positive / cat.total) * 100) : 0;
    const negPct = cat.total > 0 ? Math.round((cat.negative / cat.total) * 100) : 0;
    return (
        <button
            onClick={onClick}
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all duration-150 shrink-0
                ${active
                    ? "bg-violet-50 dark:bg-violet-950/30 border-violet-300 dark:border-violet-700 shadow-sm ring-1 ring-violet-200 dark:ring-violet-800"
                    : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:border-violet-200 dark:hover:border-violet-800 hover:shadow-sm"
                }`}
        >
            <span className={`w-2 h-2 rounded-full shrink-0 ${dotColor(cat)}`} />
            <span className={active ? "text-violet-700 dark:text-violet-300 font-semibold" : "text-slate-700 dark:text-slate-200"}>
                {cat.name}
            </span>
            <span className={`font-black tabular-nums ${countColor(cat, active)}`}>{cat.total}</span>
            {/* Mini sentiment bar */}
            <div className="flex w-10 h-1.5 rounded-full overflow-hidden bg-slate-100 dark:bg-slate-700 shrink-0">
                {posPct > 0 && <div style={{ width: `${posPct}%` }} className="bg-emerald-400" />}
                {(100 - posPct - negPct) > 0 && <div style={{ width: `${100 - posPct - negPct}%` }} className="bg-slate-300 dark:bg-slate-500" />}
                {negPct > 0 && <div style={{ width: `${negPct}%` }} className="bg-red-400" />}
            </div>
        </button>
    );
}

function CommentCard({ comment }: { comment: Comment }) {
    const style = SENTIMENT_STYLES[comment.sentiment] ?? SENTIMENT_STYLES.Neutral;
    const border = LEFT_BORDER[comment.sentiment] ?? LEFT_BORDER.Neutral;
    return (
        <div className={`border-l-4 ${border} bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-r-xl px-4 py-3.5 space-y-2`}>
            <div className="flex items-center flex-wrap gap-1.5">
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-900/50">
                    {comment.unit_name}
                </span>
                {comment.category_name && (
                    <Badge variant="outline" className="text-[10px] text-slate-500 dark:text-slate-400 dark:border-slate-700">
                        {comment.category_name}
                    </Badge>
                )}
                {comment.is_suggestion && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                        <Lightbulb className="w-3 h-3" /> Suggestion
                    </span>
                )}
                <span className={`ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${style.bg} ${style.text} ${style.border}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
                    {comment.sentiment}
                </span>
            </div>
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
                <Skeleton className="h-5 w-24 rounded-full" />
                <Skeleton className="h-5 w-20 rounded-full" />
                <Skeleton className="h-5 w-16 rounded-full ml-auto" />
            </div>
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
        </div>
    );
}

export function FacultyStudentVoices({
    facultyId,
    surveyId,
    defaultUnitId,
    restrictToUnitIds,
    title,
    categoryUnitIds,
}: {
    facultyId: string;
    surveyId: string | null;
    defaultUnitId?: string;
    restrictToUnitIds?: number[];
    title?: string;
    categoryUnitIds?: number[];
}) {
    const [comments, setComments] = useState<Comment[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(0);
    const [loading, setLoading] = useState(false);

    const [availableUnits, setAvailableUnits] = useState<{ id: number; name: string }[]>([]);
    const [availableStudyPrograms, setAvailableStudyPrograms] = useState<string[]>([]);

    const [unitFilter, setUnitFilter] = useState(defaultUnitId ?? "all");
    const [sentimentFilter, setSentimentFilter] = useState("all");
    const [studyProgramFilter, setStudyProgramFilter] = useState("all");
    const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
    const [suggestionOnly, setSuggestionOnly] = useState(false);
    const [search, setSearch] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");

    const [categories, setCategories] = useState<CategoryRow[]>([]);

    const PAGE_SIZE = 20;

    // Debounce search
    useEffect(() => {
        const t = setTimeout(() => setDebouncedSearch(search), 350);
        return () => clearTimeout(t);
    }, [search]);

    // Fetch category breakdown — re-runs whenever unit/sentiment/program filters change
    useEffect(() => {
        if (!surveyId || !categoryUnitIds?.length) return;
        const params = new URLSearchParams({ facultyId, surveyId });
        // Use the selected unit if filtered, otherwise pass the full allowed set
        if (unitFilter !== "all") {
            params.set("unitIds", unitFilter);
        } else {
            params.set("unitIds", categoryUnitIds.join(","));
        }
        if (studyProgramFilter !== "all") params.set("studyProgram", studyProgramFilter);
        if (sentimentFilter !== "all") params.set("sentiment", sentimentFilter);
        fetch(`/api/faculty-insights/categories?${params}`)
            .then(r => r.json())
            .then(d => setCategories(d.categories || []))
            .catch(() => setCategories([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [surveyId, facultyId, categoryUnitIds?.join(","), unitFilter, studyProgramFilter, sentimentFilter]);

    const buildParams = (pg: number) => {
        const p = new URLSearchParams({ facultyId, page: String(pg) });
        if (surveyId) p.set("surveyId", surveyId);
        if (unitFilter !== "all") p.set("unitId", unitFilter);
        else if (restrictToUnitIds?.length) p.set("unitIds", restrictToUnitIds.join(","));
        if (sentimentFilter !== "all") p.set("sentiment", sentimentFilter);
        if (studyProgramFilter !== "all") p.set("studyProgram", studyProgramFilter);
        if (categoryFilter) p.set("category", categoryFilter);
        if (suggestionOnly) p.set("suggestion", "true");
        if (debouncedSearch) p.set("search", debouncedSearch);
        return p;
    };

    useEffect(() => {
        if (!surveyId) return;
        setPage(0);
        setComments([]);
        setLoading(true);

        fetch(`/api/faculty-insights/comments?${buildParams(0)}`)
            .then(r => r.json())
            .then(d => {
                setComments(d.comments || []);
                setTotal(d.total ?? 0);
                if (d.availableUnits?.length) setAvailableUnits(d.availableUnits);
                if (d.availableStudyPrograms?.length) setAvailableStudyPrograms(d.availableStudyPrograms);
            })
            .catch(() => setComments([]))
            .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [surveyId, facultyId, unitFilter, sentimentFilter, studyProgramFilter, categoryFilter, suggestionOnly, debouncedSearch]);

    const goToPage = (pg: number) => {
        setLoading(true);
        setComments([]);
        fetch(`/api/faculty-insights/comments?${buildParams(pg)}`)
            .then(r => r.json())
            .then(d => {
                setComments(d.comments || []);
                setTotal(d.total ?? 0);
                setPage(pg);
            })
            .catch(() => {})
            .finally(() => setLoading(false));
    };

    const totalPages = Math.ceil(total / PAGE_SIZE);
    const isFiltered = unitFilter !== "all" || sentimentFilter !== "all" || studyProgramFilter !== "all" || suggestionOnly || !!debouncedSearch || !!categoryFilter;

    const visibleUnits = restrictToUnitIds?.length
        ? availableUnits.filter(u => restrictToUnitIds.includes(u.id))
        : availableUnits;

    const clearFilters = () => {
        setUnitFilter("all");
        setSentimentFilter("all");
        setStudyProgramFilter("all");
        setCategoryFilter(null);
        setSuggestionOnly(false);
        setSearch("");
    };

    if (!surveyId) return null;

    return (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4">
            {/* Header */}
            <div className="flex items-start justify-between gap-3">
                <div>
                    <div className="flex items-center gap-2">
                        <MessageSquareQuote className="w-4 h-4 text-indigo-500" />
                        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">{title ?? "Student Voices"}</h2>
                        {!loading && (
                            <Badge className="bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/50 text-[11px] px-2 py-0 h-5">
                                {total} comment{total !== 1 ? "s" : ""}
                            </Badge>
                        )}
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5 ml-6">
                        What this faculty&apos;s students are saying — filterable by unit, sentiment, and study program
                    </p>
                </div>
            </div>

            {/* Dropdown filter row */}
            <div className="flex items-center flex-wrap gap-2 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-700/50">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400 shrink-0">Filter:</span>

                {/* Unit */}
                <Select value={unitFilter} onValueChange={v => setUnitFilter(v)}>
                    <SelectTrigger className="h-8 w-44 text-xs bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700">
                        <SelectValue placeholder="Any unit" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Any unit</SelectItem>
                        {visibleUnits.map(u => (
                            <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                {/* Sentiment */}
                <Select value={sentimentFilter} onValueChange={v => setSentimentFilter(v)}>
                    <SelectTrigger className="h-8 w-36 text-xs bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700">
                        <SelectValue placeholder="Any sentiment" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Any sentiment</SelectItem>
                        <SelectItem value="Positive">Positive</SelectItem>
                        <SelectItem value="Neutral">Neutral</SelectItem>
                        <SelectItem value="Negative">Negative</SelectItem>
                    </SelectContent>
                </Select>

                {/* Study Program */}
                {availableStudyPrograms.length > 0 && (
                    <Select value={studyProgramFilter} onValueChange={v => setStudyProgramFilter(v)}>
                        <SelectTrigger className="h-8 w-48 text-xs bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700">
                            <SelectValue placeholder="Any program" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Any program</SelectItem>
                            {availableStudyPrograms.map(p => (
                                <SelectItem key={p} value={p}>{p}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                )}

                {/* Search */}
                <div className="relative">
                    <Search className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
                    <Input
                        placeholder="Search..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="h-8 pl-6 text-xs w-36 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700"
                    />
                </div>

                {/* Suggestions toggle */}
                <button
                    onClick={() => setSuggestionOnly(v => !v)}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                        suggestionOnly
                            ? "bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-700"
                            : "bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-amber-300 dark:hover:border-amber-700"
                    }`}
                >
                    <Lightbulb className={`w-3.5 h-3.5 ${suggestionOnly ? "fill-current" : ""}`} />
                    Suggestions only
                </button>

                {isFiltered && (
                    <button
                        onClick={clearFilters}
                        className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors ml-1"
                    >
                        <X className="w-3.5 h-3.5" /> Clear all
                    </button>
                )}
            </div>

            {/* Feedback Themes row */}
            {categories.length > 0 && (
                <div className="space-y-2">
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Feedback Themes</span>
                        {categoryFilter && (
                            <button
                                onClick={() => setCategoryFilter(null)}
                                className="text-[11px] text-violet-500 hover:text-violet-700 dark:hover:text-violet-300 transition-colors"
                            >
                                Clear
                            </button>
                        )}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                        {categories.map(cat => (
                            <CategoryChip
                                key={cat.name}
                                cat={cat}
                                active={categoryFilter === cat.name}
                                onClick={() => setCategoryFilter(categoryFilter === cat.name ? null : cat.name)}
                            />
                        ))}
                    </div>
                </div>
            )}

            {/* Divider before comments */}
            <div className="border-t border-slate-100 dark:border-slate-800" />

            {/* Comment list */}
            {loading ? (
                <div className="space-y-3">
                    {[1, 2, 3, 4].map(i => <CommentSkeleton key={i} />)}
                </div>
            ) : comments.length === 0 ? (
                <div className="py-10 flex flex-col items-center gap-2 text-slate-400">
                    <MessageSquareQuote className="w-8 h-8 opacity-20" />
                    <p className="text-sm font-medium">No comments found</p>
                    {isFiltered && <p className="text-xs">Try removing a filter to see more results.</p>}
                </div>
            ) : (
                <div className="space-y-2.5">
                    {comments.map(c => <CommentCard key={c.id} comment={c} />)}

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div className="flex items-center justify-between pt-2">
                            <p className="text-[11px] text-slate-400">
                                Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total} comments
                            </p>
                            <div className="flex items-center gap-1">
                                <Button variant="outline" size="sm" className="h-7 w-7 p-0" disabled={page === 0} onClick={() => goToPage(page - 1)}>
                                    <ChevronLeft className="w-3.5 h-3.5" />
                                </Button>
                                <span className="text-xs text-slate-500 px-2">{page + 1} / {totalPages}</span>
                                <Button variant="outline" size="sm" className="h-7 w-7 p-0" disabled={page >= totalPages - 1} onClick={() => goToPage(page + 1)}>
                                    <ChevronRight className="w-3.5 h-3.5" />
                                </Button>
                            </div>
                        </div>
                    )}

                    {totalPages <= 1 && (
                        <p className="text-center text-[11px] text-slate-400 pt-1">
                            Showing all {total} comment{total !== 1 ? "s" : ""}
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}
