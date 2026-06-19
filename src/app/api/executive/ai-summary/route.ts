import { NextRequest, NextResponse } from "next/server";
import { supabaseServer as supabase } from "@/lib/supabase-server";
import { callGemini, getAgentSettings, wrapUserData } from "@/lib/ai";

export const maxDuration = 300;

const CACHE_KEY = "exec_ai_summary";

// GET — return cached summary if it exists
export async function GET(req: NextRequest) {
    const surveyId = req.nextUrl.searchParams.get("surveyId");
    if (!surveyId) return NextResponse.json({ error: "surveyId required" }, { status: 400 });

    const { data, error } = await supabase
        .from("survey_misc_cache")
        .select("data, updated_at")
        .eq("survey_id", parseInt(surveyId))
        .eq("cache_key", CACHE_KEY)
        .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ summary: null });
    return NextResponse.json({ summary: data.data, generated_at: data.updated_at });
}

// POST — generate and cache the summary
export async function POST(req: NextRequest) {
    const { surveyId } = await req.json();
    if (!surveyId) return NextResponse.json({ error: "surveyId required" }, { status: 400 });

    // 1. Fetch report data (uses existing cache — fast)
    const origin = req.nextUrl.origin;
    const reportRes = await fetch(`${origin}/api/executive/report?surveyId=${surveyId}`);
    if (!reportRes.ok) return NextResponse.json({ error: "Failed to load report data" }, { status: 500 });
    const report = await reportRes.json();

    // 2. Fetch NPS totals
    const npsRes = await fetch(`${origin}/api/executive/nps?surveyId=${surveyId}`);
    const npsData = npsRes.ok ? await npsRes.json() : null;
    const nps = npsData?.totals ?? null;

    // 3. Assemble context for the AI
    const unitsWithScore = (report.units || [])
        .filter((u: any) => u.satisfaction_index !== null)
        .sort((a: any, b: any) => (b.satisfaction_index ?? 0) - (a.satisfaction_index ?? 0));

    // Macro averages — each unit weighted equally
    const qualUnits = (report.units || []).filter((u: any) => (u.qualitative?.total ?? 0) > 0);
    const totalQual = (report.units || []).reduce((s: number, u: any) => s + (u.qualitative?.total ?? 0), 0);
    const sentimentScore = qualUnits.length > 0
        ? Math.round(qualUnits.reduce((s: number, u: any) => {
            const pos = u.qualitative.positive, neg = u.qualitative.negative, total = u.qualitative.total;
            return s + (pos + 0.5 * (total - pos - neg)) / total * 100;
          }, 0) / qualUnits.length)
        : null;
    const sentPosPct = qualUnits.length > 0
        ? Math.round(qualUnits.reduce((s: number, u: any) => s + (u.qualitative.positive / u.qualitative.total * 100), 0) / qualUnits.length)
        : null;
    const sentNegPct = qualUnits.length > 0
        ? Math.round(qualUnits.reduce((s: number, u: any) => s + (u.qualitative.negative / u.qualitative.total * 100), 0) / qualUnits.length)
        : null;

    const contextData = {
        survey: report.survey,
        total_respondents: report.totalRespondents,
        response_rate: report.responseRate,
        global_ssi: report.globalSatisfactionIndex,
        campus_ssi: report.campusSatisfaction,
        sentiment_score: sentimentScore,
        sentiment_breakdown: { positive_pct: sentPosPct, negative_pct: sentNegPct, total_segments: totalQual },
        nps: nps ? { score: nps.nps_score, total: nps.total } : null,
        units: unitsWithScore.map((u: any) => ({
            name: u.short_name || u.unit_name,
            ssi: u.satisfaction_index,
            campus_scores: u.campus_scores.filter((cs: any) => cs.average !== null).map((cs: any) => ({ campus: cs.campus, ssi: cs.average })),
            sentiment: u.qualitative ? {
                positive_pct: u.qualitative.positive_pct,
                negative_pct: u.qualitative.negative_pct,
                total: u.qualitative.total,
            } : null,
        })),
    };

    // 4. Build prompt
    const { modelId, addendum } = await getAgentSettings("exec-summary");

    const systemPrompt = `You are an institutional research analyst at a university. You write clear, professional, data-driven executive summaries for university leaders.

Your task: analyze the Student Satisfaction Inventory (SSI) survey results and produce a structured JSON executive summary.

The SSI uses a 1–4 Likert scale. Target is ≥ 3.20. Scores are:
  ≥ 3.20 = Good (green)
  3.00–3.19 = Adequate (amber)
  < 3.00 = Needs improvement (red)

The Sentiment Score (0–100) is derived from open-ended comment analysis:
  score = (positive + 0.5 × neutral) / total × 100
  ≥ 65 = Positive culture
  45–64 = Mixed signals
  < 45 = Concerning

Respond ONLY with valid JSON in this exact structure (no markdown, no extra text):
{
  "version": 1,
  "survey_title": "string",
  "overall_verdict": "Outstanding" | "Strong" | "Adequate" | "Needs Improvement" | "Critical",
  "verdict_rationale": "2–3 sentence rationale citing specific numbers",
  "overview": "3–4 sentence executive paragraph covering key themes across SSI, sentiment, and NPS",
  "key_findings": [
    { "type": "strength" | "concern" | "notable", "title": "concise title (max 8 words)", "body": "2–3 sentences with specific data points" }
  ],
  "campus_notes": [
    { "campus": "campus name", "note": "1–2 sentences on what stands out for this campus" }
  ],
  "unit_spotlights": [
    { "type": "top" | "bottom", "unit": "unit name", "ssi": number, "insight": "1–2 sentences on what drives this result" }
  ],
  "sentiment_insight": "2–3 sentences on what the comment sentiment tells us beyond the SSI numbers",
  "nps_insight": "2–3 sentences on the NPS result and what it signals, or null if no NPS data",
  "focus_areas": [
    { "title": "action-oriented title (max 7 words)", "rationale": "2 sentences explaining the priority and expected impact" }
  ]
}

Rules:
- key_findings: exactly 6 items — 3 with type "strength" and 3 with type "concern", ordered strengths first then concerns
  - CONCERNS PRIORITY: Always include units with the worst SSI scores first. If any non-Asrama unit has SSI < 3.00, it MUST appear as a concern. Do NOT waste a concern slot on a unit with SSI ≥ 3.10 when units with SSI < 3.00 exist. The "concern" findings should reflect real danger zones, not just "slightly below 3.20."
  - Also consider sentiment extremes: a unit with sentiment score < 30 and high feedback volume represents hidden institutional risk and deserves a concern finding even if its SSI appears adequate.
- unit_spotlights: exactly 6 items — the top 3 and bottom 3 units by SSI (excluding ties arbitrarily), with type "top" for the top 3 and "bottom" for the bottom 3
  - TOP 3: ordered best-first (highest SSI at position 1)
  - BOTTOM 3: ordered WORST-FIRST (lowest SSI at position 1 of the bottom group — the most problematic unit appears at the top of the "Needs Attention" list)
- focus_areas: exactly 3 items, ordered by priority — the single most critical issue first
- campus_notes: one per campus that has data
- Be specific: cite exact SSI numbers, percentages, unit names
- Write for a Dean or Rector — professional, direct, no filler language
- CAMPUS SCOPE: Do NOT mention campus-specific comparisons or campus name differences anywhere except inside campus_notes. The fields key_findings, unit_spotlights, sentiment_insight, nps_insight, and focus_areas must describe the institution as a whole — never single out one campus as better or worse than another, and never cite a campus-specific score outside of campus_notes.
- ASRAMA: UPH Residence (Asrama) is a dormitory service available only to a small subset of students — it should not appear in key_findings or focus_areas. If Asrama lands in unit_spotlights due to its SSI score, briefly note its limited reach in the insight field and do not use it to draw conclusions about the broader student experience.
${addendum ? `\nAdditional instructions: ${addendum}` : ""}`;

    const fullPrompt = `${systemPrompt}\n\n${wrapUserData(contextData)}`;

    // 5. Generate
    const result = await callGemini(fullPrompt, { jsonMode: true, model: modelId, functionId: "exec-summary" }) as any;

    // 6. Cache
    const now = new Date().toISOString();
    const payload = { ...result, version: 1, generated_at: now };
    await supabase
        .from("survey_misc_cache")
        .upsert(
            { survey_id: parseInt(surveyId), cache_key: CACHE_KEY, data: payload, updated_at: now },
            { onConflict: "survey_id,cache_key" }
        );

    return NextResponse.json({ summary: payload, generated_at: now });
}
