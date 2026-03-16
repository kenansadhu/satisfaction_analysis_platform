const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function audit() {
    console.log("--- SURVEY 6 DATA AUDIT ---");
    const surveyId = 6;

    // 1. Get respondent IDs
    const { data: resps } = await supabase.from('respondents').select('id').eq('survey_id', surveyId);
    if (!resps || resps.length === 0) {
        console.log("No respondents found for survey 6.");
        return;
    }
    const respIds = resps.map(r => r.id);
    console.log(`Auditing ${respIds.length} respondents.`);

    // 2. Get distribution for problematic units
    const { data: units } = await supabase.from('organization_units').select('id, name');
    
    for (const unit of units) {
        // Sample check for this unit
        const { data: stats } = await supabase.from('raw_feedback_inputs')
            .select('is_quantitative, requires_analysis')
            .eq('target_unit_id', unit.id)
            .in('respondent_id', respIds.slice(0, 500));

        if (!stats || stats.length === 0) continue;

        const total = stats.length;
        const qualOnly = stats.filter(s => s.requires_analysis && !s.is_quantitative).length;
        const quantOnly = stats.filter(s => !s.requires_analysis && s.is_quantitative).length;
        const neither = stats.filter(s => !s.requires_analysis && !s.is_quantitative).length;
        const both = stats.filter(s => s.requires_analysis && s.is_quantitative).length;

        if (both > 0 || qualOnly > (total / 2)) {
            console.log(`\nUnit: ${unit.name} (ID: ${unit.id})`);
            console.log(`  Sample Total: ${total}`);
            console.log(`  Qualitative Only (req=T, quant=F): ${qualOnly}`);
            console.log(`  Quantitative Only (req=F, quant=T): ${quantOnly}`);
            console.log(`  Neither (req=F, quant=F): ${neither}`);
            console.log(`  BOTH (req=T, quant=T) [CRITICAL]: ${both}`);

            // Sample some column names for the "Both" or "Qual" cases
            const { data: samples } = await supabase.from('raw_feedback_inputs')
                .select('source_column, raw_text')
                .eq('target_unit_id', unit.id)
                .in('respondent_id', respIds.slice(0, 500))
                .limit(10);
            
            console.log("  Sample columns:", [...new Set(samples.map(s => s.source_column))]);
        }
    }
}

audit();
