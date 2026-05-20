// Per-respondent macro SSI computation with subgroup-aware bucketing.
//
// Centralises the calculation so the Executive Report, Faculty Insights,
// Year Comparison, etc. all use the same methodology. The Google Sheet
// workflow this matches:
//
//   1. For each respondent in a unit, group their answered columns by subgroup
//      (columns sharing a subgroup_name roll up; unassigned columns each form
//      their own single-column bucket).
//   2. Bucket avg = mean of the respondent's answers in that bucket.
//   3. Respondent's unit score = mean of bucket avgs (each bucket equal weight).
//   4. Unit×campus SSI = mean of respondents' unit scores (each respondent equal weight).
//
// Higher-level aggregates (campus, faculty, global SSI) are macros across units —
// each unit contributes equally regardless of respondent count. This matches
// "macroaverage" semantics consistent with the per-unit calculation.

import { SupabaseClient } from "@supabase/supabase-js";

export type RawScoreRow = {
    target_unit_id: number;
    source_column: string;
    numerical_score: number;
    respondent_id: number;
};

export type RespondentUnitScore = {
    respondent_id: number;
    unit_id: number;
    score: number;
};

/**
 * Filter rows to SSI-eligible Likert columns. A column is SSI-included when
 * its max numerical_score is > 1 (excludes binary 0/1 yes-no columns) and
 * ≤ 5 (excludes scales beyond Likert like NPS 0-10).
 *
 * Returns per-unit Set of included source_column names.
 */
export function computeIncludedColumns(rows: RawScoreRow[]): Map<number, Set<string>> {
    const colMaxByUnit = new Map<number, Map<string, number>>();
    for (const r of rows) {
        if (!colMaxByUnit.has(r.target_unit_id)) colMaxByUnit.set(r.target_unit_id, new Map());
        const m = colMaxByUnit.get(r.target_unit_id)!;
        if (!m.has(r.source_column) || r.numerical_score > m.get(r.source_column)!) {
            m.set(r.source_column, r.numerical_score);
        }
    }
    const includedByUnit = new Map<number, Set<string>>();
    for (const [unitId, m] of colMaxByUnit) {
        const set = new Set<string>();
        for (const [col, max] of m) {
            if (max > 1 && max <= 5) set.add(col);
        }
        includedByUnit.set(unitId, set);
    }
    return includedByUnit;
}

/**
 * Compute one score per (respondent, unit) pair using subgroup-aware bucketing.
 *
 * The bucket key for a row is:
 *   - subgroupByColumn.get(source_column) if non-null (named subgroup)
 *   - `__col__::<source_column>` otherwise (each unassigned column is its own bucket)
 *
 * This means: a unit with no defined subgroups treats every column as its own
 * bucket, recovering the flat per-respondent macro that was the default before
 * subgroups existed. A unit like IT Department with subgroups ["Mobile App", "Wifi"]
 * will have just two buckets, so the 4 mobile-app columns count as one bucket
 * (averaged among themselves) instead of dominating against the single wifi column.
 */
export function computeRespondentUnitScores(
    rows: RawScoreRow[],
    subgroupByColumn: Map<string, string | null>,
    includedByUnit?: Map<number, Set<string>>,
): RespondentUnitScore[] {
    const included = includedByUnit ?? computeIncludedColumns(rows);

    // unitId → respondentId → bucket → { sum, n }
    const acc = new Map<number, Map<number, Map<string, { sum: number; n: number }>>>();
    for (const r of rows) {
        const set = included.get(r.target_unit_id);
        if (!set || !set.has(r.source_column)) continue;
        const sub = subgroupByColumn.get(r.source_column) ?? null;
        const bucket = sub ?? `__col__::${r.source_column}`;

        if (!acc.has(r.target_unit_id)) acc.set(r.target_unit_id, new Map());
        const respMap = acc.get(r.target_unit_id)!;
        if (!respMap.has(r.respondent_id)) respMap.set(r.respondent_id, new Map());
        const buckets = respMap.get(r.respondent_id)!;
        if (!buckets.has(bucket)) buckets.set(bucket, { sum: 0, n: 0 });
        const b = buckets.get(bucket)!;
        b.sum += r.numerical_score;
        b.n++;
    }

    const out: RespondentUnitScore[] = [];
    for (const [unitId, respMap] of acc) {
        for (const [respId, bucketMap] of respMap) {
            let sumOfBucketAvgs = 0;
            let bucketCount = 0;
            for (const [, b] of bucketMap) {
                if (b.n === 0) continue;
                sumOfBucketAvgs += b.sum / b.n;
                bucketCount++;
            }
            if (bucketCount === 0) continue;
            out.push({
                respondent_id: respId,
                unit_id: unitId,
                score: sumOfBucketAvgs / bucketCount,
            });
        }
    }
    return out;
}

/**
 * Paginated fetch of raw_feedback_inputs scoped to a list of respondent_ids.
 * Critical: Supabase silently caps each response at 1000 rows. With many score
 * columns per respondent, a single 50-respondent chunk can easily exceed that
 * — paginate every chunk until exhausted.
 *
 * Filters: is_quantitative=true, numerical_score IS NOT NULL, target_unit_id
 * IS NOT NULL, score_rule != 'NPS_0_10'.
 */
export async function fetchScoreRowsForRespondents(
    supabase: SupabaseClient,
    respIds: number[],
    options: { respChunk?: number; parallel?: number; pageSize?: number } = {},
): Promise<RawScoreRow[]> {
    const { respChunk = 50, parallel = 5, pageSize = 1000 } = options;
    const out: RawScoreRow[] = [];

    const fetchChunkAllPages = async (chunk: number[]): Promise<RawScoreRow[]> => {
        const acc: RawScoreRow[] = [];
        let from = 0;
        while (true) {
            const r = await supabase
                .from("raw_feedback_inputs")
                .select("target_unit_id, source_column, numerical_score, respondent_id")
                .in("respondent_id", chunk)
                .eq("is_quantitative", true)
                .not("numerical_score", "is", null)
                .not("target_unit_id", "is", null)
                .neq("score_rule", "NPS_0_10")
                .range(from, from + pageSize - 1);
            if (r.error) {
                console.error("[ssi] chunk error:", r.error.message);
                break;
            }
            const rows = (r.data || []) as RawScoreRow[];
            acc.push(...rows);
            if (rows.length < pageSize) break;
            from += pageSize;
        }
        return acc;
    };

    for (let bStart = 0; bStart < respIds.length; bStart += respChunk * parallel) {
        const wave: Promise<RawScoreRow[]>[] = [];
        for (let i = bStart; i < Math.min(bStart + respChunk * parallel, respIds.length); i += respChunk) {
            const chunk = respIds.slice(i, i + respChunk);
            wave.push(fetchChunkAllPages(chunk));
        }
        const results = await Promise.all(wave);
        for (const r of results) out.push(...r);
    }
    return out;
}

/**
 * Load per-column subgroup assignments from survey_column_cache for a survey.
 * Returns Map<source_column, subgroup_name | null>. Null = column is treated
 * as its own single-column bucket (default for units without subgroups).
 */
export async function loadSubgroupMap(
    supabase: SupabaseClient,
    surveyId: number,
): Promise<Map<string, string | null>> {
    const { data } = await supabase
        .from("survey_column_cache")
        .select("source_column, subgroup_name")
        .eq("survey_id", surveyId);
    return new Map<string, string | null>(
        (data || []).map((r: any) => [r.source_column, r.subgroup_name ?? null]),
    );
}

/**
 * Mean of a numeric array. Returns null when the array is empty.
 */
export function mean(values: number[]): number | null {
    if (values.length === 0) return null;
    let s = 0;
    for (const v of values) s += v;
    return s / values.length;
}
