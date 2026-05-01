import { NextRequest, NextResponse } from "next/server";
import { supabaseServer as supabase } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
    const surveyId = req.nextUrl.searchParams.get("surveyId");
    if (!surveyId) return NextResponse.json({ exec_summary: null, theme_summaries: null });

    const [summaryRes, themesRes] = await Promise.all([
        supabase
            .from("survey_ai_reports")
            .select("content, updated_at")
            .eq("survey_id", parseInt(surveyId))
            .eq("report_type", "exec_summary")
            .single(),
        supabase
            .from("survey_ai_reports")
            .select("content, updated_at")
            .eq("survey_id", parseInt(surveyId))
            .eq("report_type", "theme_summaries")
            .single(),
    ]);

    return NextResponse.json({
        exec_summary: summaryRes.data?.content ?? null,
        theme_summaries: themesRes.data?.content ?? null,
    });
}
