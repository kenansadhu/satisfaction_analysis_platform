import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const maxDuration = 60;

/**
 * GET /api/executive/cross-unit-mentions?surveyId=X
 *
 * Returns which units get mentioned most in other units' feedback (cross-unit traffic).
 * Uses survey_cross_mentions_cache. Run once in Supabase:
 *   ALTER TABLE survey_cross_mentions_cache ADD COLUMN IF NOT EXISTS source_units_breakdown JSONB;
 */
export async function GET(req: NextRequest) {
    const surveyId = req.nextUrl.searchParams.get("surveyId");
    if (!surveyId) return NextResponse.json({ error: "surveyId required" }, { status: 400 });
    const sid = parseInt(surveyId);

    // ── Try cache ──────────────────────────────────────────────────────────────
    const { data: cached, error: cacheErr } = await supabase
        .from("survey_cross_mentions_cache")
        .select("mentioned_unit_id, total_mentions, source_unit_count, positive_count, negative_count, neutral_count")
        .eq("survey_id", sid)
        .gt("total_mentions", 0);

    if (!cacheErr && cached && cached.length > 0) {
        const unitIds = cached.map(r => r.mentioned_unit_id);
        const { data: unitData } = await supabase
            .from("organization_units").select("id, name, short_name").in("id", unitIds);
        const unitNameMap = new Map((unitData || []).map(u => [u.id, u]));

        const result = cached.map(r => {
            const unit = unitNameMap.get(r.mentioned_unit_id);
            return {
                unit_id: r.mentioned_unit_id,
                unit_name: unit?.name || `Unit ${r.mentioned_unit_id}`,
                unit_short_name: unit?.short_name || unit?.name || `Unit ${r.mentioned_unit_id}`,
                total_mentions: r.total_mentions,
                source_unit_count: r.source_unit_count,
                positive_count: r.positive_count,
                negative_count: r.negative_count,
                neutral_count: r.neutral_count,
            };
        }).sort((a, b) => b.total_mentions - a.total_mentions);

        return NextResponse.json({ mentions: result, fromCache: true });
    }

    // ── Cache miss: compute from raw data ──────────────────────────────────────
    // Step 1: All respondent IDs for this survey
    const PAGE = 1000;
    const allRespIds: number[] = [];
    let from = 0;
    while (true) {
        const { data } = await supabase.from("respondents")
            .select("id").eq("survey_id", sid).range(from, from + PAGE - 1);
        if (!data || data.length === 0) break;
        for (const r of data) allRespIds.push(r.id);
        if (data.length < PAGE) break;
        from += PAGE;
    }

    // Step 2: All qualitative input IDs + their target units
    const CHUNK = 400;
    const MAX_CONCURRENT = 5;
    const inputTargetMap = new Map<number, number>(); // input_id → target_unit_id

    for (let bStart = 0; bStart < allRespIds.length; bStart += CHUNK * MAX_CONCURRENT) {
        const chunks: number[][] = [];
        for (let i = bStart; i < Math.min(bStart + CHUNK * MAX_CONCURRENT, allRespIds.length); i += CHUNK)
            chunks.push(allRespIds.slice(i, i + CHUNK));
        const results = await Promise.all(chunks.map(chunk =>
            supabase.from("raw_feedback_inputs").select("id, target_unit_id")
                .in("respondent_id", chunk).eq("is_quantitative", false)
        ));
        for (const res of results) {
            if (!res.data) continue;
            for (const inp of res.data)
                if (inp.target_unit_id) inputTargetMap.set(inp.id, inp.target_unit_id);
        }
    }

    // Step 3: Segments with related_unit_ids — tally cross-mentions
    const allInputIds = [...inputTargetMap.keys()];

    type SourceCounts = { positive: number; negative: number; neutral: number; total: number };
    type MentionAgg = {
        sources: Set<number>;
        positive: number; negative: number; neutral: number; total: number;
        sourceBreakdown: Map<number, SourceCounts>;
    };
    const mentionMap = new Map<number, MentionAgg>();

    for (let bStart = 0; bStart < allInputIds.length; bStart += CHUNK * MAX_CONCURRENT) {
        const chunks: number[][] = [];
        for (let i = bStart; i < Math.min(bStart + CHUNK * MAX_CONCURRENT, allInputIds.length); i += CHUNK)
            chunks.push(allInputIds.slice(i, i + CHUNK));
        const results = await Promise.all(chunks.map(chunk =>
            supabase.from("feedback_segments").select("raw_input_id, sentiment, related_unit_ids")
                .in("raw_input_id", chunk)
                .not("related_unit_ids", "is", null)
        ));
        for (const res of results) {
            if (!res.data) continue;
            for (const seg of res.data) {
                if (!seg.related_unit_ids?.length) continue;
                const sourceUnitId = inputTargetMap.get(seg.raw_input_id);
                if (sourceUnitId === undefined) continue;

                for (const mentionedUnitId of seg.related_unit_ids) {
                    if (mentionedUnitId === sourceUnitId) continue; // skip self-tags

                    if (!mentionMap.has(mentionedUnitId)) {
                        mentionMap.set(mentionedUnitId, {
                            sources: new Set(), positive: 0, negative: 0, neutral: 0, total: 0,
                            sourceBreakdown: new Map(),
                        });
                    }
                    const m = mentionMap.get(mentionedUnitId)!;
                    m.sources.add(sourceUnitId);
                    m.total++;
                    if (seg.sentiment === "Positive") m.positive++;
                    else if (seg.sentiment === "Negative") m.negative++;
                    else m.neutral++;

                    if (!m.sourceBreakdown.has(sourceUnitId))
                        m.sourceBreakdown.set(sourceUnitId, { positive: 0, negative: 0, neutral: 0, total: 0 });
                    const sb = m.sourceBreakdown.get(sourceUnitId)!;
                    sb.total++;
                    if (seg.sentiment === "Positive") sb.positive++;
                    else if (seg.sentiment === "Negative") sb.negative++;
                    else sb.neutral++;
                }
            }
        }
    }

    // Get unit names for all IDs involved
    const allUnitIds = [...new Set([
        ...mentionMap.keys(),
        ...[...mentionMap.values()].flatMap(m => [...m.sources]),
    ])];
    const { data: unitData } = await supabase
        .from("organization_units").select("id, name, short_name").in("id", allUnitIds);
    const unitNameMap = new Map((unitData || []).map(u => [u.id, u]));

    // Build cache rows with source_units_breakdown JSONB
    const cacheRows = [...mentionMap.entries()].map(([unitId, agg]) => {
        const sourceBreakdownArr = [...agg.sourceBreakdown.entries()]
            .map(([srcId, counts]) => {
                const srcUnit = unitNameMap.get(srcId);
                return {
                    source_unit_id: srcId,
                    source_unit_name: srcUnit?.name || `Unit ${srcId}`,
                    source_unit_short_name: srcUnit?.short_name || srcUnit?.name || `Unit ${srcId}`,
                    ...counts,
                };
            })
            .sort((a, b) => b.total - a.total);

        return {
            survey_id: sid,
            mentioned_unit_id: unitId,
            total_mentions: agg.total,
            source_unit_count: agg.sources.size,
            positive_count: agg.positive,
            negative_count: agg.negative,
            neutral_count: agg.neutral,
            source_units_breakdown: sourceBreakdownArr,
        };
    });

    supabase.from("survey_cross_mentions_cache")
        .upsert(cacheRows, { onConflict: "survey_id,mentioned_unit_id" })
        .then(({ error }) => {
            if (error) console.error("[cross-mentions-cache] write error:", error.message);
            else console.log(`[cross-mentions-cache] wrote ${cacheRows.length} rows for survey ${sid}`);
        });

    const result = [...mentionMap.entries()].map(([unitId, agg]) => {
        const unit = unitNameMap.get(unitId);
        return {
            unit_id: unitId,
            unit_name: unit?.name || `Unit ${unitId}`,
            unit_short_name: unit?.short_name || unit?.name || `Unit ${unitId}`,
            total_mentions: agg.total,
            source_unit_count: agg.sources.size,
            positive_count: agg.positive,
            negative_count: agg.negative,
            neutral_count: agg.neutral,
        };
    }).sort((a, b) => b.total_mentions - a.total_mentions);

    return NextResponse.json({ mentions: result, fromCache: false });
}
