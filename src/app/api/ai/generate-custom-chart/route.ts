import { callGemini, handleAIError } from "@/lib/ai";
import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const maxDuration = 60; // Allow 60s for reasoning

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { surveyId, message } = body;

        if (!message) {
            return NextResponse.json({ error: "Message is required" }, { status: 400 });
        }

        // 1. Fetch Aggregated Data across ALL units (Same macro-dataset)
        const { data: unitsData, error: unitsError } = await supabase
            .from('organization_units')
            .select('id, name, description');

        if (unitsError || !unitsData) throw new Error("Failed to load units.");

        const globalDataset: any[] = [];
        const availableKeys = new Set<string>(['unit_name', 'total_segments', 'positive', 'neutral', 'negative', 'score']);

        for (const unit of unitsData) {
            const { data: metrics } = await supabase.rpc('get_dashboard_metrics', {
                p_unit_id: unit.id,
                p_survey_id: surveyId ? parseInt(surveyId.toString(), 10) : null
            });

            if (metrics && (metrics as any).total_segments > 0) {
                // Flatten the category counts explicitly so Gemini can use them as keys
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

        const datasetContext = {
            meta: {
                total_units_analyzed: globalDataset.length,
                description: "This macro dataset contains pre-aggregated sentiment counts and category breakdowns for multiple departments/units.",
                exact_allowable_keys_for_charts: Array.from(availableKeys)
            },
            data_sample: globalDataset
        };

        // 2. Build the exact prompt for Gemini 3.1 Pro Preview
        const prompt = `
            ACT AS A SENIOR DATA SCIENTIST USING GEMINI 3.1 PRO.
            You are analyzing Student Feedback across an ENTIRE UNIVERSITY (Multiple Units/Departments).

            USER REQUEST: "${message}"

            YOUR GOAL:
            Satisfy the user's specific request by generating exactly ONE precise Recharts Chart configuration.
            
            DATASET STRUCTURE:
            I have provided a dataset (data_sample) and the exact keys you are allowed to use. 

            TASK:
            Generate a JSON response containing exactly ONE chart configuration that answers the user's request.
            - Type must be one of: "BAR", "HORIZONTAL_BAR", "PIE", "SCATTER".
            - If the user asks to compare exactly ONE metric across all units (e.g., "Show me teaching complaints by unit" or "Which unit has the most positive feedback"), DO NOT USE A SCATTER PLOT. Use a "BAR" or "HORIZONTAL_BAR" chart.
            - If the user asks to compare ACTUAL SENTIMENT (Positive vs Negative) side-by-side for a specific category, you MUST use a "BAR" chart and provide a yKeys array instead of a single yKey. Example: yKeys: ["category_Response_Speed_pos", "category_Response_Speed_neg"].
            - If the user asks for a *correlation* or *relationship* between TWO DIFFERENT metrics/categories, USE A "SCATTER" CHART where xKey is the first metric and yKey is the second metric.
            - For Bar charts over multiple units, X axis should usually be the "unit_name".
            
            STRICT JSON OUTPUT FORMAT expected:
            {
                "chart": {
                    "id": "custom_chart_1",
                    "type": "BAR", // Or SCATTER, PIE, etc.
                    "title": "Your Chart Title",
                    "description": "Your AI explanation of what the chart shows, referencing the specific function of the units (from unit_description) to explain *why* the data looks this way.",
                    "xKey": "unit_name",
                    "yKeys": ["category_Facilities_pos", "category_Facilities_neg"],
                    "aggregation": "SUM"
                }
            }
            
            CRITICAL INSTRUCTIONS FOR DYNAMIC RENDERING:
            1. DO NOT invent new keys. 
            2. Your \`xKey\`, \`yKey\` OR \`yKeys\` array MUST EXACTLY MATCH strings listed in \`exact_allowable_keys_for_charts\`. Look closely at those allowable keys and map the user's intent to them. (e.g. if the user says 'online learning', pick 'category_Online_Learning' if it is available).
            3. Do NOT provide a 'rawData' array. The frontend will map the live dataset directly using your keys.
            4. The "description" should provide a deep, high-level AI insight. YOU MUST read the \`unit_description\` in the data to understand what each unit actually does, and use that context to explain the correlations (e.g., "CTL handles online learning, which explains why they receive the most M-Flex feedback").
            
            DATA:
            ${JSON.stringify(datasetContext)}
        `;

        // 3. Call Gemini
        const parsed = await callGemini(prompt, {
            jsonMode: true,
            model: "gemini-3.1-pro-preview"
        }) as any;

        let chart = parsed.chart || parsed;

        // Normalize if Gemini returned an array (e.g. { chart: [{ chart: {...} }] })
        if (Array.isArray(chart)) {
            chart = chart[0];
        }

        // Normalize if Gemini wrapped the object in another 'chart' key
        if (chart && chart.chart) {
            chart = chart.chart;
        }

        return NextResponse.json({
            chart: chart
        });

    } catch (error) {
        return handleAIError(error);
    }
}
