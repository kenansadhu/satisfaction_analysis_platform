import { handleAIError, wrapUserData, getAgentSettings } from "@/lib/ai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";
import { supabaseServer as supabase } from "@/lib/supabase-server";

export const maxDuration = 60;

interface ChatMessage {
    role: "user" | "assistant";
    content: string;
    chart?: any;
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { messages, surveyId, existingChart } = body as {
            messages: ChatMessage[];
            surveyId?: string;
            existingChart?: any;
        };

        if (!messages || messages.length === 0) {
            return NextResponse.json({ error: "No messages provided" }, { status: 400 });
        }

        const { modelId, addendum } = await getAgentSettings("chat-analyst");

        // ── 1. Load cached dataset ────────────────────────────────────────────────
        let globalDataset: any[] = [];
        let availableKeys = new Set<string>([
            'unit_name', 'unit_short_name', 'total_segments',
            'positive', 'neutral', 'negative', 'score', 'respondent_reach',
        ]);

        let surveyContext: any         = null;
        let columnSchema: any[]        = [];
        let facultiesSummary: any[]    = [];
        let locationsSummary: any[]    = [];
        let programsSummary: any[]     = [];
        let npsSummary: any            = null;
        let crossUnitMentions: any[]   = [];
        let topThemesPerUnit: any      = {};
        let suggestionRequests: any[]  = [];
        let suggestions: any[]         = [];

        if (!surveyId) {
            return NextResponse.json({ error: "No survey selected." }, { status: 400 });
        }

        const { data: surveyData, error: sErr } = await supabase
            .from('surveys')
            .select('ai_dataset_cache')
            .eq('id', parseInt(surveyId, 10))
            .single();

        if (sErr) throw new Error("Failed to load survey cache: " + sErr.message);

        const raw = (surveyData as any)?.ai_dataset_cache;
        if (!raw) {
            return NextResponse.json({ error: "AI Context not built. Please build it in Survey Settings." }, { status: 400 });
        }

        if (Array.isArray(raw)) {
            // v1 legacy
            globalDataset = raw;
        } else {
            // v2 or v3
            globalDataset       = raw.units || [];
            surveyContext       = raw.survey_context    || null;
            columnSchema        = raw.column_schema     || [];
            facultiesSummary    = raw.faculties_summary || [];
            locationsSummary    = raw.locations_summary || [];
            programsSummary     = raw.programs_summary  || [];
            npsSummary          = raw.nps_summary       || null;
            crossUnitMentions   = raw.cross_unit_mentions   || [];
            topThemesPerUnit    = raw.top_themes_per_unit   || {};
            suggestionRequests  = raw.suggestion_requests   || [];
            suggestions         = raw.suggestions           || [];
        }

        // ── Pre-compute derived fields so the AI can chart calculations ────────────
        globalDataset = globalDataset.map((u: any) => {
            const pos = u.positive ?? 0;
            const neg = u.negative ?? 0;
            const total = u.total_segments ?? (pos + neg + (u.neutral ?? 0));
            const positive_pct   = total > 0 ? Math.round(pos / total * 100) : null;
            const negative_pct   = total > 0 ? Math.round(neg / total * 100) : null;
            const sentiment_score = positive_pct;
            const norm_score     = u.score != null ? Math.round((u.score - 1) / 3 * 100) : null;
            const disparity_gap  = norm_score != null && sentiment_score != null ? norm_score - sentiment_score : null;
            return { ...u, positive_pct, negative_pct, sentiment_score, norm_score, disparity_gap };
        });

        if (globalDataset.length > 0) {
            Object.keys(globalDataset[0]).forEach(k => {
                if (k.startsWith('category_') || k.startsWith('likert_') || k.startsWith('binary_')) availableKeys.add(k);
            });
            ['positive_pct', 'negative_pct', 'sentiment_score', 'norm_score', 'disparity_gap'].forEach(k => availableKeys.add(k));
        }

        console.log(`[chat-analyst] v${raw?.v || 1} | ${globalDataset.length} units | cols: ${columnSchema.length} | facs: ${facultiesSummary.length} | themes: ${Object.keys(topThemesPerUnit).length}`);

        // ── 2. Build conversation history ─────────────────────────────────────────
        const conversationHistory = messages.map(m => {
            if (m.role === "user") return `USER: ${m.content}`;
            if (m.chart) return `ASSISTANT: ${m.content}\n[CHART_CONFIG: ${JSON.stringify(m.chart)}]`;
            return `ASSISTANT: ${m.content}`;
        }).join("\n\n");

        // ── 3. Build all context blocks ───────────────────────────────────────────

        const surveyContextBlock = surveyContext ? (() => {
            const demo = surveyContext.respondent_demographics;
            const demoLines = demo ? [
                demo.by_faculty  && Object.keys(demo.by_faculty).length  ? `  By Faculty:   ${Object.entries(demo.by_faculty).sort(([,a],[,b])=>(b as number)-(a as number)).slice(0,8).map(([k,v])=>`${k} (${v})`).join(' | ')}` : '',
                demo.by_location && Object.keys(demo.by_location).length ? `  By Location:  ${Object.entries(demo.by_location).sort(([,a],[,b])=>(b as number)-(a as number)).slice(0,6).map(([k,v])=>`${k} (${v})`).join(' | ')}` : '',
                demo.by_program  && Object.keys(demo.by_program).length  ? `  By Program:   ${Object.entries(demo.by_program).sort(([,a],[,b])=>(b as number)-(a as number)).slice(0,8).map(([k,v])=>`${k} (${v})`).join(' | ')}` : '',
            ].filter(Boolean).join('\n') : '';
            return `
SURVEY: ${surveyContext.survey_name}
Total respondents: ${surveyContext.respondent_count.toLocaleString()} | Faculties: ${surveyContext.faculties.length} | Programs: ${surveyContext.programs.length} | Locations: ${surveyContext.locations.length}
${demoLines ? `RESPONDENT DISTRIBUTION (use to flag over-representation or demographic bias):\n${demoLines}` : ''}`;
        })() : '';

        const columnDictBlock = columnSchema.length > 0 ? `
COLUMN DICTIONARY — data key → original survey question → unit → scale:
${columnSchema.map(c =>
    `  ${c.key} | "${c.question}" | ${c.unit_name} | scale: ${c.scale}${c.raw_options?.length > 0 ? ` | options: ${c.raw_options.join(' / ')}` : ''}`
).join('\n')}` : '';

        const facultiesBlock = facultiesSummary.length > 0 ? `
FACULTY BREAKDOWN — avg Likert score per faculty × unit (cite exact avg_score and count):
${JSON.stringify(facultiesSummary)}` : '';

        const locationsBlock = locationsSummary.length > 0 ? `
LOCATION BREAKDOWN — avg Likert score per campus/location × unit:
${JSON.stringify(locationsSummary)}` : '';

        const programsBlock = programsSummary.length > 0 ? `
PROGRAM BREAKDOWN — avg Likert score per study program × unit (top entries):
${JSON.stringify(programsSummary.slice(0, 120))}${programsSummary.length > 120 ? `\n  ... (${programsSummary.length - 120} more entries)` : ''}` : '';

        const npsBlock = npsSummary?.per_unit?.length > 0 ? `
NPS DATA — Net Promoter Score per unit (−100 to +100; >0 healthy, >50 excellent):
${npsSummary.per_unit.map((u: any) =>
    `  ${u.unit_short_name || u.unit_name}: NPS ${u.nps_score} | Promoters ${u.promoters} | Passives ${u.passives} | Detractors ${u.detractors} | Total ${u.total}`
).join('\n')}` : '';

        const crossMentionsBlock = crossUnitMentions.length > 0 ? `
CROSS-UNIT MENTIONS — units cited in other units' student feedback (institutional friction signals):
${crossUnitMentions.slice(0, 15).map((u: any) => {
    const src = (u.source_units_breakdown || []).slice(0, 3).map((s: any) => s.source_unit_short_name || s.source_unit_name).join(', ');
    return `  ${u.unit_short_name || u.unit_name}: ${u.total_mentions} mentions (${u.positive_count} pos / ${u.negative_count} neg)${src ? ` — cited by: ${src}` : ''}`;
}).join('\n')}
Note: High negative cross-mentions = this unit causes friction for students seeking other services.` : '';

        // Top themes per unit — pre-aggregated, token-efficient, with real quotes
        const themesBlock = Object.keys(topThemesPerUnit).length > 0 ? `
TOP THEMES & STUDENT VOICES PER UNIT (category breakdowns with verbatim evidence):
${globalDataset.slice(0, 20).map((u: any) => {
    const entry = topThemesPerUnit[u.unit_id];
    if (!entry?.themes?.length) return null;
    const themeLines = entry.themes.slice(0, 4).map((t: any) => {
        const lines = [`    • ${t.category}: ${t.total} segments (${t.positive_pct}% pos, ${Math.round(t.negative/t.total*100)}% neg)`];
        t.top_negative_quotes?.forEach((q: string) => lines.push(`      ✗ "${q}"`));
        t.top_positive_quotes?.forEach((q: string) => lines.push(`      ✓ "${q}"`));
        return lines.join('\n');
    }).join('\n');
    return `  Unit: ${u.unit_short_name || u.unit_name} (reach: ${u.respondent_reach} respondents)\n${themeLines}`;
}).filter(Boolean).join('\n\n')}` : (() => {
    // Fallback: sample quotes from raw suggestions if top_themes not built yet
    const unitQuoteMap: Record<number, { neg: string[]; pos: string[] }> = {};
    for (const s of suggestions) {
        const uid = s.unit?.id;
        if (!uid || !s.text) continue;
        if (!unitQuoteMap[uid]) unitQuoteMap[uid] = { neg: [], pos: [] };
        if (s.sentiment === 'Negative' && unitQuoteMap[uid].neg.length < 4)
            unitQuoteMap[uid].neg.push(s.text.slice(0, 150));
        else if (s.sentiment === 'Positive' && unitQuoteMap[uid].pos.length < 2)
            unitQuoteMap[uid].pos.push(s.text.slice(0, 150));
    }
    const lines = globalDataset.slice(0, 20).map((u: any) => {
        const q = unitQuoteMap[u.unit_id];
        if (!q || (q.neg.length === 0 && q.pos.length === 0)) return null;
        return `  Unit: ${u.unit_short_name || u.unit_name}\n${[
            ...q.neg.map((t: string) => `    ✗ "${t}"`),
            ...q.pos.map((t: string) => `    ✓ "${t}"`),
        ].join('\n')}`;
    }).filter(Boolean);
    return lines.length > 0 ? `\nSAMPLE STUDENT VOICES (verbatim):\n${lines.join('\n\n')}` : '';
})();

        const suggestionsBlock = suggestionRequests.length > 0 ? `
STUDENT IMPROVEMENT REQUESTS PER UNIT (aggregated from student suggestions — most requested first):
${suggestionRequests.slice(0, 15).map((u: any) =>
    `  ${u.unit_short_name || u.unit_name}: ${u.requests.slice(0, 4).map((r: any) => `"${r.text.slice(0, 80)}" [${r.count}×]`).join(' | ')}`
).join('\n')}` : '';

        // ── 4. System prompt ──────────────────────────────────────────────────────
        const systemPrompt = `
YOU ARE THE AI DATA SCIENTIST FOR "SATISFACTION VOICE" — A UNIVERSITY ANALYTICS PLATFORM.

━━ APP CONTEXT ━━
Satisfaction Voice transforms raw student satisfaction survey (SSI) data into institutional intelligence.

KEY ENTITIES:
• UNITS = University SERVICE DEPARTMENTS (Library, IT Department, Student Affairs, Registrar, Finance Office, etc.)
  Entities BEING EVALUATED. Each has qualitative sentiment + quantitative scores + demographic breakdowns.
• FACULTIES = Student demographic GROUPS (e.g. Faculty of Engineering, Faculty of Medicine)
  The RESPONDENTS — NOT service units. Faculties are never rated; they rate the units above.
• SEGMENTS = Individual idea-units extracted from student comments (one comment → 1–5 segments)
• CATEGORIES = Topic labels assigned to each segment (e.g. "Staff Service & Attitude", "Facilities")

━━ SCORE SCALES & THRESHOLDS ━━
• Likert (1–4): 4=Excellent, 3=Good, 2=Fair, 1=Poor
  Benchmarks: ≥3.20 Strong | ≥3.00 Fair | <3.00 Needs Attention | <2.50 Critical
• Binary (0–1): proportion of positive binary responses (0.80 = 80% satisfied)
• Sentiment Score (0–100): ≥60 Green | 40–59 Amber | <40 Red
• NPS (−100 to +100): >0 healthy | >50 excellent | <0 urgent
• Respondent reach: how many unique students gave feedback about each unit (low reach = less reliable data)

━━ DATASET (${globalDataset.length} units, chart keys available) ━━
Available keys: ${JSON.stringify(Array.from(availableKeys))}
Note: Each unit also has score_distributions[] (histogram per column) and respondent_reach inside LIVE UNIT DATA.

PRE-COMPUTED DERIVED KEYS (use these directly in chart yKey/yKeys — do NOT invent other key names):
• positive_pct       = % of segments that are positive (0–100). Use as qualitative sentiment proxy.
• negative_pct       = % of segments that are negative (0–100).
• sentiment_score    = same as positive_pct — the headline sentiment quality score.
• norm_score         = Likert avg mapped to 0–100 scale: ((score−1)/3)×100. Comparable with sentiment_score.
• disparity_gap      = norm_score − sentiment_score. POSITIVE = quant inflated vs qual. NEGATIVE = underrated.
  → Use disparity_gap for "iceberg" / gap analysis charts.

⚠ SCALE GROUPS — NEVER mix these two groups in the same yKeys array:
  NORMALIZED (0–100 or 0–4): sentiment_score, positive_pct, negative_pct, norm_score, disparity_gap, score
  RAW COUNTS (0–10000+):     total_segments, positive, neutral, negative, respondent_reach
Mixing a normalized metric with a raw count on the same axis produces an unreadable chart where one bar towers thousands of units above the other. If you need to show both, use a SCATTER chart (xKey = one scale, yKey = the other) or two separate charts.

⚠ CHART DATA SOURCE — CRITICAL RULE:
Chart xKey / yKey / yKeys MUST be keys that exist in the LIVE UNIT DATA array above (unit-level rows only).
DO NOT use keys from FACULTY BREAKDOWN, LOCATION BREAKDOWN, PROGRAM BREAKDOWN, or NPS DATA sections —
those blocks are narrative text context and are NOT part of the chartable dataset.
Keys like 'faculty', 'avg_score', 'location', 'campus', 'prodi', 'nps_score' do NOT exist in the chart data.
If a user requests a faculty-level or location-level chart, describe the breakdown in text instead of generating a chart — unless the key name appears in the Available keys list above.
${surveyContextBlock}
${columnDictBlock}
${npsBlock}
${facultiesBlock}
${locationsBlock}
${programsBlock}
${crossMentionsBlock}
${themesBlock}
${suggestionsBlock}

LIVE UNIT DATA (all metrics, score distributions, respondent reach):
${wrapUserData(globalDataset)}
${existingChart ? `
CONTEXT: The user is REFINING this existing chart — acknowledge it and ask what to change:
${JSON.stringify(existingChart)}` : ''}

━━ CHART OUTPUT FORMAT ━━
Wrap chart JSON in <charts_config>...</charts_config> tags.
PRO TIP: Combine related metrics into ONE chart with yKeys — never generate 9 single-metric charts.

<charts_config>
[{
    "id": "chart_[unique_id]",
    "type": "BAR" | "HORIZONTAL_BAR" | "STACKED_BAR" | "LINE" | "SCATTER" | "PIE",
    "title": "...", "description": "Deep insight about what this reveals",
    "xKey": "unit_name", "yKey": "score",
    "yKeys": ["positive", "neutral", "negative"],
    "aggregation": "AVG" | "COUNT" | "SUM",
    "units": ["CTL", "ITD", "Library"]
}]
</charts_config>

CRITICAL — units field: When a chart is about SPECIFIC units (e.g. comparing 3 departments, focusing on top/bottom performers), set "units" to the array of unit_short_name values to include. Only omit "units" (or set to []) when the chart genuinely needs ALL units (e.g. institution-wide scatter, full ranking). A chart titled "Triad of X: A, B, C" must have "units": ["A","B","C"].

Chart types: BAR/HORIZONTAL_BAR=side-by-side comparisons | STACKED_BAR=composition breakdown |
LINE=ordered trends | SCATTER=two-metric correlation | PIE=proportional split

━━ FORMATTING RULES ━━
1. OPENING: Never use a formal greeting, welcome message, or status readout. On the very first message only, weave ONE short confidence signal into the opening line of your actual answer — for example: "The SSI 2026 dataset is ready — here's what the scatter reveals:" — then continue with the insight. On all subsequent messages, start directly with the insight, no opener at all. Never say "Gemini".
1a. RESPONSE LENGTH & LANGUAGE: Default to SHORT and PUNCHY. Most responses should be 1–2 paragraphs or at most 1 box + 1 chart. Use multiple boxes ONLY when the user explicitly asks for 'detailed', 'full report', 'deep dive', 'explain everything', or similar. A scatter plot request = short callout of the top 2–3 notable data points, not 3 full boxes of analysis. 'Find outliers' = 1 key anomaly with 1–2 supporting data points. Save the lengthy multi-box format for questions that clearly demand it. Respond in whatever language the user writes in.
2. BOX STRUCTURE: <box title="Title">content</box> for every thematic point. 1–2 line summary BEFORE boxes.
3. TYPOGRAPHY: quotes as blockquotes > | column keys as \`inline_code\` | faculties as **Bold** | units as *Italics* | scores as **3.42**
4. EVIDENCE: cite exact numbers. Use score_distributions to describe polarisation patterns.
5. DEMOGRAPHICS: use respondent distribution to flag if one faculty dominates the data.
6. CROSS-UNIT: flag cross-unit mentions as institutional friction (e.g. "IT issues bleed into Library complaints").
7. IMPROVEMENT SIGNALS: reference suggestion_requests to surface what students explicitly asked for.
8. SEPARATE QUANT/QUAL: \`likert_X\` (1–4) vs \`category_X\` sentiment are different data sources.

CONVERSATION SO FAR:
${conversationHistory}

Respond as the ASSISTANT.`;

        // ── 5. Stream AI response via SSE ────────────────────────────────────────
        const finalPrompt = systemPrompt + (addendum ? `\n\n---\nOWNER INSTRUCTIONS:\n${addendum}` : "");
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) return NextResponse.json({ error: "GEMINI_API_KEY not configured." }, { status: 500 });

        const genAI = new GoogleGenerativeAI(apiKey);
        const geminiModel = genAI.getGenerativeModel({ model: modelId });
        const streamResult = await geminiModel.generateContentStream({
            contents: [{ role: "user", parts: [{ text: finalPrompt }] }],
        });

        const enc = new TextEncoder();
        let fullText = '';

        const readable = new ReadableStream<Uint8Array>({
            async start(controller) {
                try {
                    for await (const chunk of streamResult.stream) {
                        const text = chunk.text();
                        fullText += text;
                        controller.enqueue(enc.encode(`data: ${JSON.stringify({ text })}\n\n`));
                    }

                    // Extract charts from the full accumulated text
                    const charts: any[] = [];
                    const chartRegex = /<charts_config>\s*(?:```json\s*)?([\s\S]*?)(?:\s*```)?\s*<\/charts_config>/gi;
                    const legacyRegex = /<chart_config>\s*(?:```json\s*)?([\s\S]*?)(?:\s*```)?\s*<\/chart_config>/gi;
                    let m;
                    while ((m = chartRegex.exec(fullText)) !== null) {
                        try {
                            const p = JSON.parse(m[1].trim());
                            if (Array.isArray(p)) charts.push(...p); else charts.push(p);
                        } catch { /* ignore */ }
                    }
                    while ((m = legacyRegex.exec(fullText)) !== null) {
                        try { charts.push(JSON.parse(m[1].trim())); } catch { /* ignore */ }
                    }

                    controller.enqueue(enc.encode(
                        `data: ${JSON.stringify({ done: true, charts, dataset: globalDataset })}\n\n`
                    ));
                } catch (e: any) {
                    controller.enqueue(enc.encode(
                        `data: ${JSON.stringify({ error: e.message || 'Stream error' })}\n\n`
                    ));
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
