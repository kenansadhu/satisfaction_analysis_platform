import { NextResponse } from "next/server";
import { callGemini, getAgentSettings, handleAIError, wrapUserData } from "@/lib/ai";

export const maxDuration = 60;

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { unitName, outgoingByTarget, incomingBySource, outgoingSample, incomingSample } = body as {
            unitName: string;
            outgoingByTarget: { unit_name: string; total: number; positive: number; negative: number; neutral: number }[];
            incomingBySource: { unit_name: string; total: number; positive: number; negative: number; neutral: number }[];
            outgoingSample: string[];
            incomingSample: string[];
        };

        if (!unitName) return NextResponse.json({ error: "unitName required" }, { status: 400 });

        const { modelId } = await getAgentSettings("cross-unit-summary");

        const prompt = `You are an educational data analyst reviewing cross-unit feedback signals for a university service unit named "${unitName}".

OUTGOING SIGNALS — What students of ${unitName} say about other university units:
${wrapUserData(outgoingByTarget)}

Sample outgoing comments:
${wrapUserData(outgoingSample.slice(0, 15))}

INCOMING SIGNALS — What students from other university units say about ${unitName}:
${wrapUserData(incomingBySource)}

Sample incoming comments:
${wrapUserData(incomingSample.slice(0, 15))}

Return a JSON object with EXACTLY this structure (no extra keys, no markdown):
{
  "headline": "A single sharp sentence summarising this unit's cross-unit position",
  "connection_overview": "2–3 sentences on overall volume, the balance between incoming vs outgoing, and network breadth",
  "outgoing_analysis": {
    "summary": "2–3 sentences: what ${unitName}'s own students say about other departments — key topics and tone",
    "top_themes": [
      { "theme": "Theme name", "units": ["Unit A"], "sentiment": "Positive" }
    ]
  },
  "incoming_analysis": {
    "summary": "2–3 sentences: how students from other departments perceive ${unitName} — recurring topics and dominant source units",
    "top_themes": [
      { "theme": "Theme name", "sources": ["Unit A"], "sentiment": "Positive" }
    ]
  },
  "notable_patterns": [
    { "title": "Short title", "detail": "1–2 sentences explaining the pattern", "type": "Bidirectional" }
  ],
  "recommended_actions": [
    { "action": "Concise action statement", "rationale": "Why this matters based on the data", "priority": "Immediate" }
  ],
  "closing_note": "One sentence closing observation"
}

Rules:
- sentiment values: "Positive", "Negative", or "Mixed" only
- notable_patterns type values: "Bidirectional", "Contrast", "Gap", or "Opportunity" only
- recommended_actions priority values: "Immediate", "Short-term", or "Long-term" only
- top_themes: 2–4 items per direction, only themes supported by actual data
- notable_patterns: 1–3 items — only include genuinely interesting cross-cuts, omit if none
- recommended_actions: 2–3 items, specific and actionable
- Use exact unit names from the data; never generalise or invent`;

        const result = await callGemini(prompt, {
            jsonMode: true,
            model: modelId,
            functionId: "cross-unit-summary",
        });

        return NextResponse.json({ report: result });
    } catch (e) {
        return handleAIError(e);
    }
}
