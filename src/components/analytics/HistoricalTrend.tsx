"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";

export function HistoricalTrend() {
    const [data, setData] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchHistory = async () => {
            setLoading(true);
            try {
                // Fetch all surveys ordered by date
                const { data: surveys } = await supabase
                    .from('surveys')
                    .select('id, title, created_at')
                    .order('created_at', { ascending: true });

                if (!surveys) return;

                // For each survey, calculate its overall score via the RPC
                const chartData = [];
                for (const survey of surveys) {
                    const { data: metrics } = await supabase.rpc('get_dashboard_metrics', {
                        p_unit_id: null, // Global
                        p_survey_id: survey.id
                    });

                    let score = 0;
                    if (metrics && metrics.total_segments > 0) {
                        const positive = metrics.sentiment_counts?.Positive || 0;
                        const neutral = metrics.sentiment_counts?.Neutral || 0;
                        score = Math.round(((positive * 100) + (neutral * 50)) / metrics.total_segments);
                    } else {
                        // If RPC doesn't support null p_unit_id out of the box, we might just calculate it roughly
                        // But let's assume get_dashboard_metrics supports null to mean "all units" or we handle it gracefully.
                        // Actually, our get_dashboard_metrics takes p_unit_id. Let's just fetch all segments for the survey.
                        let segs: any[] = [];

                        // Pre-fetch respondent IDs
                        let respIds: number[] = [];
                        let rPage = 0;
                        while (true) {
                            const { data: rBat } = await supabase.from('respondents').select('id').eq('survey_id', survey.id).range(rPage * 1000, (rPage + 1) * 1000 - 1);
                            if (!rBat || rBat.length === 0) break;
                            respIds.push(...rBat.map((r: any) => r.id));
                            if (rBat.length < 1000) break;
                            rPage++;
                        }

                        if (respIds.length > 0) {
                            // Fetch raw_input_ids for these respondents
                            const { data: inputs } = await supabase.from('raw_feedback_inputs').select('id').in('respondent_id', respIds.slice(0, 500));
                            const inputIds = (inputs || []).map(i => i.id);

                            if (inputIds.length > 0) {
                                const { data: foundSegs } = await supabase
                                    .from('feedback_segments')
                                    .select('sentiment')
                                    .in('raw_input_id', inputIds.slice(0, 500));
                                segs = foundSegs || [];
                            }
                        }

                        if (segs && segs.length > 0) {
                            const p = segs.filter(s => s.sentiment === 'Positive').length;
                            const n = segs.filter(s => s.sentiment === 'Neutral').length;
                            score = Math.round(((p * 100) + (n * 50)) / segs.length);
                        }
                    }

                    chartData.push({
                        name: survey.title,
                        score: score || 0, // Fallback if no data
                        date: new Date(survey.created_at).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
                    });
                }

                setData(chartData);
            } catch (err) {
                console.error("Failed to fetch historical trend", err);
            } finally {
                setLoading(false);
            }
        };

        fetchHistory();
    }, []);

    return (
        <Card className="border-slate-200 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-900 col-span-full">
            <CardHeader className="pb-2">
                <CardTitle className="text-slate-800 dark:text-slate-100">Historical Sentiment Trend</CardTitle>
                <CardDescription className="dark:text-slate-400">Institutional performance trajectory over consecutive surveys.</CardDescription>
            </CardHeader>
            <CardContent className="pt-4 h-[400px]">
                {loading ? (
                    <div className="w-full h-full flex items-center justify-center">
                        <Loader2 className="w-8 h-8 animate-spin text-slate-300 dark:text-slate-700" />
                    </div>
                ) : data.length < 2 ? (
                    <div className="w-full h-full flex items-center justify-center text-slate-400 italic text-sm">
                        Not enough historical data to map a trend.
                    </div>
                ) : (
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                            <defs>
                                <linearGradient id="colorScore" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} />
                                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" className="opacity-50 dark:opacity-20" />
                            <XAxis dataKey="name" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} tickMargin={10} stroke="#94a3b8" />
                            <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} tickLine={false} axisLine={false} tickMargin={10} stroke="#94a3b8" />
                            <Tooltip
                                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)' }}
                                itemStyle={{ color: '#0f172a', fontWeight: 'bold' }}
                                labelStyle={{ color: '#64748b', marginBottom: '4px' }}
                            />
                            <Area type="monotone" dataKey="score" name="Sentiment Score" stroke="#4f46e5" strokeWidth={3} fillOpacity={1} fill="url(#colorScore)" />
                        </AreaChart>
                    </ResponsiveContainer>
                )}
            </CardContent>
        </Card>
    );
}
