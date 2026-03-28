import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { computeSentimentScore } from "@/lib/utils";

/**
 * GET /api/executive/compare?surveyIdA=1&surveyIdB=2
 * 
 * Fetches side-by-side executive metrics for two surveys, including:
 * - Sentiment scores per unit
 * - Satisfaction Index (1-4 scale) per unit via RPC 
 * - Enrollment-based response rates
 * - Campus participation
 * - Category-level segment counts per unit
 */
export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const surveyIdA = searchParams.get("surveyIdA");
    const surveyIdB = searchParams.get("surveyIdB");

    if (!surveyIdA || !surveyIdB) {
        return NextResponse.json(
            { error: "Both surveyIdA and surveyIdB are required" },
            { status: 400 }
        );
    }

    try {
        const idA = parseInt(surveyIdA);
        const idB = parseInt(surveyIdB);

        // Parallel fetches for both surveys
        const [
            surveyInfoA, surveyInfoB,
            metricsA, metricsB,
            rpcA, rpcB,
            rateA, rateB,
            campusA, campusB,
            categoryData,
        ] = await Promise.all([
            supabase.from('surveys').select('id, title, year').eq('id', idA).single(),
            supabase.from('surveys').select('id, title, year').eq('id', idB).single(),
            fetchSurveyMetrics(idA),
            fetchSurveyMetrics(idB),
            supabase.rpc('get_report_aggregates', { p_survey_id: idA }),
            supabase.rpc('get_report_aggregates', { p_survey_id: idB }),
            fetchResponseRates(idA),
            fetchResponseRates(idB),
            fetchCampusParticipation(idA),
            fetchCampusParticipation(idB),
            fetchCategoryComparison(idA, idB),
        ]);

        // Process RPC results into Satisfaction Index per unit
        const quantA = buildSatisfactionIndex(rpcA.data);
        const quantB = buildSatisfactionIndex(rpcB.data);

        return NextResponse.json({
            surveyA: {
                info: surveyInfoA.data,
                metrics: metricsA,
                quantitative: quantA.units,
                uphIndex: quantA.overall,
                responseRates: rateA,
                campusParticipation: campusA,
            },
            surveyB: {
                info: surveyInfoB.data,
                metrics: metricsB,
                quantitative: quantB.units,
                uphIndex: quantB.overall,
                responseRates: rateB,
                campusParticipation: campusB,
            },
            categoryComparison: categoryData,
        });
    } catch (e: any) {
        console.error("Compare API error:", e.message);
        return NextResponse.json(
            { error: "Failed to fetch comparison data", details: e.message },
            { status: 500 }
        );
    }
}

// --- Helper Functions ---

function buildSatisfactionIndex(rpcResult: any) {
    const unitCampusScores: any[] = rpcResult?.unit_campus_scores || [];

    // Per-unit averages
    const unitMap: Record<number, { sum: number; count: number }> = {};
    let globalSum = 0, globalCount = 0;

    for (const row of unitCampusScores) {
        const unitId = row.target_unit_id;
        const avg = parseFloat(row.avg_score);
        const count = parseInt(row.score_count);

        if (!unitMap[unitId]) unitMap[unitId] = { sum: 0, count: 0 };
        unitMap[unitId].sum += avg * count;
        unitMap[unitId].count += count;

        globalSum += avg * count;
        globalCount += count;
    }

    return {
        overall: globalCount > 0 ? parseFloat((globalSum / globalCount).toFixed(2)) : null,
        units: unitMap,
    };
}

async function fetchSurveyMetrics(surveyId: number) {
    const { data: rpcData } = await supabase.rpc('get_all_executive_metrics', {
        p_survey_id: surveyId,
    });

    const { count: respondentCount } = await supabase
        .from('respondents')
        .select('*', { count: 'exact', head: true })
        .eq('survey_id', surveyId);

    const unitScores: {
        unit_id: number;
        unit_name: string;
        short_name: string;
        positive: number;
        neutral: number;
        negative: number;
        total: number;
        score: number;
    }[] = [];

    if (rpcData) {
        for (const row of rpcData) {
            const pos = row.positive_count || 0;
            const neu = row.neutral_count || 0;
            const neg = row.negative_count || 0;
            const total = pos + neu + neg;
            const score = computeSentimentScore(pos, neu, neg);

            unitScores.push({
                unit_id: row.unit_id,
                unit_name: row.unit_name || "Unknown",
                short_name: row.short_name || row.unit_name || "Unknown",
                positive: pos,
                neutral: neu,
                negative: neg,
                total,
                score,
            });
        }
    }

    const totalPos = unitScores.reduce((s, u) => s + u.positive, 0);
    const totalNeu = unitScores.reduce((s, u) => s + u.neutral, 0);
    const totalNeg = unitScores.reduce((s, u) => s + u.negative, 0);
    const totalAll = totalPos + totalNeu + totalNeg;
    const overallScore = totalAll > 0
        ? Math.round(((totalPos * 1.0 + totalNeu * 0.5) / totalAll) * 100)
        : 0;

    return {
        overallScore,
        totalComments: totalAll,
        totalRespondents: respondentCount || 0,
        criticalIssues: totalNeg,
        unitScores,
    };
}

async function fetchCampusParticipation(surveyId: number) {
    const { data } = await supabase
        .from('respondents')
        .select('location')
        .eq('survey_id', surveyId);

    if (!data) return [];

    const campusMap = new Map<string, number>();
    for (const r of data) {
        const loc = r.location || "Unknown";
        campusMap.set(loc, (campusMap.get(loc) || 0) + 1);
    }

    return Array.from(campusMap.entries())
        .map(([campus, count]) => ({ campus, respondents: count }))
        .sort((a, b) => b.respondents - a.respondents);
}

async function fetchCategoryComparison(surveyIdA: number, surveyIdB: number) {
    // Get all categories with their unit
    const { data: categories } = await supabase
        .from('analysis_categories')
        .select('id, name, unit_id');

    if (!categories || categories.length === 0) return [];

    // Get unit names
    const unitIds = [...new Set(categories.map(c => c.unit_id))];
    const { data: units } = await supabase
        .from('organization_units')
        .select('id, name, short_name')
        .in('id', unitIds);
    const unitMap = new Map((units || []).map(u => [u.id, u]));

    // Helper to get all segments for a survey
    const getSegmentsForSurvey = async (sId: number) => {
        const { data: resps } = await supabase.from('respondents').select('id').eq('survey_id', sId);
        const respIds = (resps || []).map(r => r.id);

        const inputIds: number[] = [];
        const CHUNK = 400;
        const inputPromises = [];
        for (let i = 0; i < respIds.length; i += CHUNK) {
            const chunk = respIds.slice(i, i + CHUNK);
            inputPromises.push(supabase.from('raw_feedback_inputs').select('id').in('respondent_id', chunk));
        }
        const inputResults = await Promise.all(inputPromises);
        for (const res of inputResults) if (res.data) inputIds.push(...res.data.map((d: any) => d.id));

        let segs: any[] = [];
        const segPromises = [];
        for (let i = 0; i < inputIds.length; i += CHUNK) {
            const chunk = inputIds.slice(i, i + CHUNK);
            segPromises.push(supabase.from('feedback_segments').select('category_id, sentiment').in('raw_input_id', chunk));
        }
        const segResults = await Promise.all(segPromises);
        for (const res of segResults) if (res.data) segs.push(...res.data);

        return segs;
    };

    const segsA = await getSegmentsForSurvey(surveyIdA);
    const segsB = await getSegmentsForSurvey(surveyIdB);

    // Count per category per sentiment
    type CatCount = { positive: number; negative: number; neutral: number; total: number };
    const countA = new Map<number, CatCount>();
    const countB = new Map<number, CatCount>();

    const accumulate = (map: Map<number, CatCount>, segments: any[] | null) => {
        for (const seg of segments || []) {
            if (!seg.category_id) continue;
            if (!map.has(seg.category_id)) map.set(seg.category_id, { positive: 0, negative: 0, neutral: 0, total: 0 });
            const entry = map.get(seg.category_id)!;
            entry.total++;
            if (seg.sentiment === "Positive") entry.positive++;
            else if (seg.sentiment === "Negative") entry.negative++;
            else entry.neutral++;
        }
    };

    accumulate(countA, segsA);
    accumulate(countB, segsB);

    // Group by unit
    const unitCatMap = new Map<number, {
        unit_name: string;
        short_name: string;
        categories: {
            category_name: string;
            countA: CatCount;
            countB: CatCount;
        }[];
    }>();

    for (const cat of categories) {
        const uid = cat.unit_id;
        if (!unitCatMap.has(uid)) {
            const unit = unitMap.get(uid);
            unitCatMap.set(uid, {
                unit_name: unit?.name || "Unknown",
                short_name: unit?.short_name || unit?.name || "Unknown",
                categories: [],
            });
        }
        const a = countA.get(cat.id) || { positive: 0, negative: 0, neutral: 0, total: 0 };
        const b = countB.get(cat.id) || { positive: 0, negative: 0, neutral: 0, total: 0 };

        // Only include if at least one survey has data
        if (a.total > 0 || b.total > 0) {
            unitCatMap.get(uid)!.categories.push({
                category_name: cat.name,
                countA: a,
                countB: b,
            });
        }
    }

    // Sort categories by total count descending
    for (const entry of unitCatMap.values()) {
        entry.categories.sort((a, b) => (b.countA.total + b.countB.total) - (a.countA.total + a.countB.total));
    }

    return Array.from(unitCatMap.entries())
        .map(([uid, data]) => ({ unit_id: uid, ...data }))
        .filter(u => u.categories.length > 0)
        .sort((a, b) => a.unit_name.localeCompare(b.unit_name));
}

async function fetchResponseRates(surveyId: number) {
    const { data: enrollments } = await supabase
        .from('prodi_enrollment')
        .select('student_count')
        .eq('survey_id', surveyId);

    if (!enrollments || enrollments.length === 0) return null;

    const totalEnrollment = enrollments.reduce((s, e) => s + (e.student_count || 0), 0);

    const { count: totalRespondents } = await supabase
        .from('respondents')
        .select('*', { count: 'exact', head: true })
        .eq('survey_id', surveyId);

    return {
        totalEnrollment,
        totalRespondents: totalRespondents || 0,
        responseRate: totalEnrollment > 0
            ? parseFloat(((totalRespondents || 0) / totalEnrollment * 100).toFixed(1))
            : 0,
    };
}
