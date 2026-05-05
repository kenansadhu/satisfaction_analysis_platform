import { NextRequest, NextResponse } from "next/server";
import { supabaseServer as supabase } from "@/lib/supabase-server";

export const maxDuration = 120;

const INPUT_CHUNK = 40;   // 40 respondents × ~20 questions = ~800 rows/query < 1000
const SEG_CHUNK = 400;    // 400 input IDs × ~1-2 segments = ~400-800 rows/query < 1000
const MAX_CONCURRENT = 5;
const PAGE = 1000;

/**
 * GET /api/executive/faculty-list?surveyId=X
 *
 * Returns per-faculty summaries for the faculty insights list page.
 * For each faculty:
 *  - respondents, enrolled, response_rate
 *  - programQuality: avg_score + sentiment on the "Study Program" unit
 *  - campusExperience: overall sentiment on all other units
 */
export async function GET(req: NextRequest) {
    const surveyId = parseInt(req.nextUrl.searchParams.get("surveyId") || "");
    if (!surveyId) return NextResponse.json({ error: "surveyId required" }, { status: 400 });

    // ── Lookups ─────────────────────────────────────────────────────────────
    const [unitsResult, enrollResult, facultiesResult] = await Promise.all([
        supabase.from("organization_units").select("id, name"),
        supabase.from("prodi_enrollment").select("study_program, faculty, student_count").eq("survey_id", surveyId),
        supabase.from("faculties").select("id, name, short_name"),
    ]);

    const allUnits = unitsResult.data || [];
    const studyProgramUnitId = allUnits.find(u => u.name === "Study Program")?.id ?? null;
    const serviceUnitIds = new Set(allUnits.filter(u => u.name !== "Study Program").map(u => u.id));

    // Enrollment: sum per study_program across campuses, then group by faculty name
    const facEnrollMap = new Map<string, number>();
    for (const e of (enrollResult.data || [])) {
        const fac = e.faculty || "Unknown";
        facEnrollMap.set(fac, (facEnrollMap.get(fac) || 0) + (e.student_count || 0));
    }

    const facultyIdToName = new Map((facultiesResult.data || []).map(f => [f.id, f.name]));

    // ── Paginate ALL respondents for this survey ─────────────────────────────
    type RespRow = { id: number; faculty_id: number | null; faculty: string | null };
    const allRespondents: RespRow[] = [];
    let from = 0;
    while (true) {
        const { data } = await supabase.from("respondents")
            .select("id, faculty_id, faculty")
            .eq("survey_id", surveyId)
            .range(from, from + PAGE - 1);
        if (!data || data.length === 0) break;
        allRespondents.push(...(data as RespRow[]));
        if (data.length < PAGE) break;
        from += PAGE;
    }

    // Build respondent → faculty name map + per-faculty respondent counts
    const respFacultyMap = new Map<number, string>();
    const facRespCount = new Map<string, number>();
    for (const r of allRespondents) {
        const fac = r.faculty || facultyIdToName.get(r.faculty_id ?? -1) || "Unknown";
        respFacultyMap.set(r.id, fac);
        facRespCount.set(fac, (facRespCount.get(fac) || 0) + 1);
    }

    const allRespIds = allRespondents.map(r => r.id);

    // ── Batch-fetch raw_feedback_inputs ──────────────────────────────────────
    type InputRow = { id: number; respondent_id: number; target_unit_id: number | null; is_quantitative: boolean; numerical_score: number | null; source_column: string };
    const allInputs: InputRow[] = [];
    for (let bStart = 0; bStart < allRespIds.length; bStart += INPUT_CHUNK * MAX_CONCURRENT) {
        const chunks: number[][] = [];
        for (let i = bStart; i < Math.min(bStart + INPUT_CHUNK * MAX_CONCURRENT, allRespIds.length); i += INPUT_CHUNK)
            chunks.push(allRespIds.slice(i, i + INPUT_CHUNK));
        const results = await Promise.all(chunks.map(chunk =>
            supabase.from("raw_feedback_inputs")
                .select("id, respondent_id, target_unit_id, is_quantitative, numerical_score, source_column")
                .in("respondent_id", chunk)
        ));
        for (const res of results) if (res.data) allInputs.push(...(res.data as InputRow[]));
    }

    // Max score per column to detect and skip binary questions
    const colMaxScore = new Map<string, number>();
    for (const inp of allInputs) {
        if (inp.is_quantitative && inp.numerical_score !== null) {
            const cur = colMaxScore.get(inp.source_column) ?? 0;
            if (inp.numerical_score > cur) colMaxScore.set(inp.source_column, inp.numerical_score);
        }
    }

    // Build input → faculty map + accumulate scores
    const inputFacultyMap = new Map<number, string>();
    const inputUnitMap = new Map<number, number | null>();

    // Program Quality scores per faculty
    const pqScoreAccum = new Map<string, { sum: number; count: number }>();
    // Campus Experience scores per faculty
    const ceScoreAccum = new Map<string, { sum: number; count: number }>();

    for (const inp of allInputs) {
        const fac = respFacultyMap.get(inp.respondent_id) || "Unknown";
        inputFacultyMap.set(inp.id, fac);
        inputUnitMap.set(inp.id, inp.target_unit_id);

        if (!inp.is_quantitative || inp.numerical_score === null) continue;
        if ((colMaxScore.get(inp.source_column) ?? 0) <= 1) continue;

        if (inp.target_unit_id === studyProgramUnitId && studyProgramUnitId !== null) {
            if (!pqScoreAccum.has(fac)) pqScoreAccum.set(fac, { sum: 0, count: 0 });
            const a = pqScoreAccum.get(fac)!;
            a.sum += inp.numerical_score; a.count++;
        } else if (inp.target_unit_id !== null && serviceUnitIds.has(inp.target_unit_id)) {
            if (!ceScoreAccum.has(fac)) ceScoreAccum.set(fac, { sum: 0, count: 0 });
            const a = ceScoreAccum.get(fac)!;
            a.sum += inp.numerical_score; a.count++;
        }
    }

    // ── Batch-fetch feedback_segments ────────────────────────────────────────
    const allInputIds = allInputs.map(i => i.id);

    type SentAccum = { positive: number; negative: number; neutral: number; total: number };
    const pqSentMap = new Map<string, SentAccum>();
    const ceSentMap = new Map<string, SentAccum>();

    const empty = (): SentAccum => ({ positive: 0, negative: 0, neutral: 0, total: 0 });

    for (let bStart = 0; bStart < allInputIds.length; bStart += SEG_CHUNK * MAX_CONCURRENT) {
        const chunks: number[][] = [];
        for (let i = bStart; i < Math.min(bStart + SEG_CHUNK * MAX_CONCURRENT, allInputIds.length); i += SEG_CHUNK)
            chunks.push(allInputIds.slice(i, i + SEG_CHUNK));
        const results = await Promise.all(chunks.map(chunk =>
            supabase.from("feedback_segments").select("raw_input_id, sentiment").in("raw_input_id", chunk)
        ));
        for (const res of results) {
            if (!res.data) continue;
            for (const seg of res.data) {
                const fac = inputFacultyMap.get(seg.raw_input_id) || "Unknown";
                const unitId = inputUnitMap.get(seg.raw_input_id);

                const target = unitId === studyProgramUnitId && studyProgramUnitId !== null ? pqSentMap
                    : (unitId !== null && serviceUnitIds.has(unitId)) ? ceSentMap : null;
                if (!target) continue;

                if (!target.has(fac)) target.set(fac, empty());
                const s = target.get(fac)!;
                s.total++;
                if (seg.sentiment === "Positive") s.positive++;
                else if (seg.sentiment === "Negative") s.negative++;
                else s.neutral++;
            }
        }
    }

    // ── Build per-faculty result ─────────────────────────────────────────────
    function sentStats(s: SentAccum) {
        return {
            ...s,
            positive_pct: s.total > 0 ? parseFloat((s.positive / s.total * 100).toFixed(1)) : 0,
            negative_pct: s.total > 0 ? parseFloat((s.negative / s.total * 100).toFixed(1)) : 0,
        };
    }

    const allFacNames = new Set([...facRespCount.keys(), ...facEnrollMap.keys()]);
    const faculties = [...allFacNames]
        .filter(f => f !== "Unknown")
        .map(fac => {
            const respondents = facRespCount.get(fac) || 0;
            const enrolled = facEnrollMap.get(fac) || 0;
            const pqAcc = pqScoreAccum.get(fac);
            const ceAcc = ceScoreAccum.get(fac);
            return {
                faculty: fac,
                respondents,
                enrolled,
                response_rate: enrolled > 0 ? parseFloat((respondents / enrolled * 100).toFixed(1)) : null,
                programQuality: {
                    avg_score: pqAcc ? parseFloat((pqAcc.sum / pqAcc.count).toFixed(2)) : null,
                    sentiment: sentStats(pqSentMap.get(fac) || empty()),
                },
                campusExperience: {
                    avg_score: ceAcc ? parseFloat((ceAcc.sum / ceAcc.count).toFixed(2)) : null,
                    sentiment: sentStats(ceSentMap.get(fac) || empty()),
                },
            };
        })
        .sort((a, b) => b.respondents - a.respondents);

    return NextResponse.json({ faculties });
}
