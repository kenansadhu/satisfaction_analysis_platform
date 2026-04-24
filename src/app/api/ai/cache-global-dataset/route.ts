import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { computeSentimentScore } from "@/lib/utils";

export const maxDuration = 60;

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { surveyId } = body;

        if (!surveyId) {
            return NextResponse.json({ error: "Survey ID required" }, { status: 400 });
        }

        // 1. Fetch raw units
        const { data: unitsData, error: uErr } = await supabase
            .from('organization_units')
            .select('id, name, short_name, description');

        if (uErr) throw uErr;

        // 1.5 Fetch all respondents for this survey
        const respIds: number[] = [];
        let rPage = 0;
        while (true) {
            const { data: rBat, error: rErr } = await supabase
                .from('respondents')
                .select('id')
                .eq('survey_id', parseInt(surveyId))
                .range(rPage * 1000, (rPage + 1) * 1000 - 1);
            if (rErr) {
                console.error("Failed to fetch respondents", rErr);
                break;
            }
            if (!rBat || rBat.length === 0) break;
            respIds.push(...rBat.map((r: any) => r.id));
            if (rBat.length < 1000) break;
            rPage++;
        }

        // 1.6 Fetch all quantitative inputs for these respondents
        const quantRows: any[] = [];
        if (respIds.length > 0) {
            const CHUNK_SIZE = 400;
            for (let i = 0; i < respIds.length; i += CHUNK_SIZE) {
                const chunk = respIds.slice(i, i + CHUNK_SIZE);
                let qPage = 0;
                while (true) {
                    const { data: qData, error: qErr } = await supabase
                        .from('raw_feedback_inputs')
                        .select('target_unit_id, source_column, numerical_score')
                        .in('respondent_id', chunk)
                        .eq('is_quantitative', true)
                        .not('numerical_score', 'is', null)
                        .range(qPage * 1000, (qPage + 1) * 1000 - 1);

                    if (qErr) {
                        console.error("Failed to fetch quant chunk", qErr);
                        break;
                    }
                    if (!qData || qData.length === 0) break;
                    quantRows.push(...qData);
                    if (qData.length < 1000) break;
                    qPage++;
                }
            }
        }

        const globalMaxScores = new Map<string, number>();
        const unitQuantScores = new Map<number, Record<string, { sum: number, count: number }>>();

        if (quantRows) {
            for (const row of quantRows) {
                if (!row.target_unit_id) continue;

                const col = row.source_column || 'Score';
                const score = Number(row.numerical_score);

                globalMaxScores.set(col, Math.max(globalMaxScores.get(col) || 0, score));

                if (!unitQuantScores.has(row.target_unit_id)) {
                    unitQuantScores.set(row.target_unit_id, {});
                }
                const unitMap = unitQuantScores.get(row.target_unit_id)!;
                if (!unitMap[col]) {
                    unitMap[col] = { sum: 0, count: 0 };
                }
                unitMap[col].sum += score;
                unitMap[col].count += 1;
            }
        }

        // 2. Pre-fetch Qualitative Aggregations and Categories for all units at once
        let qualAgg: any[] | null = null;
        let qualErr: any = null;
        for (let attempt = 0; attempt < 3; attempt++) {
            const result = await supabase.rpc('get_qual_summary_by_unit', {
                p_survey_id: parseInt(surveyId, 10)
            });
            qualAgg = result.data;
            qualErr = result.error;
            if (!qualErr) break;
            console.warn(`[CacheGlobal] Qual RPC attempt ${attempt + 1} failed: ${qualErr.message}`);
            if (attempt < 2) await new Promise(r => setTimeout(r, 1000));
        }

        if (qualErr) {
            console.error("Failed to fetch qualitative aggregations", qualErr);
        }
        console.log(`[CacheGlobal] RPC get_qual_summary_by_unit returned ${qualAgg?.length || 0} rows`);
        if (qualAgg && qualAgg.length > 0) {
            console.log("[CacheGlobal] Sample qualAgg row:", qualAgg[0]);
        }

        const { data: categories } = await supabase.from('analysis_categories').select('id, name');
        const catMap = new Map((categories || []).map((c: any) => [c.id, c.name]));

        const qualDataByUnit = new Map<number, {
            total: number;
            pos: number;
            neg: number;
            neu: number;
            categories: Record<string, { total: number, pos: number, neg: number, neu: number }>
        }>();

        for (const row of (qualAgg || [])) {
            const uId = row.target_unit_id;
            if (!uId) continue;

            if (!qualDataByUnit.has(uId)) {
                qualDataByUnit.set(uId, { total: 0, pos: 0, neg: 0, neu: 0, categories: {} });
            }
            const uQual = qualDataByUnit.get(uId)!;
            const cnt = parseInt(row.cnt) || 0;
            const sent = row.sentiment;
            const catName = catMap.get(row.category_id) || "Uncategorized";

            uQual.total += cnt;
            if (sent === 'Positive') uQual.pos += cnt;
            else if (sent === 'Negative') uQual.neg += cnt;
            else if (sent === 'Neutral') uQual.neu += cnt;

            if (!uQual.categories[catName]) {
                uQual.categories[catName] = { total: 0, pos: 0, neg: 0, neu: 0 };
            }
            uQual.categories[catName].total += cnt;
            if (sent === 'Positive') uQual.categories[catName].pos += cnt;
            else if (sent === 'Negative') uQual.categories[catName].neg += cnt;
            else if (sent === 'Neutral') uQual.categories[catName].neu += cnt;
        }

        const globalDataset: any[] = [];

        // 3. Assemble metrics for all units sequentially in memory (no DB calls)
        for (const unit of (unitsData || [])) {
            const uQual = qualDataByUnit.get(unit.id) || { total: 0, pos: 0, neg: 0, neu: 0, categories: {} };

            const totalSegments = uQual.total;
            const pos = uQual.pos;
            const neg = uQual.neg;
            const neu = uQual.neu;

            const qScores = unitQuantScores.get(unit.id) || {};
            const hasQuant = Object.keys(qScores).length > 0;

            if (totalSegments <= 0 && pos === 0 && neg === 0 && !hasQuant) continue;

            const flatCategories: Record<string, number> = {};
            let catPos = 0, catNeg = 0;

            for (const [catName, stats] of Object.entries(uQual.categories)) {
                const cleanKey = `category_${catName.replace(/[^a-zA-Z0-9]/g, '_')}`;
                flatCategories[cleanKey] = stats.total;
                flatCategories[`${cleanKey}_pos`] = stats.pos;
                flatCategories[`${cleanKey}_neg`] = stats.neg;
                catPos += stats.pos;
                catNeg += stats.neg;
            }

            // Finalize Counts
            const finalPos = pos > 0 ? pos : catPos;
            const finalNeg = neg > 0 ? neg : catNeg;
            const finalNeu = neu > 0 ? neu : Math.max(0, totalSegments - finalPos - finalNeg);

            // Compute Sentiment Score (0-100 weighted positivity — same formula as executive/metrics)
            const computedScore = computeSentimentScore(finalPos, finalNeu, finalNeg);

            // Build quantitative averages
            const flatQuant: Record<string, number> = {};
            for (const [col, stats] of Object.entries(qScores as Record<string, { sum: number, count: number }>)) {
                const globalMax = globalMaxScores.get(col) || 0;
                const prefix = globalMax > 1 ? 'likert_' : 'binary_';
                const cleanKey = `${prefix}${col.replace(/[^a-zA-Z0-9]/g, '_')}`;
                flatQuant[cleanKey] = parseFloat((stats.sum / stats.count).toFixed(2));
            }

            globalDataset.push({
                unit_id: unit.id,
                unit_name: unit.name,
                unit_short_name: unit.short_name || unit.name,
                unit_description: unit.description || "No context provided.",
                total_segments: totalSegments,
                positive: finalPos,
                neutral: finalNeu,
                negative: finalNeg,
                score: computedScore || 0,
                ...flatCategories,
                ...flatQuant
            });
        }

        // 3. Upsert into a JSON cache column on the surveys table
        const { error: updateErr } = await supabase
            .from('surveys')
            .update({
                ai_dataset_cache: globalDataset,
                ai_dataset_updated_at: new Date().toISOString()
            })
            .eq('id', parseInt(surveyId));

        if (updateErr) throw updateErr;

        return NextResponse.json({ success: true, count: globalDataset.length });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
