import { NextRequest, NextResponse } from "next/server";
import { supabaseServer as supabase } from "@/lib/supabase-server";

// POST: Force recompute cache for a survey (e.g. after re-import).
// `?onlyQuant=true` clears just survey_quant_cache (used by Score Audit's rebuild
// button — leaves AI/NPS/faculty caches intact so unrelated pages don't break).
// `?onlyQuant=true&alsoFaculty=true` additionally clears the faculty score cache.
export async function POST(req: NextRequest) {
    const surveyId = req.nextUrl.searchParams.get("surveyId");
    const onlyQuant = req.nextUrl.searchParams.get("onlyQuant") === "true";
    const alsoFaculty = req.nextUrl.searchParams.get("alsoFaculty") === "true";
    if (!surveyId) {
        return NextResponse.json({ error: "surveyId required" }, { status: 400 });
    }

    const sid = parseInt(surveyId);
    if (onlyQuant) {
        const ops = [supabase.from('survey_quant_cache').delete().eq('survey_id', sid)];
        if (alsoFaculty) {
            ops.push(supabase.from('survey_faculty_score_cache').delete().eq('survey_id', sid));
        }
        await Promise.all(ops);
        return NextResponse.json({ message: `Quant cache cleared for survey ${surveyId}. Next report load will recompute.` });
    }

    await Promise.all([
        supabase.from('survey_quant_cache').delete().eq('survey_id', sid),
        supabase.from('survey_cross_mentions_cache').delete().eq('survey_id', sid),
        supabase.from('unit_cross_signals_cache').delete().eq('survey_id', sid),
        supabase.from('survey_faculty_score_cache').delete().eq('survey_id', sid),
        supabase.from('survey_faculty_cache').delete().eq('survey_id', sid),
        supabase.from('survey_nps_cache').delete().eq('survey_id', sid),
        supabase.from('survey_misc_cache').delete().eq('survey_id', sid),
        supabase.from('surveys').update({ ai_dataset_cache: null, ai_dataset_updated_at: null }).eq('id', sid),
        supabase.from('survey_ai_reports').delete().eq('survey_id', sid),
    ]);

    return NextResponse.json({ message: `Cache cleared for survey ${surveyId}. Next report load will recompute.` });
}

export async function DELETE(req: NextRequest) {
    const surveyId = req.nextUrl.searchParams.get("surveyId");
    if (!surveyId) {
        return NextResponse.json({ error: "surveyId required" }, { status: 400 });
    }

    const sid = parseInt(surveyId);
    const [q, c, cs, f, fc, nps, misc, a, r] = await Promise.all([
        supabase.from('survey_quant_cache').delete().eq('survey_id', sid),
        supabase.from('survey_cross_mentions_cache').delete().eq('survey_id', sid),
        supabase.from('unit_cross_signals_cache').delete().eq('survey_id', sid),
        supabase.from('survey_faculty_score_cache').delete().eq('survey_id', sid),
        supabase.from('survey_faculty_cache').delete().eq('survey_id', sid),
        supabase.from('survey_nps_cache').delete().eq('survey_id', sid),
        supabase.from('survey_misc_cache').delete().eq('survey_id', sid),
        supabase.from('surveys').update({ ai_dataset_cache: null, ai_dataset_updated_at: null }).eq('id', sid),
        supabase.from('survey_ai_reports').delete().eq('survey_id', sid),
    ]);

    const err = q.error || c.error || cs.error || f.error || fc.error || nps.error || misc.error || a.error || r.error;
    if (err) return NextResponse.json({ error: err.message }, { status: 500 });

    return NextResponse.json({ message: `Cache cleared for survey ${surveyId}` });
}
