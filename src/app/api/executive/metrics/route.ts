import { NextResponse } from "next/server";
import { supabaseServer as supabase } from "@/lib/supabase-server";
import { computeSentimentScore } from "@/lib/utils";
import { parseSettingArray } from "@/lib/platformSettings";

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const surveyId = searchParams.get("surveyId");

        // 1. Fetch all organization units + NPS-unit setting in parallel.
        //    NPS units are hidden from cross-unit metrics — they appear in the dedicated NPS tab instead.
        const [unitsRes, npsRes] = await Promise.all([
            supabase.from('organization_units').select('id, name'),
            supabase.from('platform_settings').select('value').eq('key', 'nps_unit_ids').maybeSingle(),
        ]);

        if (unitsRes.error || !unitsRes.data) {
            console.error("Failed to fetch units:", unitsRes.error);
            return NextResponse.json({ error: "Failed to fetch top-level units" }, { status: 500 });
        }
        const npsUnitIds = new Set<number>(parseSettingArray<number>(npsRes.data?.value));
        const orgUnits = unitsRes.data.filter(u => !npsUnitIds.has(u.id));

        // 1.5 Fast path — read per-unit sentiment from ai_dataset_cache when available.
        // This is much faster than the RPC and is the path the user just rebuilt.
        // The cache already excludes NPS units, matching what we want.
        if (surveyId) {
            const { data: cacheRow } = await supabase
                .from('surveys')
                .select('ai_dataset_cache')
                .eq('id', parseInt(surveyId))
                .single();
            const cache = (cacheRow as any)?.ai_dataset_cache;
            const cacheUnits = cache?.v === 2 && Array.isArray(cache.units) ? cache.units
                : Array.isArray(cache) ? cache
                : null;
            if (cacheUnits) {
                const cachedById = new Map<number, any>(cacheUnits.map((u: any) => [u.unit_id, u]));
                const stats = orgUnits.map(unit => {
                    const cu = cachedById.get(unit.id);
                    if (cu && (cu.total_segments || 0) > 0) {
                        return {
                            id: unit.id,
                            name: unit.name,
                            total: cu.total_segments || 0,
                            positive: cu.positive || 0,
                            neutral: cu.neutral || 0,
                            negative: cu.negative || 0,
                            score: cu.score || 0,
                        };
                    }
                    return { id: unit.id, name: unit.name, total: 0, positive: 0, neutral: 0, negative: 0, score: 0 };
                });
                return NextResponse.json({ stats, fromCache: true });
            }
        }

        // 2. Cache miss / "all surveys" — fall back to the qual RPC (with retry for intermittent timeouts)
        let qualAgg: any[] | null = null;
        let qualErr: any = null;
        for (let attempt = 0; attempt < 3; attempt++) {
            const result = await supabase.rpc('get_qual_summary_by_unit', {
                p_survey_id: surveyId ? parseInt(surveyId) : null
            });
            qualAgg = result.data;
            qualErr = result.error;
            if (!qualErr) break;
            console.warn(`[metrics] qual RPC attempt ${attempt + 1} failed: ${qualErr.message}`);
            if (attempt < 2) await new Promise(r => setTimeout(r, 1000));
        }

        if (qualErr) {
            console.error("Qual RPC Error after retries:", qualErr);
            // Return empty stats (200) instead of 500 so the page renders without an error toast.
            // Root cause: ai_dataset_cache not yet built for this survey — rebuild from Settings.
            const emptyStats = orgUnits.map(unit => ({ id: unit.id, name: unit.name, total: 0, positive: 0, neutral: 0, negative: 0, score: 0 }));
            return NextResponse.json({ stats: emptyStats, noCache: true });
        }

        // 3. Aggregate qual data to per-unit totals
        const unitTotals = new Map<number, { positive: number; negative: number; neutral: number; total: number }>();
        for (const row of (qualAgg || [])) {
            const uid = row.target_unit_id;
            if (!unitTotals.has(uid)) unitTotals.set(uid, { positive: 0, negative: 0, neutral: 0, total: 0 });
            const entry = unitTotals.get(uid)!;
            const cnt = parseInt(row.cnt);
            entry.total += cnt;
            if (row.sentiment === "Positive") entry.positive += cnt;
            else if (row.sentiment === "Negative") entry.negative += cnt;
            else entry.neutral += cnt;
        }

        // 4. Build final stats
        const stats = orgUnits.map(unit => {
            const unitStats = unitTotals.get(unit.id);
            if (unitStats && unitStats.total > 0) {
                const score = computeSentimentScore(unitStats.positive, unitStats.neutral, unitStats.negative);
                return { id: unit.id, name: unit.name, ...unitStats, score };
            }
            return { id: unit.id, name: unit.name, total: 0, positive: 0, neutral: 0, negative: 0, score: 0 };
        });

        return NextResponse.json({ stats });

    } catch (e: any) {
        console.error("Server Error in /api/executive/metrics:", e);
        return NextResponse.json({
            error: "Internal Server Error",
            detail: e?.message || String(e),
            stack: process.env.NODE_ENV === "production" ? undefined : e?.stack,
        }, { status: 500 });
    }
}
