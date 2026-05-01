"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Filter, MessageSquare, ChevronDown, Tag } from "lucide-react";

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

export default function DashboardFilters({ isFilterOpen, setIsFilterOpen, activeFilters, setActiveFilters, filterOptions, categories }: FiltersProps) {
    const activeCount = activeFilters.sentiment.length + activeFilters.location.length + activeFilters.faculty.length + activeFilters.program.length + activeFilters.category.length;

    const toggle = (key: keyof ActiveFilters, value: string) => {
        setActiveFilters(p => {
            const arr = p[key] as string[];
            return { ...p, [key]: arr.includes(value) ? arr.filter(x => x !== value) : [...arr, value] };
        });
    };

    return (
        <div className="print:hidden space-y-3">
            <div className="flex items-center justify-between bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3 rounded-xl shadow-sm">
                <div className="flex items-center gap-3">
                    <Filter className="w-5 h-5 text-indigo-500" />
                    <span className="font-medium text-slate-700 dark:text-slate-200">Data Filters</span>

                    {activeCount > 0 && (
                        <div className="flex items-center gap-2 ml-4">
                            <Badge variant="secondary" className="bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400 hover:bg-indigo-100">
                                {activeCount} Active
                            </Badge>
                            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200" onClick={() => setActiveFilters(EMPTY_FILTERS)}>Clear All</Button>
                        </div>
                    )}
                </div>
                <Button variant="outline" size="sm" className="gap-2 dark:border-slate-700 dark:hover:bg-slate-800" onClick={() => setIsFilterOpen(!isFilterOpen)}>
                    {isFilterOpen ? 'Close Filters' : 'Edit Filters'} <ChevronDown className={`w-4 h-4 transition-transform ${isFilterOpen ? 'rotate-180' : ''}`} />
                </Button>
            </div>

            {isFilterOpen && (
                <Card className="border-indigo-100 dark:border-indigo-900/40 bg-indigo-50/30 dark:bg-indigo-950/20 shadow-inner animate-in slide-in-from-top-2">
                    <CardContent className="p-5 grid grid-cols-1 md:grid-cols-4 gap-6">

                        {/* Sentiment */}
                        <div className="space-y-3">
                            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1"><MessageSquare className="w-3 h-3" /> Sentiment</label>
                            <div className="flex flex-col gap-2">
                                {['Positive', 'Neutral', 'Negative'].map(s => (
                                    <label key={s} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer">
                                        <input type="checkbox" className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-800"
                                            checked={activeFilters.sentiment.includes(s)}
                                            onChange={() => toggle('sentiment', s)}
                                        />
                                        <span className={`w-2 h-2 rounded-full ${s === 'Positive' ? 'bg-green-500' : s === 'Negative' ? 'bg-red-500' : 'bg-slate-400'}`} />
                                        {s}
                                    </label>
                                ))}
                            </div>
                        </div>

                        {/* Location */}
                        <div className="space-y-3">
                            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Location</label>
                            <div className="flex flex-col gap-2 max-h-[160px] overflow-y-auto pr-2 custom-scrollbar">
                                {filterOptions.locations.length === 0 ? <span className="text-xs text-slate-400 italic">No locations</span> : filterOptions.locations.map(s => (
                                    <label key={s} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer">
                                        <input type="checkbox" className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-800"
                                            checked={activeFilters.location.includes(s)}
                                            onChange={() => toggle('location', s)}
                                        /> <span className="truncate" title={s}>{s}</span>
                                    </label>
                                ))}
                            </div>
                        </div>

                        {/* Faculty */}
                        <div className="space-y-3">
                            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Faculty</label>
                            <div className="flex flex-col gap-2 max-h-[160px] overflow-y-auto pr-2 custom-scrollbar">
                                {filterOptions.faculties.length === 0 ? <span className="text-xs text-slate-400 italic">No faculties</span> : filterOptions.faculties.map(s => (
                                    <label key={s} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer">
                                        <input type="checkbox" className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-800"
                                            checked={activeFilters.faculty.includes(s)}
                                            onChange={() => toggle('faculty', s)}
                                        /> <span className="truncate" title={s}>{s}</span>
                                    </label>
                                ))}
                            </div>
                        </div>

                        {/* Study Program */}
                        <div className="space-y-3">
                            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Study Program</label>
                            <div className="flex flex-col gap-2 max-h-[160px] overflow-y-auto pr-2 custom-scrollbar">
                                {filterOptions.programs.length === 0 ? <span className="text-xs text-slate-400 italic">No programs</span> : filterOptions.programs.map(s => (
                                    <label key={s} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer">
                                        <input type="checkbox" className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-800"
                                            checked={activeFilters.program.includes(s)}
                                            onChange={() => toggle('program', s)}
                                        /> <span className="truncate" title={s}>{s}</span>
                                    </label>
                                ))}
                            </div>
                        </div>

                        {/* Category — full-width pill toggles so long names can wrap */}
                        {categories.length > 0 && (
                            <div className="col-span-full space-y-3 border-t border-indigo-100 dark:border-indigo-900/40 pt-5">
                                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1">
                                    <Tag className="w-3 h-3" /> Category
                                    {activeFilters.category.length > 0 && (
                                        <button onClick={() => setActiveFilters(p => ({ ...p, category: [] }))} className="ml-2 text-[10px] text-indigo-500 hover:text-indigo-700 font-normal normal-case tracking-normal">Clear</button>
                                    )}
                                </label>
                                <div className="flex flex-wrap gap-2">
                                    {categories.map(c => {
                                        const selected = activeFilters.category.includes(c.name);
                                        return (
                                            <button
                                                key={c.id}
                                                onClick={() => toggle('category', c.name)}
                                                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors leading-snug text-left ${
                                                    selected
                                                        ? 'bg-indigo-600 text-white border-indigo-600 dark:bg-indigo-500 dark:border-indigo-500'
                                                        : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-700 hover:text-indigo-700 dark:hover:text-indigo-400'
                                                }`}
                                            >
                                                {c.name}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                    </CardContent>
                </Card>
            )}
        </div>
    );
}
