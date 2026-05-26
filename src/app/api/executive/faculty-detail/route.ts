import { NextRequest, NextResponse } from "next/server";
import { supabaseServer as supabase } from "@/lib/supabase-server";
import { parseSettingArray } from "@/lib/platformSettings";
import {
    fetchScoreRowsForRespondents,
    loadSubgroupMap,
    computeRespondentUnitScores,
    mean,
} from "@/lib/ssi";

export const maxDuration = 120;

const PAGE = 1000;
// Each respondent has ~20 questions — keep input chunks small so each .in() returns < 1000 rows
// 20 respondents × ~25 inputs ≈ 500 rows/chunk — safely under Supabase's 1000-row default.
// .range(0, 9999) is also added on each inner query as a belt-and-suspenders override.
const INPUT_CHUNK = 20;
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

    // ── 0. Cache check ──────────────────────────────────────────────────────
    const cacheKey = `faculty_detail_v7_${facultyId}`;
    const { data: cached, error: cacheErr } = await supabase
        .from("survey_misc_cache")
        .select("data")
        .eq("survey_id", surveyId)
        .eq("cache_key", cacheKey)
        .maybeSingle();
    if (!cacheErr && cached?.data) {
        console.log(`[faculty-detail] Cache hit: survey ${surveyId} faculty ${facultyId}`);
        return NextResponse.json(cached.data);
    }

    // ── 1. Parallel lookups ─────────────────────────────────────────────────
    const [facultyResult, unitsResult, enrollResult, categoriesResult, npsSettingRes, studyProgSettingRes] = await Promise.all([
        supabase.from("faculties").select("id, name, short_name, description").eq("id", facultyId).single(),
        supabase.from("organization_units").select("id, name, short_name"),
        supabase.from("prodi_enrollment").select("study_program, student_count").eq("survey_id", surveyId),
        supabase.from("analysis_categories").select("id, name, unit_id"),
        supabase.from("platform_settings").select("value").eq("key", "nps_unit_ids").maybeSingle(),
        supabase.from("platform_settings").select("value").eq("key", "study_program_unit_id").maybeSingle(),
    ]);
    const npsUnitIds: number[] = parseSettingArray<number>(npsSettingRes.data?.value);
    const studyProgramUnitIdSetting = studyProgSettingRes.data?.value != null
        ? parseInt(studyProgSettingRes.data.value)
        : null;

    if (!facultyResult.data) {
        return NextResponse.json({ error: "Faculty not found" }, { status: 404 });
    }
    const faculty = facultyResult.data;

    const allUnits = unitsResult.data || [];
    // Prefer the configurable setting; fall back to finding by exact name "Study Program"
    const studyProgramUnit = studyProgramUnitIdSetting != null
        ? (allUnits.find(u => u.id === studyProgramUnitIdSetting) ?? null)
        : (allUnits.find(u => u.name === "Study Program") ?? null);
    const studyProgramUnitId = studyProgramUnit?.id ?? null;
    const serviceUnitMap = new Map(
        allUnits.filter(u => u.id !== studyProgramUnitId && !npsUnitIds.includes(u.id)).map(u => [u.id, u])
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

    // ── 2.5. Dedicated NPS fetch — scoped to NPS units only ─────────────────
    // NPS units have ≤2 inputs per respondent so 400-respondent chunks stay well under 1000 rows.
    const NPS_CHUNK = 400;
    const progNpsMap = new Map<string, { promoters: number; passives: number; detractors: number; total: number }>();
    if (npsUnitIds.length > 0) {
        for (let i = 0; i < allRespIds.length; i += NPS_CHUNK) {
            const chunk = allRespIds.slice(i, i + NPS_CHUNK);
            const { data: npsInputs } = await supabase
                .from("raw_feedback_inputs")
                .select("respondent_id, numerical_score")
                .in("respondent_id", chunk)
                .in("target_unit_id", npsUnitIds)
                .eq("score_rule", "NPS_0_10")
                .not("numerical_score", "is", null);
            for (const inp of (npsInputs || [])) {
                const studyProg = respStudyProgramMap.get(inp.respondent_id) || "Unknown";
                if (studyProg === "Unknown") continue;
                if (!progNpsMap.has(studyProg)) progNpsMap.set(studyProg, { promoters: 0, passives: 0, detractors: 0, total: 0 });
                const n = progNpsMap.get(studyProg)!;
                n.total++;
                const score = Number(inp.numerical_score);
                if (score >= 9) n.promoters++;
                else if (score >= 7) n.passives++;
                else n.detractors++;
            }
        }
    }

    // ── 3. Batch-fetch raw_feedback_inputs (chunk by 40 respondents) ────────
    // We still need id+sentiment data via the inputs table so we can map segments
    // → unit/study_program below. Score computation now uses computeRespondentUnitScores
    // (per-respondent macro with subgroup-aware bucketing) — see lib/ssi.ts.
    // INPUT_CHUNK=40 and SEG_CHUNK=400 still apply; we paginate the score fetch separately.
    type InputRow = { id: number; respondent_id: number; target_unit_id: number | null; is_quantitative: boolean; numerical_score: number | null; score_rule: string | null; source_column: string };
    const allInputs = await batchFetch<InputRow>(allRespIds, INPUT_CHUNK, async (chunk) => {
        const rows: InputRow[] = [];
        let from = 0;
        while (true) {
            const { data } = await supabase.from("raw_feedback_inputs")
                .select("id, respondent_id, target_unit_id, is_quantitative, numerical_score, score_rule, source_column")
                .in("respondent_id", chunk)
                .order("id")
                .range(from, from + 999);
            if (!data?.length) break;
            rows.push(...(data as InputRow[]));
            if (data.length < 1000) break;
            from += 1000;
        }
        return rows;
    });

    // Map input → unit + study_program for the segments-walk below.
    const inputUnitMap = new Map<number, number | null>();
    const inputStudyProgramMap = new Map<number, string>();
    for (const inp of allInputs) {
        inputUnitMap.set(inp.id, inp.target_unit_id);
        inputStudyProgramMap.set(inp.id, respStudyProgramMap.get(inp.respondent_id) || "Unknown");
    }

    // ── 3b. Compute per-(respondent, unit) macro scores using the shared helper ─
    //   - Per respondent, group scores by subgroup_name (unassigned cols are their own
    //     buckets), avg per bucket, then avg across buckets → respondent's unit score.
    //   - The helper handles SSI-included filtering (max > 1, ≤ 5) and the 1000-row
    //     pagination cap that bit the old implementation.
    const subgroupByColumn = await loadSubgroupMap(supabase, surveyId);
    const scoreRows = await fetchScoreRowsForRespondents(supabase, allRespIds);
    const respUnitScores = computeRespondentUnitScores(scoreRows, subgroupByColumn);

    // Per study_program: collect Study Program unit scores for respondents in that program.
    const progRespScores = new Map<string, number[]>();
    // Per service unit: collect per-respondent scores for respondents in this faculty.
    const unitRespScores = new Map<number, number[]>();

    for (const r of respUnitScores) {
        const studyProg = respStudyProgramMap.get(r.respondent_id) || "Unknown";
        if (studyProgramUnitId !== null && r.unit_id === studyProgramUnitId) {
            if (!progRespScores.has(studyProg)) progRespScores.set(studyProg, []);
            progRespScores.get(studyProg)!.push(r.score);
        } else if (serviceUnitMap.has(r.unit_id)) {
            if (!unitRespScores.has(r.unit_id)) unitRespScores.set(r.unit_id, []);
            unitRespScores.get(r.unit_id)!.push(r.score);
        }
    }

    // Convenience: mean of an array, undefined-safe for the legacy callsites below.
    const meanOf = (arr: number[] | undefined) => arr && arr.length > 0 ? mean(arr) : null;

    // ── 4. Batch-fetch feedback_segments (chunk by 400 input IDs) ───────────
    // Only qualitative (text) inputs have meaningful sentiment segments.
    // Quantitative inputs (rating scales) may have auto-generated segments
    // derived from numerical scores, which would skew sentiment counts.
    // Student Voices also filters to is_quantitative=false, so this keeps both in sync.
    const allInputIds = allInputs.filter(i => !i.is_quantitative).map(i => i.id);

    type SegRow = { id: number; raw_input_id: number; sentiment: string; category_id: number | null };
    const allSegs = await batchFetch<SegRow>(allInputIds, SEG_CHUNK, async (chunk) => {
        const rows: SegRow[] = [];
        let from = 0;
        while (true) {
            const { data } = await supabase.from("feedback_segments")
                .select("id, raw_input_id, sentiment, category_id")
                .in("raw_input_id", chunk)
                .order("id")
                .range(from, from + 999);
            if (!data?.length) break;
            rows.push(...(data as SegRow[]));
            if (data.length < 1000) break;
            from += 1000;
        }
        return rows;
    });

    const progSentimentMap = new Map<string, ReturnType<typeof emptySentiment>>();
    const unitSentimentMap = new Map<number, ReturnType<typeof emptySentiment>>();

    // Category counts per study_program: catId → { positive, negative, neutral, total }
    type CatCount = { positive: number; negative: number; neutral: number; total: number };
    const progCatMap = new Map<string, Map<number, CatCount>>();

    for (const seg of allSegs) {
        const unitId = inputUnitMap.get(seg.raw_input_id);
        const studyProg = inputStudyProgramMap.get(seg.raw_input_id) || "Unknown";

        // Study-program-related: Prodi unit OR NPS unit (NPS follow-up text explains
        // why students would/wouldn't recommend their program — program sentiment, not campus).
        const isStudyProgramSeg = (unitId === studyProgramUnitId && studyProgramUnitId !== null)
            || (unitId != null && npsUnitIds.includes(unitId));

        if (isStudyProgramSeg) {
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
            const spScore = meanOf(progRespScores.get(sp));
            const raw = progSentimentMap.get(sp) || emptySentiment();
            const topCategories = resolveTopCategories(progCatMap.get(sp) || new Map());
            const npsAgg = progNpsMap.get(sp);
            return {
                study_program: sp,
                respondents: respondentCount,
                enrolled,
                response_rate: enrolled ? parseFloat((respondentCount / enrolled * 100).toFixed(1)) : null,
                avg_score: spScore !== null ? parseFloat(spScore.toFixed(2)) : null,
                sentiment: sentimentStats(raw),
                top_positive_categories: topCategories.top_positive,
                top_negative_categories: topCategories.top_negative,
                nps: npsAgg && npsAgg.total > 0 ? {
                    nps_score: parseFloat(((npsAgg.promoters - npsAgg.detractors) / npsAgg.total * 100).toFixed(1)),
                    promoters: npsAgg.promoters,
                    passives: npsAgg.passives,
                    detractors: npsAgg.detractors,
                    total: npsAgg.total,
                } : null,
            };
        })
        .sort((a, b) => (b.avg_score ?? -1) - (a.avg_score ?? -1));

    const campusUnits = [...serviceUnitMap.values()]
        .map(unit => {
            const respScores = unitRespScores.get(unit.id);
            const unitScore = meanOf(respScores);
            const raw = unitSentimentMap.get(unit.id) || emptySentiment();
            return {
                unit_id: unit.id,
                unit_name: unit.name,
                short_name: unit.short_name,
                avg_score: unitScore !== null ? parseFloat(unitScore.toFixed(2)) : null,
                score_count: respScores?.length || 0,
                sentiment: sentimentStats(raw),
            };
        })
        .filter(u => u.avg_score !== null || u.sentiment.total > 0)
        .sort((a, b) => (b.avg_score ?? -1) - (a.avg_score ?? -1));

    const totalRespondents = respondents.length;
    const totalEnrolled = knownStudyPrograms.reduce((s, sp) => s + (enrollMap.get(sp) || 0), 0);

    // Overall program quality for the faculty = mean of per-respondent Study Program
    // scores across every respondent in the faculty (each respondent contributes once).
    // Equivalent to the faculty-list cache's pq_avg_score.
    const overallProgScore = (() => {
        const all: number[] = [];
        for (const arr of progRespScores.values()) all.push(...arr);
        const m = mean(all);
        return m !== null ? parseFloat(m.toFixed(2)) : null;
    })();

    const overallProgSentiment = (() => {
        const agg = emptySentiment();
        for (const s of progSentimentMap.values()) {
            agg.positive += s.positive; agg.negative += s.negative;
            agg.neutral += s.neutral; agg.total += s.total;
        }
        return sentimentStats(agg);
    })();

    // Overall campus experience for the faculty = per-respondent macro across
    // service units (each respondent's CE score = mean of their per-unit scores
    // across non-Study-Program units; faculty CE = mean of those). Matches the
    // faculty-list cache's ce_avg_score so both pages agree.
    const overallCampusScore = (() => {
        const respCe = new Map<number, number[]>();
        for (const r of respUnitScores) {
            if (studyProgramUnitId !== null && r.unit_id === studyProgramUnitId) continue;
            if (!serviceUnitMap.has(r.unit_id)) continue;
            if (!respCe.has(r.respondent_id)) respCe.set(r.respondent_id, []);
            respCe.get(r.respondent_id)!.push(r.score);
        }
        const perRespCe: number[] = [];
        for (const [, scores] of respCe) {
            const m = mean(scores);
            if (m !== null) perRespCe.push(m);
        }
        const m = mean(perRespCe);
        return m !== null ? parseFloat(m.toFixed(2)) : null;
    })();

    const overallCampusSentiment = (() => {
        const agg = emptySentiment();
        for (const s of unitSentimentMap.values()) {
            agg.positive += s.positive; agg.negative += s.negative;
            agg.neutral += s.neutral; agg.total += s.total;
        }
        return sentimentStats(agg);
    })();

    const responsePayload = {
        faculty,
        npsUnitIds,
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
    };

    // Write to cache (fire-and-forget)
    supabase.from("survey_misc_cache")
        .upsert(
            { survey_id: surveyId, cache_key: cacheKey, data: responsePayload, updated_at: new Date().toISOString() },
            { onConflict: "survey_id,cache_key" }
        )
        .then(({ error: writeErr }) => {
            if (writeErr) console.error("[faculty-detail-cache] write error:", writeErr.message);
            else console.log(`[faculty-detail-cache] cached survey ${surveyId} faculty ${facultyId}`);
        });

    return NextResponse.json(responsePayload);
}
