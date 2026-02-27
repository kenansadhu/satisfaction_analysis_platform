import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const surveyId = searchParams.get('surveyId');

        let segmentsList: any[] = [];
        let respMap = new Map<number, any>();

        const selectStr = `
            id,
            segment_text,
            sentiment,
            raw_input_id,
            category: analysis_categories(id, name),
            raw_input: raw_feedback_inputs(
                id,
                raw_text,
                unit_id: target_unit_id,
                respondent_id
            )
        `;

        if (surveyId) {
            const { data: resps } = await supabase.from('respondents').select('id, faculty, study_program, location').eq('survey_id', surveyId);
            (resps || []).forEach(r => respMap.set(r.id, r));
            const respIds = Array.from(respMap.keys());

            const inputIds: number[] = [];
            const CHUNK = 400;
            const inputPromises = [];
            for (let i = 0; i < respIds.length; i += CHUNK) {
                const chunk = respIds.slice(i, i + CHUNK);
                inputPromises.push(supabase.from('raw_feedback_inputs').select('id').in('respondent_id', chunk));
            }
            const inputResults = await Promise.all(inputPromises);
            for (const res of inputResults) if (res.data) inputIds.push(...res.data.map(d => d.id));

            if (inputIds.length > 0) {
                const segPromises = [];
                for (let i = 0; i < inputIds.length; i += CHUNK) {
                    const chunk = inputIds.slice(i, i + CHUNK);
                    segPromises.push(supabase.from('feedback_segments').select(selectStr).eq('is_suggestion', true).in('raw_input_id', chunk));
                }
                const segResults = await Promise.all(segPromises);
                for (const res of segResults) if (res.data) segmentsList.push(...res.data);
                segmentsList.sort((a, b) => b.id - a.id);
            }
        } else {
            const { data, error } = await supabase
                .from('feedback_segments')
                .select(selectStr)
                .eq('is_suggestion', true)
                .order('id', { ascending: false })
                .limit(500);
            if (error) throw error;
            segmentsList = data || [];

            const rIds = [...new Set(segmentsList.map(s => s.raw_input?.respondent_id).filter(Boolean))];
            if (rIds.length > 0) {
                const CHUNK = 400;
                const rPromises = [];
                for (let i = 0; i < rIds.length; i += CHUNK) {
                    rPromises.push(supabase.from('respondents').select('id, faculty, study_program, location').in('id', rIds.slice(i, i + CHUNK)));
                }
                const rResults = await Promise.all(rPromises);
                for (const res of rResults) if (res.data) res.data.forEach(r => respMap.set(r.id, r));
            }
        }

        // Fetch Units separately because of strict foreign key joins
        // We will map the unit names into the segments
        const { data: units } = await supabase.from('organization_units').select('id, name, short_name');
        const unitMap = new Map((units || []).map(u => [u.id, u]));

        // Shape Data for the Frontend
        const formattedData = segmentsList.map((seg: any) => {
            const raw = seg.raw_input;
            const resp = respMap.get(raw?.respondent_id);
            const unitInfo = unitMap.get(raw?.unit_id);

            return {
                id: seg.id,
                text: seg.segment_text,
                original_text: raw?.raw_text,
                sentiment: seg.sentiment,
                category: seg.category ? (Array.isArray(seg.category) ? seg.category[0]?.name : seg.category.name) : "Uncategorized",
                unit: {
                    id: raw?.unit_id,
                    name: unitInfo?.name || "Unknown Unit",
                    short_name: unitInfo?.short_name || null
                },
                context: {
                    faculty: resp?.faculty,
                    program: resp?.study_program,
                    location: resp?.location
                }
            };
        });

        return NextResponse.json(formattedData);
    } catch (error: any) {
        console.error("Suggestion API Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
