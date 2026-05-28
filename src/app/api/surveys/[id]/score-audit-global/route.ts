import { NextRequest, NextResponse } from "next/server";
import { supabaseServer as supabase } from "@/lib/supabase-server";

export const maxDuration = 120;

const CACHE_KEY = "score_audit_global";

// GET: return the previously computed result from survey_misc_cache (fast).
//      Returns { cached: null } if never computed.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const surveyId = parseInt(id);
    if (isNaN(surveyId)) return NextResponse.json({ error: "Invalid survey ID" }, { status: 400 });

    const { data } = await supabase
        .from("survey_misc_cache")
        .select("data, updated_at")
        .eq("survey_id", surveyId)
        .eq("cache_key", CACHE_KEY)
        .maybeSingle();

    return NextResponse.json({ cached: data ? { ...(data.data as object), computedAt: data.updated_at } : null });
}

// POST: run the full computation from raw data, persist to survey_misc_cache, return result.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const surveyId = parseInt(id);
    if (isNaN(surveyId)) return NextResponse.json({ error: "Invalid survey ID" }, { status: 400 });

    async function fetchAll<T = any>(queryFactory: () => any): Promise<T[]> {
        const PAGE = 1000;
        let all: T[] = [];
        let from = 0;
        while (true) {
            const { data, error } = await queryFactory().range(from, from + PAGE - 1);
            if (error) break;
            if (!data || data.length === 0) break;
            all = all.concat(data);
            if (data.length < PAGE) break;
            from += PAGE;
        }
        return all;
    }

    const [respList, colCacheRows] = await Promise.all([
        fetchAll(() => supabase.from("respondents").select("id, location").eq("survey_id", surveyId)),
        fetchAll(() => supabase.from("survey_column_cache").select("source_column, subgroup_name").eq("survey_id", surveyId)),
    ]);

    const subgroupByColumn = new Map<string, string | null>(
        (colCacheRows as any[]).map((r: any) => [r.source_column, r.subgroup_name ?? null])
    );
    const respIds = (respList as any[]).map((r: any) => r.id);

    type Row = { target_unit_id: number; source_column: string; numerical_score: number | null; score_rule: string | null; respondent_id: number };
    const allRows: Row[] = [];
    const RESP_CHUNK = 50, PARALLEL = 5, PAGE = 1000;

    const fetchChunk = async (chunk: number[]): Promise<Row[]> => {
        const out: Row[] = [];
        let from = 0;
        while (true) {
            const r = await supabase
                .from("raw_feedback_inputs")
                .select("target_unit_id, source_column, numerical_score, score_rule, respondent_id")
                .in("respondent_id", chunk)
                .eq("is_quantitative", true)
                .not("target_unit_id", "is", null)
                .range(from, from + PAGE - 1);
            if (r.error) break;
            const rows = (r.data || []) as Row[];
            out.push(...rows);
            if (rows.length < PAGE) break;
            from += PAGE;
        }
        return out;
    };

    for (let bStart = 0; bStart < respIds.length; bStart += RESP_CHUNK * PARALLEL) {
        const wave: Promise<Row[]>[] = [];
        for (let i = bStart; i < Math.min(bStart + RESP_CHUNK * PARALLEL, respIds.length); i += RESP_CHUNK) {
            wave.push(fetchChunk(respIds.slice(i, i + RESP_CHUNK)));
        }
        (await Promise.all(wave)).forEach(r => allRows.push(...r));
    }

    // Determine SSI-included columns per unit.
    const unitColMeta = new Map<number, Map<string, { max: number; score_rule: string | null }>>();
    for (const row of allRows) {
        if (row.numerical_score == null) continue;
        if (!unitColMeta.has(row.target_unit_id)) unitColMeta.set(row.target_unit_id, new Map());
        const cm = unitColMeta.get(row.target_unit_id)!;
        if (!cm.has(row.source_column)) cm.set(row.source_column, { max: 0, score_rule: row.score_rule });
        const e = cm.get(row.source_column)!;
        const s = Number(row.numerical_score);
        if (s > e.max) e.max = s;
    }
    const includedCols = new Map<number, Set<string>>();
    for (const [unitId, cm] of unitColMeta) {
        const set = new Set<string>();
        for (const [col, e] of cm) {
            if (e.score_rule === "NPS_0_10" || e.max <= 1 || e.max > 5) continue;
            set.add(col);
        }
        includedCols.set(unitId, set);
    }

    // Per-respondent bucket scores (subgroup-aware, mirrors full audit + SSI lib).
    const respBuckets = new Map<number, Map<number, Map<string, { sum: number; n: number }>>>();
    for (const row of allRows) {
        const score = row.numerical_score;
        if (score == null || isNaN(Number(score))) continue;
        const inc = includedCols.get(row.target_unit_id);
        if (!inc || !inc.has(row.source_column)) continue;
        const sub = subgroupByColumn.get(row.source_column) ?? null;
        const bucket = sub ?? `__col__::${row.source_column}`;
        if (!respBuckets.has(row.target_unit_id)) respBuckets.set(row.target_unit_id, new Map());
        const rm = respBuckets.get(row.target_unit_id)!;
        if (!rm.has(row.respondent_id)) rm.set(row.respondent_id, new Map());
        const bm = rm.get(row.respondent_id)!;
        if (!bm.has(bucket)) bm.set(bucket, { sum: 0, n: 0 });
        const b = bm.get(bucket)!;
        b.sum += Number(score); b.n++;
    }

    // Per-column averages per unit (for macro-across-columns).
    const unitColAccum = new Map<number, Map<string, { sum: number; n: number }>>();
    for (const row of allRows) {
        const score = row.numerical_score;
        if (score == null || isNaN(Number(score))) continue;
        const inc = includedCols.get(row.target_unit_id);
        if (!inc || !inc.has(row.source_column)) continue;
        if (!unitColAccum.has(row.target_unit_id)) unitColAccum.set(row.target_unit_id, new Map());
        const cm = unitColAccum.get(row.target_unit_id)!;
        if (!cm.has(row.source_column)) cm.set(row.source_column, { sum: 0, n: 0 });
        const c = cm.get(row.source_column)!;
        c.sum += Number(score); c.n++;
    }

    type UnitSummary = { respMacroSum: number; respMacroN: number; colSumOfAvgs: number; colCount: number };
    const unitSummaries = new Map<number, UnitSummary>();

    for (const [unitId, rm] of respBuckets) {
        if (!unitSummaries.has(unitId)) unitSummaries.set(unitId, { respMacroSum: 0, respMacroN: 0, colSumOfAvgs: 0, colCount: 0 });
        const us = unitSummaries.get(unitId)!;
        for (const [, bm] of rm) {
            let sumOfBucketAvgs = 0, bucketCount = 0;
            for (const [, b] of bm) {
                if (b.n === 0) continue;
                sumOfBucketAvgs += b.sum / b.n; bucketCount++;
            }
            if (bucketCount === 0) continue;
            us.respMacroSum += sumOfBucketAvgs / bucketCount;
            us.respMacroN++;
        }
    }
    for (const [unitId, cm] of unitColAccum) {
        if (!unitSummaries.has(unitId)) unitSummaries.set(unitId, { respMacroSum: 0, respMacroN: 0, colSumOfAvgs: 0, colCount: 0 });
        const us = unitSummaries.get(unitId)!;
        for (const [, c] of cm) {
            if (c.n === 0) continue;
            us.colSumOfAvgs += c.sum / c.n; us.colCount++;
        }
    }

    const respAvgs: number[] = [];
    let microSum = 0, microN = 0, colSumOfAvgs = 0, colCount = 0;
    for (const [, us] of unitSummaries) {
        if (us.respMacroN > 0) {
            const avg = us.respMacroSum / us.respMacroN;
            respAvgs.push(avg);
            microSum += avg * us.respMacroN; microN += us.respMacroN;
        }
        if (us.colCount > 0) { colSumOfAvgs += us.colSumOfAvgs; colCount += us.colCount; }
    }

    const result = {
        macro_units: respAvgs.length > 0 ? respAvgs.reduce((s, v) => s + v, 0) / respAvgs.length : null,
        micro_resp:  microN > 0 ? microSum / microN : null,
        macro_cols:  colCount > 0 ? colSumOfAvgs / colCount : null,
        unitCount:   respAvgs.length,
        totalRespondents: microN,
        totalCols:   colCount,
    };

    await supabase.from("survey_misc_cache").upsert(
        { survey_id: surveyId, cache_key: CACHE_KEY, data: result },
        { onConflict: "survey_id,cache_key" }
    );

    const { data: saved } = await supabase
        .from("survey_misc_cache")
        .select("updated_at")
        .eq("survey_id", surveyId)
        .eq("cache_key", CACHE_KEY)
        .maybeSingle();

    return NextResponse.json({ ...result, computedAt: saved?.updated_at ?? new Date().toISOString() });
}
