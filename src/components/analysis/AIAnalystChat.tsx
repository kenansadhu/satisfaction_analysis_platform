"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, Legend, ScatterChart, Scatter,
    PieChart, Pie, Cell, LineChart, Line
} from "recharts";
import {
    Sparkles, Send, Loader2, Save, CheckCircle2,
    Copy, MessageSquare, Trash2, RotateCcw, Database,
    Quote, User, Bot
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { BoxedMessageRenderer } from "./BoxedMessageRenderer";

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

interface ChatMessage {
    role: "user" | "assistant";
    content: string;
    charts?: ChartConfig[];
    timestamp: Date;
}

interface AIAnalystChatProps {
    surveyId?: string;
    macroData: any[];
    existingChart?: ChartConfig; // For "Refine" mode
    onChartSaved?: () => void;
}

const COLORS = ['#6366f1', '#a855f7', '#ec4899', '#f43f5e', '#3b82f6', '#10b981', '#f59e0b', '#84cc16'];

const getBarColor = (key: string, index: number, overrideGradient?: string) => {
    const k = key.toLowerCase();
    if (k.includes('pos')) return overrideGradient || '#22c55e'; // Green 500
    if (k.includes('neg')) return overrideGradient || '#f43f5e'; // Rose 500
    if (k.includes('neu')) return '#94a3b8'; // Slate 400
    return COLORS[index % COLORS.length];
};

const QUICK_PROMPTS = [
    "Plot a scatter graph showing sentiment score vs. total segment volume to identify noisy but critical units.",
    "Which 3 units are struggling the most with Facilities & Infrastructure, and how does it compare to their Teaching sentiment?",
    "Generate a horizontal bar chart visualizing the ratio of positive to negative feedback exclusively for the worst-performing study programs.",
    "Map out a multi-dimensional comparison of the top 5 largest units by total feedback volume.",
    "Which department has the most surprising disparity between quantitative survey scores and qualitative written sentiment?"
];

export default function AIAnalystChat({ surveyId, macroData, existingChart, onChartSaved }: AIAnalystChatProps) {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [savedChartIds, setSavedChartIds] = useState<Set<string>>(new Set());
    const [hoveredSeries, setHoveredSeries] = useState<string | null>(null);
    // Live dataset from the API — this is the SAME data the AI analyzed
    const [liveData, setLiveData] = useState<any[]>([]);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Auto-scroll to bottom
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    // If refining an existing chart, add context message
    useEffect(() => {
        if (existingChart && messages.length === 0) {
            setMessages([{
                role: "assistant",
                content: `I can see you want to refine **"${existingChart.title}"**. This is a ${existingChart.type} chart showing ${existingChart.description}.\n\nWhat would you like to change? I can adjust the chart type, axes, filters, or create a completely new perspective on this data.`,
                charts: [existingChart],
                timestamp: new Date(),
            }]);
        }
    }, [existingChart]);

    const sendMessage = useCallback(async (messageText?: string) => {
        const text = messageText || input.trim();
        if (!text || isLoading) return;

        const userMsg: ChatMessage = {
            role: "user",
            content: text,
            timestamp: new Date(),
        };

        const newMessages = [...messages, userMsg];
        setMessages(newMessages);
        setInput("");
        setIsLoading(true);

        try {
            const res = await fetch('/api/ai/chat-analyst', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: newMessages.map(m => ({
                        role: m.role,
                        content: m.content,
                        charts: m.charts,
                    })),
                    surveyId,
                    existingChart: existingChart || undefined,
                }),
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || `API returned ${res.status}`);
            }

            const data = await res.json();

            // Update live dataset from API response (same data the AI analyzed)
            if (data.dataset && data.dataset.length > 0) {
                setLiveData(data.dataset);
            }

            const assistantMsg: ChatMessage = {
                role: "assistant",
                content: data.reply || (data.charts?.length > 0 ? "Here are the insights you requested:" : "I couldn't generate a response. Please try again."),
                charts: data.charts?.length > 0 ? data.charts : undefined,
                timestamp: new Date(),
            };

            setMessages([...newMessages, assistantMsg]);
        } catch (e: any) {
            toast.error("AI Error: " + e.message);
            setMessages([...newMessages, {
                role: "assistant",
                content: `⚠️ Error: ${e.message}. Please try again.`,
                timestamp: new Date(),
            }]);
        } finally {
            setIsLoading(false);
            inputRef.current?.focus();
        }
    }, [input, messages, isLoading, surveyId, existingChart]);

    const saveChart = async (chart: ChartConfig, fullExplanation?: string) => {
        try {
            const { error } = await supabase.from('saved_ai_charts').insert({
                survey_id: surveyId ? parseInt(surveyId) : null,
                title: chart.title,
                description: chart.description,
                config: { ...chart, fullExplanation },
            });
            if (error) throw error;

            setSavedChartIds(prev => new Set([...prev, chart.id]));
            toast.success("Chart saved to your dashboard!");
            onChartSaved?.();
        } catch (e: any) {
            toast.error("Failed to save: " + e.message);
        }
    };

    const clearChat = () => {
        setMessages([]);
        toast.info("Chat cleared");
    };

    // --- Data Transformation ---
    // Use liveData (from API response) as primary, macroData (from page) as fallback
    const prepareChartData = (config: ChartConfig) => {
        const dataSource = liveData.length > 0 ? liveData : macroData;
        if (!dataSource || dataSource.length === 0) return [];

        if (config.type === "SCATTER") {
            return dataSource
                .filter(r => r[config.xKey] != null && r[config.yKey] != null)
                .map(r => ({
                    x: Number(r[config.xKey]),
                    y: Number(r[config.yKey]),
                    name: r.unit_short_name || r.unit_name || r[config.xKey],
                    fullName: r.unit_name || r[config.xKey]
                }))
                .filter(d => !isNaN(d.x) && !isNaN(d.y));
        }

        const validRows = dataSource.filter(r => r[config.xKey] != null);
        const groups: Record<string, any> = {};

        validRows.forEach(row => {
            const visualKey = String(row.unit_short_name || row[config.xKey] || "N/A");
            if (!groups[visualKey]) groups[visualKey] = { sum: 0, count: 0, fullName: row.unit_name || visualKey };

            const val = config.aggregation === "COUNT" ? 1 : Number(row[config.yKey] || 0);
            groups[visualKey].sum += val;
            groups[visualKey].count += 1;

            if (config.yKeys?.length) {
                config.yKeys.forEach(k => {
                    if (groups[visualKey][k] === undefined) groups[visualKey][k] = 0;
                    groups[visualKey][k] += Number(row[k] || 0);
                });
            }
        });

        return Object.entries(groups)
            .map(([name, stats]: [string, any]) => {
                const obj: any = {
                    name,
                    fullName: stats.fullName,
                    value: config.aggregation === "AVG" ? Number((stats.sum / stats.count).toFixed(2)) : stats.sum
                };

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
            .filter(obj => obj._hasRealData) // Filter out units with absolutely no data for the requested metrics
            .sort((a, b) => b.value - a.value)
            .slice(0, 15);
    };

    // Custom tooltip
    const CustomTooltip = ({ active, payload, label }: any) => {
        if (active && payload?.length && hoveredSeries) {
            // Filter payload to only show the hovered series if available, otherwise show all
            const itemsToShow = payload.filter((p: any) => p.dataKey === hoveredSeries);

            if (itemsToShow.length === 0) return null;

            return (
                <div className="bg-white dark:bg-slate-800 p-3 border rounded-lg shadow-xl text-sm">
                    <p className="font-semibold mb-1">{payload[0].payload.fullName || label}</p>
                    {itemsToShow.map((entry: any, i: number) => (
                        <div key={i} className="flex justify-between gap-4 text-xs">
                            <span style={{ color: entry.color }}>{entry.name}:</span>
                            <span className="font-medium">{entry.value}</span>
                        </div>
                    ))}
                </div>
            );
        }
        return null;
    };

    // Data toggle state
    const [showDataForChart, setShowDataForChart] = useState<string | null>(null);

    // --- Chart Renderer ---
    const renderInlineChart = (chart: ChartConfig, messageIndex: number, fullExplanation?: string) => {
        const chartData = prepareChartData(chart);
        const isSaved = savedChartIds.has(chart.id);
        const isShowingData = showDataForChart === chart.id;

        // Determine if chart is purely Positive or purely Negative for gradient styling
        const isPurePos = (chart.yKeys?.length === 1 && chart.yKeys[0].toLowerCase().includes('pos')) || (!chart.yKeys && chart.yKey?.toLowerCase().includes('pos'));
        const isPureNeg = (chart.yKeys?.length === 1 && chart.yKeys[0].toLowerCase().includes('neg')) || (!chart.yKeys && chart.yKey?.toLowerCase().includes('neg'));
        const horizGradientUrl = isPurePos ? 'url(#colorPosHoriz)' : (isPureNeg ? 'url(#colorNegHoriz)' : undefined);
        const vertGradientUrl = isPurePos ? 'url(#colorPosVert)' : (isPureNeg ? 'url(#colorNegVert)' : undefined);

        return (
            <div key={chart.id} className="mt-4 mb-2 bg-white dark:bg-slate-900 border border-purple-200 dark:border-purple-900/30 rounded-xl overflow-hidden shadow-sm">
                <div className="bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-950/20 dark:to-indigo-950/20 px-4 py-3 border-b border-purple-100 dark:border-purple-900/20">
                    <div className="flex items-center justify-between">
                        <h4 className="font-bold text-slate-800 dark:text-slate-100 text-sm">{chart.title}</h4>
                        <div className="flex gap-1.5">
                            <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs border-purple-200 text-purple-600 hover:bg-purple-50"
                                onClick={() => setShowDataForChart(isShowingData ? null : chart.id)}
                            >
                                <Database className="w-3 h-3 mr-1" /> {isShowingData ? "Hide Data" : "View Source"}
                            </Button>
                            <Button
                                size="sm"
                                variant={isSaved ? "secondary" : "default"}
                                className={`h-7 text-xs ${isSaved ? 'bg-green-100 text-green-700' : 'bg-purple-600 hover:bg-purple-700 text-white'}`}
                                onClick={() => !isSaved && saveChart(chart, fullExplanation)}
                            >
                                {isSaved ? <CheckCircle2 className="w-3 h-3 mr-1" /> : <Save className="w-3 h-3 mr-1" />}
                                {isSaved ? "Saved" : "Save to Dashboard"}
                            </Button>
                        </div>
                    </div>
                </div>

                <div className="p-4">
                    {chartData.length === 0 ? (
                        <div className="text-center py-8 text-slate-400 text-sm">
                            No matching data for keys: {chart.xKey}, {chart.yKey || chart.yKeys?.join(', ')}
                        </div>
                    ) : (
                        <div className="h-[300px]">
                            <ResponsiveContainer width="100%" height="100%">
                                {chart.type === "PIE" ? (
                                    <PieChart>
                                        <defs>
                                            <linearGradient id="colorPosVert" x1="0" y1="1" x2="0" y2="0">
                                                <stop offset="0%" stopColor="#86efac" stopOpacity={0.9} />
                                                <stop offset="100%" stopColor="#16a34a" stopOpacity={0.9} />
                                            </linearGradient>
                                            <linearGradient id="colorNegVert" x1="0" y1="1" x2="0" y2="0">
                                                <stop offset="0%" stopColor="#fecdd3" stopOpacity={0.9} />
                                                <stop offset="100%" stopColor="#e11d48" stopOpacity={0.9} />
                                            </linearGradient>
                                            <linearGradient id="colorPosHoriz" x1="0" y1="0" x2="1" y2="0">
                                                <stop offset="0%" stopColor="#86efac" stopOpacity={0.9} />
                                                <stop offset="100%" stopColor="#16a34a" stopOpacity={0.9} />
                                            </linearGradient>
                                            <linearGradient id="colorNegHoriz" x1="0" y1="0" x2="1" y2="0">
                                                <stop offset="0%" stopColor="#fecdd3" stopOpacity={0.9} />
                                                <stop offset="100%" stopColor="#e11d48" stopOpacity={0.9} />
                                            </linearGradient>
                                        </defs>
                                        <Pie data={chartData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={2}>
                                            {chartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                                        </Pie>
                                        <Tooltip content={<CustomTooltip />} />
                                    </PieChart>
                                ) : chart.type === "SCATTER" ? (
                                    <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                                        <defs>
                                            <linearGradient id="colorPosVert" x1="0" y1="1" x2="0" y2="0"><stop offset="0%" stopColor="#86efac" stopOpacity={0.9} /><stop offset="100%" stopColor="#16a34a" stopOpacity={0.9} /></linearGradient>
                                            <linearGradient id="colorNegVert" x1="0" y1="1" x2="0" y2="0"><stop offset="0%" stopColor="#fecdd3" stopOpacity={0.9} /><stop offset="100%" stopColor="#e11d48" stopOpacity={0.9} /></linearGradient>
                                            <linearGradient id="colorPosHoriz" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#86efac" stopOpacity={0.9} /><stop offset="100%" stopColor="#16a34a" stopOpacity={0.9} /></linearGradient>
                                            <linearGradient id="colorNegHoriz" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#fecdd3" stopOpacity={0.9} /><stop offset="100%" stopColor="#e11d48" stopOpacity={0.9} /></linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                        <XAxis type="number" dataKey="x" name={chart.xKey} tick={{ fontSize: 11 }} />
                                        <YAxis type="number" dataKey="y" name={chart.yKey} tick={{ fontSize: 11 }} />
                                        <Tooltip content={<CustomTooltip />} />
                                        <Scatter data={chartData} fill="#8b5cf6" />
                                    </ScatterChart>
                                ) : chart.type === "HORIZONTAL_BAR" ? (
                                    <BarChart data={chartData} layout="vertical" margin={{ left: 20, right: 20 }} barCategoryGap="15%" barGap={2}>
                                        <defs>
                                            <linearGradient id="colorPosVert" x1="0" y1="1" x2="0" y2="0"><stop offset="0%" stopColor="#86efac" stopOpacity={0.9} /><stop offset="100%" stopColor="#16a34a" stopOpacity={0.9} /></linearGradient>
                                            <linearGradient id="colorNegVert" x1="0" y1="1" x2="0" y2="0"><stop offset="0%" stopColor="#fecdd3" stopOpacity={0.9} /><stop offset="100%" stopColor="#e11d48" stopOpacity={0.9} /></linearGradient>
                                            <linearGradient id="colorPosHoriz" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#86efac" stopOpacity={0.9} /><stop offset="100%" stopColor="#16a34a" stopOpacity={0.9} /></linearGradient>
                                            <linearGradient id="colorNegHoriz" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#fecdd3" stopOpacity={0.9} /><stop offset="100%" stopColor="#e11d48" stopOpacity={0.9} /></linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                                        <XAxis type="number" hide />
                                        <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                                        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'transparent' }} />
                                        {chart.yKeys?.length ? (
                                            chart.yKeys.map((key, i) => (
                                                <Bar
                                                    key={key}
                                                    dataKey={key}
                                                    name={chart.yLabelMap?.[key] || key}
                                                    fill={getBarColor(key, i, horizGradientUrl)}
                                                    radius={[0, 4, 4, 0]}
                                                    onMouseEnter={() => setHoveredSeries(key)}
                                                    onMouseLeave={() => setHoveredSeries(null)}
                                                />
                                            ))
                                        ) : (
                                            <Bar
                                                dataKey="value"
                                                fill="#8b5cf6"
                                                radius={[0, 4, 4, 0]}
                                                onMouseEnter={() => setHoveredSeries("value")}
                                                onMouseLeave={() => setHoveredSeries(null)}
                                            >
                                                {chartData.map((_, i) => <Cell key={i} fill={getBarColor("value", i, horizGradientUrl)} />)}
                                            </Bar>
                                        )}
                                    </BarChart>
                                ) : chart.type === "LINE" ? (
                                    <LineChart data={chartData} margin={{ bottom: 50, top: 10 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                        <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} axisLine={false} tickLine={false} scale="band" type="category" padding={{ left: 10, right: 10 }} />
                                        <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                                        <Tooltip content={<CustomTooltip />} />
                                        {chart.yKeys?.length ? (
                                            chart.yKeys.map((key, i) => (
                                                <Line
                                                    key={key}
                                                    type="monotone"
                                                    dataKey={key}
                                                    name={chart.yLabelMap?.[key] || key}
                                                    stroke={getBarColor(key, i)}
                                                    strokeWidth={3}
                                                    dot={{ r: 4 }}
                                                    activeDot={{ r: 6 }}
                                                    onMouseEnter={() => setHoveredSeries(key)}
                                                    onMouseLeave={() => setHoveredSeries(null)}
                                                />
                                            ))
                                        ) : (
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
                                    <BarChart data={chartData} margin={{ bottom: 50, top: 10 }} barCategoryGap="10%" barGap={2}>
                                        <defs>
                                            <linearGradient id="colorPosVert" x1="0" y1="1" x2="0" y2="0"><stop offset="0%" stopColor="#86efac" stopOpacity={0.9} /><stop offset="100%" stopColor="#16a34a" stopOpacity={0.9} /></linearGradient>
                                            <linearGradient id="colorNegVert" x1="0" y1="1" x2="0" y2="0"><stop offset="0%" stopColor="#fecdd3" stopOpacity={0.9} /><stop offset="100%" stopColor="#e11d48" stopOpacity={0.9} /></linearGradient>
                                            <linearGradient id="colorPosHoriz" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#86efac" stopOpacity={0.9} /><stop offset="100%" stopColor="#16a34a" stopOpacity={0.9} /></linearGradient>
                                            <linearGradient id="colorNegHoriz" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#fecdd3" stopOpacity={0.9} /><stop offset="100%" stopColor="#e11d48" stopOpacity={0.9} /></linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                        <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} axisLine={false} tickLine={false} scale="band" type="category" padding={{ left: 10, right: 10 }} />
                                        <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                                        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(0,0,0,0.03)' }} />
                                        {chart.yKeys?.length ? (
                                            chart.yKeys.map((key, i) => (
                                                <Bar
                                                    key={key}
                                                    dataKey={key}
                                                    name={chart.yLabelMap?.[key] || key}
                                                    fill={getBarColor(key, i, vertGradientUrl)}
                                                    radius={[4, 4, 0, 0]}
                                                    onMouseEnter={() => setHoveredSeries(key)}
                                                    onMouseLeave={() => setHoveredSeries(null)}
                                                />
                                            ))
                                        ) : (
                                            <Bar
                                                dataKey="value"
                                                fill="#6366f1"
                                                radius={[4, 4, 0, 0]}
                                                onMouseEnter={() => setHoveredSeries("value")}
                                                onMouseLeave={() => setHoveredSeries(null)}
                                            >
                                                {chartData.map((_, i) => <Cell key={i} fill={getBarColor("value", i, vertGradientUrl)} />)}
                                            </Bar>
                                        )}
                                    </BarChart>
                                )}
                            </ResponsiveContainer>
                        </div>
                    )}
                </div>

                <div className="px-4 py-3 bg-slate-50 dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 text-sm text-slate-700 dark:text-slate-300 prose prose-slate dark:prose-invert max-w-none">
                    <Sparkles className="inline-block w-4 h-4 text-purple-500 mr-2 -mt-0.5" />
                    <ReactMarkdown>{chart.description}</ReactMarkdown>
                </div>

                {isShowingData && (
                    <div className="border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-4 max-h-[300px] overflow-auto">
                        <table className="w-full text-left text-[11px] bg-white dark:bg-slate-900 rounded border border-slate-200 dark:border-slate-800">
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
                                {chartData.map((row, i) => (
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

    // --- Render ---
    return (
        <div className="flex flex-col h-[calc(100vh-280px)] min-h-[600px]">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-slate-900 dark:to-slate-900 rounded-t-xl">
                <div className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-purple-500" />
                    <div className="flex items-center gap-2">
                        <h3 className="font-bold text-slate-800 dark:text-slate-100">AI Analyst</h3>
                        <Badge className="bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-400 text-[10px] uppercase tracking-widest border border-indigo-200/50 dark:border-indigo-800">Auto-Analyst Core</Badge>
                    </div>
                </div>
                <div className="flex gap-2">
                    {messages.length > 0 && (
                        <Button variant="ghost" size="sm" onClick={clearChat} className="text-slate-500 hover:text-red-500 h-7 text-xs">
                            <Trash2 className="w-3 h-3 mr-1" /> Clear
                        </Button>
                    )}
                </div>
            </div>

            {/* Data availability warning */}
            {macroData.length === 0 && liveData.length === 0 && (
                <div className="mx-4 mt-3 px-4 py-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 rounded-lg flex items-start gap-3">
                    <span className="text-amber-500 text-lg mt-0.5">⚠️</span>
                    <div>
                        <p className="text-sm font-medium text-amber-800 dark:text-amber-200">No analyzed data for this survey</p>
                        <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                            This survey hasn't been analyzed yet. Switch to a survey with completed analysis (e.g. SSI 2025), or go to <strong>Surveys → Analyze</strong> to process this survey first.
                        </p>
                    </div>
                </div>
            )}

            {macroData.length > 0 && liveData.length === 0 && messages.length === 0 && (
                <div className="mx-4 mt-3 px-3 py-2 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800/30 rounded-lg">
                    <p className="text-xs text-green-700 dark:text-green-400">
                        ✅ <strong>{macroData.length} units</strong> with analyzed data ready for AI analysis.
                    </p>
                </div>
            )}

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 bg-slate-50/50 dark:bg-slate-950/50">
                {messages.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full text-center space-y-6 py-8">
                        <div className="relative">
                            <div className="absolute inset-0 bg-purple-500 blur-2xl opacity-10 rounded-full" />
                            <Sparkles className="w-16 h-16 text-purple-300 relative z-10" />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-slate-700 dark:text-slate-300 mb-1">
                                Your AI Data Scientist is Ready
                            </h3>
                            <p className="text-sm text-slate-500 max-w-md">
                                Ask questions about your survey data, request specific charts, or explore correlations. I'll analyze the live dataset and generate visualizations.
                            </p>
                        </div>
                        <div className="flex flex-col items-center gap-4 w-full max-w-lg">
                            <Button
                                onClick={() => sendMessage(
                                    "Analyze the global dataset and give me 3 distinct structural insights. " +
                                    "I want you to automatically discover the most interesting correlations, anomalies, or trends across the units. " +
                                    "For each insight, provide a chart configuration that proves your point."
                                )}
                                className="w-full sm:w-auto h-12 px-8 bg-purple-600 hover:bg-purple-700 text-white rounded-full shadow-lg shadow-purple-500/20 gap-2 transition-all hover:scale-105"
                            >
                                <Sparkles className="w-5 h-5" />
                                <span className="font-semibold tracking-wide">Auto-Discover Connections</span>
                            </Button>

                            <div className="w-full flex items-center gap-3">
                                <div className="h-px bg-slate-200 dark:bg-slate-800 flex-1" />
                                <span className="text-xs font-medium text-slate-400 uppercase tracking-widest">OR ASK MANUALLY</span>
                                <div className="h-px bg-slate-200 dark:bg-slate-800 flex-1" />
                            </div>

                            <div className="flex flex-wrap gap-2 justify-center mt-2">
                                {QUICK_PROMPTS.map((prompt, i) => (
                                    <button
                                        key={i}
                                        onClick={() => sendMessage(prompt)}
                                        className="text-[11px] px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full hover:border-purple-300 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors text-slate-600 dark:text-slate-400"
                                    >
                                        {prompt}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {messages.map((msg, i) => (
                    <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[85%] ${msg.role === "user"
                            ? "bg-purple-600 text-white rounded-2xl rounded-br-md px-4 py-3"
                            : "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl rounded-bl-md px-4 py-3 shadow-sm"
                            }`}>
                            {msg.role === "assistant" && (
                                <div className="flex items-center gap-1.5 mb-2">
                                    <Sparkles className="w-3.5 h-3.5 text-purple-500" />
                                    <span className="text-[10px] font-semibold text-purple-500 uppercase tracking-wide">AI Analyst</span>
                                </div>
                            )}
                            <div className={`text-sm leading-relaxed whitespace-pre-wrap ${msg.role === "user" ? "" : "text-slate-700 dark:text-slate-300"}`}>
                                {msg.role === "assistant" ? <BoxedMessageRenderer content={msg.content} /> : msg.content}
                            </div>
                            {msg.charts?.map((chart, cIndex) => renderInlineChart(chart, cIndex, msg.content))}
                        </div>
                    </div>
                ))}

                {isLoading && (
                    <div className="flex justify-start">
                        <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl max-w-[85%] px-4 py-3 self-start mr-auto shadow-sm">
                            <div className="flex gap-2">
                                <Sparkles className="w-5 h-5 text-purple-500 animate-pulse mt-0.5" />
                                <div>
                                    <div className="flex gap-1 mb-2">
                                        <div className="w-2 h-2 rounded-full bg-purple-400 animate-bounce" />
                                        <div className="w-2 h-2 rounded-full bg-purple-400 animate-bounce delay-75" />
                                        <div className="w-2 h-2 rounded-full bg-purple-400 animate-bounce delay-150" />
                                    </div>
                                    <p className="text-xs font-semibold text-slate-500 animate-pulse tracking-wide">Synthesizing connections...</p>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-b-xl">
                <form
                    onSubmit={(e) => { e.preventDefault(); sendMessage(); }}
                    className="flex gap-2"
                >
                    <Input
                        ref={inputRef}
                        placeholder="Ask about your data, request a chart, or explore correlations..."
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        disabled={isLoading}
                        className="h-11 bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 focus-visible:ring-purple-500"
                    />
                    <Button
                        type="submit"
                        disabled={isLoading || !input.trim()}
                        className="h-11 px-5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50"
                    >
                        {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    </Button>
                </form>
            </div>
        </div>
    );
}

// Simple markdown-like formatting for AI responses
function formatMarkdown(text: string) {
    return text
        .split('\n')
        .map((line, i) => {
            // Bold
            line = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
            // Italic
            line = line.replace(/\*(.*?)\*/g, '<em>$1</em>');

            if (line.startsWith('- ')) {
                return <li key={i} className="ml-4 list-disc" dangerouslySetInnerHTML={{ __html: line.slice(2) }} />;
            }
            if (line.trim() === '') return <br key={i} />;
            return <p key={i} dangerouslySetInnerHTML={{ __html: line }} />;
        });
}
