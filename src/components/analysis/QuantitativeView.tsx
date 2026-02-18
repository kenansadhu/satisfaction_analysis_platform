"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, TrendingUp, BarChart3, PieChart, AlertCircle } from "lucide-react";
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

export default function QuantitativeView({ unitId }: { unitId: string }) {
    const [data, setData] = useState<QuestionGroup[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchData();
    }, [unitId]);

    async function fetchData() {
        setLoading(true);

        // Fetch Scores (is_quantitative = true)
        const { data: scores } = await supabase
            .from('raw_feedback_inputs')
            .select('source_column, numerical_score')
            .eq('target_unit_id', unitId)
            .eq('is_quantitative', true)
            .not('numerical_score', 'is', null);

        // Fetch Categories (is_quantitative = false AND requires_analysis = false)
        const { data: categories } = await supabase
            .from('raw_feedback_inputs')
            .select('source_column, raw_text')
            .eq('target_unit_id', unitId)
            .eq('is_quantitative', false)
            .eq('requires_analysis', false);

        const grouped: Record<string, QuestionGroup> = {};

        // 1. Process Scores
        scores?.forEach(row => {
            const key = row.source_column;
            if (!grouped[key]) grouped[key] = { question: key, type: "SCORE", totalResponses: 0, chartData: [] };

            // Add to aggregate (temporary storage in chartData for processing later)
            const val = row.numerical_score;
            const existingBin = grouped[key].chartData.find(d => d.name === val.toString());
            if (existingBin) existingBin.value++;
            else grouped[key].chartData.push({ name: val.toString(), value: 1 });
            grouped[key].totalResponses++;
        });

        // Post-Process Scores (Sort & Color)
        Object.values(grouped).forEach(g => {
            if (g.type === "SCORE") {
                // Calculate Average
                let sum = 0;
                g.chartData.forEach(d => sum += (parseFloat(d.name) * d.value));
                g.average = (sum / g.totalResponses).toFixed(2);

                // Sort axis (1, 2, 3, 4)
                g.chartData.sort((a, b) => parseFloat(a.name) - parseFloat(b.name));

                // Color Coding (Red for low, Green for high)
                g.chartData.forEach(d => {
                    const val = parseFloat(d.name);
                    if (val <= 2) d.color = "#ef4444"; // Red
                    else if (val === 3) d.color = "#f59e0b"; // Amber
                    else d.color = "#22c55e"; // Green
                });
            }
        });

        // 2. Process Categories
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

        // Post-Process Categories (Sort by popularity)
        Object.values(catGrouped).forEach(g => {
            g.chartData.sort((a, b) => b.value - a.value); // Descending
            // Limit to top 8 to prevent overcrowding
            if (g.chartData.length > 8) {
                const others = g.chartData.slice(8).reduce((acc, curr) => acc + curr.value, 0);
                g.chartData = g.chartData.slice(0, 8);
                g.chartData.push({ name: "Others", value: others, color: "#94a3b8" });
            }
        });

        setData([...Object.values(grouped), ...Object.values(catGrouped)]);
        setLoading(false);
    }

    if (loading) return <div className="flex flex-col items-center justify-center py-20 text-slate-400"><Loader2 className="w-10 h-10 animate-spin mb-4" /> Computing Statistics...</div>;

    if (data.length === 0) return (
        <div className="flex flex-col items-center justify-center py-20 bg-white border-2 border-dashed rounded-xl">
            <AlertCircle className="w-10 h-10 text-slate-300 mb-4" />
            <h3 className="text-lg font-semibold text-slate-700">No Quantitative Data</h3>
            <p className="text-slate-500">This unit has no columns marked as "SCORE" or "CATEGORY".</p>
        </div>
    );

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {data.map((item, idx) => (
                <Card key={idx} className="flex flex-col h-[350px]">
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
                        <CardDescription className="text-xs">
                            {item.totalResponses} Responses
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="flex-1 min-h-0 pb-4">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={item.chartData} layout={item.type === "CATEGORY" ? "vertical" : "horizontal"} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
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
                                    cursor={{ fill: 'transparent' }}
                                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                />
                                <Bar dataKey="value" radius={[4, 4, 0, 0]} barSize={30}>
                                    {item.chartData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color || (item.type === "CATEGORY" ? "#8b5cf6" : "#3b82f6")} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
            ))}
        </div>
    );
}