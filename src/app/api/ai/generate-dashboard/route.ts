import { callGemini, handleAIError } from "@/lib/ai";
import { NextResponse } from "next/server";
import { supabaseServer as supabase } from "@/lib/supabase-server";
import { generateDashboardSchema } from "@/lib/validators";

export const maxDuration = 60; // Allow longer timeout for deep reasoning

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const validation = generateDashboardSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ error: "Invalid Input", details: validation.error.format() }, { status: 400 });
    }

    const { surveyId } = validation.data;

    // Read from the pre-built cache (same source as chat-analyst) — single DB call instead of N+1 RPCs
    if (!surveyId) {
      return NextResponse.json({ error: "surveyId is required for dashboard generation" }, { status: 400 });
    }

    const { data: surveyData, error: sErr } = await supabase
      .from('surveys')
      .select('ai_dataset_cache')
      .eq('id', parseInt(surveyId.toString(), 10))
      .single();

    if (sErr || !surveyData?.ai_dataset_cache) {
      return NextResponse.json(
        { error: "AI Context not built yet. Please build it in Survey Settings before generating the dashboard." },
        { status: 400 }
      );
    }

    const globalDataset: any[] = surveyData.ai_dataset_cache;
    if (globalDataset.length === 0) {
      return NextResponse.json({ error: "No data found in cache. Please rebuild the AI context." }, { status: 400 });
    }

    // Derive available keys from the first cached row
    const availableKeys = new Set<string>(['unit_name', 'unit_short_name', 'total_segments', 'positive', 'neutral', 'negative', 'score']);
    Object.keys(globalDataset[0]).forEach(k => {
      if (k.startsWith('category_') || k.startsWith('likert_') || k.startsWith('binary_')) availableKeys.add(k);
    });


    // 2. Prepare AI Context
    const datasetContext = {
      meta: {
        total_units_analyzed: globalDataset.length,
        description: "This macro dataset contains pre-aggregated sentiment counts and category breakdowns for multiple departments/units.",
        exact_allowable_keys_for_charts: Array.from(availableKeys)
      },
      data_sample: globalDataset
    };

    // 3. Advanced Prompt for Gemini 3.1 Pro
    const prompt = `
            ACT AS A SENIOR DATA SCIENTIST USING GEMINI 3.1 PRO.
            You are analyzing Student Feedback across an ENTIRE UNIVERSITY (Multiple Units/Departments).

            YOUR GOAL:
            Discover hidden connections and correlations ACROSS DIFFERENT DEPARTMENTS.
            - Do departments with high negative sentiment in specific categories also have low overall scores?
            - Which departments are outliers?
            - What are the strongest drivers of negative sentiment globally?

            TASK:
            Generate a dashboard blueprint JSON with exactly 4 highly insightful charts.
            - Prioritize SCATTER charts (Correlation) and BAR charts (Comparison).
            - DO NOT USE A SCATTER PLOT to compare a single metric against unit names. Only use SCATTER when correlating TWO DIFFERENT metrics. 
            - If comparing ACTUAL SENTIMENT (Positive vs Negative) side-by-side for a specific category across units, you MUST use a "BAR" chart and provide a yKeys array instead of a single yKey. Example: yKeys: ["category_Response_Speed_pos", "category_Response_Speed_neg"].
            - For Bar charts, X axis should usually be the "unit_name".
            
            STRICT JSON OUTPUT FORMAT expected:
            {
                "charts": [
                    {
                        "id": "chart_1",
                        "type": "BAR",
                        "title": "Positive vs Negative Sentiment regarding Facilities",
                        "description": "Units dealing with housing according to their 'unit_description' show much higher overall comment volume, but also a tighter ratio of positive to negative feedback.",
                        "xKey": "unit_name",
                        "yKeys": ["category_Facilities_pos", "category_Facilities_neg"],
                        "aggregation": "SUM"
                    }
                ]
            }
            
            CRITICAL INSTRUCTIONS FOR DYNAMIC RENDERING:
            1. DO NOT invent new keys. 
            2. Your \`xKey\`, \`yKey\` OR \`yKeys\` MUST EXACTLY MATCH one of the strings listed in \`exact_allowable_keys_for_charts\`.
            3. Do NOT provide a 'rawData' array. The frontend will map the live dataset directly using your xKey and yKey.
            4. The "description" should be a deep Insight. YOU MUST consider the \`unit_description\` provided in the data payload to explain *why* certain units have distinct metrics (e.g. "Because CTL handles online tools, it's natural they have high M-Flex mentions").
            
            DATA:
            ${JSON.stringify(datasetContext)}
        `;

    // 4. Call Gemini 3.1 Pro Preview
    const rawResult = await callGemini(prompt, {
      jsonMode: false,
      model: "gemini-2.5-flash"
    }) as string;

    const parsedResult = JSON.parse(rawResult);
    const blueprint = parsedResult.charts || parsedResult;
    let finalCharts = Array.isArray(blueprint) ? blueprint : [blueprint];

    // Normalize if Gemini wrapped the items in another 'chart' layer
    finalCharts = finalCharts.map(c => c.chart ? c.chart : c);

    // Return the blueprint
    return NextResponse.json({
      blueprint: finalCharts,
      rawData: [] // We no longer send rawData, the frontend handles live data
    });

  } catch (error) {
    return handleAIError(error);
  }
}