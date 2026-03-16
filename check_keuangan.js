const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function checkKeuangan() {
    const { data: unit } = await supabase.from('organization_units').select('id').eq('name', 'Layanan Keuangan').single();
    if (!unit) return;
    
    console.log(`Checking unit: Layanan Keuangan (ID: ${unit.id})`);
    
    const surveyId = 6;
    const { data: resps } = await supabase.from('respondents').select('id').eq('survey_id', surveyId);
    
    const { data: summary } = await supabase.from('raw_feedback_inputs')
        .select('is_quantitative, requires_analysis, source_column, raw_text')
        .eq('target_unit_id', unit.id)
        .in('respondent_id', resps.slice(0, 100).map(r => r.id));

    const total = summary.length;
    const reqTrue = summary.filter(s => s.requires_analysis).length;
    const quantTrue = summary.filter(s => s.is_quantitative).length;
    const both = summary.filter(s => s.requires_analysis && s.is_quantitative).length;

    console.log(`Stats (for 100 respondents):`);
    console.log(`Total records: ${total}`);
    console.log(`requires_analysis = true: ${reqTrue}`);
    console.log(`is_quantitative = true: ${quantTrue}`);
    console.log(`BOTH = true: ${both}`);

    const uniqueCols = [...new Set(summary.map(s => s.source_column))];
    console.log("\nColumns for this unit:");
    for (const col of uniqueCols) {
        const sample = summary.find(s => s.source_column === col);
        console.log(` - [${col}] (quant=${sample.is_quantitative}, req=${sample.requires_analysis}) Sample: "${sample.raw_text}"`);
    }
}

checkKeuangan();
