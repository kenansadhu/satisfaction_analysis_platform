
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkCounts() {
    console.log("--- DIAGNOSTIC START ---");

    // 1. Get Unit ID for CTL
    const { data: unit } = await supabase.from('organization_units').select('id').ilike('name', '%Teaching and Learning%').single();
    if (!unit) { console.log("Unit not found"); return; }
    const unitId = unit.id;
    console.log(`Unit: CTL (ID: ${unitId})`);

    // 2. Get Survey ID
    const { data: survey } = await supabase.from('surveys').select('id').ilike('title', '%Test Survey 17 Feb 2026%').single();
    if (!survey) { console.log("Survey not found"); return; }
    const surveyId = survey.id;
    console.log(`Survey: Test Survey (ID: ${surveyId})`);

    // 3. Count TOTAL Raw Inputs for this Unit (All Time)
    const { count: totalRaw } = await supabase.from('raw_feedback_inputs').select('*', { count: 'exact', head: true }).eq('target_unit_id', unitId);
    console.log(`TOTAL Raw Inputs (All Time): ${totalRaw}`);

    // 4. Count Inputs Linked to Survey
    const { count: surveyRaw } = await supabase.from('raw_feedback_inputs').select('*, respondents!inner(survey_id)', { count: 'exact', head: true }).eq('target_unit_id', unitId).eq('respondents.survey_id', surveyId);
    console.log(`Inputs Linked to This Survey: ${surveyRaw}`);

    // 5. Count Inputs Linked to Survey AND requires_analysis=true
    const { count: surveyQual } = await supabase.from('raw_feedback_inputs')
        .select('*, respondents!inner(survey_id)', { count: 'exact', head: true })
        .eq('target_unit_id', unitId)
        .eq('respondents.survey_id', surveyId)
        .eq('requires_analysis', true);
    console.log(`Inputs Linked + Requires Analysis: ${surveyQual}`);

    // 6. Count Inputs Linked to Survey AND is_quantitative=true
    const { count: surveyQuant } = await supabase.from('raw_feedback_inputs')
        .select('*, respondents!inner(survey_id)', { count: 'exact', head: true })
        .eq('target_unit_id', unitId)
        .eq('respondents.survey_id', surveyId)
        .eq('is_quantitative', true);
    console.log(`Inputs Linked + Is Quantitative (Hidden): ${surveyQuant}`);

    console.log("--- DIAGNOSTIC END ---");
}

checkCounts();
