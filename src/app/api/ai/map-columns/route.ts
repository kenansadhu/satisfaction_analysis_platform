import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "API Key missing" }, { status: 500 });
  const genAI = new GoogleGenerativeAI(apiKey);

  try {
    const { headers, samples, units } = await req.json();

    const prompt = `
      You are a Data Architect. Classify Survey Columns into 3 Types.
      
      TARGET UNITS:
      ${units.map((u: any) => `${u.id}: ${u.name}`).join("\n")}

      DATA TYPES:
      1. "SCORE" (Quantitative): 
         - Numbers (e.g. "2024")
         - Likert Scales (e.g. "4 = Sangat Puas", "3 = Puas")
         - Text Scales (e.g. "Sering", "Jarang", "Setuju")
         - Yes/No (Boolean)
      
      2. "CATEGORY" (Filter Group):
         - Short, repeating options (e.g. "Email", "Phone", "Onsite")
         - Choices (e.g. "Kalender Akademik", "Instagram")
         - NOT for sentiment analysis.
      
      3. "TEXT" (Open Analysis):
         - Long comments, suggestions, "Saran", "Komentar".
         - Needs AI Sentiment Analysis.

      4. "IGNORE": Demographic data (Name, Date) or Identity columns (Faculty, Major) - assume these are handled elsewhere.

      INPUT COLUMNS (Header + Samples):
      ${JSON.stringify(headers.map((h: string) => ({
      header: h,
      samples: samples[h]?.slice(0, 4) // First 4 values
    })))}

      RETURN JSON:
      {
        "mappings": {
           "Header Name": { 
              "unit_id": "5", 
              "type": "SCORE", 
              "rule": "LIKERT" // Optional rule for Scores
           }
        }
      }
      
      Rules for 'rule': 
      - If "4 = Puas" -> "LIKERT"
      - If "Ya/Tidak" -> "BOOLEAN"
      - If "Sering/Jarang" -> "TEXT_SCALE"
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