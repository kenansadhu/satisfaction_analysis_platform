import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(req: Request) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "API Key missing" }, { status: 500 });
    const genAI = new GoogleGenerativeAI(apiKey);

    try {
        const { unitId } = await req.json();

        // Fetch joined data
        const { data: rawData, error } = await supabase
            .from('raw_feedback_inputs')
            .select(`
            *,
            feedback_segments (
                sentiment,
                analysis_categories (name)
            )
        `)
            .eq('target_unit_id', unitId)
            .limit(500);

        if (error || !rawData || rawData.length === 0) throw new Error("No data found");

        // Flattening: Ensure every row has a 'category_name' and 'sentiment' string
        const flattenedData = rawData.map(row => {
            const segment = row.feedback_segments?.[0];
            return {
                ...row,
                category_name: segment?.analysis_categories?.name || "General",
                sentiment: segment?.sentiment || "Neutral"
            };
        });

        const numericCols = Object.keys(flattenedData[0]).filter(k =>
            typeof flattenedData[0][k] === 'number' && k !== 'id' && k !== 'target_unit_id'
        );

        const categoricalCols = ['category_name', 'sentiment', 'source_column'];

        const prompt = `
      Act as a Lead Data Scientist. Analyze this dataset structure for Unit: ${unitId}.
      Numeric Columns: ${numericCols.join(", ")}
      Categories: ${categoricalCols.join(", ")}

      TASK: Create a dashboard blueprint in JSON.
      - Use 'category_name' or 'source_column' for axes.
      - Use 'AVG' for numeric scores.
      - Use 'COUNT' for volumes.

      STRICT JSON FORMAT:
      {
        "charts": [
          {
            "id": "c1",
            "type": "BAR",
            "title": "Topic Volume",
            "description": "Insight description",
            "xKey": "category_name",
            "yKey": "id",
            "aggregation": "COUNT"
          }
        ]
      }
    `;

        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
        const result = await model.generateContent(prompt);
        let text = result.response.text().replace(/```json/g, "").replace(/```/g, "").trim();

        // Ensure we only return the 'charts' array part if the AI wrapped it
        const parsed = JSON.parse(text);
        const blueprint = parsed.charts || parsed;

        return NextResponse.json({
            blueprint: Array.isArray(blueprint) ? blueprint : [blueprint],
            rawData: flattenedData
        });

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}