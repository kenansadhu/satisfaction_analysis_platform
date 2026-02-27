import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    console.log("Testing raw_feedback_inputs query WITH BODY...");
    const { data: d1, error: e1, count: c1 } = await supabase
        .from("raw_feedback_inputs")
        .select("id, respondents!inner(survey_id)", { count: "exact" })
        .eq("respondents.survey_id", 3)
        .eq("requires_analysis", false)
        .limit(1);

    console.log("Result 1 Error:", e1);

    console.log("Testing RPC 'get_report_aggregates'...");
    const { data: d2, error: e2 } = await supabase.rpc('get_report_aggregates', {
        p_survey_id: 3,
    });

    console.log("RPC Error:", e2);
}

run();
