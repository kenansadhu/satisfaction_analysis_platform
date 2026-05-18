import { NextRequest, NextResponse } from "next/server";
import { supabaseServer as supabase } from "@/lib/supabase-server";

export const maxDuration = 120;

export async function GET(req: NextRequest) {
    const surveyId = req.nextUrl.searchParams.get("surveyId");
    const sentiment = req.nextUrl.searchParams.get("sentiment"); // 'Positive' | 'Negative'

    if (!surveyId || !sentiment) {
        return NextResponse.json({ error: "surveyId and sentiment required" }, { status: 400 });
    }

    const sid = surveyId === "all" ? null : parseInt(surveyId);
    const cacheKey = `radar_${sentiment}`;

    // Cache check (skip for "all" surveys view — no single survey_id to key on)
    if (sid !== null) {
        const { data: cached, error: cacheErr } = await supabase
            .from("survey_misc_cache")
            .select("data")
            .eq("survey_id", sid)
            .eq("cache_key", cacheKey)
            .maybeSingle();

        if (!cacheErr && cached?.data) {
            console.log(`[radar] Cache hit: survey ${sid} ${sentiment}`);
            return NextResponse.json(cached.data);
        }
    }

    // RPC — can be slow (30–60 s on large datasets), hence the cache above
    const { data: rpcRows, error } = await supabase.rpc("get_sentiment_aggregation", {
        p_survey_id: sid,
        p_sentiment: sentiment,
    });

    if (error) {
        console.error("[radar] RPC error:", error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!rpcRows || rpcRows.length === 0) {
        return NextResponse.json({ rows: [] });
    }

    // Resolve names server-side so components need no extra DB calls
    const uniqueCids = [...new Set(rpcRows.map((r: any) => r.category_id).filter(Boolean))] as number[];
    const uniqueUids = [...new Set(rpcRows.map((r: any) => r.unit_id).filter(Boolean))] as number[];

    const [catRes, unitRes] = await Promise.all([
        supabase.from("analysis_categories").select("id, name").in("id", uniqueCids),
        supabase.from("organization_units").select("id, name, short_name").in("id", uniqueUids),
    ]);

    const catMap = new Map((catRes.data || []).map((c: any) => [c.id, c.name]));
    const unitMap = new Map((unitRes.data || []).map((u: any) => [u.id, u]));

    const rows = rpcRows
        .filter((r: any) => r.category_id && r.unit_id)
        .map((r: any) => {
            const unit = unitMap.get(r.unit_id) as any;
            return {
                category_id: r.category_id,
                category_name: catMap.get(r.category_id) || "Other",
                unit_id: r.unit_id,
                unit_name: unit?.name || `Unit ${r.unit_id}`,
                unit_short_name: unit?.short_name || unit?.name || `Unit ${r.unit_id}`,
                segment_count: r.segment_count,
            };
        });

    const responsePayload = { rows };

    // Write to cache (fire-and-forget)
    if (sid !== null) {
        supabase
            .from("survey_misc_cache")
            .upsert(
                { survey_id: sid, cache_key: cacheKey, data: responsePayload, updated_at: new Date().toISOString() },
                { onConflict: "survey_id,cache_key" }
            )
            .then(({ error: writeErr }) => {
                if (writeErr) console.error("[radar-cache] write error:", writeErr.message);
                else console.log(`[radar-cache] cached survey ${sid} ${sentiment}`);
            });
    }

    return NextResponse.json(responsePayload);
}
