import { NextRequest, NextResponse } from "next/server";
import { supabaseServer as supabase } from "@/lib/supabase-server";

export const maxDuration = 60;

/**
 * GET /api/executive/incoming-mentions?unitId=X&surveyId=Y
 *
 * Returns which other units have feedback segments that tag this unit
 * (i.e. incoming cross-unit mentions from other units' analyses).
 * Caches per (survey_id, mentioned_unit_id) in survey_cross_mentions_cache.
 */
export async function GET(req: NextRequest) {
    const unitId = req.nextUrl.searchParams.get("unitId");
    const surveyId = req.nextUrl.searchParams.get("surveyId");
    if (!unitId || !surveyId) {
        return NextResponse.json({ error: "unitId and surveyId required" }, { status: 400 });
    }
    const uid = parseInt(unitId);
    const sid = parseInt(surveyId);

    // ── Try cache ──────────────────────────────────────────────────────────────
    const { data: cached } = await supabase
        .from("survey_cross_mentions_cache")
        .select("total_mentions, source_unit_count, positive_count, negative_count, neutral_count, source_units_breakdown")
        .eq("survey_id", sid)
        .eq("mentioned_unit_id", uid)
        .maybeSingle();

    if (cached && cached.source_units_breakdown) {
        return NextResponse.json({
            total_mentions: cached.total_mentions,
            source_unit_count: cached.source_unit_count,
            positive_count: cached.positive_count,
            negative_count: cached.negative_count,
            neutral_count: cached.neutral_count,
            sources: cached.source_units_breakdown,
            fromCache: true,
        });
    }

    // ── Cache miss: compute from raw data ──────────────────────────────────────
    // Step 1: All respondents for this survey
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

    // Step 2: All input IDs from OTHER units' analyses (target_unit_id != uid)
    const CHUNK = 400;
    const MAX_CONCURRENT = 5;
    const inputTargetMap = new Map<number, number>(); // input_id → source unit_id

    for (let bStart = 0; bStart < allRespIds.length; bStart += CHUNK * MAX_CONCURRENT) {
        const chunks: number[][] = [];
        for (let i = bStart; i < Math.min(bStart + CHUNK * MAX_CONCURRENT, allRespIds.length); i += CHUNK)
            chunks.push(allRespIds.slice(i, i + CHUNK));
        const results = await Promise.all(chunks.map(chunk =>
            supabase.from("raw_feedback_inputs").select("id, target_unit_id")
                .in("respondent_id", chunk)
                .eq("is_quantitative", false)
                .neq("target_unit_id", uid)
        ));
        for (const res of results) {
            if (!res.data) continue;
            for (const inp of res.data)
                if (inp.target_unit_id) inputTargetMap.set(inp.id, inp.target_unit_id);
        }
    }

    // Step 3: Segments from those inputs that mention this unit
    const allInputIds = [...inputTargetMap.keys()];
    type SourceCounts = { positive: number; negative: number; neutral: number; total: number };
    const sourceBreakdown = new Map<number, SourceCounts>();
    let totalPos = 0, totalNeg = 0, totalNeu = 0;

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
                if (!Array.isArray(seg.related_unit_ids) || !seg.related_unit_ids.includes(uid)) continue;
                const srcUnitId = inputTargetMap.get(seg.raw_input_id);
                if (!srcUnitId || srcUnitId === uid) continue;

                if (!sourceBreakdown.has(srcUnitId))
                    sourceBreakdown.set(srcUnitId, { positive: 0, negative: 0, neutral: 0, total: 0 });
                const sb = sourceBreakdown.get(srcUnitId)!;
                sb.total++;
                if (seg.sentiment === "Positive") { sb.positive++; totalPos++; }
                else if (seg.sentiment === "Negative") { sb.negative++; totalNeg++; }
                else { sb.neutral++; totalNeu++; }
            }
        }
    }

    const srcUnitIds = [...sourceBreakdown.keys()];
    const { data: unitData } = await supabase
        .from("organization_units").select("id, name, short_name").in("id", srcUnitIds);
    const unitNameMap = new Map((unitData || []).map(u => [u.id, u]));

    const sourcesArr = [...sourceBreakdown.entries()]
        .map(([srcId, counts]) => {
            const u = unitNameMap.get(srcId);
            return {
                source_unit_id: srcId,
                source_unit_name: u?.name || `Unit ${srcId}`,
                source_unit_short_name: u?.short_name || u?.name || `Unit ${srcId}`,
                ...counts,
            };
        })
        .sort((a, b) => b.total - a.total);

    const total = totalPos + totalNeg + totalNeu;

    // Fire-and-forget cache write
    supabase.from("survey_cross_mentions_cache")
        .upsert({
            survey_id: sid,
            mentioned_unit_id: uid,
            total_mentions: total,
            source_unit_count: sourceBreakdown.size,
            positive_count: totalPos,
            negative_count: totalNeg,
            neutral_count: totalNeu,
            source_units_breakdown: sourcesArr,
        }, { onConflict: "survey_id,mentioned_unit_id" })
        .then(({ error }) => {
            if (error) console.error("[incoming-mentions-cache] write error:", error.message);
        });

    return NextResponse.json({
        total_mentions: total,
        source_unit_count: sourceBreakdown.size,
        positive_count: totalPos,
        negative_count: totalNeg,
        neutral_count: totalNeu,
        sources: sourcesArr,
        fromCache: false,
    });
}
