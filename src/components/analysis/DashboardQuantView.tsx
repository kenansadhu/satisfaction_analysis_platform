"use client";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { useTheme } from "next-themes";
import { BarChart2 } from "lucide-react";

type ChartData = { name: string; value: number; color?: string };
type QuestionGroup = {
    question: string;
    type: "SCORE" | "CATEGORY";
    average?: string;
    totalResponses: number;
    chartData: ChartData[];
};

type DashboardQuantViewProps = {
    quantGroups: QuestionGroup[];
    handleQuantDrillDown: (question: string, type: "SCORE" | "CATEGORY", filterValue: string) => void;
};

export default function DashboardQuantView({ quantGroups, handleQuantDrillDown }: DashboardQuantViewProps) {
    const { theme, systemTheme } = useTheme();
    const isDark = theme === "dark" || (theme === "system" && systemTheme === "dark");

    if (quantGroups.length === 0) {
        return (
            <div className="text-center py-10 text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-lg">
                No quantitative columns detected.
            </div>
        );
    }

    const scale4Groups = quantGroups.filter(g => g.type === "SCORE" && g.chartData.some(d => parseFloat(d.name) > 1));
    const binaryGroups = quantGroups.filter(g => g.type === "SCORE" && !g.chartData.some(d => parseFloat(d.name) > 1));
    const categoricalGroups = quantGroups.filter(g => g.type === "CATEGORY");

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
            {/* 1-4 Scale (Likert / Ratings) */}
            {scale4Groups.length > 0 && (
                <div className="space-y-6">
                    <div className="flex items-center gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
                        <div className="h-5 w-1.5 bg-blue-500 rounded-full shadow-[0_0_10px_rgba(59,130,246,0.5)]" />
                        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 tracking-wider uppercase">Satisfaction Scores <span className="text-slate-500 dark:text-slate-400 font-normal normal-case tracking-normal ml-2 text-xs bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-md">Scale: 1.0 - 4.0</span></h3>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {scale4Groups.map((group, idx) => (
                            <Card key={`4scale-${idx}`} className="hover:shadow-lg transition-all duration-300 border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 group">
                                <CardHeader className="py-4 bg-slate-50/50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800 relative overflow-hidden">
                                    <div className="absolute top-0 right-0 w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-bl-full opacity-0 group-hover:opacity-100 transition-opacity" />
                                    <div className="flex justify-between items-start gap-4 z-10 relative">
                                        <CardTitle className="text-sm font-semibold text-slate-800 dark:text-slate-100 line-clamp-2 leading-relaxed" title={group.question}>{group.question}</CardTitle>
                                        <Badge variant="secondary" className="bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300 font-bold whitespace-nowrap text-xs">{group.average}</Badge>
                                    </div>
                                </CardHeader>
                                <CardContent className="py-4 h-[180px]">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={group.chartData} layout="horizontal" margin={{ top: 10, right: 10, bottom: 0, left: -20 }}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDark ? "#334155" : "#f1f5f9"} />
                                            <XAxis dataKey="name" tick={{ fontSize: 11, fill: isDark ? "#94a3b8" : "#64748b" }} axisLine={false} tickLine={false} />
                                            <YAxis tick={{ fontSize: 11, fill: isDark ? "#94a3b8" : "#64748b" }} axisLine={false} tickLine={false} />
                                            <Tooltip cursor={{ fill: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)' }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                                            <Bar dataKey="value" barSize={24} radius={[4, 4, 0, 0]} onClick={(d: any) => handleQuantDrillDown(group.question, group.type, d.name)}>
                                                {group.chartData.map((e, i) => <Cell key={i} fill={e.color || "#3b82f6"} className="cursor-pointer hover:opacity-80 transition-opacity" />)}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                </div>
            )}

            {/* 0-1 Scale (Binary / Yes-No) */}
            {binaryGroups.length > 0 && (
                <div className="space-y-6 pt-4">
                    <div className="flex items-center gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
                        <div className="h-5 w-1.5 bg-emerald-500 rounded-full shadow-[0_0_10px_rgba(16,185,129,0.5)]" />
                        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 tracking-wider uppercase">Binary Indicators <span className="text-slate-500 dark:text-slate-400 font-normal normal-case tracking-normal ml-2 text-xs bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-md">Scale: 0.0 - 1.0</span></h3>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {binaryGroups.map((group, idx) => (
                            <Card key={`bin-${idx}`} className="hover:shadow-lg transition-all duration-300 border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                                <CardHeader className="py-4 bg-slate-50/50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800">
                                    <div className="flex justify-between items-start gap-4">
                                        <CardTitle className="text-sm font-semibold text-slate-800 dark:text-slate-100 line-clamp-2 leading-relaxed" title={group.question}>{group.question}</CardTitle>
                                        <Badge variant="secondary" className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300 font-bold whitespace-nowrap text-xs">{group.average}</Badge>
                                    </div>
                                </CardHeader>
                                <CardContent className="py-4 h-[150px]">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={group.chartData} layout="horizontal" margin={{ top: 10, right: 10, bottom: 0, left: -20 }}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDark ? "#334155" : "#f1f5f9"} />
                                            <XAxis dataKey="name" tick={{ fontSize: 11, fill: isDark ? "#94a3b8" : "#64748b" }} axisLine={false} tickLine={false} />
                                            <YAxis tick={{ fontSize: 11, fill: isDark ? "#94a3b8" : "#64748b" }} axisLine={false} tickLine={false} />
                                            <Tooltip cursor={{ fill: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)' }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                                            <Bar dataKey="value" barSize={32} radius={[4, 4, 0, 0]} fill="#10b981" onClick={(d: any) => handleQuantDrillDown(group.question, group.type, d.name)} className="cursor-pointer hover:opacity-80 transition-opacity" />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                </div>
            )}

            {/* Categorical Distribution */}
            {categoricalGroups.length > 0 && (
                <div className="space-y-6 pt-4">
                    <div className="flex items-center gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
                        <div className="h-5 w-1.5 bg-violet-500 rounded-full shadow-[0_0_10px_rgba(139,92,246,0.5)]" />
                        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 tracking-wider uppercase">Categorical Distributions</h3>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {categoricalGroups.map((group, idx) => (
                            <Card key={`cat-${idx}`} className="hover:shadow-lg transition-all duration-300 border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                                <CardHeader className="py-4 bg-slate-50/50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800">
                                    <div className="flex justify-between items-start gap-4">
                                        <CardTitle className="text-sm font-semibold text-slate-800 dark:text-slate-100 line-clamp-2 leading-relaxed" title={group.question}>{group.question}</CardTitle>
                                        <Badge variant="outline" className="border-violet-200 text-violet-700 dark:border-violet-800 dark:text-violet-400 font-medium whitespace-nowrap text-xs">Categories</Badge>
                                    </div>
                                </CardHeader>
                                <CardContent className="py-4 h-[250px]">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={group.chartData} layout="vertical" margin={{ top: 0, right: 30, bottom: 0, left: 0 }}>
                                            <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke={isDark ? "#334155" : "#f1f5f9"} />
                                            <XAxis type="number" tick={{ fontSize: 11, fill: isDark ? "#94a3b8" : "#64748b" }} axisLine={false} tickLine={false} />
                                            <YAxis dataKey="name" type="category" width={110} tick={{ fontSize: 11, fill: isDark ? "#cbd5e1" : "#475569" }} axisLine={false} tickLine={false} />
                                            <Tooltip cursor={{ fill: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)' }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                                            <Bar dataKey="value" barSize={16} radius={[0, 4, 4, 0]} fill="#8b5cf6" onClick={(d: any) => handleQuantDrillDown(group.question, group.type, d.name)}>
                                                {group.chartData.map((e, i) => <Cell key={i} fill={e.color || "#8b5cf6"} className="cursor-pointer hover:opacity-80 transition-opacity" />)}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
