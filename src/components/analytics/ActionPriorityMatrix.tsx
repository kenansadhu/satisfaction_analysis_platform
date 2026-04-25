"use client";

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
    ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, ReferenceLine, Cell,
} from "recharts";
import { AlertTriangle, TrendingUp } from "lucide-react";

interface UnitPerformance {
    id: number;
    name: string;
    total: number;
    positive: number;
    neutral: number;
    negative: number;
    score: number;
}

function dotColor(score: number) {
    if (score >= 70) return "#10b981";
    if (score >= 40) return "#f59e0b";
    return "#ef4444";
}

const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const d = payload[0]?.payload;
    if (!d) return null;
    return (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3 shadow-lg text-sm max-w-[200px]">
            <p className="font-bold text-slate-800 dark:text-slate-100 mb-1.5 leading-snug">{d.name}</p>
            <div className="space-y-0.5 text-xs">
                <p className="text-slate-500">Volume: <span className="font-semibold text-slate-700 dark:text-slate-300">{d.total.toLocaleString()}</span></p>
                <p className="text-red-500">Negative: <span className="font-semibold">{d.negPct.toFixed(1)}%</span></p>
                <p className="text-slate-500">Score: <span className="font-semibold">{d.score}/100</span></p>
            </div>
        </div>
    );
};

const CustomShape = (props: any) => {
    const { cx, cy, payload } = props;
    if (!cx || !cy) return null;
    const color = dotColor(payload.score);
    return (
        <circle cx={cx} cy={cy} r={6} fill={color} fillOpacity={0.85} stroke="white" strokeWidth={1.5} />
    );
};

export function ActionPriorityMatrix({ units }: { units: UnitPerformance[] }) {
    const data = useMemo(() =>
        units
            .filter(u => u.total > 0)
            .map(u => ({
                ...u,
                negPct: parseFloat(((u.negative / u.total) * 100).toFixed(1)),
            })),
        [units]
    );

    const medianNeg = useMemo(() => {
        if (!data.length) return 30;
        const sorted = [...data].sort((a, b) => a.negPct - b.negPct);
        return sorted[Math.floor(sorted.length / 2)].negPct;
    }, [data]);

    const medianVol = useMemo(() => {
        if (!data.length) return 0;
        const sorted = [...data].sort((a, b) => a.total - b.total);
        return sorted[Math.floor(sorted.length / 2)].total;
    }, [data]);

    const urgentUnits = useMemo(() =>
        data.filter(u => u.negPct >= medianNeg && u.total >= medianVol)
            .sort((a, b) => b.negPct - a.negPct),
        [data, medianNeg, medianVol]
    );

    if (data.length === 0) return null;

    return (
        <Card className="border-slate-200 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-900">
            <CardHeader className="pb-3 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <CardTitle className="text-slate-800 dark:text-slate-100 flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4 text-amber-500" />
                            Action Priority Matrix
                        </CardTitle>
                        <CardDescription className="mt-1">
                            Units in the top-right need immediate attention — high feedback volume combined with high negativity.
                            Dashed lines mark the median of each axis.
                        </CardDescription>
                    </div>
                    {urgentUnits.length > 0 && (
                        <div className="shrink-0 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-xl px-4 py-2 text-center">
                            <p className="text-2xl font-black text-red-600 dark:text-red-400 leading-none">{urgentUnits.length}</p>
                            <p className="text-xs text-red-500 dark:text-red-400 mt-0.5">urgent</p>
                        </div>
                    )}
                </div>
            </CardHeader>
            <CardContent className="pt-5">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                    {/* Scatter chart */}
                    <div className="lg:col-span-2 h-80">
                        <ResponsiveContainer width="100%" height="100%">
                            <ScatterChart margin={{ top: 10, right: 20, left: 0, bottom: 28 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                <XAxis
                                    dataKey="negPct"
                                    type="number"
                                    name="Negative %"
                                    unit="%"
                                    domain={[0, 'auto']}
                                    tick={{ fontSize: 11, fill: "#94a3b8" }}
                                    label={{ value: "← Low negativity    High negativity →", position: "insideBottom", offset: -16, fontSize: 10, fill: "#94a3b8" }}
                                />
                                <YAxis
                                    dataKey="total"
                                    type="number"
                                    name="Volume"
                                    tick={{ fontSize: 11, fill: "#94a3b8" }}
                                    tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v}
                                    label={{ value: "Volume", angle: -90, position: "insideLeft", offset: 12, fontSize: 10, fill: "#94a3b8" }}
                                />
                                <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: '3 3' }} />
                                <ReferenceLine x={medianNeg} stroke="#f59e0b" strokeDasharray="5 4" strokeWidth={1.5}
                                    label={{ value: 'median', position: 'top', fontSize: 9, fill: '#f59e0b' }} />
                                <ReferenceLine y={medianVol} stroke="#f59e0b" strokeDasharray="5 4" strokeWidth={1.5}
                                    label={{ value: 'median', position: 'right', fontSize: 9, fill: '#f59e0b' }} />
                                <Scatter data={data} shape={<CustomShape />}>
                                    {data.map((_, i) => <Cell key={i} />)}
                                </Scatter>
                            </ScatterChart>
                        </ResponsiveContainer>
                    </div>

                    {/* Right panel */}
                    <div className="space-y-4">
                        {/* Quadrant legend */}
                        <div className="grid grid-cols-2 gap-1.5 text-xs">
                            {[
                                { label: "Celebrate & Maintain", color: "bg-emerald-100 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800", text: "text-emerald-700 dark:text-emerald-400", desc: "High vol · Low neg" },
                                { label: "Urgent Action", color: "bg-red-100 dark:bg-red-950/30 border-red-200 dark:border-red-800", text: "text-red-700 dark:text-red-400", desc: "High vol · High neg" },
                                { label: "Low Priority", color: "bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700", text: "text-slate-500", desc: "Low vol · Low neg" },
                                { label: "Monitor", color: "bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800", text: "text-amber-700 dark:text-amber-400", desc: "Low vol · High neg" },
                            ].map(q => (
                                <div key={q.label} className={`rounded-lg border p-2 ${q.color}`}>
                                    <p className={`font-semibold leading-tight ${q.text}`}>{q.label}</p>
                                    <p className="text-slate-400 dark:text-slate-500 text-[10px] mt-0.5">{q.desc}</p>
                                </div>
                            ))}
                        </div>

                        {/* Urgent list */}
                        <div>
                            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Needs Action Now</p>
                            {urgentUnits.length === 0 ? (
                                <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 text-sm py-2">
                                    <TrendingUp className="w-4 h-4 shrink-0" />
                                    No units in urgent quadrant
                                </div>
                            ) : (
                                <div className="space-y-1.5">
                                    {urgentUnits.map((u, i) => (
                                        <div key={u.id} className="flex items-center justify-between p-2.5 bg-red-50 dark:bg-red-950/20 rounded-xl border border-red-100 dark:border-red-900/40">
                                            <div className="flex items-center gap-2 min-w-0">
                                                <span className="w-5 h-5 rounded-full bg-red-200 dark:bg-red-800 text-red-700 dark:text-red-300 text-[10px] font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                                                <span className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate">{u.name}</span>
                                            </div>
                                            <span className="text-xs font-bold text-red-600 dark:text-red-400 shrink-0 ml-2">{u.negPct.toFixed(0)}%</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Color legend */}
                        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-1 text-[11px] text-slate-400">
                            <p className="font-semibold text-slate-500 dark:text-slate-400 mb-1">Dot color = sentiment score</p>
                            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />≥ 70 — Good</span>
                            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0" />40–69 — Moderate</span>
                            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-500 shrink-0" />&lt; 40 — Critical</span>
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
