import { callGemini, handleAIError } from "@/lib/ai";
import { NextResponse } from "next/server";
import { generateReportSchema } from "@/lib/validators";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const validation = generateReportSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ error: "Invalid Input", details: validation.error.format() }, { status: 400 });
    }

    const { unitName, unitDescription, stats, segments, categoryBreakdown } = validation.data;

    const prompt = `You are a Senior Strategic Consultant writing an Executive Analysis Report for the "${unitName}" department/unit.

CONTEXT: ${unitDescription || 'No additional context provided.'}

DATA PROVIDED:
- Statistics: ${stats}
- Category Breakdown (positive/negative counts): ${JSON.stringify(categoryBreakdown || [])}
- Sample Student Comments (${(segments || []).length} of total): ${JSON.stringify((segments || []).slice(0, 60).map((s: any) => ({ text: s.segment_text, sentiment: s.sentiment, category: s.category_name })))}

YOUR TASK:
Produce a structured JSON analysis following EXACTLY this schema. Do NOT add any fields not in the schema. Every field is required.

{
  "executive_summary": "A 2-3 sentence high-level overview of the unit's performance. Mention the overall sentiment trend and the most critical finding. Write in third person, professional tone.",
  "overall_verdict": "One of: Excellent | Good | Needs Improvement | Critical",
  "strengths": [
    {
      "title": "Short strength title (3-6 words)",
      "detail": "1-2 sentence explanation backed by data (mention numbers/percentages if available)",
      "evidence": "A direct student quote that supports this strength (pick the most representative one from the data)"
    }
  ],
  "concerns": [
    {
      "title": "Short concern title (3-6 words)",
      "detail": "1-2 sentence explanation backed by data",
      "severity": "One of: High | Medium | Low",
      "evidence": "A direct student quote that illustrates this concern"
    }
  ],
  "recommendations": [
    {
      "title": "Short recommendation title (3-6 words)",
      "action": "Specific, actionable step the unit should take (1-2 sentences)",
      "impact": "Expected outcome if implemented (1 sentence)",
      "priority": "One of: Immediate | Short-term | Long-term"
    }
  ],
  "closing_statement": "A forward-looking, encouraging 1-2 sentence closing that acknowledges the data and inspires action. Professional and empathetic tone."
}

RULES:
- Return ONLY valid JSON, no markdown fences, no extra text
- Provide exactly 3 strengths, 3 concerns, and 3 recommendations
- Evidence quotes MUST come from the actual student comments provided — do NOT fabricate quotes
- If data is insufficient for 3 items in any section, provide as many as the data supports (minimum 1)
- Write in professional English suitable for university leadership
- Be specific — reference actual category names from the data, not generic statements
- Severity levels: High = systemic issue, Medium = notable pattern, Low = minor friction
- Priority levels: Immediate = can act this week, Short-term = this semester, Long-term = next academic year`;

    const reportJson = await callGemini(prompt, { jsonMode: true });

    // Parse and validate
    let parsed;
    try {
      parsed = typeof reportJson === 'string' ? JSON.parse(reportJson) : reportJson;
    } catch {
      return NextResponse.json({ error: 'AI returned invalid JSON' }, { status: 500 });
    }

    return NextResponse.json({ report: parsed });

  } catch (error) {
    return handleAIError(error);
  }
}