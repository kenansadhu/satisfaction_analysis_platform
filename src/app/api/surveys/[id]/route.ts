import { NextRequest, NextResponse } from "next/server";
import { supabaseServer as supabase } from "@/lib/supabase-server";

export const maxDuration = 60;

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const surveyId = parseInt(id);
    if (isNaN(surveyId)) return NextResponse.json({ error: "Invalid survey ID" }, { status: 400 });

    const { error } = await supabase.rpc('delete_survey_cascade', { p_survey_id: surveyId });
    if (error) {
        console.error('[delete survey]', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true });
}
