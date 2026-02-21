import { callGemini, handleAIError } from "@/lib/ai";
import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
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

    // 1. Fetch Aggregated Data across ALL units
    const { data: unitsData, error: unitsError } = await supabase
      .from('organization_units')
      .select('id, name, description');

    if (unitsError || !unitsData) throw new Error("Failed to load units.");

    const globalDataset: any[] = [];
    const availableKeys = new Set<string>(['unit_name', 'total_segments', 'positive', 'neutral', 'negative', 'score']);

    // Gather macro-level metrics per unit
    for (const unit of unitsData) {
      const { data: metrics } = await supabase.rpc('get_dashboard_metrics', {
        p_unit_id: unit.id,
        p_survey_id: surveyId ? parseInt(surveyId.toString(), 10) : null
      });

      if (metrics && (metrics as any).total_segments > 0) {
        const categories = (metrics as any).category_counts || [];
        const flatCategories: any = {};

        if (Array.isArray(categories)) {
          categories.forEach(c => {
            const name = c.category_name;
            if (name) {
              const cleanKey = `category_${name.replace(/[^a-zA-Z0-9]/g, '_')}`;
              flatCategories[cleanKey] = c.total || 0;
              flatCategories[`${cleanKey}_pos`] = c.positive_count || 0;
              flatCategories[`${cleanKey}_neg`] = c.negative_count || 0;

              availableKeys.add(cleanKey);
              availableKeys.add(`${cleanKey}_pos`);
              availableKeys.add(`${cleanKey}_neg`);
            }
          });
        }

        globalDataset.push({
          unit_id: unit.id,
          unit_name: unit.name,
          unit_description: unit.description || "No specific context provided.",
          total_segments: (metrics as any).total_segments,
          positive: (metrics as any).positive,
          neutral: (metrics as any).neutral,
          negative: (metrics as any).negative,
          score: (metrics as any).score,
          ...flatCategories
        });
      }
    }

    if (globalDataset.length === 0) throw new Error("No data found across any units.");

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
    const parsed = await callGemini(prompt, {
      jsonMode: true,
      model: "gemini-3.1-pro-preview"
    }) as any;

    const blueprint = parsed.charts || parsed;
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