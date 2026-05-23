"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip } from "recharts";
import { Loader2 } from "lucide-react";
import { ErrorBoundary } from "@/components/ErrorBoundary";

export function PraisesRadar({ surveyId, maxDomain, onMaxCalculated, excludeUnitIds }: { surveyId: string, maxDomain?: number, onMaxCalculated?: (max: number) => void, excludeUnitIds?: number[] }) {
    const [data, setData] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchRadarData = async () => {
            setLoading(true);
            try {
                const res = await fetch(`/api/analytics/radar-aggregation?surveyId=${surveyId}&sentiment=Positive`);
                const json = await res.json();

                if (!res.ok) {
                    console.error("Failed to fetch radar aggregation:", json.error);
                    setData([]);
                    return;
                }

                const excludeSet = new Set(excludeUnitIds || []);
                const rows: any[] = (json.rows || []).filter((r: any) => !excludeSet.has(r.unit_id));
                if (rows.length === 0) { setData([]); return; }

                const maxCount = Math.max(...rows.map((r: any) => r.segment_count));
                const radarData = rows
                    .filter((r: any) => {
                        const name = r.category_name.toLowerCase();
                        return !name.startsWith("general") && !name.includes("other");
                    })
                    .map((r: any) => ({
                        subject: `${r.unit_short_name} - ${r.category_name}`,
                        fullSubject: `${r.unit_name} - ${r.category_name}`,
                        value: r.segment_count,
                        fullMark: maxCount + 5,
                    }));

                const topPraises = radarData.sort((a: any, b: any) => b.value - a.value).slice(0, 6);

                if (onMaxCalculated) {
                    onMaxCalculated(Math.max(...radarData.map((d: any) => d.value), 0));
                }

                setData(topPraises);
            } catch (err) {
                console.error("Failed to fetch radar data", err);
            } finally {
                setLoading(false);
            }
        };

        fetchRadarData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [surveyId, JSON.stringify(excludeUnitIds)]);

    return (
        <Card className="border-slate-200 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-900 h-full border-t-4 border-t-green-500">
            <CardHeader className="pb-0">
                <CardTitle className="text-slate-800 dark:text-slate-100 text-base">The Praises Radar (Strengths)</CardTitle>
                <CardDescription className="dark:text-slate-400 text-xs">Top sources of positive feedback.</CardDescription>
            </CardHeader>
            <CardContent className="pt-4 h-[400px]">
                {loading ? (
                    <div className="w-full h-full flex items-center justify-center">
                        <Loader2 className="w-8 h-8 animate-spin text-slate-300 dark:text-slate-700" />
                    </div>
                ) : data.length < 3 ? (
                    <div className="w-full h-full flex items-center justify-center text-slate-400 italic text-sm text-center px-4">
                        Not enough positive data distinctively categorized to draw a radar map.
                    </div>
                ) : (
                    <ErrorBoundary fallbackTitle="Error drawing positive radar chart">
                        <ResponsiveContainer width="100%" height="100%">
                            <RadarChart cx="50%" cy="50%" outerRadius="60%" data={data}>
                                <PolarGrid stroke="#e2e8f0" className="dark:stroke-slate-700" />
                                <PolarAngleAxis
                                    dataKey="subject"
                                    tick={(props: any) => {
                                        const { payload, x, y, textAnchor } = props;
                                        const parts = payload.value.split(' - ');
                                        const displayUnit = parts[0];
                                        const displayCategory = parts.length > 1 ? parts.slice(1).join(' - ') : '';

                                        const cy = "50%";
                                        const dyOffset = y < 200 ? -10 : 15;

                                        return (
                                            <g transform={`translate(${x},${y})`}>
                                                <text x={0} y={0} dy={dyOffset} textAnchor={textAnchor} fill="#64748b" className="text-[11px]">
                                                    <tspan x={0} dy={0} fontWeight="600" className="fill-slate-800 dark:fill-slate-200">{displayUnit}</tspan>
                                                    {displayCategory && <tspan x={0} dy={16}>{displayCategory}</tspan>}
                                                </text>
                                            </g>
                                        );
                                    }}
                                />
                                <PolarRadiusAxis angle={30} domain={[0, maxDomain || 'dataMax'] as any} tick={false} axisLine={false} />
                                <Tooltip
                                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)' }}
                                    formatter={(value: any, name: any, props: any) => [value, props?.payload?.fullSubject || name]}
                                />
                                <Radar name="Positive Comments" dataKey="value" stroke="#22c55e" fill="#22c55e" fillOpacity={0.4} />
                            </RadarChart>
                        </ResponsiveContainer>
                    </ErrorBoundary>
                )}
            </CardContent>
        </Card>
    );
}
