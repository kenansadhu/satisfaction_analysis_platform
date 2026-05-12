import { NextRequest, NextResponse } from "next/server";
import { supabaseServer as supabase } from "@/lib/supabase-server";

export const maxDuration = 300;

export async function GET(req: NextRequest) {
    const surveyId = req.nextUrl.searchParams.get("surveyId");
    if (!surveyId) return NextResponse.json({ error: "surveyId required" }, { status: 400 });
    const sid = parseInt(surveyId);

    // 1. Enrollment (small table, always fast)
    const { data: enrollRows } = await supabase
        .from("prodi_enrollment")
        .select("faculty, student_count")
        .eq("survey_id", sid);
    const facEnrollMap = new Map<string, number>();
    for (const e of (enrollRows || [])) {
        const fac = e.faculty || "Unknown";
        facEnrollMap.set(fac, (facEnrollMap.get(fac) || 0) + (e.student_count || 0));
    }

    // 2. Read score cache + sentiment cache in parallel
    const [scoreCacheResult, sentCacheResult] = await Promise.all([
        supabase
            .from("survey_faculty_score_cache")
            .select("faculty, pq_avg_score, pq_score_count, ce_avg_score, ce_score_count")
            .eq("survey_id", sid),
        supabase
            .from("survey_faculty_cache")
            .select("faculty, respondents, positive, negative, neutral, total_segments")
            .eq("survey_id", sid),
    ]);

    // Build sentiment map from faculty-rollup cache (optional enrichment)
    const sentMap = new Map<string, { respondents: number; positive: number; negative: number; neutral: number; total: number }>();
    for (const row of (sentCacheResult.data || [])) {
        sentMap.set(row.faculty, {
            respondents: row.respondents || 0,
            positive: row.positive || 0,
            negative: row.negative || 0,
            neutral: row.neutral || 0,
            total: row.total_segments || 0,
        });
    }

    const scoreCache = scoreCacheResult.data || [];
    const hasScores = scoreCache.some(r => (r.pq_score_count ?? 0) > 0 || (r.ce_score_count ?? 0) > 0);

    if (hasScores) {
        // Cache hit — combine score cache with sentiment cache
        const faculties = scoreCache.map(row => buildEntry(
            row.faculty,
            sentMap.get(row.faculty)?.respondents ?? 0,
            facEnrollMap.get(row.faculty) ?? 0,
            row.pq_avg_score != null ? parseFloat(Number(row.pq_avg_score).toFixed(2)) : null,
            row.ce_avg_score != null ? parseFloat(Number(row.ce_avg_score).toFixed(2)) : null,
            sentMap.get(row.faculty) ?? null,
        ));
        return NextResponse.json({ faculties: faculties.sort((a, b) => b.respondents - a.respondents) });
    }

    // 3. Cache miss — find Study Program unit to split PQ vs CE scores
    const { data: units } = await supabase
        .from("organization_units")
        .select("id, name");
    const studyProgramUnitId = (units || []).find(u => u.name === "Study Program")?.id ?? null;

    // 4. Paginate respondents to get faculty counts
    const respCountMap = new Map<string, number>();
    const PAGE = 1000;
    let from = 0;
    while (true) {
        const { data } = await supabase
            .from("respondents")
            .select("faculty")
            .eq("survey_id", sid)
            .range(from, from + PAGE - 1);
        if (!data || data.length === 0) break;
        for (const r of data) {
            const fac = r.faculty || "Unknown";
            respCountMap.set(fac, (respCountMap.get(fac) || 0) + 1);
        }
        if (data.length < PAGE) break;
        from += PAGE;
    }

    // 5. Paginate raw_feedback_inputs for scores (respondents!inner join — same approach as executive report)
    // Track max per source_column to exclude binary (0/1) questions
    type ColAccum = { sum: number; count: number; max: number };
    const facPQAccum = new Map<string, Map<string, ColAccum>>();
    const facCEAccum = new Map<string, Map<string, ColAccum>>();

    let quantPage = 0;
    while (true) {
        const { data: batch, error } = await supabase
            .from("raw_feedback_inputs")
            .select("target_unit_id, source_column, numerical_score, respondents!inner(faculty)")
            .eq("respondents.survey_id", sid)
            .eq("is_quantitative", true)
            .not("numerical_score", "is", null)
            .not("target_unit_id", "is", null)
            .range(quantPage * PAGE, (quantPage + 1) * PAGE - 1);

        if (error) { console.error("[faculty-list] score fetch error:", error.message); break; }
        if (!batch || batch.length === 0) break;

        for (const row of batch) {
            const faculty = (row.respondents as any)?.faculty || "Unknown";
            const col = row.source_column as string;
            const score = parseFloat(row.numerical_score);
            const unitId = row.target_unit_id as number;
            const isPQ = studyProgramUnitId !== null && unitId === studyProgramUnitId;
            const accMap = isPQ ? facPQAccum : facCEAccum;

            if (!accMap.has(faculty)) accMap.set(faculty, new Map());
            const colMap = accMap.get(faculty)!;
            if (!colMap.has(col)) colMap.set(col, { sum: 0, count: 0, max: 0 });
            const entry = colMap.get(col)!;
            entry.sum += score;
            entry.count++;
            if (score > entry.max) entry.max = score;
        }

        if (batch.length < PAGE) break;
        quantPage++;
    }

    // 6. Aggregate scores per faculty — exclude binary columns (max ≤ 1)
    function aggregateScore(colMap: Map<string, ColAccum>) {
        let sum = 0, count = 0;
        for (const [, entry] of colMap) {
            if (entry.max <= 1) continue;
            sum += entry.sum;
            count += entry.count;
        }
        return count > 0 ? { avg: parseFloat((sum / count).toFixed(2)), count } : { avg: null as null, count: 0 };
    }

    // 7. Build result and write cache (fire-and-forget)
    const allFaculties = new Set([...respCountMap.keys(), ...facEnrollMap.keys()]);
    const faculties: ReturnType<typeof buildEntry>[] = [];
    const cacheRows: any[] = [];

    for (const fac of allFaculties) {
        const respondents = respCountMap.get(fac) || 0;
        const enrolled = facEnrollMap.get(fac) || 0;
        const pq = aggregateScore(facPQAccum.get(fac) || new Map());
        const ce = aggregateScore(facCEAccum.get(fac) || new Map());

        faculties.push(buildEntry(fac, respondents, enrolled, pq.avg, ce.avg, sentMap.get(fac) ?? null));
        cacheRows.push({
            survey_id: sid,
            faculty: fac,
            pq_avg_score: pq.avg,
            pq_score_count: pq.count,
            ce_avg_score: ce.avg,
            ce_score_count: ce.count,
        });
    }

    if (cacheRows.length > 0) {
        supabase.from("survey_faculty_score_cache")
            .upsert(cacheRows, { onConflict: "survey_id,faculty" })
            .then(({ error }) => {
                if (error) console.error("[faculty-score-cache] write error:", error.message);
            });
    }

    return NextResponse.json({ faculties: faculties.sort((a, b) => b.respondents - a.respondents) });
}

function buildEntry(
    faculty: string,
    respondents: number,
    enrolled: number,
    pqAvg: number | null,
    ceAvg: number | null,
    sent: { positive: number; negative: number; neutral: number; total: number } | null,
) {
    const total = sent?.total ?? 0;
    const sentiment = {
        positive: sent?.positive ?? 0,
        negative: sent?.negative ?? 0,
        neutral: sent?.neutral ?? 0,
        total,
        positive_pct: total > 0 ? parseFloat(((sent!.positive / total) * 100).toFixed(1)) : 0,
        negative_pct: total > 0 ? parseFloat(((sent!.negative / total) * 100).toFixed(1)) : 0,
    };
    return {
        faculty,
        respondents,
        enrolled,
        response_rate: enrolled > 0 ? parseFloat((respondents / enrolled * 100).toFixed(1)) : null,
        programQuality: { avg_score: pqAvg, sentiment },
        campusExperience: { avg_score: ceAvg, sentiment },
    };
}
