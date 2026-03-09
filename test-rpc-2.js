const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
    console.log("Testing get_global_dashboard_metrics RPC...");
    const { data, error } = await supabase.rpc('get_global_dashboard_metrics', {
        p_survey_id: null
    });

    if (error) {
        console.error("RPC Error Details:");
        console.error(error);
        console.error("Message:", error.message);
        console.error("Details:", error.details);
        console.error("Hint:", error.hint);
        console.error("Code:", error.code);
    } else {
        console.log("Success! Data length:", data?.length);
    }
}

test();
