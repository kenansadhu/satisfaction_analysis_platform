import { NextResponse } from 'next/server';
import { supabaseServer as supabase } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const surveyId = searchParams.get('surveyId');

        // Fast path: return pre-computed suggestions from v2 cache
        if (surveyId) {
            const { data: surveyData } = await supabase
                .from('surveys')
                .select('ai_dataset_cache')
                .eq('id', parseInt(surveyId, 10))
                .single();
            const cache = (surveyData as any)?.ai_dataset_cache;
            if (cache?.v === 2 && Array.isArray(cache.suggestions) && cache.suggestions.length > 0) {
                console.log(`[suggestions] Cache hit: ${cache.suggestions.length} suggestions`);
                return NextResponse.json(cache.suggestions);
            }
        }

        // Slow path: live RPC fallback
        let rows: any[] = [];
        if (surveyId) {
            const { data, error } = await supabase.rpc('get_survey_suggestions', {
                p_survey_id: parseInt(surveyId, 10),
            });
            if (error) throw error;
            rows = data || [];
        } else {
            const { data, error } = await supabase.rpc('get_global_suggestions', {});
            if (error) throw error;
            rows = data || [];
        }

        console.log(`[suggestions] RPC returned ${rows.length} rows for surveyId=${surveyId ?? 'global'}`);
        if (rows.length === 0) return NextResponse.json([]);

        // Fetch categories and units (small lookups)
        const catIds = [...new Set(rows.map((r: any) => r.category_id).filter(Boolean))];
        const catMap = new Map<number, any>();
        if (catIds.length > 0) {
            const { data: cats } = await supabase.from('analysis_categories').select('id, name').in('id', catIds);
            (cats || []).forEach((c: any) => catMap.set(c.id, c));
        }
        const { data: units } = await supabase.from('organization_units').select('id, name, short_name');
        const unitMap = new Map((units || []).map((u: any) => [u.id, u]));

        const formattedData = rows.map((row: any) => {
            const unitInfo = unitMap.get(row.target_unit_id);
            const cat = catMap.get(row.category_id);
            return {
                id: row.id,
                text: row.segment_text,
                original_text: row.raw_text,
                sentiment: row.sentiment,
                category: cat?.name || 'Uncategorized',
                unit: {
                    id: row.target_unit_id,
                    name: unitInfo?.name || 'Unknown Unit',
                    short_name: unitInfo?.short_name || null,
                },
                context: {
                    faculty: row.faculty,
                    program: row.study_program,
                    location: row.location,
                },
            };
        });

        return NextResponse.json(formattedData);
    } catch (error: any) {
        console.error('Suggestion API Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
