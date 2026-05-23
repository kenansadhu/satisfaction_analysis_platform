import { callGemini, handleAIError, getAgentSettings } from "@/lib/ai";
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer as supabase } from "@/lib/supabase-server";

export const maxDuration = 60;

interface ChatMessage { role: "user" | "assistant"; content: string; }

const reportKey = (facultyId: string, surveyId: string) => `faculty_ai_report_${facultyId}_${surveyId}`;

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { facultyId, surveyId, history, prompt } = body as {
            facultyId: string; surveyId?: string; history: ChatMessage[]; prompt: string;
        };

        if (!facultyId || !prompt) return NextResponse.json({ error: "Missing facultyId or prompt" }, { status: 400 });

        const { modelId, addendum } = await getAgentSettings("chat-unit");

        // ── 1. Load validated faculty data (from faculty-detail cache) ────────────
        const origin = req.nextUrl.origin;
        const detailRes = await fetch(`${origin}/api/executive/faculty-detail?facultyId=${facultyId}&surveyId=${surveyId}`);
        const detail = detailRes.ok ? await detailRes.json() : null;

        const faculty = detail?.faculty;
        const facultyName = faculty?.name || "Unknown Faculty";
        const totalRespondents = detail?.totalRespondents ?? 0;
        const totalEnrolled = detail?.totalEnrolled ?? 0;
        const responseRate = detail?.responseRate ?? null;
        const programQuality = detail?.programQuality;
        const campusExperience = detail?.campusExperience;

        // ── 2. Load cached executive report for strategic context ────────────────
        const cachedReportRes = surveyId
            ? await supabase.from("survey_misc_cache").select("data").eq("survey_id", parseInt(surveyId)).eq("cache_key", reportKey(facultyId, surveyId!)).maybeSingle()
            : { data: null };
        const executiveReport = (cachedReportRes as any).data?.data?.report ?? null;

        // ── 3. Fetch a small segment sample for qualitative context ───────────────
        let segmentSamples: { text: string; sentiment: string; unit: string }[] = [];
        if (surveyId) {
            const { data: respRows } = await supabase
                .from("respondents").select("id").eq("survey_id", parseInt(surveyId)).eq("faculty_id", parseInt(facultyId)).limit(80);
            const respIds = (respRows || []).map((r: any) => r.id);

            if (respIds.length > 0) {
                const { data: inputs } = await supabase
                    .from("raw_feedback_inputs").select("id, target_unit_id")
                    .in("respondent_id", respIds).eq("is_quantitative", false).limit(200);

                if (inputs && inputs.length > 0) {
                    const inputIds = (inputs as any[]).map(i => i.id);
                    const inputUnitMap = new Map((inputs as any[]).map(i => [i.id, i.target_unit_id]));
                    const { data: units } = await supabase.from("organization_units").select("id, name, short_name");
                    const unitMap = new Map(((units || []) as any[]).map(u => [u.id, u.short_name || u.name]));
                    const { data: segs } = await supabase
                        .from("feedback_segments").select("raw_input_id, segment_text, sentiment")
                        .in("raw_input_id", inputIds).limit(100);
                    segmentSamples = ((segs || []) as any[]).map(s => ({
                        text: s.segment_text, sentiment: s.sentiment,
                        unit: unitMap.get(inputUnitMap.get(s.raw_input_id)) || "Unknown",
                    }));
                }
            }
        }

        // ── 4. Build context summary from validated data ──────────────────────────
        const programsText = programQuality?.studyPrograms?.length > 0
            ? programQuality.studyPrograms.map((sp: any) => {
                const nps = sp.nps ? ` | NPS ${sp.nps.nps_score > 0 ? "+" : ""}${sp.nps.nps_score}` : "";
                const score = sp.avg_score !== null ? ` | SSI ${sp.avg_score}` : "";
                const sent = sp.sentiment?.total > 0 ? ` | ${sp.sentiment.positive_pct}% pos / ${sp.sentiment.negative_pct}% neg` : "";
                return `• ${sp.study_program} (${sp.respondents} resp)${score}${nps}${sent}`;
            }).join("\n")
            : "No study program breakdown available.";

        const unitsText = campusExperience?.units?.length > 0
            ? campusExperience.units.map((u: any) => {
                const score = u.avg_score !== null ? ` | SSI ${u.avg_score}` : "";
                const sent = u.sentiment?.total > 0 ? ` | ${u.sentiment.positive_pct}% pos / ${u.sentiment.negative_pct}% neg` : "";
                return `• ${u.unit_name}${score}${sent}`;
            }).join("\n")
            : "No campus unit data.";

        const conversationHistory = (history || []).map(m => `${m.role === "user" ? "USER" : "AI"}: ${m.content}`).join("\n\n");

        const systemPrompt = `You are an objective Data Intelligence Engine analyzing survey data for the "${facultyName}" faculty.
${faculty?.description ? `\nFACULTY CONTEXT: ${faculty.description}` : ""}

=== VALIDATED PERFORMANCE DATA (these numbers are correct — sourced from the same data shown on the faculty insights page) ===
- Respondents: ${totalRespondents}${totalEnrolled > 0 ? ` / ${totalEnrolled} enrolled (${responseRate}% response rate)` : ""}
- Overall Program Quality SSI: ${programQuality?.overallScore ?? "N/A"}
- Overall Campus Experience SSI: ${campusExperience?.overallScore ?? "N/A"}
- Sentiment (Program): ${programQuality?.overallSentiment?.positive_pct ?? "?"}% positive / ${programQuality?.overallSentiment?.negative_pct ?? "?"}% negative
- Sentiment (Campus): ${campusExperience?.overallSentiment?.positive_pct ?? "?"}% positive / ${campusExperience?.overallSentiment?.negative_pct ?? "?"}% negative

STUDY PROGRAMS:
${programsText}

CAMPUS SERVICE UNITS:
${unitsText}

SSI SCALE: < 3.00 = needs improvement | 3.00–3.19 = adequate | ≥ 3.20 = good (target)

=== STRATEGIC OVERVIEW (from AI synthesis, if generated) ===
${executiveReport
    ? `Summary: ${executiveReport.executive_summary}\nVerdict: ${executiveReport.overall_verdict}\nStrengths: ${executiveReport.strengths?.map((s: any) => s.title).join(", ")}\nConcerns: ${executiveReport.concerns?.map((c: any) => c.title).join(", ")}`
    : "No strategic synthesis generated yet."
}

=== STUDENT FEEDBACK SAMPLES (verbatim, with unit) ===
${segmentSamples.length > 0 ? JSON.stringify(segmentSamples.slice(0, 60)) : "No qualitative samples loaded."}

CONVERSATION HISTORY:
${conversationHistory}

USER: ${prompt}

FORMATTING RULES:
1. No filler or roleplay preambles — direct professional insights only.
2. Wrap every thematic finding in a \`<box title="Your Title">\` XML tag.
3. When citing numbers, use the validated data above — never invent or recalculate.
4. SSI scale is 1–4 Likert. Never mix SSI with NPS scores.
5. Reference verbatim quotes when supporting a claim.

Response:`;

        const reply = await callGemini(
            systemPrompt + (addendum ? `\n\n---\nOWNER INSTRUCTIONS:\n${addendum}` : ""),
            { jsonMode: false, model: modelId, functionId: "chat-unit" }
        ) as string;

        return NextResponse.json({ reply });

    } catch (error) {
        return handleAIError(error);
    }
}
