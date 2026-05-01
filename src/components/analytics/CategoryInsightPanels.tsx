"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Users2, Zap } from "lucide-react";

interface UnitCategoryData {
    unit_id: number;
    unit_name: string;
    short_name: string;
    positive: number;
    negative: number;
    neutral: number;
    total: number;
    positive_pct: number;
    negative_pct: number;
}

interface CategoryInsight {
    category_name: string;
    units: UnitCategoryData[];
}

const CATEGORY_META: Record<string, { icon: any; color: string; bg: string }> = {
    "Staff Service & Attitude": {
        icon: Users2,
        color: "text-violet-600 dark:text-violet-400",
        bg: "bg-violet-100 dark:bg-violet-900/30",
    },
    "Service & Response Speed": {
        icon: Zap,
        color: "text-sky-600 dark:text-sky-400",
        bg: "bg-sky-100 dark:bg-sky-900/30",
    },
};

const DEFAULT_META = {
    icon: Users2,
    color: "text-indigo-600 dark:text-indigo-400",
    bg: "bg-indigo-100 dark:bg-indigo-900/30",
};

function rankBadgeClass(i: number) {
    if (i === 0) return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";
    if (i === 1) return "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300";
    if (i === 2) return "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400";
    return "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400";
}

function scoreChipClass(pct: number) {
    if (pct >= 70) return "text-emerald-700 bg-emerald-50 border border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-800 dark:text-emerald-400";
    if (pct >= 50) return "text-amber-700 bg-amber-50 border border-amber-200 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-400";
    return "text-red-700 bg-red-50 border border-red-200 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400";
}

function CategoryPanel({ insight, loading }: { insight?: CategoryInsight; loading: boolean }) {
    const meta = insight ? (CATEGORY_META[insight.category_name] ?? DEFAULT_META) : DEFAULT_META;
    const Icon = meta.icon;

    return (
        <Card className="border-slate-200 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-900">
            <CardHeader className="pb-3 border-b border-slate-100 dark:border-slate-800">
                <CardTitle className="text-sm font-semibold flex items-center gap-2 text-slate-700 dark:text-slate-200">
                    <div className={`p-1.5 rounded-lg ${meta.bg}`}>
                        <Icon className={`w-3.5 h-3.5 ${meta.color}`} />
                    </div>
                    {loading
                        ? <Skeleton className="h-4 w-44" />
                        : (insight?.category_name ?? "—")
                    }
                    {!loading && insight && (
                        <span className="ml-auto text-[10px] font-normal text-slate-400">
                            {insight.units.length} units
                        </span>
                    )}
                </CardTitle>
            </CardHeader>

            <CardContent className="pt-4 space-y-3">
                {loading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                        <div key={i} className="space-y-1.5 animate-pulse">
                            <div className="flex items-center gap-2">
                                <Skeleton className="h-5 w-5 rounded-full shrink-0" />
                                <Skeleton className="h-3.5 flex-1" />
                                <Skeleton className="h-5 w-12 rounded-full" />
                            </div>
                            <Skeleton className="h-1.5 ml-7 rounded-full" />
                        </div>
                    ))
                ) : !insight || insight.units.length === 0 ? (
                    <p className="text-sm text-slate-400 text-center py-6 italic">No data available</p>
                ) : (
                    insight.units.map((unit, i) => (
                        <div key={unit.unit_id} className="group">
                            <div className="flex items-center gap-2.5 mb-1">
                                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${rankBadgeClass(i)}`}>
                                    {i + 1}
                                </span>
                                <span
                                    className="text-xs font-medium text-slate-700 dark:text-slate-300 flex-1 truncate"
                                    title={unit.unit_name}
                                >
                                    {unit.short_name}
                                </span>
                                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${scoreChipClass(unit.positive_pct)}`}>
                                    {unit.positive_pct}%
                                </span>
                            </div>

                            {/* Stacked sentiment bar */}
                            <div className="ml-7 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden flex">
                                <div
                                    className="h-full bg-emerald-500 transition-all duration-700"
                                    style={{ width: `${unit.positive_pct}%` }}
                                    title={`Positive: ${unit.positive}`}
                                />
                                <div
                                    className="h-full bg-slate-300 dark:bg-slate-600"
                                    style={{ width: `${unit.total > 0 ? (unit.neutral / unit.total * 100) : 0}%` }}
                                    title={`Neutral: ${unit.neutral}`}
                                />
                                <div
                                    className="h-full bg-red-400"
                                    style={{ width: `${unit.negative_pct}%` }}
                                    title={`Negative: ${unit.negative}`}
                                />
                            </div>

                            {/* Hover detail */}
                            <div className="ml-7 flex justify-between text-[10px] text-slate-400 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                <span className="text-emerald-600 dark:text-emerald-500">{unit.positive} pos</span>
                                <span>{unit.neutral} neu</span>
                                <span className="text-red-500">{unit.negative} neg · {unit.total} total</span>
                            </div>
                        </div>
                    ))
                )}
            </CardContent>
        </Card>
    );
}

export function CategoryInsightPanels({
    surveyId,
    hideHeader = false,
}: {
    surveyId: string | null | undefined;
    hideHeader?: boolean;
}) {
    const [categories, setCategories] = useState<CategoryInsight[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!surveyId || surveyId === "all") {
            setCategories([]);
            return;
        }
        setLoading(true);
        fetch(`/api/executive/category-insights?surveyId=${surveyId}`)
            .then(r => r.json())
            .then(data => setCategories(data.categories || []))
            .catch(() => setCategories([]))
            .finally(() => setLoading(false));
    }, [surveyId]);

    if (!surveyId || surveyId === "all") return null;

    return (
        <div className={hideHeader ? "" : "space-y-3"}>
            {!hideHeader && (
                <div className="flex items-center gap-3">
                    <h2 className="text-sm font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                        Cross-Unit Category Insights
                    </h2>
                    <span className="text-xs text-slate-400 dark:text-slate-500">
                        Categories tracked across all units — ranked by positive sentiment
                    </span>
                </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {loading ? (
                    <>
                        <CategoryPanel loading />
                        <CategoryPanel loading />
                    </>
                ) : categories.length > 0 ? (
                    categories.map(cat => (
                        <CategoryPanel key={cat.category_name} insight={cat} loading={false} />
                    ))
                ) : (
                    <div className="col-span-2 text-center py-8 text-slate-400 text-sm italic">
                        No shared category data available for this survey.
                    </div>
                )}
            </div>
        </div>
    );
}
