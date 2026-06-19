"use client";

import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { useTheme } from "next-themes";
import { MessageSquare, ArrowLeftRight, Pencil, Check, X } from "lucide-react";
import { supabase } from "@/lib/supabase";

const CROSS_PAGE_SIZE = 15;

type CrossUnitSegment = {
    id: number;
    segment_text: string;
    sentiment: string;
    category_name: string;
    tagged_units: string;
    related_unit_ids: number[];
};

type DashboardQualViewProps = {
    catCounts: Record<string, any>;
    handleQualDrillDown: (data: any) => void;
    crossUnitSegments: CrossUnitSegment[];
    allUnits: { id: number; name: string }[];
    unitId: string;
    surveyId?: string;
    /** "chart" = only Sentiment by Category, "cross" = only Cross-Unit Mentions, omit = both */
    section?: "chart" | "cross";
};

export default function DashboardQualView({ catCounts, handleQualDrillDown, crossUnitSegments, allUnits, unitId, surveyId, section }: DashboardQualViewProps) {
    const { theme, systemTheme } = useTheme();
    const isDark = theme === "dark" || (theme === "system" && systemTheme === "dark");
    const [crossPage, setCrossPage] = useState(0);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [editIds, setEditIds] = useState<number[]>([]);
    const [saving, setSaving] = useState(false);
    const [localSegments, setLocalSegments] = useState<CrossUnitSegment[]>(crossUnitSegments);

    // Sync when parent updates
    const [prevProp, setPrevProp] = useState(crossUnitSegments);
    if (crossUnitSegments !== prevProp) {
        setPrevProp(crossUnitSegments);
        setLocalSegments(crossUnitSegments);
    }

    const crossTotal = localSegments.length;
    const crossPagedSegments = localSegments.slice(crossPage * CROSS_PAGE_SIZE, (crossPage + 1) * CROSS_PAGE_SIZE);

    const currentUnitIdNum = parseInt(unitId);
    const otherUnits = allUnits.filter(u => u.id !== currentUnitIdNum);

    function startEdit(seg: CrossUnitSegment) {
        setEditingId(seg.id);
        setEditIds(seg.related_unit_ids || []);
    }

    function toggleUnit(id: number) {
        setEditIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    }

    async function saveEdit(segId: number) {
        setSaving(true);
        const finalIds = editIds.includes(currentUnitIdNum) ? editIds : [...editIds, currentUnitIdNum];
        await supabase.from('feedback_segments').update({ related_unit_ids: finalIds }).eq('id', segId);
        // Invalidate the cross-mentions cache so the next load recomputes with the updated tags
        if (surveyId) {
            await supabase.from('survey_cross_mentions_cache').delete().eq('survey_id', parseInt(surveyId));
        }
        setLocalSegments(prev => prev.map(s => {
            if (s.id !== segId) return s;
            const newOtherIds = finalIds.filter(id => id !== currentUnitIdNum);
            const newOtherNames = newOtherIds.map(id => allUnits.find(u => u.id === id)?.name).filter(Boolean).join(', ');
            return { ...s, related_unit_ids: finalIds, tagged_units: newOtherNames };
        }).filter(s => {
            if (s.id !== segId) return true;
            return finalIds.some(id => id !== currentUnitIdNum);
        }));
        setSaving(false);
        setEditingId(null);
    }

    function cancelEdit() {
        setEditingId(null);
        setEditIds([]);
    }

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
            {/* --- SENTIMENT BY CATEGORY (FULL WIDTH) --- */}
            {(!section || section === "chart") && (() => {
                const sortedCats = [...Object.values(catCounts)].sort((a: any, b: any) => {
                    const aOther = (a.name as string).toLowerCase() === "others";
                    const bOther = (b.name as string).toLowerCase() === "others";
                    if (aOther && !bOther) return 1;
                    if (!aOther && bOther) return -1;
                    return b.total - a.total;
                });
                return (
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden print:break-inside-avoid">
                        <div className="h-1 bg-gradient-to-r from-indigo-500 to-violet-500" />
                        <div className="p-4 pb-2">
                            <div className="flex items-center gap-2 mb-0.5">
                                <MessageSquare className="w-4 h-4 text-indigo-500" />
                                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Sentiment by Category</h3>
                            </div>
                            <p className="text-xs text-slate-400 dark:text-slate-500 ml-6">What students are saying, broken down by topic. Sorted by volume.</p>
                        </div>
                        <div className="px-4 pb-4" style={{ height: `${Math.max(300, sortedCats.length * 40 + 40)}px` }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={sortedCats} layout="vertical" margin={{ top: 0, right: 20, bottom: 0, left: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" horizontal vertical={false} stroke={isDark ? "#334155" : "#f1f5f9"} />
                                    <XAxis type="number" tick={{ fontSize: 10, fill: isDark ? "#94a3b8" : "#64748b" }} axisLine={false} tickLine={false} />
                                    <YAxis dataKey="name" type="category" width={180} tick={{ fontSize: 11, fill: isDark ? "#cbd5e1" : "#475569" }} axisLine={false} tickLine={false} />
                                    <Tooltip cursor={{ fill: isDark ? 'rgba(99, 102, 241, 0.1)' : 'rgba(99, 102, 241, 0.05)' }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }} />
                                    <Legend verticalAlign="top" height={30} wrapperStyle={{ color: isDark ? "#cbd5e1" : "#475569", fontWeight: 500 }} />
                                    <Bar dataKey="positive" name="Positive" stackId="a" fill="#22c55e" />
                                    <Bar dataKey="neutral"  name="Neutral"  stackId="a" fill="#94a3b8" />
                                    <Bar dataKey="negative" name="Negative" stackId="a" fill="#ef4444" radius={[0, 4, 4, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                );
            })()}

            {/* --- CROSS-UNIT MENTIONS TABLE --- */}
            {(!section || section === "cross") && localSegments.length > 0 && (
                <Card className="border-amber-200 dark:border-amber-900/40 bg-amber-50/30 dark:bg-amber-950/10 shadow-sm print:hidden">
                    <CardHeader className="py-4 border-b border-amber-100 dark:border-amber-900/30 bg-amber-50/60 dark:bg-amber-950/20">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <ArrowLeftRight className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                                <CardTitle className="text-base text-amber-900 dark:text-amber-100">Cross-Unit Mentions</CardTitle>
                                <Badge className="text-[10px] ml-1 bg-amber-100 border-amber-300 text-amber-800 dark:bg-amber-900/40 dark:border-amber-700 dark:text-amber-300">{crossTotal} comments</Badge>
                            </div>
                            {crossTotal > CROSS_PAGE_SIZE && (
                                <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">
                                    {crossPage * CROSS_PAGE_SIZE + 1}–{Math.min((crossPage + 1) * CROSS_PAGE_SIZE, crossTotal)} of {crossTotal}
                                </span>
                            )}
                        </div>
                        <CardDescription className="text-amber-700/70 dark:text-amber-500/70">Comments processed in this unit that explicitly mention or relate to other departments.</CardDescription>
                    </CardHeader>
                    <CardContent className="p-0">
                        <table className="w-full text-xs">
                            <thead className="bg-amber-50 dark:bg-amber-950/30 border-b border-amber-100 dark:border-amber-900/30">
                                <tr>
                                    <th className="text-left p-3 font-medium text-amber-800 dark:text-amber-300 w-[40%]">Student Comment</th>
                                    <th className="text-left p-3 font-medium text-amber-800 dark:text-amber-300">Sentiment</th>
                                    <th className="text-left p-3 font-medium text-amber-800 dark:text-amber-300">Category</th>
                                    <th className="text-left p-3 font-medium text-amber-800 dark:text-amber-300">Tagged Units</th>
                                    <th className="p-3 w-8"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-amber-100 dark:divide-amber-900/20">
                                {crossPagedSegments.map((entry, i) => (
                                    <tr key={entry.id} className="hover:bg-amber-50/80 dark:hover:bg-amber-950/20">
                                        <td className="p-3 text-slate-700 dark:text-slate-300 leading-relaxed">&ldquo;{entry.segment_text}&rdquo;</td>
                                        <td className="p-3">
                                            <span className={`inline-flex items-center gap-1 text-[10px] font-medium ${entry.sentiment === 'Positive' ? 'text-green-700 dark:text-green-400' : entry.sentiment === 'Negative' ? 'text-red-700 dark:text-red-400' : 'text-slate-500 dark:text-slate-400'}`}>
                                                <span className={`w-1.5 h-1.5 rounded-full ${entry.sentiment === 'Positive' ? 'bg-green-500' : entry.sentiment === 'Negative' ? 'bg-red-500' : 'bg-slate-400'}`} />
                                                {entry.sentiment}
                                            </span>
                                        </td>
                                        <td className="p-3"><Badge variant="outline" className="text-[10px] border-amber-200 text-amber-800 dark:border-amber-800 dark:text-amber-300">{entry.category_name}</Badge></td>
                                        <td className="p-3">
                                            {editingId === entry.id ? (
                                                <div className="flex flex-wrap gap-1">
                                                    {otherUnits.map(u => (
                                                        <button
                                                            key={u.id}
                                                            onClick={() => toggleUnit(u.id)}
                                                            className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${editIds.includes(u.id) ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:border-indigo-400'}`}
                                                        >
                                                            {u.name}
                                                        </button>
                                                    ))}
                                                </div>
                                            ) : (
                                                <span className="font-semibold text-indigo-600 dark:text-indigo-400">{entry.tagged_units}</span>
                                            )}
                                        </td>
                                        <td className="p-3">
                                            {editingId === entry.id ? (
                                                <div className="flex gap-1">
                                                    <button onClick={() => saveEdit(entry.id)} disabled={saving} className="text-green-600 hover:text-green-700 disabled:opacity-50">
                                                        <Check className="w-3.5 h-3.5" />
                                                    </button>
                                                    <button onClick={cancelEdit} className="text-slate-400 hover:text-slate-600">
                                                        <X className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            ) : (
                                                <button onClick={() => startEdit(entry)} className="text-amber-400 hover:text-amber-600 dark:hover:text-amber-300 opacity-60 hover:opacity-100 transition-opacity">
                                                    <Pencil className="w-3 h-3" />
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {crossTotal > CROSS_PAGE_SIZE && (
                            <div className="flex items-center justify-between px-3 py-2 border-t border-amber-100 dark:border-amber-900/30">
                                <span className="text-[10px] text-amber-600 dark:text-amber-500">Page {crossPage + 1} of {Math.ceil(crossTotal / CROSS_PAGE_SIZE)}</span>
                                <div className="flex gap-1">
                                    <Button variant="outline" size="sm" className="h-6 text-xs border-amber-200 dark:border-amber-800" disabled={crossPage === 0} onClick={() => setCrossPage(p => p - 1)}>Previous</Button>
                                    <Button variant="outline" size="sm" className="h-6 text-xs border-amber-200 dark:border-amber-800" disabled={(crossPage + 1) * CROSS_PAGE_SIZE >= crossTotal} onClick={() => setCrossPage(p => p + 1)}>Next</Button>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
