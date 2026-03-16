const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function findDirtyColumns() {
    const surveyId = 6;
    const { data: resps } = await supabase.from('respondents').select('id').eq('survey_id', surveyId);
    
    // Check for columns that are is_quantitative=true AND requires_analysis=true
    const { data: dirty } = await supabase.from('raw_feedback_inputs')
        .select('source_column, target_unit_id')
        .eq('requires_analysis', true)
        .eq('is_quantitative', true)
        .in('respondent_id', resps.slice(0, 100).map(r => r.id));

    const dirtyCols = [...new Set(dirty.map(d => d.source_column))];
    
    if (dirtyCols.length > 0) {
        console.log("Found quantitative columns with requires_analysis=true:");
        dirtyCols.forEach(c => console.log(` - ${c}`));
    } else {
        console.log("No columns found with both flags true in sample.");
    }
    
    // Also check for columns that are is_quantitative=false but should probably NOT be analyzed (e.g. categorical)
    // Actually, it's hard to tell automatically.
}

findDirtyColumns();
