"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip } from "recharts";
import { Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { ErrorBoundary } from "@/components/ErrorBoundary";

export function IssuesRadar({ surveyId, maxDomain, onMaxCalculated }: { surveyId: string, maxDomain?: number, onMaxCalculated?: (max: number) => void }) {
    const [data, setData] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchRadarData = async () => {
            setLoading(true);
            try {
                const { data: aggregatedIssues, error } = await supabase.rpc('get_sentiment_aggregation', {
                    p_survey_id: surveyId === "all" ? null : parseInt(surveyId),
                    p_sentiment: 'Negative'
                });

                if (error || !aggregatedIssues || aggregatedIssues.length === 0) {
                    console.error("Failed to fetch radar aggregation:", error);
                    setData([]);
                    return;
                }

                // Format into the structure the existing downstream map expects
                const defectCounts: Record<string, number> = {};
                const uniqueCids = new Set<number>();
                const uniqueUids = new Set<number>();

                aggregatedIssues.forEach((row: any) => {
                    const cid = row.category_id;
                    const uid = row.unit_id;
                    const count = row.segment_count;

                    if (cid && uid) {
                        const key = `${cid}_${uid}`;
                        defectCounts[key] = count;
                        uniqueCids.add(cid);
                        uniqueUids.add(uid);
                    }
                });

                if (Object.keys(defectCounts).length === 0) {
                    setData([]);
                    return;
                }

                // Fetch Category Names and Unit Names in parallel
                const [catRes, unitRes] = await Promise.all([
                    supabase.from('analysis_categories').select('id, name').in('id', Array.from(uniqueCids)),
                    supabase.from('organization_units').select('id, name, short_name').in('id', Array.from(uniqueUids))
                ]);

                const catMap = new Map(catRes.data?.map(c => [c.id, c.name]));
                const unitMap = new Map(unitRes.data?.map(u => [u.id, u]));

                // Format for Recharts
                const radarData = Object.entries(defectCounts).map(([key, count]) => {
                    const [cid, uid] = key.split('_').map(Number);
                    const catName = catMap.get(cid) || "Other";
                    const unitObj = unitMap.get(uid);

                    const unitName = unitObj?.name || "Unknown Unit";
                    const unitShortName = unitObj?.short_name || unitName;

                    return {
                        subject: `${unitShortName} - ${catName}`,
                        fullSubject: `${unitName} - ${catName}`,
                        value: count as number,
                        fullMark: Math.max(...Object.values(defectCounts)) + 5
                    };
                });

                const topIssues = radarData.sort((a, b) => b.value - a.value).slice(0, 6);

                if (onMaxCalculated) {
                    const localMax = Math.max(...radarData.map(d => d.value), 0);
                    onMaxCalculated(localMax);
                }

                setData(topIssues);

            } catch (err) {
                console.error("Failed to fetch radar data", err);
            } finally {
                setLoading(false);
            }
        };

        fetchRadarData();
    }, [surveyId]);

    return (
        <Card className="border-slate-200 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-900 h-full border-t-4 border-t-red-500">
            <CardHeader className="pb-0">
                <CardTitle className="text-slate-800 dark:text-slate-100 text-base">The Issues Radar</CardTitle>
                <CardDescription className="dark:text-slate-400 text-xs">Top sources of negative feedback.</CardDescription>
            </CardHeader>
            <CardContent className="pt-4 h-[400px]">
                {loading ? (
                    <div className="w-full h-full flex items-center justify-center">
                        <Loader2 className="w-8 h-8 animate-spin text-slate-300 dark:text-slate-700" />
                    </div>
                ) : data.length < 3 ? (
                    <div className="w-full h-full flex items-center justify-center text-slate-400 italic text-sm text-center px-4">
                        Not enough negative data distinctively categorized to draw a radar map.
                    </div>
                ) : (
                    <ErrorBoundary fallbackTitle="Error drawing negative radar chart">
                        <ResponsiveContainer width="100%" height="100%">
                            <RadarChart cx="50%" cy="50%" outerRadius="75%" data={data}>
                                <PolarGrid stroke="#e2e8f0" className="dark:stroke-slate-700" />
                                <PolarAngleAxis
                                    dataKey="subject"
                                    tick={(props: any) => {
                                        const { payload, x, y, textAnchor } = props;
                                        const parts = payload.value.split(' - ');
                                        const displayUnit = parts[0];
                                        const displayCategory = parts.length > 1 ? parts.slice(1).join(' - ') : '';

                                        // Calculate a dynamic Y offset based on whether the label is at the top or bottom of the chart
                                        // to make sure it doesn't overlap the radar path
                                        const cy = "50%"; // radar chart center, though passed as numbers usually. y < 200 = top half
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
                                <Radar name="Negative Comments" dataKey="value" stroke="#ef4444" fill="#ef4444" fillOpacity={0.4} />
                            </RadarChart>
                        </ResponsiveContainer>
                    </ErrorBoundary>
                )}
            </CardContent>
        </Card>
    );
}
