import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "API Key missing" }, { status: 500 });

    try {
        const { unitName, quantitative, qualitative, suggestions } = await req.json();

        // Safety check: Ensure we aren't sending massive JSON
        const safeQual = qualitative ? qualitative.slice(0, 10) : [];
        const safeSugg = suggestions ? suggestions.slice(0, 10) : [];

        const prompt = `
      You are a Strategic Consultant for ${unitName}.
      
      DATA:
      1. Scores: ${JSON.stringify(quantitative)}
      2. Top Issues: ${JSON.stringify(safeQual)}
      3. Suggestions: ${JSON.stringify(safeSugg)}

      TASK:
      Write a short Executive Summary (Markdown).
      - Highlights
      - Key Drivers of Sentiment
      - 3 Recommendations
    `;

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

        const result = await model.generateContent({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
        });

        return NextResponse.json({ report: result.response.text() });

    } catch (error: any) {
        console.error("Generate Report Error:", error); // <--- Check your VS Code Terminal for this!
        return NextResponse.json({ error: error.message || "Failed to generate report" }, { status: 500 });
    }
}