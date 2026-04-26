"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, Legend, ScatterChart, Scatter,
    PieChart, Pie, Cell, LineChart, Line, LabelList, ReferenceLine
} from "recharts";
import {
    Sparkles, Send, Loader2, Save, CheckCircle2,
    Copy, MessageSquare, Trash2, RotateCcw, Database,
    Quote, User, Bot, BarChart2, AlertTriangle, TrendingUp, Users
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

// Strip metric prefixes and underscores for human-readable labels
const formatKey = (key: string): string =>
    key.replace(/^(likert_|binary_|category_)/, '').replace(/_+/g, ' ').trim().slice(0, 32);

// Angled X-axis tick for crowded category labels
const RotatedTick = ({ x, y, payload }: any) => {
    const label = String(payload?.value || '');
    const truncated = label.length > 16 ? label.slice(0, 15) + '…' : label;
    return (
        <g transform={`translate(${x},${y})`}>
            <text x={0} y={0} dy={10} textAnchor="end" fill="#64748b" fontSize={9.5} transform="rotate(-35)">
                {truncated}
            </text>
        </g>
    );
};

const getBarColor = (key: string, index: number, overrideGradient?: string) => {
    const k = key.toLowerCase();
    if (k.includes('pos')) return overrideGradient || '#22c55e'; // Green 500
    if (k.includes('neg')) return overrideGradient || '#f43f5e'; // Rose 500
    if (k.includes('neu')) return '#94a3b8'; // Slate 400
    return COLORS[index % COLORS.length];
};

const ANALYSIS_TILES = [
    {
        icon: BarChart2,
        bg: "bg-blue-50 dark:bg-blue-950/40",
        iconColor: "text-blue-600 dark:text-blue-400",
        border: "border-blue-100 dark:border-blue-900/50 hover:border-blue-300 dark:hover:border-blue-700",
        label: "Compare Units",
        hint: "Which units struggle most with Facilities vs. Teaching?",
        prompt: "Which 3 units are struggling the most with Facilities & Infrastructure, and how does it compare to their Teaching quality sentiment? Show a multi-series bar chart.",
    },
    {
        icon: TrendingUp,
        bg: "bg-violet-50 dark:bg-violet-950/40",
        iconColor: "text-violet-600 dark:text-violet-400",
        border: "border-violet-100 dark:border-violet-900/50 hover:border-violet-300 dark:hover:border-violet-700",
        label: "Spot Outliers",
        hint: "Scatter: sentiment score vs. feedback volume",
        prompt: "Plot a scatter graph showing sentiment score vs. total segment volume to identify units that are high-volume but critically low-sentiment.",
    },
    {
        icon: AlertTriangle,
        bg: "bg-amber-50 dark:bg-amber-950/40",
        iconColor: "text-amber-600 dark:text-amber-400",
        border: "border-amber-100 dark:border-amber-900/50 hover:border-amber-300 dark:hover:border-amber-700",
        label: "Find Gaps",
        hint: "Biggest mismatch between scores and written sentiment?",
        prompt: "Which department has the most surprising disparity between quantitative survey scores and qualitative written sentiment? Explain the gap and show a comparison chart.",
    },
    {
        icon: Users,
        bg: "bg-emerald-50 dark:bg-emerald-950/40",
        iconColor: "text-emerald-600 dark:text-emerald-400",
        border: "border-emerald-100 dark:border-emerald-900/50 hover:border-emerald-300 dark:hover:border-emerald-700",
        label: "Rank & Score",
        hint: "Rank all units by positive-to-negative ratio",
        prompt: "Generate a horizontal bar chart ranking all units by their ratio of positive to negative feedback. Highlight the top 3 and bottom 3 performers with an explanation.",
    },
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

    // Custom tooltip — shows all series by default, highlights hovered series
    const CustomTooltip = ({ active, payload, label }: any) => {
        if (!active || !payload?.length) return null;
        const filtered = hoveredSeries ? payload.filter((p: any) => p.dataKey === hoveredSeries) : payload;
        const toDisplay = filtered.length > 0 ? filtered : payload;
        return (
            <div className="bg-white dark:bg-slate-800 p-3 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl min-w-[160px]">
                <p className="font-semibold text-slate-700 dark:text-slate-200 mb-2 text-xs">
                    {payload[0]?.payload?.fullName || label}
                </p>
                {toDisplay.map((entry: any, i: number) => (
                    <div key={i} className="flex items-center justify-between gap-3 text-xs mb-0.5">
                        <span className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: entry.color }} />
                            <span className="text-slate-500 dark:text-slate-400">{formatKey(entry.name || entry.dataKey)}</span>
                        </span>
                        <span className="font-semibold text-slate-800 dark:text-slate-100 tabular-nums">
                            {typeof entry.value === 'number' ? entry.value.toFixed(2) : entry.value}
                        </span>
                    </div>
                ))}
            </div>
        );
    };

    // Data toggle state
    const [showDataForChart, setShowDataForChart] = useState<string | null>(null);

    // All charts extracted from the conversation — newest first for the right panel
    const conversationCharts = useMemo(() => {
        const result: Array<{ chart: ChartConfig; explanation: string }> = [];
        for (const msg of messages) {
            if (msg.role === "assistant" && msg.charts?.length) {
                for (const chart of msg.charts) {
                    result.push({ chart, explanation: msg.content });
                }
            }
        }
        return result.reverse();
    }, [messages]);

    // --- Chart Renderer ---
    const renderInlineChart = (chart: ChartConfig, messageIndex: number, fullExplanation?: string) => {
        const chartData = prepareChartData(chart);
        const isSaved = savedChartIds.has(chart.id);
        const isShowingData = showDataForChart === chart.id;

        // Unique gradient IDs per chart — prevents SVG ID collisions when multiple charts render simultaneously
        const gid = chart.id.replace(/\W/g, '_');
        const isPurePos = (chart.yKeys?.length === 1 && chart.yKeys[0].toLowerCase().includes('pos')) || (!chart.yKeys && chart.yKey?.toLowerCase().includes('pos'));
        const isPureNeg = (chart.yKeys?.length === 1 && chart.yKeys[0].toLowerCase().includes('neg')) || (!chart.yKeys && chart.yKey?.toLowerCase().includes('neg'));
        const horizGradient = isPurePos ? `url(#posH_${gid})` : (isPureNeg ? `url(#negH_${gid})` : undefined);
        const vertGradient  = isPurePos ? `url(#posV_${gid})` : (isPureNeg ? `url(#negV_${gid})` : undefined);

        const hasLikert   = chart.yKey?.startsWith('likert_') || chart.yKeys?.some(k => k.startsWith('likert_'));
        const hasBinary   = !hasLikert && (chart.yKey?.startsWith('binary_') || chart.yKeys?.some(k => k.startsWith('binary_')));
        const isMulti     = (chart.yKeys?.length || 0) > 1;

        // Dynamic height: horizontal bars grow with row count; vertical bars cap at 440px
        const chartHeight =
            chart.type === 'HORIZONTAL_BAR' ? Math.max(260, chartData.length * 50 + 60) :
            chart.type === 'PIE'            ? 320 :
            chart.type === 'SCATTER'        ? 360 :
            Math.max(300, Math.min(440, chartData.length * 28 + 120));

        // Dynamic Y-axis width for horizontal bar based on longest label
        const yAxisWidth = Math.min(Math.max(...chartData.map(d => (d.name || '').length), 4) * 7, 160);

        const sharedDefs = (
            <defs>
                <linearGradient id={`posV_${gid}`} x1="0" y1="1" x2="0" y2="0">
                    <stop offset="0%" stopColor="#86efac" stopOpacity={0.9} /><stop offset="100%" stopColor="#16a34a" stopOpacity={0.9} />
                </linearGradient>
                <linearGradient id={`negV_${gid}`} x1="0" y1="1" x2="0" y2="0">
                    <stop offset="0%" stopColor="#fecdd3" stopOpacity={0.9} /><stop offset="100%" stopColor="#e11d48" stopOpacity={0.9} />
                </linearGradient>
                <linearGradient id={`posH_${gid}`} x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#86efac" stopOpacity={0.9} /><stop offset="100%" stopColor="#16a34a" stopOpacity={0.9} />
                </linearGradient>
                <linearGradient id={`negH_${gid}`} x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#fecdd3" stopOpacity={0.9} /><stop offset="100%" stopColor="#e11d48" stopOpacity={0.9} />
                </linearGradient>
            </defs>
        );

        return (
            <div key={chart.id} className="mt-4 mb-2 bg-white dark:bg-slate-900 border border-purple-200 dark:border-purple-900/30 rounded-xl overflow-hidden shadow-sm">
                {/* Header */}
                <div className="bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-950/20 dark:to-indigo-950/20 px-4 py-3 border-b border-purple-100 dark:border-purple-900/20">
                    <div className="flex items-center justify-between gap-2">
                        <h4 className="font-bold text-slate-800 dark:text-slate-100 text-sm leading-snug">{chart.title}</h4>
                        <div className="flex gap-1.5 shrink-0">
                            <Button size="sm" variant="outline"
                                className="h-7 text-xs border-purple-200 text-purple-600 hover:bg-purple-50"
                                onClick={() => setShowDataForChart(isShowingData ? null : chart.id)}>
                                <Database className="w-3 h-3 mr-1" />{isShowingData ? "Hide Data" : "View Source"}
                            </Button>
                            <Button size="sm" variant={isSaved ? "secondary" : "default"}
                                className={`h-7 text-xs ${isSaved ? 'bg-green-100 text-green-700' : 'bg-purple-600 hover:bg-purple-700 text-white'}`}
                                onClick={() => !isSaved && saveChart(chart, fullExplanation)}>
                                {isSaved ? <CheckCircle2 className="w-3 h-3 mr-1" /> : <Save className="w-3 h-3 mr-1" />}
                                {isSaved ? "Saved" : "Save"}
                            </Button>
                        </div>
                    </div>
                </div>

                {/* Chart body */}
                <div className="px-4 pt-4 pb-2">
                    {chartData.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-10 gap-2 text-slate-400">
                            <BarChart2 className="w-8 h-8 opacity-20" />
                            <p className="text-sm font-medium">No data matched the requested keys</p>
                            <p className="text-[11px] opacity-60">{chart.xKey} · {chart.yKey || chart.yKeys?.join(', ')}</p>
                        </div>
                    ) : (
                        <div style={{ height: chartHeight }}>
                            <ResponsiveContainer width="100%" height="100%">
                                {chart.type === "PIE" ? (
                                    <PieChart>
                                        {sharedDefs}
                                        <Pie data={chartData} dataKey="value" nameKey="name"
                                            cx="50%" cy="42%" innerRadius={55} outerRadius={88} paddingAngle={2}
                                            label={({ percent }: any) => `${(percent * 100).toFixed(0)}%`}
                                            labelLine={{ stroke: '#cbd5e1', strokeWidth: 1 }}>
                                            {chartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                                        </Pie>
                                        <Tooltip formatter={(value: any, name: string) => [
                                            typeof value === 'number' ? value.toFixed(2) : value,
                                            formatKey(name),
                                        ]} />
                                        <Legend formatter={(v) => formatKey(v)} wrapperStyle={{ fontSize: '10px', paddingTop: '6px' }} />
                                    </PieChart>

                                ) : chart.type === "SCATTER" ? (
                                    <ScatterChart margin={{ top: 16, right: 32, bottom: 36, left: 16 }}>
                                        {sharedDefs}
                                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                        <XAxis type="number" dataKey="x" name={formatKey(chart.xKey)}
                                            tick={{ fontSize: 10 }} axisLine={false} tickLine={false}
                                            label={{ value: formatKey(chart.xKey), position: 'insideBottom', offset: -16, fontSize: 10, fill: '#94a3b8' }} />
                                        <YAxis type="number" dataKey="y" name={formatKey(chart.yKey || '')}
                                            tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={38}
                                            label={{ value: formatKey(chart.yKey || ''), angle: -90, position: 'insideLeft', offset: 12, fontSize: 10, fill: '#94a3b8' }} />
                                        <Tooltip cursor={{ strokeDasharray: '3 3' }} content={({ active, payload }: any) => {
                                            if (!active || !payload?.length) return null;
                                            const d = payload[0]?.payload;
                                            return (
                                                <div className="bg-white dark:bg-slate-800 p-2.5 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl text-xs">
                                                    <p className="font-bold text-slate-800 dark:text-slate-100 mb-1">{d?.fullName || d?.name}</p>
                                                    <p className="text-slate-500">{formatKey(chart.xKey)}: <span className="font-semibold text-slate-700 dark:text-slate-300">{d?.x}</span></p>
                                                    <p className="text-slate-500">{formatKey(chart.yKey || '')}: <span className="font-semibold text-slate-700 dark:text-slate-300">{d?.y}</span></p>
                                                </div>
                                            );
                                        }} />
                                        <Scatter data={chartData} fill="#8b5cf6">
                                            <LabelList dataKey="name" position="top" style={{ fontSize: '9px', fill: '#64748b' }} />
                                        </Scatter>
                                    </ScatterChart>

                                ) : chart.type === "HORIZONTAL_BAR" ? (
                                    <BarChart data={chartData} layout="vertical"
                                        margin={{ left: 8, right: 48, top: 4, bottom: 4 }}
                                        barCategoryGap="18%" barGap={2}>
                                        {sharedDefs}
                                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                                        <XAxis type="number" tick={{ fontSize: 10 }} axisLine={false} tickLine={false}
                                            domain={hasLikert ? [0, 4] : hasBinary ? [0, 1] : [0, 'auto']} />
                                        <YAxis dataKey="name" type="category" width={yAxisWidth}
                                            tick={{ fontSize: 10, fill: '#475569' }} axisLine={false} tickLine={false} />
                                        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(99,102,241,0.04)' }} />
                                        {isMulti && <Legend formatter={formatKey} wrapperStyle={{ fontSize: '10px', paddingTop: '8px' }} />}
                                        {hasLikert && <ReferenceLine x={3} stroke="#cbd5e1" strokeDasharray="4 2"
                                            label={{ value: '3.0', fill: '#94a3b8', fontSize: 9, position: 'insideTopRight' }} />}
                                        {chart.yKeys?.length ? (
                                            chart.yKeys.map((key, i) => (
                                                <Bar key={key} dataKey={key} name={chart.yLabelMap?.[key] || key}
                                                    fill={getBarColor(key, i, horizGradient)} radius={[0, 4, 4, 0]}
                                                    onMouseEnter={() => setHoveredSeries(key)}
                                                    onMouseLeave={() => setHoveredSeries(null)} />
                                            ))
                                        ) : (
                                            <Bar dataKey="value" fill="#8b5cf6" radius={[0, 4, 4, 0]}
                                                onMouseEnter={() => setHoveredSeries("value")}
                                                onMouseLeave={() => setHoveredSeries(null)}>
                                                {chartData.map((_, i) => <Cell key={i} fill={getBarColor("value", i, horizGradient)} />)}
                                                <LabelList dataKey="value" position="right"
                                                    formatter={(v: number) => v.toFixed(2)}
                                                    style={{ fontSize: '9px', fill: '#64748b' }} />
                                            </Bar>
                                        )}
                                    </BarChart>

                                ) : chart.type === "LINE" ? (
                                    <LineChart data={chartData} margin={{ bottom: 60, top: 12, left: 0, right: 12 }}>
                                        {sharedDefs}
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                        <XAxis dataKey="name" tick={<RotatedTick />} height={60} interval={0}
                                            axisLine={false} tickLine={false} />
                                        <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={36}
                                            domain={hasLikert ? [0, 4] : hasBinary ? [0, 1] : [0, 'auto']} />
                                        <Tooltip content={<CustomTooltip />} />
                                        {isMulti && <Legend formatter={formatKey} wrapperStyle={{ fontSize: '10px' }} />}
                                        {hasLikert && <ReferenceLine y={3} stroke="#cbd5e1" strokeDasharray="4 2"
                                            label={{ value: '3.0', fill: '#94a3b8', fontSize: 9, position: 'insideTopRight' }} />}
                                        {chart.yKeys?.length ? (
                                            chart.yKeys.map((key, i) => (
                                                <Line key={key} type="monotone" dataKey={key}
                                                    name={chart.yLabelMap?.[key] || key}
                                                    stroke={getBarColor(key, i)} strokeWidth={2.5}
                                                    dot={{ r: 3.5 }} activeDot={{ r: 5.5 }}
                                                    onMouseEnter={() => setHoveredSeries(key)}
                                                    onMouseLeave={() => setHoveredSeries(null)} />
                                            ))
                                        ) : (
                                            <Line type="monotone" dataKey="value" stroke="#6366f1"
                                                strokeWidth={2.5} dot={{ r: 3.5 }} activeDot={{ r: 5.5 }}
                                                onMouseEnter={() => setHoveredSeries("value")}
                                                onMouseLeave={() => setHoveredSeries(null)}>
                                                <LabelList dataKey="value" position="top"
                                                    formatter={(v: number) => v.toFixed(2)}
                                                    style={{ fontSize: '9px', fill: '#64748b' }} />
                                            </Line>
                                        )}
                                    </LineChart>

                                ) : (
                                    /* Default: vertical BAR */
                                    <BarChart data={chartData} margin={{ bottom: 60, top: 12, left: 0, right: 12 }}
                                        barCategoryGap="12%" barGap={2}>
                                        {sharedDefs}
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                        <XAxis dataKey="name" tick={<RotatedTick />} height={60} interval={0}
                                            axisLine={false} tickLine={false} />
                                        <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={36}
                                            domain={hasLikert ? [0, 4] : hasBinary ? [0, 1] : [0, 'auto']} />
                                        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(0,0,0,0.025)' }} />
                                        {isMulti && <Legend formatter={formatKey} wrapperStyle={{ fontSize: '10px', paddingTop: '8px' }} />}
                                        {hasLikert && <ReferenceLine y={3} stroke="#cbd5e1" strokeDasharray="4 2"
                                            label={{ value: '3.0', fill: '#94a3b8', fontSize: 9, position: 'insideTopRight' }} />}
                                        {chart.yKeys?.length ? (
                                            chart.yKeys.map((key, i) => (
                                                <Bar key={key} dataKey={key} name={chart.yLabelMap?.[key] || key}
                                                    fill={getBarColor(key, i, vertGradient)} radius={[4, 4, 0, 0]}
                                                    onMouseEnter={() => setHoveredSeries(key)}
                                                    onMouseLeave={() => setHoveredSeries(null)} />
                                            ))
                                        ) : (
                                            <Bar dataKey="value" fill="#6366f1" radius={[4, 4, 0, 0]}
                                                onMouseEnter={() => setHoveredSeries("value")}
                                                onMouseLeave={() => setHoveredSeries(null)}>
                                                {chartData.map((_, i) => <Cell key={i} fill={getBarColor("value", i, vertGradient)} />)}
                                                <LabelList dataKey="value" position="top"
                                                    formatter={(v: number) => v.toFixed(2)}
                                                    style={{ fontSize: '9px', fill: '#64748b' }} />
                                            </Bar>
                                        )}
                                    </BarChart>
                                )}
                            </ResponsiveContainer>
                        </div>
                    )}
                </div>

                {/* AI insight description */}
                <div className="px-4 py-3 bg-slate-50 dark:bg-slate-900/60 border-t border-slate-100 dark:border-slate-800 text-sm text-slate-700 dark:text-slate-300 prose prose-slate dark:prose-invert max-w-none">
                    <Sparkles className="inline-block w-4 h-4 text-purple-500 mr-2 -mt-0.5" />
                    <ReactMarkdown>{chart.description}</ReactMarkdown>
                </div>

                {/* Data source table */}
                {isShowingData && (
                    <div className="border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-4 max-h-[300px] overflow-auto">
                        <table className="w-full text-left text-[11px] bg-white dark:bg-slate-900 rounded border border-slate-200 dark:border-slate-800">
                            <thead className="bg-slate-100 dark:bg-slate-800 sticky top-0">
                                <tr>
                                    <th className="p-2 border-b font-semibold">Unit</th>
                                    {chart.yKeys?.length ? (
                                        chart.yKeys.map(k => <th key={k} className="p-2 border-b font-semibold text-right">{formatKey(k)}</th>)
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
                                            chart.yKeys.map(k => (
                                                <td key={k} className="p-2 text-right font-mono">
                                                    {typeof row[k] === 'number' ? row[k].toFixed(2) : (row[k] ?? '—')}
                                                </td>
                                            ))
                                        ) : (
                                            <td className="p-2 text-right font-mono">
                                                {typeof row.value === 'number' ? row.value.toFixed(2) : row.value}
                                            </td>
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

    const inputArea = (
        <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
            <form onSubmit={(e) => { e.preventDefault(); sendMessage(); }} className="flex gap-2">
                <Input
                    ref={inputRef}
                    placeholder="Ask about your data, request a chart, explore correlations..."
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    disabled={isLoading}
                    className="h-10 bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 focus-visible:ring-purple-500 text-sm"
                />
                <Button
                    type="submit"
                    disabled={isLoading || !input.trim()}
                    className="h-10 px-4 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 shrink-0"
                >
                    {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </Button>
            </form>
        </div>
    );

    // --- Render ---
    return (
        <div className="flex flex-col h-[calc(100vh-280px)] min-h-[600px]">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-slate-900 dark:to-slate-900 rounded-t-xl shrink-0">
                <div className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-purple-500" />
                    <h3 className="font-bold text-slate-800 dark:text-slate-100">AI Analyst</h3>
                    <Badge className="bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-400 text-[10px] uppercase tracking-widest border border-indigo-200/50 dark:border-indigo-800">Auto-Analyst Core</Badge>
                </div>
                <div className="flex items-center gap-2">
                    {messages.length > 0 && (
                        <span className="text-[11px] text-slate-400 dark:text-slate-500">
                            {conversationCharts.length} chart{conversationCharts.length !== 1 ? 's' : ''} generated
                        </span>
                    )}
                    {messages.length > 0 && (
                        <Button variant="ghost" size="sm" onClick={clearChat} className="text-slate-500 hover:text-red-500 h-7 text-xs">
                            <Trash2 className="w-3 h-3 mr-1" /> Clear
                        </Button>
                    )}
                </div>
            </div>

            {messages.length === 0 ? (
                /* ── EMPTY STATE: full-width hero ── */
                <>
                    <div className="flex-1 overflow-y-auto px-4 py-4 bg-slate-50/50 dark:bg-slate-950/50">
                        <div className="flex flex-col items-center justify-center h-full gap-8 py-6">
                            {macroData.length === 0 && liveData.length === 0 ? (
                                <div className="flex flex-col items-center gap-4 text-center max-w-sm">
                                    <div className="w-14 h-14 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/50 flex items-center justify-center">
                                        <AlertTriangle className="w-7 h-7 text-amber-500" />
                                    </div>
                                    <div>
                                        <p className="font-semibold text-slate-800 dark:text-slate-200 mb-1">AI context not built yet</p>
                                        <p className="text-sm text-slate-500 dark:text-slate-400">
                                            Go to <span className="font-medium text-slate-700 dark:text-slate-300">Surveys → Manage → Build AI Context</span> to synthesize this survey, then return here.
                                        </p>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <div className="flex flex-col items-center gap-3 text-center">
                                        <div className="relative mb-1">
                                            <div className="absolute inset-0 bg-purple-400 blur-2xl opacity-20 rounded-full scale-150" />
                                            <div className="relative w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-purple-500/30">
                                                <Sparkles className="w-7 h-7 text-white" />
                                            </div>
                                        </div>
                                        <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 tracking-tight">Ask anything about your data</h3>
                                        <p className="text-sm text-slate-500 dark:text-slate-400 max-w-xs leading-relaxed">
                                            Generate charts, surface correlations, and find institutional patterns — in plain English.
                                        </p>
                                        {macroData.length > 0 && (
                                            <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/50 px-2.5 py-1 rounded-full">
                                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                                {macroData.length} units synthesized · Ready
                                            </span>
                                        )}
                                    </div>
                                    <Button
                                        onClick={() => sendMessage(
                                            "Analyze the global dataset and give me 3 distinct structural insights. " +
                                            "Automatically discover the most interesting correlations, anomalies, or trends across units. " +
                                            "For each insight, provide a chart that proves your point."
                                        )}
                                        className="h-11 px-7 bg-purple-600 hover:bg-purple-700 text-white rounded-full shadow-lg shadow-purple-500/20 gap-2 font-semibold transition-all hover:scale-[1.02] active:scale-100"
                                    >
                                        <Sparkles className="w-4 h-4" /> Auto-Discover Insights
                                    </Button>
                                    <div className="w-full max-w-lg space-y-2">
                                        <p className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-widest text-center mb-3">Or start with a specific question</p>
                                        <div className="grid grid-cols-2 gap-2.5">
                                            {ANALYSIS_TILES.map((tile) => {
                                                const Icon = tile.icon;
                                                return (
                                                    <button
                                                        key={tile.label}
                                                        onClick={() => sendMessage(tile.prompt)}
                                                        className={`group text-left p-3.5 rounded-xl border bg-white dark:bg-slate-900 ${tile.border} transition-all duration-150 hover:shadow-md`}
                                                    >
                                                        <div className={`inline-flex p-1.5 rounded-lg ${tile.bg} mb-2.5`}>
                                                            <Icon className={`w-3.5 h-3.5 ${tile.iconColor}`} />
                                                        </div>
                                                        <p className="text-xs font-bold text-slate-800 dark:text-slate-100 mb-0.5">{tile.label}</p>
                                                        <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">{tile.hint}</p>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                    {inputArea}
                </>
            ) : (
                /* ── ACTIVE: split pane (chat left | chart canvas right) ── */
                <div className="flex flex-1 overflow-hidden">
                    {/* LEFT: Chat thread */}
                    <div className="flex flex-col w-[44%] border-r border-slate-200 dark:border-slate-800 overflow-hidden shrink-0">
                        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 bg-slate-50/50 dark:bg-slate-950/50">
                            {messages.map((msg, i) => (
                                <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                                    <div className={`max-w-[90%] ${msg.role === "user"
                                        ? "bg-purple-600 text-white rounded-2xl rounded-br-md px-3.5 py-2.5"
                                        : "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl rounded-bl-md px-3.5 py-2.5 shadow-sm"
                                    }`}>
                                        {msg.role === "assistant" && (
                                            <div className="flex items-center gap-1.5 mb-1.5">
                                                <Sparkles className="w-3 h-3 text-purple-500" />
                                                <span className="text-[10px] font-semibold text-purple-500 uppercase tracking-wide">AI Analyst</span>
                                            </div>
                                        )}
                                        <div className={`text-sm leading-relaxed ${msg.role === "user" ? "" : "text-slate-700 dark:text-slate-300"}`}>
                                            {msg.role === "assistant" ? <BoxedMessageRenderer content={msg.content} /> : msg.content}
                                        </div>
                                        {msg.charts && msg.charts.length > 0 && (
                                            <div className="mt-2 flex items-center gap-1.5 px-2.5 py-1 bg-purple-50 dark:bg-purple-950/30 rounded-lg border border-purple-100 dark:border-purple-900/30 w-fit">
                                                <BarChart2 className="w-3 h-3 text-purple-500" />
                                                <span className="text-[11px] text-purple-600 dark:text-purple-400 font-medium">
                                                    {msg.charts.length} chart{msg.charts.length > 1 ? 's' : ''} → right panel
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                            {/* Follow-up suggestion chips — shown after the last AI response */}
                            {!isLoading && messages.length > 0 && messages[messages.length - 1].role === "assistant" && (() => {
                                const lastMsg = messages[messages.length - 1];
                                const hasCharts = lastMsg.charts && lastMsg.charts.length > 0;
                                const chips = hasCharts ? [
                                    "Which unit needs the most urgent attention?",
                                    "Break this down by faculty or program",
                                    "Find outliers or anomalies in this data",
                                ] : [
                                    "Visualize this as a chart",
                                    "Compare the top 3 and bottom 3 performers",
                                    "What is causing the biggest gap?",
                                ];
                                return (
                                    <div className="flex flex-col gap-1.5 pl-1 pt-1">
                                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Suggested follow-ups</p>
                                        <div className="flex flex-wrap gap-1.5">
                                            {chips.map((chip, i) => (
                                                <button
                                                    key={i}
                                                    onClick={() => sendMessage(chip)}
                                                    className="text-[11px] px-2.5 py-1 rounded-full border border-purple-200 dark:border-purple-800 bg-white dark:bg-purple-950/20 text-purple-600 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-900/40 transition-all hover:border-purple-400 font-medium shadow-sm"
                                                >
                                                    {chip}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })()}
                            {isLoading && (
                                <div className="flex justify-start">
                                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-3 shadow-sm">
                                        <div className="flex gap-2 items-center">
                                            <Sparkles className="w-4 h-4 text-purple-500 animate-pulse" />
                                            <div className="flex gap-1">
                                                <div className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-bounce" />
                                                <div className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-bounce delay-75" />
                                                <div className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-bounce delay-150" />
                                            </div>
                                            <p className="text-xs text-slate-500 animate-pulse">Synthesizing...</p>
                                        </div>
                                    </div>
                                </div>
                            )}
                            <div ref={messagesEndRef} />
                        </div>
                        {inputArea}
                    </div>

                    {/* RIGHT: Chart canvas */}
                    <div className="flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-950/80 flex flex-col">
                        <div className="px-4 pt-3 pb-1 flex items-center justify-between border-b border-slate-100 dark:border-slate-800/60 shrink-0">
                            <div className="flex items-center gap-1.5">
                                <BarChart2 className="w-3.5 h-3.5 text-purple-400" />
                                <p className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Chart Canvas</p>
                            </div>
                            {conversationCharts.length > 0 && (
                                <span className="text-[11px] text-slate-400">{conversationCharts.length} generated</span>
                            )}
                        </div>
                        <div className="flex-1 p-4 space-y-4">
                            {conversationCharts.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-8">
                                    <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                                        <BarChart2 className="w-7 h-7 text-slate-300 dark:text-slate-600" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Charts will appear here</p>
                                        <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 max-w-[200px] leading-relaxed">Generated charts display in this panel as you analyze your data</p>
                                    </div>
                                </div>
                            ) : (
                                conversationCharts.map(({ chart, explanation }, idx) =>
                                    renderInlineChart(chart, idx, explanation)
                                )
                            )}
                        </div>
                    </div>
                </div>
            )}
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
