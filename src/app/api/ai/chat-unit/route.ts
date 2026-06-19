import { handleAIError, getAgentSettings } from "@/lib/ai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";
import { supabaseServer as supabase } from "@/lib/supabase-server";

export const maxDuration = 60;

interface ChatMessage {
    role: "user" | "assistant";
    content: string;
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { unitId, surveyId, history, prompt } = body as {
            unitId: string;
            surveyId?: string;
            history: ChatMessage[];
            prompt: string;
        };

        if (!unitId || !prompt) {
            return NextResponse.json({ error: "Missing unitId or prompt" }, { status: 400 });
        }

        const { modelId, addendum } = await getAgentSettings("chat-unit");
        const uid = parseInt(unitId);
        const sid = surveyId ? parseInt(surveyId) : null;

        const execReportType = surveyId ? `executive_${surveyId}` : 'executive';

        // ── Fetch unit data, exec report, respondents, and global cache in parallel ──
        const [unitRes, reportRes, surveyRespsResult, globalCacheRes] = await Promise.all([
            supabase.from('organization_units').select('name, description').eq('id', unitId).single(),
            supabase.from('unit_ai_reports').select('content').eq('unit_id', unitId).eq('report_type', execReportType).maybeSingle(),
            sid
                ? supabase.from('respondents').select('id').eq('survey_id', sid)
                : Promise.resolve({ data: [] }),
            sid
                ? supabase.from('surveys').select('ai_dataset_cache').eq('id', sid).single()
                : Promise.resolve({ data: null }),
        ]);

        const surveyResps         = (surveyRespsResult as any).data || [];
        const unitName            = unitRes.data?.name || "Unknown Unit";
        const unitDescription     = unitRes.data?.description || "";
        const totalSurveyPopulation = surveyResps.length;
        const executiveReport     = (reportRes as any).data?.content?.report;
        const surveyRespIds       = surveyResps.map((r: any) => r.id);

        // ── Extract unit-specific data from the global enriched cache ─────────────
        const globalCache    = (globalCacheRes as any)?.data?.ai_dataset_cache;
        const cacheUnit      = globalCache?.units?.find((u: any) => u.unit_id === uid);
        const topThemes      = globalCache?.top_themes_per_unit?.[uid] || null;
        const unitRequests   = (globalCache?.suggestion_requests || []).find((u: any) => u.unit_id === uid) || null;
        const crossMentionMe = (globalCache?.cross_unit_mentions || []).find((u: any) => u.unit_id === uid) || null;

        const facultyBreakdownForUnit = (globalCache?.faculties_summary || [])
            .filter((r: any) => r.unit_id === uid)
            .sort((a: any, b: any) => (b.avg_score ?? 0) - (a.avg_score ?? 0));
        const locationBreakdownForUnit = (globalCache?.locations_summary || [])
            .filter((r: any) => r.unit_id === uid)
            .sort((a: any, b: any) => (b.avg_score ?? 0) - (a.avg_score ?? 0));
        const programBreakdownForUnit = (globalCache?.programs_summary || [])
            .filter((r: any) => r.unit_id === uid)
            .sort((a: any, b: any) => (b.avg_score ?? 0) - (a.avg_score ?? 0));
        const npsForUnit = (globalCache?.nps_summary?.per_unit || []).find((u: any) => u.unit_id === uid) || null;
        const npsForUnitByFaculty = (globalCache?.nps_summary?.per_faculty || []).filter((u: any) => u.unit_id === uid);

        // ── Fetch raw feedback inputs ─────────────────────────────────────────────
        const { data: rawInputs } = await supabase
            .from('raw_feedback_inputs')
            .select(`id, raw_text, source_column, respondent_id, numerical_score, score_rule, is_quantitative, respondents(faculty)`)
            .eq('target_unit_id', unitId)
            .in('respondent_id', surveyRespIds);

        const inputIds = (rawInputs || []).map(ri => ri.id);

        // ── Fetch analyzed segments ───────────────────────────────────────────────
        const [segmentsRes, categoriesRes] = await Promise.all([
            supabase.from('feedback_segments').select('segment_text, sentiment, category_id, raw_input_id, is_suggestion').in('raw_input_id', inputIds).limit(200),
            supabase.from('analysis_categories').select('id, name').eq('unit_id', unitId),
        ]);

        const catMap = new Map(((categoriesRes.data as any[]) || []).map(c => [c.id, c.name]));
        const rawInputMap = new Map((rawInputs || []).map(ri => [ri.id, ri]));

        let segmentsView = ((segmentsRes.data as any[]) || []).map(s => {
            const rawRef = rawInputMap.get(s.raw_input_id) as any;
            return {
                segment_text: s.segment_text,
                sentiment: s.sentiment,
                category_name: catMap.get(s.category_id) || "General",
                is_suggestion: s.is_suggestion,
                faculty: rawRef?.respondents?.faculty || "Unknown Faculty",
            };
        });

        if (segmentsView.length === 0) {
            segmentsView = (rawInputs || []).filter(ri => !ri.is_quantitative && ri.raw_text?.length > 5).map(f => ({
                segment_text: f.raw_text as string,
                sentiment: "Neutral",
                category_name: f.source_column,
                is_suggestion: false,
                faculty: (f as any).respondents?.faculty || "Unknown Faculty",
            })).slice(0, 100);
        }

        const sentimentCounts = segmentsView.reduce((acc: any, s) => {
            acc[s.sentiment] = (acc[s.sentiment] || 0) + 1;
            return acc;
        }, { Positive: 0, Negative: 0, Neutral: 0 });

        // ── Quant stats ───────────────────────────────────────────────────────────
        const quantStats = (rawInputs || [])
            .filter(ri => ri.is_quantitative && ri.numerical_score !== null && (ri as any).score_rule !== 'NPS_0_10')
            .reduce((acc: any, q) => {
                if (!acc[q.source_column]) acc[q.source_column] = { sum: 0, count: 0, max: 0 };
                acc[q.source_column].sum += q.numerical_score as number;
                acc[q.source_column].count++;
                if ((q.numerical_score as number) > acc[q.source_column].max) acc[q.source_column].max = q.numerical_score as number;
                return acc;
            }, {} as Record<string, { sum: number; count: number; max: number }>);

        const quantPrompt = Object.entries(quantStats).map(([col, data]: [string, any]) => {
            const avg = (data.sum / data.count).toFixed(2);
            const scaleType = data.max <= 1 ? "Binary/Percentage (0–1)" : "Likert (1–4)";
            // Add distribution if available from cache
            const distEntry = cacheUnit?.score_distributions?.find((d: any) => d.column === col);
            const distStr = distEntry
                ? ` | Distribution: ${Object.entries(distEntry.distribution).sort(([a],[b])=>Number(a)-Number(b)).map(([score,n])=>`${score}★×${n}`).join(', ')} | ${distEntry.pct_above_midpoint}% above midpoint`
                : '';
            return `  • ${col}: avg ${avg} (n=${data.count}) [${scaleType}]${distStr}`;
        }).join('\n') || "  None.";

        // ── NPS stats ─────────────────────────────────────────────────────────────
        const npsStats = (rawInputs || [])
            .filter(ri => (ri as any).score_rule === 'NPS_0_10' && ri.numerical_score !== null)
            .reduce((acc: Record<string, any>, q) => {
                if (!acc[q.source_column]) acc[q.source_column] = { detractor: 0, passive: 0, promoter: 0, total: 0 };
                const s = Number(q.numerical_score);
                const bucket = s <= 6 ? 'detractor' : s <= 8 ? 'passive' : 'promoter';
                acc[q.source_column][bucket]++;
                acc[q.source_column].total++;
                return acc;
            }, {});
        const npsPrompt = Object.entries(npsStats).map(([col, b]: [string, any]) => {
            const nps = Math.round((b.promoter / b.total) * 100 - (b.detractor / b.total) * 100);
            return `  • ${col}: NPS ${nps > 0 ? '+' : ''}${nps} (${b.promoter} promoters / ${b.passive} passives / ${b.detractor} detractors, n=${b.total})`;
        }).join('\n') || "  None.";

        if (segmentsView.length === 0 && Object.keys(quantStats).length === 0) {
            return NextResponse.json({ error: "Insufficient Data: No feedback found for this unit." }, { status: 400 });
        }

        const unitUniqueResps = new Set((rawInputs || []).map(ri => ri.respondent_id));
        const unitRespondentCount = unitUniqueResps.size;

        // ── Build enrichment blocks from global cache ─────────────────────────────
        const topThemesBlock = topThemes?.themes?.length > 0 ? `
PRE-AGGREGATED TOPIC BREAKDOWN (all ${cacheUnit?.total_segments || '?'} segments, not just the 200-sample):
${topThemes.themes.map((t: any) => {
    const lines = [`  • ${t.category}: ${t.total} total (${t.positive_pct}% pos, ${Math.round(t.negative/t.total*100)}% neg)`];
    t.top_negative_quotes?.forEach((q: string) => lines.push(`    ✗ "${q}"`));
    t.top_positive_quotes?.forEach((q: string) => lines.push(`    ✓ "${q}"`));
    return lines.join('\n');
}).join('\n')}` : '';

        const requestsBlock = unitRequests?.requests?.length > 0 ? `
STUDENT IMPROVEMENT REQUESTS (explicitly asked for by students — most requested first):
${unitRequests.requests.map((r: any) => `  [${r.count}×] ${r.text.slice(0, 120)}`).join('\n')}` : '';

        const crossMentionBlock = crossMentionMe ? `
CROSS-UNIT MENTION SIGNAL: ${unitName} is mentioned ${crossMentionMe.total_mentions} times in OTHER units' feedback
  (${crossMentionMe.positive_count} pos / ${crossMentionMe.negative_count} neg / ${crossMentionMe.neutral_count} neu)
  Mentioned by students from: ${(crossMentionMe.source_units_breakdown || []).slice(0, 4).map((s: any) => s.source_unit_short_name || s.source_unit_name).join(', ')}
  → High negative cross-mentions mean this unit creates friction for students using other services.` : '';

        const facultyBreakdownBlock = facultyBreakdownForUnit.length > 0 ? `
FACULTY BREAKDOWN FOR THIS UNIT (avg Likert score per faculty group):
${facultyBreakdownForUnit.map((r: any) =>
    `  ${r.faculty}: ${r.avg_score ?? 'N/A'} (n=${r.count})`
).join('\n')}` : '';

        const locationProgramBlock = [
            locationBreakdownForUnit.length > 0
                ? `LOCATION BREAKDOWN:\n${locationBreakdownForUnit.map((r: any) => `  ${r.location}: ${r.avg_score ?? 'N/A'} (n=${r.count})`).join('\n')}`
                : '',
            programBreakdownForUnit.length > 0
                ? `STUDY PROGRAM BREAKDOWN (top programs by gap):\n${programBreakdownForUnit.slice(0, 15).map((r: any) => `  ${r.program}: ${r.avg_score ?? 'N/A'} (n=${r.count})`).join('\n')}`
                : '',
        ].filter(Boolean).join('\n\n');

        const globalNpsBlock = npsForUnit ? `
NPS FROM GLOBAL CACHE: NPS ${npsForUnit.nps_score > 0 ? '+' : ''}${npsForUnit.nps_score} | Promoters ${npsForUnit.promoters} | Passives ${npsForUnit.passives} | Detractors ${npsForUnit.detractors}${
    npsForUnitByFaculty.length > 0
        ? `\nNPS by Faculty: ${npsForUnitByFaculty.map((f: any) => `${f.faculty} NPS ${f.nps_score > 0 ? '+' : ''}${f.nps_score}`).join(' | ')}`
        : ''
}` : '';

        const conversationHistory = (history || []).map(m =>
            `${m.role === 'user' ? 'USER' : 'AI'}: ${m.content}`
        ).join('\n\n');

        // ── Sentiment score from full dataset (cache) ─────────────────────────────
        const fullPos   = cacheUnit?.positive ?? null;
        const fullNeu   = cacheUnit?.neutral ?? null;
        const fullNeg   = cacheUnit?.negative ?? null;
        const fullTotal = cacheUnit?.total_segments ?? null;
        const unitSentimentScore = fullTotal != null && fullTotal > 0
            ? Math.round(((fullPos ?? 0) + 0.5 * (fullNeu ?? 0)) / fullTotal * 100)
            : null;

        // ── System prompt ─────────────────────────────────────────────────────────
        const systemPrompt = `You are an objective Data Intelligence Engine analyzing feedback for "${unitName}" — a university service unit.
CONTEXT: ${unitDescription}

━━ POPULATION & REACH ━━
Survey total: ${totalSurveyPopulation} respondents | This unit reached: ${unitRespondentCount} (${((unitRespondentCount / (totalSurveyPopulation || 1)) * 100).toFixed(1)}%)
Full dataset segments: ${fullTotal ?? '?'} total (${fullPos ?? '?'} pos / ${fullNeu ?? '?'} neu / ${fullNeg ?? '?'} neg)
Sentiment Score (full dataset): ${unitSentimentScore !== null ? `${unitSentimentScore}/100` : 'N/A'} — ${unitSentimentScore !== null ? (unitSentimentScore >= 70 ? 'Excellent' : unitSentimentScore >= 40 ? 'Moderate' : 'Needs Focus') : ''}
Qualitative sample (200 max): ${sentimentCounts.Positive} Positive, ${sentimentCounts.Negative} Negative, ${sentimentCounts.Neutral} Neutral

━━ QUANTITATIVE SCORES ━━
(Likert 1–4 thresholds: ≥3.20 Strong | ≥3.00 Fair | <3.00 Needs Attention | <2.50 Critical)
${quantPrompt}

━━ NPS (NET PROMOTER SCORE) ━━
(NPS −100 to +100: ≥50 excellent | >0 healthy | <0 urgent · Formula: %Promoters [9–10] − %Detractors [0–6]; Passives [7–8] not counted)
${npsPrompt}
${globalNpsBlock}
${topThemesBlock}
${facultyBreakdownBlock}
${locationProgramBlock}
${crossMentionBlock}
${requestsBlock}

━━ STRATEGIC OVERVIEW (Executive Report) ━━
${executiveReport
    ? `Summary: ${executiveReport.executive_summary}\nVerdict: ${executiveReport.overall_verdict}\nStrengths: ${executiveReport.strengths?.map((s: any) => s.title).join(', ')}\nConcerns: ${executiveReport.concerns?.map((c: any) => c.title).join(', ')}`
    : "No strategic overview generated yet."}

━━ SEGMENT SAMPLE (200 max — use for verbatim quotes and faculty attribution) ━━
${JSON.stringify(segmentsView.slice(0, 80))}

CONVERSATION HISTORY:
${conversationHistory}

USER: ${prompt}

━━ FORMULA REFERENCE (use these to answer "how is X calculated?" questions) ━━
Sentiment Score (0–100)  = (positive_segments + 0.5 × neutral_segments) / total_segments × 100
  Benchmarks: ≥70 Excellent · 40–69 Moderate · <40 Needs Focus
  Macro average = mean of individual unit scores, each unit weighted equally (not pooled across all units)
NPS (−100 to +100)       = % Promoters (score 9–10) − % Detractors (score 0–6) · Passives (7–8) ignored
  Benchmarks: ≥50 Excellent · 0–49 Good · <0 Concern
Likert SSI (1–4)         : ≥3.20 Strong · ≥3.00 Fair · <3.00 Needs Attention · <2.50 Critical
Binary scale (0–1)       : value = % of students who answered positively (e.g. 0.82 = 82% positive)

━━ FORMATTING RULES ━━
1. OPENING: On the very first message (empty conversation history), open with a short impressive greeting — one confident sentence that signals you have this unit's data loaded and you're ready to dig in. On all subsequent messages, skip the greeting and go straight to the insight.
1a. RESPONSE LENGTH & LANGUAGE: Read the conversation. Match your depth and length to what the question actually needs — a simple lookup deserves a short answer, a deep-dive deserves a full one. Respond in whatever language the user writes in.
2. Wrap every thematic finding in <box title="Title">content</box>.
3. For score distributions: describe the SHAPE (bimodal, skewed low, clustered at top) not just the average.
4. For faculty/program breakdowns: name the outlier groups explicitly with their scores.
5. For improvement requests: frame as institutional action items.
6. For cross-unit mentions: explain the service dependency implications.
7. Quote verbatim evidence from the segment sample. Never invent numbers.
8. Distinguish Likert (1–4) from Binary (0–1) from NPS (−100 to +100) — never blend scales.

Response:`;

        const finalPrompt = systemPrompt + (addendum ? `\n\n---\nOWNER INSTRUCTIONS:\n${addendum}` : "");
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) return NextResponse.json({ error: "GEMINI_API_KEY not configured." }, { status: 500 });

        const genAI = new GoogleGenerativeAI(apiKey);
        const geminiModel = genAI.getGenerativeModel({ model: modelId });
        const streamResult = await geminiModel.generateContentStream({
            contents: [{ role: "user", parts: [{ text: finalPrompt }] }],
        });

        const enc = new TextEncoder();
        const readable = new ReadableStream<Uint8Array>({
            async start(controller) {
                try {
                    for await (const chunk of streamResult.stream) {
                        const text = chunk.text();
                        controller.enqueue(enc.encode(`data: ${JSON.stringify({ text })}\n\n`));
                    }
                    controller.enqueue(enc.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
                } catch (e: any) {
                    controller.enqueue(enc.encode(`data: ${JSON.stringify({ error: e.message || 'Stream error' })}\n\n`));
                } finally {
                    controller.close();
                }
            }
        });

        return new Response(readable, {
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
            }
        });

    } catch (error) {
        return handleAIError(error);
    }
}
