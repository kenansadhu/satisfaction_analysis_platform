import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

/**
 * GET /api/executive/compare?surveyIdA=1&surveyIdB=2
 * 
 * Fetches side-by-side executive metrics for two surveys,
 * including sentiment scores, quantitative averages (1-4 scale),
 * and enrollment-based response rates.
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
        // 1. Fetch sentiment metrics for both surveys in parallel
        const [metricsA, metricsB] = await Promise.all([
            fetchSurveyMetrics(parseInt(surveyIdA)),
            fetchSurveyMetrics(parseInt(surveyIdB)),
        ]);

        // 2. Fetch survey info (title, year)
        const [surveyInfoA, surveyInfoB] = await Promise.all([
            supabase.from('surveys').select('id, title, year').eq('id', surveyIdA).single(),
            supabase.from('surveys').select('id, title, year').eq('id', surveyIdB).single(),
        ]);

        // 3. Fetch quantitative averages (1-4 scale) per unit for both surveys
        const [quantA, quantB] = await Promise.all([
            fetchQuantitativeAverages(parseInt(surveyIdA)),
            fetchQuantitativeAverages(parseInt(surveyIdB)),
        ]);

        // 4. Fetch response rates (enrollment vs respondents)
        const [rateA, rateB] = await Promise.all([
            fetchResponseRates(parseInt(surveyIdA)),
            fetchResponseRates(parseInt(surveyIdB)),
        ]);

        return NextResponse.json({
            surveyA: {
                info: surveyInfoA.data,
                metrics: metricsA,
                quantitative: quantA,
                responseRates: rateA,
            },
            surveyB: {
                info: surveyInfoB.data,
                metrics: metricsB,
                quantitative: quantB,
                responseRates: rateB,
            },
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

async function fetchSurveyMetrics(surveyId: number) {
    // Use the existing RPC
    const { data: rpcData } = await supabase.rpc('get_all_executive_metrics', {
        p_survey_id: surveyId,
    });

    // Also get total respondents and feedback count
    const { count: respondentCount } = await supabase
        .from('respondents')
        .select('*', { count: 'exact', head: true })
        .eq('survey_id', surveyId);

    const { count: feedbackCount } = await supabase
        .from('raw_feedback_inputs')
        .select('id, respondents!inner(survey_id)', { count: 'exact', head: true })
        .eq('respondents.survey_id', surveyId)
        .eq('requires_analysis', true);

    // Calculate per-unit sentiment scores from RPC data
    const unitScores: {
        unit_id: number;
        unit_name: string;
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
            const score = total > 0
                ? Math.round(((pos * 1.0 + neu * 0.5) / total) * 100)
                : 0;

            unitScores.push({
                unit_id: row.unit_id,
                unit_name: row.unit_name || "Unknown",
                positive: pos,
                neutral: neu,
                negative: neg,
                total,
                score,
            });
        }
    }

    // Overall aggregated score
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
        totalFeedback: feedbackCount || 0,
        criticalIssues: totalNeg,
        unitScores,
    };
}

async function fetchQuantitativeAverages(surveyId: number) {
    // Fetch all quantitative inputs (numerical_score between 1-4) grouped by unit
    const { data } = await supabase
        .from('raw_feedback_inputs')
        .select('target_unit_id, numerical_score, respondents!inner(survey_id)')
        .eq('respondents.survey_id', surveyId)
        .eq('is_quantitative', true)
        .not('numerical_score', 'is', null)
        .gte('numerical_score', 1)
        .lte('numerical_score', 4);

    if (!data || data.length === 0) return [];

    // Group by unit and calculate average
    const unitMap = new Map<number, { sum: number; count: number }>();
    for (const row of data) {
        const uid = row.target_unit_id;
        const score = row.numerical_score!;
        const existing = unitMap.get(uid) || { sum: 0, count: 0 };
        existing.sum += score;
        existing.count++;
        unitMap.set(uid, existing);
    }

    // Fetch unit names
    const unitIds = Array.from(unitMap.keys());
    const { data: units } = await supabase
        .from('organization_units')
        .select('id, name, short_name')
        .in('id', unitIds);

    const nameMap = new Map((units || []).map(u => [u.id, u]));

    return Array.from(unitMap.entries()).map(([unitId, stats]) => ({
        unit_id: unitId,
        unit_name: nameMap.get(unitId)?.name || "Unknown",
        unit_short_name: nameMap.get(unitId)?.short_name || nameMap.get(unitId)?.name || "Unknown",
        average: parseFloat((stats.sum / stats.count).toFixed(2)),
        count: stats.count,
    }));
}

async function fetchResponseRates(surveyId: number) {
    // Fetch enrollment data for this survey
    const { data: enrollments } = await supabase
        .from('faculty_enrollment')
        .select('unit_id, student_count')
        .eq('survey_id', surveyId);

    if (!enrollments || enrollments.length === 0) return null;

    // Fetch respondent counts per... we need to map respondents to units
    // Since respondents have faculty, but units might not map directly,
    // we'll return total enrollment vs total respondents for now
    const totalEnrollment = enrollments.reduce((s, e) => s + e.student_count, 0);

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
