import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const surveyId = searchParams.get('surveyId');

        // Base Query: We want all segments flagged as is_suggestion = true
        // and we need to pull up their context (raw text, unit, respondent location)
        let query = supabase
            .from('feedback_segments')
            .select(`
                id,
                segment_text,
                sentiment,
                category: analysis_categories(id, name),
                raw_input: raw_feedback_inputs!inner(
                    id,
                    raw_text,
                    unit_id: target_unit_id,
                    respondents!inner(
                        survey_id,
                        faculty,
                        study_program,
                        location
                    )
                )
                `)
            .eq('is_suggestion', true)
            .order('id', { ascending: false });

        if (surveyId) {
            query = query.eq('raw_input.respondents.survey_id', surveyId);
        }

        const { data, error } = await query;

        if (error) throw error;

        // Fetch Units separately because of strict foreign key joins
        // We will map the unit names into the segments
        const { data: units } = await supabase.from('organization_units').select('id, name, short_name');
        const unitMap = new Map((units || []).map(u => [u.id, u]));

        // Shape Data for the Frontend
        const formattedData = (data || []).map((seg: any) => {
            const raw = seg.raw_input;
            const resp = raw?.respondents;
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
