"use client";

import { Button } from "@/components/ui/button";
import { X, Loader2 } from "lucide-react";

type DrillDownEntry = { id: number; raw_text: string; numerical_score?: number };

export type ActiveQuantDrillDown = {
    question: string;
    filterValue: string;
    type: "SCORE" | "CATEGORY";
    entries: DrillDownEntry[];
    loading: boolean;
};

export type ActiveQualDrillDown = {
    category: string;
    sentiment: string;
};

type DrillDownModalProps = {
    activeQuantDrillDown: ActiveQuantDrillDown | null;
    setActiveQuantDrillDown: (val: ActiveQuantDrillDown | null) => void;

    // Qualitative preview isn't a true modal right now in the original code, but a card that appears. 
    // I am including it here for organization if we choose to make it a modal, 
    // or we can render it as a card as before. We will render it as a modal to match Quant.
    activeQualDrillDown: ActiveQualDrillDown | null;
    setActiveQualDrillDown: (val: ActiveQualDrillDown | null) => void;
    allSegments: any[]; // Used to filter for qualitative
};

export default function DrillDownModal({
    activeQuantDrillDown,
    setActiveQuantDrillDown,
    activeQualDrillDown,
    setActiveQualDrillDown,
    allSegments
}: DrillDownModalProps) {

    // --- QUANTITATIVE MODAL ---
    if (activeQuantDrillDown) {
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in duration-200 print:hidden">
                <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col m-4 border border-slate-200 dark:border-slate-800">
                    <div className="flex items-center justify-between p-4 border-b border-slate-100 dark:border-slate-800">
                        <h3 className="font-semibold text-slate-800 dark:text-slate-100">Drill Down: {activeQuantDrillDown.filterValue}</h3>
                        <Button variant="ghost" size="sm" onClick={() => setActiveQuantDrillDown(null)} className="dark:text-slate-400 dark:hover:text-slate-200"><X className="w-4 h-4" /></Button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 space-y-2">
                        {activeQuantDrillDown.loading ? <Loader2 className="w-6 h-6 animate-spin mx-auto text-blue-500" /> :
                            activeQuantDrillDown.entries.map((e) => (
                                <div key={e.id} className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded border border-slate-100 dark:border-slate-700 text-sm text-slate-700 dark:text-slate-300">{e.raw_text || <em>(No text response)</em>}</div>
                            ))}
                    </div>
                </div>
            </div>
        );
    }

    // --- QUALITATIVE MODAL ---
    if (activeQualDrillDown) {
        const filteredSegments = allSegments.filter(s =>
            s.category_name === activeQualDrillDown.category &&
            (activeQualDrillDown.sentiment === 'Positive' ? s.sentiment === 'Positive' :
                activeQualDrillDown.sentiment === 'Negative' ? s.sentiment === 'Negative' :
                    s.sentiment === 'Neutral')
        );

        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in duration-200 print:hidden">
                <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col m-4 border border-slate-200 dark:border-slate-800">
                    <div className="flex items-center justify-between p-4 border-b border-slate-100 dark:border-slate-800">
                        <h3 className="font-semibold text-slate-800 dark:text-slate-100">Drill Down: {activeQualDrillDown.category} ({activeQualDrillDown.sentiment})</h3>
                        <Button variant="ghost" size="sm" onClick={() => setActiveQualDrillDown(null)} className="dark:text-slate-400 dark:hover:text-slate-200"><X className="w-4 h-4" /></Button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 space-y-2">
                        {filteredSegments.length === 0 ? (
                            <div className="p-3 text-center text-sm text-slate-500">No comments found for this segment.</div>
                        ) : (
                            filteredSegments.map((s) => (
                                <div key={s.id} className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded border border-slate-100 dark:border-slate-700 text-sm text-slate-700 dark:text-slate-300">
                                    &ldquo;{s.segment_text}&rdquo;
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        );
    }

    return null;
}
