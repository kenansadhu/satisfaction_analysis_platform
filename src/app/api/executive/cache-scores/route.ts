import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// POST: Force recompute cache for a survey (e.g. after re-import)
// DELETE: Clear cache for a survey
export async function POST(req: NextRequest) {
    const surveyId = req.nextUrl.searchParams.get("surveyId");
    if (!surveyId) {
        return NextResponse.json({ error: "surveyId required" }, { status: 400 });
    }

    // Clear existing cache
    await supabase.from('survey_quant_cache').delete().eq('survey_id', parseInt(surveyId));

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

    return NextResponse.json({ message: `Cache cleared for survey ${surveyId}` });
}
