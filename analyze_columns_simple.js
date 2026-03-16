const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function analyzeColumns() {
    const surveyId = 6;
    const { data: resps } = await supabase.from('respondents').select('id').eq('survey_id', surveyId);
    const respIds = resps.map(r => r.id);

    const { data: colStats } = await supabase.from('raw_feedback_inputs')
        .select('source_column, target_unit_id, is_quantitative, requires_analysis')
        .in('respondent_id', respIds.slice(0, 100)); // Sample 100

    const stats = {};
    colStats.forEach(row => {
        const key = `${row.target_unit_id}|${row.source_column}`;
        if (!stats[key]) stats[key] = { unitId: row.target_unit_id, column: row.source_column, total: 0, qual: 0 };
        stats[key].total++;
        if (row.requires_analysis) stats[key].qual++;
    });

    const { data: units } = await supabase.from('organization_units').select('id, name');
    const unitMap = Object.fromEntries(units.map(u => [u.id, u.name]));

    console.log("UNIT | COLUMN | QUAL COUNT (SAMPLED)");
    Object.values(stats).forEach(s => {
        if (s.qual > 40) { // Only high contributors
            console.log(`${unitMap[s.unitId]} | ${s.column} | ${s.qual}`);
        }
    });
}

analyzeColumns();
