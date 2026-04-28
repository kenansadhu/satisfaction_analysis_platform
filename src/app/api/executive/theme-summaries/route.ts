import { NextRequest, NextResponse } from "next/server";
import { callGemini, wrapUserData } from "@/lib/ai";
import { supabaseServer as supabase } from "@/lib/supabase-server";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
    try {
        const { surveyId, themes } = await req.json();

        if (!Array.isArray(themes) || themes.length === 0) {
            return NextResponse.json({ summaries: {} });
        }

        const prompt = `You are summarizing student feedback for a university dashboard.

For each theme below, write exactly ONE concise sentence (max 20 words) that captures what students are collectively asking for or concerned about. Be specific — name the actual issue, not generic platitudes. Do not start with "Students" every time.

Return valid JSON: {"<key>": "<one sentence>", ...}

Rules:
- One sentence per key, no more
- Active voice preferred
- Mention the specific concern (e.g. "Parking availability near campus is insufficient" not "Students have concerns about facilities")
- Do not wrap values in quotes beyond what JSON requires

${wrapUserData(themes.map((t: any) => ({
    key: t.key,
    unit: t.unit,
    category: t.category,
    voices: t.count,
    sample_quotes: t.quotes,
})))}`;

        const result = await callGemini(prompt, { jsonMode: true }) as Record<string, string>;

        // Save to survey_ai_reports (fire-and-forget)
        if (surveyId) {
            supabase
                .from("survey_ai_reports")
                .upsert(
                    {
                        survey_id: parseInt(surveyId),
                        report_type: "theme_summaries",
                        content: result,
                        updated_at: new Date().toISOString(),
                    },
                    { onConflict: "survey_id,report_type" }
                )
                .then(({ error }) => {
                    if (error) console.error("[theme-summaries] save error:", error.message);
                    else console.log(`[theme-summaries] saved ${Object.keys(result).length} summaries for survey ${surveyId}`);
                });
        }

        return NextResponse.json({ summaries: result });
    } catch (error: any) {
        console.error("[theme-summaries] error:", error);
        return NextResponse.json({ error: error.message || "Failed to generate summaries" }, { status: 500 });
    }
}
