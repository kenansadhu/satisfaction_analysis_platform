const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function analyzeColumns() {
    const surveyId = 6;
    console.log(`Analyzing columns for Survey ID: ${surveyId}`);

    const { data: resps } = await supabase.from('respondents').select('id').eq('survey_id', surveyId);
    const respIds = resps.map(r => r.id);

    // Group by source_column and target_unit_id where requires_analysis = true
    const { data: colStats, error } = await supabase.from('raw_feedback_inputs')
        .select('source_column, target_unit_id, is_quantitative, requires_analysis')
        .in('respondent_id', respIds.slice(0, 1000)); // Sample 1000 respondents

    const stats = {};
    colStats.forEach(row => {
        const key = `${row.target_unit_id}|${row.source_column}`;
        if (!stats[key]) {
            stats[key] = { 
                unitId: row.target_unit_id, 
                column: row.source_column, 
                total: 0, 
                qual: 0,
                isQuant: row.is_quantitative,
                isReq: row.requires_analysis
            };
        }
        stats[key].total++;
        if (row.requires_analysis) stats[key].qual++;
    });

    const { data: units } = await supabase.from('organization_units').select('id, name');
    const unitMap = Object.fromEntries(units.map(u => [u.id, u.name]));

    const sorted = Object.values(stats)
        .map(s => ({ ...s, unitName: unitMap[s.unitId], qualPerResp: s.qual / 1000 }))
        .sort((a, b) => b.qual - a.qual);

    console.log("\nTop Qualitative Contributors (Scaled to 1000 respondents):");
    console.table(sorted.slice(0, 20).map(s => ({
        Unit: s.unitName,
        Column: s.column.substring(0, 50) + "...",
        QualItems: s.qual,
        IsQuant: s.isQuant,
        IsReq: s.isReq
    })));
}

analyzeColumns();
