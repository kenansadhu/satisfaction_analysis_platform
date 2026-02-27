"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { PageShell, PageHeader } from "@/components/layout/PageShell";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
    Sparkles, Lightbulb, Loader2, Save, Trash2, MessageSquare,
    TrendingUp, ArrowLeft, ArrowRight, CheckCircle2, Copy, Edit3, Database
} from "lucide-react";
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, Legend, ScatterChart, Scatter,
    PieChart, Pie, Cell
} from "recharts";
import { toast } from "sonner";
import AIAnalystChat from "@/components/analysis/AIAnalystChat";
import SuggestionHub from "@/components/executive/SuggestionHub";
import { DependencyGraph } from "@/components/analytics/DependencyGraph";
import { useActiveSurvey } from "@/context/SurveyContext";

type ChartConfig = {
    id: string;
    type: "BAR" | "HORIZONTAL_BAR" | "PIE" | "SCATTER";
    title: string;
    description: string;
    xKey: string;
    yKey: string;
    yKeys?: string[];
    aggregation?: "AVG" | "COUNT" | "SUM";
};

type SavedChart = {
    id: string;
    title: string;
    description: string;
    config: ChartConfig;
};

// SurveyOption type removed — now using SurveyContext

const COLORS = ['#6366f1', '#a855f7', '#ec4899', '#f43f5e', '#3b82f6', '#10b981', '#f59e0b', '#84cc16'];

export default function AIScientistPage() {
    const { activeSurveyId, activeSurvey, loading } = useActiveSurvey();
    const selectedSurvey = activeSurveyId; // alias for compatibility

    // Data
    const [macroData, setMacroData] = useState<any[]>([]);
    const [savedCharts, setSavedCharts] = useState<SavedChart[]>([]);
    const [loadingData, setLoadingData] = useState(true);

    // Saved charts pagination
    const [page, setPage] = useState(0);
    const CHARTS_PER_PAGE = 4;

    // Refine mode
    const [refineChart, setRefineChart] = useState<ChartConfig | null>(null);
    const [activeTab, setActiveTab] = useState("analyst");

    // Survey loading is now handled by SurveyContext

    const loadWorkspace = useCallback(async () => {
        setLoadingData(true);
        try {
            // Fetch macro data for chart rendering
            const { data: unitsData } = await supabase
                .from('organization_units')
                .select('id, name, short_name, description');

            const dataset: any[] = [];
            for (const unit of (unitsData || [])) {
                const { data: metrics, error: rpcErr } = await supabase.rpc('get_dashboard_metrics', {
                    p_unit_id: unit.id,
                    p_survey_id: selectedSurvey !== "all" ? parseInt(selectedSurvey, 10) : null
                });

                if (rpcErr) continue;

                if (metrics) {
                    const m = metrics as any;
                    const totalSegments = m.total_segments ?? 0;
                    if (totalSegments <= 0) continue;

                    const categories = m.category_counts || [];
                    const flat: any = {};
                    let catPos = 0, catNeg = 0;

                    if (Array.isArray(categories)) {
                        categories.forEach((c: any) => {
                            if (c.category_name) {
                                const k = `category_${c.category_name.replace(/[^a-zA-Z0-9]/g, '_')}`;
                                flat[k] = c.total || 0;
                                flat[`${k}_pos`] = c.positive_count || 0;
                                flat[`${k}_neg`] = c.negative_count || 0;
                                catPos += c.positive_count || 0;
                                catNeg += c.negative_count || 0;
                            }
                        });
                    }

                    const pos = (m.positive ?? 0) > 0 ? m.positive : catPos;
                    const neg = (m.negative ?? 0) > 0 ? m.negative : catNeg;
                    const neu = (m.neutral ?? 0) > 0 ? m.neutral : Math.max(0, totalSegments - pos - neg);

                    dataset.push({
                        unit_id: unit.id,
                        unit_name: unit.name,
                        unit_short_name: unit.short_name || unit.name,
                        total_segments: totalSegments,
                        positive: pos,
                        neutral: neu,
                        negative: neg,
                        score: m.score ?? 0,
                        ...flat
                    });
                }
            }
            setMacroData(dataset);

            // Fetch saved charts
            let query = supabase
                .from('saved_ai_charts')
                .select('*')
                .order('created_at', { ascending: false });

            if (selectedSurvey !== "all") {
                query = query.eq('survey_id', parseInt(selectedSurvey));
            } else {
                query = query.is('survey_id', null);
            }

            const { data: dbCharts } = await query;
            setSavedCharts(dbCharts || []);
        } catch (err) {
            console.error("Workspace load error:", err);
        } finally {
            setLoadingData(false);
        }
    }, [selectedSurvey]);

    useEffect(() => {
        if (!loading) loadWorkspace();
    }, [loading, loadWorkspace]);

    // --- Chart Actions ---
    const deleteChart = async (id: string) => {
        const { error } = await supabase.from('saved_ai_charts').delete().eq('id', id);
        if (!error) {
            setSavedCharts(prev => prev.filter(c => c.id !== id));
            toast.success("Chart removed.");
        }
    };

    const duplicateChart = async (chart: SavedChart) => {
        const { error } = await supabase.from('saved_ai_charts').insert({
            survey_id: selectedSurvey !== "all" ? parseInt(selectedSurvey) : null,
            title: `${chart.config.title} (Copy)`,
            description: chart.config.description,
            config: { ...chart.config, id: `chart_copy_${Date.now()}`, title: `${chart.config.title} (Copy)` },
        });
        if (!error) {
            toast.success("Chart duplicated!");
            loadWorkspace();
        }
    };

    const openRefineMode = (chart: ChartConfig) => {
        setRefineChart(chart);
        setActiveTab("analyst");
    };

    // --- Chart Data Transform ---
    const prepareChartData = (config: ChartConfig) => {
        if (!macroData || macroData.length === 0) return [];

        if (config.type === "SCATTER") {
            return macroData
                .filter(r => r[config.xKey] != null && r[config.yKey] != null)
                .map(r => ({
                    x: Number(r[config.xKey]),
                    y: Number(r[config.yKey]),
                    name: r.unit_short_name || r.unit_name,
                    fullName: r.unit_name
                }))
                .filter(d => !isNaN(d.x) && !isNaN(d.y));
        }

        const groups: Record<string, any> = {};
        macroData.filter(r => r[config.xKey] != null).forEach(row => {
            const key = String(row.unit_short_name || row[config.xKey] || "N/A");
            if (!groups[key]) groups[key] = { sum: 0, count: 0, fullName: row.unit_name || key };
            groups[key].sum += config.aggregation === "COUNT" ? 1 : Number(row[config.yKey] || 0);
            groups[key].count += 1;
            config.yKeys?.forEach(k => {
                if (groups[key][k] === undefined) groups[key][k] = 0;
                groups[key][k] += Number(row[k] || 0);
            });
        });

        return Object.entries(groups).map(([name, stats]: [string, any]) => {
            const obj: any = { name, fullName: stats.fullName, value: config.aggregation === "AVG" ? +(stats.sum / stats.count).toFixed(2) : stats.sum };
            config.yKeys?.forEach(k => { obj[k] = stats[k]; });
            return obj;
        }).sort((a, b) => b.value - a.value).slice(0, 15);
    };

    const CustomTooltip = ({ active, payload, label }: any) => {
        if (active && payload?.length) {
            return (
                <div className="bg-white dark:bg-slate-800 p-3 border rounded-lg shadow-xl text-sm">
                    <p className="font-semibold mb-1">{payload[0].payload.fullName || label}</p>
                    {payload.map((e: any, i: number) => (
                        <div key={i} className="flex justify-between gap-4 text-xs">
                            <span style={{ color: e.color }}>{e.name}:</span>
                            <span className="font-medium">{e.value}</span>
                        </div>
                    ))}
                </div>
            );
        }
        return null;
    };

    const renderChart = (chart: ChartConfig) => {
        const data = prepareChartData(chart);
        if (data.length === 0) return <div className="flex items-center justify-center h-full text-slate-400 text-sm">No data</div>;

        return (
            <ResponsiveContainer width="100%" height="100%">
                {chart.type === "PIE" ? (
                    <PieChart>
                        <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={90}>
                            {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                        </Pie>
                        <Tooltip content={<CustomTooltip />} />
                        <Legend wrapperStyle={{ fontSize: '11px' }} />
                    </PieChart>
                ) : chart.type === "SCATTER" ? (
                    <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis type="number" dataKey="x" name={chart.xKey} tick={{ fontSize: 11 }} />
                        <YAxis type="number" dataKey="y" name={chart.yKey} tick={{ fontSize: 11 }} />
                        <Tooltip content={<CustomTooltip />} />
                        <Scatter data={data} fill="#8b5cf6" />
                    </ScatterChart>
                ) : chart.type === "HORIZONTAL_BAR" ? (
                    <BarChart data={data} layout="vertical" margin={{ left: 20, right: 30 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis type="number" hide />
                        <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 10 }} />
                        <Tooltip content={<CustomTooltip />} />
                        {chart.yKeys?.length ? chart.yKeys.map((k, i) => <Bar key={k} dataKey={k} name={k} fill={COLORS[i % COLORS.length]} radius={[0, 4, 4, 0]} barSize={24} />) : <Bar dataKey="value" fill="#8b5cf6" radius={[0, 4, 4, 0]} barSize={24}>{data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Bar>}
                    </BarChart>
                ) : (
                    <BarChart data={data} margin={{ bottom: 50, top: 10 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-40} textAnchor="end" interval={0} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip content={<CustomTooltip />} />
                        <Legend />
                        {chart.yKeys?.length ? chart.yKeys.map((k, i) => <Bar key={k} dataKey={k} name={k} fill={COLORS[i % COLORS.length]} radius={[4, 4, 0, 0]} barSize={28} />) : <Bar dataKey="value" fill="#6366f1" radius={[4, 4, 0, 0]} barSize={28}>{data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Bar>}
                    </BarChart>
                )}
            </ResponsiveContainer>
        );
    };

    const surveyIdForApi = selectedSurvey === "all" ? undefined : selectedSurvey;
    const currentSavedPage = savedCharts.slice(page * CHARTS_PER_PAGE, (page + 1) * CHARTS_PER_PAGE);

    if (loading) return <PageShell><div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-slate-400" /></div></PageShell>;

    return (
        <PageShell>
            <PageHeader
                title={
                    <span className="flex items-center gap-2">
                        <Sparkles className="w-6 h-6 text-purple-500" />
                        AI Data Scientist
                    </span>
                }
                description="AI-powered conversational analysis, cross-correlation insights, and actionable suggestions."
                actions={
                    activeSurvey ? (
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 dark:bg-indigo-950/30 rounded-lg border border-indigo-200 dark:border-indigo-800/40">
                            <Database className="w-4 h-4 text-indigo-500" />
                            <span className="text-sm font-medium text-indigo-700 dark:text-indigo-300">{activeSurvey.title}</span>
                            {activeSurvey.year && <span className="text-xs text-slate-500">({activeSurvey.year})</span>}
                        </div>
                    ) : null
                }
            />

            <div className="max-w-7xl mx-auto px-8 py-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); if (v !== "analyst") setRefineChart(null); }} className="w-full">
                    <TabsList className="grid w-full grid-cols-2 lg:grid-cols-4 h-12 p-0 bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl mb-8 items-center overflow-hidden">
                        <TabsTrigger value="analyst" className="rounded-none h-full data-[state=active]:bg-white data-[state=active]:shadow-sm">
                            <MessageSquare className="w-4 h-4 mr-2 text-purple-500" /> AI Analyst
                        </TabsTrigger>
                        <TabsTrigger value="saved" className="rounded-none h-full data-[state=active]:bg-white data-[state=active]:shadow-sm">
                            <Save className="w-4 h-4 mr-2" /> Saved ({savedCharts.length})
                        </TabsTrigger>
                        <TabsTrigger value="suggestions" className="rounded-none h-full data-[state=active]:bg-white data-[state=active]:shadow-sm">
                            <Lightbulb className="w-4 h-4 mr-2 text-amber-500" /> Suggestions
                        </TabsTrigger>
                        <TabsTrigger value="graph" className="rounded-none h-full data-[state=active]:bg-white data-[state=active]:shadow-sm">
                            <TrendingUp className="w-4 h-4 mr-2 text-indigo-500" /> Dependency Map
                        </TabsTrigger>
                    </TabsList>

                    {/* TAB 1: AI Analyst (Conversational Chat) */}
                    <TabsContent value="analyst" className="focus-visible:ring-0">
                        {loadingData ? (
                            <div className="flex items-center justify-center h-64">
                                <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
                            </div>
                        ) : (
                            <Card className="border-purple-200/50 dark:border-purple-900/30 shadow-lg overflow-hidden">
                                <AIAnalystChat
                                    surveyId={surveyIdForApi}
                                    macroData={macroData}
                                    existingChart={refineChart || undefined}
                                    onChartSaved={loadWorkspace}
                                />
                            </Card>
                        )}
                    </TabsContent>

                    {/* TAB 2: Saved Charts */}
                    <TabsContent value="saved" className="space-y-6 focus-visible:ring-0">
                        {savedCharts.length === 0 ? (
                            <div className="text-center py-20 bg-slate-50 dark:bg-slate-900 rounded-2xl border border-dashed border-slate-300">
                                <TrendingUp className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                                <h3 className="text-lg font-medium text-slate-600">No Saved Charts Yet</h3>
                                <p className="text-sm text-slate-500 max-w-sm mx-auto mt-2">
                                    Chat with the AI Analyst to generate charts, then save them here.
                                </p>
                                <Button className="mt-6 bg-purple-600 hover:bg-purple-700" onClick={() => setActiveTab("analyst")}>
                                    Start Analyzing
                                </Button>
                            </div>
                        ) : (
                            <>
                                <div className="grid grid-cols-1 gap-6">
                                    {currentSavedPage.map((chart) => (
                                        <Card key={chart.id} className="border-purple-200/50 shadow-md overflow-hidden bg-white dark:bg-slate-900 group">
                                            <CardHeader className="bg-gradient-to-r from-purple-50/50 to-indigo-50/50 dark:from-purple-950/20 dark:to-indigo-950/20 border-b border-purple-100 dark:border-purple-900/20 pb-4">
                                                <div className="flex items-start justify-between">
                                                    <CardTitle className="text-lg font-bold text-slate-800 dark:text-slate-100 pr-24">
                                                        {chart.config.title}
                                                    </CardTitle>
                                                    <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <Button
                                                            size="sm" variant="outline"
                                                            className="h-7 text-xs border-purple-200 text-purple-600 hover:bg-purple-50"
                                                            onClick={() => openRefineMode(chart.config)}
                                                        >
                                                            <Edit3 className="w-3 h-3 mr-1" /> Refine
                                                        </Button>
                                                        <Button
                                                            size="sm" variant="outline"
                                                            className="h-7 text-xs border-blue-200 text-blue-600 hover:bg-blue-50"
                                                            onClick={() => duplicateChart(chart)}
                                                        >
                                                            <Copy className="w-3 h-3 mr-1" /> Duplicate
                                                        </Button>
                                                        <Button
                                                            size="sm" variant="outline"
                                                            className="h-7 text-xs border-red-200 text-red-500 hover:bg-red-50"
                                                            onClick={() => deleteChart(chart.id)}
                                                        >
                                                            <Trash2 className="w-3 h-3" />
                                                        </Button>
                                                    </div>
                                                </div>
                                            </CardHeader>
                                            <div className="flex flex-col md:flex-row">
                                                <CardContent className="pt-6 h-[350px] pb-6 flex-grow md:w-3/4 border-r border-slate-100 dark:border-slate-800">
                                                    {renderChart(chart.config)}
                                                </CardContent>
                                                <div className="bg-slate-50 dark:bg-slate-900/50 p-6 flex flex-col gap-3 md:w-1/4">
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <Sparkles className="w-5 h-5 text-purple-500" />
                                                        <h4 className="font-semibold text-slate-800 dark:text-slate-200 text-sm">AI Insight</h4>
                                                    </div>
                                                    <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                                                        {chart.config.description}
                                                    </p>
                                                </div>
                                            </div>
                                        </Card>
                                    ))}
                                </div>

                                {savedCharts.length > CHARTS_PER_PAGE && (
                                    <div className="flex justify-between items-center bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200">
                                        <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}>
                                            <ArrowLeft className="w-4 h-4 mr-2" /> Previous
                                        </Button>
                                        <span className="text-sm font-medium text-slate-600">
                                            Page {page + 1} of {Math.ceil(savedCharts.length / CHARTS_PER_PAGE)}
                                        </span>
                                        <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={(page + 1) * CHARTS_PER_PAGE >= savedCharts.length}>
                                            Next <ArrowRight className="w-4 h-4 ml-2" />
                                        </Button>
                                    </div>
                                )}
                            </>
                        )}
                    </TabsContent>

                    {/* TAB 3: Suggestions Hub */}
                    <TabsContent value="suggestions" className="focus-visible:ring-0">
                        <SuggestionHub surveyId={surveyIdForApi} />
                    </TabsContent>

                    {/* TAB 4: Dependency Graph */}
                    <TabsContent value="graph" className="focus-visible:ring-0 animate-in fade-in">
                        <Card className="border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                            <CardHeader>
                                <CardTitle className="text-lg">Cross-Unit Dependency Graph</CardTitle>
                                <CardDescription>Visualizing friction points between departments based on qualitative feedback.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="h-[600px] w-full bg-slate-50 rounded-xl border border-slate-100">
                                    <DependencyGraph surveyId={selectedSurvey || "all"} />
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>
            </div>
        </PageShell>
    );
}
