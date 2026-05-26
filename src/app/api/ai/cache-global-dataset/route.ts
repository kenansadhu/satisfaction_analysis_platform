import { NextResponse } from "next/server";
import { supabaseServer as supabase } from "@/lib/supabase-server";
import { computeSentimentScore } from "@/lib/utils";
import { addToCounts, computeNpsScore, emptyNpsCounts, NpsCounts } from "@/lib/nps";
import { parseSettingArray } from "@/lib/platformSettings";
import { loadSubgroupMap, computeRespondentUnitScores, mean, type RawScoreRow } from "@/lib/ssi";

export const maxDuration = 300;

const CHUNK = 400;

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { surveyId, phase = 1 } = body;

        if (!surveyId) {
            return NextResponse.json({ error: "Survey ID required" }, { status: 400 });
        }

        if (phase === 2) return await runPhase2(surveyId);
        return await runPhase1(surveyId);
    } catch (e: any) {
        console.error("[cache-global-dataset] failed:", e);
        return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
    }
}

// ── Phase 1: fetch all data, compute all metrics, write cache ──────────────────

async function runPhase1(surveyId: string) {
    const sid = parseInt(surveyId);

    // 0. Survey name
    const { data: surveyRow } = await supabase
        .from('surveys').select('title').eq('id', sid).single();
    const surveyName = (surveyRow as any)?.title || `Survey ${surveyId}`;

    // 1. Units + NPS unit setting
    const [unitsRes, npsSettingRes] = await Promise.all([
        supabase.from('organization_units').select('id, name, short_name, description'),
        supabase.from('platform_settings').select('value').eq('key', 'nps_unit_ids').maybeSingle(),
    ]);
    if (unitsRes.error) throw unitsRes.error;
    const unitsData = unitsRes.data;
    const unitsMap = new Map((unitsData || []).map((u: any) => [u.id, u]));
    const npsUnitIds = new Set<number>(parseSettingArray<number>(npsSettingRes.data?.value));

    // 2. All respondents (paginated)
    const respondentsData: { id: number; faculty: string; study_program: string; location: string }[] = [];
    let rPage = 0;
    while (true) {
        const { data: rBat, error: rErr } = await supabase
            .from('respondents')
            .select('id, faculty, study_program, location')
            .eq('survey_id', sid)
            .range(rPage * 1000, (rPage + 1) * 1000 - 1);
        if (rErr) { console.error("Failed to fetch respondents", rErr); break; }
        if (!rBat || rBat.length === 0) break;
        respondentsData.push(...(rBat as any[]));
        if (rBat.length < 1000) break;
        rPage++;
    }
    const respIds = respondentsData.map(r => r.id);

    // 3. Quantitative inputs (chunked + paginated)
    const quantRows: any[] = [];
    if (respIds.length > 0) {
        for (let i = 0; i < respIds.length; i += CHUNK) {
            const chunk = respIds.slice(i, i + CHUNK);
            let qPage = 0;
            while (true) {
                const { data: qData, error: qErr } = await supabase
                    .from('raw_feedback_inputs')
                    .select('target_unit_id, source_column, numerical_score, respondent_id')
                    .in('respondent_id', chunk)
                    .eq('is_quantitative', true)
                    .not('numerical_score', 'is', null)
                    .neq('score_rule', 'NPS_0_10')
                    .range(qPage * 1000, (qPage + 1) * 1000 - 1);
                if (qErr) { console.error("Failed to fetch quant chunk", qErr); break; }
                if (!qData || qData.length === 0) break;
                quantRows.push(...qData);
                if (qData.length < 1000) break;
                qPage++;
            }
        }
    }

    // 4. Aggregate quant scores + score distributions + respondent reach
    const globalMaxScores = new Map<string, number>();
    const unitQuantScores = new Map<number, Record<string, { sum: number; count: number }>>();
    const unitRespondentSets = new Map<number, Set<number>>();
    const unitColDistributions = new Map<string, Record<number, number>>(); // "unitId::col" → score → count

    for (const row of quantRows) {
        if (!row.target_unit_id) continue;
        const col = row.source_column || 'Score';
        const score = Number(row.numerical_score);
        globalMaxScores.set(col, Math.max(globalMaxScores.get(col) || 0, score));

        if (!unitQuantScores.has(row.target_unit_id)) unitQuantScores.set(row.target_unit_id, {});
        const unitMap = unitQuantScores.get(row.target_unit_id)!;
        if (!unitMap[col]) unitMap[col] = { sum: 0, count: 0 };
        unitMap[col].sum += score;
        unitMap[col].count += 1;

        // Respondent reach
        if (!unitRespondentSets.has(row.target_unit_id)) unitRespondentSets.set(row.target_unit_id, new Set());
        unitRespondentSets.get(row.target_unit_id)!.add(row.respondent_id);

        // Score distribution histogram
        const distKey = `${row.target_unit_id}::${col}`;
        if (!unitColDistributions.has(distKey)) unitColDistributions.set(distKey, {});
        const dist = unitColDistributions.get(distKey)!;
        const rounded = Math.round(score);
        dist[rounded] = (dist[rounded] || 0) + 1;
    }

    // 4b. NPS rows
    const npsRows: any[] = [];
    if (respIds.length > 0) {
        for (let i = 0; i < respIds.length; i += CHUNK) {
            const chunk = respIds.slice(i, i + CHUNK);
            let qPage = 0;
            while (true) {
                const { data: qData } = await supabase
                    .from('raw_feedback_inputs')
                    .select('target_unit_id, source_column, numerical_score, respondent_id')
                    .in('respondent_id', chunk)
                    .eq('is_quantitative', true)
                    .eq('score_rule', 'NPS_0_10')
                    .not('numerical_score', 'is', null)
                    .range(qPage * 1000, (qPage + 1) * 1000 - 1);
                if (!qData || qData.length === 0) break;
                npsRows.push(...qData);
                if (qData.length < 1000) break;
                qPage++;
            }
        }
    }

    // 5. Qualitative aggregations via RPC (with retries)
    let qualAgg: any[] | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
        const result = await supabase.rpc('get_qual_summary_by_unit', { p_survey_id: sid });
        qualAgg = result.data;
        if (!result.error) break;
        console.warn(`[Phase1] Qual RPC attempt ${attempt + 1} failed: ${result.error.message}`);
        if (attempt < 2) await new Promise(r => setTimeout(r, 1000));
    }

    const { data: categories } = await supabase.from('analysis_categories').select('id, name');
    const catMap = new Map((categories || []).map((c: any) => [c.id, c.name]));

    const qualDataByUnit = new Map<number, {
        total: number; pos: number; neg: number; neu: number;
        categories: Record<string, { total: number; pos: number; neg: number; neu: number }>;
    }>();
    for (const row of (qualAgg || [])) {
        const uId = row.target_unit_id;
        if (!uId) continue;
        if (!qualDataByUnit.has(uId)) qualDataByUnit.set(uId, { total: 0, pos: 0, neg: 0, neu: 0, categories: {} });
        const uQual = qualDataByUnit.get(uId)!;
        const cnt = parseInt(row.cnt) || 0;
        const sent = row.sentiment;
        const catName = catMap.get(row.category_id) || "Uncategorized";
        uQual.total += cnt;
        if (sent === 'Positive') uQual.pos += cnt;
        else if (sent === 'Negative') uQual.neg += cnt;
        else if (sent === 'Neutral') uQual.neu += cnt;
        if (!uQual.categories[catName]) uQual.categories[catName] = { total: 0, pos: 0, neg: 0, neu: 0 };
        uQual.categories[catName].total += cnt;
        if (sent === 'Positive') uQual.categories[catName].pos += cnt;
        else if (sent === 'Negative') uQual.categories[catName].neg += cnt;
        else if (sent === 'Neutral') uQual.categories[catName].neu += cnt;
    }

    // 6. Per-unit metrics — build globalDataset with new fields
    const globalDataset: any[] = [];
    for (const unit of (unitsData || [])) {
        if (npsUnitIds.has(unit.id)) continue;
        const uQual = qualDataByUnit.get(unit.id) || { total: 0, pos: 0, neg: 0, neu: 0, categories: {} };
        const totalSegments = uQual.total;
        const { pos, neg, neu } = uQual;
        const qScores = unitQuantScores.get(unit.id) || {};
        const hasQuant = Object.keys(qScores).length > 0;
        if (totalSegments <= 0 && pos === 0 && neg === 0 && !hasQuant) continue;

        const flatCategories: Record<string, number> = {};
        let catPos = 0, catNeg = 0;
        for (const [catName, stats] of Object.entries(uQual.categories)) {
            const k = `category_${catName.replace(/[^a-zA-Z0-9]/g, '_')}`;
            flatCategories[k] = stats.total;
            flatCategories[`${k}_pos`] = stats.pos;
            flatCategories[`${k}_neg`] = stats.neg;
            catPos += stats.pos; catNeg += stats.neg;
        }
        const finalPos = pos > 0 ? pos : catPos;
        const finalNeg = neg > 0 ? neg : catNeg;
        const finalNeu = neu > 0 ? neu : Math.max(0, totalSegments - finalPos - finalNeg);

        const flatQuant: Record<string, number> = {};
        for (const [col, stats] of Object.entries(qScores as Record<string, { sum: number; count: number }>)) {
            const globalMax = globalMaxScores.get(col) || 0;
            const prefix = globalMax > 1 ? 'likert_' : 'binary_';
            flatQuant[`${prefix}${col.replace(/[^a-zA-Z0-9]/g, '_')}`] = parseFloat((stats.sum / stats.count).toFixed(2));
        }

        // Score distributions per column
        const scoreDistributions = [];
        for (const [col, stats] of Object.entries(qScores as Record<string, { sum: number; count: number }>)) {
            const distKey = `${unit.id}::${col}`;
            const dist = unitColDistributions.get(distKey) || {};
            const globalMax = globalMaxScores.get(col) || 0;
            const prefix = globalMax > 1 ? 'likert_' : 'binary_';
            const totalInDist = Object.values(dist).reduce((a, b) => a + b, 0);
            const midpoint = globalMax > 1 ? 3 : 1;
            const aboveMidpoint = Object.entries(dist)
                .filter(([s]) => Number(s) >= midpoint)
                .reduce((a, [, n]) => a + n, 0);
            scoreDistributions.push({
                column: col,
                key: `${prefix}${col.replace(/[^a-zA-Z0-9]/g, '_')}`,
                scale: globalMax > 1 ? '1-4' : '0-1',
                distribution: dist,
                total: totalInDist,
                pct_above_midpoint: totalInDist > 0
                    ? parseFloat(((aboveMidpoint / totalInDist) * 100).toFixed(1))
                    : 0,
            });
        }

        globalDataset.push({
            unit_id: unit.id,
            unit_name: unit.name,
            unit_short_name: unit.short_name || unit.name,
            unit_description: unit.description || "No context provided.",
            total_segments: totalSegments,
            positive: finalPos, neutral: finalNeu, negative: finalNeg,
            score: computeSentimentScore(finalPos, finalNeu, finalNeg) || 0,
            respondent_reach: unitRespondentSets.get(unit.id)?.size || 0,
            score_distributions: scoreDistributions,
            ...flatCategories,
            ...flatQuant,
        });
    }

    // 7. Column schema
    const { data: colCache } = await supabase
        .from('survey_column_cache').select('source_column, unique_values').eq('survey_id', sid);
    const colCacheMap = new Map((colCache || []).map((c: any) => [c.source_column, c.unique_values || []]));

    const colSchemaMap = new Map<string, { unitId: number; numSamples: number[] }>();
    for (const row of quantRows) {
        if (!row.source_column || !row.target_unit_id) continue;
        if (!colSchemaMap.has(row.source_column))
            colSchemaMap.set(row.source_column, { unitId: row.target_unit_id, numSamples: [] });
        const entry = colSchemaMap.get(row.source_column)!;
        if (entry.numSamples.length < 5) entry.numSamples.push(Number(row.numerical_score));
    }
    const columnSchema = Array.from(colSchemaMap.entries()).map(([col, { unitId, numSamples }]) => {
        const globalMax = globalMaxScores.get(col) || 0;
        const prefix = globalMax > 1 ? 'likert_' : 'binary_';
        return {
            key: `${prefix}${col.replace(/[^a-zA-Z0-9]/g, '_')}`,
            question: col,
            unit_id: unitId,
            unit_name: (unitsMap.get(unitId) as any)?.name || `Unit ${unitId}`,
            scale: globalMax > 1 ? '1-4' : '0-1',
            raw_options: (colCacheMap.get(col) || []).slice(0, 8),
            score_samples: numSamples,
        };
    }).sort((a, b) => a.unit_id - b.unit_id || a.question.localeCompare(b.question));

    // 8. Faculty/Location/Program breakdowns — all use same per-respondent score methodology
    const respMetaMap = new Map(respondentsData.map(r => [r.id, r]));
    const subgroupByColumn = await loadSubgroupMap(supabase, sid);
    const respUnitScores = computeRespondentUnitScores(quantRows as RawScoreRow[], subgroupByColumn);

    function buildBreakdown(
        keyFn: (meta: any) => string | undefined,
        labelKey: string,
    ) {
        const scoreMap = new Map<string, { unitId: number; label: string; scores: number[] }>();
        for (const r of respUnitScores) {
            const meta = respMetaMap.get(r.respondent_id);
            const label = keyFn(meta);
            if (!label) continue;
            const k = `${label}::${r.unit_id}`;
            if (!scoreMap.has(k)) scoreMap.set(k, { unitId: r.unit_id, label, scores: [] });
            scoreMap.get(k)!.scores.push(r.score);
        }
        return Array.from(scoreMap.values()).map(v => {
            const m = mean(v.scores);
            return {
                [labelKey]: v.label,
                unit_id: v.unitId,
                unit_name: (unitsMap.get(v.unitId) as any)?.name || `Unit ${v.unitId}`,
                unit_short_name: (unitsMap.get(v.unitId) as any)?.short_name || null,
                avg_score: m !== null ? parseFloat(m.toFixed(2)) : null,
                count: v.scores.length,
            };
        }).sort((a: any, b: any) => a[labelKey].localeCompare(b[labelKey]) || a.unit_id - b.unit_id);
    }

    const facultiesSummary  = buildBreakdown(m => m?.faculty,        'faculty');
    const locationsSummary  = buildBreakdown(m => m?.location,       'location');
    const programsSummary   = buildBreakdown(m => m?.study_program,  'program');

    // 9. Survey context + respondent demographics
    const faculties = [...new Set(respondentsData.map(r => r.faculty).filter(Boolean))].sort() as string[];
    const programs  = [...new Set(respondentsData.map(r => r.study_program).filter(Boolean))].sort() as string[];
    const locations = [...new Set(respondentsData.map(r => r.location).filter(Boolean))].sort() as string[];

    const respondentDemographics = {
        by_faculty:  respondentsData.reduce((acc, r) => { if (r.faculty)        acc[r.faculty]        = (acc[r.faculty]        || 0) + 1; return acc; }, {} as Record<string, number>),
        by_program:  respondentsData.reduce((acc, r) => { if (r.study_program)  acc[r.study_program]  = (acc[r.study_program]  || 0) + 1; return acc; }, {} as Record<string, number>),
        by_location: respondentsData.reduce((acc, r) => { if (r.location)       acc[r.location]       = (acc[r.location]       || 0) + 1; return acc; }, {} as Record<string, number>),
    };

    // 9b. NPS summary
    type NpsKey = string;
    const npsUnitCounts     = new Map<NpsKey, NpsCounts & { unitId: number; column: string }>();
    const npsFacultyCounts  = new Map<string,  NpsCounts & { unitId: number; column: string; faculty: string }>();

    for (const row of npsRows) {
        if (!row.target_unit_id) continue;
        const col = row.source_column || 'NPS';
        const unitKey = `${row.target_unit_id}::${col}`;
        if (!npsUnitCounts.has(unitKey))
            npsUnitCounts.set(unitKey, { ...emptyNpsCounts(), unitId: row.target_unit_id, column: col });
        addToCounts(npsUnitCounts.get(unitKey)!, Number(row.numerical_score));

        const meta = respMetaMap.get(row.respondent_id);
        if (meta?.faculty) {
            const facKey = `${row.target_unit_id}::${col}::${meta.faculty}`;
            if (!npsFacultyCounts.has(facKey))
                npsFacultyCounts.set(facKey, { ...emptyNpsCounts(), unitId: row.target_unit_id, column: col, faculty: meta.faculty });
            addToCounts(npsFacultyCounts.get(facKey)!, Number(row.numerical_score));
        }
    }

    const npsSummary = {
        per_unit: Array.from(npsUnitCounts.values()).map(e => ({
            unit_id: e.unitId,
            unit_name: (unitsMap.get(e.unitId) as any)?.name || `Unit ${e.unitId}`,
            unit_short_name: (unitsMap.get(e.unitId) as any)?.short_name || null,
            column: e.column,
            nps_score: computeNpsScore(e),
            detractors: e.detractor, passives: e.passive, promoters: e.promoter, total: e.total,
        })),
        per_faculty: Array.from(npsFacultyCounts.values()).map(e => ({
            unit_id: e.unitId,
            unit_name: (unitsMap.get(e.unitId) as any)?.name || `Unit ${e.unitId}`,
            column: e.column,
            faculty: e.faculty,
            nps_score: computeNpsScore(e),
            detractors: e.detractor, passives: e.passive, promoters: e.promoter, total: e.total,
        })).sort((a, b) => a.faculty.localeCompare(b.faculty)),
    };

    // 10. Cross-unit mentions — read from existing cache table (built by Settings pipeline)
    let crossUnitMentions: any[] = [];
    try {
        const { data: crossData } = await supabase
            .from('survey_cross_mentions_cache')
            .select('mentioned_unit_id, total_mentions, source_unit_count, positive_count, negative_count, neutral_count, source_units_breakdown')
            .eq('survey_id', sid)
            .gt('total_mentions', 0)
            .order('total_mentions', { ascending: false });

        if (crossData && crossData.length > 0) {
            const mentionedIds = crossData.map((r: any) => r.mentioned_unit_id);
            const { data: crossUnitData } = await supabase
                .from('organization_units').select('id, name, short_name').in('id', mentionedIds);
            const crossUnitMap = new Map((crossUnitData || []).map((u: any) => [u.id, u]));

            crossUnitMentions = crossData.map((r: any) => {
                const unit = crossUnitMap.get(r.mentioned_unit_id);
                return {
                    unit_id: r.mentioned_unit_id,
                    unit_name: unit?.name || `Unit ${r.mentioned_unit_id}`,
                    unit_short_name: unit?.short_name || unit?.name || `Unit ${r.mentioned_unit_id}`,
                    total_mentions: r.total_mentions,
                    source_unit_count: r.source_unit_count,
                    positive_count: r.positive_count,
                    negative_count: r.negative_count,
                    neutral_count: r.neutral_count,
                    source_units_breakdown: (r.source_units_breakdown || []).slice(0, 5),
                };
            });
            console.log(`[Phase1] Loaded ${crossUnitMentions.length} cross-unit mention entries from cache`);
        }
    } catch (e: any) {
        console.warn('[Phase1] Cross-unit mentions read failed (non-fatal):', e.message);
    }

    // 11. Write v3 cache
    const enrichedCache = {
        v: 3,
        units: globalDataset,
        survey_context: {
            survey_name: surveyName,
            respondent_count: respondentsData.length,
            faculties,
            programs,
            locations,
            respondent_demographics: respondentDemographics,
        },
        column_schema: columnSchema,
        faculties_summary: facultiesSummary,
        locations_summary: locationsSummary,
        programs_summary: programsSummary,
        nps_summary: npsSummary,
        cross_unit_mentions: crossUnitMentions,
        top_themes_per_unit: {},
        suggestion_requests: [],
        suggestions: [],
    };

    const { error: updateErr } = await supabase
        .from('surveys')
        .update({ ai_dataset_cache: enrichedCache, ai_dataset_updated_at: new Date().toISOString() })
        .eq('id', sid);
    if (updateErr) throw updateErr;

    const analyzedUnits = globalDataset.filter((u: any) => u.total_segments > 0).length;
    return NextResponse.json({
        success: true,
        phase: 1,
        count: globalDataset.length,
        total_org_units: (unitsData || []).length,
        analyzed_units: analyzedUnits,
        quant_only_units: globalDataset.length - analyzedUnits,
        column_schema_count: columnSchema.length,
        faculty_groups: faculties.length,
        location_groups: locations.length,
        program_groups: programs.length,
        cross_unit_mention_units: crossUnitMentions.length,
    });
}

// ── Phase 2: suggestions + theme aggregation + improvement requests ────────────

async function runPhase2(surveyId: string) {
    const sid = parseInt(surveyId);

    const { data: surveyRow, error: readErr } = await supabase
        .from('surveys').select('ai_dataset_cache').eq('id', sid).single();
    if (readErr) throw readErr;
    const existingCache = (surveyRow as any)?.ai_dataset_cache || {};

    const [{ data: unitsData }, { data: categories }] = await Promise.all([
        supabase.from('organization_units').select('id, name, short_name'),
        supabase.from('analysis_categories').select('id, name'),
    ]);
    const unitsMap = new Map((unitsData || []).map((u: any) => [u.id, u]));
    const catMap   = new Map((categories || []).map((c: any) => [c.id, c.name]));

    // Fetch ALL segments via pagination
    const rawRows: any[] = [];
    try {
        const PAGE = 1000;
        let from = 0;
        while (true) {
            const { data, error } = await supabase
                .rpc('get_survey_suggestions', { p_survey_id: sid })
                .range(from, from + PAGE - 1);
            if (error) throw error;
            if (!data || data.length === 0) break;
            rawRows.push(...(data as any[]));
            if (data.length < PAGE) break;
            from += PAGE;
        }
    } catch (e: any) {
        console.warn('[Phase2] segments fetch failed (non-fatal):', e.message);
    }

    // Build suggestions[] array (individual segments with full context)
    const suggestions = rawRows.map((row: any) => {
        const unitInfo = unitsMap.get(row.target_unit_id) as any;
        return {
            id: row.id,
            text: row.segment_text,
            original_text: row.raw_text,
            sentiment: row.sentiment,
            category: catMap.get(row.category_id) || 'Uncategorized',
            is_suggestion: row.is_suggestion || false,
            unit: {
                id: row.target_unit_id,
                name: unitInfo?.name || 'Unknown Unit',
                short_name: unitInfo?.short_name || null,
            },
            context: {
                faculty: row.faculty,
                program: row.study_program,
                location: row.location,
            },
        };
    });

    // Build top_themes_per_unit — category × sentiment, with representative quotes
    const unitThemeAccum: Record<number, Record<string, {
        total: number; positive: number; negative: number; neutral: number;
        negQuotes: string[]; posQuotes: string[];
    }>> = {};

    for (const row of rawRows) {
        const uid = row.target_unit_id;
        if (!uid) continue;
        const cat = catMap.get(row.category_id) || 'Uncategorized';
        if (cat === 'Others' || cat === 'Uncategorized') continue;
        if (!unitThemeAccum[uid]) unitThemeAccum[uid] = {};
        if (!unitThemeAccum[uid][cat]) unitThemeAccum[uid][cat] = { total: 0, positive: 0, negative: 0, neutral: 0, negQuotes: [], posQuotes: [] };

        const t = unitThemeAccum[uid][cat];
        t.total++;
        if (row.sentiment === 'Positive') {
            t.positive++;
            if (t.posQuotes.length < 2 && row.segment_text?.length > 20)
                t.posQuotes.push(row.segment_text.slice(0, 160));
        } else if (row.sentiment === 'Negative') {
            t.negative++;
            if (t.negQuotes.length < 3 && row.segment_text?.length > 20)
                t.negQuotes.push(row.segment_text.slice(0, 160));
        } else {
            t.neutral++;
        }
    }

    const topThemesPerUnit: Record<number, any> = {};
    for (const [uidStr, themes] of Object.entries(unitThemeAccum)) {
        const uid = Number(uidStr);
        const unitInfo = unitsMap.get(uid) as any;
        topThemesPerUnit[uid] = {
            unit_id: uid,
            unit_name: unitInfo?.name || `Unit ${uid}`,
            unit_short_name: unitInfo?.short_name || null,
            themes: Object.entries(themes)
                .sort(([, a], [, b]) => b.total - a.total)
                .slice(0, 8)
                .map(([category, stats]) => ({
                    category,
                    total: stats.total,
                    positive: stats.positive,
                    negative: stats.negative,
                    neutral: stats.neutral,
                    positive_pct: stats.total > 0 ? parseFloat(((stats.positive / stats.total) * 100).toFixed(1)) : 0,
                    top_negative_quotes: stats.negQuotes,
                    top_positive_quotes: stats.posQuotes,
                })),
        };
    }

    // Build suggestion_requests — improvement asks per unit
    // Use a deduplication key (first 60 chars normalised) to cluster near-duplicates
    const unitReqAccum: Record<number, Record<string, { count: number; category: string; sample: string }>> = {};
    for (const row of rawRows) {
        if (!row.is_suggestion || !row.target_unit_id || !row.segment_text) continue;
        const uid  = row.target_unit_id;
        const cat  = catMap.get(row.category_id) || 'General';
        const text = row.segment_text.slice(0, 200);
        const key  = text.slice(0, 60).toLowerCase().replace(/\s+/g, ' ').trim();
        if (!unitReqAccum[uid]) unitReqAccum[uid] = {};
        if (!unitReqAccum[uid][key]) unitReqAccum[uid][key] = { count: 0, category: cat, sample: text };
        unitReqAccum[uid][key].count++;
    }

    const suggestionRequests = Object.entries(unitReqAccum).map(([uidStr, reqs]) => {
        const uid = Number(uidStr);
        const unitInfo = unitsMap.get(uid) as any;
        return {
            unit_id: uid,
            unit_name: unitInfo?.name || `Unit ${uid}`,
            unit_short_name: unitInfo?.short_name || null,
            requests: Object.values(reqs)
                .sort((a, b) => b.count - a.count)
                .slice(0, 10)
                .map(r => ({ text: r.sample, count: r.count, category: r.category })),
        };
    }).filter(u => u.requests.length > 0);

    // Merge into existing cache
    const updatedCache = {
        ...existingCache,
        suggestions,
        top_themes_per_unit: topThemesPerUnit,
        suggestion_requests: suggestionRequests,
    };

    const { error: updateErr } = await supabase
        .from('surveys')
        .update({ ai_dataset_cache: updatedCache, ai_dataset_updated_at: new Date().toISOString() })
        .eq('id', sid);
    if (updateErr) throw updateErr;

    return NextResponse.json({
        success: true,
        phase: 2,
        suggestions_count: suggestions.length,
        themed_units: Object.keys(topThemesPerUnit).length,
        suggestion_request_units: suggestionRequests.length,
        suggestion_requests_total: suggestionRequests.reduce((a, u) => a + u.requests.length, 0),
    });
}
