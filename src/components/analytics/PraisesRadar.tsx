"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip } from "recharts";
import { Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";

export function PraisesRadar({ surveyId, maxDomain, onMaxCalculated }: { surveyId: string, maxDomain?: number, onMaxCalculated?: (max: number) => void }) {
    const [data, setData] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchRadarData = async () => {
            setLoading(true);
            try {
                // Fetch all positive feedback segments for the selected survey
                let query = supabase
                    .from('feedback_segments')
                    .select('category_id, raw_feedback_inputs!inner(target_unit_id, respondents!inner(survey_id))')
                    .eq('sentiment', 'Positive');

                if (surveyId !== "all") {
                    query = query.eq('raw_feedback_inputs.respondents.survey_id', parseInt(surveyId));
                }

                const { data: positives } = await query;

                if (!positives || positives.length === 0) {
                    setData([]);
                    return;
                }

                // Group by a combined key: "categoryId_unitId"
                const triumphCounts: Record<string, number> = {};
                const uniqueCids = new Set<number>();
                const uniqueUids = new Set<number>();

                positives.forEach(p => {
                    const cid = p.category_id;
                    // Safely extract target_unit_id from the join
                    const rawInput: any = p.raw_feedback_inputs;
                    const uid = Array.isArray(rawInput) ? rawInput[0]?.target_unit_id : rawInput?.target_unit_id;

                    if (cid && uid) {
                        const key = `${cid}_${uid}`;
                        triumphCounts[key] = (triumphCounts[key] || 0) + 1;
                        uniqueCids.add(cid);
                        uniqueUids.add(uid);
                    }
                });

                if (Object.keys(triumphCounts).length === 0) {
                    setData([]);
                    return;
                }

                // Fetch Category Names and Unit Names in parallel
                const [catRes, unitRes] = await Promise.all([
                    supabase.from('analysis_categories').select('id, name').in('id', Array.from(uniqueCids)),
                    supabase.from('organization_units').select('id, name').in('id', Array.from(uniqueUids))
                ]);

                const catMap = new Map(catRes.data?.map(c => [c.id, c.name]));
                const unitMap = new Map(unitRes.data?.map(u => [u.id, u.name]));

                // Format for Recharts, filtering out "General Positive Feedback"
                const radarData = Object.entries(triumphCounts)
                    .map(([key, count]) => {
                        const [cid, uid] = key.split('_').map(Number);
                        const catName = catMap.get(cid) || "Other";
                        const unitName = unitMap.get(uid) || "Unknown Unit";

                        return {
                            subject: `${unitName} - ${catName}`,
                            catName: catName, // For filtering
                            value: count as number,
                            fullMark: Math.max(...Object.values(triumphCounts)) + 5
                        };
                    })
                    .filter(item => {
                        const searchName = item.catName.toLowerCase();
                        return !searchName.startsWith("general") && !searchName.includes("other");
                    });

                const topPraises = radarData.sort((a, b) => b.value - a.value).slice(0, 6);

                if (onMaxCalculated) {
                    const localMax = Math.max(...radarData.map(d => d.value), 0);
                    onMaxCalculated(localMax);
                }

                setData(topPraises);

            } catch (err) {
                console.error("Failed to fetch radar data", err);
            } finally {
                setLoading(false);
            }
        };

        fetchRadarData();
    }, [surveyId]);

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
                            />
                            <Radar name="Positive Comments" dataKey="value" stroke="#22c55e" fill="#22c55e" fillOpacity={0.4} />
                        </RadarChart>
                    </ResponsiveContainer>
                )}
            </CardContent>
        </Card>
    );
}
