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
            // Single RPC join — replaces the slow respondents→inputs→segments chain
            const { data, error } = await supabase.rpc('get_survey_cross_mentions', {
                p_survey_id: parseInt(surveyId, 10),
            });
            if (error) throw error;
            segments = (data || []).map((r: any) => ({
                related_unit_ids: r.related_unit_ids,
                target_unit_id: r.target_unit_id,
            }));
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
