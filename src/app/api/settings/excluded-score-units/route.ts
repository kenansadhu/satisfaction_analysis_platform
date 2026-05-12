import { NextRequest, NextResponse } from "next/server";
import { supabaseServer as supabase } from "@/lib/supabase-server";

const SETTING_KEY = "excluded_score_unit_ids";

export async function GET() {
    const { data } = await supabase
        .from("platform_settings")
        .select("value")
        .eq("key", SETTING_KEY)
        .maybeSingle();

    const ids: number[] = data?.value ? JSON.parse(data.value) : [];
    return NextResponse.json({ excludedUnitIds: ids });
}

export async function POST(req: NextRequest) {
    const { excludedUnitIds } = await req.json();
    if (!Array.isArray(excludedUnitIds)) {
        return NextResponse.json({ error: "excludedUnitIds must be an array" }, { status: 400 });
    }

    // Delete then insert — avoids dependency on unique constraint existing on key column
    await supabase.from("platform_settings").delete().eq("key", SETTING_KEY);
    const { error } = await supabase
        .from("platform_settings")
        .insert({ key: SETTING_KEY, value: JSON.stringify(excludedUnitIds) });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
}
