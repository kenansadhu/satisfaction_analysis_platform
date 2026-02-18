import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "API Key missing" }, { status: 500 });
  const genAI = new GoogleGenerativeAI(apiKey);

  try {
    const { comments, context, taxonomy } = await req.json();

    // Prepare the Taxonomy String for the Prompt
    const categoriesList = taxonomy.categories.map((c: any) => `- ${c.name}: ${c.description}`).join("\n");
    
    // Create a map of "Category Name" -> "Subcategories List"
    const subcatsMap = taxonomy.subcategories.reduce((acc: any, sub: any) => {
        // Find parent name
        const parent = taxonomy.categories.find((c: any) => c.id === sub.category_id);
        if (parent) {
            if (!acc[parent.name]) acc[parent.name] = [];
            acc[parent.name].push(sub.name);
        }
        return acc;
    }, {});
    
    const subcatsString = JSON.stringify(subcatsMap, null, 2);

    const prompt = `
      You are an expert Data Analyst for a University.
      Analyze student feedback for: "${context.name}".
      
      STRICT TAXONOMY TO USE:
      1. High-Level Categories:
      ${categoriesList}

      2. Valid Subcategories (Grouped by Category):
      ${subcatsString}

      INPUT DATA:
      ${JSON.stringify(comments)}

      INSTRUCTIONS:
      1. Analyze each comment.
      2. SPLIT into multiple segments if it discusses different topics.
      3. For each segment:
         - sentiment: "Positive", "Negative", or "Neutral".
         - category: MUST match one of the High-Level Categories provided exactly.
         - sub_category: MUST match a valid subcategory for that category. If none fit, use "General".
         - is_suggestion: true/false.
      
      OUTPUT:
      JSON object with "results" array.
      { "raw_input_id": 123, "segment_text": "...", "sentiment": "...", "category": "...", "sub_category": "...", "is_suggestion": ... }
    `;

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json" }
    });

    let text = result.response.text();
    text = text.replace(/```json/g, "").replace(/```/g, "").trim();

    // Map the string results back to your Database IDs
    const parsed = JSON.parse(text);
    const enrichedResults = parsed.results.map((res: any) => {
        // Find DB IDs for the text strings Gemini returned
        const catObj = taxonomy.categories.find((c: any) => c.name === res.category);
        const subObj = taxonomy.subcategories.find((s: any) => s.name === res.sub_category && s.category_id === catObj?.id);

        return {
            raw_input_id: res.raw_input_id,
            segment_text: res.segment_text,
            sentiment: res.sentiment,
            is_suggestion: res.is_suggestion,
            category_id: catObj ? catObj.id : null,       // Save ID, not string
            subcategory_id: subObj ? subObj.id : null     // Save ID, not string
        };
    });

    return NextResponse.json({ results: enrichedResults });

  } catch (error: any) {
    console.error("Analysis Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}