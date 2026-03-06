const { createClient } = require('@supabase/supabase-js');
const url = 'https://axfeurjlxvqsrimpzeis.supabase.co';
const key = 'sb_publishable_ofjVyy6fLkody5mKfkBc5A_Di6LuiJy';
const supabase = createClient(url, key);

async function check() {
    try {
        const { data: surveys, error: qErr } = await supabase.from('surveys').select('id, title').ilike('title', '%SSI 2025%');
        if (qErr) throw qErr;
        if (!surveys || surveys.length === 0) {
            console.log("No survey found with 'SSI 2025'");
            return;
        }
        const surveyId = surveys[0].id;
        console.log(`Found survey: ${surveys[0].title} (ID: ${surveyId})`);

        const { count, error } = await supabase.from('survey_column_cache').select('*', { count: 'exact', head: true }).eq('survey_id', surveyId);
        if (error) {
            console.error("Error fetching cache count:", error);
        } else {
            console.log(`Current cache count for survey ${surveyId}: ${count} columns saved.`);
        }

        // Also list some columns to be sure
        const { data: rows } = await supabase.from('survey_column_cache').select('source_column, created_at').eq('survey_id', surveyId).limit(5);
        if (rows && rows.length > 0) {
            console.log("Sample cached columns:");
            rows.forEach(r => console.log(` - ${r.source_column} (saved at ${r.created_at})`));
        }
    } catch (err) {
        console.error("Unexpected error:", err);
    }
}
check();
