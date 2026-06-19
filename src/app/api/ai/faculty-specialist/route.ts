import { NextRequest, NextResponse } from "next/server";
import { supabaseServer as supabase } from "@/lib/supabase-server";

const chatKey = (facultyId: string, surveyId: string, userId: string) => `faculty_ai_chat_${facultyId}_${surveyId}_${userId}`;
const reportKey = (facultyId: string, surveyId: string) => `faculty_ai_report_${facultyId}_${surveyId}`;

// GET — load persisted report + chat history
export async function GET(req: NextRequest) {
    const sp = req.nextUrl.searchParams;
    const facultyId = sp.get("facultyId");
    const surveyId = sp.get("surveyId");
    const userId = sp.get("userId") ?? "anon";
    if (!facultyId || !surveyId) return NextResponse.json({ error: "required" }, { status: 400 });
    const sid = parseInt(surveyId);

    const [reportRes, chatRes] = await Promise.all([
        supabase.from("survey_misc_cache").select("data, updated_at").eq("survey_id", sid).eq("cache_key", reportKey(facultyId, surveyId)).maybeSingle(),
        supabase.from("survey_misc_cache").select("data").eq("survey_id", sid).eq("cache_key", chatKey(facultyId, surveyId, userId)).maybeSingle(),
    ]);

    return NextResponse.json({
        report: reportRes.data?.data?.report ?? null,
        generatedAt: reportRes.data?.updated_at ?? null,
        messages: chatRes.data?.data?.messages ?? [],
    });
}

// POST — save chat history
export async function POST(req: NextRequest) {
    const { facultyId, surveyId, userId = "anon", messages } = await req.json();
    if (!facultyId || !surveyId) return NextResponse.json({ error: "required" }, { status: 400 });

    const { error } = await supabase.from("survey_misc_cache").upsert(
        { survey_id: parseInt(surveyId), cache_key: chatKey(facultyId, surveyId, userId), data: { messages }, updated_at: new Date().toISOString() },
        { onConflict: "survey_id,cache_key" }
    );

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
}
