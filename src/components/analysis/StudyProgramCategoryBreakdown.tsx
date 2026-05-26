"use client";

import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Tag } from "lucide-react";

interface CategoryRow {
    name: string;
    positive: number;
    negative: number;
    neutral: number;
    total: number;
}

function CategoryChip({
    cat,
    active,
    onClick,
}: {
    cat: CategoryRow;
    active: boolean;
    onClick: () => void;
}) {
    const posPct = cat.total > 0 ? Math.round((cat.positive / cat.total) * 100) : 0;
    const negPct = cat.total > 0 ? Math.round((cat.negative / cat.total) * 100) : 0;
    const netColor =
        posPct >= 60 ? "text-emerald-600 dark:text-emerald-400" :
        negPct >= 40 ? "text-red-500 dark:text-red-400" :
        "text-amber-500 dark:text-amber-400";

    return (
        <button
            onClick={onClick}
            className={`group relative flex flex-col gap-2 rounded-xl border px-4 py-3 text-left transition-all duration-150 w-full
                ${active
                    ? "bg-violet-50 dark:bg-violet-950/30 border-violet-300 dark:border-violet-700 shadow-sm ring-1 ring-violet-300 dark:ring-violet-700"
                    : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-violet-200 dark:hover:border-violet-800 hover:shadow-sm"
                }`}
        >
            {/* Name + count */}
            <div className="flex items-start justify-between gap-2">
                <span className={`text-xs font-semibold leading-snug ${active ? "text-violet-700 dark:text-violet-300" : "text-slate-700 dark:text-slate-200"}`}>
                    {cat.name}
                </span>
                <span className={`text-xs font-black tabular-nums shrink-0 ${active ? "text-violet-600 dark:text-violet-400" : netColor}`}>
                    {cat.total}
                </span>
            </div>

            {/* Sentiment bar */}
            <div className="flex h-1.5 rounded-full overflow-hidden bg-slate-100 dark:bg-slate-800">
                {posPct > 0 && <div style={{ width: `${posPct}%` }} className="bg-emerald-400" />}
                {(100 - posPct - negPct) > 0 && <div style={{ width: `${100 - posPct - negPct}%` }} className="bg-slate-300 dark:bg-slate-600" />}
                {negPct > 0 && <div style={{ width: `${negPct}%` }} className="bg-red-400" />}
            </div>

            {/* Pct row */}
            <div className="flex justify-between text-[10px] font-semibold tabular-nums -mt-1">
                <span className="text-emerald-600 dark:text-emerald-400">{posPct}%</span>
                <span className="text-red-500 dark:text-red-400">{negPct}%</span>
            </div>
        </button>
    );
}

export function StudyProgramCategoryBreakdown({
    facultyId,
    surveyId,
    unitIds,
    activeCategoryFilter,
    onCategorySelect,
}: {
    facultyId: string;
    surveyId: string;
    unitIds: number[];
    activeCategoryFilter: string | null;
    onCategorySelect: (cat: string | null) => void;
}) {
    const [categories, setCategories] = useState<CategoryRow[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!surveyId || !unitIds.length) return;
        setLoading(true);
        const params = new URLSearchParams({
            facultyId,
            surveyId,
            unitIds: unitIds.join(","),
        });
        fetch(`/api/faculty-insights/categories?${params}`)
            .then(r => r.json())
            .then(d => setCategories(d.categories || []))
            .catch(() => setCategories([]))
            .finally(() => setLoading(false));
    }, [facultyId, surveyId, unitIds.join(",")]);

    if (!loading && categories.length === 0) return null;

    return (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Tag className="w-4 h-4 text-violet-500" />
                    <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">What students are talking about</h3>
                    {activeCategoryFilter && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-violet-100 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-800">
                            {activeCategoryFilter}
                        </span>
                    )}
                </div>
                {activeCategoryFilter && (
                    <button
                        onClick={() => onCategorySelect(null)}
                        className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                    >
                        Clear filter
                    </button>
                )}
            </div>
            <p className="text-xs text-slate-400 -mt-2 ml-6">
                Click a category to filter the student voices below
            </p>

            {loading ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                    {Array.from({ length: 8 }).map((_, i) => (
                        <Skeleton key={i} className="h-20 rounded-xl" />
                    ))}
                </div>
            ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                    {categories.map(cat => (
                        <CategoryChip
                            key={cat.name}
                            cat={cat}
                            active={activeCategoryFilter === cat.name}
                            onClick={() => onCategorySelect(activeCategoryFilter === cat.name ? null : cat.name)}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
