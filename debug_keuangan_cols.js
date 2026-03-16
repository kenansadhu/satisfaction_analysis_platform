const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function checkKeuangan() {
    const { data: unit } = await supabase.from('organization_units').select('id').eq('name', 'Layanan Keuangan').single();
    if (!unit) {
        console.log("Unit not found");
        return;
    }
    
    const surveyId = 6;
    const { data: resps } = await supabase.from('respondents').select('id').eq('survey_id', surveyId);
    if (!resps) return;

    console.log(`Unit ID for Keuangan: ${unit.id}`);

    const { data: colStats } = await supabase.from('raw_feedback_inputs')
        .select('source_column, is_quantitative, requires_analysis')
        .eq('target_unit_id', unit.id)
        .in('respondent_id', resps.slice(0, 10).map(r => r.id)); // Just 10 resps

    if (!colStats) {
        console.log("No stats found");
        return;
    }

    console.log(`Found ${colStats.length} total records for 10 respondents.`);
    const counts = {};
    colStats.forEach(r => {
        counts[r.source_column] = (counts[r.source_column] || 0) + 1;
        if (r.requires_analysis) {
            console.log(` - Column: ${r.source_column} | requires_analysis: ${r.requires_analysis} | is_quantitative: ${r.is_quantitative}`);
        }
    });

}

checkKeuangan();
