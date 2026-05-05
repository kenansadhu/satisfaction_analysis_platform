import { NextRequest, NextResponse } from "next/server";
import { supabaseServer as supabase } from "@/lib/supabase-server";

export const maxDuration = 120;

const PAGE = 1000;
// Each respondent has ~20 questions — keep input chunks small so each .in() returns < 1000 rows
const INPUT_CHUNK = 40;
// Each input has ~1-2 segments — 400 input IDs per query is safe
const SEG_CHUNK = 400;
const MAX_CONCURRENT = 5;

async function batchFetch<T>(
    ids: number[],
    chunkSize: number,
    fetcher: (chunk: number[]) => Promise<T[]>
): Promise<T[]> {
    const all: T[] = [];
    for (let bStart = 0; bStart < ids.length; bStart += chunkSize * MAX_CONCURRENT) {
        const chunks: number[][] = [];
        for (let i = bStart; i < Math.min(bStart + chunkSize * MAX_CONCURRENT, ids.length); i += chunkSize)
            chunks.push(ids.slice(i, i + chunkSize));
        const results = await Promise.all(chunks.map(fetcher));
        for (const batch of results) all.push(...batch);
    }
    return all;
}

function emptySentiment() {
    return { positive: 0, negative: 0, neutral: 0, total: 0 };
}

function sentimentStats(s: { positive: number; negative: number; neutral: number; total: number }) {
    return {
        ...s,
        positive_pct: s.total > 0 ? parseFloat((s.positive / s.total * 100).toFixed(1)) : 0,
        negative_pct: s.total > 0 ? parseFloat((s.negative / s.total * 100).toFixed(1)) : 0,
    };
}

export async function GET(req: NextRequest) {
    const sp = req.nextUrl.searchParams;
    const facultyId = parseInt(sp.get("facultyId") || "");
    const surveyId = parseInt(sp.get("surveyId") || "");

    if (!facultyId || !surveyId) {
        return NextResponse.json({ error: "facultyId and surveyId required" }, { status: 400 });
    }

    // ── 1. Parallel lookups ─────────────────────────────────────────────────
    const [facultyResult, unitsResult, enrollResult, categoriesResult] = await Promise.all([
        supabase.from("faculties").select("id, name, short_name, description").eq("id", facultyId).single(),
        supabase.from("organization_units").select("id, name, short_name"),
        supabase.from("prodi_enrollment").select("study_program, student_count").eq("survey_id", surveyId),
        supabase.from("analysis_categories").select("id, name, unit_id"),
    ]);

    if (!facultyResult.data) {
        return NextResponse.json({ error: "Faculty not found" }, { status: 404 });
    }
    const faculty = facultyResult.data;

    const allUnits = unitsResult.data || [];
    const studyProgramUnit = allUnits.find(u => u.name === "Study Program") ?? null;
    const studyProgramUnitId = studyProgramUnit?.id ?? null;
    const serviceUnitMap = new Map(
        allUnits.filter(u => u.name !== "Study Program").map(u => [u.id, u])
    );

    const catMap = new Map((categoriesResult.data || []).map(c => [c.id, c]));

    // Enrollment: sum across campuses per study_program
    const enrollMap = new Map<string, number>();
    for (const e of (enrollResult.data || [])) {
        enrollMap.set(e.study_program, (enrollMap.get(e.study_program) || 0) + (e.student_count || 0));
    }

    // ── 2. Paginate respondents for this faculty ────────────────────────────
    const respondents: { id: number; study_program: string }[] = [];
    let from = 0;
    while (true) {
        const { data } = await supabase.from("respondents")
            .select("id, study_program")
            .eq("survey_id", surveyId)
            .eq("faculty_id", facultyId)
            .range(from, from + PAGE - 1);
        if (!data || data.length === 0) break;
        for (const r of data) respondents.push({ id: r.id, study_program: r.study_program || "Unknown" });
        if (data.length < PAGE) break;
        from += PAGE;
    }

    const respStudyProgramMap = new Map(respondents.map(r => [r.id, r.study_program]));
    const studyProgramRespCount = new Map<string, number>();
    for (const r of respondents) {
        studyProgramRespCount.set(r.study_program, (studyProgramRespCount.get(r.study_program) || 0) + 1);
    }

    const allRespIds = respondents.map(r => r.id);
    if (allRespIds.length === 0) {
        return NextResponse.json({
            faculty,
            totalRespondents: 0,
            totalEnrolled: 0,
            responseRate: null,
            programQuality: { unit: studyProgramUnit, overallScore: null, overallSentiment: sentimentStats(emptySentiment()), studyPrograms: [] },
            campusExperience: { units: [] },
        });
    }

    // ── 3. Batch-fetch raw_feedback_inputs (chunk by 40 respondents) ────────
    // INPUT_CHUNK=40: 40 respondents × ~20 questions = ~800 rows per query, safely under 1000
    type InputRow = { id: number; respondent_id: number; target_unit_id: number | null; is_quantitative: boolean; numerical_score: number | null; source_column: string };
    const allInputs = await batchFetch<InputRow>(allRespIds, INPUT_CHUNK, async (chunk) => {
        const { data } = await supabase.from("raw_feedback_inputs")
            .select("id, respondent_id, target_unit_id, is_quantitative, numerical_score, source_column")
            .in("respondent_id", chunk);
        return (data || []) as InputRow[];
    });

    // Track max score per column to filter binary (0/1) questions
    const colMaxScore = new Map<string, number>();
    const inputUnitMap = new Map<number, number | null>();
    const inputStudyProgramMap = new Map<number, string>();
    const progScoreAccum = new Map<string, { sum: number; count: number }>();
    const unitScoreAccum = new Map<number, { sum: number; count: number }>();

    for (const inp of allInputs) {
        inputUnitMap.set(inp.id, inp.target_unit_id);
        inputStudyProgramMap.set(inp.id, respStudyProgramMap.get(inp.respondent_id) || "Unknown");
        if (inp.is_quantitative && inp.numerical_score !== null) {
            const cur = colMaxScore.get(inp.source_column) ?? 0;
            if (inp.numerical_score > cur) colMaxScore.set(inp.source_column, inp.numerical_score);
        }
    }

    for (const inp of allInputs) {
        if (!inp.is_quantitative || inp.numerical_score === null) continue;
        if ((colMaxScore.get(inp.source_column) ?? 0) <= 1) continue; // binary column

        const studyProg = inputStudyProgramMap.get(inp.id) || "Unknown";
        const unitId = inp.target_unit_id;

        if (unitId === studyProgramUnitId && studyProgramUnitId !== null) {
            if (!progScoreAccum.has(studyProg)) progScoreAccum.set(studyProg, { sum: 0, count: 0 });
            const a = progScoreAccum.get(studyProg)!;
            a.sum += inp.numerical_score; a.count++;
        } else if (unitId !== null && serviceUnitMap.has(unitId)) {
            if (!unitScoreAccum.has(unitId)) unitScoreAccum.set(unitId, { sum: 0, count: 0 });
            const a = unitScoreAccum.get(unitId)!;
            a.sum += inp.numerical_score; a.count++;
        }
    }

    // ── 4. Batch-fetch feedback_segments (chunk by 400 input IDs) ───────────
    // SEG_CHUNK=400: each input has ~1-2 segments → ~400-800 rows per query, safely under 1000
    const allInputIds = allInputs.map(i => i.id);

    type SegRow = { raw_input_id: number; sentiment: string; category_id: number | null };
    const allSegs = await batchFetch<SegRow>(allInputIds, SEG_CHUNK, async (chunk) => {
        const { data } = await supabase.from("feedback_segments")
            .select("raw_input_id, sentiment, category_id")
            .in("raw_input_id", chunk);
        return (data || []) as SegRow[];
    });

    const progSentimentMap = new Map<string, ReturnType<typeof emptySentiment>>();
    const unitSentimentMap = new Map<number, ReturnType<typeof emptySentiment>>();

    // Category counts per study_program: catId → { positive, negative, neutral, total }
    type CatCount = { positive: number; negative: number; neutral: number; total: number };
    const progCatMap = new Map<string, Map<number, CatCount>>();

    for (const seg of allSegs) {
        const unitId = inputUnitMap.get(seg.raw_input_id);
        const studyProg = inputStudyProgramMap.get(seg.raw_input_id) || "Unknown";

        if (unitId === studyProgramUnitId && studyProgramUnitId !== null) {
            if (!progSentimentMap.has(studyProg)) progSentimentMap.set(studyProg, emptySentiment());
            const s = progSentimentMap.get(studyProg)!;
            s.total++;
            if (seg.sentiment === "Positive") s.positive++;
            else if (seg.sentiment === "Negative") s.negative++;
            else s.neutral++;

            // Category breakdown
            if (seg.category_id !== null) {
                if (!progCatMap.has(studyProg)) progCatMap.set(studyProg, new Map());
                const cm = progCatMap.get(studyProg)!;
                if (!cm.has(seg.category_id)) cm.set(seg.category_id, { positive: 0, negative: 0, neutral: 0, total: 0 });
                const cc = cm.get(seg.category_id)!;
                cc.total++;
                if (seg.sentiment === "Positive") cc.positive++;
                else if (seg.sentiment === "Negative") cc.negative++;
                else cc.neutral++;
            }
        } else if (unitId != null && serviceUnitMap.has(unitId)) {
            if (!unitSentimentMap.has(unitId)) unitSentimentMap.set(unitId, emptySentiment());
            const s = unitSentimentMap.get(unitId)!;
            s.total++;
            if (seg.sentiment === "Positive") s.positive++;
            else if (seg.sentiment === "Negative") s.negative++;
            else s.neutral++;
        }
    }

    // ── 5. Resolve top categories per study program ─────────────────────────
    function resolveTopCategories(catCounts: Map<number, CatCount>) {
        const resolved = Array.from(catCounts.entries())
            .filter(([, c]) => c.total >= 2)
            .map(([catId, counts]) => {
                const cat = catMap.get(catId);
                return { category_name: cat?.name || `Category ${catId}`, ...counts };
            });
        return {
            top_positive: [...resolved].sort((a, b) => b.positive - a.positive).slice(0, 3),
            top_negative: [...resolved].sort((a, b) => b.negative - a.negative).slice(0, 3),
        };
    }

    // ── 6. Build response ───────────────────────────────────────────────────
    const knownStudyPrograms = [...studyProgramRespCount.keys()].filter(sp => sp !== "Unknown");

    const studyPrograms = knownStudyPrograms
        .map(sp => {
            const respondentCount = studyProgramRespCount.get(sp) || 0;
            const enrolled = enrollMap.get(sp) ?? null;
            const scoreAcc = progScoreAccum.get(sp);
            const raw = progSentimentMap.get(sp) || emptySentiment();
            const topCategories = resolveTopCategories(progCatMap.get(sp) || new Map());
            return {
                study_program: sp,
                respondents: respondentCount,
                enrolled,
                response_rate: enrolled ? parseFloat((respondentCount / enrolled * 100).toFixed(1)) : null,
                avg_score: scoreAcc ? parseFloat((scoreAcc.sum / scoreAcc.count).toFixed(2)) : null,
                sentiment: sentimentStats(raw),
                top_positive_categories: topCategories.top_positive,
                top_negative_categories: topCategories.top_negative,
            };
        })
        .sort((a, b) => (b.avg_score ?? -1) - (a.avg_score ?? -1));

    const campusUnits = [...serviceUnitMap.values()]
        .map(unit => {
            const scoreAcc = unitScoreAccum.get(unit.id);
            const raw = unitSentimentMap.get(unit.id) || emptySentiment();
            return {
                unit_id: unit.id,
                unit_name: unit.name,
                short_name: unit.short_name,
                avg_score: scoreAcc ? parseFloat((scoreAcc.sum / scoreAcc.count).toFixed(2)) : null,
                score_count: scoreAcc?.count || 0,
                sentiment: sentimentStats(raw),
            };
        })
        .filter(u => u.avg_score !== null || u.sentiment.total > 0)
        .sort((a, b) => (b.avg_score ?? -1) - (a.avg_score ?? -1));

    const totalRespondents = respondents.length;
    const totalEnrolled = knownStudyPrograms.reduce((s, sp) => s + (enrollMap.get(sp) || 0), 0);

    const overallProgScore = (() => {
        let sum = 0, count = 0;
        for (const acc of progScoreAccum.values()) { sum += acc.sum; count += acc.count; }
        return count > 0 ? parseFloat((sum / count).toFixed(2)) : null;
    })();

    const overallProgSentiment = (() => {
        const agg = emptySentiment();
        for (const s of progSentimentMap.values()) {
            agg.positive += s.positive; agg.negative += s.negative;
            agg.neutral += s.neutral; agg.total += s.total;
        }
        return sentimentStats(agg);
    })();

    const overallCampusScore = (() => {
        let sum = 0, count = 0;
        for (const acc of unitScoreAccum.values()) { sum += acc.sum; count += acc.count; }
        return count > 0 ? parseFloat((sum / count).toFixed(2)) : null;
    })();

    const overallCampusSentiment = (() => {
        const agg = emptySentiment();
        for (const s of unitSentimentMap.values()) {
            agg.positive += s.positive; agg.negative += s.negative;
            agg.neutral += s.neutral; agg.total += s.total;
        }
        return sentimentStats(agg);
    })();

    return NextResponse.json({
        faculty,
        totalRespondents,
        totalEnrolled,
        responseRate: totalEnrolled > 0 ? parseFloat((totalRespondents / totalEnrolled * 100).toFixed(1)) : null,
        programQuality: {
            unit: studyProgramUnit,
            overallScore: overallProgScore,
            overallSentiment: overallProgSentiment,
            studyPrograms,
        },
        campusExperience: {
            overallScore: overallCampusScore,
            overallSentiment: overallCampusSentiment,
            units: campusUnits,
        },
    });
}
