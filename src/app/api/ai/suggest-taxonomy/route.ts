import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "API Key missing" }, { status: 500 });
  const genAI = new GoogleGenerativeAI(apiKey);

  try {
    const { unitName, unitDesc, sampleComments, existingCategories, mode, additionalContext } = await req.json();

    let prompt = "";

    // Common Context Injection
    const contextBlock = `
      Unit: "${unitName}" (${unitDesc})
      ${additionalContext ? `USER IMPORTANT NOTES: ${additionalContext}` : ""}
    `;

    if (mode === "CATEGORIES") {
        prompt = `
          Context: You are setting up a professional taxonomy for:
          ${contextBlock}
          
          Task: Identify distinct Topics/Systems.
          
          INSTRUCTIONS:
          1. Use the "USER IMPORTANT NOTES" above to prioritize specific systems (e.g. if user mentions "M-Flex", make a category for it).
          2. Be SPECIFIC.
          3. Generate 8-15 categories if supported by data.
          
          Sample Comments:
          ${JSON.stringify(sampleComments)}
          
          Return JSON: 
          { "suggestions": [ { "name": "Category Name", "description": "Definition", "keywords": ["k1", "k2"] } ] }
        `;
    } else {
        prompt = `
          Context: Defining subcategories for Category "${existingCategories.name}" in:
          ${contextBlock}
          
          Task: Suggest 5-10 subcategories.
          
          Sample Comments:
          ${JSON.stringify(sampleComments)}
          
          Return JSON: { "suggestions": [ { "name": "Subcategory Name", "description": "Definition" } ] }
        `;
    }

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json" }
    });

    let text = result.response.text();
    text = text.replace(/```json/g, "").replace(/```/g, "").trim();
    
    return NextResponse.json(JSON.parse(text));

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}