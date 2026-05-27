import { handleAIError, getAgentSettings } from "@/lib/ai";
import { GoogleGenerativeAI } from "@google/generative-ai";
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

        // ── 1. Load faculty detail, executive report, and global cache in parallel ─
        const origin = req.nextUrl.origin;
        const [detailRes, cachedReportRes, globalCacheRes] = await Promise.all([
            fetch(`${origin}/api/executive/faculty-detail?facultyId=${facultyId}&surveyId=${surveyId}`),
            surveyId
                ? supabase.from("survey_misc_cache").select("data").eq("survey_id", parseInt(surveyId)).eq("cache_key", reportKey(facultyId, surveyId!)).maybeSingle()
                : Promise.resolve({ data: null }),
            surveyId
                ? supabase.from('surveys').select('ai_dataset_cache').eq('id', parseInt(surveyId, 10)).single()
                : Promise.resolve({ data: null }),
        ]);

        const detail           = detailRes.ok ? await detailRes.json() : null;
        const executiveReport  = (cachedReportRes as any).data?.data?.report ?? null;
        const globalCache      = (globalCacheRes as any)?.data?.ai_dataset_cache;

        const faculty          = detail?.faculty;
        const facultyName      = faculty?.name || "Unknown Faculty";
        const totalRespondents = detail?.totalRespondents ?? 0;
        const totalEnrolled    = detail?.totalEnrolled ?? 0;
        const responseRate     = detail?.responseRate ?? null;
        const programQuality   = detail?.programQuality;
        const campusExperience = detail?.campusExperience;

        // ── 2. Extract faculty-specific slices from global cache ──────────────────
        const allUnits             = globalCache?.units || [];
        const facSummaryAll        = globalCache?.faculties_summary || [];
        const npsByFacultyAll      = globalCache?.nps_summary?.per_faculty || [];
        const npsByUnitAll         = globalCache?.nps_summary?.per_unit || [];
        const programsSummaryAll   = globalCache?.programs_summary || [];
        const surveyContext        = globalCache?.survey_context || null;
        const topThemesPerUnit     = globalCache?.top_themes_per_unit || {};

        // This faculty's scores per unit vs institution average per unit
        const facUnitScores = facSummaryAll.filter((r: any) => r.faculty === facultyName);
        const facNpsScores  = npsByFacultyAll.filter((r: any) => r.faculty === facultyName);

        // Build institution-wide avg per unit for comparison
        const instAvgMap = new Map<number, number>();
        for (const u of allUnits) {
            if (u.score != null) instAvgMap.set(u.unit_id, u.score);
        }

        // Faculty comparison block: this faculty vs institution for each unit
        const facComparisonRows = facUnitScores
            .map((r: any) => {
                const inst = instAvgMap.get(r.unit_id);
                const unit = allUnits.find((u: any) => u.unit_id === r.unit_id);
                const unitLabel = unit?.unit_short_name || unit?.unit_name || `Unit ${r.unit_id}`;
                const diff = inst != null ? (r.avg_score - inst).toFixed(2) : null;
                const arrow = diff == null ? '' : Number(diff) > 0.05 ? ' ▲' : Number(diff) < -0.05 ? ' ▼' : ' ≈';
                return `  ${unitLabel}: ${r.avg_score ?? 'N/A'} (inst avg ${inst ?? 'N/A'}${diff != null ? `, Δ${diff}${arrow}` : ''}, n=${r.count})`;
            })
            .sort((a: string, b: string) => a.localeCompare(b));

        // Faculty NPS per unit
        const facNpsRows = facNpsScores.map((r: any) => {
            const unitNps = npsByUnitAll.find((u: any) => u.unit_id === r.unit_id);
            const unit = allUnits.find((u: any) => u.unit_id === r.unit_id);
            const unitLabel = unit?.unit_short_name || unit?.unit_name || `Unit ${r.unit_id}`;
            const instNps = unitNps?.nps_score;
            const diff = instNps != null ? r.nps_score - instNps : null;
            return `  ${unitLabel}: NPS ${r.nps_score > 0 ? '+' : ''}${r.nps_score} (inst ${instNps != null ? (instNps > 0 ? '+' : '') + instNps : 'N/A'}${diff != null ? `, Δ${diff > 0 ? '+' : ''}${diff}` : ''}) | ${r.promoters}P/${r.passives}Pa/${r.detractors}D`;
        });

        // Institution-wide demographics for context (how large is this faculty?)
        const demoByFaculty = surveyContext?.respondent_demographics?.by_faculty || {};
        const totalInst = Object.values(demoByFaculty).reduce((s: number, v: any) => s + v, 0) as number;
        const thisFacultyCount = demoByFaculty[facultyName] || 0;
        const facultyShare = totalInst > 0 ? ((thisFacultyCount / totalInst) * 100).toFixed(1) : null;

        // Top themes across units for this faculty's students — pull from global top themes
        // (top_themes_per_unit is per unit across all students; surface units most relevant to this faculty)
        const topUnitsForFaculty = facUnitScores
            .sort((a: any, b: any) => (a.avg_score ?? 99) - (b.avg_score ?? 99))
            .slice(0, 6)
            .map((r: any) => r.unit_id);

        const themesForFaculty = topUnitsForFaculty
            .map((uid: number) => {
                const unit = allUnits.find((u: any) => u.unit_id === uid);
                const unitLabel = unit?.unit_short_name || unit?.unit_name || `Unit ${uid}`;
                const entry = topThemesPerUnit[uid];
                if (!entry?.themes?.length) return null;
                const themeLines = entry.themes.slice(0, 3).map((t: any) => {
                    const lines = [`    • ${t.category}: ${t.total} segments (${t.positive_pct}% pos, ${Math.round(t.negative / t.total * 100)}% neg)`];
                    t.top_negative_quotes?.slice(0, 2).forEach((q: string) => lines.push(`      ✗ "${q}"`));
                    t.top_positive_quotes?.slice(0, 1).forEach((q: string) => lines.push(`      ✓ "${q}"`));
                    return lines.join('\n');
                }).join('\n');
                return `  Unit: ${unitLabel} (this faculty avg: ${facUnitScores.find((r2: any) => r2.unit_id === uid)?.avg_score ?? 'N/A'})\n${themeLines}`;
            })
            .filter(Boolean);

        // Programs from this faculty in programs_summary (top/bottom performers)
        const facultyPrograms = new Set(
            (programQuality?.studyPrograms || []).map((sp: any) => sp.study_program as string)
        );
        const programsInCache = programsSummaryAll
            .filter((r: any) => facultyPrograms.has(r.program))
            .sort((a: any, b: any) => (a.avg_score ?? 99) - (b.avg_score ?? 99));

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

        // ── 4. Build context blocks ───────────────────────────────────────────────
        const programsText = programQuality?.studyPrograms?.length > 0
            ? programQuality.studyPrograms.map((sp: any) => {
                const nps = sp.nps ? ` | NPS ${sp.nps.nps_score > 0 ? "+" : ""}${sp.nps.nps_score}` : "";
                const score = sp.avg_score !== null ? ` | SSI ${sp.avg_score}` : "";
                const sent = sp.sentiment?.total > 0 ? ` | ${sp.sentiment.positive_pct}% pos / ${sp.sentiment.negative_pct}% neg` : "";
                return `  • ${sp.study_program} (${sp.respondents} resp)${score}${nps}${sent}`;
            }).join("\n")
            : "  No study program breakdown available.";

        const unitsText = campusExperience?.units?.length > 0
            ? campusExperience.units.map((u: any) => {
                const score = u.avg_score !== null ? ` | SSI ${u.avg_score}` : "";
                const sent = u.sentiment?.total > 0 ? ` | ${u.sentiment.positive_pct}% pos / ${u.sentiment.negative_pct}% neg` : "";
                return `  • ${u.unit_name}${score}${sent}`;
            }).join("\n")
            : "  No campus unit data.";

        const facComparisonBlock = facComparisonRows.length > 0 ? `
━━ FACULTY vs INSTITUTION COMPARISON (per service unit) ━━
(▲ = above inst avg | ▼ = below | ≈ = within 0.05 pts — flags where "${facultyName}" students feel differently)
${facComparisonRows.join('\n')}` : '';

        const facNpsBlock = facNpsRows.length > 0 ? `
━━ NPS: THIS FACULTY vs INSTITUTION (per unit) ━━
${facNpsRows.join('\n')}` : '';

        const themesBlock = themesForFaculty.length > 0 ? `
━━ TOP COMPLAINT THEMES (lowest-rated units for this faculty — institution-wide segment data) ━━
${themesForFaculty.join('\n\n')}` : '';

        const programsCacheBlock = programsInCache.length > 0 ? `
━━ STUDY PROGRAMS IN CROSS-UNIT CONTEXT ━━
(avg Likert scores across campus units, filtered to ${facultyName}'s programs)
${programsInCache.slice(0, 20).map((r: any) => {
    const unit = allUnits.find((u: any) => u.unit_id === r.unit_id);
    return `  ${r.program} @ ${unit?.unit_short_name || unit?.unit_name || `Unit ${r.unit_id}`}: ${r.avg_score ?? 'N/A'} (n=${r.count})`;
}).join('\n')}` : '';

        const institutionContextBlock = surveyContext ? `
━━ INSTITUTION CONTEXT ━━
Survey: ${surveyContext.survey_name} | Total respondents: ${surveyContext.respondent_count?.toLocaleString() || '?'}
${facultyShare ? `"${facultyName}" share of survey: ${thisFacultyCount} respondents (${facultyShare}% of institution)` : ''}
Institution faculties: ${surveyContext.faculties?.length || '?'} | Programs: ${surveyContext.programs?.length || '?'} | Locations: ${surveyContext.locations?.length || '?'}` : '';

        const conversationHistory = (history || []).map(m => `${m.role === "user" ? "USER" : "AI"}: ${m.content}`).join("\n\n");

        // ── 5. System prompt ──────────────────────────────────────────────────────
        const systemPrompt = `You are an objective Data Intelligence Engine analyzing survey data for the "${facultyName}" faculty.
${faculty?.description ? `FACULTY CONTEXT: ${faculty.description}` : ""}
${institutionContextBlock}

━━ VALIDATED PERFORMANCE DATA ━━
(Sourced from the same data shown on the faculty insights page — cite these numbers exactly)
- Respondents: ${totalRespondents}${totalEnrolled > 0 ? ` / ${totalEnrolled} enrolled (${responseRate}% response rate)` : ""}
- Overall Program Quality SSI: ${programQuality?.overallScore ?? "N/A"}
- Overall Campus Experience SSI: ${campusExperience?.overallScore ?? "N/A"}
- Sentiment (Program): ${programQuality?.overallSentiment?.positive_pct ?? "?"}% positive / ${programQuality?.overallSentiment?.negative_pct ?? "?"}% negative
- Sentiment (Campus): ${campusExperience?.overallSentiment?.positive_pct ?? "?"}% positive / ${campusExperience?.overallSentiment?.negative_pct ?? "?"}% negative

━━ SCORE SCALES & THRESHOLDS ━━
- Likert SSI (1–4): ≥3.20 Strong | ≥3.00 Fair | <3.00 Needs Attention | <2.50 Critical
- NPS (−100 to +100): >0 healthy | >50 excellent | <0 urgent
- Never mix SSI (1–4) with NPS scales

━━ STUDY PROGRAMS ━━
${programsText}

━━ CAMPUS SERVICE UNITS ━━
${unitsText}
${facComparisonBlock}
${facNpsBlock}
${themesBlock}
${programsCacheBlock}

━━ STRATEGIC OVERVIEW (AI synthesis) ━━
${executiveReport
    ? `Summary: ${executiveReport.executive_summary}\nVerdict: ${executiveReport.overall_verdict}\nStrengths: ${executiveReport.strengths?.map((s: any) => s.title).join(", ")}\nConcerns: ${executiveReport.concerns?.map((c: any) => c.title).join(", ")}`
    : "No strategic synthesis generated yet."
}

━━ STUDENT FEEDBACK SAMPLES (verbatim, with unit) ━━
${segmentSamples.length > 0 ? JSON.stringify(segmentSamples.slice(0, 60)) : "No qualitative samples loaded."}

CONVERSATION HISTORY:
${conversationHistory}

USER: ${prompt}

━━ FORMATTING RULES ━━
1. OPENING: On the very first message (empty conversation history), open with a short impressive greeting — one confident sentence that signals you have this faculty's data loaded and you're ready to dig in. On all subsequent messages, skip the greeting and go straight to the insight.
1a. RESPONSE LENGTH & LANGUAGE: Read the conversation. Match your depth and length to what the question actually needs — a simple lookup deserves a short answer, a deep-dive deserves a full one. Respond in whatever language the user writes in.
2. Wrap every thematic finding in <box title="Title">content</box>.
3. When citing numbers, use the validated data above — never invent or recalculate.
4. For faculty vs institution comparisons: name the specific units where this faculty differs most (▲ or ▼).
5. For NPS comparisons: flag any units where this faculty's NPS is significantly below institution average.
6. Quote verbatim evidence from the segment sample to support claims.
7. Distinguish SSI Likert (1–4) from NPS (−100 to +100) — never blend scales.

Response:`;

        const finalPrompt = systemPrompt + (addendum ? `\n\n---\nOWNER INSTRUCTIONS:\n${addendum}` : "");
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) return NextResponse.json({ error: "GEMINI_API_KEY not configured." }, { status: 500 });

        const genAI = new GoogleGenerativeAI(apiKey);
        const geminiModel = genAI.getGenerativeModel({ model: modelId });
        const streamResult = await geminiModel.generateContentStream({
            contents: [{ role: "user", parts: [{ text: finalPrompt }] }],
        });

        const enc = new TextEncoder();
        const readable = new ReadableStream<Uint8Array>({
            async start(controller) {
                try {
                    for await (const chunk of streamResult.stream) {
                        const text = chunk.text();
                        controller.enqueue(enc.encode(`data: ${JSON.stringify({ text })}\n\n`));
                    }
                    controller.enqueue(enc.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
                } catch (e: any) {
                    controller.enqueue(enc.encode(`data: ${JSON.stringify({ error: e.message || 'Stream error' })}\n\n`));
                } finally {
                    controller.close();
                }
            }
        });

        return new Response(readable, {
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
            }
        });

    } catch (error) {
        return handleAIError(error);
    }
}
