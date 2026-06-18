import { callGemini, handleAIError, getAgentSettings } from "@/lib/ai";
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer as supabase } from "@/lib/supabase-server";

export const maxDuration = 120;

const reportKey = (facultyId: string, surveyId: string) => `faculty_ai_report_${facultyId}_${surveyId}`;

export async function POST(req: NextRequest) {
    try {
        const { facultyId, surveyId, customInstructions } = await req.json();
        if (!facultyId || !surveyId) return NextResponse.json({ error: "facultyId and surveyId required" }, { status: 400 });

        const { modelId, addendum } = await getAgentSettings("generate-report");

        // ── 1. Load validated faculty data (correct SSI via macro averages + segments) ──
        const origin = req.nextUrl.origin;
        const detailRes = await fetch(`${origin}/api/executive/faculty-detail?facultyId=${facultyId}&surveyId=${surveyId}`);
        if (!detailRes.ok) return NextResponse.json({ error: "Failed to load faculty data" }, { status: 500 });
        const detail = await detailRes.json();

        if (detail.error) return NextResponse.json({ error: detail.error }, { status: 400 });
        if (detail.totalRespondents === 0) return NextResponse.json({ error: "No respondents found for this faculty." }, { status: 400 });

        const { faculty, totalRespondents, totalEnrolled, responseRate, programQuality, campusExperience } = detail;

        // ── 2. Fetch sample qualitative segments for evidence quotes ─────────────
        const { data: respRows } = await supabase
            .from("respondents").select("id").eq("survey_id", parseInt(surveyId)).eq("faculty_id", parseInt(facultyId)).limit(300);
        const respIds = (respRows || []).map((r: any) => r.id);

        let segmentSamples: { text: string; sentiment: string; unit: string }[] = [];

        if (respIds.length > 0) {
            // Fetch inputs for up to 100 respondents to keep the query fast
            const sampleRespIds = respIds.slice(0, 100);
            const { data: inputs } = await supabase
                .from("raw_feedback_inputs").select("id, target_unit_id")
                .in("respondent_id", sampleRespIds).eq("is_quantitative", false);

            if (inputs && inputs.length > 0) {
                const inputIds = inputs.map((i: any) => i.id).slice(0, 400);
                const inputUnitMap = new Map((inputs as any[]).map(i => [i.id, i.target_unit_id]));

                const { data: units } = await supabase.from("organization_units").select("id, name, short_name");
                const unitMap = new Map(((units || []) as any[]).map(u => [u.id, u.short_name || u.name]));

                const { data: segs } = await supabase
                    .from("feedback_segments").select("raw_input_id, segment_text, sentiment")
                    .in("raw_input_id", inputIds).limit(150);

                segmentSamples = ((segs || []) as any[]).map(s => ({
                    text: s.segment_text,
                    sentiment: s.sentiment,
                    unit: unitMap.get(inputUnitMap.get(s.raw_input_id)) || "Unknown",
                }));
            }
        }

        // ── 3. Build prompt using validated numbers ───────────────────────────────
        const programsText = (programQuality.studyPrograms || [])
            .map((sp: any) => {
                const npsStr = sp.nps ? ` | NPS: ${sp.nps.nps_score > 0 ? "+" : ""}${sp.nps.nps_score} (n=${sp.nps.total})` : "";
                const scoreStr = sp.avg_score !== null ? ` | SSI: ${sp.avg_score}` : "";
                const sentStr = sp.sentiment?.total > 0
                    ? ` | Sentiment: ${sp.sentiment.positive_pct}% pos / ${sp.sentiment.negative_pct}% neg (n=${sp.sentiment.total})`
                    : "";
                const rateStr = sp.response_rate !== null ? ` | Response rate: ${sp.response_rate}%` : "";
                return `• ${sp.study_program} (${sp.respondents} respondents)${scoreStr}${npsStr}${sentStr}${rateStr}`;
            }).join("\n") || "No study program data.";

        const campusUnitsText = (campusExperience.units || [])
            .map((u: any) => {
                const scoreStr = u.avg_score !== null ? ` | SSI: ${u.avg_score}` : "";
                const sentStr = u.sentiment?.total > 0
                    ? ` | Sentiment: ${u.sentiment.positive_pct}% pos / ${u.sentiment.negative_pct}% neg (n=${u.sentiment.total})`
                    : "";
                return `• ${u.unit_name}${scoreStr}${sentStr}`;
            }).join("\n") || "No campus unit data.";

        const overallProgScore = programQuality.overallScore;
        const overallCampusScore = campusExperience.overallScore;

        const facultyNameLower = faculty.name.toLowerCase();
        // Only undergraduate Pendidikan and Keperawatan faculties have dorm residents.
        // Pascasarjana (graduate) students do not live in the asrama.
        const isResidenceFaculty = (
            (facultyNameLower.includes("keperawatan") || facultyNameLower.includes("nursing")) ||
            (facultyNameLower.includes("pendidikan") && !facultyNameLower.includes("pascasarjana"))
        );
        const residenceInstruction = isResidenceFaculty
            ? `\n- UPH RESIDENCE (ASRAMA): This faculty has students living in the UPH residence/asrama. You MAY include residence-related feedback and its impact on student experience when relevant data is present.`
            : `\n- UPH RESIDENCE (ASRAMA): Do NOT mention or discuss the UPH residence/asrama in this report — it is not relevant for this faculty.`;

        const prompt = `You are an objective Data Intelligence Engine writing an Executive Analysis Report for the "${faculty.name}" faculty.
${faculty.description ? `\nFACULTY CONTEXT: ${faculty.description}` : ""}

=== VALIDATED PERFORMANCE DATA (use these exact numbers — do not invent or recalculate) ===

OVERVIEW:
- Faculty respondents: ${totalRespondents}${totalEnrolled > 0 ? ` out of ${totalEnrolled} enrolled (${responseRate}% response rate)` : ""}
- Overall Program Quality SSI: ${overallProgScore ?? "N/A"} (1–4 Likert scale; target ≥ 3.20)
- Overall Campus Experience SSI: ${overallCampusScore ?? "N/A"}

STUDY PROGRAMS (SSI scores are macro per-respondent averages — correct and validated):
${programsText}

CAMPUS SERVICE UNITS (as rated by this faculty's students):
${campusUnitsText}

SSI SCALE REFERENCE: < 3.00 = needs improvement (red) | 3.00–3.19 = adequate (amber) | ≥ 3.20 = good (green)
${residenceInstruction}

=== QUALITATIVE EVIDENCE SAMPLES (verbatim, with unit) ===
${segmentSamples.length > 0 ? JSON.stringify(segmentSamples.slice(0, 40).map(s => ({ ...s, text: s.text.slice(0, 150) }))) : "No qualitative samples available."}

YOUR TASK: Write a boardroom-quality JSON executive analysis report.

{
  "executive_summary": "3–4 sentence narrative covering academic program quality, campus service satisfaction, and student voice patterns.",
  "overall_verdict": "Excellent | Good | Needs Improvement | Critical",
  "strengths": [
    { "title": "...", "detail": "Cite specific units/programs and their validated scores.", "evidence": "Verbatim student quote" }
  ],
  "concerns": [
    { "title": "...", "detail": "Cite specific units/programs and their validated scores.", "severity": "High|Medium|Low", "evidence": "Verbatim student quote" }
  ],
  "recommendations": [
    { "title": "...", "action": "...", "impact": "...", "priority": "Immediate|Short-term|Long-term" }
  ],
  "closing_statement": "..."
}

RESPOND WITH ONLY THE JSON OBJECT — no markdown, no code fences, no commentary before or after. Start your response with { and end with }. Exactly 3 items per list. If data is too sparse, use {"title":"Limited Data","detail":"Insufficient feedback to identify a third distinct point.","evidence":"N/A"} as filler. Keep executive_summary under 120 words, each detail/action under 80 words.`;

        const finalPrompt = prompt
            + (customInstructions ? `\n\n---\nANALYST CONTEXT:\n${customInstructions}` : "")
            + (addendum ? `\n\n---\nOWNER INSTRUCTIONS:\n${addendum}` : "");

        let parsed: any;
        let retries = 0;
        while (retries <= 2) {
            const raw = await callGemini(finalPrompt, { jsonMode: true, jsonMime: false, model: modelId, maxOutputTokens: 16384, thinkingBudget: 8192, functionId: retries === 0 ? "generate-report" : undefined });
            try {
                parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
                if (parsed?.executive_summary) break;
                throw new Error("Missing required fields");
            } catch {
                retries++;
                if (retries > 2) return NextResponse.json({ error: "AI returned invalid JSON after multiple attempts" }, { status: 500 });
            }
        }

        // ── 4. Save to cache server-side ─────────────────────────────────────────
        const now = new Date().toISOString();
        await supabase.from("survey_misc_cache").upsert(
            { survey_id: parseInt(surveyId), cache_key: reportKey(facultyId, surveyId), data: { report: parsed }, updated_at: now },
            { onConflict: "survey_id,cache_key" }
        );

        return NextResponse.json({ report: parsed, generatedAt: now });

    } catch (error) {
        return handleAIError(error);
    }
}
