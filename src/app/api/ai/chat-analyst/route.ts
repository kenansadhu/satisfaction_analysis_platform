import { callGemini, handleAIError, wrapUserData } from "@/lib/ai";
import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const maxDuration = 60;

interface ChatMessage {
    role: "user" | "assistant";
    content: string;
    chart?: any;
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { messages, surveyId, existingChart } = body as {
            messages: ChatMessage[];
            surveyId?: string;
            existingChart?: any; // When refining a saved chart
        };

        if (!messages || messages.length === 0) {
            return NextResponse.json({ error: "No messages provided" }, { status: 400 });
        }

        // 1. Build the live dataset (same as generate-dashboard)
        const { data: unitsData } = await supabase
            .from('organization_units')
            .select('id, name, short_name, description');

        if (!unitsData) throw new Error("Failed to load units.");

        const globalDataset: any[] = [];
        const availableKeys = new Set<string>([
            'unit_name', 'unit_short_name', 'total_segments',
            'positive', 'neutral', 'negative', 'score'
        ]);

        for (const unit of unitsData) {
            const { data: metrics, error: rpcErr } = await supabase.rpc('get_dashboard_metrics', {
                p_unit_id: unit.id,
                p_survey_id: surveyId ? parseInt(surveyId, 10) : null
            });

            if (rpcErr) {
                console.warn(`[chat-analyst] RPC error for unit ${unit.name}:`, rpcErr.message);
                continue;
            }

            if (metrics) {
                const m = metrics as any;
                // Log first unit's raw shape for debugging
                if (globalDataset.length === 0) {
                    console.log(`[chat-analyst] Raw RPC keys for ${unit.name}:`, Object.keys(m));
                }

                const totalSegments = m.total_segments ?? m.total ?? 0;
                if (totalSegments <= 0) continue;

                // Handle different possible field names from the RPC
                const pos = m.positive ?? m.positive_count ?? m.sentiment_positive ?? 0;
                const neg = m.negative ?? m.negative_count ?? m.sentiment_negative ?? 0;
                const neu = m.neutral ?? m.neutral_count ?? m.sentiment_neutral ?? 0;
                const scoreVal = m.score ?? m.sentiment_score ?? 0;

                const categories = m.category_counts || [];
                const flatCategories: any = {};
                let categoryPosSum = 0;
                let categoryNegSum = 0;

                if (Array.isArray(categories)) {
                    categories.forEach((c: any) => {
                        const name = c.category_name;
                        if (name) {
                            const cleanKey = `category_${name.replace(/[^a-zA-Z0-9]/g, '_')}`;
                            flatCategories[cleanKey] = c.total || 0;
                            flatCategories[`${cleanKey}_pos`] = c.positive_count || 0;
                            flatCategories[`${cleanKey}_neg`] = c.negative_count || 0;
                            categoryPosSum += c.positive_count || 0;
                            categoryNegSum += c.negative_count || 0;

                            availableKeys.add(cleanKey);
                            availableKeys.add(`${cleanKey}_pos`);
                            availableKeys.add(`${cleanKey}_neg`);
                        }
                    });
                }

                // Use category sums as fallback when top-level counts are 0
                const finalPos = pos > 0 ? pos : categoryPosSum;
                const finalNeg = neg > 0 ? neg : categoryNegSum;
                const finalNeu = neu > 0 ? neu : Math.max(0, totalSegments - finalPos - finalNeg);

                globalDataset.push({
                    unit_id: unit.id,
                    unit_name: unit.name,
                    unit_short_name: unit.short_name || unit.name,
                    unit_description: unit.description || "No context.",
                    total_segments: totalSegments,
                    positive: finalPos,
                    neutral: finalNeu,
                    negative: finalNeg,
                    score: scoreVal,
                    ...flatCategories
                });
            }
        }

        console.log(`[chat-analyst] Dataset built: ${globalDataset.length} units. Sample keys:`, globalDataset.length > 0 ? Object.keys(globalDataset[0]) : 'empty');
        console.log(`[chat-analyst] Sample entry:`, globalDataset.length > 0 ? JSON.stringify(globalDataset[0]).slice(0, 300) : 'none');

        // Also fetch quantitative averages 
        const quantData = await fetchQuantSummary(surveyId);

        // 2. Build conversation history for Gemini
        const conversationHistory = messages.map(m => {
            if (m.role === "user") return `USER: ${m.content}`;
            if (m.chart) {
                return `ASSISTANT: ${m.content}\n[CHART_CONFIG: ${JSON.stringify(m.chart)}]`;
            }
            return `ASSISTANT: ${m.content}`;
        }).join("\n\n");

        // 3. Build the system prompt
        const systemPrompt = `
ACT AS A SENIOR DATA SCIENTIST powered by Gemini Pro, analyzing Student Satisfaction Survey data for a university.

YOU ARE IN A CONVERSATIONAL SESSION. The user will ask questions, request charts, and you will respond with insights and visualizations.

CAPABILITIES:
1. ANALYZE data and provide text insights
2. GENERATE chart blueprints (the frontend renders them live)
3. MODIFY existing charts based on user feedback
4. EXPLAIN correlations and patterns

DATASET CONTEXT:
- ${globalDataset.length} units analyzed
- Available chart keys: ${JSON.stringify(Array.from(availableKeys))}
- Quantitative summary: ${JSON.stringify(quantData)}

LIVE DATA:
${wrapUserData(globalDataset)}

${existingChart ? `
CONTEXT: The user is REFINING an existing saved chart:
${JSON.stringify(existingChart)}
Start by acknowledging you see this chart and ask what they'd like to change.
` : ''}

CHART OUTPUT FORMAT:
When generating or modifying a chart, include a JSON block wrapped in <chart_config>...</chart_config> tags.
The chart config MUST use ONLY keys from the available keys list above.
Format:
<chart_config>
{
    "id": "chart_[unique]",
    "type": "BAR" | "HORIZONTAL_BAR" | "PIE" | "SCATTER",
    "title": "Chart Title",
    "description": "AI insight about what this visualization reveals",
    "xKey": "unit_name",
    "yKey": "score",
    "yKeys": ["positive", "negative"],
    "aggregation": "AVG" | "COUNT" | "SUM"
}
</chart_config>

IMPORTANT RULES:
- xKey, yKey, yKeys MUST exactly match keys from the available keys list
- For BAR charts comparing multiple metrics, use yKeys array (NOT yKey)
- For SCATTER, use xKey and yKey (two numeric metrics)
- Always include a "description" with a deep insight
- If the user just asks a question (no chart needed), respond with text only
- Be conversational, insightful, and helpful
- Reference specific data points from the dataset to support your claims
- If you do NOT need to generate a chart, do NOT include <chart_config> tags

CONVERSATION SO FAR:
${conversationHistory}

Respond as the ASSISTANT. Be helpful and insightful.`;

        // 4. Call Gemini Pro
        const rawResponse = await callGemini(systemPrompt, {
            jsonMode: false, // We want mixed text + chart responses
            model: "gemini-3.1-pro-preview"
        }) as string;

        // 5. Parse response — extract chart config if present
        let reply = rawResponse;
        let chart = null;

        const chartMatch = rawResponse.match(/<chart_config>([\s\S]*?)<\/chart_config>/);
        if (chartMatch) {
            try {
                chart = JSON.parse(chartMatch[1].trim());
                // Remove the chart config from the text reply
                reply = rawResponse.replace(/<chart_config>[\s\S]*?<\/chart_config>/, '').trim();
            } catch (e) {
                console.warn("Failed to parse chart config from AI response");
            }
        }

        return NextResponse.json({ reply, chart, dataset: globalDataset });

    } catch (error) {
        return handleAIError(error);
    }
}

async function fetchQuantSummary(surveyId?: string) {
    if (surveyId) {
        let respIds: number[] = [];
        let rPage = 0;
        while (true) {
            const { data: rBat } = await supabase.from('respondents').select('id').eq('survey_id', surveyId).range(rPage * 1000, (rPage + 1) * 1000 - 1);
            if (!rBat || rBat.length === 0) break;
            respIds.push(...rBat.map((r: any) => r.id));
            if (rBat.length < 1000) break;
            rPage++;
        }

        if (respIds.length === 0) return { totalQuantitativeResponses: 0 };

        let totalQuant = 0;
        const CHUNK = 400;
        for (let i = 0; i < respIds.length; i += CHUNK) {
            const chunk = respIds.slice(i, i + CHUNK);
            const { count } = await supabase
                .from('raw_feedback_inputs')
                .select('*', { count: 'exact', head: true })
                .eq('is_quantitative', true)
                .not('numerical_score', 'is', null)
                .gte('numerical_score', 1)
                .lte('numerical_score', 4)
                .in('respondent_id', chunk);
            totalQuant += count || 0;
        }
        return { totalQuantitativeResponses: totalQuant };
    } else {
        const { count } = await supabase
            .from('raw_feedback_inputs')
            .select('*', { count: 'exact', head: true })
            .eq('is_quantitative', true)
            .not('numerical_score', 'is', null)
            .gte('numerical_score', 1)
            .lte('numerical_score', 4);
        return { totalQuantitativeResponses: count || 0 };
    }
}
