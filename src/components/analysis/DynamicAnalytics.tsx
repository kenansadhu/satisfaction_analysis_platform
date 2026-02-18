"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Loader2, Sparkles, BarChart3, ScatterChart as ScatterIcon, PieChart as PieIcon, RefreshCw, AlertCircle } from "lucide-react";
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    ScatterChart, Scatter, PieChart, Pie, Cell, Legend, LabelList
} from "recharts";

type ChartConfig = {
    id: string;
    type: "BAR" | "HORIZONTAL_BAR" | "PIE" | "SCATTER";
    title: string;
    description: string;
    xKey: string;
    yKey: string;
    aggregation?: "AVG" | "COUNT" | "SUM";
};

export default function DynamicAnalytics({ unitId }: { unitId: string }) {
    const [loading, setLoading] = useState(false);
    const [blueprint, setBlueprint] = useState<ChartConfig[]>([]);
    const [rawData, setRawData] = useState<any[]>([]);
    const [error, setError] = useState<string | null>(null);

    // 1. Load existing report from Database
    const loadSavedInsight = useCallback(async () => {
        try {
            const { data, error: dbError } = await supabase
                .from('unit_ai_reports')
                .select('content')
                .eq('unit_id', unitId)
                .eq('report_type', 'data_scientist')
                .maybeSingle();

            if (dbError) throw dbError;

            if (data?.content) {
                setBlueprint(data.content.blueprint || []);
                setRawData(data.content.rawData || []);
            }
        } catch (err: any) {
            console.error("Load Error:", err.message);
        }
    }, [unitId]);

    useEffect(() => {
        loadSavedInsight();
    }, [loadSavedInsight]);

    // 2. Generate new insights via AI
    const generateInsights = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch('/api/ai/generate-dashboard', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ unitId })
            });

            if (!res.ok) throw new Error(`API returned ${res.status}`);

            const data = await res.json();

            if (data.blueprint && Array.isArray(data.blueprint)) {
                setBlueprint(data.blueprint);
                setRawData(data.rawData || []);

                // PERSIST: Save to Supabase
                const { error: upsertError } = await supabase.from('unit_ai_reports').upsert({
                    unit_id: parseInt(unitId), // Correctly parse BigInt
                    report_type: 'data_scientist',
                    content: { blueprint: data.blueprint, rawData: data.rawData }
                }, { onConflict: 'unit_id, report_type' });

                if (upsertError) console.error("Persistence Error:", upsertError.message);
            } else {
                throw new Error("AI returned an invalid blueprint format.");
            }
        } catch (e: any) {
            setError(e.message);
            console.error("Generation Error:", e);
        } finally {
            setLoading(false);
        }
    };

    // --- DATA TRANSFORMATION LOGIC ---
    const prepareChartData = (config: ChartConfig) => {
        if (!rawData || rawData.length === 0) return [];

        // Filter out rows missing the required keys
        const validRows = rawData.filter(r => r[config.xKey] !== undefined);

        if (config.type === "SCATTER") {
            return validRows.map(r => ({
                x: Number(r[config.xKey]),
                y: Number(r[config.yKey])
            })).filter(d => !isNaN(d.x) && !isNaN(d.y));
        }

        const groups: Record<string, { sum: number; count: number }> = {};
        validRows.forEach(row => {
            const key = String(row[config.xKey] ?? "N/A");
            if (!groups[key]) groups[key] = { sum: 0, count: 0 };

            const val = config.aggregation === "COUNT" ? 1 : Number(row[config.yKey] || 0);
            groups[key].sum += val;
            groups[key].count += 1;
        });

        return Object.entries(groups).map(([name, stats]) => ({
            name,
            value: config.aggregation === "AVG" ? Number((stats.sum / stats.count).toFixed(2)) : stats.sum
        })).sort((a, b) => b.value - a.value).slice(0, 10);
    };

    // --- COMPONENT RENDERERS ---
    const COLORS = ['#6366f1', '#a855f7', '#ec4899', '#f43f5e', '#3b82f6', '#10b981'];

    return (
        <div className="space-y-6 pb-20 animate-in fade-in duration-500">

            {/* Header Card */}
            <Card className="bg-slate-900 border-none shadow-xl overflow-hidden">
                <CardContent className="p-8">
                    <div className="flex flex-col md:flex-row justify-between items-center gap-6">
                        <div className="space-y-2">
                            <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                                <Sparkles className="w-6 h-6 text-indigo-400" /> AI Data Scientist
                            </h2>
                            <p className="text-slate-400 max-w-lg">
                                Automated discovery of patterns within your unique survey structure.
                            </p>
                        </div>
                        <Button
                            onClick={generateInsights}
                            disabled={loading}
                            className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold h-12 px-8 transition-transform active:scale-95"
                        >
                            {loading ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                            {blueprint.length > 0 ? "Re-Discover Patterns" : "Discover Patterns"}
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* Error View */}
            {error && (
                <div className="bg-red-50 border border-red-100 p-4 rounded-lg flex items-center gap-3 text-red-800">
                    <AlertCircle className="w-5 h-5" />
                    <p className="text-sm">Error: {error}. Try re-generating.</p>
                </div>
            )}

            {/* Empty State */}
            {!loading && blueprint.length === 0 && !error && (
                <div className="text-center py-24 bg-white border border-slate-200 rounded-xl border-dashed">
                    <BarChart3 className="mx-auto w-12 h-12 text-slate-200 mb-4" />
                    <h3 className="text-lg font-medium text-slate-900">No Insights Generated</h3>
                    <p className="text-slate-500 text-sm">Click "Discover Patterns" to analyze this unit's variables.</p>
                </div>
            )}

            {/* Dashboard Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {blueprint.map((chart) => {
                    const chartData = prepareChartData(chart);
                    return (
                        <Card key={chart.id} className="flex flex-col border-slate-200 shadow-sm overflow-hidden">
                            <CardHeader className="bg-slate-50/50 border-b pb-3">
                                <CardTitle className="text-sm font-bold text-slate-800">{chart.title}</CardTitle>
                                <CardDescription className="text-xs">{chart.description}</CardDescription>
                            </CardHeader>
                            <CardContent className="pt-6 h-[320px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    {chart.type === "PIE" ? (
                                        <PieChart>
                                            <Pie data={chartData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5}>
                                                {chartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                                            </Pie>
                                            <Tooltip />
                                            <Legend verticalAlign="bottom" wrapperStyle={{ fontSize: '10px' }} />
                                        </PieChart>
                                    ) : chart.type === "HORIZONTAL_BAR" ? (
                                        <BarChart data={chartData} layout="vertical" margin={{ left: 10, right: 30 }}>
                                            <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f1f5f9" />
                                            <XAxis type="number" hide />
                                            <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 10 }} tickFormatter={(t) => t.slice(0, 15) + '...'} />
                                            <Tooltip cursor={{ fill: '#f8fafc' }} />
                                            <Bar dataKey="value" fill="#6366f1" radius={[0, 4, 4, 0]} barSize={20} />
                                        </BarChart>
                                    ) : chart.type === "SCATTER" ? (
                                        <ScatterChart margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
                                            <CartesianGrid strokeDasharray="3 3" />
                                            <XAxis type="number" dataKey="x" name={chart.xKey} />
                                            <YAxis type="number" dataKey="y" name={chart.yKey} />
                                            <Tooltip cursor={{ strokeDasharray: '3 3' }} />
                                            <Scatter data={chartData} fill="#a855f7" />
                                        </ScatterChart>
                                    ) : (
                                        <BarChart data={chartData} margin={{ bottom: 40 }}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                            <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" interval={0} />
                                            <YAxis tick={{ fontSize: 10 }} />
                                            <Tooltip cursor={{ fill: 'transparent' }} />
                                            <Bar dataKey="value" fill="#4f46e5" radius={[4, 4, 0, 0]} barSize={30} />
                                        </BarChart>
                                    )}
                                </ResponsiveContainer>
                            </CardContent>
                        </Card>
                    );
                })}
            </div>
        </div>
    );
}