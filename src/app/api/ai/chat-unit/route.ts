import { callGemini, handleAIError, wrapUserData } from "@/lib/ai";
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

        // 1. Load unit info + categories
        const [unitRes, catRes] = await Promise.all([
            supabase.from('organization_units').select('name, description').eq('id', unitId).single(),
            supabase.from('analysis_categories').select('id, name, description, keywords').eq('unit_id', unitId),
        ]);

        const unitName = unitRes.data?.name || "Unknown Unit";
        const unitDescription = unitRes.data?.description || "";
        const categories = catRes.data || [];

        // 2. Fetch respondent IDs for survey scope
        let respIds: number[] = [];
        if (surveyId) {
            let rPage = 0;
            while (true) {
                const { data: rBat } = await supabase.from('respondents')
                    .select('id').eq('survey_id', surveyId)
                    .range(rPage * 1000, (rPage + 1) * 1000 - 1);
                if (!rBat || rBat.length === 0) break;
                respIds.push(...rBat.map((r: any) => r.id));
                if (rBat.length < 1000) break;
                rPage++;
            }
        }

        // 3. Fetch segments with category names (chunked by respondent)
        const CHUNK = 50;
        let allSegments: any[] = [];

        if (respIds.length > 0) {
            for (let i = 0; i < respIds.length; i += CHUNK) {
                const chunk = respIds.slice(i, i + CHUNK);
                const { data } = await supabase.from('raw_feedback_inputs')
                    .select('id, feedback_segments (id, segment_text, sentiment, category_id, is_suggestion)')
                    .eq('target_unit_id', unitId)
                    .eq('is_quantitative', false)
                    .eq('requires_analysis', false)
                    .in('respondent_id', chunk);
                if (data) {
                    data.forEach((r: any) => {
                        r.feedback_segments?.forEach((s: any) => allSegments.push(s));
                    });
                }
            }
        }

        // 4. Build category map and aggregate stats
        const catMap = new Map(categories.map(c => [c.id, c.name]));
        let sentimentCounts = { Positive: 0, Negative: 0, Neutral: 0 };
        const categoryCounts: Record<string, { positive: number; negative: number; neutral: number; total: number }> = {};

        allSegments.forEach(s => {
            const catName = catMap.get(s.category_id) || "Uncategorized";
            if (catName === "Uncategorized") return;

            sentimentCounts[s.sentiment as keyof typeof sentimentCounts] += 1;

            if (!categoryCounts[catName]) categoryCounts[catName] = { positive: 0, negative: 0, neutral: 0, total: 0 };
            categoryCounts[catName][s.sentiment.toLowerCase() as "positive" | "negative" | "neutral"] += 1;
            categoryCounts[catName].total += 1;
        });

        const totalSegments = sentimentCounts.Positive + sentimentCounts.Negative + sentimentCounts.Neutral;
        const sentimentScore = totalSegments > 0
            ? Math.round((sentimentCounts.Positive * 100 + sentimentCounts.Neutral * 50) / totalSegments)
            : 0;

        // 5. Get verified count
        const { count: verifiedCount } = await supabase.from('feedback_segments')
            .select('*', { count: 'exact', head: true })
            .eq('is_verified', true)
            .in('raw_input_id', allSegments.map(s => s.id).slice(0, 1000)); // approximation

        // 6. Fetch quantitative summary
        let quantSummary = "No quantitative data.";
        if (respIds.length > 0) {
            let scores: any[] = [];
            for (let i = 0; i < respIds.length; i += CHUNK) {
                const chunk = respIds.slice(i, i + CHUNK);
                const { data } = await supabase.from('raw_feedback_inputs')
                    .select('source_column, numerical_score')
                    .eq('target_unit_id', unitId)
                    .eq('is_quantitative', true)
                    .not('numerical_score', 'is', null)
                    .in('respondent_id', chunk);
                if (data) scores.push(...data);
            }

            if (scores.length > 0) {
                const grouped: Record<string, { sum: number; count: number }> = {};
                scores.forEach(s => {
                    if (!grouped[s.source_column]) grouped[s.source_column] = { sum: 0, count: 0 };
                    grouped[s.source_column].sum += s.numerical_score;
                    grouped[s.source_column].count += 1;
                });
                quantSummary = Object.entries(grouped).map(([q, v]) =>
                    `${q}: ${(v.sum / v.count).toFixed(2)} avg (${v.count} responses)`
                ).join('\n');
            }
        }

        // 7. Get saved executive report if exists
        const { data: savedReport } = await supabase.from('unit_ai_reports')
            .select('content').eq('unit_id', unitId).eq('report_type', 'executive').maybeSingle();
        const executiveReport = savedReport?.content?.report;

        // 8. Sample representative comments (top 80)
        const sampleComments = allSegments
            .filter(s => s.segment_text && s.segment_text.length > 15)
            .slice(0, 80)
            .map(s => ({
                text: s.segment_text,
                sentiment: s.sentiment,
                category: catMap.get(s.category_id) || "Uncategorized",
                is_suggestion: s.is_suggestion
            }));

        // 9. Build conversation history
        const conversationLines = (history || []).map((m: ChatMessage) =>
            `${m.role === "user" ? "USER" : "ASSISTANT"}: ${m.content}`
        ).join("\n\n");

        // 10. Build system prompt with ALL unit data
        const systemPrompt = `
You are a senior data analyst assistant for "${unitName}" at a university.
Unit Description: ${unitDescription || "No description available."}

You have access to ALL analyzed feedback data for this unit. Answer the user's questions with specific data, numbers, and evidence.

=== QUALITATIVE DATA SUMMARY ===
Total Analyzed Segments: ${totalSegments}
Sentiment Index: ${sentimentScore}/100
Positive: ${sentimentCounts.Positive} | Neutral: ${sentimentCounts.Neutral} | Negative: ${sentimentCounts.Negative}

=== CATEGORY BREAKDOWN ===
${Object.entries(categoryCounts).map(([name, c]) =>
            `• ${name}: ${c.total} total (${c.positive} positive, ${c.negative} negative, ${c.neutral} neutral)`
        ).join('\n')}

=== CATEGORIES DEFINED ===
${categories.map(c => `• ${c.name}: ${c.description || 'No description'} | Keywords: ${(c.keywords || []).join(', ')}`).join('\n')}

=== QUANTITATIVE SCORES ===
${quantSummary}

=== SAMPLE COMMENTS (${sampleComments.length} of ${totalSegments}) ===
${wrapUserData(sampleComments)}

${executiveReport ? `
=== EXECUTIVE REPORT (AI-Generated) ===
Summary: ${executiveReport.executive_summary || 'N/A'}
Verdict: ${executiveReport.overall_verdict || 'N/A'}
Strengths: ${executiveReport.strengths?.map((s: any) => s.title).join(', ') || 'N/A'}
Concerns: ${executiveReport.concerns?.map((c: any) => `${c.title} (${c.severity})`).join(', ') || 'N/A'}
` : ''}

CONVERSATION SO FAR:
${conversationLines}

USER: ${prompt}

INSTRUCTIONS:
- Respond helpfully, citing specific numbers and categories from the data above
- If the user asks about specific categories, reference the category breakdown
- If asked about trends or patterns, analyze the sentiment distribution
- If asked about quantitative metrics, reference the scores above
- Use markdown formatting for readability
- Be concise but thorough
- Always ground your answers in the actual data — never make up statistics
- Respond in the same language as the user's question (if Indonesian, reply in Indonesian)

Respond as the ASSISTANT:`;

        const reply = await callGemini(systemPrompt, {
            jsonMode: false,
        }) as string;

        return NextResponse.json({ reply });

    } catch (error) {
        return handleAIError(error);
    }
}
