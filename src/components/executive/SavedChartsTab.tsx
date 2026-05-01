"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
    Sparkles, Trash2, Copy, Edit3, MessageSquare, ArrowLeft, ArrowRight,
    Database, BarChart2,
} from "lucide-react";
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    Cell, LineChart, Line, ScatterChart, Scatter, PieChart, Pie, Legend,
    LabelList, ReferenceLine,
} from "recharts";
import { toast } from "sonner";
import { BoxedMessageRenderer } from "@/components/analysis/BoxedMessageRenderer";
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
    yLabelMap?: Record<string, string>;
};

type SavedChart = {
    id: string;
    title: string;
    description: string;
    config: ChartConfig;
};

const COLORS = ['#6366f1', '#a855f7', '#ec4899', '#f43f5e', '#3b82f6', '#10b981', '#f59e0b', '#84cc16'];
const CHARTS_PER_PAGE = 4;

const formatKey = (key: string): string =>
    key.replace(/^(likert_|binary_|category_)/, '').replace(/_+/g, ' ').trim().slice(0, 32);

const CHART_TYPE_STYLE: Record<string, string> = {
    BAR: 'bg-indigo-50 text-indigo-600 border-indigo-100 dark:bg-indigo-950/40 dark:text-indigo-400 dark:border-indigo-900/40',
    HORIZONTAL_BAR: 'bg-indigo-50 text-indigo-600 border-indigo-100 dark:bg-indigo-950/40 dark:text-indigo-400 dark:border-indigo-900/40',
    LINE: 'bg-blue-50 text-blue-600 border-blue-100 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-900/40',
    PIE: 'bg-violet-50 text-violet-600 border-violet-100 dark:bg-violet-950/40 dark:text-violet-400 dark:border-violet-900/40',
    SCATTER: 'bg-cyan-50 text-cyan-600 border-cyan-100 dark:bg-cyan-950/40 dark:text-cyan-400 dark:border-cyan-900/40',
};

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

interface Props {
    onOpenAnalyst?: (chart: ChartConfig) => void;
}

export default function SavedChartsTab({ onOpenAnalyst }: Props) {
    const { activeSurveyId } = useActiveSurvey();
    const selectedSurvey = activeSurveyId;

    const [macroData, setMacroData] = useState<any[]>([]);
    const [savedCharts, setSavedCharts] = useState<SavedChart[]>([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(0);
    const [hoveredSeries, setHoveredSeries] = useState<string | null>(null);
    const [showDataForChart, setShowDataForChart] = useState<string | null>(null);

    const loadData = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            // Load macro data from cache
            if (selectedSurvey && selectedSurvey !== "all") {
                const { data: surveyRow } = await supabase
                    .from('surveys')
                    .select('ai_dataset_cache')
                    .eq('id', parseInt(selectedSurvey))
                    .single();
                const raw = (surveyRow as any)?.ai_dataset_cache;
                setMacroData(Array.isArray(raw) ? raw : (raw?.units || []));
            }

            // Load saved charts
            let query = supabase.from('saved_ai_charts').select('*').order('created_at', { ascending: false });
            if (selectedSurvey && selectedSurvey !== "all") {
                query = query.eq('survey_id', parseInt(selectedSurvey));
            } else {
                query = query.is('survey_id', null);
            }
            const { data } = await query;
            setSavedCharts(data || []);
            setPage(0);
        } finally {
            if (!silent) setLoading(false);
        }
    }, [selectedSurvey]);

    useEffect(() => { loadData(); }, [loadData]);

    const deleteChart = async (id: string) => {
        const { error } = await supabase.from('saved_ai_charts').delete().eq('id', id);
        if (!error) { setSavedCharts(prev => prev.filter(c => c.id !== id)); toast.success("Chart removed."); }
    };

    const duplicateChart = async (chart: SavedChart) => {
        const { error } = await supabase.from('saved_ai_charts').insert({
            survey_id: selectedSurvey !== "all" ? parseInt(selectedSurvey!) : null,
            title: `${chart.config.title} (Copy)`,
            description: chart.config.description,
            config: { ...chart.config, id: `chart_copy_${Date.now()}`, title: `${chart.config.title} (Copy)` },
        });
        if (!error) { toast.success("Chart duplicated!"); loadData(true); }
    };

    const prepareChartData = (config: ChartConfig) => {
        if (!macroData.length) return [];
        if (config.type === "SCATTER") {
            return macroData
                .filter(r => r[config.xKey] != null && r[config.yKey] != null)
                .map(r => ({ x: Number(r[config.xKey]), y: Number(r[config.yKey]), name: r.unit_short_name || r.unit_name, fullName: r.unit_name }))
                .filter(d => !isNaN(d.x) && !isNaN(d.y));
        }
        const groups: Record<string, any> = {};
        macroData.filter(r => r[config.xKey] != null).forEach(row => {
            const key = String(row.unit_short_name || row[config.xKey] || "N/A");
            if (!groups[key]) groups[key] = { sum: 0, count: 0, fullName: row.unit_name || key };
            groups[key].sum += config.aggregation === "COUNT" ? 1 : Number(row[config.yKey] || 0);
            groups[key].count += 1;
            config.yKeys?.forEach(k => { if (groups[key][k] === undefined) groups[key][k] = 0; groups[key][k] += Number(row[k] || 0); });
        });
        return Object.entries(groups)
            .map(([name, stats]: [string, any]) => {
                const obj: any = { name, fullName: stats.fullName, value: config.aggregation === "AVG" ? +(stats.sum / stats.count).toFixed(2) : stats.sum };
                config.yKeys?.length ? config.yKeys.forEach(k => { obj[k] = stats[k]; }) : null;
                return obj;
            })
            .filter(obj => config.yKeys?.length ? config.yKeys.some(k => obj[k]) : obj.value)
            .sort((a, b) => b.value - a.value).slice(0, 15);
    };

    const CustomTooltip = ({ active, payload, label }: any) => {
        if (!active || !payload?.length) return null;
        const filtered = hoveredSeries ? payload.filter((p: any) => p.dataKey === hoveredSeries) : payload;
        const toDisplay = filtered.length > 0 ? filtered : payload;
        return (
            <div className="bg-white dark:bg-slate-800 p-3 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl min-w-[160px]">
                <p className="font-semibold text-slate-700 dark:text-slate-200 mb-2 text-xs">{payload[0]?.payload?.fullName || label}</p>
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

    const renderChart = (chart: ChartConfig) => {
        const data = prepareChartData(chart);
        if (!data.length) return (
            <div className="flex flex-col items-center justify-center py-10 gap-2 text-slate-400">
                <BarChart2 className="w-8 h-8 opacity-20" />
                <p className="text-sm font-medium">No data for this chart</p>
            </div>
        );

        const gid = chart.id.replace(/\W/g, '_');
        const isPurePos = (!chart.yKeys && chart.yKey?.toLowerCase().includes('pos')) || (chart.yKeys?.length === 1 && chart.yKeys[0].toLowerCase().includes('pos'));
        const isPureNeg = (!chart.yKeys && chart.yKey?.toLowerCase().includes('neg')) || (chart.yKeys?.length === 1 && chart.yKeys[0].toLowerCase().includes('neg'));
        const horizGradient = isPurePos ? `url(#posH_${gid})` : isPureNeg ? `url(#negH_${gid})` : undefined;
        const vertGradient  = isPurePos ? `url(#posV_${gid})` : isPureNeg ? `url(#negV_${gid})` : undefined;
        const hasLikert = chart.yKey?.startsWith('likert_') || chart.yKeys?.some(k => k.startsWith('likert_'));
        const hasBinary = !hasLikert && (chart.yKey?.startsWith('binary_') || chart.yKeys?.some(k => k.startsWith('binary_')));
        const isMulti = (chart.yKeys?.length || 0) > 1;
        const chartHeight =
            chart.type === 'HORIZONTAL_BAR' ? Math.max(260, data.length * 50 + 60) :
            chart.type === 'PIE'            ? 300 :
            chart.type === 'SCATTER'        ? 340 :
            Math.max(280, Math.min(420, data.length * 28 + 100));
        const yAxisWidth = Math.min(Math.max(...data.map((d: any) => (d.name || '').length), 4) * 7, 160);

        const sharedDefs = (
            <defs>
                <linearGradient id={`posV_${gid}`} x1="0" y1="1" x2="0" y2="0"><stop offset="0%" stopColor="#86efac" stopOpacity={0.9} /><stop offset="100%" stopColor="#16a34a" stopOpacity={0.9} /></linearGradient>
                <linearGradient id={`negV_${gid}`} x1="0" y1="1" x2="0" y2="0"><stop offset="0%" stopColor="#fecdd3" stopOpacity={0.9} /><stop offset="100%" stopColor="#e11d48" stopOpacity={0.9} /></linearGradient>
                <linearGradient id={`posH_${gid}`} x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#86efac" stopOpacity={0.9} /><stop offset="100%" stopColor="#16a34a" stopOpacity={0.9} /></linearGradient>
                <linearGradient id={`negH_${gid}`} x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#fecdd3" stopOpacity={0.9} /><stop offset="100%" stopColor="#e11d48" stopOpacity={0.9} /></linearGradient>
            </defs>
        );

        return (
            <div style={{ height: chartHeight }}>
                <ResponsiveContainer width="100%" height="100%">
                    {chart.type === "PIE" ? (
                        <PieChart>
                            {sharedDefs}
                            <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="42%" innerRadius={55} outerRadius={88} paddingAngle={2}
                                label={({ percent }: any) => `${(percent * 100).toFixed(0)}%`} labelLine={{ stroke: '#cbd5e1', strokeWidth: 1 }}>
                                {data.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                            </Pie>
                            <Tooltip formatter={(v: any, name: any) => [typeof v === 'number' ? v.toFixed(2) : v, formatKey(name ?? '')]} />
                            <Legend formatter={(v: any) => formatKey(v ?? '')} wrapperStyle={{ fontSize: '10px', paddingTop: '6px' }} />
                        </PieChart>
                    ) : chart.type === "SCATTER" ? (
                        <ScatterChart margin={{ top: 16, right: 32, bottom: 36, left: 16 }}>
                            {sharedDefs}
                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                            <XAxis type="number" dataKey="x" name={formatKey(chart.xKey)} tick={{ fontSize: 10 }} axisLine={false} tickLine={false}
                                label={{ value: formatKey(chart.xKey), position: 'insideBottom', offset: -16, fontSize: 10, fill: '#94a3b8' }} />
                            <YAxis type="number" dataKey="y" name={formatKey(chart.yKey || '')} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={38}
                                label={{ value: formatKey(chart.yKey || ''), angle: -90, position: 'insideLeft', offset: 12, fontSize: 10, fill: '#94a3b8' }} />
                            <Tooltip cursor={{ strokeDasharray: '3 3' }} content={({ active, payload }: any) => {
                                if (!active || !payload?.length) return null;
                                const d = payload[0]?.payload;
                                return (
                                    <div className="bg-white dark:bg-slate-800 p-2.5 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl text-xs">
                                        <p className="font-bold mb-1">{d?.fullName || d?.name}</p>
                                        <p className="text-slate-500">{formatKey(chart.xKey)}: <span className="font-semibold">{d?.x}</span></p>
                                        <p className="text-slate-500">{formatKey(chart.yKey || '')}: <span className="font-semibold">{d?.y}</span></p>
                                    </div>
                                );
                            }} />
                            <Scatter data={data} fill="#8b5cf6"><LabelList dataKey="name" position="top" style={{ fontSize: '9px', fill: '#64748b' }} /></Scatter>
                        </ScatterChart>
                    ) : chart.type === "HORIZONTAL_BAR" ? (
                        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 48, top: 4, bottom: 4 }} barCategoryGap="18%" barGap={2}>
                            {sharedDefs}
                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                            <XAxis type="number" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} domain={hasLikert ? [0, 4] : hasBinary ? [0, 1] : [0, 'auto']} />
                            <YAxis dataKey="name" type="category" width={yAxisWidth} tick={{ fontSize: 10, fill: '#475569' }} axisLine={false} tickLine={false} />
                            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(99,102,241,0.04)' }} />
                            {isMulti && <Legend formatter={formatKey} wrapperStyle={{ fontSize: '10px', paddingTop: '8px' }} />}
                            {hasLikert && <ReferenceLine x={3} stroke="#cbd5e1" strokeDasharray="4 2" label={{ value: '3.0', fill: '#94a3b8', fontSize: 9, position: 'insideTopRight' }} />}
                            {chart.yKeys?.length ? chart.yKeys.map((k, i) => (
                                <Bar key={k} dataKey={k} name={chart.yLabelMap?.[k] || k} fill={COLORS[i % COLORS.length]} radius={[0, 4, 4, 0]}
                                    onMouseEnter={() => setHoveredSeries(k)} onMouseLeave={() => setHoveredSeries(null)} />
                            )) : (
                                <Bar dataKey="value" fill={horizGradient || "#8b5cf6"} radius={[0, 4, 4, 0]}
                                    onMouseEnter={() => setHoveredSeries("value")} onMouseLeave={() => setHoveredSeries(null)}>
                                    {data.map((_: any, i: number) => <Cell key={i} fill={horizGradient || COLORS[i % COLORS.length]} />)}
                                    <LabelList dataKey="value" position="right" formatter={(v: any) => typeof v === 'number' ? v.toFixed(2) : v} style={{ fontSize: '9px', fill: '#64748b' }} />
                                </Bar>
                            )}
                        </BarChart>
                    ) : chart.type === "LINE" ? (
                        <LineChart data={data} margin={{ bottom: 60, top: 12, left: 0, right: 12 }}>
                            {sharedDefs}
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                            <XAxis dataKey="name" tick={<RotatedTick />} height={60} interval={0} axisLine={false} tickLine={false} />
                            <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={36} domain={hasLikert ? [0, 4] : hasBinary ? [0, 1] : [0, 'auto']} />
                            <Tooltip content={<CustomTooltip />} />
                            {isMulti && <Legend formatter={formatKey} wrapperStyle={{ fontSize: '10px' }} />}
                            {hasLikert && <ReferenceLine y={3} stroke="#cbd5e1" strokeDasharray="4 2" label={{ value: '3.0', fill: '#94a3b8', fontSize: 9, position: 'insideTopRight' }} />}
                            {chart.yKeys?.length ? chart.yKeys.map((k, i) => (
                                <Line key={k} type="monotone" dataKey={k} name={chart.yLabelMap?.[k] || k} stroke={COLORS[i % COLORS.length]} strokeWidth={2.5} dot={{ r: 3.5 }} activeDot={{ r: 5.5 }}
                                    onMouseEnter={() => setHoveredSeries(k)} onMouseLeave={() => setHoveredSeries(null)} />
                            )) : (
                                <Line type="monotone" dataKey="value" stroke="#6366f1" strokeWidth={2.5} dot={{ r: 3.5 }} activeDot={{ r: 5.5 }}>
                                    <LabelList dataKey="value" position="top" formatter={(v: any) => typeof v === 'number' ? v.toFixed(2) : v} style={{ fontSize: '9px', fill: '#64748b' }} />
                                </Line>
                            )}
                        </LineChart>
                    ) : (
                        <BarChart data={data} margin={{ bottom: 60, top: 12, left: 0, right: 12 }} barCategoryGap="12%" barGap={2}>
                            {sharedDefs}
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                            <XAxis dataKey="name" tick={<RotatedTick />} height={60} interval={0} axisLine={false} tickLine={false} />
                            <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={36} domain={hasLikert ? [0, 4] : hasBinary ? [0, 1] : [0, 'auto']} />
                            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(0,0,0,0.025)' }} />
                            {isMulti && <Legend formatter={formatKey} wrapperStyle={{ fontSize: '10px', paddingTop: '8px' }} />}
                            {hasLikert && <ReferenceLine y={3} stroke="#cbd5e1" strokeDasharray="4 2" label={{ value: '3.0', fill: '#94a3b8', fontSize: 9, position: 'insideTopRight' }} />}
                            {chart.yKeys?.length ? chart.yKeys.map((k, i) => (
                                <Bar key={k} dataKey={k} name={chart.yLabelMap?.[k] || k} fill={COLORS[i % COLORS.length]} radius={[4, 4, 0, 0]}
                                    onMouseEnter={() => setHoveredSeries(k)} onMouseLeave={() => setHoveredSeries(null)} />
                            )) : (
                                <Bar dataKey="value" fill={vertGradient || "#6366f1"} radius={[4, 4, 0, 0]}
                                    onMouseEnter={() => setHoveredSeries("value")} onMouseLeave={() => setHoveredSeries(null)}>
                                    {data.map((_: any, i: number) => <Cell key={i} fill={vertGradient || COLORS[i % COLORS.length]} />)}
                                    <LabelList dataKey="value" position="top" formatter={(v: any) => typeof v === 'number' ? v.toFixed(2) : v} style={{ fontSize: '9px', fill: '#64748b' }} />
                                </Bar>
                            )}
                        </BarChart>
                    )}
                </ResponsiveContainer>
            </div>
        );
    };

    const currentPage = savedCharts.slice(page * CHARTS_PER_PAGE, (page + 1) * CHARTS_PER_PAGE);

    if (loading) return (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-64 bg-slate-100 dark:bg-slate-800 animate-pulse rounded-xl" />
            ))}
        </div>
    );

    if (savedCharts.length === 0) return (
        <div className="text-center py-24 bg-slate-50 dark:bg-slate-900 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700">
            <BarChart2 className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-slate-600 dark:text-slate-300">No Saved Charts Yet</h3>
            <p className="text-sm text-slate-400 max-w-xs mx-auto mt-2 leading-relaxed">
                Use the AI Analyst tab to generate visualizations, then save them here for quick reference.
            </p>
        </div>
    );

    return (
        <div className="space-y-5">
            <div className="flex items-center justify-between px-1">
                <p className="text-xs text-slate-500 font-medium tabular-nums">
                    Showing {page * CHARTS_PER_PAGE + 1}–{Math.min((page + 1) * CHARTS_PER_PAGE, savedCharts.length)} of {savedCharts.length} charts
                </p>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                {currentPage.map((chart) => {
                    const chartData = prepareChartData(chart.config);
                    const dataKeys = chartData.length > 0
                        ? Object.keys(chartData[0]).filter(k => !['name', 'fullName', '_hasRealData', 'x', 'y'].includes(k))
                        : [];
                    const isDataOpen = showDataForChart === chart.id;
                    return (
                        <Card key={chart.id} className="border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden bg-white dark:bg-slate-900 flex flex-col">
                            <CardHeader className="bg-gradient-to-r from-slate-50 to-purple-50/30 dark:from-slate-900 dark:to-purple-950/10 border-b border-slate-100 dark:border-slate-800 py-3 px-4">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <Badge variant="outline" className={`shrink-0 text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 ${CHART_TYPE_STYLE[chart.config.type] || ''}`}>
                                            {chart.config.type.replace('_', ' ')}
                                        </Badge>
                                        <CardTitle className="text-sm font-bold text-slate-800 dark:text-slate-100 leading-snug truncate">
                                            {chart.config.title}
                                        </CardTitle>
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-slate-400 hover:text-slate-700 hover:bg-slate-100" title="View data"
                                            onClick={() => setShowDataForChart(isDataOpen ? null : chart.id)}>
                                            <Database className="w-3.5 h-3.5" />
                                        </Button>
                                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-slate-400 hover:text-blue-600 hover:bg-blue-50" title="Duplicate"
                                            onClick={() => duplicateChart(chart)}>
                                            <Copy className="w-3.5 h-3.5" />
                                        </Button>
                                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-slate-400 hover:text-red-500 hover:bg-red-50" title="Delete"
                                            onClick={() => deleteChart(chart.id)}>
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </Button>
                                    </div>
                                </div>
                            </CardHeader>

                            <CardContent className="px-4 pt-4 pb-2">
                                {renderChart(chart.config)}
                            </CardContent>

                            {isDataOpen && chartData.length > 0 && (
                                <div className="mx-4 mb-3 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                                    <div className="overflow-x-auto max-h-48 overflow-y-auto">
                                        <table className="w-full text-xs">
                                            <thead className="bg-slate-50 dark:bg-slate-800 sticky top-0">
                                                <tr>
                                                    <th className="text-left px-3 py-2 font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap">Unit</th>
                                                    {dataKeys.map(k => (
                                                        <th key={k} className="text-right px-3 py-2 font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap">{formatKey(k)}</th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                                {chartData.map((row: any, i: number) => (
                                                    <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                                                        <td className="px-3 py-1.5 text-slate-700 dark:text-slate-300 font-medium whitespace-nowrap">{row.fullName || row.name}</td>
                                                        {dataKeys.map(k => (
                                                            <td key={k} className="px-3 py-1.5 text-right tabular-nums text-slate-600 dark:text-slate-400">
                                                                {typeof row[k] === 'number' ? row[k].toFixed(2) : (row[k] ?? '—')}
                                                            </td>
                                                        ))}
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            <div className="border-t border-slate-100 dark:border-slate-800 bg-gradient-to-r from-purple-50/40 to-indigo-50/20 dark:from-purple-950/10 dark:to-indigo-950/10 px-4 py-3 flex items-start gap-3 mt-auto">
                                <Sparkles className="w-4 h-4 text-purple-500 shrink-0 mt-0.5" />
                                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed flex-1 line-clamp-2">
                                    {chart.config.description}
                                </p>
                                <div className="flex items-center gap-1.5 shrink-0">
                                    {chart.config.fullExplanation && (
                                        <Dialog>
                                            <DialogTrigger asChild>
                                                <Button size="sm" variant="outline" className="h-7 text-xs border-indigo-200 text-indigo-600 hover:bg-indigo-50 dark:border-indigo-800 dark:text-indigo-400 gap-1">
                                                    <MessageSquare className="w-3 h-3" /> Explain
                                                </Button>
                                            </DialogTrigger>
                                            <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
                                                <DialogHeader>
                                                    <DialogTitle className="flex items-center gap-2 text-indigo-700 dark:text-indigo-400">
                                                        <Sparkles className="w-5 h-5" /> {chart.config.title}
                                                    </DialogTitle>
                                                </DialogHeader>
                                                <div className="mt-4">
                                                    <BoxedMessageRenderer content={chart.config.fullExplanation} />
                                                </div>
                                            </DialogContent>
                                        </Dialog>
                                    )}
                                    {onOpenAnalyst && (
                                        <Button size="sm" variant="outline" className="h-7 text-xs border-purple-200 text-purple-600 hover:bg-purple-50 dark:border-purple-800 dark:text-purple-400 gap-1"
                                            onClick={() => onOpenAnalyst(chart.config)}>
                                            <Edit3 className="w-3 h-3" /> Discuss
                                        </Button>
                                    )}
                                </div>
                            </div>
                        </Card>
                    );
                })}
            </div>

            {savedCharts.length > CHARTS_PER_PAGE && (
                <div className="flex justify-between items-center bg-white dark:bg-slate-900 px-5 py-3 rounded-xl border border-slate-200 dark:border-slate-800">
                    <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="gap-1.5">
                        <ArrowLeft className="w-3.5 h-3.5" /> Previous
                    </Button>
                    <span className="text-xs font-medium text-slate-500 tabular-nums">
                        {page * CHARTS_PER_PAGE + 1}–{Math.min((page + 1) * CHARTS_PER_PAGE, savedCharts.length)} of {savedCharts.length}
                    </span>
                    <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={(page + 1) * CHARTS_PER_PAGE >= savedCharts.length} className="gap-1.5">
                        Next <ArrowRight className="w-3.5 h-3.5" />
                    </Button>
                </div>
            )}
        </div>
    );
}
