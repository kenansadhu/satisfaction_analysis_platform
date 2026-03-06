import { callGemini, handleAIError } from "@/lib/ai";
import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const maxDuration = 60;

interface ChatMessage {
    role: "user" | "assistant";
    content: string;
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { unitId, surveyId, history, prompt } = body as {
            unitId: string;
            surveyId?: string;
            history: ChatMessage[];
            prompt: string;
        };

        if (!unitId || !prompt) {
            return NextResponse.json({ error: "Missing unitId or prompt" }, { status: 400 });
        }

        // --- STATE-AWARE DATA FETCHING (PRECISE ISOLATION) ---
        const execReportType = surveyId ? `executive_${surveyId}` : 'executive';
        const [unitRes, respRes, reportRes] = await Promise.all([
            supabase.from('organization_units').select('name, description').eq('id', unitId).single(),
            supabase.from('respondents').select('id', { count: 'exact', head: true }).eq('survey_id', surveyId),
            supabase.from('unit_ai_reports').select('content').eq('unit_id', unitId).eq('report_type', execReportType).maybeSingle()
        ]);

        const unitName = unitRes.data?.name || "Unknown Unit";
        const unitDescription = unitRes.data?.description || "";
        const totalSurveyPopulation = respRes.count || 0;
        const executiveReport = reportRes.data?.content?.report;

        // FETCH SURVEY CONTEXT (ISOLATION)
        const { data: surveyResps } = await supabase.from('respondents').select('id').eq('survey_id', surveyId);
        const surveyRespIds = (surveyResps || []).map(r => r.id);

        // FETCH RAW DATA (QUAL + QUANT)
        const { data: rawInputs } = await supabase
            .from('raw_feedback_inputs')
            .select('id, raw_text, source_column, respondent_id, numerical_score, is_quantitative')
            .eq('target_unit_id', unitId)
            .in('respondent_id', surveyRespIds);

        const inputIds = (rawInputs || []).map(ri => ri.id);

        // FETCH ANALYZED SEGMENTS
        const [segmentsRes, categoriesRes] = await Promise.all([
            supabase.from('feedback_segments').select('segment_text, sentiment, category_id, raw_input_id, is_suggestion').in('raw_input_id', inputIds).limit(200),
            supabase.from('analysis_categories').select('id, name').eq('unit_id', unitId)
        ]);

        const catMap = new Map(((categoriesRes.data as any[]) || []).map(c => [c.id, c.name]));
        let segmentsView = ((segmentsRes.data as any[]) || []).map(s => ({
            segment_text: s.segment_text,
            sentiment: s.sentiment,
            category_name: catMap.get(s.category_id) || "General",
            is_suggestion: s.is_suggestion
        }));

        // FALLBACK: If no analyzed segments, get raw qualitative feedback (verbatim)
        if (segmentsView.length === 0) {
            segmentsView = (rawInputs || []).filter(ri => !ri.is_quantitative && ri.raw_text && ri.raw_text.length > 5).map(f => ({
                segment_text: f.raw_text as string,
                sentiment: "Neutral",
                category_name: f.source_column,
                is_suggestion: false
            })).slice(0, 100);
        }

        const sentimentCounts = segmentsView.reduce((acc: any, s) => {
            acc[s.sentiment] = (acc[s.sentiment] || 0) + 1;
            return acc;
        }, { Positive: 0, Negative: 0, Neutral: 0 });

        // CALCULATE QUANT STATS PRECISELY
        const quantStats = (rawInputs || []).filter(ri => ri.is_quantitative && ri.numerical_score !== null).reduce((acc: any, q) => {
            if (!acc[q.source_column]) acc[q.source_column] = { sum: 0, count: 0, max: 0 };
            acc[q.source_column].sum += q.numerical_score as number;
            acc[q.source_column].count++;
            if (q.numerical_score as number > acc[q.source_column].max) acc[q.source_column].max = q.numerical_score as number;
            return acc;
        }, {} as Record<string, { sum: number, count: number, max: number }>);

        const quantPrompt = Object.entries(quantStats).map(([col, data]: [string, any]) => {
            const avg = (data.sum / data.count).toFixed(2);
            const scaleType = data.max <= 1 ? "Binary/Percentage (0-1)" : "Likert Scale (1-4)";
            return `• ${col}: ${avg} avg (${data.count} responses) [Scale: ${scaleType}]`;
        }).join('\n');

        const unitUniqueResps = new Set((rawInputs || []).map(ri => ri.respondent_id));
        const unitRespondentCount = unitUniqueResps.size;

        const conversationHistory = (history || []).map(m =>
            `${m.role === 'user' ? 'USER' : 'AI'}: ${m.content}`
        ).join('\n\n');

        const systemPrompt = `You are a Senior Strategic AI Analyst for the unit "${unitName}".
CONTEXT: ${unitDescription}

=== DATA STATE (HIGH PRECISION - STRICTLY ISOLATED TO THIS SURVEY) ===
- POPULATION CONTEXT: Out of ${totalSurveyPopulation} total respondents, ${unitRespondentCount || 0} interacted with this unit (${((unitRespondentCount || 0) / (totalSurveyPopulation || 1) * 100).toFixed(1)}%).
- Qualitative Sentiment Sample: ${sentimentCounts.Positive} Positive, ${sentimentCounts.Negative} Negative, ${sentimentCounts.Neutral} Neutral.
- Quantitative Metrics:
${quantPrompt || "No quantitative scores available."}

SCALE INTERPRETATION RULES:
- "Likert Scale (1-4)": Critical < 2.0 | Average ~2.5 | Excellent > 3.5
- "Binary/Percentage (0-1)": 0.0 is 0% (low reach/utilization), 1.0 is 100% (full reach).

=== STRATEGIC OVERVIEW (EXECUTIVE REPORT) ===
${executiveReport ? `Summary: ${executiveReport.executive_summary}
Verdict: ${executiveReport.overall_verdict}
Top Strengths: ${executiveReport.strengths?.map((s: any) => s.title).join(', ')}
Top Concerns: ${executiveReport.concerns?.map((c: any) => c.title).join(', ')}` : "No strategic overview generated yet."}

=== REPRESENTATIVE STUDENT VOICES (VERBATIM SAMPLES) ===
${JSON.stringify(segmentsView.slice(0, 80))}

CONVERSATION HISTORY:
${conversationHistory}

USER: ${prompt}

RESPONSE GUIDELINES (CRITICAL):
1. **STRUCTURED BOXES (MANDATORY)**: Wrap every major finding, explanation, or thematic deep-dive inside a <box title="Section Title">...</box> tag.
    - Start with a natural introduction or overview outside of any box.
    - Each distinct point (e.g., "Digital Platform Limits", "Reach Issues") must have its own box.
    - Inside the box, provide a clear explanation followed by supporting data and representative student quotes (evidence).
    - Finish with a summary conclusion or next steps outside of any box.
2. **NICELY STRUCTURED OUTPUT**: Use Markdown (headers, bullet points, bolding) within the boxes for maximum readability.
3. **SCALE AWARENESS**: Clearly distinguish between 1-4 Likert scales and 0-1 metrics (percentages).
4. **DATA-FIRST**: Cite specific metrics and voices from the PROVIDED STATE.
5. **LANGUAGE**: Respond in the same language as the user's question.

Response as AI Analyst:`;

        const reply = await callGemini(systemPrompt, { jsonMode: false }) as string;

        return NextResponse.json({ reply });

    } catch (error) {
        return handleAIError(error);
    }
}
