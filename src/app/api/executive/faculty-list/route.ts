import { NextRequest, NextResponse } from "next/server";
import { supabaseServer as supabase } from "@/lib/supabase-server";
import {
    fetchScoreRowsForRespondents,
    loadSubgroupMap,
    computeRespondentUnitScores,
    mean,
} from "@/lib/ssi";

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
            .select("faculty, respondents, pq_avg_score, pq_score_count, ce_avg_score, ce_score_count")
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

    const scoreCache = (scoreCacheResult.data || []) as Array<{
        faculty: string; respondents: number;
        pq_avg_score: number | null; pq_score_count: number;
        ce_avg_score: number | null; ce_score_count: number;
    }>;
    const hasScores = scoreCache.some(r => (r.pq_score_count ?? 0) > 0 || (r.ce_score_count ?? 0) > 0);

    if (hasScores) {
        // Cache hit — combine score cache with sentiment cache
        const faculties = scoreCache.map(row => buildEntry(
            row.faculty,
            row.respondents ?? sentMap.get(row.faculty)?.respondents ?? 0,
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

    // 4. Paginate respondents — capture id+faculty so we can score-fetch by respondent_id below.
    const respCountMap = new Map<string, number>();
    const respFacultyMap = new Map<number, string>(); // respondent_id → faculty
    const PAGE = 1000;
    let from = 0;
    while (true) {
        const { data } = await supabase
            .from("respondents")
            .select("id, faculty")
            .eq("survey_id", sid)
            .range(from, from + PAGE - 1);
        if (!data || data.length === 0) break;
        for (const r of data) {
            const fac = r.faculty || "Unknown";
            respCountMap.set(fac, (respCountMap.get(fac) || 0) + 1);
            respFacultyMap.set(r.id, fac);
        }
        if (data.length < PAGE) break;
        from += PAGE;
    }
    const respIds = [...respFacultyMap.keys()];

    // 5. Fetch raw rows (with proper 1000-row-page pagination) and the per-column
    //    subgroup map. Then compute per-(respondent, unit) macro scores so we can
    //    aggregate PQ and CE the same way the Executive Report does.
    const [allRows, subgroupByColumn] = await Promise.all([
        fetchScoreRowsForRespondents(supabase, respIds),
        loadSubgroupMap(supabase, sid),
    ]);
    const respUnitScores = computeRespondentUnitScores(allRows, subgroupByColumn);

    // 6. Per faculty, split per-respondent scores into Program Quality (the
    //    Study Program unit) and Campus Experience (every other unit). Each
    //    respondent's CE score = mean of their per-unit scores across non-SP
    //    units — equal weight per unit, matching the Executive Report's macro
    //    aggregation for the global SSI.
    //
    //    Faculty PQ = mean of resp_pq_scores for respondents in this faculty.
    //    Faculty CE = mean of resp_ce_scores for respondents in this faculty.
    const respPqScore = new Map<number, number>(); // respondent_id → PQ score
    const respCeScores = new Map<number, number[]>(); // respondent_id → list of per-unit scores
    for (const r of respUnitScores) {
        if (studyProgramUnitId !== null && r.unit_id === studyProgramUnitId) {
            respPqScore.set(r.respondent_id, r.score);
        } else {
            if (!respCeScores.has(r.respondent_id)) respCeScores.set(r.respondent_id, []);
            respCeScores.get(r.respondent_id)!.push(r.score);
        }
    }
    const respCeScore = new Map<number, number>();
    for (const [respId, scores] of respCeScores) {
        const m = mean(scores);
        if (m !== null) respCeScore.set(respId, m);
    }

    // 7. Build result and write cache (fire-and-forget)
    const allFaculties = new Set([...respCountMap.keys(), ...facEnrollMap.keys()]);
    const faculties: ReturnType<typeof buildEntry>[] = [];
    const cacheRows: any[] = [];

    for (const fac of allFaculties) {
        const respondents = respCountMap.get(fac) || 0;
        const enrolled = facEnrollMap.get(fac) || 0;

        // Collect per-respondent PQ + CE scores for respondents in this faculty
        const pqScores: number[] = [];
        const ceScores: number[] = [];
        for (const [respId, facName] of respFacultyMap) {
            if (facName !== fac) continue;
            const pq = respPqScore.get(respId);
            if (pq !== undefined) pqScores.push(pq);
            const ce = respCeScore.get(respId);
            if (ce !== undefined) ceScores.push(ce);
        }
        const pqAvg = mean(pqScores);
        const ceAvg = mean(ceScores);
        const pqDisplay = pqAvg !== null ? parseFloat(pqAvg.toFixed(2)) : null;
        const ceDisplay = ceAvg !== null ? parseFloat(ceAvg.toFixed(2)) : null;

        faculties.push(buildEntry(fac, respondents, enrolled, pqDisplay, ceDisplay, sentMap.get(fac) ?? null));
        cacheRows.push({
            survey_id: sid,
            faculty: fac,
            respondents,
            // Store full precision so the display layer can round once.
            pq_avg_score: pqAvg,
            pq_score_count: pqScores.length,
            ce_avg_score: ceAvg,
            ce_score_count: ceScores.length,
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
