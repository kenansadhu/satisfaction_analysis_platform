"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, TrendingUp, BarChart3, PieChart, AlertCircle, X, MessageSquare, ChevronRight } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";

type ChartData = {
    name: string;
    value: number;
    color?: string;
};

type QuestionGroup = {
    question: string;
    type: "SCORE" | "CATEGORY";
    average?: string;
    totalResponses: number;
    chartData: ChartData[];
};

type DrillDownEntry = {
    id: number;
    raw_text: string;
    numerical_score?: number;
};

export default function QuantitativeView({ unitId }: { unitId: string }) {
    const [data, setData] = useState<QuestionGroup[]>([]);
    const [loading, setLoading] = useState(true);

    // Drill-Down State
    const [drillDown, setDrillDown] = useState<{
        question: string;
        filterValue: string;
        type: "SCORE" | "CATEGORY";
        entries: DrillDownEntry[];
        loading: boolean;
    } | null>(null);

    useEffect(() => {
        fetchData();
    }, [unitId]);

    async function fetchData() {
        setLoading(true);

        const { data: scores } = await supabase
            .from('raw_feedback_inputs')
            .select('source_column, numerical_score')
            .eq('target_unit_id', unitId)
            .eq('is_quantitative', true)
            .not('numerical_score', 'is', null);

        const { data: categories } = await supabase
            .from('raw_feedback_inputs')
            .select('source_column, raw_text')
            .eq('target_unit_id', unitId)
            .eq('is_quantitative', false)
            .eq('requires_analysis', false);

        const grouped: Record<string, QuestionGroup> = {};

        scores?.forEach(row => {
            const key = row.source_column;
            if (!grouped[key]) grouped[key] = { question: key, type: "SCORE", totalResponses: 0, chartData: [] };
            const val = row.numerical_score;
            const existingBin = grouped[key].chartData.find(d => d.name === val.toString());
            if (existingBin) existingBin.value++;
            else grouped[key].chartData.push({ name: val.toString(), value: 1 });
            grouped[key].totalResponses++;
        });

        Object.values(grouped).forEach(g => {
            if (g.type === "SCORE") {
                let sum = 0;
                g.chartData.forEach(d => sum += (parseFloat(d.name) * d.value));
                g.average = (sum / g.totalResponses).toFixed(2);
                g.chartData.sort((a, b) => parseFloat(a.name) - parseFloat(b.name));
                g.chartData.forEach(d => {
                    const val = parseFloat(d.name);
                    // 4-point scale: 1=red, 2=amber, 3-4=green
                    if (val <= 1) d.color = "#ef4444";
                    else if (val === 2) d.color = "#f59e0b";
                    else d.color = "#22c55e";
                });
            }
        });

        const catGrouped: Record<string, QuestionGroup> = {};
        categories?.forEach(row => {
            const key = row.source_column;
            if (!catGrouped[key]) catGrouped[key] = { question: key, type: "CATEGORY", totalResponses: 0, chartData: [] };
            const val = row.raw_text || "Unknown";
            const existingBin = catGrouped[key].chartData.find(d => d.name === val);
            if (existingBin) existingBin.value++;
            else catGrouped[key].chartData.push({ name: val, value: 1 });
            catGrouped[key].totalResponses++;
        });

        Object.values(catGrouped).forEach(g => {
            g.chartData.sort((a, b) => b.value - a.value);
            if (g.chartData.length > 8) {
                const others = g.chartData.slice(8).reduce((acc, curr) => acc + curr.value, 0);
                g.chartData = g.chartData.slice(0, 8);
                g.chartData.push({ name: "Others", value: others, color: "#94a3b8" });
            }
        });

        setData([...Object.values(grouped), ...Object.values(catGrouped)]);
        setLoading(false);
    }

    // --- DRILL-DOWN HANDLER ---
    const handleBarClick = useCallback(async (question: string, type: "SCORE" | "CATEGORY", filterValue: string) => {
        setDrillDown({ question, filterValue, type, entries: [], loading: true });

        let query = supabase
            .from('raw_feedback_inputs')
            .select('id, raw_text, numerical_score')
            .eq('target_unit_id', unitId)
            .eq('source_column', question);

        if (type === "SCORE") {
            query = query.eq('numerical_score', parseFloat(filterValue));
        } else {
            query = query.eq('raw_text', filterValue);
        }

        const { data } = await query.limit(50).order('id', { ascending: true });

        setDrillDown(prev => prev ? { ...prev, entries: data || [], loading: false } : null);
    }, [unitId]);

    if (loading) return (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <Loader2 className="w-10 h-10 animate-spin mb-4" />
            Computing Statistics...
        </div>
    );

    if (data.length === 0) return (
        <div className="flex flex-col items-center justify-center py-20 bg-white border-2 border-dashed rounded-xl">
            <AlertCircle className="w-10 h-10 text-slate-300 mb-4" />
            <h3 className="text-lg font-semibold text-slate-700">No Quantitative Data</h3>
            <p className="text-slate-500">This unit has no columns marked as &quot;SCORE&quot; or &quot;CATEGORY&quot;.</p>
        </div>
    );

    return (
        <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
                {data.map((item, idx) => (
                    <Card key={idx} className="flex flex-col h-[350px] group hover:shadow-md transition-shadow">
                        <CardHeader className="pb-2">
                            <div className="flex justify-between items-start gap-4">
                                <CardTitle className="text-base font-medium text-slate-800 line-clamp-2" title={item.question}>
                                    {item.question}
                                </CardTitle>
                                {item.type === "SCORE" ? (
                                    <div className="text-right">
                                        <div className="text-2xl font-bold text-slate-900">{item.average}</div>
                                        <Badge variant="secondary" className="text-[10px]">Avg Score</Badge>
                                    </div>
                                ) : (
                                    <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">Category</Badge>
                                )}
                            </div>
                            <CardDescription className="text-xs flex items-center gap-2">
                                {item.totalResponses} Responses
                                <span className="text-blue-500 text-[10px] opacity-0 group-hover:opacity-100 transition-opacity">
                                    • Click any bar to drill down
                                </span>
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="flex-1 min-h-0 pb-4">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart
                                    data={item.chartData}
                                    layout={item.type === "CATEGORY" ? "vertical" : "horizontal"}
                                    margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                                >
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} horizontal={item.type !== "CATEGORY"} />
                                    {item.type === "CATEGORY" ? (
                                        <>
                                            <XAxis type="number" hide />
                                            <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 10 }} interval={0} />
                                        </>
                                    ) : (
                                        <>
                                            <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                                            <YAxis />
                                        </>
                                    )}
                                    <Tooltip
                                        cursor={{ fill: 'rgba(59,130,246,0.05)' }}
                                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                    />
                                    <Bar
                                        dataKey="value"
                                        radius={[4, 4, 0, 0]}
                                        barSize={30}
                                        className="cursor-pointer"
                                        onClick={(data: any) => {
                                            if (data?.name) handleBarClick(item.question, item.type, data.name);
                                        }}
                                    >
                                        {item.chartData.map((entry, index) => (
                                            <Cell
                                                key={`cell-${index}`}
                                                fill={entry.color || (item.type === "CATEGORY" ? "#8b5cf6" : "#3b82f6")}
                                                className="hover:opacity-80 transition-opacity"
                                            />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* --- DRILL-DOWN PANEL --- */}
            {drillDown && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col animate-in slide-in-from-bottom-8 duration-300">
                        {/* Header */}
                        <div className="flex items-center justify-between p-6 border-b border-slate-100">
                            <div className="space-y-1">
                                <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                                    <MessageSquare className="w-5 h-5 text-blue-500" />
                                    Drill Down
                                </h3>
                                <p className="text-sm text-slate-500">
                                    <span className="font-medium text-slate-700">{drillDown.question}</span>
                                    <ChevronRight className="w-3 h-3 inline mx-1" />
                                    <Badge variant="secondary" className="text-xs">
                                        {drillDown.type === "SCORE" ? `Score: ${drillDown.filterValue}` : drillDown.filterValue}
                                    </Badge>
                                </p>
                            </div>
                            <Button variant="ghost" size="icon" onClick={() => setDrillDown(null)} className="rounded-full">
                                <X className="w-5 h-5" />
                            </Button>
                        </div>

                        {/* Content */}
                        <div className="flex-1 overflow-y-auto p-6">
                            {drillDown.loading ? (
                                <div className="flex justify-center py-12">
                                    <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                                </div>
                            ) : drillDown.entries.length === 0 ? (
                                <div className="text-center py-12 text-slate-400">No matching responses found.</div>
                            ) : (
                                <div className="space-y-3">
                                    <div className="text-sm text-slate-500 mb-4">
                                        Showing {drillDown.entries.length} response{drillDown.entries.length > 1 ? 's' : ''}
                                    </div>
                                    {drillDown.entries.map((entry, i) => (
                                        <div key={entry.id} className="group flex gap-3 p-3 bg-slate-50 hover:bg-blue-50/50 rounded-lg transition-colors border border-slate-100">
                                            <div className="flex-shrink-0 w-7 h-7 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center text-xs font-semibold group-hover:bg-blue-100 group-hover:text-blue-700 transition-colors">
                                                {i + 1}
                                            </div>
                                            <div className="text-sm text-slate-700 leading-relaxed">
                                                {entry.raw_text}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="p-4 border-t border-slate-100 bg-slate-50/50 rounded-b-2xl">
                            <Button variant="outline" onClick={() => setDrillDown(null)} className="w-full">
                                Close
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}