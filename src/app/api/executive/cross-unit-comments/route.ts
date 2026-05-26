import { NextRequest, NextResponse } from "next/server";
import { supabaseServer as supabase } from "@/lib/supabase-server";

export const maxDuration = 60;

/**
 * GET /api/executive/cross-unit-comments
 *   ?surveyId=X
 *   &sourceUnitId=Y   (optional — unit whose feedback contains the mention)
 *   &targetUnitId=Z   (optional — unit being mentioned)
 *   &page=0
 */
export async function GET(req: NextRequest) {
    const { searchParams } = req.nextUrl;
    const surveyId = searchParams.get("surveyId");
    const sourceUnitId = searchParams.get("sourceUnitId") ? parseInt(searchParams.get("sourceUnitId")!) : null;
    const targetUnitId = searchParams.get("targetUnitId") ? parseInt(searchParams.get("targetUnitId")!) : null;
    const page = parseInt(searchParams.get("page") || "0");
    const PAGE_SIZE = 20;

    if (!surveyId || surveyId === "all") {
        return NextResponse.json({ comments: [], total: 0, page: 0, pageSize: PAGE_SIZE });
    }

    const sid = parseInt(surveyId);

    // ── Units map ──────────────────────────────────────────────────────────────
    const { data: unitsRaw } = await supabase
        .from("organization_units").select("id, name, short_name");
    const unitsMap = new Map((unitsRaw || []).map(u => [
        u.id as number,
        (u.short_name || u.name) as string,
    ]));

    // ── Respondent IDs for this survey ─────────────────────────────────────────
    const PAGE = 1000;
    const respIds: number[] = [];
    let from = 0;
    while (true) {
        const { data } = await supabase.from("respondents")
            .select("id").eq("survey_id", sid).range(from, from + PAGE - 1);
        if (!data?.length) break;
        respIds.push(...data.map((r: { id: number }) => r.id));
        if (data.length < PAGE) break;
        from += PAGE;
    }

    if (!respIds.length) return NextResponse.json({ comments: [], total: 0, page: 0, pageSize: PAGE_SIZE });

    // ── Raw input IDs (optionally filtered by source unit) ─────────────────────
    const CHUNK = 400, CONC = 5;
    const inputMap = new Map<number, number>(); // input_id → target_unit_id

    for (let bStart = 0; bStart < respIds.length; bStart += CHUNK * CONC) {
        const chunks: number[][] = [];
        for (let i = bStart; i < Math.min(bStart + CHUNK * CONC, respIds.length); i += CHUNK)
            chunks.push(respIds.slice(i, i + CHUNK));

        const results = await Promise.all(chunks.map(chunk => {
            let q = supabase.from("raw_feedback_inputs")
                .select("id, target_unit_id")
                .in("respondent_id", chunk)
                .eq("is_quantitative", false);
            if (sourceUnitId) q = (q as any).eq("target_unit_id", sourceUnitId);
            return q;
        }));

        for (const res of results) {
            if (!res.data) continue;
            for (const inp of res.data as { id: number; target_unit_id: number }[])
                if (inp.target_unit_id) inputMap.set(inp.id, inp.target_unit_id);
        }
    }

    if (!inputMap.size) return NextResponse.json({ comments: [], total: 0, page: 0, pageSize: PAGE_SIZE });

    const inputIds = [...inputMap.keys()];

    // ── Fetch cross-unit segments ──────────────────────────────────────────────
    const allSegments: {
        id: number;
        segment_text: string;
        sentiment: string;
        related_unit_ids: number[];
        raw_input_id: number;
    }[] = [];

    for (let bStart = 0; bStart < inputIds.length; bStart += CHUNK * CONC) {
        const chunks: number[][] = [];
        for (let i = bStart; i < Math.min(bStart + CHUNK * CONC, inputIds.length); i += CHUNK)
            chunks.push(inputIds.slice(i, i + CHUNK));

        const results = await Promise.all(chunks.map(chunk => {
            let q = supabase.from("feedback_segments")
                .select("id, segment_text, sentiment, related_unit_ids, raw_input_id")
                .in("raw_input_id", chunk)
                .not("related_unit_ids", "is", null);
            if (targetUnitId) q = (q as any).contains("related_unit_ids", [targetUnitId]);
            return q;
        }));

        for (const res of results) {
            if (!res.data) continue;
            allSegments.push(...(res.data as typeof allSegments));
        }
    }

    // ── Enrich + filter self-references ───────────────────────────────────────
    type Comment = {
        id: number;
        segment_text: string;
        sentiment: string;
        source_unit_id: number;
        source_unit_name: string;
        mentioned_units: { id: number; name: string }[];
    };

    const comments: Comment[] = [];
    for (const seg of allSegments) {
        const srcId = inputMap.get(seg.raw_input_id);
        if (!srcId || !seg.segment_text?.trim()) continue;

        const mentionedIds = (seg.related_unit_ids || []).filter(id => id !== srcId);
        if (!mentionedIds.length) continue; // pure self-reference

        comments.push({
            id: seg.id,
            segment_text: seg.segment_text,
            sentiment: seg.sentiment,
            source_unit_id: srcId,
            source_unit_name: unitsMap.get(srcId) ?? `Unit ${srcId}`,
            mentioned_units: mentionedIds.map(id => ({
                id,
                name: unitsMap.get(id) ?? `Unit ${id}`,
            })),
        });
    }

    const total = comments.length;
    const paginated = comments.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

    // Build available unit options from all comments (for dropdown population)
    const seenIds = new Set<number>();
    for (const c of comments) {
        seenIds.add(c.source_unit_id);
        for (const u of c.mentioned_units) seenIds.add(u.id);
    }
    const availableUnits = [...seenIds]
        .map(id => ({ id, name: unitsMap.get(id) ?? `Unit ${id}` }))
        .sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({ comments: paginated, total, page, pageSize: PAGE_SIZE, availableUnits });
}
