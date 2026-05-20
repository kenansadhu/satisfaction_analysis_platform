import { NextRequest, NextResponse } from "next/server";
import { supabaseServer as supabase } from "@/lib/supabase-server";

export const maxDuration = 120;

// Per-(unit, campus, source_column) score statistics. Lets the user verify
// SSI calculations against a manual Google Sheet — exposes both the micro-average
// (every individual response weighted equally — what the app uses for SSI) and
// the macro-average (each question weighted equally — what some manual sheets compute).
//
// Returns:
//   units: [{
//     unit_id, unit_name, short_name,
//     columns: [{
//       source_column, max_score, included, // included=false if dropped (binary or NPS)
//       campus_stats: { [campus]: { n, sum, avg, distribution, na } },
//       total: { n, sum, avg, distribution, na }
//     }],
//     summary: {
//       per_campus: { [campus]: { micro_avg, macro_avg, n, columns_used } },
//       overall: { micro_avg, macro_avg, n, columns_used }
//     }
//   }]

type ColAccum = {
    sum: number;
    n: number;
    distribution: Record<string, number>; // score → count
    na: number; // raw_text present but numerical_score null
    max: number;
};

async function fetchAll<T = any>(queryFactory: () => any, label?: string): Promise<T[]> {
    const PAGE = 1000;
    let all: T[] = [];
    let from = 0;
    while (true) {
        const { data, error } = await queryFactory().range(from, from + PAGE - 1);
        if (error) {
            console.error(`[score-audit fetchAll${label ? ` ${label}` : ''}] error:`, error.message);
            break;
        }
        if (!data || data.length === 0) break;
        all = all.concat(data);
        if (data.length < PAGE) break;
        from += PAGE;
    }
    return all;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const surveyId = parseInt(id);
    if (isNaN(surveyId)) {
        return NextResponse.json({ error: "Invalid survey ID" }, { status: 400 });
    }

    // 1. Load survey, units, respondents, AND existing cache rows so we can compare
    // what the Report tab is displaying against what the raw data actually says.
    // Also load per-column subgroup assignments so we mirror the Report's roll-up.
    const [{ data: survey }, { data: allUnits }, respList, cachedScores, colCacheRows] = await Promise.all([
        supabase.from("surveys").select("id, title, year").eq("id", surveyId).single(),
        supabase.from("organization_units").select("id, name, short_name, score_subgroups").order("name"),
        fetchAll(() =>
            supabase.from("respondents").select("id, location").eq("survey_id", surveyId)
        ),
        fetchAll(() =>
            supabase.from("survey_quant_cache")
                .select("unit_id, campus, avg_score, score_count")
                .eq("survey_id", surveyId)
        ),
        fetchAll(() =>
            supabase.from("survey_column_cache")
                .select("source_column, subgroup_name")
                .eq("survey_id", surveyId)
        ),
    ]);

    // Map each source_column to its subgroup_name (NULL = treat as individual column).
    const subgroupByColumn = new Map<string, string | null>(
        (colCacheRows || []).map((r: any) => [r.source_column, r.subgroup_name ?? null])
    );

    // Build cache lookup: unitId → campus → { avg, count }
    const cacheLookup = new Map<number, Map<string, { avg: number; count: number }>>();
    for (const row of cachedScores) {
        if (!cacheLookup.has(row.unit_id)) cacheLookup.set(row.unit_id, new Map());
        cacheLookup.get(row.unit_id)!.set(row.campus, {
            avg: parseFloat(row.avg_score),
            count: row.score_count,
        });
    }

    if (!survey) return NextResponse.json({ error: "Survey not found" }, { status: 404 });

    const respLocationMap = new Map<number, string>();
    respList.forEach((r: any) => respLocationMap.set(r.id, r.location || "Unknown"));
    const respIds = respList.map((r: any) => r.id);

    // 2. Pull every quantitative raw_feedback_input.
    // CRITICAL: Supabase caps each response at 1000 rows. With ~16 units × multiple
    // score columns, even 50 respondents per chunk can exceed 1000 rows and get
    // silently truncated. Paginate within each chunk until exhausted, otherwise
    // the audit undercounts and the "Live" totals look smaller than the cache
    // (which uses an aggregated RPC and is unaffected by the row cap).
    type Row = {
        target_unit_id: number;
        source_column: string;
        numerical_score: number | null;
        score_rule: string | null;
        respondent_id: number;
    };
    const allRows: Row[] = [];
    const RESP_CHUNK = 50;
    const PARALLEL = 5;
    const PAGE = 1000;

    const fetchChunkAllPages = async (chunk: number[]): Promise<Row[]> => {
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
            if (r.error) {
                console.error("[score-audit chunk]", r.error.message);
                break;
            }
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
            const chunk = respIds.slice(i, i + RESP_CHUNK);
            wave.push(fetchChunkAllPages(chunk));
        }
        const results = await Promise.all(wave);
        for (const r of results) allRows.push(...r);
    }

    // 3. Bucket: unit → source_column → campus → ColAccum (and unit total)
    type CampusMap = Map<string, ColAccum>;
    type ColMap = Map<string, { campusMap: CampusMap; total: ColAccum; score_rule: string | null }>;
    const unitData = new Map<number, ColMap>();

    // For per-respondent macro: unit → respondent_id → { sum, n } across all
    // SSI-included columns for that unit. We finalize per-respondent avgs and
    // average them per campus later — this gives equal weight to every respondent
    // regardless of how many columns they answered. Common in Google Sheets that
    // aggregate per-row before per-column.
    const respUnitData = new Map<number, Map<number, { sum: number; n: number }>>();

    const emptyAccum = (): ColAccum => ({ sum: 0, n: 0, distribution: {}, na: 0, max: 0 });

    for (const row of allRows) {
        const unitId = row.target_unit_id;
        const campus = respLocationMap.get(row.respondent_id) || "Unknown";
        const col = row.source_column;

        if (!unitData.has(unitId)) unitData.set(unitId, new Map());
        const colMap = unitData.get(unitId)!;
        if (!colMap.has(col)) {
            colMap.set(col, { campusMap: new Map(), total: emptyAccum(), score_rule: row.score_rule });
        }
        const entry = colMap.get(col)!;
        if (!entry.campusMap.has(campus)) entry.campusMap.set(campus, emptyAccum());
        const camp = entry.campusMap.get(campus)!;

        const score = row.numerical_score;
        if (score == null || isNaN(Number(score))) {
            camp.na++;
            entry.total.na++;
            continue;
        }
        const s = Number(score);
        camp.sum += s;
        camp.n++;
        const key = String(s);
        camp.distribution[key] = (camp.distribution[key] || 0) + 1;
        if (s > camp.max) camp.max = s;

        entry.total.sum += s;
        entry.total.n++;
        entry.total.distribution[key] = (entry.total.distribution[key] || 0) + 1;
        if (s > entry.total.max) entry.total.max = s;
    }

    // 3b. Determine SSI-included columns per unit so we can build per-respondent
    // averages from a SECOND pass over allRows. A column is SSI-included if
    // max > 1, max <= 5, and score_rule != NPS_0_10 (matches the report route).
    const includedColsByUnit = new Map<number, Set<string>>();
    for (const [unitId, colMap] of unitData) {
        const set = new Set<string>();
        for (const [col, entry] of colMap) {
            const max = entry.total.max;
            if (entry.score_rule === "NPS_0_10") continue;
            if (max <= 1 || max > 5) continue;
            set.add(col);
        }
        includedColsByUnit.set(unitId, set);
    }

    // 3c. Second pass: build per-respondent unit accumulators using only
    // SSI-included columns, bucketed by subgroup_name (unassigned columns each
    // form their own bucket keyed by source_column, matching the Report's
    // flat-per-respondent-macro behavior for units without subgroups).
    // Two-stage shape per (unit, respondent): bucket → { sum, n } across that
    // bucket's columns. We finalize per-respondent avg = avg(bucket_avgs).
    const respBuckets = new Map<number, Map<number, Map<string, { sum: number; n: number }>>>();
    for (const row of allRows) {
        const score = row.numerical_score;
        if (score == null || isNaN(Number(score))) continue;
        const included = includedColsByUnit.get(row.target_unit_id);
        if (!included || !included.has(row.source_column)) continue;
        const subgroup = subgroupByColumn.get(row.source_column) ?? null;
        const bucket = subgroup ?? `__col__::${row.source_column}`;

        if (!respBuckets.has(row.target_unit_id)) respBuckets.set(row.target_unit_id, new Map());
        const respMap = respBuckets.get(row.target_unit_id)!;
        if (!respMap.has(row.respondent_id)) respMap.set(row.respondent_id, new Map());
        const bucketMap = respMap.get(row.respondent_id)!;
        if (!bucketMap.has(bucket)) bucketMap.set(bucket, { sum: 0, n: 0 });
        const b = bucketMap.get(bucket)!;
        b.sum += Number(score);
        b.n++;
    }

    // Collapse each respondent's buckets → one (sum, n=1) per respondent where
    // sum = avg(bucket_avgs). This way the downstream resp-macro computation
    // (sum/n then avg across respondents) naturally yields the subgroup-aware
    // SSI value.
    for (const [unitId, respMap] of respBuckets) {
        if (!respUnitData.has(unitId)) respUnitData.set(unitId, new Map());
        const out = respUnitData.get(unitId)!;
        for (const [respId, bucketMap] of respMap) {
            let sumOfBucketAvgs = 0;
            let bucketCount = 0;
            for (const [, b] of bucketMap) {
                if (b.n === 0) continue;
                sumOfBucketAvgs += b.sum / b.n;
                bucketCount++;
            }
            if (bucketCount === 0) continue;
            out.set(respId, { sum: sumOfBucketAvgs / bucketCount, n: 1 });
        }
    }

    // 4. Build response per unit. A column is "included" in SSI if it's Likert
    // (1 < max <= 5) AND not NPS_0_10 — mirrors the report route's filter logic.
    const unitsOut = (allUnits || []).map((u: any) => {
        const colMap = unitData.get(u.id);
        if (!colMap || colMap.size === 0) {
            return {
                unit_id: u.id,
                unit_name: u.name,
                short_name: u.short_name,
                columns: [],
                summary: { per_campus: {}, overall: { micro_avg: null, macro_avg: null, n: 0, columns_used: 0 } },
            };
        }

        const columns: any[] = [];
        // For each (campus): tracking micro (sum/n total) and macro (sum of column avgs / # cols with data)
        const campusMicro = new Map<string, { sum: number; n: number }>();
        const campusMacro = new Map<string, { sumOfAvgs: number; cols: number }>();
        // Overall (across all campuses)
        let overallMicroSum = 0, overallMicroN = 0;
        let overallMacroSumOfAvgs = 0, overallMacroCols = 0;
        const allCampusKeys = new Set<string>();

        for (const [col, entry] of colMap) {
            const isNps = entry.score_rule === "NPS_0_10";
            const maxScore = entry.total.max;
            const includedInSsi = !isNps && maxScore > 1 && maxScore <= 5;

            const campusStatsOut: Record<string, any> = {};
            for (const [campus, acc] of entry.campusMap) {
                allCampusKeys.add(campus);
                const avg = acc.n > 0 ? acc.sum / acc.n : null;
                campusStatsOut[campus] = {
                    n: acc.n,
                    sum: acc.sum,
                    avg: avg !== null ? parseFloat(avg.toFixed(10)) : null,
                    distribution: acc.distribution,
                    na: acc.na,
                };
                if (includedInSsi && acc.n > 0 && avg !== null) {
                    if (!campusMicro.has(campus)) campusMicro.set(campus, { sum: 0, n: 0 });
                    campusMicro.get(campus)!.sum += acc.sum;
                    campusMicro.get(campus)!.n += acc.n;
                    if (!campusMacro.has(campus)) campusMacro.set(campus, { sumOfAvgs: 0, cols: 0 });
                    campusMacro.get(campus)!.sumOfAvgs += avg;
                    campusMacro.get(campus)!.cols++;
                }
            }

            const totalAvg = entry.total.n > 0 ? entry.total.sum / entry.total.n : null;
            if (includedInSsi && entry.total.n > 0 && totalAvg !== null) {
                overallMicroSum += entry.total.sum;
                overallMicroN += entry.total.n;
                overallMacroSumOfAvgs += totalAvg;
                overallMacroCols++;
            }

            columns.push({
                source_column: col,
                score_rule: entry.score_rule,
                max_score: maxScore,
                included_in_ssi: includedInSsi,
                subgroup_name: subgroupByColumn.get(col) ?? null,
                exclusion_reason: includedInSsi
                    ? null
                    : isNps
                        ? "NPS (0-10)"
                        : maxScore <= 1
                            ? "Binary / max <= 1"
                            : "Max score > 5",
                campus_stats: campusStatsOut,
                total: {
                    n: entry.total.n,
                    sum: entry.total.sum,
                    avg: totalAvg !== null ? parseFloat(totalAvg.toFixed(10)) : null,
                    distribution: entry.total.distribution,
                    na: entry.total.na,
                },
            });
        }

        // Per-respondent macro: avg of (per-respondent avg over included cols).
        // Group respondents by their campus, then average their personal avgs.
        const respMap = respUnitData.get(u.id);
        const respMacroByCampus = new Map<string, { sumOfRespAvgs: number; respCount: number }>();
        let overallRespMacroSum = 0, overallRespMacroCount = 0;
        if (respMap) {
            for (const [respId, r] of respMap) {
                if (r.n === 0) continue;
                const respAvg = r.sum / r.n;
                const campus = respLocationMap.get(respId) || "Unknown";
                if (!respMacroByCampus.has(campus)) respMacroByCampus.set(campus, { sumOfRespAvgs: 0, respCount: 0 });
                const c = respMacroByCampus.get(campus)!;
                c.sumOfRespAvgs += respAvg;
                c.respCount++;
                overallRespMacroSum += respAvg;
                overallRespMacroCount++;
            }
        }

        // What the Report's cache currently stores for this unit — drives the
        // numbers shown on the Executive Report. Compute a cache-based overall
        // (sum(cached_avg × cached_count) / sum(cached_count)) so the user can
        // see exactly what the Report tab is averaging.
        const unitCache = cacheLookup.get(u.id);
        const perCampusOut: Record<string, any> = {};
        let cacheOverallSum = 0;
        let cacheOverallN = 0;
        for (const campus of allCampusKeys) {
            const micro = campusMicro.get(campus);
            const macro = campusMacro.get(campus);
            const respMc = respMacroByCampus.get(campus);
            const cached = unitCache?.get(campus);
            if (cached && cached.count > 0) {
                cacheOverallSum += cached.avg * cached.count;
                cacheOverallN += cached.count;
            }
            perCampusOut[campus] = {
                micro_avg: micro && micro.n > 0 ? parseFloat((micro.sum / micro.n).toFixed(10)) : null,
                macro_avg: macro && macro.cols > 0 ? parseFloat((macro.sumOfAvgs / macro.cols).toFixed(10)) : null,
                resp_macro_avg: respMc && respMc.respCount > 0 ? parseFloat((respMc.sumOfRespAvgs / respMc.respCount).toFixed(10)) : null,
                resp_macro_n: respMc?.respCount ?? 0,
                cache_avg: cached ? parseFloat(cached.avg.toFixed(10)) : null,
                cache_n: cached?.count ?? null,
                n: micro?.n || 0,
                columns_used: macro?.cols || 0,
            };
        }
        // Also include any cache campus rows that have no raw data (sanity check).
        if (unitCache) {
            for (const [campus, cached] of unitCache) {
                if (perCampusOut[campus]) continue;
                if (cached.count > 0) {
                    cacheOverallSum += cached.avg * cached.count;
                    cacheOverallN += cached.count;
                }
                perCampusOut[campus] = {
                    micro_avg: null,
                    macro_avg: null,
                    resp_macro_avg: null,
                    resp_macro_n: 0,
                    cache_avg: parseFloat(cached.avg.toFixed(10)),
                    cache_n: cached.count,
                    n: 0,
                    columns_used: 0,
                };
            }
        }

        return {
            unit_id: u.id,
            unit_name: u.name,
            short_name: u.short_name,
            columns: columns.sort((a, b) => a.source_column.localeCompare(b.source_column)),
            summary: {
                per_campus: perCampusOut,
                overall: {
                    micro_avg: overallMicroN > 0 ? parseFloat((overallMicroSum / overallMicroN).toFixed(10)) : null,
                    macro_avg: overallMacroCols > 0 ? parseFloat((overallMacroSumOfAvgs / overallMacroCols).toFixed(10)) : null,
                    resp_macro_avg: overallRespMacroCount > 0 ? parseFloat((overallRespMacroSum / overallRespMacroCount).toFixed(10)) : null,
                    resp_macro_n: overallRespMacroCount,
                    cache_avg: cacheOverallN > 0 ? parseFloat((cacheOverallSum / cacheOverallN).toFixed(10)) : null,
                    cache_n: cacheOverallN,
                    n: overallMicroN,
                    columns_used: overallMacroCols,
                },
            },
        };
    }).filter(u => u.columns.length > 0);

    const allCampuses = Array.from(new Set(respList.map((r: any) => r.location || "Unknown")));

    return NextResponse.json({
        survey,
        campuses: allCampuses,
        units: unitsOut,
    });
}
