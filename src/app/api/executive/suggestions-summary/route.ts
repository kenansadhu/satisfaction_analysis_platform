import { NextRequest, NextResponse } from "next/server";
import { callGemini, wrapUserData } from "@/lib/ai";
import { supabaseServer as supabase } from "@/lib/supabase-server";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
    try {
        const { surveyId, stats, themes, cross_unit_patterns } = await req.json();

        if (!Array.isArray(themes) || themes.length === 0) {
            return NextResponse.json({ error: "themes required" }, { status: 400 });
        }

        const prompt = `You are an institutional analyst writing a structured executive briefing on student suggestions for university leadership (deans, vice-rectors, board members).

You are given:
1. Top suggestion themes (grouped by unit × category, with real student quotes and sentiment counts)
2. Cross-unit patterns (categories that appear across multiple units — these are systemic issues)
3. Survey-level statistics

Produce a structured JSON report in EXACTLY this format:

{
  "headline": "One punchy sentence (max 20 words) capturing the most important takeaway",
  "overall_mood": "Urgent | Concerning | Mixed | Constructive | Positive",
  "top_issues": [
    {
      "title": "Short issue title (5-8 words)",
      "detail": "2-3 sentences: what students want, how widespread, why it matters for the institution",
      "units_affected": ["Unit Name A", "Unit Name B"],
      "evidence": "Exact verbatim quote from the provided data",
      "urgency": "High | Medium | Low"
    }
  ],
  "systemic_patterns": [
    {
      "category": "Category name from the cross-unit data",
      "detail": "Why this is a systemic issue (not just one unit's problem), and what it signals institutionally",
      "units": ["Unit A", "Unit B"],
      "evidence": "Exact verbatim quote from the provided data"
    }
  ],
  "bright_spots": [
    {
      "title": "Short positive theme title",
      "detail": "What students constructively suggest or appreciate — frame as an opportunity",
      "evidence": "Exact verbatim quote from the provided data"
    }
  ],
  "recommended_actions": [
    {
      "action": "Specific, actionable step leadership can take",
      "rationale": "Why the data warrants this action (cite units or patterns)",
      "timeline": "Immediate | Short-term | Long-term"
    }
  ],
  "closing_statement": "1-2 sentences: overall assessment of student sentiment and the institution's priority focus area"
}

Rules:
- top_issues: exactly 3 items — pick the themes with the highest urgency and volume
- systemic_patterns: 2-3 items — only include categories that genuinely span 2+ units from the cross-unit data; if fewer than 2 exist, use 2 anyway by drawing from the themes
- bright_spots: exactly 2 items — find genuinely constructive or positive signals, even in critical data
- recommended_actions: exactly 3 items — one Immediate, one Short-term, one Long-term
- evidence must be exact verbatim quotes from the provided quotes in the data — never invent quotes
- Be specific: name actual units, categories, and numbers from the data
- overall_mood must reflect the dominant sentiment across all themes

Return ONLY valid JSON. No markdown, no explanation.

${wrapUserData({ stats, themes, cross_unit_patterns })}`;

        let parsed: any;
        let retries = 0;
        while (retries <= 2) {
            const result = await callGemini(prompt, { jsonMode: true });
            try {
                parsed = typeof result === "string" ? JSON.parse(result) : result;
                if (parsed?.headline && parsed?.top_issues) break;
                throw new Error("Missing required fields");
            } catch {
                retries++;
                if (retries > 2) {
                    return NextResponse.json({ error: "AI returned invalid structure after retries" }, { status: 500 });
                }
            }
        }

        // Save to survey_ai_reports (fire-and-forget — don't block the response)
        if (surveyId) {
            supabase
                .from("survey_ai_reports")
                .upsert(
                    {
                        survey_id: parseInt(surveyId),
                        report_type: "exec_summary",
                        content: parsed,
                        updated_at: new Date().toISOString(),
                    },
                    { onConflict: "survey_id,report_type" }
                )
                .then(({ error }) => {
                    if (error) console.error("[suggestions-summary] save error:", error.message);
                    else console.log(`[suggestions-summary] saved exec_summary for survey ${surveyId}`);
                });
        }

        return NextResponse.json({ report: parsed });
    } catch (error: any) {
        console.error("[suggestions-summary] error:", error);
        return NextResponse.json({ error: error.message || "Failed to generate summary" }, { status: 500 });
    }
}
