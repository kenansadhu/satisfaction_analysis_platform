const { createClient } = require('@supabase/supabase-js');
const url = 'https://axfeurjlxvqsrimpzeis.supabase.co';
const key = 'sb_publishable_ofjVyy6fLkody5mKfkBc5A_Di6LuiJy';
const supabase = createClient(url, key);

async function checkFKs() {
    const { data, error } = await supabase.rpc('get_foreign_keys_for_surveys');
    if (error) {
        console.error("RPC Error (may not exist):", error);
        // Let's use standard REST api if possible, but information_schema is not exposed by default on REST API.
        console.log("We can't directly check information_schema via REST. Let me check the SQL files or ask the user if they'd prefer to trust the cascade or manual deletion.");
    } else {
        console.log("Foreign keys:", data);
    }
}

checkFKs();
