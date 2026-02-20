import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const surveyId = searchParams.get("surveyId");

        // 1. Fetch all organization units
        const { data: orgUnits, error: orgError } = await supabase
            .from('organization_units')
            .select('id, name');

        if (orgError || !orgUnits) {
            console.error("Failed to fetch units:", orgError);
            return NextResponse.json({ error: "Failed to fetch top-level units" }, { status: 500 });
        }

        // 2. Compute metrics for each unit in parallel
        // We use the same highly-optimized RPC function that the ComprehensiveDashboard uses.
        const statsPromises = orgUnits.map(async (unit) => {
            const { data: metricsData } = await supabase.rpc('get_dashboard_metrics', {
                p_unit_id: unit.id,
                p_survey_id: surveyId ? parseInt(surveyId) : null
            });

            if (metricsData) {
                const total = metricsData.total_segments || 0;
                const positive = metricsData.sentiment_counts?.Positive || 0;
                const neutral = metricsData.sentiment_counts?.Neutral || 0;
                const negative = metricsData.sentiment_counts?.Negative || 0;

                // Weighted Score: (Pos * 100 + Neu * 50) / Total
                let score = 0;
                if (total > 0) {
                    score = Math.round(((positive * 100) + (neutral * 50)) / total);
                }

                return {
                    id: unit.id,
                    name: unit.name,
                    total,
                    positive,
                    neutral,
                    negative,
                    score
                };
            }

            // Fallback for errors or missing data
            return {
                id: unit.id,
                name: unit.name,
                total: 0,
                positive: 0,
                neutral: 0,
                negative: 0,
                score: 0
            };
        });

        const stats = await Promise.all(statsPromises);

        return NextResponse.json({ stats });

    } catch (e: any) {
        console.error("Server Error in /api/executive/metrics:", e);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
