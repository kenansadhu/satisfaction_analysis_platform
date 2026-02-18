import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "API Key missing" }, { status: 500 });
    const genAI = new GoogleGenerativeAI(apiKey);

    try {
        const { comments, taxonomy, allUnits, unitContext } = await req.json();

        const categoriesList = taxonomy.map((c: any) => `- "${c.name}": ${c.description}`).join("\n");
        const unitsList = allUnits.map((u: any) => `- "${u.name}"`).join("\n");

        const prompt = `
      You are an expert Data Analyst for UPH University.
      
      CONTEXT:
      - Unit: ${unitContext.name}
      - Rules: ${unitContext.instructions.join("; ")}

      TASK:
      Analyze comments. Transform raw text into structured data.

      TAXONOMY:
      ${categoriesList}
      
      CROSS-TAGGING UNITS:
      ${unitsList}

      INSTRUCTIONS:
      1. **Segmentation**: Split distinct topics. "Lecturer good but AC hot" -> 2 segments.
      2. **Noise Filter**: IGNORE comments that are just "-", "tidak ada", "no comment", "cukup", "n/a". Do NOT create segments for these.
      3. **Categorization**: Assign best category.
      4. **Sentiment**: Positive/Negative/Neutral. 
         - "Sudah baik", "Ok" -> Positive/Neutral (Satisfaction).
      5. **Suggestion Detection** (NEW): Set "is_suggestion": true IF the student is proposing a change, future wish, or specific fix.
         - Keywords: "Semoga" (Hope), "Mohon" (Please), "Harap", "Sebaiknya" (Should), "Agar" (So that), "Tolong".
      6. **Cross-Tagging**: If comment is about another unit, put its name in "related_unit_name".

      INPUT:
      ${JSON.stringify(comments)}

      OUTPUT JSON:
      [
        {
          "raw_input_id": 123,
          "segments": [
            {
              "text": "semoga tetap menyesuaikan waktu",
              "category_name": "Flexibility",
              "sentiment": "Neutral",
              "is_suggestion": true, 
              "related_unit_name": null
            }
          ]
        }
      ]
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