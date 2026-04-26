import { callGemini, handleAIError, wrapUserData } from "@/lib/ai";
import { NextResponse } from "next/server";
import { supabaseServer as supabase } from "@/lib/supabase-server";

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
            existingChart?: any;
        };

        if (!messages || messages.length === 0) {
            return NextResponse.json({ error: "No messages provided" }, { status: 400 });
        }

        // 1. Load cached dataset
        let globalDataset: any[] = [];
        let availableKeys = new Set<string>([
            'unit_name', 'unit_short_name', 'total_segments',
            'positive', 'neutral', 'negative', 'score',
        ]);

        let surveyContext: any = null;
        let columnSchema: any[] = [];
        let facultiesSummary: any[] = [];

        if (surveyId) {
            const { data: surveyData, error: sErr } = await supabase
                .from('surveys')
                .select('ai_dataset_cache')
                .eq('id', parseInt(surveyId, 10))
                .single();

            if (sErr) throw new Error("Failed to load survey cache: " + sErr.message);

            const raw = (surveyData as any)?.ai_dataset_cache;
            if (!raw) {
                return NextResponse.json({ error: "AI Context not built. Please build it in Survey Settings." }, { status: 400 });
            }

            // Support v1 (flat array) and v2 (enriched object)
            if (Array.isArray(raw)) {
                globalDataset = raw;
            } else if (raw?.v === 2) {
                globalDataset = raw.units || [];
                surveyContext = raw.survey_context || null;
                columnSchema = raw.column_schema || [];
                facultiesSummary = raw.faculties_summary || [];
            } else {
                globalDataset = raw.units || raw;
            }

            if (globalDataset.length > 0) {
                Object.keys(globalDataset[0]).forEach(k => {
                    if (k.startsWith('category_') || k.startsWith('likert_') || k.startsWith('binary_')) availableKeys.add(k);
                });
            }
        } else {
            return NextResponse.json({ error: "No survey selected." }, { status: 400 });
        }

        console.log(`[chat-analyst] Dataset: ${globalDataset.length} units | columns: ${columnSchema.length} | faculties: ${facultiesSummary.length}`);

        // 2. Build conversation history
        const conversationHistory = messages.map(m => {
            if (m.role === "user") return `USER: ${m.content}`;
            if (m.chart) return `ASSISTANT: ${m.content}\n[CHART_CONFIG: ${JSON.stringify(m.chart)}]`;
            return `ASSISTANT: ${m.content}`;
        }).join("\n\n");

        // 3. Build enriched context sections
        const surveyContextBlock = surveyContext ? `
SURVEY CONTEXT:
- Name: ${surveyContext.survey_name}
- Total respondents: ${surveyContext.respondent_count.toLocaleString()}
- Faculties (use for breakdowns): ${surveyContext.faculties.join(', ')}
- Programs: ${surveyContext.programs.slice(0, 20).join(', ')}${surveyContext.programs.length > 20 ? ` (+${surveyContext.programs.length - 20} more)` : ''}
- Locations: ${surveyContext.locations.join(', ')}
` : '';

        const columnDictBlock = columnSchema.length > 0 ? `
COLUMN DICTIONARY — exact prompt key → original survey question → unit → scale:
${columnSchema.map(c =>
    `  ${c.key} | "${c.question}" | ${c.unit_name} | scale: ${c.scale}${c.raw_options?.length > 0 ? ` | raw options: ${c.raw_options.join(' / ')}` : ''}`
).join('\n')}
` : '';

        const facultiesBlock = facultiesSummary.length > 0 ? `
FACULTY BREAKDOWN DATA — pre-aggregated average quantitative scores per faculty × unit:
(Reference this when the user asks for faculty comparisons. Cite specific numbers from here.)
${JSON.stringify(facultiesSummary)}
` : '';

        // 4. Build system prompt
        const systemPrompt = `
ACT AS A SENIOR DATA SCIENTIST powered by Gemini Pro, analyzing Student Satisfaction Survey data for a university.

YOU ARE IN A CONVERSATIONAL SESSION. The user will ask questions, request charts, and you will respond with insights and visualizations.

CAPABILITIES:
1. ANALYZE data and provide text insights
2. GENERATE chart blueprints (the frontend renders them live)
3. MODIFY existing charts based on user feedback
4. EXPLAIN correlations and patterns
5. BREAK DOWN results by faculty using the FACULTY BREAKDOWN DATA section

DATASET CONTEXT:
- ${globalDataset.length} units analyzed
- Available chart keys: ${JSON.stringify(Array.from(availableKeys))}
${surveyContextBlock}
${columnDictBlock}
${facultiesBlock}

LIVE UNIT DATA:
${wrapUserData(globalDataset)}

${existingChart ? `
CONTEXT: The user is REFINING an existing saved chart:
${JSON.stringify(existingChart)}
Start by acknowledging you see this chart and ask what they'd like to change.
` : ''}

CHART OUTPUT FORMAT:
When generating charts, include a JSON block wrapped in <charts_config>...</charts_config> tags.
**PRO TIP: Combine related points into a single chart!** Do not generate 9 different charts with 1 line each. If comparing 3 different 'likert' metrics or measuring positive vs negative segments, combine them into one chart using the \`yKeys\` array.

Chart config MUST use ONLY keys from the available keys list above (or xKey: "unit_name", yKey: "score" etc).
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
        "yKeys": ["likert_Quality", "likert_Speed"],
        "aggregation": "AVG" | "COUNT" | "SUM"
    }
]
</charts_config>

IMPORTANT RULES:
- xKey, yKey, yKeys MUST exactly match keys from the available keys list
- When comparing MULTIPLE metrics across units, use "BAR" or "LINE" with \`yKeys\` array
- For SCATTER, use xKey and yKey (two numeric metrics)
- Always include a "description" with a deep insight
- If the user just asks a question (no chart needed), respond with text only
- If you do NOT need to generate a chart, do NOT include <charts_config> tags
- Do NOT generate charts with only 1 data point

CRITICAL FORMATTING DIRECTIVES:
1. **NO CORNY ROLEPLAY**: No greetings or roleplay preambles. Output strict, direct, actionable insights. NEVER refer to yourself as "Gemini".
2. **MANDATORY ENCAPSULATION**: WRAP EVERY THEMATIC POINT IN A \`<box title="Your Title Here">\` TAG. Short 1-2 sentence summary at the very start BEFORE boxes.
3. **MANDATORY TYPOGRAPHY**:
    - Student Quotes: Blockquotes > "quote here"
    - Column/Category Names: Inline Code \`category_Facilities_neg\`
    - Faculty Names: Bold **Faculty of Medicine**
    - Unit Names: Italics *IT Department (ITD)*
    - Exact Score Values: Bold **3.42** or **85%**
    - Segment Counts: Italics *1,420 segments*
4. **FACULTY AWARENESS**: When the user asks about faculty breakdowns, use the FACULTY BREAKDOWN DATA above. Cite specific avg_score values per faculty. If a faculty has notably lower scores on a specific unit, flag it.
5. **COLUMN TRANSPARENCY**: Use the COLUMN DICTIONARY to explain what each \`likert_X\` or \`binary_X\` key actually measures. When citing a score, mention the original question text.
6. **CROSS-UNIT FOCUS**: Focus on structural connections, correlations, and comparisons between MULTIPLE units. Avoid single-unit deep dives.
7. **SEPARATE QUANT/QUAL**: Analyze \`likert_X\` keys (1-4 scale) and \`binary_X\` keys (0-1 scale) separately from qualitative \`category_X\` sentiment keys.
8. **DATA-FIRST**: Cite specific metrics from the dataset. Do not hallucinate numbers.

CONVERSATION SO FAR:
${conversationHistory}

Respond as the ASSISTANT. Be helpful and insightful.`;

        // 5. Call Gemini Pro
        const rawResponse = await callGemini(systemPrompt, {
            jsonMode: false,
            model: "gemini-2.5-flash",
        }) as string;

        // 6. Parse response — extract charts
        let reply = rawResponse;
        let charts: any[] = [];

        const chartRegex = /<charts_config>\s*(?:```json\s*)?([\s\S]*?)(?:\s*```)?\s*<\/charts_config>/gi;
        let match;
        while ((match = chartRegex.exec(rawResponse)) !== null) {
            try {
                const parsed = JSON.parse(match[1].trim());
                if (Array.isArray(parsed)) charts.push(...parsed);
                else charts.push(parsed);
            } catch {
                console.warn("Failed to parse a charts_config block");
            }
        }
        reply = reply.replace(/<charts_config>[\s\S]*?<\/charts_config>/gi, '').trim();

        const legacyRegex = /<chart_config>\s*(?:```json\s*)?([\s\S]*?)(?:\s*```)?\s*<\/chart_config>/gi;
        while ((match = legacyRegex.exec(rawResponse)) !== null) {
            try { charts.push(JSON.parse(match[1].trim())); } catch { /* ignore */ }
        }
        reply = reply.replace(/<chart_config>[\s\S]*?<\/chart_config>/gi, '').trim();

        return NextResponse.json({ reply, charts, dataset: globalDataset });

    } catch (error) {
        return handleAIError(error);
    }
}
