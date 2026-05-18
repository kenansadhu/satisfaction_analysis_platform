import { NextRequest, NextResponse } from "next/server";
import { supabaseServer as supabase } from "@/lib/supabase-server";

export const maxDuration = 120;

// GET /api/analytics/unit-qual-summary?surveyId=X
// Returns get_qual_summary_by_unit RPC result with server-side caching.
// Used by unit-insights list page to show sentiment per unit.
export async function GET(req: NextRequest) {
    const surveyId = req.nextUrl.searchParams.get("surveyId");
    if (!surveyId || surveyId === "all") {
        return NextResponse.json({ rows: [] });
    }

    const sid = parseInt(surveyId);
    const cacheKey = "qual_summary";

    // Cache check
    const { data: cached, error: cacheErr } = await supabase
        .from("survey_misc_cache")
        .select("data")
        .eq("survey_id", sid)
        .eq("cache_key", cacheKey)
        .maybeSingle();

    if (!cacheErr && cached?.data) {
        console.log(`[unit-qual-summary] Cache hit: survey ${sid}`);
        return NextResponse.json(cached.data);
    }

    // RPC
    const { data: rows, error } = await supabase.rpc("get_qual_summary_by_unit", {
        p_survey_id: sid,
    });

    if (error) {
        console.error("[unit-qual-summary] RPC error:", error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const responsePayload = { rows: rows || [] };

    // Write to cache (fire-and-forget)
    supabase
        .from("survey_misc_cache")
        .upsert(
            { survey_id: sid, cache_key: cacheKey, data: responsePayload, updated_at: new Date().toISOString() },
            { onConflict: "survey_id,cache_key" }
        )
        .then(({ error: writeErr }) => {
            if (writeErr) console.error("[unit-qual-summary-cache] write error:", writeErr.message);
            else console.log(`[unit-qual-summary-cache] cached survey ${sid}`);
        });

    return NextResponse.json(responsePayload);
}
