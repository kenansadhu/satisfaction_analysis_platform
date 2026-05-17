import { NextRequest, NextResponse } from "next/server";
import { supabaseServer as supabase } from "@/lib/supabase-server";
import { parseSettingArray } from "@/lib/platformSettings";

const SETTING_KEY = "nps_unit_ids";

export async function GET() {
    const { data } = await supabase
        .from("platform_settings")
        .select("value")
        .eq("key", SETTING_KEY)
        .maybeSingle();

    return NextResponse.json({ npsUnitIds: parseSettingArray<number>(data?.value) });
}

export async function POST(req: NextRequest) {
    const { npsUnitIds } = await req.json();
    if (!Array.isArray(npsUnitIds)) {
        return NextResponse.json({ error: "npsUnitIds must be an array" }, { status: 400 });
    }

    await supabase.from("platform_settings").delete().eq("key", SETTING_KEY);
    const { error } = await supabase
        .from("platform_settings")
        .insert({ key: SETTING_KEY, value: JSON.stringify(npsUnitIds) });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
}
