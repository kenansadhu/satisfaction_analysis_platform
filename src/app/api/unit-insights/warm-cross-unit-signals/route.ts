import { NextResponse } from "next/server";
import { supabaseServer as supabase } from "@/lib/supabase-server";

export const maxDuration = 300;

/**
 * POST /api/unit-insights/warm-cross-unit-signals
 * Body: { surveyId: string }
 *
 * Computes cross-unit signals (incoming + outgoing segments per unit)
 * for the entire survey in one pass and writes to unit_cross_signals_cache.
 * Called during the settings page cache rebuild.
 */
export async function POST(req: Request) {
    const { surveyId } = await req.json();
    if (!surveyId) return NextResponse.json({ error: "surveyId required" }, { status: 400 });

    const sid = parseInt(surveyId);
    const PAGE = 1000;
    const CHUNK = 500;

    // ── All units for name lookup ─────────────────────────────────────────────
    const { data: allUnitsData } = await supabase
        .from("organization_units")
        .select("id, name, short_name");
    const unitMap = new Map((allUnitsData || []).map(u => [u.id as number, (u.short_name || u.name) as string]));
    const allUnitIds = Array.from(unitMap.keys());

    // ── Categories per unit ───────────────────────────────────────────────────
    const { data: catData } = await supabase
        .from("analysis_categories")
        .select("id, name, unit_id");
    // catMap: category_id → { name, unit_id }
    const catMap = new Map((catData || []).map(c => [c.id as number, { name: c.name as string, unit_id: c.unit_id as number }]));

    // ── Fetch ALL inputs for this survey (paginated), building input→unit map ─
    // input_id → target_unit_id
    const inputUnitMap = new Map<number, number>();
    let page = 0;
    while (true) {
        const { data, error } = await supabase
            .from("raw_feedback_inputs")
            .select("id, target_unit_id, respondents!inner(survey_id)")
            .eq("respondents.survey_id", sid)
            .eq("is_quantitative", false)
            .range(page * PAGE, (page + 1) * PAGE - 1);
        if (error || !data || data.length === 0) break;
        for (const inp of data) {
            if (inp.target_unit_id) inputUnitMap.set(inp.id, inp.target_unit_id);
        }
        if (data.length < PAGE) break;
        page++;
    }

    const allInputIds = Array.from(inputUnitMap.keys());
    if (allInputIds.length === 0) {
        return NextResponse.json({ warmed: 0, message: "No inputs found for survey" });
    }

    // ── Fetch ALL cross-tagged segments for those inputs ──────────────────────
    type RawSeg = {
        id: number; segment_text: string; sentiment: string;
        category_id: number; related_unit_ids: number[]; raw_input_id: number;
    };
    const allCrossSegs: RawSeg[] = [];
    const fetches: PromiseLike<void>[] = [];
    for (let i = 0; i < allInputIds.length; i += CHUNK) {
        const chunk = allInputIds.slice(i, i + CHUNK);
        fetches.push(
            supabase
                .from("feedback_segments")
                .select("id, segment_text, sentiment, category_id, related_unit_ids, raw_input_id")
                .in("raw_input_id", chunk)
                .not("related_unit_ids", "is", null)
                .then(({ data }) => {
                    if (!data) return;
                    for (const seg of data) {
                        if (!Array.isArray(seg.related_unit_ids) || seg.related_unit_ids.length === 0) continue;
                        allCrossSegs.push(seg as RawSeg);
                    }
                })
        );
    }
    await Promise.all(fetches);

    // ── Build per-unit outgoing and incoming buckets ──────────────────────────
    type OutSeg = { id: number; segment_text: string; sentiment: string; category_name: string; related_unit_ids: number[]; tagged_units: string };
    type InSeg  = { id: number; segment_text: string; sentiment: string; source_unit_id: number; source_unit_name: string };
    type UnitAgg = { unit_id: number; unit_name: string; positive: number; negative: number; neutral: number; total: number };

    const outgoingSegsMap   = new Map<number, OutSeg[]>();
    const incomingSegsMap   = new Map<number, InSeg[]>();
    const outByTargetMap    = new Map<number, Map<number, UnitAgg>>();
    const inBySourceMap     = new Map<number, Map<number, UnitAgg>>();

    for (const uid of allUnitIds) {
        outgoingSegsMap.set(uid, []);
        incomingSegsMap.set(uid, []);
        outByTargetMap.set(uid, new Map());
        inBySourceMap.set(uid, new Map());
    }

    for (const seg of allCrossSegs) {
        const srcUnitId = inputUnitMap.get(seg.raw_input_id);
        if (!srcUnitId) continue;

        const relatedIds = seg.related_unit_ids as number[];

        // ── OUTGOING: this segment is from srcUnitId mentioning others ──
        const otherIds = relatedIds.filter(id => id !== srcUnitId);
        if (otherIds.length > 0) {
            const catInfo = catMap.get(seg.category_id);
            const outSeg: OutSeg = {
                id: seg.id,
                segment_text: seg.segment_text,
                sentiment: seg.sentiment,
                category_name: catInfo?.name || "Unknown",
                related_unit_ids: otherIds,
                tagged_units: otherIds.map(id => unitMap.get(id) || `Unit ${id}`).join(", "),
            };
            const bucket = outgoingSegsMap.get(srcUnitId);
            if (bucket) bucket.push(outSeg);

            // aggregate per target unit
            const aggMap = outByTargetMap.get(srcUnitId)!;
            for (const tid of otherIds) {
                if (!aggMap.has(tid)) {
                    aggMap.set(tid, { unit_id: tid, unit_name: unitMap.get(tid) || `Unit ${tid}`, positive: 0, negative: 0, neutral: 0, total: 0 });
                }
                const a = aggMap.get(tid)!;
                a.total++;
                if (seg.sentiment === "Positive") a.positive++;
                else if (seg.sentiment === "Negative") a.negative++;
                else a.neutral++;
            }
        }

        // ── INCOMING: this segment mentions some units — add to their incoming ──
        for (const mentionedId of relatedIds) {
            if (mentionedId === srcUnitId) continue;
            const inBucket = incomingSegsMap.get(mentionedId);
            if (!inBucket) continue;
            inBucket.push({
                id: seg.id,
                segment_text: seg.segment_text,
                sentiment: seg.sentiment,
                source_unit_id: srcUnitId,
                source_unit_name: unitMap.get(srcUnitId) || `Unit ${srcUnitId}`,
            });

            const aggMap: Map<number, UnitAgg> = inBySourceMap.get(mentionedId)!;
            if (!aggMap.has(srcUnitId)) {
                aggMap.set(srcUnitId, { unit_id: srcUnitId, unit_name: unitMap.get(srcUnitId) || `Unit ${srcUnitId}`, positive: 0, negative: 0, neutral: 0, total: 0 });
            }
            const a = aggMap.get(srcUnitId)!;
            a.total++;
            if (seg.sentiment === "Positive") a.positive++;
            else if (seg.sentiment === "Negative") a.negative++;
            else a.neutral++;
        }
    }

    // ── Upsert into cache (only units that have at least some data) ───────────
    const rows: any[] = [];
    for (const uid of allUnitIds) {
        const outSegs = outgoingSegsMap.get(uid) || [];
        const inSegs  = incomingSegsMap.get(uid) || [];
        if (outSegs.length === 0 && inSegs.length === 0) continue;

        const outByTarget = Array.from(outByTargetMap.get(uid)!.values()).sort((a, b) => b.total - a.total);
        const inBySource  = Array.from(inBySourceMap.get(uid)!.values()).sort((a, b) => b.total - a.total);

        rows.push({
            survey_id:          sid,
            unit_id:            uid,
            outgoing_segments:  outSegs.slice(0, 300),
            incoming_segments:  inSegs.slice(0, 300),
            outgoing_by_target: outByTarget,
            incoming_by_source: inBySource,
        });
    }

    if (rows.length > 0) {
        const { error } = await supabase
            .from("unit_cross_signals_cache")
            .upsert(rows, { onConflict: "survey_id,unit_id" });
        if (error) {
            console.error("[warm-cross-unit-signals] upsert error:", error.message);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }
    }

    return NextResponse.json({
        warmed: rows.length,
        total_cross_segments: allCrossSegs.length,
    });
}
