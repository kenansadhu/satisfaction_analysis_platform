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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { BoxedMessageRenderer } from "@/components/analysis/BoxedMessageRenderer";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LineChart, Line, ScatterChart, Scatter, PieChart, Pie } from 'recharts';
import ReactMarkdown from 'react-markdown';
import { toast } from 'sonner';
import AIAnalystChat from "@/components/analysis/AIAnalystChat";
import SuggestionHub from "@/components/executive/SuggestionHub";
import { DependencyGraph } from "@/components/analytics/DependencyGraph";
import { useActiveSurvey } from "@/context/SurveyContext";

type ChartConfig = {
    id: string;
    type: "BAR" | "HORIZONTAL_BAR" | "PIE" | "SCATTER" | "LINE";
    title: string;
    description: string;
    xKey: string;
    yKey: string;
    yKeys?: string[];
    aggregation?: "AVG" | "COUNT" | "SUM";
    fullExplanation?: string;
    dataFilter?: Record<string, string>;
    yLabelMap?: Record<string, string>;
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
    const [hoveredSeries, setHoveredSeries] = useState<string | null>(null);

    // Saved charts pagination
    const [page, setPage] = useState(0);
    const CHARTS_PER_PAGE = 4;

    // Cache metadata
    const [cacheUpdated, setCacheUpdated] = useState<string | null>(null);

    // Refine mode
    const [refineChart, setRefineChart] = useState<ChartConfig | null>(null);
    const [activeTab, setActiveTab] = useState("analyst");

    // Survey loading is now handled by SurveyContext

    const loadSavedCharts = useCallback(async (silent = false) => {
        if (!silent) setLoadingData(true);
        try {
            let query = supabase
                .from('saved_ai_charts')
                .select('*')
                .order('created_at', { ascending: false });

            if (selectedSurvey && selectedSurvey !== "all") {
                query = query.eq('survey_id', parseInt(selectedSurvey as string));
            } else {
                query = query.is('survey_id', null);
            }

            const { data: dbCharts, error: qErr } = await query;
            if (qErr) console.error("Saved charts query error:", qErr);
            console.log(`[AIScientist] Loaded ${dbCharts?.length || 0} charts for survey ${selectedSurvey}`);
            setSavedCharts(dbCharts || []);
        } catch (err) {
            console.error("Saved charts load error:", err);
        } finally {
            if (!silent) setLoadingData(false);
        }
    }, [selectedSurvey]);

    const loadWorkspace = useCallback(async () => {
        setLoadingData(true);
        try {
            let dataset: any[] = [];

            // Fetch macro data and cache timestamp from surveys table
            if (selectedSurvey && selectedSurvey !== "all") {
                const { data: surveyData, error: sErr } = await supabase
                    .from('surveys')
                    .select('ai_dataset_cache, ai_dataset_updated_at')
                    .eq('id', parseInt(selectedSurvey as string, 10))
                    .single();

                if (sErr) {
                    console.error("Failed to load survey cache:", sErr);
                }

                if (surveyData?.ai_dataset_cache) {
                    dataset = surveyData.ai_dataset_cache;
                }
                setCacheUpdated(surveyData?.ai_dataset_updated_at || null);
            } else {
                setCacheUpdated(null);
            }

            setMacroData(dataset);
            await loadSavedCharts(true);
        } catch (err) {
            console.error("Workspace load error:", err);
        } finally {
            setLoadingData(false);
        }
    }, [selectedSurvey, loadSavedCharts]);

    useEffect(() => {
        if (!loading) loadWorkspace();
    }, [loading, loadWorkspace]);

    // Handle tab switching refreshes
    useEffect(() => {
        if (activeTab === "saved") {
            loadSavedCharts(true);
        }
    }, [activeTab, loadSavedCharts]);

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

        return Object.entries(groups)
            .map(([name, stats]: [string, any]) => {
                const obj: any = { name, fullName: stats.fullName, value: config.aggregation === "AVG" ? +(stats.sum / stats.count).toFixed(2) : stats.sum };
                let hasRealData = false;

                if (config.yKeys?.length) {
                    config.yKeys.forEach(k => {
                        obj[k] = stats[k];
                        if (stats[k] !== 0 && stats[k] !== undefined && stats[k] !== null && !isNaN(stats[k])) {
                            hasRealData = true;
                        }
                    });
                } else {
                    if (obj.value !== 0 && obj.value !== undefined && obj.value !== null && !isNaN(obj.value)) {
                        hasRealData = true;
                    }
                }
                obj._hasRealData = hasRealData;
                return obj;
            })
            .filter(obj => obj._hasRealData)
            .sort((a, b) => b.value - a.value).slice(0, 15);
    };

    const CustomTooltip = ({ active, payload, label }: any) => {
        if (active && payload?.length && hoveredSeries) {
            const itemsToShow = payload.filter((p: any) => p.dataKey === hoveredSeries);

            if (itemsToShow.length === 0) return null;

            return (
                <div className="bg-white dark:bg-slate-800 p-3 border rounded-lg shadow-xl text-sm">
                    <p className="font-semibold mb-1">{payload[0].payload.fullName || label}</p>
                    {itemsToShow.map((e: any, i: number) => (
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

    const [showDataForChart, setShowDataForChart] = useState<string | null>(null);

    const renderChart = (chart: ChartConfig) => {
        const data = prepareChartData(chart);
        if (data.length === 0) return <div className="flex items-center justify-center h-full text-slate-400 text-sm">No data</div>;

        const isShowingData = showDataForChart === chart.id;

        return (
            <div className="flex flex-col h-full relative">
                <div className="flex justify-end mb-2 pr-4">
                    <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs border-purple-200 text-purple-600 hover:bg-purple-50"
                        onClick={() => setShowDataForChart(isShowingData ? null : chart.id)}
                    >
                        <Database className="w-3 h-3 mr-1" /> {isShowingData ? "Hide Data" : "View Source"}
                    </Button>
                </div>

                <div className="flex-1 relative min-h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                        {chart.type === "PIE" ? (
                            <PieChart>
                                <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={2}>
                                    {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                                </Pie>
                                <Tooltip content={<CustomTooltip />} />
                            </PieChart>
                        ) : chart.type === "SCATTER" ? (
                            <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                <XAxis type="number" dataKey="x" name={chart.xKey} tick={{ fontSize: 11 }} />
                                <YAxis type="number" dataKey="y" name={chart.yKey} tick={{ fontSize: 11 }} />
                                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'transparent' }} />
                                <Scatter data={data} fill="#8b5cf6" />
                            </ScatterChart>
                        ) : chart.type === "HORIZONTAL_BAR" ? (
                            <BarChart data={data} layout="vertical" margin={{ left: 20, right: 30 }} barCategoryGap="15%" barGap={2}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                                <XAxis type="number" hide />
                                <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'transparent' }} />
                                {chart.yKeys?.length ? chart.yKeys.map((k, i) => (
                                    <Bar
                                        key={k}
                                        dataKey={k}
                                        name={chart.yLabelMap?.[k] || k}
                                        fill={COLORS[i % COLORS.length]}
                                        radius={[0, 4, 4, 0]}
                                        onMouseEnter={() => setHoveredSeries(k)}
                                        onMouseLeave={() => setHoveredSeries(null)}
                                    />
                                )) : (
                                    <Bar
                                        dataKey="value"
                                        fill="#8b5cf6"
                                        radius={[0, 4, 4, 0]}
                                        onMouseEnter={() => setHoveredSeries("value")}
                                        onMouseLeave={() => setHoveredSeries(null)}
                                    >
                                        {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                                    </Bar>
                                )}
                            </BarChart>
                        ) : chart.type === "LINE" ? (
                            <LineChart data={data} margin={{ bottom: 50, top: 10 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={320} textAnchor="end" interval={0} axisLine={false} tickLine={false} scale="band" type="category" padding={{ left: 10, right: 10 }} />
                                <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                                <Tooltip content={<CustomTooltip />} />
                                {chart.yKeys?.length ? chart.yKeys.map((k, i) => (
                                    <Line
                                        key={k}
                                        type="monotone"
                                        dataKey={k}
                                        name={chart.yLabelMap?.[k] || k}
                                        stroke={COLORS[i % COLORS.length]}
                                        strokeWidth={3}
                                        dot={{ r: 4 }}
                                        activeDot={{ r: 6 }}
                                        onMouseEnter={() => setHoveredSeries(k)}
                                        onMouseLeave={() => setHoveredSeries(null)}
                                    />
                                )) : (
                                    <Line
                                        type="monotone"
                                        dataKey="value"
                                        stroke="#6366f1"
                                        strokeWidth={3}
                                        dot={{ r: 4 }}
                                        activeDot={{ r: 6 }}
                                        onMouseEnter={() => setHoveredSeries("value")}
                                        onMouseLeave={() => setHoveredSeries(null)}
                                    />
                                )}
                            </LineChart>
                        ) : (
                            <BarChart data={data} margin={{ bottom: 50, top: 10 }} barCategoryGap="10%" barGap={2}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={320} textAnchor="end" interval={0} axisLine={false} tickLine={false} scale="band" type="category" padding={{ left: 10, right: 10 }} />
                                <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(0,0,0,0.03)' }} />
                                {chart.yKeys?.length ? chart.yKeys.map((k, i) => (
                                    <Bar
                                        key={k}
                                        dataKey={k}
                                        name={chart.yLabelMap?.[k] || k}
                                        fill={COLORS[i % COLORS.length]}
                                        radius={[4, 4, 0, 0]}
                                        onMouseEnter={() => setHoveredSeries(k)}
                                        onMouseLeave={() => setHoveredSeries(null)}
                                    />
                                )) : (
                                    <Bar
                                        dataKey="value"
                                        fill="#6366f1"
                                        radius={[4, 4, 0, 0]}
                                        onMouseEnter={() => setHoveredSeries("value")}
                                        onMouseLeave={() => setHoveredSeries(null)}
                                    >
                                        {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                                    </Bar>
                                )}
                            </BarChart>
                        )}
                    </ResponsiveContainer>
                </div>

                {isShowingData && (
                    <div className="absolute inset-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm z-10 p-4 border border-slate-200 dark:border-slate-800 rounded-lg shadow-xl overflow-auto mt-8 h-[calc(100%-2rem)]">
                        <table className="w-full text-left text-[11px] bg-white dark:bg-slate-900 rounded">
                            <thead className="bg-slate-100 dark:bg-slate-800 sticky top-0">
                                <tr>
                                    <th className="p-2 border-b font-semibold">Unit</th>
                                    {chart.yKeys?.length ? (
                                        chart.yKeys.map(k => <th key={k} className="p-2 border-b font-semibold text-right">{k}</th>)
                                    ) : (
                                        <th className="p-2 border-b font-semibold text-right">Value</th>
                                    )}
                                </tr>
                            </thead>
                            <tbody>
                                {data.map((row: any, i: number) => (
                                    <tr key={i} className="border-b last:border-b-0 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                                        <td className="p-2 truncate max-w-[200px]" title={row.fullName}>{row.fullName}</td>
                                        {chart.yKeys?.length ? (
                                            chart.yKeys.map(k => <td key={k} className="p-2 text-right">{row[k]}</td>)
                                        ) : (
                                            <td className="p-2 text-right">{row.value}</td>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
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
                        <div className="flex items-center gap-4">
                            {cacheUpdated && (
                                <div className="flex flex-col items-end gap-0.5">
                                    <Badge variant="outline" className="bg-indigo-50/50 text-indigo-700 border-indigo-200 gap-1.5 px-3 py-1 shadow-sm font-medium">
                                        <Database className="w-3.5 h-3.5" />
                                        Context Built: {new Date(cacheUpdated).toLocaleDateString()}
                                    </Badge>
                                    <span className="text-[10px] text-slate-500 px-1 font-medium">
                                        {macroData.length} Units Synthesized
                                    </span>
                                </div>
                            )}
                            <div className="flex items-center gap-2 px-3 py-2 bg-indigo-50 dark:bg-indigo-950/30 rounded-lg border border-indigo-200 dark:border-indigo-800/40">
                                <span className="text-sm font-semibold text-indigo-700 dark:text-indigo-300">{activeSurvey.title}</span>
                                {activeSurvey.year && <span className="text-xs font-medium text-indigo-500 bg-indigo-100 px-1.5 py-0.5 rounded">({activeSurvey.year})</span>}
                            </div>
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
                                    onChartSaved={() => loadSavedCharts(true)}
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
                                                    <div className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed flex-grow prose prose-slate dark:prose-invert max-w-none">
                                                        <ReactMarkdown>{chart.config.description}</ReactMarkdown>
                                                    </div>
                                                    <div className="flex flex-col gap-2 mt-4">
                                                        {chart.config.fullExplanation && (
                                                            <Dialog>
                                                                <DialogTrigger asChild>
                                                                    <Button variant="secondary" className="w-full text-xs font-semibold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-900/30 dark:text-indigo-300 dark:hover:bg-indigo-900/50">
                                                                        <MessageSquare className="w-3.5 h-3.5 mr-2" /> Read Full Explanation
                                                                    </Button>
                                                                </DialogTrigger>
                                                                <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
                                                                    <DialogHeader>
                                                                        <DialogTitle className="flex items-center gap-2 text-indigo-700 dark:text-indigo-400">
                                                                            <Sparkles className="w-5 h-5" /> AI Deep Dive Context
                                                                        </DialogTitle>
                                                                    </DialogHeader>
                                                                    <div className="mt-4">
                                                                        <BoxedMessageRenderer content={chart.config.fullExplanation} />
                                                                    </div>
                                                                </DialogContent>
                                                            </Dialog>
                                                        )}
                                                        <Button
                                                            variant="outline"
                                                            className="w-full text-xs font-semibold border-purple-200 text-purple-600 hover:bg-purple-50 dark:border-purple-800 dark:text-purple-400 dark:hover:bg-purple-950/50"
                                                            onClick={async () => {
                                                                openRefineMode(chart.config);
                                                                window.scrollTo({ top: 0, behavior: "smooth" });
                                                            }}
                                                        >
                                                            <Edit3 className="w-3.5 h-3.5 mr-2" /> Discuss this Chart
                                                        </Button>
                                                    </div>
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
