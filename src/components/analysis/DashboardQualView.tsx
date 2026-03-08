"use client";

import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { useTheme } from "next-themes";
import { MessageSquare, Lightbulb } from "lucide-react";

type DashboardQualViewProps = {
    catCounts: Record<string, any>;
    handleQualDrillDown: (data: any) => void;
    crossUnitSegments: any[];
};

export default function DashboardQualView({ catCounts, handleQualDrillDown, crossUnitSegments }: DashboardQualViewProps) {
    const { theme, systemTheme } = useTheme();
    const isDark = theme === "dark" || (theme === "system" && systemTheme === "dark");

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
            {/* --- SENTIMENT BY CATEGORY (FULL WIDTH) --- */}
            <Card className="shadow-sm border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 print:break-inside-avoid">
                <CardHeader className="pb-2">
                    <div className="flex items-center gap-2">
                        <MessageSquare className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                        <CardTitle className="text-base text-slate-800 dark:text-slate-100">Sentiment by Category</CardTitle>
                    </div>
                    <CardDescription className="dark:text-slate-400">Click bars to view comments. {Object.keys(catCounts).length} categories detected.</CardDescription>
                </CardHeader>
                <CardContent style={{ height: `${Math.max(300, Object.keys(catCounts).length * 40)}px` }}>
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={Object.values(catCounts)} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }} onClick={handleQualDrillDown}>
                            <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke={isDark ? "#334155" : "#e2e8f0"} />
                            <XAxis type="number" tick={{ fill: isDark ? "#94a3b8" : "#64748b" }} />
                            <YAxis dataKey="name" type="category" width={140} tick={{ fontSize: 11, fill: isDark ? "#cbd5e1" : "#475569" }} />
                            <Tooltip cursor={{ fill: isDark ? 'rgba(99, 102, 241, 0.2)' : 'rgba(99, 102, 241, 0.1)' }} contentStyle={isDark ? { backgroundColor: '#1e293b', borderColor: '#334155', color: '#f8fafc' } : undefined} />
                            <Legend wrapperStyle={{ color: isDark ? "#cbd5e1" : undefined }} />
                            <Bar dataKey="positive" stackId="a" fill="#4ade80" name="Positive" radius={[4, 0, 0, 4]} cursor="pointer" />
                            <Bar dataKey="neutral" stackId="a" fill="#94a3b8" name="Neutral" cursor="pointer" />
                            <Bar dataKey="negative" stackId="a" fill="#f87171" name="Negative" radius={[0, 4, 4, 0]} cursor="pointer" />
                        </BarChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card>

            {/* --- CROSS-UNIT MENTIONS TABLE --- */}
            {crossUnitSegments.length > 0 && (
                <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm print:hidden">
                    <CardHeader className="py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
                        <div className="flex items-center gap-2">
                            <Lightbulb className="w-5 h-5 text-amber-500" />
                            <CardTitle className="text-base text-slate-800 dark:text-slate-100">Cross-Unit Mentions</CardTitle>
                            <Badge variant="outline" className="text-[10px] ml-2 border-amber-200 text-amber-700 bg-amber-50 dark:border-amber-900/40 dark:text-amber-400 dark:bg-amber-950/20">{crossUnitSegments.length} comments</Badge>
                        </div>
                        <CardDescription className="dark:text-slate-500">Comments processed in this unit that explicitly mention or relate to other departments.</CardDescription>
                    </CardHeader>
                    <CardContent className="p-0 max-h-[400px] overflow-y-auto custom-scrollbar">
                        <table className="w-full text-xs">
                            <thead className="bg-slate-50 dark:bg-slate-950/50 sticky top-0 z-10 shadow-sm">
                                <tr>
                                    <th className="text-left p-3 font-medium text-slate-600 dark:text-slate-300 w-[45%]">Student Comment</th>
                                    <th className="text-left p-3 font-medium text-slate-600 dark:text-slate-300">Sentiment</th>
                                    <th className="text-left p-3 font-medium text-slate-600 dark:text-slate-300">Category</th>
                                    <th className="text-left p-3 font-medium text-slate-600 dark:text-slate-300">Tagged Units</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {crossUnitSegments.map((entry, i) => (
                                    <tr key={i} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                                        <td className="p-3 text-slate-700 dark:text-slate-300 leading-relaxed">&ldquo;{entry.segment_text}&rdquo;</td>
                                        <td className="p-3">
                                            <span className={`inline-flex items-center gap-1 text-[10px] font-medium ${entry.sentiment === 'Positive' ? 'text-green-700 dark:text-green-400' : entry.sentiment === 'Negative' ? 'text-red-700 dark:text-red-400' : 'text-slate-500 dark:text-slate-400'}`}>
                                                <span className={`w-1.5 h-1.5 rounded-full ${entry.sentiment === 'Positive' ? 'bg-green-500' : entry.sentiment === 'Negative' ? 'bg-red-500' : 'bg-slate-400'}`} />
                                                {entry.sentiment}
                                            </span>
                                        </td>
                                        <td className="p-3"><Badge variant="outline" className="text-[10px] dark:border-slate-700 dark:text-slate-300">{entry.category_name}</Badge></td>
                                        <td className="p-3"><span className="font-semibold text-indigo-600 dark:text-indigo-400">{entry.tagged_units}</span></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
