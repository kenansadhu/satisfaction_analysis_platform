import { NextResponse } from "next/server";
import { supabaseServer as supabase } from "@/lib/supabase-server";
import { computeSentimentScore } from "@/lib/utils";

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

        // 2. Use the working qual RPC to get sentiment counts per unit (with retry for intermittent timeouts)
        let qualAgg: any[] | null = null;
        let qualErr: any = null;
        for (let attempt = 0; attempt < 3; attempt++) {
            const result = await supabase.rpc('get_qual_summary_by_unit', {
                p_survey_id: surveyId ? parseInt(surveyId) : null
            });
            qualAgg = result.data;
            qualErr = result.error;
            if (!qualErr) break;
            console.warn(`[metrics] qual RPC attempt ${attempt + 1} failed: ${qualErr.message}`);
            if (attempt < 2) await new Promise(r => setTimeout(r, 1000));
        }

        if (qualErr) {
            console.error("Qual RPC Error after retries:", qualErr);
            return NextResponse.json({ error: "Failed to fetch aggregated metrics" }, { status: 500 });
        }

        // 3. Aggregate qual data to per-unit totals
        const unitTotals = new Map<number, { positive: number; negative: number; neutral: number; total: number }>();
        for (const row of (qualAgg || [])) {
            const uid = row.target_unit_id;
            if (!unitTotals.has(uid)) unitTotals.set(uid, { positive: 0, negative: 0, neutral: 0, total: 0 });
            const entry = unitTotals.get(uid)!;
            const cnt = parseInt(row.cnt);
            entry.total += cnt;
            if (row.sentiment === "Positive") entry.positive += cnt;
            else if (row.sentiment === "Negative") entry.negative += cnt;
            else entry.neutral += cnt;
        }

        // 4. Build final stats
        const stats = orgUnits.map(unit => {
            const unitStats = unitTotals.get(unit.id);
            if (unitStats && unitStats.total > 0) {
                const score = computeSentimentScore(unitStats.positive, unitStats.neutral, unitStats.negative);
                return { id: unit.id, name: unit.name, ...unitStats, score };
            }
            return { id: unit.id, name: unit.name, total: 0, positive: 0, neutral: 0, negative: 0, score: 0 };
        });

        return NextResponse.json({ stats });

    } catch (e: any) {
        console.error("Server Error in /api/executive/metrics:", e);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
