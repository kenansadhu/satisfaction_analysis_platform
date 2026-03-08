"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Filter, MessageSquare, ChevronDown } from "lucide-react";

type FiltersProps = {
    isFilterOpen: boolean;
    setIsFilterOpen: (open: boolean) => void;
    activeFilters: { sentiment: string[]; location: string[]; faculty: string[]; program: string[] };
    setActiveFilters: React.Dispatch<React.SetStateAction<{ sentiment: string[]; location: string[]; faculty: string[]; program: string[] }>>;
    filterOptions: { locations: string[]; faculties: string[]; programs: string[] };
};

export default function DashboardFilters({ isFilterOpen, setIsFilterOpen, activeFilters, setActiveFilters, filterOptions }: FiltersProps) {
    const activeCount = activeFilters.sentiment.length + activeFilters.location.length + activeFilters.faculty.length + activeFilters.program.length;

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
                            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200" onClick={() => setActiveFilters({ sentiment: [], location: [], faculty: [], program: [] })}>Clear All</Button>
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
                                            onChange={(e) => {
                                                if (e.target.checked) setActiveFilters(p => ({ ...p, sentiment: [...p.sentiment, s] }));
                                                else setActiveFilters(p => ({ ...p, sentiment: p.sentiment.filter(x => x !== s) }));
                                            }}
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
                                            onChange={(e) => {
                                                if (e.target.checked) setActiveFilters(p => ({ ...p, location: [...p.location, s] }));
                                                else setActiveFilters(p => ({ ...p, location: p.location.filter(x => x !== s) }));
                                            }}
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
                                            onChange={(e) => {
                                                if (e.target.checked) setActiveFilters(p => ({ ...p, faculty: [...p.faculty, s] }));
                                                else setActiveFilters(p => ({ ...p, faculty: p.faculty.filter(x => x !== s) }));
                                            }}
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
                                            onChange={(e) => {
                                                if (e.target.checked) setActiveFilters(p => ({ ...p, program: [...p.program, s] }));
                                                else setActiveFilters(p => ({ ...p, program: p.program.filter(x => x !== s) }));
                                            }}
                                        /> <span className="truncate" title={s}>{s}</span>
                                    </label>
                                ))}
                            </div>
                        </div>

                    </CardContent>
                </Card>
            )}
        </div>
    );
}
