import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

/**
 * GET /api/executive/category-insights?surveyId=X
 * Optional: &categoryNames=Staff+Service+%26+Attitude,Service+%26+Response+Speed
 *
 * Returns per-unit sentiment counts for categories that are shared across all units
 * (e.g. "Staff Service & Attitude", "Service & Response Speed").
 * Uses the get_qual_summary_by_unit RPC — same data source as the report, no extra DB load.
 */
export async function GET(req: NextRequest) {
    const surveyId = req.nextUrl.searchParams.get("surveyId");
    if (!surveyId) return NextResponse.json({ error: "surveyId required" }, { status: 400 });

    const categoryNamesParam = req.nextUrl.searchParams.get("categoryNames");
    const targetNames: string[] = categoryNamesParam
        ? categoryNamesParam.split(",").map(s => s.trim()).filter(Boolean)
        : ["Staff Service & Attitude", "Service & Response Speed"];

    const [rpcResult, categoriesResult, unitsResult] = await Promise.all([
        supabase.rpc("get_qual_summary_by_unit", { p_survey_id: parseInt(surveyId) }),
        supabase.from("analysis_categories").select("id, name, unit_id"),
        supabase.from("organization_units").select("id, name, short_name").order("name"),
    ]);

    if (rpcResult.error) {
        return NextResponse.json({ error: rpcResult.error.message }, { status: 500 });
    }

    const catNameMap = new Map((categoriesResult.data || []).map(c => [c.id, c.name]));
    const unitMap = new Map((unitsResult.data || []).map(u => [u.id, u]));

    type Counts = { positive: number; negative: number; neutral: number; total: number };

    // category_name → unit_id → Counts
    const accumulator = new Map<string, Map<number, Counts>>();
    for (const name of targetNames) accumulator.set(name, new Map());

    for (const row of (rpcResult.data || [])) {
        const catName = catNameMap.get(row.category_id);
        if (!catName || !targetNames.includes(catName)) continue;
        const unitId = row.target_unit_id;
        if (unitId == null) continue;

        const cnt = parseInt(row.cnt);
        const unitMap2 = accumulator.get(catName)!;
        if (!unitMap2.has(unitId)) unitMap2.set(unitId, { positive: 0, negative: 0, neutral: 0, total: 0 });
        const c = unitMap2.get(unitId)!;
        c.total += cnt;
        if (row.sentiment === "Positive") c.positive += cnt;
        else if (row.sentiment === "Negative") c.negative += cnt;
        else c.neutral += cnt;
    }

    const categories = targetNames.map(catName => {
        const unitCounts = accumulator.get(catName)!;
        const units = Array.from(unitCounts.entries())
            .map(([unitId, counts]) => {
                const unit = unitMap.get(unitId);
                return {
                    unit_id: unitId,
                    unit_name: unit?.name || `Unit ${unitId}`,
                    short_name: unit?.short_name || unit?.name || `Unit ${unitId}`,
                    ...counts,
                    positive_pct: counts.total > 0
                        ? parseFloat((counts.positive / counts.total * 100).toFixed(1))
                        : 0,
                    negative_pct: counts.total > 0
                        ? parseFloat((counts.negative / counts.total * 100).toFixed(1))
                        : 0,
                };
            })
            .sort((a, b) => b.positive_pct - a.positive_pct);

        return { category_name: catName, units };
    });

    return NextResponse.json({ categories });
}
