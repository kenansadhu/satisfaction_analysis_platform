import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const surveyId = searchParams.get("surveyId");

        // 1. Fetch all organization units (we still need this to ensure units with 0 stats are returned)
        const { data: orgUnits, error: orgError } = await supabase
            .from('organization_units')
            .select('id, name');

        if (orgError || !orgUnits) {
            console.error("Failed to fetch units:", orgError);
            return NextResponse.json({ error: "Failed to fetch top-level units" }, { status: 500 });
        }

        // 2. Fetch all aggregated data in a single RPC round-trip
        const { data: rawStats, error: rpcError } = await supabase.rpc('get_all_executive_metrics', {
            p_survey_id: surveyId ? parseInt(surveyId) : null
        });

        if (rpcError) {
            console.error("RPC Error:", rpcError);
            return NextResponse.json({ error: "Failed to fetch aggregated metrics" }, { status: 500 });
        }

        // 3. Merge raw units with the aggregated data and calculate final score
        const stats = orgUnits.map(unit => {
            const unitStats = rawStats?.find((r: any) => r.unit_id === unit.id);

            if (unitStats) {
                const total = unitStats.total_segments || 0;
                const positive = unitStats.positive || 0;
                const neutral = unitStats.neutral || 0;
                const negative = unitStats.negative || 0;

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

            // Fallback for units with no data
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

        return NextResponse.json({ stats });

    } catch (e: any) {
        console.error("Server Error in /api/executive/metrics:", e);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
