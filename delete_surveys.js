const { createClient } = require('@supabase/supabase-js');
const url = 'https://axfeurjlxvqsrimpzeis.supabase.co';
const key = 'sb_publishable_ofjVyy6fLkody5mKfkBc5A_Di6LuiJy';
const supabase = createClient(url, key, { auth: { persistSession: false } });

async function deleteSurveys() {
    console.log("Resuming deletion of duplicate surveys with smaller chunks...");

    for (const surveyId of [4, 5]) {
        console.log(`\nChecking survey ${surveyId}...`);

        let hasMore = true;
        let totalDeleted = 0;

        while (hasMore) {
            const { data: respChunk, error: fetchErr } = await supabase
                .from('respondents')
                .select('id')
                .eq('survey_id', surveyId)
                // Small chunk size! The cascade includes tens of thousands of rows
                .limit(200);

            if (fetchErr) {
                console.error("Fetch error:", fetchErr);
                break;
            }

            if (!respChunk || respChunk.length === 0) {
                console.log(`No more respondents to delete for survey ${surveyId}.`);
                hasMore = false;
                break;
            }

            const ids = respChunk.map(r => r.id);
            console.log(`Deleting chunk of ${ids.length} respondents...`);

            const { error: delErr } = await supabase
                .from('respondents')
                .delete()
                .in('id', ids);

            if (delErr) {
                console.error("Timeout on 200 chunk, falling back to 50...", delErr.message);

                // Extremely tiny chunk fallback
                const tinyIds = ids.slice(0, 50);
                console.log(`Trying tiny chunk of ${tinyIds.length}...`);
                const { error: tinyErr } = await supabase.from('respondents').delete().in('id', tinyIds);

                if (tinyErr) {
                    console.error("Even tiny chunk failed. Aborting survey", tinyErr.message);
                    break;
                } else {
                    totalDeleted += tinyIds.length;
                    console.log(`Successfully deleted ${totalDeleted} respondents...`);
                }
            } else {
                totalDeleted += ids.length;
                console.log(`Successfully deleted ${totalDeleted} respondents...`);
            }
        }

        // Check if all respondents are really gone before deleting survey
        const { count } = await supabase.from('respondents').select('*', { count: 'exact', head: true }).eq('survey_id', surveyId);

        if (count === 0) {
            console.log(`Finally, deleting survey ${surveyId} record...`);
            const { error: finalErr } = await supabase.from('surveys').delete().eq('id', surveyId);
            if (finalErr) console.error(`Error deleting survey ${surveyId}:`, finalErr);
            else console.log(`Survey ${surveyId} deleted completely.`);
        } else {
            console.log(`Skipping survey ${surveyId} deletion because ${count} respondents remain.`);
        }
    }
    console.log("\nCleanup script finished.");
}

deleteSurveys();
