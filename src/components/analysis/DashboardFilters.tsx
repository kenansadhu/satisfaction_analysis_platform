"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Filter, MessageSquare, ChevronDown, MapPin, GraduationCap, BookOpen } from "lucide-react";

type ActiveFilters = {
    sentiment: string[];
    location: string[];
    faculty: string[];
    program: string[];
    category: string[];
};

type FiltersProps = {
    isFilterOpen: boolean;
    setIsFilterOpen: (open: boolean) => void;
    activeFilters: ActiveFilters;
    setActiveFilters: React.Dispatch<React.SetStateAction<ActiveFilters>>;
    filterOptions: { locations: string[]; faculties: string[]; programs: string[] };
    categories: { id: number; name: string }[];
};

const EMPTY_FILTERS: ActiveFilters = { sentiment: [], location: [], faculty: [], program: [], category: [] };

// Category is intentionally excluded here — it lives inside the Voices card as chips.
// Only demographic + sentiment filters are shown in the main filter bar.
export default function DashboardFilters({ isFilterOpen, setIsFilterOpen, activeFilters, setActiveFilters, filterOptions }: FiltersProps) {
    const activeCount = activeFilters.sentiment.length + activeFilters.location.length + activeFilters.faculty.length + activeFilters.program.length;
    // Don't count category here — it's controlled separately in the voices card

    const toggle = (key: keyof ActiveFilters, value: string) => {
        setActiveFilters(p => {
            const arr = p[key] as string[];
            return { ...p, [key]: arr.includes(value) ? arr.filter(x => x !== value) : [...arr, value] };
        });
    };

    const sentimentConfig = [
        { label: "Positive", dot: "bg-emerald-500", text: "text-emerald-700 dark:text-emerald-400", activeBg: "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-700" },
        { label: "Neutral",  dot: "bg-slate-400",   text: "text-slate-600 dark:text-slate-400",   activeBg: "bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-600" },
        { label: "Negative", dot: "bg-red-500",     text: "text-red-700 dark:text-red-400",       activeBg: "bg-red-50 dark:bg-red-950/30 border-red-300 dark:border-red-700" },
    ];

    return (
        <div className="print:hidden space-y-2">
            {/* Header bar */}
            <div
                className="flex items-center justify-between bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-4 py-2.5 rounded-xl shadow-sm cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
                onClick={() => setIsFilterOpen(!isFilterOpen)}
            >
                <div className="flex items-center gap-3">
                    <Filter className="w-4 h-4 text-indigo-500 shrink-0" />
                    <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Filters</span>

                    {activeCount > 0 ? (
                        <div className="flex items-center gap-2">
                            <Badge className="bg-indigo-600 text-white border-0 text-[11px] px-2 py-0 h-5 font-semibold">
                                {activeCount} active
                            </Badge>
                            <button
                                onClick={e => { e.stopPropagation(); setActiveFilters(EMPTY_FILTERS); }}
                                className="text-[11px] text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                            >
                                Clear all
                            </button>
                        </div>
                    ) : (
                        <span className="text-xs text-slate-400 dark:text-slate-500">Sentiment · Location · Faculty · Program</span>
                    )}
                </div>
                <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${isFilterOpen ? "rotate-180" : ""}`} />
            </div>

            {/* Filter panel */}
            {isFilterOpen && (
                <Card className="border-indigo-100 dark:border-indigo-900/40 bg-white dark:bg-slate-900 shadow-sm animate-in slide-in-from-top-1 duration-150">
                    <CardContent className="p-5 grid grid-cols-1 md:grid-cols-4 gap-5">

                        {/* Sentiment — pill toggles */}
                        <div className="space-y-3">
                            <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                                <MessageSquare className="w-3 h-3" /> Sentiment
                            </label>
                            <div className="flex flex-col gap-1.5">
                                {sentimentConfig.map(({ label, dot, text, activeBg }) => {
                                    const active = activeFilters.sentiment.includes(label);
                                    return (
                                        <button
                                            key={label}
                                            onClick={() => toggle("sentiment", label)}
                                            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all text-left
                                                ${active
                                                    ? `${activeBg} shadow-sm`
                                                    : "bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-indigo-200 dark:hover:border-indigo-800"
                                                }`}
                                        >
                                            <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />
                                            <span className={active ? text : ""}>{label}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Location */}
                        <div className="space-y-3">
                            <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                                <MapPin className="w-3 h-3" /> Location
                            </label>
                            <div className="flex flex-col gap-1.5 max-h-[160px] overflow-y-auto pr-1 custom-scrollbar">
                                {filterOptions.locations.length === 0 ? (
                                    <span className="text-xs text-slate-400 italic">No data</span>
                                ) : filterOptions.locations.map(s => {
                                    const active = activeFilters.location.includes(s);
                                    return (
                                        <label key={s} className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer group">
                                            <input
                                                type="checkbox"
                                                className="rounded border-slate-300 dark:border-slate-600 dark:bg-slate-800 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-0"
                                                checked={active}
                                                onChange={() => toggle("location", s)}
                                            />
                                            <span className="truncate group-hover:text-slate-900 dark:group-hover:text-slate-100 transition-colors" title={s}>{s}</span>
                                        </label>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Faculty */}
                        <div className="space-y-3">
                            <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                                <GraduationCap className="w-3 h-3" /> Faculty
                            </label>
                            <div className="flex flex-col gap-1.5 max-h-[160px] overflow-y-auto pr-1 custom-scrollbar">
                                {filterOptions.faculties.length === 0 ? (
                                    <span className="text-xs text-slate-400 italic">No data</span>
                                ) : filterOptions.faculties.map(s => {
                                    const active = activeFilters.faculty.includes(s);
                                    return (
                                        <label key={s} className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer group">
                                            <input
                                                type="checkbox"
                                                className="rounded border-slate-300 dark:border-slate-600 dark:bg-slate-800 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-0"
                                                checked={active}
                                                onChange={() => toggle("faculty", s)}
                                            />
                                            <span className="truncate group-hover:text-slate-900 dark:group-hover:text-slate-100 transition-colors" title={s}>{s}</span>
                                        </label>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Study Program */}
                        <div className="space-y-3">
                            <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                                <BookOpen className="w-3 h-3" /> Study Program
                            </label>
                            <div className="flex flex-col gap-1.5 max-h-[160px] overflow-y-auto pr-1 custom-scrollbar">
                                {filterOptions.programs.length === 0 ? (
                                    <span className="text-xs text-slate-400 italic">No data</span>
                                ) : filterOptions.programs.map(s => {
                                    const active = activeFilters.program.includes(s);
                                    return (
                                        <label key={s} className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer group">
                                            <input
                                                type="checkbox"
                                                className="rounded border-slate-300 dark:border-slate-600 dark:bg-slate-800 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-0"
                                                checked={active}
                                                onChange={() => toggle("program", s)}
                                            />
                                            <span className="truncate group-hover:text-slate-900 dark:group-hover:text-slate-100 transition-colors" title={s}>{s}</span>
                                        </label>
                                    );
                                })}
                            </div>
                        </div>

                    </CardContent>
                </Card>
            )}
        </div>
    );
}
