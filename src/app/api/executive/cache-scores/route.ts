import { NextRequest, NextResponse } from "next/server";
import { supabaseServer as supabase } from "@/lib/supabase-server";

// POST: Force recompute cache for a survey (e.g. after re-import)
// DELETE: Clear cache for a survey
export async function POST(req: NextRequest) {
    const surveyId = req.nextUrl.searchParams.get("surveyId");
    if (!surveyId) {
        return NextResponse.json({ error: "surveyId required" }, { status: 400 });
    }

    const sid = parseInt(surveyId);
    await Promise.all([
        supabase.from('survey_quant_cache').delete().eq('survey_id', sid),
        supabase.from('survey_cross_mentions_cache').delete().eq('survey_id', sid),
        supabase.from('survey_faculty_score_cache').delete().eq('survey_id', sid),
        supabase.from('surveys').update({ ai_dataset_cache: null, ai_dataset_updated_at: null }).eq('id', sid),
    ]);

    return NextResponse.json({ message: `Cache cleared for survey ${surveyId}. Next report load will recompute.` });
}

export async function DELETE(req: NextRequest) {
    const surveyId = req.nextUrl.searchParams.get("surveyId");
    if (!surveyId) {
        return NextResponse.json({ error: "surveyId required" }, { status: 400 });
    }

    const sid = parseInt(surveyId);
    const [q, c, f, a] = await Promise.all([
        supabase.from('survey_quant_cache').delete().eq('survey_id', sid),
        supabase.from('survey_cross_mentions_cache').delete().eq('survey_id', sid),
        supabase.from('survey_faculty_score_cache').delete().eq('survey_id', sid),
        supabase.from('surveys').update({ ai_dataset_cache: null, ai_dataset_updated_at: null }).eq('id', sid),
    ]);

    const err = q.error || c.error || f.error || a.error;
    if (err) return NextResponse.json({ error: err.message }, { status: 500 });

    return NextResponse.json({ message: `Cache cleared for survey ${surveyId}` });
}
