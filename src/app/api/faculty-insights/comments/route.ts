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
 * GET /api/faculty-insights/comments
 *   ?facultyId=X  &surveyId=Y
 *   &unitId=Z       (optional — filter by target unit)
 *   &sentiment=Pos  (optional — Positive | Negative | Neutral)
 *   &category=Name  (optional — category name)
 *   &search=text    (optional — substring search)
 *   &page=0
 */
export async function GET(req: NextRequest) {
    const sp = req.nextUrl.searchParams;
    const facultyId = parseInt(sp.get("facultyId") || "");
    const surveyId = parseInt(sp.get("surveyId") || "");
    const unitId = sp.get("unitId") ? parseInt(sp.get("unitId")!) : null;
    const unitIds = sp.get("unitIds") ? sp.get("unitIds")!.split(",").map(Number).filter(Boolean) : null;
    const sentiment = sp.get("sentiment") || null;
    const category = sp.get("category") || null;
    const search = sp.get("search")?.trim() || null;
    const studyProgram = sp.get("studyProgram") || null;
    const suggestionOnly = sp.get("suggestion") === "true";
    const page = parseInt(sp.get("page") || "0");
    const PAGE_SIZE = 20;

    if (!facultyId || !surveyId) {
        return NextResponse.json({ error: "facultyId and surveyId required" }, { status: 400 });
    }

    // ── Units + categories map ─────────────────────────────────────────────────
    const [unitsRes, catsRes] = await Promise.all([
        supabase.from("organization_units").select("id, name, short_name"),
        supabase.from("analysis_categories").select("id, name"),
    ]);
    const unitsMap = new Map((unitsRes.data || []).map(u => [
        u.id as number,
        { name: u.name as string, short: (u.short_name || u.name) as string },
    ]));
    // Multiple rows in analysis_categories can share the same display name.
    // Build a name→[ids] map so the category filter hits ALL matching rows.
    const catNameToIds = new Map<string, number[]>();
    for (const c of (catsRes.data || [])) {
        const ids = catNameToIds.get(c.name as string) ?? [];
        ids.push(c.id as number);
        catNameToIds.set(c.name as string, ids);
    }
    const catIdToName = new Map((catsRes.data || []).map(c => [c.id as number, c.name as string]));

    // ── Respondents for this faculty ───────────────────────────────────────────
    const respIds: number[] = [];
    const respProgramMap = new Map<number, string>(); // respondent_id → study_program
    const allStudyPrograms = new Set<string>(); // for dropdown (unfiltered)
    let from = 0;
    while (true) {
        let q = supabase.from("respondents")
            .select("id, study_program")
            .eq("survey_id", surveyId)
            .eq("faculty_id", facultyId);
        if (studyProgram) q = (q as any).eq("study_program", studyProgram);
        const { data } = await q.range(from, from + PAGE - 1);
        if (!data?.length) break;
        for (const r of data as { id: number; study_program: string | null }[]) {
            respIds.push(r.id);
            if (r.study_program) {
                respProgramMap.set(r.id, r.study_program);
                allStudyPrograms.add(r.study_program);
            }
        }
        if (data.length < PAGE) break;
        from += PAGE;
    }

    // Fetch all study programs for dropdown regardless of current filter
    if (studyProgram) {
        let pFrom = 0;
        while (true) {
            const { data } = await supabase.from("respondents")
                .select("study_program")
                .eq("survey_id", surveyId)
                .eq("faculty_id", facultyId)
                .not("study_program", "is", null)
                .range(pFrom, pFrom + PAGE - 1);
            if (!data?.length) break;
            for (const r of data as { study_program: string | null }[])
                if (r.study_program) allStudyPrograms.add(r.study_program);
            if (data.length < PAGE) break;
            pFrom += PAGE;
        }
    }

    if (!respIds.length) {
        return NextResponse.json({ comments: [], total: 0, page: 0, pageSize: PAGE_SIZE, availableUnits: [], availableCategories: [], availableStudyPrograms: [] });
    }

    // ── Input IDs (with optional unit filter) ─────────────────────────────────
    // Paginate within each chunk — Supabase caps every query at 1000 rows silently.
    const inputMap = new Map<number, number>(); // input_id → target_unit_id
    const inputToResp = new Map<number, number>(); // input_id → respondent_id
    await batchIn(respIds, CHUNK, async chunk => {
        const all: { id: number; target_unit_id: number; respondent_id: number }[] = [];
        let inputFrom = 0;
        while (true) {
            let q = supabase.from("raw_feedback_inputs")
                .select("id, target_unit_id, respondent_id")
                .in("respondent_id", chunk)
                .eq("is_quantitative", false)
                .range(inputFrom, inputFrom + PAGE - 1);
            if (unitId) q = (q as any).eq("target_unit_id", unitId);
            else if (unitIds?.length) q = (q as any).in("target_unit_id", unitIds);
            const { data } = await q;
            if (!data?.length) break;
            all.push(...(data as { id: number; target_unit_id: number; respondent_id: number }[]));
            if (data.length < PAGE) break;
            inputFrom += PAGE;
        }
        return all;
    }).then(rows => {
        for (const r of rows) {
            if (r.target_unit_id) {
                inputMap.set(r.id, r.target_unit_id);
                inputToResp.set(r.id, r.respondent_id);
            }
        }
    });

    if (!inputMap.size) {
        return NextResponse.json({ comments: [], total: 0, page: 0, pageSize: PAGE_SIZE, availableUnits: [], availableCategories: [], availableStudyPrograms: [] });
    }

    const inputIds = [...inputMap.keys()];
    const categoryIds = category ? (catNameToIds.get(category) ?? []) : [];

    // ── Segments ───────────────────────────────────────────────────────────────
    // Paginate within each chunk — Supabase caps every query at 1000 rows silently.
    type RawSegment = { id: number; segment_text: string; sentiment: string; category_id: number | null; raw_input_id: number; is_suggestion: boolean };
    const rawSegments: RawSegment[] = await batchIn(inputIds, CHUNK, async chunk => {
        const all: RawSegment[] = [];
        let segFrom = 0;
        while (true) {
            let q = supabase.from("feedback_segments")
                .select("id, segment_text, sentiment, category_id, raw_input_id, is_suggestion")
                .in("raw_input_id", chunk)
                .not("segment_text", "is", null)
                .range(segFrom, segFrom + PAGE - 1);
            if (sentiment) q = (q as any).eq("sentiment", sentiment);
            if (categoryIds.length === 1) q = (q as any).eq("category_id", categoryIds[0]);
            else if (categoryIds.length > 1) q = (q as any).in("category_id", categoryIds);
            if (suggestionOnly) q = (q as any).eq("is_suggestion", true);
            const { data } = await q;
            if (!data?.length) break;
            all.push(...(data as RawSegment[]));
            if (data.length < PAGE) break;
            segFrom += PAGE;
        }
        return all;
    });

    // ── Build comment objects ─────────────────────────────────────────────────
    type Comment = {
        id: number;
        segment_text: string;
        sentiment: string;
        category_name: string | null;
        unit_id: number;
        unit_name: string;
        is_suggestion: boolean;
    };

    let comments: Comment[] = rawSegments
        .filter(s => s.segment_text?.trim())
        .map(s => {
            const unitId_ = inputMap.get(s.raw_input_id)!;
            const unit = unitsMap.get(unitId_);
            return {
                id: s.id,
                segment_text: s.segment_text,
                sentiment: s.sentiment,
                category_name: s.category_id ? catIdToName.get(s.category_id) ?? null : null,
                unit_id: unitId_,
                unit_name: unit?.short ?? `Unit ${unitId_}`,
                is_suggestion: s.is_suggestion,
            };
        });

    // Optional text search (client-side, cheap at these volumes)
    if (search) {
        const lc = search.toLowerCase();
        comments = comments.filter(c => c.segment_text.toLowerCase().includes(lc));
    }

    // ── Available filter options (for dropdowns) ───────────────────────────────
    const availableUnitIds = [...new Set(comments.map(c => c.unit_id))].sort();
    const availableUnits = availableUnitIds.map(id => ({
        id,
        name: unitsMap.get(id)?.short ?? `Unit ${id}`,
    })).sort((a, b) => a.name.localeCompare(b.name));

    const availableCategories = [...new Set(comments.map(c => c.category_name).filter(Boolean))]
        .sort() as string[];

    const availableStudyPrograms = [...allStudyPrograms].sort();

    const total = comments.length;
    const paginated = comments.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

    return NextResponse.json({
        comments: paginated,
        total,
        page,
        pageSize: PAGE_SIZE,
        availableUnits,
        availableCategories,
        availableStudyPrograms,
    });
}
