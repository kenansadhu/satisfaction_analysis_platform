import { NextResponse } from "next/server";
import { supabaseServer as supabase } from "@/lib/supabase-server";

// Server-side aggregation for the unit insights tab.
// Returns pre-computed metrics without any text content — no raw_text, no segment_text.
// This is ~10-30x faster than the client-side fetch because:
//   1. Server ↔ Supabase latency is ~5ms vs browser's ~200ms
//   2. No large text payloads transferred to the browser
//   3. All aggregation runs in Node, not in the browser
export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const unitId = searchParams.get("unitId");
    const surveyId = searchParams.get("surveyId");

    if (!unitId || !surveyId) {
        return NextResponse.json({ error: "unitId and surveyId required" }, { status: 400 });
    }

    // Optional filters passed as repeated params: ?location=X&location=Y
    const locationFilter = searchParams.getAll("location");
    const facultyFilter = searchParams.getAll("faculty");
    const programFilter = searchParams.getAll("program");
    const sentimentFilter = searchParams.getAll("sentiment");
    const categoryFilter = searchParams.getAll("category");

    const RESP_PAGE = 1000;
    const CHUNK = 500;
    const SEG_CHUNK = 1000;

    // ── 1. Fetch all respondents for the survey (demographics only) ──────────
    const respMap = new Map<number, { faculty: string; location: string; study_program: string }>();
    for (let page = 0; ; page++) {
        const { data } = await supabase
            .from("respondents")
            .select("id, faculty, location, study_program")
            .eq("survey_id", parseInt(surveyId))
            .range(page * RESP_PAGE, (page + 1) * RESP_PAGE - 1);
        if (!data || data.length === 0) break;
        for (const r of data) {
            respMap.set(r.id, {
                faculty: r.faculty || "",
                location: r.location || "",
                study_program: r.study_program || "",
            });
        }
        if (data.length < RESP_PAGE) break;
    }

    const allRespIds = Array.from(respMap.keys());

    // Cross-filtered options: each dimension narrows to respondents matching the OTHER active filters
    const locations = new Set<string>();
    const faculties = new Set<string>();
    const programs = new Set<string>();
    for (const [, r] of respMap) {
        const matchFac = facultyFilter.length === 0 || facultyFilter.includes(r.faculty);
        const matchLoc = locationFilter.length === 0 || locationFilter.includes(r.location);
        const matchProg = programFilter.length === 0 || programFilter.includes(r.study_program);
        if (matchFac && matchProg && r.location) locations.add(r.location);
        if (matchLoc && matchProg && r.faculty) faculties.add(r.faculty);
        if (matchLoc && matchFac && r.study_program) programs.add(r.study_program);
    }

    // Apply demographic filters to respondent IDs
    let filteredRespIds = allRespIds;
    if (locationFilter.length > 0) filteredRespIds = filteredRespIds.filter(id => locationFilter.includes(respMap.get(id)?.location ?? ""));
    if (facultyFilter.length > 0)  filteredRespIds = filteredRespIds.filter(id => facultyFilter.includes(respMap.get(id)?.faculty ?? ""));
    if (programFilter.length > 0)  filteredRespIds = filteredRespIds.filter(id => programFilter.includes(respMap.get(id)?.study_program ?? ""));

    // ── 2. Fetch text input IDs (no text content) ────────────────────────────
    const inputToResp = new Map<number, number>(); // input_id → respondent_id
    const inputFetches: PromiseLike<void>[] = [];
    for (let i = 0; i < filteredRespIds.length; i += CHUNK) {
        const chunk = filteredRespIds.slice(i, i + CHUNK);
        inputFetches.push(
            supabase
                .from("raw_feedback_inputs")
                .select("id, respondent_id")
                .eq("target_unit_id", parseInt(unitId))
                .eq("is_quantitative", false)
                .eq("requires_analysis", false)
                .in("respondent_id", chunk)
                .then(({ data }) => {
                    if (data) for (const r of data) inputToResp.set(r.id, r.respondent_id);
                })
        );
    }
    await Promise.all(inputFetches);
    const allInputIds = Array.from(inputToResp.keys());

    // ── 3. Fetch analysis categories for the unit ────────────────────────────
    const { data: catData } = await supabase
        .from("analysis_categories")
        .select("id, name")
        .eq("unit_id", parseInt(unitId));
    const catMap = new Map((catData || []).map(c => [c.id, c.name as string]));

    // ── 4. Fetch segment data — only (sentiment, category_id, raw_input_id) ──
    type SegRow = { category_id: number; sentiment: string; raw_input_id: number };
    const allSegs: SegRow[] = [];
    const segFetches: PromiseLike<void>[] = [];
    for (let i = 0; i < allInputIds.length; i += SEG_CHUNK) {
        const chunk = allInputIds.slice(i, i + SEG_CHUNK);
        segFetches.push(
            supabase
                .from("feedback_segments")
                .select("sentiment, category_id, raw_input_id")
                .in("raw_input_id", chunk)
                .then(({ data }) => { if (data) allSegs.push(...(data as SegRow[])); })
        );
    }
    await Promise.all(segFetches);

    // ── 5. Aggregate ─────────────────────────────────────────────────────────
    type CatCount = {
        category_name: string;
        positive_count: number; negative_count: number; neutral_count: number;
        total: number; true_negative_count: number;
    };
    type FacCount = { faculty_name: string; positive: number; negative: number; neutral: number; total: number };

    const catCountsMap = new Map<string, CatCount>();
    const facCountsMap = new Map<string, FacCount>();
    const sentCounts = { Positive: 0, Negative: 0, Neutral: 0 };
    let totalSegments = 0;
    const inputsWithSegments = new Set<number>();

    for (const seg of allSegs) {
        const catName = catMap.get(seg.category_id);
        if (!catName) continue;
        if (categoryFilter.length > 0 && !categoryFilter.includes(catName)) continue;
        if (sentimentFilter.length > 0 && !sentimentFilter.includes(seg.sentiment)) continue;

        const respId = inputToResp.get(seg.raw_input_id);
        const resp = respId ? respMap.get(respId) : null;
        const faculty = resp?.faculty || "Unknown";

        if (!catCountsMap.has(catName)) {
            catCountsMap.set(catName, { category_name: catName, positive_count: 0, negative_count: 0, neutral_count: 0, total: 0, true_negative_count: 0 });
        }
        const cat = catCountsMap.get(catName)!;
        cat.total++;
        if (seg.sentiment === "Negative") cat.true_negative_count++;
        if (seg.sentiment === "Positive") cat.positive_count++;
        else if (seg.sentiment === "Negative") cat.negative_count++;
        else cat.neutral_count++;

        sentCounts[seg.sentiment as keyof typeof sentCounts]++;
        totalSegments++;
        inputsWithSegments.add(seg.raw_input_id);

        if (!facCountsMap.has(faculty)) {
            facCountsMap.set(faculty, { faculty_name: faculty, positive: 0, negative: 0, neutral: 0, total: 0 });
        }
        const fac = facCountsMap.get(faculty)!;
        fac.total++;
        if (seg.sentiment === "Positive") fac.positive++;
        else if (seg.sentiment === "Negative") fac.negative++;
        else fac.neutral++;
    }

    // ── 6. Fetch quantitative scores (numbers only) ──────────────────────────
    const quantRows: { source_column: string; numerical_score: number; respondent_id: number }[] = [];
    const quantFetches: PromiseLike<void>[] = [];
    for (let i = 0; i < filteredRespIds.length; i += CHUNK) {
        const chunk = filteredRespIds.slice(i, i + CHUNK);
        quantFetches.push(
            supabase
                .from("raw_feedback_inputs")
                .select("source_column, numerical_score, respondent_id")
                .eq("target_unit_id", parseInt(unitId))
                .eq("is_quantitative", true)
                .not("numerical_score", "is", null)
                .in("respondent_id", chunk)
                .then(({ data }) => { if (data) quantRows.push(...(data as any[])); })
        );
    }

    // ── 7. Fetch survey_column_cache ─────────────────────────────────────────
    const { data: colCacheData } = await supabase
        .from("survey_column_cache")
        .select("source_column, column_type, subgroup_name, display_group")
        .eq("survey_id", parseInt(surveyId));

    await Promise.all(quantFetches);

    const colTypeMap = new Map(
        (colCacheData || []).filter(r => r.column_type).map(r => [r.source_column, r.column_type as string])
    );
    const subgroupMap = new Map(
        (colCacheData || []).map(r => [r.source_column, r.subgroup_name ?? null])
    );

    // ── 8. Build quant score distributions ───────────────────────────────────
    const grouped = new Map<string, {
        question: string; type: string; totalResponses: number;
        chartData: { name: string; value: number; color?: string }[];
    }>();

    for (const row of quantRows) {
        if (colTypeMap.get(row.source_column) === "TEXT") continue;
        if (!grouped.has(row.source_column)) {
            grouped.set(row.source_column, { question: row.source_column, type: "SCORE", totalResponses: 0, chartData: [] });
        }
        const g = grouped.get(row.source_column)!;
        const val = row.numerical_score;
        const existing = g.chartData.find(d => d.name === val.toString());
        if (existing) existing.value++;
        else g.chartData.push({ name: val.toString(), value: 1 });
        g.totalResponses++;
    }

    const includedCols = new Set<string>();
    const quantGroupsArr = Array.from(grouped.values()).map(g => {
        let gSum = 0;
        const maxVal = g.chartData.length > 0 ? Math.max(...g.chartData.map(d => parseFloat(d.name))) : 0;
        for (const d of g.chartData) {
            const val = parseFloat(d.name);
            gSum += val * d.value;
            if (maxVal <= 1) d.color = val === 0 ? "#f43f5e" : "#10b981";
            else if (val <= 1) d.color = "#ef4444";
            else if (val === 2) d.color = "#f59e0b";
            else if (val === 3) d.color = "#84cc16";
            else d.color = "#22c55e";
        }
        g.chartData.sort((a, b) => parseFloat(a.name) - parseFloat(b.name));
        const avg = g.totalResponses > 0 ? (gSum / g.totalResponses).toFixed(2) : "0.00";
        if (maxVal > 1 && maxVal <= 5) includedCols.add(g.question);
        return { ...g, average: avg };
    });

    // ── 9. Subgroup-aware SSI ─────────────────────────────────────────────────
    const respBuckets = new Map<number, Map<string, { sum: number; n: number }>>();
    for (const row of quantRows) {
        if (!includedCols.has(row.source_column)) continue;
        const sub = subgroupMap.get(row.source_column) ?? null;
        const bucket = sub ?? `__col__::${row.source_column}`;
        if (!respBuckets.has(row.respondent_id)) respBuckets.set(row.respondent_id, new Map());
        const buckets = respBuckets.get(row.respondent_id)!;
        if (!buckets.has(bucket)) buckets.set(bucket, { sum: 0, n: 0 });
        const b = buckets.get(bucket)!;
        b.sum += row.numerical_score;
        b.n++;
    }
    const respScores: number[] = [];
    for (const [, buckets] of respBuckets) {
        let sumOfBucketAvgs = 0, bucketCount = 0;
        for (const [, b] of buckets) {
            if (b.n === 0) continue;
            sumOfBucketAvgs += b.sum / b.n;
            bucketCount++;
        }
        if (bucketCount === 0) continue;
        respScores.push(sumOfBucketAvgs / bucketCount);
    }
    const globalAvgScore = respScores.length > 0
        ? (respScores.reduce((s, v) => s + v, 0) / respScores.length).toFixed(2)
        : "N/A";

    return NextResponse.json({
        total_text_inputs: inputsWithSegments.size,
        total_segments: totalSegments,
        sentiment_counts: sentCounts,
        category_counts: Array.from(catCountsMap.values()),
        faculty_counts: Array.from(facCountsMap.values()),
        quant_groups: quantGroupsArr,
        global_avg_score: globalAvgScore,
        col_type_cache: colCacheData || [],
        filter_options: {
            locations: Array.from(locations).sort(),
            faculties: Array.from(faculties).sort(),
            programs: Array.from(programs).sort(),
        },
    });
}
