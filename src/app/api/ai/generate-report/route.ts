import { callGemini, handleAIError, getAgentSettings } from "@/lib/ai";
import { NextResponse } from "next/server";
import { supabaseServer as supabase } from "@/lib/supabase-server";

export async function POST(req: Request) {
  try {
    const { unitId, surveyId, customInstructions } = await req.json();

    if (!unitId) {
      return NextResponse.json({ error: "unitId is required" }, { status: 400 });
    }

    const { modelId, addendum } = await getAgentSettings("generate-report");

    // 1. Fetch Basic Context (Unit, Survey Population)
    const [unitRes, respRes] = await Promise.all([
      supabase.from('organization_units').select('name, description').eq('id', unitId).single(),
      supabase.from('respondents').select('id', { count: 'exact', head: true }).eq('survey_id', surveyId)
    ]);

    const unit = unitRes.data;
    const totalSurveyPopulation = respRes.count || 0;

    // 2. Fetch ALL respondent IDs for this survey (paginated — Supabase caps at 1000/request)
    const PAGE_SIZE = 1000;
    const CHUNK = 500;
    let surveyRespIds: number[] = [];
    for (let page = 0; ; page++) {
      const { data: pageData } = await supabase
        .from('respondents').select('id').eq('survey_id', surveyId)
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
      if (!pageData || pageData.length === 0) break;
      surveyRespIds.push(...pageData.map((r: any) => r.id));
      if (pageData.length < PAGE_SIZE) break;
    }

    // Fetch raw inputs in chunks — qualitative only to exclude Likert score rows
    const rawInputs: any[] = [];
    for (let i = 0; i < surveyRespIds.length; i += CHUNK) {
      const { data } = await supabase
        .from('raw_feedback_inputs')
        .select('id, raw_text, source_column, respondent_id')
        .eq('target_unit_id', unitId)
        .eq('is_quantitative', false)
        .in('respondent_id', surveyRespIds.slice(i, i + CHUNK));
      if (data) rawInputs.push(...data);
    }

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

    // FALLBACK: If no analyzed segments, get raw qualitative feedback (verbatim).
    // Exclude rows whose raw_text looks like a Likert answer option ("N = Label")
    // since those are quantitative scale labels, not student-written comments.
    const likertLabelPattern = /^\d+\s*=\s*.+$/;
    if (finalQualitativeData.length === 0) {
      finalQualitativeData = (rawInputs || [])
        .filter(ri => ri.raw_text && ri.raw_text.length > 10 && !likertLabelPattern.test(ri.raw_text.trim()))
        .map(f => ({
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

    // 3. Fetch Quantitative Scores with SCALE AWARENESS & Isolation (chunked)
    // NPS (0–10) is fetched separately so it can be presented to the AI as a distinct metric
    // rather than mixed into Likert averages.
    const quantData: any[] = [];
    const npsData: any[] = [];
    for (let i = 0; i < surveyRespIds.length; i += CHUNK) {
      const { data } = await supabase
        .from('raw_feedback_inputs')
        .select('source_column, numerical_score, score_rule, respondent_id')
        .eq('target_unit_id', unitId)
        .eq('is_quantitative', true)
        .in('respondent_id', surveyRespIds.slice(i, i + CHUNK))
        .not('numerical_score', 'is', null);
      if (data) {
        for (const row of data) {
          if (row.score_rule === 'NPS_0_10') npsData.push(row);
          else quantData.push(row);
        }
      }
    }

    const quantStats = (quantData || []).reduce((acc: any, q) => {
      if (!acc[q.source_column]) acc[q.source_column] = { sum: 0, count: 0, max: 0 };
      acc[q.source_column].sum += q.numerical_score as number;
      acc[q.source_column].count++;
      if (q.numerical_score as number > acc[q.source_column].max) acc[q.source_column].max = q.numerical_score as number;
      return acc;
    }, {} as Record<string, { sum: number, count: number, max: number }>);

    const unitUniqueResps = new Set([...(quantData || []), ...npsData].map(q => q.respondent_id));
    (rawInputs || []).forEach(ri => unitUniqueResps.add(ri.respondent_id));
    const unitRespondentCount = unitUniqueResps.size;

    const quantPrompt = Object.entries(quantStats).map(([col, data]: [string, any]) => {
      const avg = (data.sum / data.count).toFixed(2);
      const scaleType = data.max <= 1 ? "Binary/Percentage (0-1)" : "Likert Scale (1-4)";
      return `• ${col}: ${avg} avg (${data.count} responses) [Scale: ${scaleType}]`;
    }).join('\n');

    // NPS summary: bucket into detractors (0–6), passives (7–8), promoters (9–10), then % promoters − % detractors.
    const npsStats = npsData.reduce((acc: Record<string, { detractor: number; passive: number; promoter: number; total: number }>, q) => {
      if (!acc[q.source_column]) acc[q.source_column] = { detractor: 0, passive: 0, promoter: 0, total: 0 };
      const s = Number(q.numerical_score);
      const bucket = s <= 6 ? 'detractor' : s <= 8 ? 'passive' : 'promoter';
      acc[q.source_column][bucket]++;
      acc[q.source_column].total++;
      return acc;
    }, {});
    const npsPrompt = Object.entries(npsStats).map(([col, b]) => {
      const pPct = (b.promoter / b.total) * 100;
      const dPct = (b.detractor / b.total) * 100;
      const nps = Math.round(pPct - dPct);
      return `• ${col}: NPS = ${nps} (${b.promoter} promoters, ${b.passive} passives, ${b.detractor} detractors, n=${b.total}) [Scale: NPS 0–10]`;
    }).join('\n') || "None.";

    // 3.5. EMPTY STATE EARLY RETURN
    if (finalQualitativeData.length === 0 && Object.keys(quantStats).length === 0) {
      return NextResponse.json({ error: "Insufficient Data: No feedback found for this unit to analyze." }, { status: 400 });
    }

    const statsPrompt = `Unit Respondents: ${unitRespondentCount || 0} unique students out of ${totalSurveyPopulation} total survey participants.
Qualitative Data: ${finalQualitativeData.length} items provided. Sentiment Distribution: ${sentimentCounts.Positive} Positive, ${sentimentCounts.Negative} Negative, ${sentimentCounts.Neutral} Neutral.`;

    const categoryPrompt = Object.entries(categories).map(([name, count]) => `${name} (${count})`).join(', ');

    // 4. Cross-unit signals — prefer rich unit_cross_signals_cache, fall back to live computation
    let outgoingPrompt = "None detected.";
    let incomingPrompt = "Not yet computed — rebuild cache to populate.";

    const { data: crossCache } = await supabase
      .from('unit_cross_signals_cache')
      .select('outgoing_segments, incoming_segments, outgoing_by_target, incoming_by_source')
      .eq('survey_id', surveyId)
      .eq('unit_id', unitId)
      .maybeSingle();

    if (crossCache) {
      const outByTarget = (crossCache.outgoing_by_target as any[]) || [];
      const inBySource  = (crossCache.incoming_by_source  as any[]) || [];
      const outSegs     = (crossCache.outgoing_segments    as any[]) || [];
      const inSegs      = (crossCache.incoming_segments    as any[]) || [];

      if (outByTarget.length > 0) {
        const breakdown = outByTarget.slice(0, 8)
          .map((u: any) => `• ${u.unit_name}: ${u.total} mentions (${u.positive} pos, ${u.negative} neg, ${u.neutral} neu)`)
          .join('\n');
        const samples = outSegs.slice(0, 8)
          .map((s: any) => `  [${s.sentiment}] → ${s.tagged_units}: "${s.segment_text}"`)
          .join('\n');
        outgoingPrompt = `${breakdown}\nSample comments:\n${samples}`;
      }

      if (inBySource.length > 0) {
        const breakdown = inBySource.slice(0, 8)
          .map((u: any) => `• ${u.unit_name}: ${u.total} mentions (${u.positive} pos, ${u.negative} neg, ${u.neutral} neu)`)
          .join('\n');
        const samples = inSegs.slice(0, 8)
          .map((s: any) => `  [${s.sentiment}] from ${s.source_unit_name}: "${s.segment_text}"`)
          .join('\n');
        incomingPrompt = `${breakdown}\nSample comments:\n${samples}`;
      } else {
        incomingPrompt = "No incoming signals detected from other units.";
      }
    } else {
      // Fall back to live computation for outgoing
      const outgoingSegs: any[] = [];
      for (let i = 0; i < inputIds.length; i += CHUNK) {
        const { data } = await supabase
          .from('feedback_segments')
          .select('related_unit_ids, sentiment')
          .in('raw_input_id', inputIds.slice(i, i + CHUNK))
          .not('related_unit_ids', 'is', null);
        if (data) outgoingSegs.push(...data);
      }

      const outgoingUnitCounts = new Map<number, { total: number; positive: number; negative: number; neutral: number }>();
      for (const seg of outgoingSegs) {
        if (!Array.isArray(seg.related_unit_ids)) continue;
        for (const rid of seg.related_unit_ids) {
          if (rid === parseInt(unitId)) continue;
          if (!outgoingUnitCounts.has(rid)) outgoingUnitCounts.set(rid, { total: 0, positive: 0, negative: 0, neutral: 0 });
          const e = outgoingUnitCounts.get(rid)!;
          e.total++;
          if (seg.sentiment === 'Positive') e.positive++;
          else if (seg.sentiment === 'Negative') e.negative++;
          else e.neutral++;
        }
      }

      if (outgoingUnitCounts.size > 0) {
        const unitIds = [...outgoingUnitCounts.keys()];
        const { data: outNames } = await supabase.from('organization_units').select('id, name').in('id', unitIds);
        const outNameMap = new Map((outNames || []).map((u: any) => [u.id, u.name]));
        outgoingPrompt = [...outgoingUnitCounts.entries()]
          .sort((a, b) => b[1].total - a[1].total)
          .map(([id, c]) => `• ${outNameMap.get(id) || `Unit ${id}`}: ${c.total} mentions (${c.positive} pos, ${c.negative} neg, ${c.neutral} neu)`)
          .join('\n');
      }

      // Incoming from older aggregate cache
      const { data: cachedIncoming } = await supabase
        .from('survey_cross_mentions_cache')
        .select('total_mentions, source_unit_count, positive_count, negative_count, neutral_count, source_units_breakdown')
        .eq('survey_id', surveyId)
        .eq('mentioned_unit_id', unitId)
        .maybeSingle();

      if (cachedIncoming && cachedIncoming.total_mentions > 0) {
        const topSources = ((cachedIncoming.source_units_breakdown as any[]) || []).slice(0, 5)
          .map((s: any) => `• ${s.source_unit_name}: ${s.total} mentions (${s.positive} positive, ${s.negative} negative)`)
          .join('\n');
        incomingPrompt = `${cachedIncoming.total_mentions} total mentions from ${cachedIncoming.source_unit_count} other units (${cachedIncoming.positive_count} positive, ${cachedIncoming.negative_count} negative, ${cachedIncoming.neutral_count} neutral).\nTop sources:\n${topSources}`;
      }
    }

    // 4. RESTORE OBJECTIVE DATA INTELLIGENCE ENGINE PROMPT WITH ENHANCED CONTEXT & WEIGHTING
    const prompt = `You are an objective Data Intelligence Engine tasked with writing an Executive Analysis Report for the "${unit?.name || 'Unit'}" department. 

CONTEXT: ${unit?.description || 'No additional context provided.'}

=== CRITICAL PERFORMANCE DATA ===
- POPULATION CONTEXT: Out of ${totalSurveyPopulation} total survey participants, ${unitRespondentCount || 0} students interacted with this unit.
- UTILIZATION RATE: ${((unitRespondentCount || 0) / (totalSurveyPopulation || 1) * 100).toFixed(1)}%
- QUANTITATIVE METRICS:
${quantPrompt || "No quantitative scores available."}

- NPS (NET PROMOTER SCORE) METRICS:
${npsPrompt}

- QUALITATIVE STATE:
${statsPrompt}
- CATEGORIES: ${categoryPrompt}
- EVIDENCE SAMPLES (VERBATIM): ${JSON.stringify(finalQualitativeData.slice(0, 80).map(s => ({ text: s.segment_text, sentiment: s.sentiment, category: s.category_name })))}

=== CROSS-UNIT SIGNALS ===
OUTGOING — students processed by this unit whose feedback mentions other departments:
${outgoingPrompt}

INCOMING — students from other units who reference this unit in their feedback:
${incomingPrompt}

IMPORTANT INTERPRETATION RULES:
1. "Utilization Weighting": A low utilization rate (e.g., < 30%) is a CRITICAL concern for "Reach", but do not let it completely invalidate high satisfaction scores. If satisfaction scores are high, report them as a "Key Advantage" (Quality) while flagging utilization as a "Vulnerability" (Reach). Always use the actual scores from QUANTITATIVE METRICS above — never invent or assume numbers.
2. "Quant Scales":
   - "Likert (1-4)": 2.5 is average, 3.5+ is excellent.
   - "Binary/Percentage (0-1)": 0.8 is 80% positivity, 0.2 is 20%.
   - "NPS 0–10": NPS ranges from −100 to +100. ≥50 is excellent, 0–49 is good, below 0 is a concern. Treat NPS as a standalone loyalty metric — never average it with Likert scores.
3. "Evidence": You MUST provide verbatim quotes for every strength and concern. Quotes must be actual student-written sentences from EVIDENCE SAMPLES. NEVER return "N/A" for evidence if text is provided. NEVER use Likert answer labels (e.g., "4 = Sangat Setuju", "3 = Setuju") as evidence — those are scale labels, not student comments.
4. "Comment Count ≠ Utilization": The number of qualitative comments (${finalQualitativeData.length}) reflects how many students wrote open-ended text — NOT how many students used this unit. Do NOT interpret a low comment count as low service utilization. Use UTILIZATION RATE (${((unitRespondentCount || 0) / (totalSurveyPopulation || 1) * 100).toFixed(1)}%) for reach/access conclusions instead.

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

    const finalPrompt = prompt
      + (customInstructions ? `\n\n---\nANALYST CONTEXT (provided by report owner — follow these directives):\n${customInstructions}` : "")
      + (addendum ? `\n\n---\nOWNER INSTRUCTIONS:\n${addendum}` : "");

    let parsed;
    let retries = 0;
    const maxRetries = 2;

    while (retries <= maxRetries) {
      const reportJson = await callGemini(finalPrompt, { jsonMode: true, model: modelId, functionId: retries === 0 ? "generate-report" : undefined });
      try {
        parsed = typeof reportJson === 'string' ? JSON.parse(reportJson) : reportJson;
        // Verify it didn't hallucinate an empty object
        if (parsed && parsed.executive_summary) {
          break; // Success
        } else {
          throw new Error("Missing required JSON fields");
        }
      } catch (err) {
        retries++;
        if (retries > maxRetries) {
          return NextResponse.json({ error: 'AI returned invalid JSON after multiple attempts' }, { status: 500 });
        }
      }
    }

    return NextResponse.json({ report: parsed });

  } catch (error) {
    return handleAIError(error);
  }
}