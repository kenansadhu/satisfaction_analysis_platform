import { NextResponse } from "next/server";
import { supabaseServer as supabase } from "@/lib/supabase-server";
import { computeSentimentScore } from "@/lib/utils";

/**
 * GET /api/executive/compare?surveyIds=1,2,3
 * Also accepts legacy ?surveyIdA=1&surveyIdB=2 for backward compat.
 */
export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);

    let surveyIds: number[] = [];
    const multi = searchParams.get("surveyIds");
    if (multi) {
        surveyIds = multi.split(",").map(Number).filter(n => !isNaN(n) && n > 0);
    } else {
        const a = searchParams.get("surveyIdA");
        const b = searchParams.get("surveyIdB");
        if (a) surveyIds.push(parseInt(a));
        if (b) surveyIds.push(parseInt(b));
    }

    if (surveyIds.length < 2) {
        return NextResponse.json({ error: "At least 2 survey IDs required" }, { status: 400 });
    }

    try {
        const [surveys, categoryComparison] = await Promise.all([
            Promise.all(surveyIds.map(fetchSingleSurveyData)),
            fetchMultiCategoryComparison(surveyIds),
        ]);

        return NextResponse.json({ surveys, categoryComparison });
    } catch (e: any) {
        console.error("Compare API error:", e.message);
        return NextResponse.json({ error: "Failed to fetch comparison data", details: e.message }, { status: 500 });
    }
}

async function fetchSingleSurveyData(surveyId: number) {
    const [infoRes, metrics, rpcRes, rates, campus] = await Promise.all([
        supabase.from('surveys').select('id, title, year').eq('id', surveyId).single(),
        fetchSurveyMetrics(surveyId),
        supabase.rpc('get_report_aggregates', { p_survey_id: surveyId }),
        fetchResponseRates(surveyId),
        fetchCampusParticipation(surveyId),
    ]);

    const quant = buildSatisfactionIndex(rpcRes.data);

    return {
        info: infoRes.data,
        metrics,
        quantitative: quant.units,
        uphIndex: quant.overall,
        responseRates: rates,
        campusParticipation: campus,
    };
}

function buildSatisfactionIndex(rpcResult: any) {
    const rows: any[] = rpcResult?.unit_campus_scores || [];
    const unitMap: Record<number, { sum: number; count: number }> = {};
    let globalSum = 0, globalCount = 0;

    for (const row of rows) {
        const uid = row.target_unit_id;
        const avg = parseFloat(row.avg_score);
        const count = parseInt(row.score_count);
        if (!unitMap[uid]) unitMap[uid] = { sum: 0, count: 0 };
        unitMap[uid].sum += avg * count;
        unitMap[uid].count += count;
        globalSum += avg * count;
        globalCount += count;
    }

    return {
        overall: globalCount > 0 ? parseFloat((globalSum / globalCount).toFixed(2)) : null,
        units: unitMap,
    };
}

async function fetchSurveyMetrics(surveyId: number) {
    const { data: rpcData } = await supabase.rpc('get_all_executive_metrics', { p_survey_id: surveyId });
    const { count: respondentCount } = await supabase
        .from('respondents').select('*', { count: 'exact', head: true }).eq('survey_id', surveyId);

    const unitScores: any[] = [];
    for (const row of (rpcData || [])) {
        const pos = row.positive_count || 0;
        const neu = row.neutral_count || 0;
        const neg = row.negative_count || 0;
        const total = pos + neu + neg;
        unitScores.push({
            unit_id: row.unit_id,
            unit_name: row.unit_name || "Unknown",
            short_name: row.short_name || row.unit_name || "Unknown",
            positive: pos, neutral: neu, negative: neg, total,
            score: computeSentimentScore(pos, neu, neg),
        });
    }

    const totPos = unitScores.reduce((s, u) => s + u.positive, 0);
    const totNeu = unitScores.reduce((s, u) => s + u.neutral, 0);
    const totNeg = unitScores.reduce((s, u) => s + u.negative, 0);
    const totAll = totPos + totNeu + totNeg;

    return {
        overallScore: totAll > 0 ? Math.round(((totPos + totNeu * 0.5) / totAll) * 100) : 0,
        totalComments: totAll,
        totalRespondents: respondentCount || 0,
        criticalIssues: totNeg,
        unitScores,
    };
}

// Fixed: paginated to handle large surveys
async function fetchCampusParticipation(surveyId: number) {
    const PAGE = 1000;
    let all: { location: string | null }[] = [];
    let from = 0;
    while (true) {
        const { data } = await supabase.from('respondents').select('location')
            .eq('survey_id', surveyId).range(from, from + PAGE - 1);
        if (!data || data.length === 0) break;
        all = all.concat(data);
        if (data.length < PAGE) break;
        from += PAGE;
    }
    const map = new Map<string, number>();
    for (const r of all) map.set(r.location || "Unknown", (map.get(r.location || "Unknown") || 0) + 1);
    return Array.from(map.entries())
        .map(([campus, respondents]) => ({ campus, respondents }))
        .sort((a, b) => b.respondents - a.respondents);
}

async function fetchResponseRates(surveyId: number) {
    const { data: enrollments } = await supabase.from('prodi_enrollment')
        .select('student_count').eq('survey_id', surveyId);
    if (!enrollments || enrollments.length === 0) return null;
    const totalEnrollment = enrollments.reduce((s, e) => s + (e.student_count || 0), 0);
    const { count: totalRespondents } = await supabase.from('respondents')
        .select('*', { count: 'exact', head: true }).eq('survey_id', surveyId);
    return {
        totalEnrollment,
        totalRespondents: totalRespondents || 0,
        responseRate: totalEnrollment > 0
            ? parseFloat(((totalRespondents || 0) / totalEnrollment * 100).toFixed(1))
            : 0,
    };
}

async function getSegmentsForSurvey(sId: number): Promise<{ category_id: number | null; sentiment: string }[]> {
    const { data: resps } = await supabase.from('respondents').select('id').eq('survey_id', sId);
    const respIds = (resps || []).map(r => r.id);
    if (respIds.length === 0) return [];

    const CHUNK = 400;
    const inputIds: number[] = [];
    const inputResults = await Promise.all(
        Array.from({ length: Math.ceil(respIds.length / CHUNK) }, (_, i) =>
            supabase.from('raw_feedback_inputs').select('id')
                .in('respondent_id', respIds.slice(i * CHUNK, (i + 1) * CHUNK))
        )
    );
    for (const res of inputResults) if (res.data) inputIds.push(...res.data.map((d: any) => d.id));
    if (inputIds.length === 0) return [];

    const segs: any[] = [];
    const segResults = await Promise.all(
        Array.from({ length: Math.ceil(inputIds.length / CHUNK) }, (_, i) =>
            supabase.from('feedback_segments').select('category_id, sentiment')
                .in('raw_input_id', inputIds.slice(i * CHUNK, (i + 1) * CHUNK))
        )
    );
    for (const res of segResults) if (res.data) segs.push(...res.data);
    return segs;
}

async function fetchMultiCategoryComparison(surveyIds: number[]) {
    const { data: categories } = await supabase.from('analysis_categories').select('id, name, unit_id');
    if (!categories || categories.length === 0) return [];

    const unitIds = [...new Set(categories.map(c => c.unit_id).filter(Boolean))];
    const { data: units } = await supabase.from('organization_units')
        .select('id, name, short_name').in('id', unitIds);
    const unitMap = new Map((units || []).map(u => [u.id, u]));

    const allSegsArr = await Promise.all(surveyIds.map(getSegmentsForSurvey));

    type CatCount = { positive: number; negative: number; neutral: number; total: number };
    const countMaps: Map<number, CatCount>[] = allSegsArr.map(segs => {
        const map = new Map<number, CatCount>();
        for (const seg of segs) {
            if (!seg.category_id) continue;
            if (!map.has(seg.category_id)) map.set(seg.category_id, { positive: 0, negative: 0, neutral: 0, total: 0 });
            const e = map.get(seg.category_id)!;
            e.total++;
            if (seg.sentiment === "Positive") e.positive++;
            else if (seg.sentiment === "Negative") e.negative++;
            else e.neutral++;
        }
        return map;
    });

    const unitCatMap = new Map<number, any>();
    for (const cat of categories) {
        if (!cat.unit_id) continue;
        if (!unitCatMap.has(cat.unit_id)) {
            const u = unitMap.get(cat.unit_id);
            unitCatMap.set(cat.unit_id, {
                unit_name: u?.name || "Unknown",
                short_name: u?.short_name || u?.name || "Unknown",
                categories: [],
            });
        }
        const counts = countMaps.map(cm => cm.get(cat.id) || { positive: 0, negative: 0, neutral: 0, total: 0 });
        if (counts.some(c => c.total > 0)) {
            unitCatMap.get(cat.unit_id)!.categories.push({ category_name: cat.name, counts });
        }
    }

    for (const entry of unitCatMap.values()) {
        entry.categories.sort((a: any, b: any) =>
            b.counts.reduce((s: number, c: CatCount) => s + c.total, 0) -
            a.counts.reduce((s: number, c: CatCount) => s + c.total, 0)
        );
    }

    return Array.from(unitCatMap.entries())
        .map(([uid, d]) => ({ unit_id: uid, ...d }))
        .filter((u: any) => u.categories.length > 0)
        .sort((a: any, b: any) => a.unit_name.localeCompare(b.unit_name));
}
