"use client";

import React from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ChevronDown, Table2, MessageSquare, BarChart2, Search, Loader2, Lightbulb } from "lucide-react";

type RawDataExplorerProps = {
    rawDataTab: "comments" | "ratings";
    setRawDataTab: (tab: "comments" | "ratings") => void;
    showRawData: boolean;
    setShowRawData: (show: boolean) => void;
    rawDataPage: number;
    setRawDataPage: React.Dispatch<React.SetStateAction<number>>;
    rawDataSearch: string;
    setRawDataSearch: (search: string) => void;
    rawDataLoading: boolean;
    rawDataEntries: any[];
    rawDataTotal: number;
    RAW_PAGE_SIZE: number;
    suggestionOnly: boolean;
    setSuggestionOnly: (v: boolean) => void;
    hideRatings?: boolean;
};

export default function RawDataExplorer({
    rawDataTab,
    setRawDataTab,
    showRawData,
    setShowRawData,
    rawDataPage,
    setRawDataPage,
    rawDataSearch,
    setRawDataSearch,
    rawDataLoading,
    rawDataEntries,
    rawDataTotal,
    RAW_PAGE_SIZE,
    suggestionOnly,
    setSuggestionOnly,
    hideRatings = false,
}: RawDataExplorerProps) {
    return (
        <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm print:hidden">
            <CardHeader className="py-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors" onClick={() => setShowRawData(!showRawData)}>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Table2 className="w-5 h-5 text-slate-600 dark:text-slate-400" />
                        <CardTitle className="text-base text-slate-800 dark:text-slate-100">Student voices about the supporting unit's services</CardTitle>
                        <Badge variant="outline" className="text-[10px] dark:border-slate-700 dark:text-slate-300">Verify</Badge>
                    </div>
                    <ChevronDown className={`w-4 h-4 text-slate-400 dark:text-slate-500 transition-transform ${showRawData ? 'rotate-180' : ''}`} />
                </div>
                <CardDescription className="dark:text-slate-500">Browse individual student comments and ratings</CardDescription>
            </CardHeader>

            {showRawData && (
                <CardContent className="pt-0">
                    {/* Tab Switcher */}
                    <div className="flex items-center gap-4 mb-4 border-b border-slate-200 dark:border-slate-800">
                        <button onClick={() => { setRawDataTab("comments"); setRawDataPage(0); }} className={`pb-2 text-sm font-medium border-b-2 transition-colors ${rawDataTab === "comments" ? "border-indigo-500 text-indigo-700 dark:text-indigo-400" : "border-transparent text-slate-400 hover:text-slate-600 dark:text-slate-400 dark:hover:text-slate-200"}`}>
                            <MessageSquare className="w-3 h-3 inline mr-1" /> Comments
                        </button>
                        {!hideRatings && (
                        <button onClick={() => { setRawDataTab("ratings"); setRawDataPage(0); }} className={`pb-2 text-sm font-medium border-b-2 transition-colors ${rawDataTab === "ratings" ? "border-indigo-500 text-indigo-700 dark:text-indigo-400" : "border-transparent text-slate-400 hover:text-slate-600 dark:text-slate-400 dark:hover:text-slate-200"}`}>
                            <BarChart2 className="w-3 h-3 inline mr-1" /> Ratings
                        </button>
                        )}
                        <div className="flex-1" />
                        {rawDataTab === "comments" && (
                            <button
                                onClick={() => { setSuggestionOnly(!suggestionOnly); setRawDataPage(0); }}
                                className={`flex items-center gap-1.5 px-2.5 py-1 mb-1 rounded-lg text-xs font-medium border transition-colors ${
                                    suggestionOnly
                                        ? "bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-700"
                                        : "bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-amber-300 dark:hover:border-amber-700"
                                }`}
                            >
                                <Lightbulb className={`w-3.5 h-3.5 ${suggestionOnly ? "fill-current" : ""}`} />
                                Suggestions only
                            </button>
                        )}
                        <div className="relative mb-1">
                            <Search className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
                            <Input placeholder="Search..." className="h-7 pl-7 text-xs w-40 dark:bg-slate-800 dark:border-slate-700" value={rawDataSearch} onChange={e => { setRawDataSearch(e.target.value); setRawDataPage(0); }} />
                        </div>
                    </div>

                    {/* Table */}
                    {rawDataLoading ? (
                        <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
                    ) : (
                        <>
                            <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
                                <table className="w-full text-sm">
                                    <thead className="bg-slate-50 dark:bg-slate-950/50">
                                        <tr>
                                            {rawDataTab === "comments" ? (
                                                <>
                                                    <th className="text-left p-2 font-medium text-slate-600 dark:text-slate-300 w-[45%]">Comment</th>
                                                    <th className="text-left p-2 font-medium text-slate-600 dark:text-slate-300">Category</th>
                                                    <th className="text-left p-2 font-medium text-slate-600 dark:text-slate-300">Study Program</th>
                                                    <th className="text-left p-2 font-medium text-slate-600 dark:text-slate-300">Sentiment</th>
                                                </>
                                            ) : (
                                                <>
                                                    <th className="text-left p-2 font-medium text-slate-600 dark:text-slate-300 w-[40%]">Question</th>
                                                    <th className="text-left p-2 font-medium text-slate-600 dark:text-slate-300">Score</th>
                                                    <th className="text-left p-2 font-medium text-slate-600 dark:text-slate-300">Raw Text</th>
                                                </>
                                            )}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                        {rawDataEntries.map((entry, i) => (
                                            <tr key={entry.id || i} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                                                {rawDataTab === "comments" ? (
                                                    <>
                                                        <td className="p-2 text-slate-700 dark:text-slate-300">{entry.segment_text}</td>
                                                        <td className="p-2 space-y-1">
                                                            <Badge variant="outline" className="text-[10px] dark:border-slate-700 dark:text-slate-300">{entry.category_name}</Badge>
                                                            {entry.is_suggestion && (
                                                                <span className="flex items-center gap-1 text-[10px] font-medium text-amber-700 dark:text-amber-400">
                                                                    <Lightbulb className="w-3 h-3 fill-current" /> Suggestion
                                                                </span>
                                                            )}
                                                        </td>
                                                        <td className="p-2">
                                                            {entry.study_program
                                                                ? <span className="text-[11px] text-slate-600 dark:text-slate-400">{entry.study_program}</span>
                                                                : <span className="text-[11px] text-slate-300 dark:text-slate-600">—</span>}
                                                        </td>
                                                        <td className="p-2"><span className={`inline-flex items-center gap-1 text-[10px] font-medium ${entry.sentiment === 'Positive' ? 'text-green-700 dark:text-green-400' : entry.sentiment === 'Negative' ? 'text-red-700 dark:text-red-400' : 'text-slate-500 dark:text-slate-400'}`}><span className={`w-1.5 h-1.5 rounded-full ${entry.sentiment === 'Positive' ? 'bg-green-500' : entry.sentiment === 'Negative' ? 'bg-red-500' : 'bg-slate-400'}`} />{entry.sentiment}</span></td>
                                                    </>
                                                ) : (
                                                    <>
                                                        <td className="p-2 text-slate-700 dark:text-slate-300 font-medium">{entry.source_column}</td>
                                                        <td className="p-2"><Badge className={`text-[10px] ${entry.numerical_score <= 1 ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' : entry.numerical_score === 2 ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400' : 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'}`}>{entry.numerical_score}</Badge></td>
                                                        <td className="p-2 text-slate-500 dark:text-slate-400 italic">{entry.raw_text || '—'}</td>
                                                    </>
                                                )}
                                            </tr>
                                        ))}
                                        {rawDataEntries.length === 0 && (
                                            <tr><td colSpan={rawDataTab === "comments" ? 4 : 3} className="p-6 text-center text-slate-400 dark:text-slate-500">No data found.</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            {/* Pagination */}
                            <div className="flex items-center justify-between mt-3 text-sm text-slate-500">
                                <span>Showing {rawDataPage * RAW_PAGE_SIZE + 1}–{Math.min((rawDataPage + 1) * RAW_PAGE_SIZE, rawDataTotal)} of {rawDataTotal}</span>
                                <div className="flex gap-1">
                                    <Button variant="outline" size="sm" className="h-6 text-xs" disabled={rawDataPage === 0} onClick={() => setRawDataPage(p => p - 1)}>Previous</Button>
                                    <Button variant="outline" size="sm" className="h-6 text-xs" disabled={(rawDataPage + 1) * RAW_PAGE_SIZE >= rawDataTotal} onClick={() => setRawDataPage(p => p + 1)}>Next</Button>
                                </div>
                            </div>
                        </>
                    )}
                </CardContent>
            )}
        </Card>
    );
}
