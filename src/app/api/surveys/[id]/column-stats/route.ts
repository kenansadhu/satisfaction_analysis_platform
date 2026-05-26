import { NextRequest, NextResponse } from "next/server";
import { supabaseServer as supabase } from "@/lib/supabase-server";

export const maxDuration = 60;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const surveyId = parseInt(id);
    if (isNaN(surveyId)) return NextResponse.json({ error: "Invalid survey ID" }, { status: 400 });

    // Single server-side aggregation: group raw_feedback_inputs by source_column.
    // Uses a Postgres RPC so we get GROUP BY instead of fetching all rows to the client.
    const { data, error } = await supabase.rpc("survey_column_stats", { p_survey_id: surveyId });

    if (error) {
        // RPC might not exist yet — fall back to a lighter direct query approach.
        // We query respondent IDs, then aggregate raw_feedback_inputs with a window trick.
        console.warn("[column-stats] RPC not available, using fallback:", error.message);
        return fallback(surveyId);
    }

    return NextResponse.json({ columns: data });
}

async function fallback(surveyId: number) {
    // Step 1: respondent IDs (paginated, but only select id — fast).
    let respIds: number[] = [];
    let page = 0;
    while (true) {
        const { data: batch } = await supabase
            .from("respondents")
            .select("id")
            .eq("survey_id", surveyId)
            .range(page * 1000, (page + 1) * 1000 - 1);
        if (!batch || batch.length === 0) break;
        respIds.push(...batch.map((r: any) => r.id));
        if (batch.length < 1000) break;
        page++;
    }

    if (respIds.length === 0) return NextResponse.json({ columns: [] });

    // Step 2: fetch raw_feedback_inputs in parallel chunks — but only ONE row per
    // source_column (the first occurrence) to get metadata, plus count per chunk.
    // We do this by fetching with a LIMIT per source_column via distinct-ish grouping.
    // Approach: fetch all rows but ONLY the columns we need for aggregation.
    // For large surveys this is still heavy, but runs server-side (no round trips).
    const CHUNK = 500;
    const rawInputs: any[] = [];
    const promises = [];
    for (let i = 0; i < respIds.length; i += CHUNK) {
        const chunk = respIds.slice(i, i + CHUNK);
        promises.push(
            supabase
                .from("raw_feedback_inputs")
                .select("source_column, target_unit_id, is_quantitative, requires_analysis, score_rule, custom_mapping, id")
                .in("respondent_id", chunk)
                .then((r) => r)
        );
    }
    const results = await Promise.all(promises);
    for (const res of results) {
        if (res.data) rawInputs.push(...res.data);
    }

    // Step 3: aggregate by source_column server-side (in JS — avoids separate DB roundtrip).
    type ColAgg = {
        source_column: string;
        target_unit_id: number;
        row_count: number;
        is_quantitative: boolean;
        requires_analysis: boolean;
        score_rule: string | null;
        custom_mapping: Record<string, number | null> | null;
        min_id: number;
    };
    const map = new Map<string, ColAgg>();
    for (const row of rawInputs) {
        const key = row.source_column as string;
        const existing = map.get(key);
        if (existing) {
            existing.row_count++;
            if (row.is_quantitative) existing.is_quantitative = true;
            if (row.requires_analysis) existing.requires_analysis = true;
            if (row.id < existing.min_id) existing.min_id = row.id;
        } else {
            map.set(key, {
                source_column: key,
                target_unit_id: row.target_unit_id,
                row_count: 1,
                is_quantitative: !!row.is_quantitative,
                requires_analysis: !!row.requires_analysis,
                score_rule: row.score_rule ?? null,
                custom_mapping: row.custom_mapping ?? null,
                min_id: row.id,
            });
        }
    }

    // Step 4: has_segments — query feedback_segments once with input IDs.
    const allInputIds = rawInputs.map(r => r.id);
    const segInputIdSet = new Set<number>();
    const SEG_CHUNK = 1000;
    const segPromises = [];
    for (let i = 0; i < allInputIds.length; i += SEG_CHUNK) {
        segPromises.push(
            supabase
                .from("feedback_segments")
                .select("raw_input_id")
                .in("raw_input_id", allInputIds.slice(i, i + SEG_CHUNK))
                .then((r) => r)
        );
    }
    const segResults = await Promise.all(segPromises);
    for (const res of segResults) {
        res.data?.forEach((s: any) => segInputIdSet.add(s.raw_input_id));
    }

    // Map input IDs back to source_column for has_segments
    const colInputIds = new Map<string, number[]>();
    for (const row of rawInputs) {
        const arr = colInputIds.get(row.source_column) ?? [];
        arr.push(row.id);
        colInputIds.set(row.source_column, arr);
    }
    const hasSegmentsMap = new Map<string, number>();
    for (const [col, ids] of colInputIds) {
        hasSegmentsMap.set(col, ids.filter(id => segInputIdSet.has(id)).length);
    }

    const columns = Array.from(map.values()).map(c => ({
        ...c,
        has_segments: hasSegmentsMap.get(c.source_column) ?? 0,
    }));

    return NextResponse.json({ columns });
}
