"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Loader2, Sparkles, RefreshCw, AlertCircle, TrendingUp, Save, Trash2, ArrowRight, ArrowLeft, MessageSquare, Plus, CheckCircle2 } from "lucide-react";
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    ScatterChart, Scatter, PieChart, Pie, Cell, Legend
} from "recharts";
import { toast } from "sonner";
import { DependencyGraph } from "@/components/analytics/DependencyGraph";

type ChartConfig = {
    id: string;
    type: "BAR" | "HORIZONTAL_BAR" | "PIE" | "SCATTER" | "LINE";
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

export default function GlobalDataScientist({ surveyId }: { surveyId?: string }) {
    const [activeTab, setActiveTab] = useState("saved");
    const [macroData, setMacroData] = useState<any[]>([]);

    // Feature States
    const [savedCharts, setSavedCharts] = useState<SavedChart[]>([]);
    const [suggestedCharts, setSuggestedCharts] = useState<ChartConfig[]>([]);
    const [chatChart, setChatChart] = useState<ChartConfig | null>(null);

    const [loadingData, setLoadingData] = useState(true);
    const [loadingDiscover, setLoadingDiscover] = useState(false);
    const [loadingChat, setLoadingChat] = useState(false);

    const [chatInput, setChatInput] = useState("");
    const [error, setError] = useState<string | null>(null);

    // Pagination for saved charts
    const [page, setPage] = useState(0);
    const CHARTS_PER_PAGE = 4;

    // --- 1. INITIALIZATION ---
    const loadWorkspace = useCallback(async () => {
        setLoadingData(true);
        setError(null);
        try {
            // A. Fetch Live Data for Dynamic Rendering
            const res = await fetch(`/api/executive/macro-metrics${surveyId ? `?surveyId=${surveyId}` : ''}`);
            if (!res.ok) throw new Error("Failed to load live metrics dataset.");
            const { data } = await res.json();
            setMacroData(data || []);

            // B. Fetch Saved Chart Blueprints
            let query = supabase
                .from('saved_ai_charts')
                .select('*')
                .order('created_at', { ascending: false });

            if (surveyId) {
                query = query.eq('survey_id', parseInt(surveyId));
            } else {
                query = query.is('survey_id', null);
            }

            const { data: dbCharts, error: dbError } = await query;
            if (dbError) throw dbError;

            setSavedCharts(dbCharts || []);

            // If nothing saved, jump to discover
            if (!dbCharts || dbCharts.length === 0) {
                setActiveTab("discover");
            }
        } catch (err: any) {
            console.error("Workspace Load Error:", err);
            setError("Failed to load the Data Scientist workspace.");
        } finally {
            setLoadingData(false);
        }
    }, [surveyId]);

    useEffect(() => {
        loadWorkspace();
    }, [loadWorkspace]);

    // --- 2. GENERATE: DISCOVER NEW CONNECTIONS ---
    const generateDiscovery = async () => {
        setLoadingDiscover(true);
        setError(null);
        toast.info("Gemini 3.1 Pro is hunting for macro-connections...");

        try {
            const res = await fetch('/api/ai/generate-dashboard', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ surveyId })
            });

            if (!res.ok) throw new Error(`API returned ${res.status}`);
            const data = await res.json();

            if (data.blueprint && Array.isArray(data.blueprint)) {
                setSuggestedCharts(data.blueprint);
                toast.success("Discovery complete!");
            } else {
                throw new Error("AI returned invalid format.");
            }
        } catch (e: any) {
            setError(e.message);
            toast.error("Failed to discover connections");
        } finally {
            setLoadingDiscover(false);
        }
    };

    // --- 3. GENERATE: CHAT ---
    const generateFromChat = async () => {
        if (!chatInput.trim()) return;
        setLoadingChat(true);
        setError(null);
        setChatChart(null);

        try {
            const res = await fetch('/api/ai/generate-custom-chart', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ surveyId, message: chatInput })
            });

            if (!res.ok) throw new Error(`API returned ${res.status}`);
            const data = await res.json();

            if (data.chart) {
                setChatChart(data.chart);
            } else {
                throw new Error("AI failed to generate a chart for your request.");
            }
        } catch (e: any) {
            setError(e.message);
            toast.error("Failed to generate custom chart");
        } finally {
            setLoadingChat(false);
        }
    };

    // --- 4. SAVING DELETING ACTIONS ---
    const saveChart = async (config: ChartConfig) => {
        try {
            const { error: insertError } = await supabase.from('saved_ai_charts').insert({
                survey_id: surveyId ? parseInt(surveyId) : null,
                title: config.title,
                description: config.description,
                config: config
            });

            if (insertError) throw insertError;

            toast.success("Chart saved to your permanent dashboard!");
            loadWorkspace(); // Refresh the saved list
        } catch (e: any) {
            toast.error("Failed to save chart: " + e.message);
        }
    };

    const deleteChart = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        try {
            const { error: delError } = await supabase.from('saved_ai_charts').delete().eq('id', id);
            if (delError) throw delError;

            toast.success("Chart removed.");
            setSavedCharts(savedCharts.filter(c => c.id !== id));

            // Adjust pagination if we deleted the last item on a page
            if ((page * CHARTS_PER_PAGE) >= savedCharts.length - 1 && page > 0) {
                setPage(page - 1);
            }
        } catch (e: any) {
            toast.error("Failed to delete chart: " + e.message);
        }
    };

    // --- DATA TRANSFORMATION ---
    const prepareChartData = (config: ChartConfig) => {
        if (!macroData || macroData.length === 0) return [];

        // For scatter plots, we need BOTH x and y to exist (even if they are 0)
        let validRows = macroData;

        if (config.type === "SCATTER") {
            // Note: Scatter charts typically don't support multi-yKeys well 
            // in standard Cartesian maps without complex rendering, so we ignore yKeys here.
            validRows = macroData.filter(r => r[config.xKey] != null && r[config.yKey] != null);
            return validRows.map(r => ({
                x: Number(r[config.xKey]),
                y: Number(r[config.yKey]),
                name: r.unit_short_name || r.unit_name || r[config.xKey],
                fullName: r.unit_name || r[config.xKey]
            })).filter(d => !isNaN(d.x) && !isNaN(d.y));
        }

        // For Bar/Pie charts
        validRows = macroData.filter(r => r[config.xKey] != null);

        // Grouping
        const groups: Record<string, { sum: number; count: number; fullName?: string;[multiKey: string]: any }> = {};
        validRows.forEach(row => {
            // Use Short Name for the primary visual text
            const visualKey = String(row.unit_short_name || (row[config.xKey] ?? "N/A"));

            if (!groups[visualKey]) groups[visualKey] = { sum: 0, count: 0, fullName: row.unit_name || row[config.xKey] || visualKey };

            // Legacy Single Y-Key
            const val = config.aggregation === "COUNT" ? 1 : Number(row[config.yKey] || 0);
            groups[visualKey].sum += val;
            groups[visualKey].count += 1;

            // Multi-Series Y-Keys (e.g. sentiment Pos vs Neg)
            if (config.yKeys && config.yKeys.length > 0) {
                config.yKeys.forEach(multiKey => {
                    if (groups[visualKey][multiKey] === undefined) groups[visualKey][multiKey] = 0;
                    groups[visualKey][multiKey] += Number(row[multiKey] || 0);
                });
            }
        });

        return Object.entries(groups).map(([name, stats]) => {
            const obj: any = {
                name,
                fullName: stats.fullName,
                value: config.aggregation === "AVG" ? Number((stats.sum / stats.count).toFixed(2)) : stats.sum
            };

            // Map the multi-keys into the final bar row
            if (config.yKeys && config.yKeys.length > 0) {
                config.yKeys.forEach(multiKey => {
                    obj[multiKey] = stats[multiKey];
                });
            }
            return obj;
        }).sort((a, b) => b.value - a.value).slice(0, 15);
    };

    // --- RENDERERS ---
    const COLORS = ['#6366f1', '#a855f7', '#ec4899', '#f43f5e', '#3b82f6', '#10b981', '#f59e0b', '#84cc16'];

    // Custom Tooltip component to inject the full length name on hover
    const CustomTooltip = ({ active, payload, label }: any) => {
        if (active && payload && payload.length) {
            const fullName = payload[0].payload.fullName || label;
            return (
                <div className="bg-white dark:bg-slate-800 p-3 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl text-sm z-50">
                    <p className="font-semibold text-slate-800 dark:text-slate-100 mb-2 border-b border-slate-100 dark:border-slate-700 pb-2">{fullName}</p>
                    {payload.map((entry: any, index: number) => (
                        <div key={index} className="flex items-center justify-between gap-4 mt-1">
                            <span className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }}></span>
                                {entry.name}:
                            </span>
                            <span className="font-medium text-slate-900 dark:text-white">{entry.value}</span>
                        </div>
                    ))}
                </div>
            );
        }
        return null;
    };

    const renderChartCard = (chart: ChartConfig, isSaved: boolean = false, dbId?: string) => {
        const chartData = prepareChartData(chart);
        const isAlreadySaved = isSaved || savedCharts.some(s => s.config.title === chart.title);

        return (
            <Card key={chart.id || dbId} className="flex flex-col border-purple-200/50 dark:border-purple-900/30 shadow-md overflow-hidden bg-white dark:bg-slate-900 transition-all hover:shadow-lg relative group">
                {isSaved && dbId ? (
                    <button onClick={(e) => deleteChart(dbId, e)} className="absolute top-4 right-4 z-10 p-2 bg-red-50 text-red-500 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-100">
                        <Trash2 className="w-4 h-4" />
                    </button>
                ) : (
                    <Button
                        size="sm"
                        variant={isAlreadySaved ? "secondary" : "default"}
                        className={`absolute top-4 right-4 z-10 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm ${isAlreadySaved ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-purple-600 hover:bg-purple-700'}`}
                        onClick={() => !isAlreadySaved && saveChart(chart)}
                        disabled={isAlreadySaved}
                    >
                        {isAlreadySaved ? <CheckCircle2 className="w-4 h-4 mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                        {isAlreadySaved ? "Saved" : "Save to Dashboard"}
                    </Button>
                )}

                <CardHeader className="bg-gradient-to-r from-purple-50/50 to-indigo-50/50 dark:from-purple-950/20 dark:to-indigo-950/20 border-b border-purple-100 dark:border-purple-900/20 pb-4 pr-32">
                    <CardTitle className="text-xl font-bold text-slate-800 dark:text-slate-100">{chart.title}</CardTitle>
                </CardHeader>
                <div className="flex flex-col md:flex-row h-full">
                    <CardContent className="pt-6 h-[400px] pb-6 relative flex-grow md:w-3/4 border-r border-slate-100 dark:border-slate-800">
                        {chartData.length === 0 ? (
                            <div className="flex items-center justify-center h-full text-slate-400 text-sm">Waiting for valid live data to render `{chart.xKey}`...</div>
                        ) : (
                            <ResponsiveContainer width="100%" height="100%">
                                {chart.type === "PIE" ? (
                                    <PieChart>
                                        <Pie data={chartData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={70} outerRadius={100} paddingAngle={2}>
                                            {chartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                                        </Pie>
                                        <Tooltip content={<CustomTooltip />} />
                                        <Legend verticalAlign="bottom" wrapperStyle={{ fontSize: '11px' }} />
                                    </PieChart>
                                ) : chart.type === "HORIZONTAL_BAR" ? (
                                    <BarChart data={chartData} layout="vertical" margin={{ left: 20, right: 30 }}>
                                        <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#e2e8f0" />
                                        <XAxis type="number" hide />
                                        <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 11 }} tickFormatter={(t) => t.length > 20 ? t.slice(0, 20) + '...' : t} />
                                        <Tooltip cursor={{ fill: '#f8fafc' }} content={<CustomTooltip />} />
                                        {chart.yKeys && chart.yKeys.length > 0 ? (
                                            chart.yKeys.map((key, index) => (
                                                <Bar key={key} dataKey={key} name={key} fill={COLORS[index % COLORS.length]} radius={[0, 4, 4, 0]} barSize={24} />
                                            ))
                                        ) : (
                                            <Bar dataKey="value" fill="#8b5cf6" radius={[0, 4, 4, 0]} barSize={24}>
                                                {chartData.map((_, index) => (<Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />))}
                                            </Bar>
                                        )}
                                    </BarChart>
                                ) : chart.type === "SCATTER" ? (
                                    <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                        <XAxis type="number" dataKey="x" name={chart.xKey} tick={{ fontSize: 11 }} label={{ value: chart.xKey, position: 'bottom', offset: 0, fontSize: 11 }} />
                                        <YAxis type="number" dataKey="y" name={chart.yKey} tick={{ fontSize: 11 }} label={{ value: chart.yKey, angle: -90, position: 'left', fontSize: 11 }} />
                                        <Tooltip cursor={{ strokeDasharray: '3 3' }} content={<CustomTooltip />} />
                                        <Scatter data={chartData} fill="#ec4899" />
                                    </ScatterChart>
                                ) : (
                                    <BarChart data={chartData} margin={{ bottom: 60, top: 20 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                        <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-45} textAnchor="end" interval={0} />
                                        <YAxis tick={{ fontSize: 11 }} />
                                        <Tooltip cursor={{ fill: 'rgba(241, 245, 249, 0.5)' }} content={<CustomTooltip />} />
                                        {chart.yKeys && chart.yKeys.length > 0 ? (
                                            chart.yKeys.map((key, index) => (
                                                <Bar key={key} dataKey={key} name={key} fill={COLORS[index % COLORS.length]} radius={[4, 4, 0, 0]} barSize={36} />
                                            ))
                                        ) : (
                                            <Bar dataKey="value" fill="#6366f1" radius={[4, 4, 0, 0]} barSize={36}>
                                                {chartData.map((_, index) => (<Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />))}
                                            </Bar>
                                        )}
                                    </BarChart>
                                )}
                            </ResponsiveContainer>
                        )}
                    </CardContent>
                    <div className="bg-slate-50 dark:bg-slate-900/50 p-6 flex flex-col gap-3 md:w-1/4">
                        <div className="flex items-center gap-2 mb-2">
                            <Sparkles className="w-5 h-5 text-purple-500 shrink-0" />
                            <h4 className="font-semibold text-slate-800 dark:text-slate-200">AI Insight</h4>
                        </div>
                        <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed font-medium">
                            {chart.description}
                        </p>
                    </div>
                </div>
            </Card >
        );
    };

    if (loadingData) {
        return (
            <div className="flex flex-col h-64 items-center justify-center space-y-4 rounded-2xl border border-slate-200">
                <Loader2 className="h-12 w-12 animate-spin text-purple-600" />
                <p className="text-purple-800 font-medium animate-pulse">Initializing Data Scientist Environment...</p>
            </div>
        );
    }

    const currentSavedPage = savedCharts.slice(page * CHARTS_PER_PAGE, (page + 1) * CHARTS_PER_PAGE);

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-gradient-to-r from-purple-900 to-indigo-900 rounded-2xl p-6 text-white shadow-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 opacity-10 pointer-events-none translate-x-1/3 -translate-y-1/4">
                    <TrendingUp className="w-64 h-64" />
                </div>
                <div className="relative z-10 w-full">
                    <h2 className="text-3xl font-bold flex items-center justify-between gap-3">
                        <span className="flex items-center gap-3">
                            <Sparkles className="w-8 h-8 text-purple-300" />
                            AI Data Scientist
                            <span className="text-xs font-medium px-2 py-1 rounded-full bg-indigo-500/30 border border-indigo-400/30 text-indigo-100 ml-2 hidden sm:inline-block">
                                Gemini 3.1 Pro
                            </span>
                        </span>
                    </h2>
                    <p className="text-purple-200 mt-2 max-w-xl text-sm leading-relaxed">
                        A dynamic generative workspace powered by live metrics. Charts saved here automatically update as new surveys are collected across the institution.
                    </p>
                </div>
            </div>

            {error && (
                <div className="bg-red-50 text-red-600 p-4 rounded-lg border border-red-200 flex items-center gap-3 shadow-sm">
                    <AlertCircle className="w-5 h-5 shrink-0" />
                    <p className="text-sm font-medium">{error}</p>
                </div>
            )}

            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="grid w-full grid-cols-2 lg:grid-cols-4 h-12 p-0 bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl mb-8 items-center overflow-hidden">
                    <TabsTrigger value="saved" className="rounded-none h-full data-[state=active]:bg-white data-[state=active]:shadow-sm flex items-center justify-center">
                        <Save className="w-4 h-4 mr-2" /> Saved Charts ({savedCharts.length})
                    </TabsTrigger>
                    <TabsTrigger value="discover" className="rounded-none h-full data-[state=active]:bg-white data-[state=active]:shadow-sm flex items-center justify-center">
                        <Sparkles className="w-4 h-4 mr-2 text-purple-500" /> Discover Connections
                    </TabsTrigger>
                    <TabsTrigger value="chat" className="rounded-none h-full data-[state=active]:bg-white data-[state=active]:shadow-sm flex items-center justify-center">
                        <MessageSquare className="w-4 h-4 mr-2 text-blue-500" /> Ask AI
                    </TabsTrigger>
                    <TabsTrigger value="graph" className="rounded-none h-full data-[state=active]:bg-white data-[state=active]:shadow-sm flex items-center justify-center">
                        <TrendingUp className="w-4 h-4 mr-2 text-indigo-500" /> Dependency Graph
                    </TabsTrigger>
                </TabsList>

                {/* --- TAB 1: SAVED CHARTS --- */}
                <TabsContent value="saved" className="space-y-6 focus-visible:ring-0">
                    {savedCharts.length === 0 ? (
                        <div className="text-center py-20 bg-slate-50 dark:bg-slate-900 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700">
                            <TrendingUp className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                            <h3 className="text-lg font-medium text-slate-600">Your AI Dashboard is Empty</h3>
                            <p className="text-sm text-slate-500 max-w-sm mx-auto mt-2">Go to the Discover or Chat tabs to command Gemini to generate dynamic charts for you to save here.</p>
                            <Button className="mt-6 bg-purple-600 hover:bg-purple-700" onClick={() => setActiveTab("discover")}>Start Discovering</Button>
                        </div>
                    ) : (
                        <>
                            <div className="grid grid-cols-1 gap-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
                                {currentSavedPage.map((chart) => renderChartCard(chart.config, true, chart.id))}
                            </div>

                            {/* Pagination */}
                            {savedCharts.length > CHARTS_PER_PAGE && (
                                <div className="flex justify-between items-center bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200">
                                    <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}>
                                        <ArrowLeft className="w-4 h-4 mr-2" /> Previous
                                    </Button>
                                    <span className="text-sm font-medium text-slate-600">
                                        Page {page + 1} of {Math.ceil(savedCharts.length / CHARTS_PER_PAGE)}
                                    </span>
                                    <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(Math.ceil(savedCharts.length / CHARTS_PER_PAGE) - 1, p + 1))} disabled={(page + 1) * CHARTS_PER_PAGE >= savedCharts.length}>
                                        Next <ArrowRight className="w-4 h-4 ml-2" />
                                    </Button>
                                </div>
                            )}
                        </>
                    )}
                </TabsContent>

                {/* --- TAB 2: DISCOVER --- */}
                <TabsContent value="discover" className="space-y-6 focus-visible:ring-0">
                    <div className="flex justify-between items-center bg-purple-50 p-6 rounded-xl border border-purple-100 dark:bg-slate-900 dark:border-slate-800">
                        <div>
                            <h3 className="font-bold text-slate-800 dark:text-slate-100">Find Hidden Connections</h3>
                            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">Let Gemini analyze millions of data points across all departments to present 4 unique correlations.</p>
                        </div>
                        <Button onClick={generateDiscovery} disabled={loadingDiscover} className="bg-purple-600 hover:bg-purple-700 shadow-md">
                            {loadingDiscover ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
                            Run Deep Analysis
                        </Button>
                    </div>

                    {loadingDiscover && (
                        <div className="flex flex-col h-64 items-center justify-center space-y-4 bg-white/50 rounded-2xl border border-slate-200">
                            <div className="relative">
                                <div className="absolute inset-0 bg-purple-500 blur-xl opacity-20 rounded-full animate-pulse"></div>
                                <Loader2 className="h-12 w-12 animate-spin text-purple-600 relative z-10" />
                            </div>
                            <p className="text-purple-800 font-medium animate-pulse">Computing macro-correlations globally...</p>
                        </div>
                    )}

                    {!loadingDiscover && suggestedCharts.length > 0 && (
                        <div className="grid grid-cols-1 gap-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
                            {suggestedCharts.map((chart) => renderChartCard(chart))}
                        </div>
                    )}
                </TabsContent>

                {/* --- TAB 3: CUSTOM CHAT --- */}
                <TabsContent value="chat" className="space-y-6 focus-visible:ring-0">
                    <div className="bg-white dark:bg-slate-900 p-8 rounded-2xl border border-blue-100 shadow-sm">
                        <h3 className="text-xl font-bold flex items-center gap-2 mb-2">
                            <MessageSquare className="w-5 h-5 text-blue-500" /> Ask the Data Scientist
                        </h3>
                        <p className="text-slate-600 mb-6 text-sm">Ask for any specific chart or insight, and Gemini will map the live dataset to Recharts dynamically.</p>

                        <form onSubmit={(e) => { e.preventDefault(); generateFromChat(); }} className="flex gap-3">
                            <Input
                                placeholder="e.g. 'Show me a scatter plot of Teaching complaints versus Positive Sentiment Ratio for all departments'"
                                value={chatInput}
                                onChange={e => setChatInput(e.target.value)}
                                className="h-12 bg-slate-50 border-slate-200 focus-visible:ring-blue-500"
                                disabled={loadingChat}
                            />
                            <Button type="submit" disabled={loadingChat || !chatInput.trim()} className="h-12 px-8 bg-blue-600 hover:bg-blue-700 disabled:opacity-50">
                                {loadingChat ? <Loader2 className="w-4 h-4 animate-spin" /> : "Generate"}
                            </Button>
                        </form>
                    </div>

                    {loadingChat && (
                        <div className="flex flex-col h-64 items-center justify-center space-y-4">
                            <Loader2 className="h-10 w-10 animate-spin text-blue-500" />
                            <p className="text-blue-800 font-medium animate-pulse">Architecting your custom visualization...</p>
                        </div>
                    )}

                    {!loadingChat && chatChart && (
                        <div className="max-w-2xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
                            {renderChartCard(chatChart)}
                        </div>
                    )}
                </TabsContent>

                {/* --- TAB 4: DEPENDENCY GRAPH --- */}
                <TabsContent value="graph" className="mt-0 focus-visible:ring-0 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm rounded-xl overflow-hidden p-6">
                        <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-2">Institutional Cross-Unit Dependency Graph</h3>
                        <p className="text-sm text-slate-500 mb-6">Visualizing operational friction points between departments based on qualitative feedback overlaps.</p>
                        <div className="h-[600px] w-full bg-slate-50 rounded-xl border border-slate-100">
                            <DependencyGraph surveyId={surveyId || "all"} />
                        </div>
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    );
}
