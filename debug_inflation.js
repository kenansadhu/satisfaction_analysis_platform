const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function debug() {
    console.log("Checking for units with suspicious counts...");
    
    const surveyId = 6;
    const { data: resps } = await supabase.from('respondents').select('id').eq('survey_id', surveyId);
    const respIds = resps.map(r => r.id);
    
    // Get unit IDs for Layanan Keuangan (likely 8 or something)
    const { data: units } = await supabase.from('organization_units').select('id, name');
    
    for (const unit of units) {
        const { count: inflatedCount } = await supabase.from('raw_feedback_inputs')
            .select('*', { count: 'exact', head: true })
            .eq('target_unit_id', unit.id)
            .eq('requires_analysis', true)
            .in('respondent_id', respIds.slice(0, 200)); // Sample

        const { count: quantitativeButNeedsAnalysis } = await supabase.from('raw_feedback_inputs')
            .select('*', { count: 'exact', head: true })
            .eq('target_unit_id', unit.id)
            .eq('requires_analysis', true)
            .eq('is_quantitative', true)
            .in('respondent_id', respIds.slice(0, 200));

        if (quantitativeButNeedsAnalysis > 0) {
            console.log(`Unit: ${unit.name} (ID: ${unit.id}) has ${quantitativeButNeedsAnalysis} items that are BOTH quantitative AND marked for analysis (out of ${inflatedCount} pending items sampled).`);
            
            const { data: cols } = await supabase.from('raw_feedback_inputs')
                .select('source_column')
                .eq('target_unit_id', unit.id)
                .eq('requires_analysis', true)
                .eq('is_quantitative', true)
                .in('respondent_id', respIds.slice(0, 200))
                .limit(5);
            console.log("Sample columns:", cols.map(c => c.source_column));
        }
    }
}

debug();
