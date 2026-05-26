"use client";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { useTheme } from "next-themes";
import { BarChart2, Layers } from "lucide-react";

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
    displayGroupByColumn?: Map<string, string | null>;
};

function longestCommonPrefix(strs: string[]): string {
    if (!strs.length) return "";
    let prefix = strs[0];
    for (const s of strs.slice(1)) {
        while (!s.startsWith(prefix)) prefix = prefix.slice(0, -1);
        if (!prefix) return "";
    }
    return prefix;
}

function stripOptionLabel(fullName: string, prefix: string): string {
    const raw = fullName.slice(prefix.length);
    return raw.replace(/^[\s[\(.\-:]+/, "").replace(/[\s\]\)]+$/, "").trim() || fullName;
}

function GroupedBinaryChart({ groupName, cols, isDark }: { groupName: string; cols: QuestionGroup[]; isDark: boolean }) {
    const prefix = longestCommonPrefix(cols.map(c => c.question));
    const chartData = cols
        .map(col => {
            const yesCount = col.chartData.find(d => d.name === "1")?.value ?? 0;
            const total = col.totalResponses;
            const pct = total > 0 ? Math.round((yesCount / total) * 100) : 0;
            return {
                name: stripOptionLabel(col.question, prefix),
                value: yesCount,
                pct,
                total,
            };
        })
        .sort((a, b) => b.value - a.value);

    const LABEL_MAX = 42;
    const maxLabel = Math.min(Math.max(...chartData.map(d => d.name.length)), LABEL_MAX);
    const yAxisWidth = Math.min(Math.max(maxLabel * 6.5, 80), 280);
    const chartHeight = Math.max(180, chartData.length * 40 + 40);
    const totalRespondents = cols[0]?.totalResponses ?? 0;

    return (
        <Card className="hover:shadow-lg transition-all duration-300 border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 col-span-full">
            <CardHeader className="py-4 bg-slate-50/50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                        <Layers className="w-4 h-4 text-emerald-500 shrink-0" />
                        <CardTitle className="text-sm font-semibold text-slate-800 dark:text-slate-100 leading-snug">{groupName}</CardTitle>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <Badge variant="secondary" className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300 text-xs">
                            {cols.length} options
                        </Badge>
                        <span className="text-xs text-slate-400 tabular-nums">out of {totalRespondents.toLocaleString()} respondents</span>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="py-4" style={{ height: chartHeight + 32 }}>
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 48, bottom: 4, left: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={isDark ? "#334155" : "#f1f5f9"} />
                        <XAxis
                            type="number"
                            domain={[0, totalRespondents]}
                            tick={{ fontSize: 11, fill: isDark ? "#94a3b8" : "#64748b" }}
                            axisLine={false}
                            tickLine={false}
                        />
                        <YAxis
                            dataKey="name"
                            type="category"
                            width={yAxisWidth}
                            tick={{ fontSize: 11, fill: isDark ? "#cbd5e1" : "#475569" }}
                            axisLine={false}
                            tickLine={false}
                            tickFormatter={(v: string) => v.length > LABEL_MAX ? v.slice(0, LABEL_MAX - 1) + "…" : v}
                        />
                        <Tooltip
                            cursor={{ fill: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.02)" }}
                            contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }}
                            formatter={(value: any, _: any, props: any) => [
                                `${Number(value).toLocaleString()} (${props.payload?.pct ?? 0}%)`,
                                "Selected (Yes)"
                            ]}
                        />
                        <Bar dataKey="value" barSize={20} radius={[0, 4, 4, 0]} fill="#10b981" />
                    </BarChart>
                </ResponsiveContainer>
            </CardContent>
        </Card>
    );
}

export default function DashboardQuantView({ quantGroups, handleQuantDrillDown, displayGroupByColumn }: DashboardQuantViewProps) {
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
    const allBinaryGroups = quantGroups.filter(g => g.type === "SCORE" && !g.chartData.some(d => parseFloat(d.name) > 1));
    const categoricalGroups = quantGroups.filter(g => g.type === "CATEGORY");

    // Split binary groups: those assigned to a display group vs standalone
    const groupedBinaryMap = new Map<string, QuestionGroup[]>();
    const ungroupedBinary: QuestionGroup[] = [];
    for (const g of allBinaryGroups) {
        const group = displayGroupByColumn?.get(g.question) ?? null;
        if (group) {
            if (!groupedBinaryMap.has(group)) groupedBinaryMap.set(group, []);
            groupedBinaryMap.get(group)!.push(g);
        } else {
            ungroupedBinary.push(g);
        }
    }

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
            {(groupedBinaryMap.size > 0 || ungroupedBinary.length > 0) && (
                <div className="space-y-6 pt-4">
                    <div className="flex items-center gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
                        <div className="h-5 w-1.5 bg-emerald-500 rounded-full shadow-[0_0_10px_rgba(16,185,129,0.5)]" />
                        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 tracking-wider uppercase">Binary Indicators <span className="text-slate-500 dark:text-slate-400 font-normal normal-case tracking-normal ml-2 text-xs bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-md">Scale: 0.0 - 1.0</span></h3>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {/* Grouped multi-select questions — span full width */}
                        {[...groupedBinaryMap.entries()].map(([groupName, cols]) => (
                            <GroupedBinaryChart key={groupName} groupName={groupName} cols={cols} isDark={isDark} />
                        ))}
                        {/* Ungrouped standalone binary columns */}
                        {ungroupedBinary.map((group, idx) => (
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
