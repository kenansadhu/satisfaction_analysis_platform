"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/layout/PageShell"; // Helper header
import { MetricCard } from "@/components/analytics/ExecutiveStats";
import { SentimentHeatmap, LeaderBoard } from "@/components/analytics/SentimentHeatmap";
import { Users, MessageSquareQuote, AlertTriangle, Activity } from "lucide-react";

type UnitPerformance = {
    id: number;
    name: string;
    total: number;
    positive: number;
    neutral: number;
    negative: number;
    score: number;
};

export default function ExecutiveDashboard() {
    const [units, setUnits] = useState<UnitPerformance[]>([]);
    const [loading, setLoading] = useState(true);
    const [overallScore, setOverallScore] = useState(0);
    const [totalComments, setTotalComments] = useState(0);
    const [criticalIssues, setCriticalIssues] = useState(0);

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);

            // 1. Get All Units
            const { data: orgUnits } = await supabase.from('organization_units').select('id, name');
            if (!orgUnits) { setLoading(false); return; }

            // 2. Aggregate Stats per Unit (Optimized)
            const stats: UnitPerformance[] = [];
            let globalTotal = 0;
            let globalScoreSum = 0;
            let globalCritical = 0;

            // Note: In a real production app with millions of rows, we'd use a Materialized View.
            // prioritizing correctness over speed for now.
            const { data: allSegments } = await supabase
                .from('feedback_segments')
                .select('sentiment, is_suggestion, raw_feedback_inputs!inner(target_unit_id)');

            if (allSegments) {
                orgUnits.forEach(u => {
                    const unitSegments = allSegments.filter((s: any) => s.raw_feedback_inputs.target_unit_id === u.id);
                    const total = unitSegments.length;

                    if (total > 0) {
                        const positive = unitSegments.filter((s: any) => s.sentiment === "Positive").length;
                        const neutral = unitSegments.filter((s: any) => s.sentiment === "Neutral").length;
                        const negative = unitSegments.filter((s: any) => s.sentiment === "Negative").length;

                        // Weighted Score: (Pos * 100 + Neu * 50) / Total
                        const score = Math.round(((positive * 100) + (neutral * 50)) / total);

                        stats.push({
                            id: u.id,
                            name: u.name,
                            total,
                            positive,
                            neutral,
                            negative,
                            score
                        });

                        globalTotal += total;
                        globalScoreSum += (score * total); // Weighted sum
                        globalCritical += unitSegments.filter((s: any) => s.sentiment === "Negative").length; // Definition of critical
                    } else {
                        stats.push({ id: u.id, name: u.name, total: 0, positive: 0, neutral: 0, negative: 0, score: 0 });
                    }
                });
            }

            setUnits(stats);
            setTotalComments(globalTotal);
            setOverallScore(globalTotal > 0 ? Math.round(globalScoreSum / globalTotal) : 0);
            setCriticalIssues(globalCritical);
            setLoading(false);
        };

        fetchData();
    }, []);

    return (
        <div className="min-h-full bg-slate-50 pb-20">
            <PageHeader
                title="Executive Overview"
                description="High-level performance metrics across the institution."
            />

            <div className="max-w-7xl mx-auto px-8 py-8 space-y-8">

                {/* 1. KEY METRICS ROW */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <MetricCard
                        title="Overall Sentiment Score"
                        value={overallScore}
                        description={overallScore >= 70 ? "Healthy Institution" : overallScore >= 50 ? "Needs Attention" : "Critical Condition"}
                        trend={overallScore >= 70 ? "up" : overallScore >= 50 ? "flat" : "down"}
                        trendValue="Global Avg"
                        icon={Activity}
                        colorClass="text-blue-600 bg-blue-100"
                    />
                    <MetricCard
                        title="Total Feedback Volume"
                        value={totalComments.toLocaleString()}
                        description="Analyzed comments"
                        icon={MessageSquareQuote}
                        colorClass="text-purple-600 bg-purple-100"
                    />
                    <MetricCard
                        title="Issues Detected"
                        value={criticalIssues.toLocaleString()}
                        description="Negative sentiments"
                        trend="down"
                        trendValue="Action Req."
                        icon={AlertTriangle}
                        colorClass="text-red-600 bg-red-100"
                    />
                    <MetricCard
                        title="Active Units"
                        value={units.filter(u => u.total > 0).length}
                        description={`out of ${units.length} total units`}
                        icon={Users}
                        colorClass="text-indigo-600 bg-indigo-100"
                    />
                </div>

                {/* 2. LEADERBOARDS & HEATMAP */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Left Col: Leaderboards */}
                    <div className="space-y-6">
                        <LeaderBoard title="🏆 Top Performing Units" units={units} type="top" />
                        <LeaderBoard title="⚠️ Units Needing Attention" units={units} type="bottom" />
                    </div>

                    {/* Right Col: Heatmap (Span 2) */}
                    <div className="lg:col-span-2">
                        {loading ? (
                            <div className="h-96 w-full bg-slate-100 rounded-xl animate-pulse" />
                        ) : (
                            <SentimentHeatmap units={units} />
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
