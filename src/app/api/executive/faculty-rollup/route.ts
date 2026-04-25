import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const maxDuration = 60;

/**
 * GET /api/executive/faculty-rollup?surveyId=X
 *
 * Returns per-faculty participation, sentiment, and top categories.
 * Uses survey_faculty_cache. On cache miss, computes from raw data and caches.
 *
 * Required SQL (run once in Supabase):
 *   CREATE TABLE survey_faculty_cache (
 *     survey_id      INTEGER NOT NULL,
 *     faculty        TEXT    NOT NULL,
 *     respondents    INTEGER NOT NULL DEFAULT 0,
 *     enrolled       INTEGER NOT NULL DEFAULT 0,
 *     positive       INTEGER NOT NULL DEFAULT 0,
 *     negative       INTEGER NOT NULL DEFAULT 0,
 *     neutral        INTEGER NOT NULL DEFAULT 0,
 *     total_segments INTEGER NOT NULL DEFAULT 0,
 *     top_categories JSONB,
 *     PRIMARY KEY (survey_id, faculty)
 *   );
 */
export async function GET(req: NextRequest) {
    const surveyId = req.nextUrl.searchParams.get("surveyId");
    if (!surveyId) return NextResponse.json({ error: "surveyId required" }, { status: 400 });
    const sid = parseInt(surveyId);

    // ── Try cache ──────────────────────────────────────────────────────────────
    const { data: cached, error: cacheErr } = await supabase
        .from("survey_faculty_cache")
        .select("faculty, respondents, enrolled, positive, negative, neutral, total_segments, top_categories")
        .eq("survey_id", sid);

    // Cache hit only if rows exist AND top_categories is populated (not a pre-migration row)
    if (!cacheErr && cached && cached.length > 0 && cached.some(r => r.top_categories !== null)) {
        return NextResponse.json({ faculties: buildResult(cached), fromCache: true });
    }

    // ── Cache miss: compute from raw data ──────────────────────────────────────
    const [enrollResult, categoriesResult, unitsResult] = await Promise.all([
        supabase.from("prodi_enrollment").select("faculty, student_count").eq("survey_id", sid),
        supabase.from("analysis_categories").select("id, name, unit_id"),
        supabase.from("organization_units").select("id, name, short_name"),
    ]);

    const enrollMap = new Map<string, number>();
    for (const row of (enrollResult.data || [])) {
        const fac = row.faculty || "Unknown";
        enrollMap.set(fac, (enrollMap.get(fac) || 0) + (row.student_count || 0));
    }

    const categoryInfoMap = new Map(
        (categoriesResult.data || []).map(c => [c.id, { name: c.name, unit_id: c.unit_id }])
    );
    const unitInfoMap = new Map(
        (unitsResult.data || []).map(u => [u.id, { name: u.name, short_name: u.short_name }])
    );

    // Paginate respondents
    const PAGE = 1000;
    const allRespondents: { id: number; faculty: string }[] = [];
    let from = 0;
    while (true) {
        const { data } = await supabase.from("respondents")
            .select("id, faculty").eq("survey_id", sid).range(from, from + PAGE - 1);
        if (!data || data.length === 0) break;
        for (const r of data) allRespondents.push({ id: r.id, faculty: r.faculty || "Unknown" });
        if (data.length < PAGE) break;
        from += PAGE;
    }

    const respFacultyMap = new Map<number, string>();
    const respCountMap = new Map<string, number>();
    for (const r of allRespondents) {
        respFacultyMap.set(r.id, r.faculty);
        respCountMap.set(r.faculty, (respCountMap.get(r.faculty) || 0) + 1);
    }

    // Batch-fetch raw_feedback_inputs
    const CHUNK = 400;
    const MAX_CONCURRENT = 5;
    const allRespIds = allRespondents.map(r => r.id);
    const inputFacultyMap = new Map<number, string>();

    for (let bStart = 0; bStart < allRespIds.length; bStart += CHUNK * MAX_CONCURRENT) {
        const chunks: number[][] = [];
        for (let i = bStart; i < Math.min(bStart + CHUNK * MAX_CONCURRENT, allRespIds.length); i += CHUNK)
            chunks.push(allRespIds.slice(i, i + CHUNK));
        const results = await Promise.all(chunks.map(chunk =>
            supabase.from("raw_feedback_inputs").select("id, respondent_id")
                .in("respondent_id", chunk).eq("is_quantitative", false)
        ));
        for (const res of results) {
            if (!res.data) continue;
            for (const inp of res.data)
                inputFacultyMap.set(inp.id, respFacultyMap.get(inp.respondent_id) || "Unknown");
        }
    }

    // Batch-fetch feedback_segments (sentiment + category_id)
    const allInputIds = [...inputFacultyMap.keys()];
    type Counts = { positive: number; negative: number; neutral: number; total: number };
    const sentimentMap = new Map<string, Counts>();
    const catByFaculty = new Map<string, Map<number, Counts>>(); // faculty → catId → counts

    for (let bStart = 0; bStart < allInputIds.length; bStart += CHUNK * MAX_CONCURRENT) {
        const chunks: number[][] = [];
        for (let i = bStart; i < Math.min(bStart + CHUNK * MAX_CONCURRENT, allInputIds.length); i += CHUNK)
            chunks.push(allInputIds.slice(i, i + CHUNK));
        const results = await Promise.all(chunks.map(chunk =>
            supabase.from("feedback_segments").select("raw_input_id, sentiment, category_id")
                .in("raw_input_id", chunk)
        ));
        for (const res of results) {
            if (!res.data) continue;
            for (const seg of res.data) {
                const fac = inputFacultyMap.get(seg.raw_input_id) || "Unknown";

                // Sentiment totals
                if (!sentimentMap.has(fac)) sentimentMap.set(fac, { positive: 0, negative: 0, neutral: 0, total: 0 });
                const sc = sentimentMap.get(fac)!;
                sc.total++;
                if (seg.sentiment === "Positive") sc.positive++;
                else if (seg.sentiment === "Negative") sc.negative++;
                else sc.neutral++;

                // Category breakdown
                if (seg.category_id) {
                    if (!catByFaculty.has(fac)) catByFaculty.set(fac, new Map());
                    const cm = catByFaculty.get(fac)!;
                    if (!cm.has(seg.category_id)) cm.set(seg.category_id, { positive: 0, negative: 0, neutral: 0, total: 0 });
                    const cc = cm.get(seg.category_id)!;
                    cc.total++;
                    if (seg.sentiment === "Positive") cc.positive++;
                    else if (seg.sentiment === "Negative") cc.negative++;
                    else cc.neutral++;
                }
            }
        }
    }

    // Resolve top categories per faculty
    const topCatByFaculty = new Map<string, any[]>();
    for (const [fac, catCounts] of catByFaculty) {
        const resolved = Array.from(catCounts.entries())
            .filter(([, c]) => c.total >= 2)
            .map(([catId, counts]) => {
                const cat = categoryInfoMap.get(catId);
                const unit = cat ? unitInfoMap.get(cat.unit_id) : null;
                return {
                    category_name: cat?.name || `Category ${catId}`,
                    unit_name: unit?.name || "Unknown",
                    unit_short_name: unit?.short_name || unit?.name || "Unknown",
                    ...counts,
                };
            });
        topCatByFaculty.set(fac, resolved);
    }

    // Build cache rows
    const allFaculties = [...new Set([...respCountMap.keys(), ...enrollMap.keys()])];
    const cacheRows = allFaculties.map(faculty => {
        const s = sentimentMap.get(faculty) || { positive: 0, negative: 0, neutral: 0, total: 0 };
        return {
            survey_id: sid,
            faculty,
            respondents: respCountMap.get(faculty) || 0,
            enrolled: enrollMap.get(faculty) || 0,
            positive: s.positive,
            negative: s.negative,
            neutral: s.neutral,
            total_segments: s.total,
            top_categories: topCatByFaculty.get(faculty) || [],
        };
    });

    // Fire-and-forget cache write
    supabase.from("survey_faculty_cache")
        .upsert(cacheRows, { onConflict: "survey_id,faculty" })
        .then(({ error }) => {
            if (error) console.error("[faculty-cache] write error:", error.message);
            else console.log(`[faculty-cache] wrote ${cacheRows.length} rows for survey ${sid}`);
        });

    return NextResponse.json({ faculties: buildResult(cacheRows), fromCache: false });
}

function buildResult(rows: any[]) {
    return rows
        .map(r => {
            const cats: any[] = Array.isArray(r.top_categories) ? r.top_categories : [];
            return {
                faculty: r.faculty,
                respondents: r.respondents,
                enrolled: r.enrolled,
                response_rate: r.enrolled > 0
                    ? parseFloat((r.respondents / r.enrolled * 100).toFixed(1))
                    : null,
                sentiment: {
                    positive: r.positive,
                    negative: r.negative,
                    neutral: r.neutral,
                    total: r.total_segments,
                    positive_pct: r.total_segments > 0
                        ? parseFloat((r.positive / r.total_segments * 100).toFixed(1))
                        : 0,
                    negative_pct: r.total_segments > 0
                        ? parseFloat((r.negative / r.total_segments * 100).toFixed(1))
                        : 0,
                },
                top_positive_categories: [...cats]
                    .sort((a, b) => b.positive - a.positive)
                    .slice(0, 3),
                top_negative_categories: [...cats]
                    .sort((a, b) => b.negative - a.negative)
                    .slice(0, 3),
            };
        })
        .sort((a, b) => b.respondents - a.respondents);
}
