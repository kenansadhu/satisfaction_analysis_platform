import { callGemini, handleAIError } from "@/lib/ai";
import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(req: Request) {
  try {
    const { unitId, surveyId } = await req.json();

    if (!unitId) {
      return NextResponse.json({ error: "unitId is required" }, { status: 400 });
    }

    // 1. Fetch Basic Context (Unit, Survey Population)
    const [unitRes, respRes] = await Promise.all([
      supabase.from('organization_units').select('name, description').eq('id', unitId).single(),
      supabase.from('respondents').select('id', { count: 'exact', head: true }).eq('survey_id', surveyId)
    ]);

    const unit = unitRes.data;
    const totalSurveyPopulation = respRes.count || 0;

    // 2. Fetch Proper Qualitative Data (feedback_segments) with Isolation
    const { data: surveyResps } = await supabase.from('respondents').select('id').eq('survey_id', surveyId);
    const surveyRespIds = (surveyResps || []).map(r => r.id);

    const { data: rawInputs } = await supabase
      .from('raw_feedback_inputs')
      .select('id, raw_text, source_column, respondent_id')
      .eq('target_unit_id', unitId)
      .in('respondent_id', surveyRespIds);

    const inputIds = (rawInputs || []).map(ri => ri.id);

    const [segmentsRes, categoriesRes] = await Promise.all([
      supabase.from('feedback_segments').select('segment_text, sentiment, category_id, raw_input_id').in('raw_input_id', inputIds).limit(200),
      supabase.from('analysis_categories').select('id, name').eq('unit_id', unitId)
    ]);

    const catMap = new Map(((categoriesRes.data as any[]) || []).map(c => [c.id, c.name]));
    const segmentsView = ((segmentsRes.data as any[]) || []).map(s => ({
      segment_text: s.segment_text,
      sentiment: s.sentiment,
      category_name: catMap.get(s.category_id) || "General"
    }));

    let finalQualitativeData = segmentsView;

    // FALLBACK: If no analyzed segments, get raw qualitative feedback (verbatim)
    if (finalQualitativeData.length === 0) {
      finalQualitativeData = (rawInputs || []).filter(ri => ri.raw_text && ri.raw_text.length > 5).map(f => ({
        segment_text: f.raw_text as string,
        sentiment: "Neutral",
        category_name: f.source_column
      })).slice(0, 100);
    }

    // aggregation
    const sentimentCounts = finalQualitativeData.reduce((acc: any, s) => {
      acc[s.sentiment] = (acc[s.sentiment] || 0) + 1;
      return acc;
    }, { Positive: 0, Negative: 0, Neutral: 0 });

    const categories = finalQualitativeData.reduce((acc: any, s) => {
      if (!s.category_name) return acc;
      acc[s.category_name] = (acc[s.category_name] || 0) + 1;
      return acc;
    }, {});

    // 3. Fetch Quantitative Scores with SCALE AWARENESS & Isolation
    const { data: quantData } = await supabase
      .from('raw_feedback_inputs')
      .select('source_column, numerical_score, respondent_id')
      .eq('target_unit_id', unitId)
      .eq('is_quantitative', true)
      .in('respondent_id', surveyRespIds)
      .not('numerical_score', 'is', null);

    const quantStats = (quantData || []).reduce((acc: any, q) => {
      if (!acc[q.source_column]) acc[q.source_column] = { sum: 0, count: 0, max: 0 };
      acc[q.source_column].sum += q.numerical_score as number;
      acc[q.source_column].count++;
      if (q.numerical_score as number > acc[q.source_column].max) acc[q.source_column].max = q.numerical_score as number;
      return acc;
    }, {} as Record<string, { sum: number, count: number, max: number }>);

    const unitUniqueResps = new Set((quantData || []).map(q => q.respondent_id));
    (rawInputs || []).forEach(ri => unitUniqueResps.add(ri.respondent_id));
    const unitRespondentCount = unitUniqueResps.size;

    const quantPrompt = Object.entries(quantStats).map(([col, data]: [string, any]) => {
      const avg = (data.sum / data.count).toFixed(2);
      const scaleType = data.max <= 1 ? "Binary/Percentage (0-1)" : "Likert Scale (1-4)";
      return `• ${col}: ${avg} avg (${data.count} responses) [Scale: ${scaleType}]`;
    }).join('\n');

    const statsPrompt = `Unit Respondents: ${unitRespondentCount || 0} unique students out of ${totalSurveyPopulation} total survey participants.
Qualitative Data: ${finalQualitativeData.length} items provided. Sentiment Distribution: ${sentimentCounts.Positive} Positive, ${sentimentCounts.Negative} Negative, ${sentimentCounts.Neutral} Neutral.`;

    const categoryPrompt = Object.entries(categories).map(([name, count]) => `${name} (${count})`).join(', ');

    // 4. RESTORE SENIOR STRATEGIC CONSULTANT PROMPT WITH ENHANCED CONTEXT & WEIGHTING
    const prompt = `You are a Senior Strategic Consultant writing an Executive Analysis Report for the "${unit?.name || 'Unit'}" department. 

CONTEXT: ${unit?.description || 'No additional context provided.'}

=== CRITICAL PERFORMANCE DATA ===
- POPULATION CONTEXT: Out of ${totalSurveyPopulation} total survey participants, ${unitRespondentCount || 0} students interacted with this unit.
- UTILIZATION RATE: ${((unitRespondentCount || 0) / (totalSurveyPopulation || 1) * 100).toFixed(1)}%
- QUANTITATIVE METRICS:
${quantPrompt || "No quantitative scores available."}

- QUALITATIVE STATE:
${statsPrompt}
- CATEGORIES: ${categoryPrompt}
- EVIDENCE SAMPLES (VERBATIM): ${JSON.stringify(finalQualitativeData.slice(0, 80).map(s => ({ text: s.segment_text, sentiment: s.sentiment, category: s.category_name })))}

IMPORTANT INTERPRETATION RULES:
1. "Utilization Weighting": A low utilization rate (e.g., < 30%) is a CRITICAL concern for "Reach", but do not let it completely invalidate high satisfaction scores. If satisfaction (3.16/4) is good, report it as a "Key Advantage" (Quality) while flagging utilization as a "Vulnerability" (Reach).
2. "Quant Scales":
   - "Likert (1-4)": 2.5 is average, 3.5+ is excellent.
   - "Binary/Percentage (0-1)": 0.8 is 80% positivity, 0.2 is 20%. 
3. "Evidence": You MUST provide verbatim quotes for every strength and concern. If the text is short, use it as is. NEVER return "N/A" for evidence if text is provided in the EVIDENCE SAMPLES.

YOUR TASK:
Produce a boardroom-quality JSON report.

{
  "executive_summary": "High-level overview. Acknowledge quality of service vs volume of reach.",
  "overall_verdict": "Excellent | Good | Needs Improvement | Critical",
  "strengths": [
    { "title": "...", "detail": "...cite metrics...", "evidence": "verbatim quote from samples" }
  ],
  "concerns": [
    { "title": "...", "detail": "...cite metrics...", "severity": "High|Medium|Low", "evidence": "verbatim quote from samples" }
  ],
  "recommendations": [
    { "title": "...", "action": "...", "impact": "...", "priority": "Immediate|Short-term|Long-term" }
  ],
  "closing_statement": "..."
}

Return ONLY valid JSON. Exactly 3 items per list.`;

    const reportJson = await callGemini(prompt, { jsonMode: true });

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