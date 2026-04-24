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

        // 1. Fetch the cached global dataset (replaces N+1 bottleneck)
        let globalDataset: any[] = [];
        let availableKeys = new Set<string>([
            'unit_name', 'unit_short_name', 'total_segments',
            'positive', 'neutral', 'negative', 'score'
        ]);

        if (surveyId) {
            const { data: surveyData, error: sErr } = await supabase
                .from('surveys')
                .select('ai_dataset_cache')
                .eq('id', parseInt(surveyId, 10))
                .single();

            if (sErr) throw new Error("Failed to load survey cache: " + sErr.message);

            if (surveyData?.ai_dataset_cache) {
                globalDataset = surveyData.ai_dataset_cache;
                // Read keys dynamically from the first valid object to preserve category transparency
                if (globalDataset.length > 0) {
                    Object.keys(globalDataset[0]).forEach(k => {
                        if (k.startsWith('category_') || k.startsWith('likert_') || k.startsWith('binary_')) availableKeys.add(k);
                    });
                }
            } else {
                return NextResponse.json({ error: "AI Context not built. Please build it in Survey Settings." }, { status: 400 });
            }
        } else {
            return NextResponse.json({ error: "No survey selected." }, { status: 400 });
        }

        console.log(`[chat-analyst] Cached Dataset loaded: ${globalDataset.length} units.`);

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
When generating charts, include a JSON block wrapped in <charts_config>...</charts_config> tags. 
**PRO TIP: Combine related points into a single chart!** Do not generate 9 different charts with 1 line each. If you are comparing 3 different 'likert' metrics or measuring positive vs negative segments, combine them into one single chart using the \`yKeys\` array instead of \`yKey\`.

The chart config MUST use ONLY keys from the available keys list above.
Format:
<charts_config>
[
    {
        "id": "chart_[unique]",
        "type": "BAR" | "HORIZONTAL_BAR" | "PIE" | "SCATTER" | "LINE",
        "title": "Chart Title",
        "description": "AI insight about what this visualization reveals",
        "xKey": "unit_name",
        "yKey": "score", 
        "yKeys": ["likert_Quality", "likert_Speed", "likert_Cost"], 
        "aggregation": "AVG" | "COUNT" | "SUM"
    }
]
</charts_config>

IMPORTANT RULES:
- xKey, yKey, yKeys MUST exactly match keys from the available keys list
- When comparing MULTIPLE metrics across units (e.g. 3 different Likert scores), you MUST use a "BAR" or "LINE" chart and provide an array of strings in \`yKeys\`. Do not use \`yKey\` if using \`yKeys\`.
- For SCATTER, use xKey and yKey (two numeric metrics)
- Always include a "description" with a deep insight
- If the user just asks a question (no chart needed), respond with text only
- If you do NOT need to generate a chart, do NOT include <charts_config> tags
- Do NOT generate charts with only 1 data point if they can be combined. Group them logically (e.g., all 'likert_' academic scores, or 'positive' vs 'negative' segments).

CRITICAL FORMATTING DIRECTIVES (YOU WILL BE PENALIZED FOR IGNORING THESE):
1. **NO CORNY ROLEPLAY**: Absolutely omit conversational filler, greetings, or roleplay preambles. Output strict, direct, and actionable insights. NEVER refer to yourself as "Gemini" or mention your AI model name.
2. **MANDATORY ENCAPSULATION**: YOU MUST WRAP EVERY SINGLE THEMATIC POINT OR EXPLANATION IN A \`<box title="Your Title Here">\` TAG. 
    - Provide a short 1-2 sentence high-level summary paragraph at the very beginning BEFORE your boxes.
3. **MANDATORY TYPOGRAPHY**: You MUST format text entities using these EXACT Markdown rules so our parser can style them:
    - Verbatim Student Quotes: Blockquotes > "quote here"
    - Dataset Column/Category Names: Inline Code \`category_Facilities_neg\`
    - Faculty Names: Bold **Faculty of Medicine**
    - Organization Unit Names: Italics *IT Department (ITD)*
    - Exact Score Values (Likert/Binary): Bold **3.42** or **85%**
    - Qualitative Volume/Segment Counts: Italics *1,420 segments*
4. **CROSS-UNIT FOCUS**: Focus exclusively on structural connections, correlations, and comparisons between MULTIPLE units. DO NOT generate single-unit deep dives (e.g., do not spend a whole box analyzing just the IT Department). The user has a separate analysis tool for single units. Pay close attention to the \`unit_description\` variable to understand the context and faculty mappings behind each unit.
5. **CHART RULE**: Charts MUST compare MULTIPLE units (e.g., \`xKey: "unit_name"\`). Never generate a chart that plots "Categories" as the axis for a single unit. Never hallucinate nested "transform" JSON objects in the chart config.
6. **SEPARATE QUANT/QUAL**: You must analyze quantitative Likert scores (the \`likert_X\` keys, which are 1-4 scale KPIs) and binary scores (\`binary_X\` keys, 0-1 scale) alongside qualitative sentiments (the \`category_X\` keys). Explicitly state what is quantitative and what is qualitative sentiment.
7. **DATA-FIRST**: Cite specific metrics (both exact quantitative averages out of 4 or 1, and exact sentiment \`total_segments\`) from the dataset to support your claims. Do not hallucinate numbers. Understand that \`likert_\` are average scores out of 4, while \`binary_\` represent percentages (0 to 1).

CONVERSATION SO FAR:
${conversationHistory}

Respond as the ASSISTANT. Be helpful and insightful.`;

        // 4. Call Gemini Pro
        const rawResponse = await callGemini(systemPrompt, {
            jsonMode: false, // We want mixed text + chart responses
            model: "gemini-2.5-flash"
        }) as string;

        // 5. Parse response — extract charts config if present
        let reply = rawResponse;
        let charts: any[] = [];

        // Catch multiple <charts_config> tags using a global regex
        const chartRegex = /<charts_config>\s*(?:```json\s*)?([\s\S]*?)(?:\s*```)?\s*<\/charts_config>/gi;
        let match;

        while ((match = chartRegex.exec(rawResponse)) !== null) {
            try {
                const parsed = JSON.parse(match[1].trim());
                if (Array.isArray(parsed)) {
                    charts.push(...parsed);
                } else {
                    charts.push(parsed);
                }
            } catch (e) {
                console.warn("Failed to parse a charts config block from AI response");
            }
        }

        // Completely remove all tags and their contents from the text reply
        reply = reply.replace(/<charts_config>[\s\S]*?<\/charts_config>/gi, '').trim();

        // Handle legacy single chart tag if AI hallucinates it
        const legacyRegex = /<chart_config>\s*(?:```json\s*)?([\s\S]*?)(?:\s*```)?\s*<\/chart_config>/gi;
        while ((match = legacyRegex.exec(rawResponse)) !== null) {
            try {
                charts.push(JSON.parse(match[1].trim()));
            } catch (e) {
                console.warn("Failed to parse a legacy chart_config block");
            }
        }
        reply = reply.replace(/<chart_config>[\s\S]*?<\/chart_config>/gi, '').trim();

        return NextResponse.json({ reply, charts, dataset: globalDataset });

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

        const CHUNK = 400;
        const MAX_CONCURRENT = 5;
        let totalQuant = 0;

        for (let batchStart = 0; batchStart < respIds.length; batchStart += CHUNK * MAX_CONCURRENT) {
            const chunks: number[][] = [];
            for (let i = batchStart; i < Math.min(batchStart + CHUNK * MAX_CONCURRENT, respIds.length); i += CHUNK) {
                chunks.push(respIds.slice(i, i + CHUNK));
            }
            const counts = await Promise.all(chunks.map(chunk =>
                supabase.from('raw_feedback_inputs')
                    .select('*', { count: 'exact', head: true })
                    .eq('is_quantitative', true)
                    .not('numerical_score', 'is', null)
                    .gte('numerical_score', 1)
                    .lte('numerical_score', 4)
                    .in('respondent_id', chunk)
                    .then(({ count }) => count || 0)
            ));
            totalQuant += counts.reduce((a, b) => a + b, 0);
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
