import { NextRequest, NextResponse } from "next/server";
import { supabaseServer as supabase } from "@/lib/supabase-server";

const SETTING_KEY = "study_program_unit_id";

export async function GET() {
    const { data } = await supabase
        .from("platform_settings")
        .select("value")
        .eq("key", SETTING_KEY)
        .maybeSingle();

    const raw = data?.value;
    const id = raw != null ? parseInt(raw) : null;
    return NextResponse.json({ studyProgramUnitId: isNaN(id as number) ? null : id });
}

export async function POST(req: NextRequest) {
    const { studyProgramUnitId } = await req.json();
    if (studyProgramUnitId !== null && typeof studyProgramUnitId !== "number") {
        return NextResponse.json({ error: "studyProgramUnitId must be a number or null" }, { status: 400 });
    }

    await supabase.from("platform_settings").delete().eq("key", SETTING_KEY);
    if (studyProgramUnitId !== null) {
        const { error } = await supabase
            .from("platform_settings")
            .insert({ key: SETTING_KEY, value: String(studyProgramUnitId) });
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
}
