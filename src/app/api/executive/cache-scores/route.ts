import { NextRequest, NextResponse } from "next/server";
import { supabaseServer as supabase } from "@/lib/supabase-server";

// POST: Force recompute cache for a survey (e.g. after re-import)
// DELETE: Clear cache for a survey
export async function POST(req: NextRequest) {
    const surveyId = req.nextUrl.searchParams.get("surveyId");
    if (!surveyId) {
        return NextResponse.json({ error: "surveyId required" }, { status: 400 });
    }

    // Clear existing quant cache
    await supabase.from('survey_quant_cache').delete().eq('survey_id', parseInt(surveyId));

    // Clear AI dataset cache
    await supabase.from('surveys')
        .update({ ai_dataset_cache: null, ai_dataset_updated_at: null })
        .eq('id', parseInt(surveyId));

    // Next request to /api/executive/report will recompute and cache
    return NextResponse.json({ message: `Cache cleared for survey ${surveyId}. Next report load will recompute.` });
}

export async function DELETE(req: NextRequest) {
    const surveyId = req.nextUrl.searchParams.get("surveyId");
    if (!surveyId) {
        return NextResponse.json({ error: "surveyId required" }, { status: 400 });
    }

    const { error } = await supabase.from('survey_quant_cache').delete().eq('survey_id', parseInt(surveyId));
    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const { error: aiError } = await supabase.from('surveys')
        .update({ ai_dataset_cache: null, ai_dataset_updated_at: null })
        .eq('id', parseInt(surveyId));

    if (aiError) {
        return NextResponse.json({ error: aiError.message }, { status: 500 });
    }

    return NextResponse.json({ message: `Cache cleared for survey ${surveyId}` });
}
