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

        // IMPORTANT: `await` the phase functions. Returning the Promise directly
        // ends the try-block before any internal rejections can surface, so the
        // framework's default error handler runs and returns the plain-text
        // "An error occurred while processing your request" — which then crashes
        // res.json() on the client with "Unexpected token 'A'".
        if (phase === 2) return await runPhase2(surveyId);
        return await runPhase1(surveyId);
    } catch (e: any) {
        console.error("[cache-global-dataset] failed:", e);
        return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
    }
}

// ── Phase 1: fetch all data, compute metrics, write cache (suggestions = []) ──

async function runPhase1(surveyId: string) {
    // 0. Survey name (column is `title`, not `name` — older code had this wrong;
    // the .single() returned null + an error which was silently swallowed,
    // making every cached dataset say "Survey <id>" instead of the real title.)
    const { data: surveyRow } = await supabase
        .from('surveys').select('title').eq('id', parseInt(surveyId)).single();
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
            .eq('survey_id', parseInt(surveyId))
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

    // 4. Aggregate quant scores
    const globalMaxScores = new Map<string, number>();
    const unitQuantScores = new Map<number, Record<string, { sum: number; count: number }>>();
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
    }

    // 4b. NPS rows (0–10 scale, bucketed separately and kept out of the Likert dataset above).
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
        const result = await supabase.rpc('get_qual_summary_by_unit', {
            p_survey_id: parseInt(surveyId, 10),
        });
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

    // 6. Per-unit metrics — excludes NPS units (they live in nps_summary below)
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

        globalDataset.push({
            unit_id: unit.id,
            unit_name: unit.name,
            unit_short_name: unit.short_name || unit.name,
            unit_description: unit.description || "No context provided.",
            total_segments: totalSegments,
            positive: finalPos, neutral: finalNeu, negative: finalNeg,
            score: computeSentimentScore(finalPos, finalNeu, finalNeg) || 0,
            ...flatCategories,
            ...flatQuant,
        });
    }

    // 7. Column schema
    const { data: colCache } = await supabase
        .from('survey_column_cache').select('source_column, unique_values').eq('survey_id', parseInt(surveyId));
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

    // 8. Faculty summary — per-respondent macro per (faculty, unit), matching
    //    what Faculty Insights and the Executive Report display. AI prompts read
    //    this field, so keeping it on the same methodology avoids the AI quoting
    //    numbers that drift from the UI.
    const respMetaMap = new Map(respondentsData.map(r => [r.id, r]));
    const subgroupByColumn = await loadSubgroupMap(supabase, parseInt(surveyId));
    const respUnitScores = computeRespondentUnitScores(
        quantRows as RawScoreRow[],
        subgroupByColumn,
    );
    const facUnitScores = new Map<string, { unitId: number; faculty: string; scores: number[] }>();
    for (const r of respUnitScores) {
        const meta = respMetaMap.get(r.respondent_id);
        if (!meta?.faculty) continue;
        const k = `${meta.faculty}::${r.unit_id}`;
        if (!facUnitScores.has(k)) facUnitScores.set(k, { unitId: r.unit_id, faculty: meta.faculty, scores: [] });
        facUnitScores.get(k)!.scores.push(r.score);
    }
    const facultiesSummary = Array.from(facUnitScores.values()).map(v => {
        const m = mean(v.scores);
        return {
            faculty: v.faculty,
            unit_id: v.unitId,
            unit_name: (unitsMap.get(v.unitId) as any)?.name || `Unit ${v.unitId}`,
            unit_short_name: (unitsMap.get(v.unitId) as any)?.short_name || null,
            avg_score: m !== null ? parseFloat(m.toFixed(2)) : null,
            count: v.scores.length,
        };
    }).sort((a, b) => a.faculty.localeCompare(b.faculty) || a.unit_id - b.unit_id);

    // 9. Survey context
    const faculties = [...new Set(respondentsData.map(r => r.faculty).filter(Boolean))].sort() as string[];
    const programs = [...new Set(respondentsData.map(r => r.study_program).filter(Boolean))].sort() as string[];
    const locations = [...new Set(respondentsData.map(r => r.location).filter(Boolean))].sort() as string[];

    // 9b. NPS summary — per unit×column, per (unit×column)×faculty.
    type NpsKey = string; // `${unitId}::${col}`
    const npsUnitCounts = new Map<NpsKey, NpsCounts & { unitId: number; column: string }>();
    const npsFacultyCounts = new Map<string, NpsCounts & { unitId: number; column: string; faculty: string }>();

    for (const row of npsRows) {
        if (!row.target_unit_id) continue;
        const col = row.source_column || 'NPS';
        const unitKey = `${row.target_unit_id}::${col}`;
        if (!npsUnitCounts.has(unitKey)) {
            npsUnitCounts.set(unitKey, { ...emptyNpsCounts(), unitId: row.target_unit_id, column: col });
        }
        addToCounts(npsUnitCounts.get(unitKey)!, Number(row.numerical_score));

        const meta = respMetaMap.get(row.respondent_id);
        if (meta?.faculty) {
            const facKey = `${row.target_unit_id}::${col}::${meta.faculty}`;
            if (!npsFacultyCounts.has(facKey)) {
                npsFacultyCounts.set(facKey, {
                    ...emptyNpsCounts(), unitId: row.target_unit_id, column: col, faculty: meta.faculty,
                });
            }
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

    // 10. Write cache (suggestions will be added by phase 2)
    const enrichedCache = {
        v: 2,
        units: globalDataset,
        survey_context: { survey_name: surveyName, respondent_count: respondentsData.length, faculties, programs, locations },
        column_schema: columnSchema,
        faculties_summary: facultiesSummary,
        nps_summary: npsSummary,
        suggestions: [],
    };

    const { error: updateErr } = await supabase
        .from('surveys')
        .update({ ai_dataset_cache: enrichedCache, ai_dataset_updated_at: new Date().toISOString() })
        .eq('id', parseInt(surveyId));
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
    });
}

// ── Phase 2: fetch suggestions and merge into the existing cache ──

async function runPhase2(surveyId: string) {
    // Read existing cache so we can merge suggestions in
    const { data: surveyRow, error: readErr } = await supabase
        .from('surveys').select('ai_dataset_cache').eq('id', parseInt(surveyId)).single();
    if (readErr) throw readErr;

    const existingCache = (surveyRow as any)?.ai_dataset_cache || {};

    // Fetch units + categories for suggestion enrichment
    const [{ data: unitsData }, { data: categories }] = await Promise.all([
        supabase.from('organization_units').select('id, name, short_name'),
        supabase.from('analysis_categories').select('id, name'),
    ]);
    const unitsMap = new Map((unitsData || []).map((u: any) => [u.id, u]));
    const catMap = new Map((categories || []).map((c: any) => [c.id, c.name]));

    // Fetch ALL suggestions via .range() pagination — same pattern as /api/executive/suggestions
    // so the cached and non-cached paths return identical counts. Previously a hardcoded
    // p_limit: 500 silently truncated results for any survey with > 500 suggestions.
    let suggestions: any[] = [];
    try {
        const PAGE = 1000;
        const rawRows: any[] = [];
        let from = 0;
        while (true) {
            const { data, error } = await supabase
                .rpc('get_survey_suggestions', { p_survey_id: parseInt(surveyId) })
                .range(from, from + PAGE - 1);
            if (error) throw error;
            if (!data || data.length === 0) break;
            rawRows.push(...(data as any[]));
            if (data.length < PAGE) break;
            from += PAGE;
        }
        suggestions = rawRows.map((row: any) => {
            const unitInfo = unitsMap.get(row.target_unit_id) as any;
            return {
                id: row.id,
                text: row.segment_text,
                original_text: row.raw_text,
                sentiment: row.sentiment,
                category: catMap.get(row.category_id) || 'Uncategorized',
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
    } catch (e: any) {
        console.warn('[Phase2] suggestions fetch failed (non-fatal):', e.message);
    }

    // Merge into existing cache and write back
    const updatedCache = { ...existingCache, suggestions };
    const { error: updateErr } = await supabase
        .from('surveys')
        .update({ ai_dataset_cache: updatedCache, ai_dataset_updated_at: new Date().toISOString() })
        .eq('id', parseInt(surveyId));
    if (updateErr) throw updateErr;

    return NextResponse.json({ success: true, phase: 2, suggestions_count: suggestions.length });
}
