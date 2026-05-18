import { NextRequest, NextResponse } from "next/server";
import { supabaseServer as supabase } from "@/lib/supabase-server";
import { addToCounts, bucketScore, computeNpsScore, emptyNpsCounts, NpsBucket, NpsCounts } from "@/lib/nps";
import { parseSettingArray } from "@/lib/platformSettings";

export const maxDuration = 120;

/**
 * GET /api/executive/nps?surveyId=<id>
 *
 * Returns NPS data scoped to a survey, aggregated:
 *   - per (unit × column)
 *   - per (unit × column × faculty)
 *
 * Also returns the qualitative summary for each NPS unit's text columns,
 * so the dedicated NPS tab can show "why did you give that answer" categorization.
 */
export async function GET(req: NextRequest) {
    const surveyId = req.nextUrl.searchParams.get("surveyId");
    if (!surveyId) return NextResponse.json({ error: "surveyId required" }, { status: 400 });
    const sid = parseInt(surveyId);

    // 0. Cache check — survey_nps_cache stores the full response JSON
    const { data: npsCache, error: npsCacheErr } = await supabase
        .from("survey_nps_cache")
        .select("data")
        .eq("survey_id", sid)
        .maybeSingle();
    if (!npsCacheErr && npsCache?.data) {
        console.log(`[nps] Cache hit for survey ${sid}`);
        return NextResponse.json(npsCache.data);
    }

    // 1. NPS-unit setting + organization units
    const [npsSettingRes, unitsRes] = await Promise.all([
        supabase.from("platform_settings").select("value").eq("key", "nps_unit_ids").maybeSingle(),
        supabase.from("organization_units").select("id, name, short_name, description"),
    ]);
    const npsUnitIds: number[] = parseSettingArray<number>(npsSettingRes.data?.value);
    const unitsMap = new Map((unitsRes.data || []).map(u => [u.id, u]));
    const npsUnits = npsUnitIds.map(id => unitsMap.get(id)).filter(Boolean) as { id: number; name: string; short_name: string | null; description: string | null }[];

    if (npsUnits.length === 0) {
        return NextResponse.json({ units: [], faculties: [], totals: { nps_score: null, total: 0, detractors: 0, passives: 0, promoters: 0 }, qualitative: [] });
    }

    // 2. Respondents for the survey (paginated)
    const PAGE = 1000;
    const respondents: { id: number; faculty: string }[] = [];
    let rFrom = 0;
    while (true) {
        const { data } = await supabase.from("respondents")
            .select("id, faculty")
            .eq("survey_id", sid)
            .range(rFrom, rFrom + PAGE - 1);
        if (!data || data.length === 0) break;
        for (const r of data) respondents.push({ id: r.id, faculty: r.faculty || "Unknown" });
        if (data.length < PAGE) break;
        rFrom += PAGE;
    }
    const respFaculty = new Map(respondents.map(r => [r.id, r.faculty]));
    const respIds = respondents.map(r => r.id);

    if (respIds.length === 0) {
        return NextResponse.json({ units: [], faculties: [], totals: { nps_score: null, total: 0, detractors: 0, passives: 0, promoters: 0 }, qualitative: [] });
    }

    // 3. NPS quant rows (0–10) scoped to the survey and to NPS units
    const npsRows: { target_unit_id: number; source_column: string; numerical_score: number; respondent_id: number }[] = [];
    const CHUNK = 400;
    for (let i = 0; i < respIds.length; i += CHUNK) {
        const chunk = respIds.slice(i, i + CHUNK);
        let qPage = 0;
        while (true) {
            const { data } = await supabase
                .from("raw_feedback_inputs")
                .select("target_unit_id, source_column, numerical_score, respondent_id")
                .in("respondent_id", chunk)
                .in("target_unit_id", npsUnitIds)
                .eq("score_rule", "NPS_0_10")
                .not("numerical_score", "is", null)
                .range(qPage * 1000, (qPage + 1) * 1000 - 1);
            if (!data || data.length === 0) break;
            npsRows.push(...(data as any[]));
            if (data.length < 1000) break;
            qPage++;
        }
    }

    // 4. Aggregate: per (unit × column) and per (unit × column × faculty)
    type Key = string;
    const perUnitCol = new Map<Key, NpsCounts & { unitId: number; column: string }>();
    const perFaculty = new Map<Key, NpsCounts & { unitId: number; column: string; faculty: string }>();
    const totals = emptyNpsCounts();

    // Per-unit score distribution (0..10 histogram) and respondent → bucket mapping.
    // The respondent-bucket map is keyed by (unitId, respondent_id) so multi-NPS-column surveys work cleanly.
    const scoreDistByUnit = new Map<number, number[]>(); // unitId → array length 11, index = score
    const respondentBucket = new Map<string, NpsBucket>(); // `${unitId}::${respondentId}` → bucket

    for (const row of npsRows) {
        const col = row.source_column || "NPS";
        const score = Number(row.numerical_score);
        const uKey = `${row.target_unit_id}::${col}`;
        if (!perUnitCol.has(uKey)) perUnitCol.set(uKey, { ...emptyNpsCounts(), unitId: row.target_unit_id, column: col });
        addToCounts(perUnitCol.get(uKey)!, score);

        const fac = respFaculty.get(row.respondent_id) || "Unknown";
        const fKey = `${row.target_unit_id}::${col}::${fac}`;
        if (!perFaculty.has(fKey)) perFaculty.set(fKey, { ...emptyNpsCounts(), unitId: row.target_unit_id, column: col, faculty: fac });
        addToCounts(perFaculty.get(fKey)!, score);

        addToCounts(totals, score);

        // Score distribution histogram
        if (!scoreDistByUnit.has(row.target_unit_id)) scoreDistByUnit.set(row.target_unit_id, new Array(11).fill(0));
        const dist = scoreDistByUnit.get(row.target_unit_id)!;
        if (score >= 0 && score <= 10) dist[Math.round(score)]++;

        // Bucket per (unit, respondent) — used later to slice comments by detractor/passive/promoter
        respondentBucket.set(`${row.target_unit_id}::${row.respondent_id}`, bucketScore(score));
    }

    // 5. Qualitative summary for the NPS units' text columns.
    //    Fetch raw_feedback_inputs (text) for NPS units → join to feedback_segments → group by category + sentiment.
    const allInputIds: number[] = [];
    const inputIdToUnit = new Map<number, number>();
    const inputIdToFaculty = new Map<number, string>();
    const inputIdToText = new Map<number, string>();
    const inputIdToRespondent = new Map<number, number>();
    for (let i = 0; i < respIds.length; i += CHUNK) {
        const chunk = respIds.slice(i, i + CHUNK);
        const { data } = await supabase
            .from("raw_feedback_inputs")
            .select("id, target_unit_id, respondent_id, raw_text")
            .in("respondent_id", chunk)
            .in("target_unit_id", npsUnitIds)
            .eq("is_quantitative", false);
        if (data) {
            for (const inp of data) {
                allInputIds.push(inp.id);
                inputIdToUnit.set(inp.id, inp.target_unit_id);
                inputIdToFaculty.set(inp.id, respFaculty.get(inp.respondent_id) || "Unknown");
                inputIdToRespondent.set(inp.id, inp.respondent_id);
                if (inp.raw_text) inputIdToText.set(inp.id, inp.raw_text);
            }
        }
    }

    // Categories (for resolving category names)
    const { data: categoriesData } = await supabase
        .from("analysis_categories")
        .select("id, name, unit_id")
        .in("unit_id", npsUnitIds);
    const catMap = new Map((categoriesData || []).map(c => [c.id, c.name]));

    type SegRow = { raw_input_id: number; sentiment: string; category_id: number | null; segment_text: string; is_suggestion: boolean };
    const allSegs: SegRow[] = [];
    const SEG_CHUNK = 1000;
    for (let i = 0; i < allInputIds.length; i += SEG_CHUNK) {
        const chunk = allInputIds.slice(i, i + SEG_CHUNK);
        const { data } = await supabase
            .from("feedback_segments")
            .select("raw_input_id, sentiment, category_id, segment_text, is_suggestion")
            .in("raw_input_id", chunk);
        if (data) allSegs.push(...(data as any[]));
    }

    // Per unit: sentiment totals + top categories + per-bucket category breakdown + per-bucket sample quotes.
    type Quote = { segment_text: string; faculty: string };
    type CatBucketBreakdown = {
        category_name: string;
        detractor: number;
        passive: number;
        promoter: number;
        unknown: number; // segments whose respondent didn't answer the NPS score column
        total: number;
        detractor_quote: Quote | null;
        promoter_quote: Quote | null;
    };

    // 3x3 cross-tab: bucket × sentiment. Cells that span the diagonal corners are the most
    // informative ("critical fans" = promoter+negative, "recoverable detractors" = detractor+positive).
    type SentimentBucketCell = { count: number };
    type SentimentBucketMatrix = {
        detractor: { positive: SentimentBucketCell; neutral: SentimentBucketCell; negative: SentimentBucketCell };
        passive:   { positive: SentimentBucketCell; neutral: SentimentBucketCell; negative: SentimentBucketCell };
        promoter:  { positive: SentimentBucketCell; neutral: SentimentBucketCell; negative: SentimentBucketCell };
    };

    type QualUnit = {
        unit_id: number;
        unit_name: string;
        unit_short_name: string | null;
        sentiment: { positive: number; negative: number; neutral: number; total: number };
        categories: { category_name: string; total: number; positive: number; negative: number; neutral: number }[];
        suggestion_count: number;
        sample_quotes: { sentiment: string; segment_text: string; faculty: string }[];
        // NEW — bucket-aware enrichment
        categories_by_bucket: CatBucketBreakdown[];
        bucket_quotes: { detractor: Quote[]; passive: Quote[]; promoter: Quote[] };
        bucket_segment_counts: { detractor: number; passive: number; promoter: number; unknown: number };
        score_distribution: number[]; // length 11 (index = score 0..10)
        // NEW — sentiment × bucket cross-tab + the two mismatch cohorts that matter most
        sentiment_x_bucket: SentimentBucketMatrix;
        critical_fans_quotes: Quote[];        // promoter + negative comment — credible critiques
        recoverable_detractor_quotes: Quote[]; // detractor + positive comment — they see strengths
    };
    const qualByUnit = new Map<number, QualUnit>();
    for (const id of npsUnitIds) {
        const u = unitsMap.get(id);
        if (!u) continue;
        qualByUnit.set(id, {
            unit_id: id,
            unit_name: u.name,
            unit_short_name: u.short_name,
            sentiment: { positive: 0, negative: 0, neutral: 0, total: 0 },
            categories: [],
            suggestion_count: 0,
            sample_quotes: [],
            categories_by_bucket: [],
            bucket_quotes: { detractor: [], passive: [], promoter: [] },
            bucket_segment_counts: { detractor: 0, passive: 0, promoter: 0, unknown: 0 },
            score_distribution: scoreDistByUnit.get(id) || new Array(11).fill(0),
            sentiment_x_bucket: {
                detractor: { positive: { count: 0 }, neutral: { count: 0 }, negative: { count: 0 } },
                passive:   { positive: { count: 0 }, neutral: { count: 0 }, negative: { count: 0 } },
                promoter:  { positive: { count: 0 }, neutral: { count: 0 }, negative: { count: 0 } },
            },
            critical_fans_quotes: [],
            recoverable_detractor_quotes: [],
        });
    }
    const MISMATCH_QUOTE_LIMIT = 6;
    const catCountsByUnit = new Map<number, Map<number, { total: number; positive: number; negative: number; neutral: number }>>();
    // catId → bucket → { count, sampleQuote }
    const catBucketByUnit = new Map<number, Map<number, { detractor: number; passive: number; promoter: number; unknown: number; detractorQuote: Quote | null; promoterQuote: Quote | null }>>();

    const QUOTES_PER_BUCKET = 5;
    const MIN_QUOTE_LEN = 8;

    for (const seg of allSegs) {
        const unitId = inputIdToUnit.get(seg.raw_input_id);
        if (unitId === undefined) continue;
        const qu = qualByUnit.get(unitId);
        if (!qu) continue;

        // Original sentiment aggregation (kept for back-compat with existing UI consumers).
        qu.sentiment.total++;
        if (seg.sentiment === "Positive") qu.sentiment.positive++;
        else if (seg.sentiment === "Negative") qu.sentiment.negative++;
        else qu.sentiment.neutral++;
        if (seg.is_suggestion) qu.suggestion_count++;

        // Per-category sentiment totals.
        if (seg.category_id != null) {
            if (!catCountsByUnit.has(unitId)) catCountsByUnit.set(unitId, new Map());
            const cm = catCountsByUnit.get(unitId)!;
            if (!cm.has(seg.category_id)) cm.set(seg.category_id, { total: 0, positive: 0, negative: 0, neutral: 0 });
            const cc = cm.get(seg.category_id)!;
            cc.total++;
            if (seg.sentiment === "Positive") cc.positive++;
            else if (seg.sentiment === "Negative") cc.negative++;
            else cc.neutral++;
        }

        // Resolve respondent bucket so we can slice this segment by NPS bucket.
        const respId = inputIdToRespondent.get(seg.raw_input_id);
        const bucket = respId !== undefined
            ? respondentBucket.get(`${unitId}::${respId}`)
            : undefined;

        const fac = inputIdToFaculty.get(seg.raw_input_id) || "Unknown";
        const text = seg.segment_text || "";
        const hasUsableText = text.length >= MIN_QUOTE_LEN;

        // Bucket-level segment counts (so the UI can say "63% of detractors left a comment").
        if (bucket === "detractor") qu.bucket_segment_counts.detractor++;
        else if (bucket === "passive") qu.bucket_segment_counts.passive++;
        else if (bucket === "promoter") qu.bucket_segment_counts.promoter++;
        else qu.bucket_segment_counts.unknown++;

        // Sentiment × bucket cross-tab + mismatch quote capture.
        if (bucket) {
            const sentKey: "positive" | "neutral" | "negative" =
                seg.sentiment === "Positive" ? "positive" :
                seg.sentiment === "Negative" ? "negative" : "neutral";
            qu.sentiment_x_bucket[bucket][sentKey].count++;

            // Critical fans: promoters who left negative comments — the most credible critiques.
            if (bucket === "promoter" && seg.sentiment === "Negative" && hasUsableText
                && qu.critical_fans_quotes.length < MISMATCH_QUOTE_LIMIT) {
                qu.critical_fans_quotes.push({ segment_text: text, faculty: fac });
            }
            // Recoverable detractors: detractors who left positive comments — they see strengths.
            if (bucket === "detractor" && seg.sentiment === "Positive" && hasUsableText
                && qu.recoverable_detractor_quotes.length < MISMATCH_QUOTE_LIMIT) {
                qu.recoverable_detractor_quotes.push({ segment_text: text, faculty: fac });
            }
        }

        // Bucket sample quotes — prefer comments that match the bucket "mood":
        // detractors → negative comments, promoters → positive, passives → any.
        if (bucket && hasUsableText) {
            const list = qu.bucket_quotes[bucket];
            if (list.length < QUOTES_PER_BUCKET) {
                const matchesMood =
                    (bucket === "detractor" && seg.sentiment === "Negative") ||
                    (bucket === "promoter" && seg.sentiment === "Positive") ||
                    (bucket === "passive");
                if (matchesMood) list.push({ segment_text: text, faculty: fac });
            }
        }

        // Per-category × bucket breakdown.
        if (seg.category_id != null) {
            if (!catBucketByUnit.has(unitId)) catBucketByUnit.set(unitId, new Map());
            const bm = catBucketByUnit.get(unitId)!;
            if (!bm.has(seg.category_id)) bm.set(seg.category_id, {
                detractor: 0, passive: 0, promoter: 0, unknown: 0,
                detractorQuote: null, promoterQuote: null,
            });
            const cb = bm.get(seg.category_id)!;
            if (bucket === "detractor") {
                cb.detractor++;
                if (!cb.detractorQuote && hasUsableText && seg.sentiment === "Negative") cb.detractorQuote = { segment_text: text, faculty: fac };
            } else if (bucket === "passive") {
                cb.passive++;
            } else if (bucket === "promoter") {
                cb.promoter++;
                if (!cb.promoterQuote && hasUsableText && seg.sentiment === "Positive") cb.promoterQuote = { segment_text: text, faculty: fac };
            } else {
                cb.unknown++;
            }
        }

        // Legacy sample_quotes (kept for any caller still reading this field).
        if (qu.sample_quotes.length < 12 && hasUsableText) {
            qu.sample_quotes.push({
                sentiment: seg.sentiment,
                segment_text: text,
                faculty: fac,
            });
        }
    }

    // Fallback pass: if a bucket didn't fill to QUOTES_PER_BUCKET (e.g. all detractor quotes were too short
    // or sentiment didn't match), pad with any non-empty segment from that bucket.
    for (const seg of allSegs) {
        const unitId = inputIdToUnit.get(seg.raw_input_id);
        if (unitId === undefined) continue;
        const qu = qualByUnit.get(unitId);
        if (!qu) continue;
        const respId = inputIdToRespondent.get(seg.raw_input_id);
        if (respId === undefined) continue;
        const bucket = respondentBucket.get(`${unitId}::${respId}`);
        if (!bucket) continue;
        const text = seg.segment_text || "";
        if (text.length < MIN_QUOTE_LEN) continue;
        const list = qu.bucket_quotes[bucket];
        if (list.length >= QUOTES_PER_BUCKET) continue;
        const already = list.some(q => q.segment_text === text);
        if (already) continue;
        list.push({ segment_text: text, faculty: inputIdToFaculty.get(seg.raw_input_id) || "Unknown" });
    }

    // Finalize top categories (overall) and categories_by_bucket.
    for (const [unitId, cm] of catCountsByUnit) {
        const qu = qualByUnit.get(unitId);
        if (!qu) continue;
        qu.categories = Array.from(cm.entries())
            .map(([catId, counts]) => ({ category_name: catMap.get(catId) || `Category ${catId}`, ...counts }))
            .sort((a, b) => b.total - a.total)
            .slice(0, 10);

        const bm = catBucketByUnit.get(unitId);
        if (bm) {
            qu.categories_by_bucket = Array.from(bm.entries())
                .map(([catId, b]) => ({
                    category_name: catMap.get(catId) || `Category ${catId}`,
                    detractor: b.detractor,
                    passive: b.passive,
                    promoter: b.promoter,
                    unknown: b.unknown,
                    total: b.detractor + b.passive + b.promoter + b.unknown,
                    detractor_quote: b.detractorQuote,
                    promoter_quote: b.promoterQuote,
                }))
                .sort((a, b) => b.total - a.total)
                .slice(0, 12);
        }
    }

    // 6. Build response
    const unitsResult = Array.from(perUnitCol.values())
        .map(e => {
            const u = unitsMap.get(e.unitId);
            return {
                unit_id: e.unitId,
                unit_name: u?.name || `Unit ${e.unitId}`,
                unit_short_name: u?.short_name || null,
                unit_description: u?.description || null,
                column: e.column,
                nps_score: computeNpsScore(e),
                detractors: e.detractor,
                passives: e.passive,
                promoters: e.promoter,
                total: e.total,
            };
        })
        .sort((a, b) => a.unit_id - b.unit_id || a.column.localeCompare(b.column));

    const facultiesResult = Array.from(perFaculty.values())
        .map(e => {
            const u = unitsMap.get(e.unitId);
            return {
                unit_id: e.unitId,
                unit_name: u?.name || `Unit ${e.unitId}`,
                column: e.column,
                faculty: e.faculty,
                nps_score: computeNpsScore(e),
                detractors: e.detractor,
                passives: e.passive,
                promoters: e.promoter,
                total: e.total,
            };
        })
        .sort((a, b) => a.faculty.localeCompare(b.faculty) || a.unit_id - b.unit_id);

    const responsePayload = {
        units: unitsResult,
        faculties: facultiesResult,
        totals: {
            nps_score: computeNpsScore(totals),
            total: totals.total,
            detractors: totals.detractor,
            passives: totals.passive,
            promoters: totals.promoter,
        },
        qualitative: Array.from(qualByUnit.values()),
    };

    // Write to cache (fire-and-forget — don't block the response)
    supabase.from("survey_nps_cache")
        .upsert({ survey_id: sid, data: responsePayload, updated_at: new Date().toISOString() }, { onConflict: "survey_id" })
        .then(({ error }) => {
            if (error) console.error("[nps-cache] write error:", error.message);
            else console.log(`[nps-cache] cached survey ${sid}`);
        });

    return NextResponse.json(responsePayload);
}
