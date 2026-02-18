import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  // 1. Safety Check: Is the key loaded?
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("❌ CRITICAL ERROR: GEMINI_API_KEY is missing in .env.local");
    return NextResponse.json(
      { error: "Server Configuration Error: API Key missing. Check terminal." }, 
      { status: 500 }
    );
  }

  const genAI = new GoogleGenerativeAI(apiKey);

  try {
    const { headers } = await req.json();
    
    // Log for debugging
    console.log(`🤖 AI Identity: Analyzing ${headers.length} headers...`);

    const prompt = `
      You are a data analyst. Analyze these CSV headers and categorize them into 4 Identity Groups.
      
      Groups:
      1. "location": Campus/Site (e.g. Lokasi, Campus).
      2. "faculty": Faculty Name (e.g. Fakultas, School).
      3. "major": Study Program (e.g. Program Studi, Prodi, Major).
      4. "year": Entry Year (e.g. Tahun Masuk, Angkatan, Batch).

      Headers:
      ${JSON.stringify(headers)}

      Return a raw JSON object only. No markdown.
      Format: { "location": [], "faculty": [], "major": [], "year": [] }
    `;

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json" }
    });

    let text = result.response.text();
    // CLEANUP: Remove any markdown Gemini adds (```json ... ```)
    text = text.replace(/```json/g, "").replace(/```/g, "").trim();

    const mapping = JSON.parse(text);
    return NextResponse.json({ mapping });

  } catch (error: any) {
    console.error("❌ AI PROCESSING ERROR:", error); // Check VS Code terminal for this line!
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}