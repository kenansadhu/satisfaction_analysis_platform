import { NextResponse } from 'next/server';
import { supabaseServer as supabase } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const CHUNK = 400;

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const surveyId = searchParams.get('surveyId');

        let segments: { related_unit_ids: number[]; target_unit_id: number | null }[] = [];

        if (surveyId && surveyId !== 'all') {
            // Fast path: reconstruct directional pairs from the cross-mentions cache that
            // the Report tab already populates. Each cache row stores source_units_breakdown
            // (JSONB array of { source_unit_id, total, ... }) for the mentioned unit,
            // giving us the (source → target, count) pairs we need without re-running the RPC.
            const { data: cachedMentions, error: cacheErr } = await supabase
                .from('survey_cross_mentions_cache')
                .select('mentioned_unit_id, source_units_breakdown')
                .eq('survey_id', parseInt(surveyId, 10))
                .gt('total_mentions', 0);

            if (!cacheErr && cachedMentions && cachedMentions.length > 0
                && cachedMentions[0].source_units_breakdown !== null) {
                const { data: unitsData } = await supabase
                    .from('organization_units').select('id, name, short_name');
                const unitsMap = new Map((unitsData || []).map((u: any) => [
                    u.id,
                    { name: u.name, short: u.short_name || u.name.split(' ')[0] },
                ]));

                const mentions: any[] = [];
                for (const row of cachedMentions) {
                    const targetId = row.mentioned_unit_id;
                    const breakdown = row.source_units_breakdown as any[];
                    if (!Array.isArray(breakdown)) continue;
                    for (const src of breakdown) {
                        const sourceId = src.source_unit_id;
                        const count = src.total;
                        if (!sourceId || !count) continue;
                        const srcUnit = unitsMap.get(sourceId);
                        const tgtUnit = unitsMap.get(targetId);
                        if (srcUnit && tgtUnit) {
                            mentions.push({ sourceId, sourceName: srcUnit.short, targetId, targetName: tgtUnit.short, count });
                        }
                    }
                }
                mentions.sort((a, b) => b.count - a.count);
                return NextResponse.json({ mentions });
            }

            // Cache miss — fall back to the RPC (paginated to avoid Supabase's 1000-row cap)
            let page = 0;
            while (true) {
                const { data, error } = await supabase.rpc('get_survey_cross_mentions', {
                    p_survey_id: parseInt(surveyId, 10),
                }).range(page * 1000, (page + 1) * 1000 - 1);
                if (error) {
                    // On timeout, return empty — cross-unit-mentions warm step will populate
                    // the cache so subsequent loads use the fast path.
                    console.warn('[dependency-graph] RPC error (returning empty):', error.message);
                    return NextResponse.json({ mentions: [] });
                }
                const batch = data || [];
                segments.push(...batch.map((r: any) => ({
                    related_unit_ids: r.related_unit_ids,
                    target_unit_id: r.target_unit_id,
                })));
                if (batch.length < 1000) break;
                page++;
            }
        } else {
            // Global: paginate directly (no survey filter needed)
            let page = 0;
            while (true) {
                const { data: segs } = await supabase
                    .from('feedback_segments')
                    .select('related_unit_ids, raw_input_id')
                    .not('related_unit_ids', 'is', null)
                    .range(page * 1000, (page + 1) * 1000 - 1);
                if (!segs || segs.length === 0) break;

                const rawInputIds = [...new Set(segs.map((s: any) => s.raw_input_id).filter(Boolean))] as number[];
                const inputMap = new Map<number, number>();
                for (let i = 0; i < rawInputIds.length; i += CHUNK) {
                    const { data: iBat } = await supabase
                        .from('raw_feedback_inputs')
                        .select('id, target_unit_id')
                        .in('id', rawInputIds.slice(i, i + CHUNK));
                    if (iBat) iBat.forEach((r: any) => inputMap.set(r.id, r.target_unit_id));
                }
                segments.push(...segs.map((d: any) => ({
                    related_unit_ids: d.related_unit_ids,
                    target_unit_id: inputMap.get(d.raw_input_id) ?? null,
                })));
                if (segs.length < 1000) break;
                page++;
            }
        }

        if (!segments.length) return NextResponse.json({ mentions: [] });

        const { data: unitsData } = await supabase.from('organization_units').select('id, name, short_name');
        const unitsMap = new Map((unitsData || []).map((u: any) => [
            u.id,
            { name: u.name, short: u.short_name || u.name.split(' ')[0] },
        ]));

        const countMap = new Map<string, number>();
        for (const seg of segments) {
            const sourceId = seg.target_unit_id;
            const related = seg.related_unit_ids;
            if (!sourceId || !related || !Array.isArray(related)) continue;
            for (const targetId of related) {
                if (targetId !== sourceId) {
                    const key = `${sourceId}::${targetId}`;
                    countMap.set(key, (countMap.get(key) || 0) + 1);
                }
            }
        }

        const mentions: any[] = [];
        for (const [key, count] of countMap.entries()) {
            const [sId, tId] = key.split('::').map(Number);
            const src = unitsMap.get(sId);
            const tgt = unitsMap.get(tId);
            if (src && tgt) mentions.push({ sourceId: sId, sourceName: src.short, targetId: tId, targetName: tgt.short, count });
        }
        mentions.sort((a, b) => b.count - a.count);

        return NextResponse.json({ mentions });
    } catch (error: any) {
        console.error('DependencyGraph API Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
