import { NextRequest, NextResponse } from "next/server";
import { supabaseServer as supabase } from "@/lib/supabase-server";

export const maxDuration = 60;

const PAGE = 1000;
const CHUNK = 400;
const CONC = 5;

async function batchIn<T>(
    ids: number[],
    chunkSize: number,
    fetcher: (chunk: number[]) => Promise<T[]>
): Promise<T[]> {
    const all: T[] = [];
    for (let b = 0; b < ids.length; b += chunkSize * CONC) {
        const chunks: number[][] = [];
        for (let i = b; i < Math.min(b + chunkSize * CONC, ids.length); i += chunkSize)
            chunks.push(ids.slice(i, i + chunkSize));
        const results = await Promise.all(chunks.map(fetcher));
        for (const r of results) all.push(...r);
    }
    return all;
}

/**
 * GET /api/faculty-insights/categories
 *   ?facultyId=X  &surveyId=Y
 *   &unitIds=1,2,3  (optional — restrict to specific units)
 *
 * Returns category breakdown (counts by sentiment) for this faculty's students,
 * scoped to the given units. Sorted by total descending.
 */
export async function GET(req: NextRequest) {
    const sp = req.nextUrl.searchParams;
    const facultyId = parseInt(sp.get("facultyId") || "");
    const surveyId = parseInt(sp.get("surveyId") || "");
    const unitIds = sp.get("unitIds") ? sp.get("unitIds")!.split(",").map(Number).filter(Boolean) : null;
    const studyProgram = sp.get("studyProgram") || null;
    const sentimentFilter = sp.get("sentiment") || null;

    if (!facultyId || !surveyId) {
        return NextResponse.json({ error: "facultyId and surveyId required" }, { status: 400 });
    }

    const { data: cats } = await supabase.from("analysis_categories").select("id, name");
    const catIdToName = new Map((cats || []).map(c => [c.id as number, c.name as string]));

    // Respondents for this faculty (optionally filtered by study program)
    const respIds: number[] = [];
    let from = 0;
    while (true) {
        let q = supabase
            .from("respondents")
            .select("id")
            .eq("survey_id", surveyId)
            .eq("faculty_id", facultyId);
        if (studyProgram) q = (q as any).eq("study_program", studyProgram);
        const { data } = await (q as any).range(from, from + PAGE - 1);
        if (!data?.length) break;
        for (const r of data as { id: number }[]) respIds.push(r.id);
        if (data.length < PAGE) break;
        from += PAGE;
    }

    if (!respIds.length) return NextResponse.json({ categories: [] });

    // Qualitative input IDs, optionally filtered to specific units
    const inputIds: number[] = await batchIn(respIds, CHUNK, async chunk => {
        let q = supabase
            .from("raw_feedback_inputs")
            .select("id")
            .in("respondent_id", chunk)
            .eq("is_quantitative", false);
        if (unitIds?.length) q = (q as any).in("target_unit_id", unitIds);
        const { data } = await q;
        return (data || []).map((r: { id: number }) => r.id);
    });

    if (!inputIds.length) return NextResponse.json({ categories: [] });

    // Segments with category + sentiment (skip null category_id, optionally filter by sentiment).
    // Paginate within each chunk — Supabase caps every query at 1000 rows silently.
    const segments: { category_id: number; sentiment: string }[] = await batchIn(
        inputIds,
        CHUNK,
        async chunk => {
            const all: { category_id: number; sentiment: string }[] = [];
            let segFrom = 0;
            while (true) {
                let q = supabase
                    .from("feedback_segments")
                    .select("category_id, sentiment")
                    .in("raw_input_id", chunk)
                    .not("segment_text", "is", null)
                    .not("category_id", "is", null)
                    .range(segFrom, segFrom + PAGE - 1);
                if (sentimentFilter) q = (q as any).eq("sentiment", sentimentFilter);
                const { data } = await q;
                if (!data?.length) break;
                all.push(...(data as { category_id: number; sentiment: string }[]));
                if (data.length < PAGE) break;
                segFrom += PAGE;
            }
            return all;
        }
    );

    // Aggregate by category_id
    const agg = new Map<number, { positive: number; negative: number; neutral: number; total: number }>();
    for (const s of segments) {
        if (!agg.has(s.category_id)) agg.set(s.category_id, { positive: 0, negative: 0, neutral: 0, total: 0 });
        const a = agg.get(s.category_id)!;
        a.total++;
        if (s.sentiment === "Positive") a.positive++;
        else if (s.sentiment === "Negative") a.negative++;
        else a.neutral++;
    }

    // Merge by name — multiple category_id rows can share the same display name
    const byName = new Map<string, { positive: number; negative: number; neutral: number; total: number }>();
    for (const [id, counts] of agg) {
        const name = catIdToName.get(id) ?? `Category ${id}`;
        if (!byName.has(name)) byName.set(name, { ...counts });
        else {
            const e = byName.get(name)!;
            e.positive += counts.positive;
            e.negative += counts.negative;
            e.neutral += counts.neutral;
            e.total += counts.total;
        }
    }

    const categories = [...byName.entries()]
        .map(([name, counts]) => ({ name, ...counts }))
        .filter(c => c.total >= 3)
        .sort((a, b) => {
            const aIsOthers = a.name.toLowerCase() === "others";
            const bIsOthers = b.name.toLowerCase() === "others";
            if (aIsOthers && !bIsOthers) return 1;
            if (!aIsOthers && bIsOthers) return -1;
            return b.negative - a.negative;
        });

    return NextResponse.json({ categories });
}
