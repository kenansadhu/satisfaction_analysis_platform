import { NextRequest, NextResponse } from "next/server";
import { supabaseServer as supabase } from "@/lib/supabase-server";
import { parseSettingArray } from "@/lib/platformSettings";

export const maxDuration = 300;

// Helper: paginate through all rows (Supabase default limit = 1000)
async function fetchAll(queryFactory: () => any, label?: string): Promise<any[]> {
    const PAGE = 1000;
    let all: any[] = [];
    let from = 0;
    while (true) {
        const { data, error } = await queryFactory().range(from, from + PAGE - 1);
        if (error) {
            console.error(`[fetchAll${label ? ` ${label}` : ''}] error:`, error.message);
            break;
        }
        if (!data || data.length === 0) break;
        all = all.concat(data);
        if (data.length < PAGE) break;
        from += PAGE;
    }
    return all;
}

export async function GET(req: NextRequest) {
    const surveyId = req.nextUrl.searchParams.get("surveyId");
    if (!surveyId) {
        return NextResponse.json({ error: "surveyId required" }, { status: 400 });
    }

    // 0. Load excluded-units + NPS-units settings (parallel)
    const [excludedSettingRes, npsSettingRes] = await Promise.all([
        supabase.from("platform_settings").select("value").eq("key", "excluded_score_unit_ids").maybeSingle(),
        supabase.from("platform_settings").select("value").eq("key", "nps_unit_ids").maybeSingle(),
    ]);
    const excludedUnitIds: number[] = parseSettingArray<number>(excludedSettingRes.data?.value);
    // NPS units are hidden from cross-unit views (Report tab, sentiment heatmap, etc.).
    // They appear in the dedicated NPS tab instead.
    const npsUnitIds = new Set<number>(parseSettingArray<number>(npsSettingRes.data?.value));

    // 1. Survey info
    const { data: survey } = await supabase
        .from('surveys')
        .select('id, title, year, description')
        .eq('id', surveyId)
        .single();

    if (!survey) {
        return NextResponse.json({ error: "Survey not found" }, { status: 404 });
    }

    // 2. Respondents (paginated — 8k+ rows, but only ~9 pages)
    const respList = await fetchAll(() =>
        supabase.from('respondents').select('id, location, faculty, study_program').eq('survey_id', surveyId)
    );

    // Campus participation
    const campusMap = new Map<string, number>();
    respList.forEach(r => {
        const loc = r.location || "Unknown";
        campusMap.set(loc, (campusMap.get(loc) || 0) + 1);
    });
    const campusParticipation = Array.from(campusMap.entries())
        .map(([campus, count]) => ({ campus, respondents: count }))
        .sort((a, b) => b.respondents - a.respondents);

    // Prodi participation — grouped by campus + study_program to avoid collisions
    // across campuses with identically-named programs (e.g. "S1 Informatika" at two campuses)
    const prodiMap = new Map<string, { campus: string; prodi: string; respondents: number }>();
    respList.forEach(r => {
        const campus = r.location || "Unknown";
        const prodi = r.study_program || "Unknown";
        const key = `${campus}|||${prodi}`;
        if (!prodiMap.has(key)) prodiMap.set(key, { campus, prodi, respondents: 0 });
        prodiMap.get(key)!.respondents++;
    });
    const prodiParticipation = Array.from(prodiMap.values())
        .sort((a, b) => b.respondents - a.respondents);

    // 3. Prodi enrollment (for response rate per study program)
    const { data: prodiEnroll } = await supabase
        .from('prodi_enrollment')
        .select('study_program, faculty, student_count, location')
        .eq('survey_id', parseInt(surveyId));

    // Key by campus + study_program so same-named programs at different campuses match correctly
    const prodiEnrollMap = new Map((prodiEnroll || []).map(e => [
        `${e.location || 'Unknown'}|||${e.study_program}`, e
    ]));
    const totalEnrolled = (prodiEnroll || []).reduce((sum: number, e: any) => sum + (e.student_count || 0), 0);

    const prodiParticipationEnriched = prodiParticipation.map(pp => {
        const key = `${pp.campus}|||${pp.prodi}`;
        const enrollment = prodiEnrollMap.get(key);
        return {
            ...pp,
            faculty: enrollment?.faculty || null,
            enrolled: enrollment?.student_count || null,
            response_rate: enrollment?.student_count ? parseFloat((pp.respondents / enrollment.student_count * 100).toFixed(1)) : null,
        };
    });

    // 4. Organization units — drop NPS units from the cross-unit report scope.
    const { data: allUnits } = await supabase
        .from('organization_units')
        .select('id, name, short_name')
        .order('name');
    const units = (allUnits || []).filter(u => !npsUnitIds.has(u.id));

    // 5. Aggregated data
    // 5a. Quantitative scores — with lazy caching (scores are immutable after import)
    const respIds = respList.map((r: any) => r.id);
    const respLocationMap = new Map<number, string>();
    respList.forEach((r: any) => respLocationMap.set(r.id, r.location || "Unknown"));

    type ScoreEntry = { avg: number; count: number };
    const unitScores = new Map<number, Map<string, ScoreEntry>>();
    const unitOverall = new Map<number, { sum: number; count: number }>();
    const campusScoreAccum = new Map<string, { avg: number; count: number }>();

    // Try cache first (paginated — cache grows with units × campuses)
    const cachedScores = await fetchAll(() =>
        supabase.from('survey_quant_cache')
            .select('unit_id, campus, avg_score, score_count')
            .eq('survey_id', parseInt(surveyId))
    );

    if (cachedScores.length > 0) {
        // Cache hit — populate maps from cache (~40-60 rows, instant)
        for (const row of cachedScores) {
            const unitId = row.unit_id;
            const campus = row.campus;
            const avg = parseFloat(row.avg_score);
            const count = row.score_count;

            if (!unitScores.has(unitId)) unitScores.set(unitId, new Map());
            unitScores.get(unitId)!.set(campus, { avg, count });
            campusScoreAccum.set(`${unitId}__${campus}`, { avg, count });

            if (!unitOverall.has(unitId)) unitOverall.set(unitId, { sum: 0, count: 0 });
            const overall = unitOverall.get(unitId)!;
            overall.sum += avg * count;
            overall.count += count;
        }
    } else {
        // Cache miss — recompute from raw_feedback_inputs and store per-respondent
        // macro averages with optional subgroup roll-up. This matches the Google
        // Sheet workflow: compute each respondent's average per subgroup, then
        // average their subgroup-averages, then average across respondents.
        //
        // Subgroup behavior:
        //   - Columns without a subgroup_name are treated as their own single-column
        //     subgroup (keyed by source_column). For units that haven't defined any
        //     subgroups, this is mathematically identical to flat per-respondent
        //     macro — every individual column contributes equally to a respondent's
        //     unit score. This preserves prior behavior.
        //   - Columns assigned to a named subgroup roll up: a respondent's
        //     subgroup score = avg of their answers to that subgroup's columns,
        //     and the named subgroup counts as ONE bucket no matter how many
        //     columns it contains.
        //
        // Example — IT Department with score_subgroups=["Mobile App"], 4 mobile
        // columns assigned to "Mobile App" and 1 wifi column left unassigned:
        //   Per respondent: their_score = avg(avg(mobile_cols_they_answered), wifi_answer)
        //   Unit×campus SSI = avg of those per-respondent scores
        //
        // Stored shape (cache schema unchanged):
        //   avg_score   = per-respondent macro for (unit, campus)
        //   score_count = number of respondents who contributed ≥1 SSI-included answer

        // Load per-column subgroup assignments from survey_column_cache. NULL means
        // "treat as individual column" (the column becomes its own subgroup keyed by
        // source_column). The Manage UI and import flow write to this same table.
        const { data: colCacheRows } = await supabase
            .from('survey_column_cache')
            .select('source_column, subgroup_name')
            .eq('survey_id', parseInt(surveyId));
        const subgroupByColumn = new Map<string, string | null>(
            (colCacheRows || []).map((r: any) => [r.source_column, r.subgroup_name ?? null])
        );

        // unitId → sourceColumn → max numerical_score (to identify SSI-included cols)
        const colMaxByUnit = new Map<number, Map<string, number>>();
        // unitId → campus → respondentId → { sum, n } over SSI-included cols
        // (we keep this raw and finalise after determining included cols below)
        type RowLite = { target_unit_id: number; source_column: string; numerical_score: number; respondent_id: number };
        const rows: RowLite[] = [];

        // CRITICAL: Supabase caps each response at 1000 rows. With 16+ units and
        // 5–10+ score columns each, 50 respondents per chunk easily exceeds 1000
        // rows and gets silently truncated. Paginate each chunk until exhausted.
        const RESP_CHUNK = 50;
        const PARALLEL = 5;
        const RAW_PAGE = 1000;

        const fetchChunkAllPages = async (chunk: number[]): Promise<{ data: any[]; error: any }> => {
            const out: any[] = [];
            let from = 0;
            while (true) {
                const r = await supabase
                    .from('raw_feedback_inputs')
                    .select('target_unit_id, source_column, numerical_score, respondent_id')
                    .in('respondent_id', chunk)
                    .eq('is_quantitative', true)
                    .not('numerical_score', 'is', null)
                    .not('target_unit_id', 'is', null)
                    .neq('score_rule', 'NPS_0_10')
                    .range(from, from + RAW_PAGE - 1);
                if (r.error) return { data: out, error: r.error };
                const page = r.data || [];
                out.push(...page);
                if (page.length < RAW_PAGE) break;
                from += RAW_PAGE;
            }
            return { data: out, error: null };
        };

        for (let bStart = 0; bStart < respIds.length; bStart += RESP_CHUNK * PARALLEL) {
            const wave: Promise<{ data: any[]; error: any }>[] = [];
            for (let i = bStart; i < Math.min(bStart + RESP_CHUNK * PARALLEL, respIds.length); i += RESP_CHUNK) {
                const chunk = respIds.slice(i, i + RESP_CHUNK);
                wave.push(fetchChunkAllPages(chunk));
            }
            const results = await Promise.all(wave);

            for (const res of results) {
                if (res.error) {
                    console.error('[quant rebuild] chunk error:', res.error.message);
                    continue;
                }
                for (const row of (res.data || [])) {
                    const unitId = row.target_unit_id as number;
                    const col = row.source_column as string;
                    const score = parseFloat(row.numerical_score);
                    if (isNaN(score)) continue;

                    // Track per-column max so we can drop binary (≤1) and out-of-range (>5)
                    // columns from the SSI calculation. NPS (0–10) is already filtered at SQL.
                    if (!colMaxByUnit.has(unitId)) colMaxByUnit.set(unitId, new Map());
                    const colMap = colMaxByUnit.get(unitId)!;
                    if (!colMap.has(col) || score > colMap.get(col)!) colMap.set(col, score);

                    rows.push({ target_unit_id: unitId, source_column: col, numerical_score: score, respondent_id: row.respondent_id });
                }
            }
        }

        // Determine SSI-included columns per unit (Likert 1 < max ≤ 5)
        const includedColsByUnit = new Map<number, Set<string>>();
        for (const [unitId, colMap] of colMaxByUnit) {
            const set = new Set<string>();
            for (const [col, max] of colMap) {
                if (max > 1 && max <= 5) set.add(col);
            }
            includedColsByUnit.set(unitId, set);
        }

        // Build per-(unit, campus, respondent, subgroupBucket) accumulators from
        // included cols only. The bucket key is the column's subgroup_name when set,
        // otherwise the source_column itself — so unassigned columns each form a
        // single-column bucket (preserving flat per-respondent macro semantics).
        const respAccum = new Map<number, Map<string, Map<number, Map<string, { sum: number; n: number }>>>>();
        for (const row of rows) {
            const included = includedColsByUnit.get(row.target_unit_id);
            if (!included || !included.has(row.source_column)) continue;
            const campus = respLocationMap.get(row.respondent_id) || 'Unknown';
            const subgroup = subgroupByColumn.get(row.source_column) ?? null;
            const bucket = subgroup ?? `__col__::${row.source_column}`;

            if (!respAccum.has(row.target_unit_id)) respAccum.set(row.target_unit_id, new Map());
            const campusMap = respAccum.get(row.target_unit_id)!;
            if (!campusMap.has(campus)) campusMap.set(campus, new Map());
            const respMap = campusMap.get(campus)!;
            if (!respMap.has(row.respondent_id)) respMap.set(row.respondent_id, new Map());
            const bucketMap = respMap.get(row.respondent_id)!;
            if (!bucketMap.has(bucket)) bucketMap.set(bucket, { sum: 0, n: 0 });
            const e = bucketMap.get(bucket)!;
            e.sum += row.numerical_score;
            e.n++;
        }

        // Aggregate per (unit, campus):
        //   per respondent: avg(bucket_avgs) — each bucket weighted equally
        //   per (unit, campus): avg of those per-respondent values
        for (const [unitId, campusMap] of respAccum) {
            if (!unitScores.has(unitId)) unitScores.set(unitId, new Map());
            if (!unitOverall.has(unitId)) unitOverall.set(unitId, { sum: 0, count: 0 });
            for (const [campus, respMap] of campusMap) {
                let sumOfRespAvgs = 0;
                let respCount = 0;
                for (const [, bucketMap] of respMap) {
                    let sumOfBucketAvgs = 0;
                    let bucketCount = 0;
                    for (const [, b] of bucketMap) {
                        if (b.n === 0) continue;
                        sumOfBucketAvgs += b.sum / b.n;
                        bucketCount++;
                    }
                    if (bucketCount === 0) continue;
                    sumOfRespAvgs += sumOfBucketAvgs / bucketCount;
                    respCount++;
                }
                if (respCount === 0) continue;
                const avg = sumOfRespAvgs / respCount;
                unitScores.get(unitId)!.set(campus, { avg, count: respCount });
                campusScoreAccum.set(`${unitId}__${campus}`, { avg, count: respCount });
                // Unit overall (across campuses): respondent-weighted average of
                // per-campus resp-macros = global per-respondent macro for this unit.
                const overall = unitOverall.get(unitId)!;
                overall.sum += avg * respCount;
                overall.count += respCount;
            }
        }

        // Store to cache (fire-and-forget, don't block response)
        const cacheRows: any[] = [];
        for (const [unitId, campusMap] of unitScores) {
            for (const [campus, entry] of campusMap) {
                cacheRows.push({
                    survey_id: parseInt(surveyId),
                    unit_id: unitId,
                    campus,
                    avg_score: parseFloat(entry.avg.toFixed(3)),
                    score_count: entry.count,
                });
            }
        }
        if (cacheRows.length > 0) {
            supabase.from('survey_quant_cache')
                .upsert(cacheRows, { onConflict: 'survey_id,unit_id,campus' })
                .then(({ error }) => {
                    if (error) console.error('[cache] write error:', error.message);
                });
        }
    }

    // 5b. Qualitative summary: COUNT grouped by unit × category × sentiment (~200 rows).
    // Check misc cache first — avoids the statement timeout on free-tier Supabase.
    // Cache is shared with unit-qual-summary route (same key), so whichever warms first benefits both.
    // Fallback chain: misc cache → RPC → ai_dataset_cache (populated by Rebuild Cache flow).
    let qualAgg: any[] | null = null;
    const qualCacheKey = "qual_summary";
    const { data: qualCached, error: qualCacheErr } = await supabase
        .from("survey_misc_cache")
        .select("data")
        .eq("survey_id", parseInt(surveyId))
        .eq("cache_key", qualCacheKey)
        .maybeSingle();

    if (!qualCacheErr && qualCached?.data) {
        console.log(`[qual] Cache hit: survey ${surveyId}`);
        qualAgg = (qualCached.data as any).rows || [];
    } else {
        const { data, error: qualErr } = await supabase.rpc('get_qual_summary_by_unit', {
            p_survey_id: parseInt(surveyId),
        });
        if (qualErr) {
            console.error('[qual RPC] error:', qualErr.message);
        } else {
            qualAgg = data;
            if (data?.length > 0) {
                supabase.from("survey_misc_cache")
                    .upsert(
                        { survey_id: parseInt(surveyId), cache_key: qualCacheKey, data: { rows: data }, updated_at: new Date().toISOString() },
                        { onConflict: "survey_id,cache_key" }
                    )
                    .then(({ error: writeErr }) => {
                        if (writeErr) console.error("[qual-cache] write error:", writeErr.message);
                        else console.log(`[qual-cache] cached survey ${surveyId}`);
                    });
            }
        }
    }

    // 6. Categories lookup
    const { data: categories } = await supabase
        .from('analysis_categories')
        .select('id, name, unit_id');

    const catMap = new Map((categories || []).map(c => [c.id, c]));

    // Build qualitative data from RPC result
    type QualData = {
        positive: number;
        negative: number;
        neutral: number;
        suggestions: number;
        total: number;
        categories: Map<string, { positive: number; negative: number; neutral: number }>;
    };
    const unitQualData = new Map<number, QualData>();

    for (const row of (qualAgg || [])) {
        const unitId = row.target_unit_id;
        if (unitId == null) continue;
        if (npsUnitIds.has(unitId)) continue; // NPS units are reported separately
        const cnt = parseInt(row.cnt);

        if (!unitQualData.has(unitId)) {
            unitQualData.set(unitId, {
                positive: 0, negative: 0, neutral: 0, suggestions: 0, total: 0,
                categories: new Map(),
            });
        }
        const data = unitQualData.get(unitId)!;
        data.total += cnt;
        if (row.sentiment === "Positive") data.positive += cnt;
        else if (row.sentiment === "Negative") data.negative += cnt;
        else data.neutral += cnt;
        if (row.is_suggestion) data.suggestions += cnt;

        // Category breakdown
        const cat = catMap.get(row.category_id);
        if (cat) {
            if (!data.categories.has(cat.name)) {
                data.categories.set(cat.name, { positive: 0, negative: 0, neutral: 0 });
            }
            const catData = data.categories.get(cat.name)!;
            if (row.sentiment === "Positive") catData.positive += cnt;
            else if (row.sentiment === "Negative") catData.negative += cnt;
            else catData.neutral += cnt;
        }
    }

    // Qual fallback — if the RPC failed or returned nothing, reconstruct unitQualData from
    // the survey's ai_dataset_cache. The cache shape stores per-unit totals plus
    // `category_<sanitized>`/`category_<sanitized>_pos`/`_neg` flat fields for each category.
    if (unitQualData.size === 0) {
        const { data: surveyCacheRow } = await supabase
            .from('surveys')
            .select('ai_dataset_cache')
            .eq('id', parseInt(surveyId))
            .single();
        const cache = (surveyCacheRow as any)?.ai_dataset_cache;
        if (cache?.v === 2 && Array.isArray(cache.units)) {
            // Build a reverse map from sanitized-key → category name so we can decode flatCategories.
            const sanitizedToName = new Map<string, string>();
            for (const c of (categories || [])) {
                sanitizedToName.set((c as any).name.replace(/[^a-zA-Z0-9]/g, '_'), (c as any).name);
            }
            for (const u of cache.units as any[]) {
                if (typeof u.unit_id !== 'number' || (u.total_segments || 0) === 0) continue;
                const total = u.total_segments || 0;
                const pos = u.positive || 0;
                const neg = u.negative || 0;
                const neu = Math.max(0, total - pos - neg);
                const data: QualData = {
                    positive: pos, negative: neg, neutral: neu,
                    suggestions: 0, // cache doesn't store the is_suggestion count separately
                    total,
                    categories: new Map(),
                };
                for (const [key, val] of Object.entries(u)) {
                    if (!key.startsWith('category_')) continue;
                    if (key.endsWith('_pos') || key.endsWith('_neg')) continue;
                    const sanitized = key.substring('category_'.length);
                    const name = sanitizedToName.get(sanitized) || sanitized;
                    const catTotal = (val as number) || 0;
                    if (catTotal === 0) continue;
                    const catPos = (u[`${key}_pos`] as number) || 0;
                    const catNeg = (u[`${key}_neg`] as number) || 0;
                    const catNeu = Math.max(0, catTotal - catPos - catNeg);
                    data.categories.set(name, { positive: catPos, negative: catNeg, neutral: catNeu });
                }
                unitQualData.set(u.unit_id, data);
            }
        }
    }

    // Build response
    const allCampuses = [...new Set(campusParticipation.map(c => c.campus))];

    const unitReports = (units || []).map(unit => {
        const overallEntry = unitOverall.get(unit.id);
        const campusEntries = unitScores.get(unit.id);
        const qualData = unitQualData.get(unit.id);

        const campusBreakdown = allCampuses.map(campus => {
            const entry = campusEntries?.get(campus);
            return {
                campus,
                average: entry ? parseFloat(entry.avg.toFixed(2)) : null,
                count: entry?.count || 0,
            };
        });

        const categoryBreakdown = qualData
            ? Array.from(qualData.categories.entries())
                .map(([name, counts]) => ({
                    name,
                    positive: counts.positive,
                    negative: counts.negative,
                    neutral: counts.neutral,
                    total: counts.positive + counts.negative + counts.neutral,
                }))
                .sort((a, b) => b.total - a.total)
            : [];

        return {
            unit_id: unit.id,
            unit_name: unit.name,
            short_name: unit.short_name,
            satisfaction_index: overallEntry
                ? parseFloat((overallEntry.sum / overallEntry.count).toFixed(2))
                : null,
            score_count: overallEntry?.count || 0,
            campus_scores: campusBreakdown,
            qualitative: qualData ? {
                total: qualData.total,
                positive: qualData.positive,
                negative: qualData.negative,
                neutral: qualData.neutral,
                suggestions: qualData.suggestions,
                positive_pct: qualData.total > 0 ? parseFloat((qualData.positive / qualData.total * 100).toFixed(1)) : 0,
                negative_pct: qualData.total > 0 ? parseFloat((qualData.negative / qualData.total * 100).toFixed(1)) : 0,
                categories: categoryBreakdown,
            } : null,
        };
    }).filter(u => !excludedUnitIds.includes(u.unit_id) && (u.satisfaction_index !== null || (u.qualitative && u.qualitative.total > 0)));

    // Global satisfaction index — excludes opted-out units
    let globalSum = 0, globalCount = 0;
    for (const [unitId, entry] of unitOverall.entries()) {
        if (excludedUnitIds.includes(unitId)) continue;
        globalSum += entry.sum;
        globalCount += entry.count;
    }

    // Per-campus satisfaction index — excludes opted-out units
    const campusSatMap = new Map<string, { sum: number; count: number }>();
    for (const [key, acc] of campusScoreAccum) {
        const [unitIdStr, campus] = key.split('__');
        if (excludedUnitIds.includes(parseInt(unitIdStr))) continue;
        if (!campusSatMap.has(campus)) campusSatMap.set(campus, { sum: 0, count: 0 });
        const entry = campusSatMap.get(campus)!;
        entry.sum += acc.avg * acc.count;
        entry.count += acc.count;
    }
    const campusSatisfaction = Array.from(campusSatMap.entries()).map(([campus, entry]) => ({
        campus,
        satisfaction_index: parseFloat((entry.sum / entry.count).toFixed(2)),
    }));

    return NextResponse.json({
        survey,
        totalRespondents: respList.length,
        totalEnrolled,
        responseRate: totalEnrolled > 0 ? parseFloat((respList.length / totalEnrolled * 100).toFixed(1)) : null,
        campusParticipation,
        prodiParticipation: prodiParticipationEnriched.slice(0, 150),
        globalSatisfactionIndex: globalCount > 0 ? parseFloat((globalSum / globalCount).toFixed(2)) : null,
        campusSatisfaction,
        campuses: allCampuses,
        units: unitReports,
    });
}
