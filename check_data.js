const { createClient } = require('@supabase/supabase-js');
const url = 'https://axfeurjlxvqsrimpzeis.supabase.co';
const key = 'sb_publishable_ofjVyy6fLkody5mKfkBc5A_Di6LuiJy';
const supabase = createClient(url, key);

async function checkData() {
    try {
        const { data: surveys, error: qErr } = await supabase.from('surveys').select('id, title, created_at');
        if (surveys) {
            console.log(`There are ${surveys.length} surveys in the database:`);
            surveys.forEach(s => console.log(` - ID: ${s.id}, Title: ${s.title}, Created: ${s.created_at}`));
        }

        // Let's count respondents per survey
        for (const s of surveys || []) {
            const { count, error } = await supabase.from('respondents').select('*', { count: 'exact', head: true }).eq('survey_id', s.id);
            console.log(`   -> Survey ${s.id} has ${count} respondents.`);

            // Note: Since raw_feedback_inputs links to respondent_id, we can't easily count per survey via REST without joining.
        }
    } catch (err) {
        console.error("Error:", err);
    }
}
checkData();
