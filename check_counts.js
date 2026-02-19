
const { createClient } = require('@supabase/supabase-js');

// HARDCODED CREDENTIALS FOR DIAGNOSTIC (Since .env reading is failing)
// I will attempt to read these from the user's project if I can find them, 
// otherwise I will ask the user. 
// Wait, I can see them in `src/lib/supabase.ts`? No, that uses process.env.
// I will try to read .env.local again with a simpler approach or just use the ones I can guess if they are in the context.
// Actually, I can just use `dotenv` now that I am installing it.

require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("STILL Missing Credentials. Please check .env.local");
    console.log("Current Directory:", process.cwd());
    console.log("Env keys:", Object.keys(process.env));
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkCounts() {
    console.log("--- DIAGNOSTIC START ---");
    console.log("Connected to:", supabaseUrl);

    // 1. Get Unit ID for CTL
    const { data: unit, error: unitError } = await supabase.from('organization_units').select('id, name').ilike('name', '%Teaching and Learning%').maybeSingle();

    if (unitError) { console.error("Unit Error:", unitError); return; }
    if (!unit) { console.log("Unit 'Center for Teaching and Learning' not found"); return; }
    const unitId = unit.id;
    console.log(`Unit Found: ${unit.name} (ID: ${unitId})`);

    // 2. Get Survey ID
    const { data: survey, error: surveyError } = await supabase.from('surveys').select('id, title').ilike('title', '%Test Survey 17 Feb 2026%').maybeSingle();

    if (surveyError) { console.error("Survey Error:", surveyError); return; }
    if (!survey) { console.log("Survey 'Test Survey 17 Feb 2026' not found"); return; }
    const surveyId = survey.id;
    console.log(`Survey Found: ${survey.title} (ID: ${surveyId})`);

    // 3. Count TOTAL Raw Inputs for this Unit (All Time)
    const { count: totalRaw } = await supabase.from('raw_feedback_inputs').select('*', { count: 'exact', head: true }).eq('target_unit_id', unitId);
    console.log(`[DB] Total Rows for Unit (All Time): ${totalRaw}`);

    // 4. Count Rows Linked to Survey
    const { count: surveyRaw } = await supabase.from('raw_feedback_inputs').select('*, respondents!inner(survey_id)', { count: 'exact', head: true }).eq('target_unit_id', unitId).eq('respondents.survey_id', surveyId);
    console.log(`[DB] Rows Linked to SurveyID ${surveyId}: ${surveyRaw}`);

    // 5. Count Linked + Requires Analysis
    const { count: surveyQual } = await supabase.from('raw_feedback_inputs')
        .select('*, respondents!inner(survey_id)', { count: 'exact', head: true })
        .eq('target_unit_id', unitId)
        .eq('respondents.survey_id', surveyId)
        .eq('requires_analysis', true);
    console.log(`[DB] Linked + Requires Analysis (Dashboard Count): ${surveyQual}`);

    // 6. Count Linked + Is Quantitative
    const { count: surveyQuant } = await supabase.from('raw_feedback_inputs')
        .select('*, respondents!inner(survey_id)', { count: 'exact', head: true })
        .eq('target_unit_id', unitId)
        .eq('respondents.survey_id', surveyId)
        .eq('is_quantitative', true);
    console.log(`[DB] Linked + Is Quantitative (Hidden): ${surveyQuant}`);

    console.log("--- DIAGNOSTIC END ---");
}

checkCounts();
