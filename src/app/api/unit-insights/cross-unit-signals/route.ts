import { NextResponse } from "next/server";
import { supabaseServer as supabase } from "@/lib/supabase-server";

export const maxDuration = 60;

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const unitId = searchParams.get("unitId");
    const surveyId = searchParams.get("surveyId");

    if (!unitId || !surveyId) {
        return NextResponse.json({ error: "unitId and surveyId required" }, { status: 400 });
    }

    const uid = parseInt(unitId);
    const sid = parseInt(surveyId);

    // ── Cache hit ─────────────────────────────────────────────────────────────
    const { data: cached } = await supabase
        .from("unit_cross_signals_cache")
        .select("outgoing_segments, incoming_segments, outgoing_by_target, incoming_by_source")
        .eq("survey_id", sid)
        .eq("unit_id", uid)
        .maybeSingle();

    if (cached) {
        return NextResponse.json({
            outgoing_segments:  cached.outgoing_segments  ?? [],
            incoming_segments:  cached.incoming_segments  ?? [],
            outgoing_by_target: cached.outgoing_by_target ?? [],
            incoming_by_source: cached.incoming_by_source ?? [],
            fromCache: true,
        });
    }

    // ── Cache miss: return empty — user must rebuild cache ────────────────────
    return NextResponse.json({
        outgoing_segments:  [],
        incoming_segments:  [],
        outgoing_by_target: [],
        incoming_by_source: [],
        fromCache: false,
        cacheEmpty: true,
    });
}
