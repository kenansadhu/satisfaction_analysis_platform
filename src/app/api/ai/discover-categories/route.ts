import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "API Key missing" }, { status: 500 });
    const genAI = new GoogleGenerativeAI(apiKey);

    try {
        const { comments, currentCategories, instructions, unitName } = await req.json();

        // Format the "Memory" of what we found so far
        const existingList = currentCategories.length > 0
            ? currentCategories.map((c: any) => `- ${c.name}: ${c.description}`).join("\n")
            : "(None yet - Start fresh)";

        const prompt = `
      You are a Taxonomy Architect analyzing student feedback for the Unit: "${unitName}".
      
      USER INSTRUCTIONS:
      ${instructions.map((i: string) => `- ${i}`).join("\n")}

      TASK:
      Read the batch of 1,000 comments below. 
      Update the "Existing Categories" list to accommodate any NEW topics found in this batch.
      
      RULES:
      1. If a comment fits an Existing Category, do nothing.
      2. If a comment introduces a NEW distinct topic, create a new Category.
      3. If a comment suggests an Existing Category needs a better name/description, update it.
      4. IGNORE meaningless comments ("-", "no comment", "ok").
      5. "Others" category is allowed for miscellaneous items.

      EXISTING CATEGORIES:
      ${existingList}

      NEW COMMENTS BATCH (First 50 shown for context, processing all internally):
      ${JSON.stringify(comments.slice(0, 100))} ... (and more)

      OUTPUT:
      Return the COMPLETE updated list of categories as a JSON object:
      {
        "categories": [
          { "name": "Category Name", "description": "Definition", "keywords": ["keyword1", "keyword2"] }
        ]
      }
    `;

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