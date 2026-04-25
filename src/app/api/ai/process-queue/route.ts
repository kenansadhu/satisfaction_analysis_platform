import { callGemini, handleAIError } from "@/lib/ai";
import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { processQueueSchema } from "@/lib/validators";

export const maxDuration = 60; // 60 seconds max

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const parsed = processQueueSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
        }
        const { jobId, unitId, surveyId, skipIds } = parsed.data;

        // 1–3. Fetch all static data in parallel (job, unit, instructions, categories, allUnits)
        const [
            { data: job, error: jobErr },
            { data: unit },
            { data: instrRows },
            { data: categories },
            { data: allUnits },
        ] = await Promise.all([
            supabase.from('analysis_jobs').select('*').eq('id', jobId).single(),
            supabase.from('organization_units').select('*').eq('id', unitId).single(),
            supabase.from('unit_analysis_instructions').select('instruction').eq('unit_id', unitId),
            supabase.from('analysis_categories').select('*').eq('unit_id', unitId),
            supabase.from('organization_units').select('id, name, short_name, description'),
        ]);

        if (jobErr || !job) {
            return NextResponse.json({ error: "Job not found" }, { status: 404 });
        }
        if (job.status === 'COMPLETED' || job.status === 'FAILED') {
            return NextResponse.json({ hasMore: false, processedIds: [] });
        }
        if (!unit) {
            return NextResponse.json({ error: "Unit not found" }, { status: 404 });
        }
        if (!categories || categories.length === 0) {
            return NextResponse.json({ error: "Cannot process without defined taxonomy" }, { status: 400 });
        }

        const customInstructions = instrRows?.map((r: any) => r.instruction) || [];

        // 4. Find the NEXT Batch of Comments (up to 50)
        let rawItems: any[] = [];
        const BATCH_SIZE = 50;

        if (surveyId) {
            // Fetch respondent IDs with parallel page loading
            const firstPage = await supabase.from('respondents').select('id').eq('survey_id', surveyId).range(0, 999);
            let respIds: number[] = (firstPage.data || []).map((r: any) => r.id);

            if (firstPage.data && firstPage.data.length === 1000) {
                const { count: totalResps } = await supabase.from('respondents')
                    .select('*', { count: 'exact', head: true }).eq('survey_id', surveyId);
                const extraPages = Math.ceil(((totalResps || 1000) - 1000) / 1000);
                const rest = await Promise.all(
                    Array.from({ length: extraPages }, (_, i) =>
                        supabase.from('respondents').select('id').eq('survey_id', surveyId).range((i + 1) * 1000, (i + 2) * 1000 - 1)
                    )
                );
                for (const page of rest) respIds.push(...(page.data || []).map((r: any) => r.id));
            }

            if (respIds.length > 0) {
                const CHUNK = 500;
                for (let i = 0; i < respIds.length; i += CHUNK) {
                    if (rawItems.length >= BATCH_SIZE) break;

                    const chunk = respIds.slice(i, i + CHUNK);
                    let q = supabase
                        .from('raw_feedback_inputs')
                        .select('id, raw_text')
                        .eq('target_unit_id', unitId)
                        .eq('is_quantitative', false)
                        .eq('requires_analysis', true)
                        .in('respondent_id', chunk)
                        .order('id', { ascending: true })
                        .limit(BATCH_SIZE - rawItems.length);

                    if (skipIds && skipIds.length > 0) {
                        q = q.not('id', 'in', `(${skipIds.join(',')})`);
                    }

                    const { data } = await q;
                    if (data && data.length > 0) {
                        rawItems.push(...data);
                    }
                }
            }
        } else {
            let q = supabase
                .from('raw_feedback_inputs')
                .select('id, raw_text')
                .eq('target_unit_id', unitId)
                .eq('is_quantitative', false)
                .eq('requires_analysis', true)
                .order('id', { ascending: true })
                .limit(BATCH_SIZE);

            if (skipIds && skipIds.length > 0) {
                q = q.not('id', 'in', `(${skipIds.join(',')})`);
            }
            const { data } = await q;
            if (data) rawItems = data;
        }

        if (rawItems.length === 0) {
            // Nothing left to process!
            await supabase.from('analysis_jobs').update({ status: 'COMPLETED', ended_at: new Date().toISOString() }).eq('id', jobId);
            return NextResponse.json({ hasMore: false, processedIds: [] });
        }

        // Mark Job as Processing if it was newly started
        if (job.status === 'PENDING') {
            await supabase.from('analysis_jobs').update({ status: 'PROCESSING', started_at: new Date().toISOString() }).eq('id', jobId);
        }

        // 5. Construct AI Prompt Payload
        const categoriesList = categories.map((c: any) => `- "${c.name}": ${c.description || ""} ${c.keywords?.length ? `[Keywords: ${c.keywords.join(", ")}]` : ""}`).join("\n");

        // Include unit descriptions for intelligent cross-tagging
        const unitsList = (allUnits || [])
            .filter((u: any) => u.id !== parseInt(String(unitId)))
            .map((u: any) => `- "${u.name}"${u.description ? `: ${u.description}` : ""}`)
            .join("\n");

        const customRules = customInstructions.length > 0
            ? customInstructions.join("\n- ")
            : "None";

        const unitAnalysisContext = unit.analysis_context || "";

        const mappedComments = rawItems.map(r => `ID: ${r.id} | TEXT: ${r.raw_text}`).join("\n");

        const institutionName = process.env.INSTITUTION_NAME || "the institution";

        const prompt = `
            You are an expert Data Analyst classifying student satisfaction survey comments for ${institutionName}.

            UNIT NAME: ${unit.name}
            UNIT DESCRIPTION: ${unit.description || "N/A"}
            ${unitAnalysisContext ? `UNIT ANALYSIS CONTEXT: ${unitAnalysisContext}` : ""}
            CUSTOM RULES:
            - ${customRules}

            AVAILABLE CATEGORIES (assign the BEST match):
            ${categoriesList}

            OTHER UNIVERSITY UNITS (for cross-tagging — use descriptions to decide if a comment belongs elsewhere):
            ${unitsList}

            TASK:
            Analyze each comment. For each comment ID, produce analysis segments.

            SEGMENTATION RULES:
            1. Split comments by DISTINCT IDEAS. Each segment should express ONE specific point.
               Example: "The teacher explains well and is always on time" → 2 segments:
               - Segment 1: "The teacher explains well" (teaching quality)
               - Segment 2: "always on time" (punctuality)
               Even if both ideas share the same category or sentiment, split them if they are separate points.
            2. If a comment is truly ONE single idea, keep it as 1 segment.
            3. If a comment is pure noise ("-", "None", "No comment", "Ttd", "tidak ada", "n/a", "cukup", "ok"), IGNORE IT entirely — return NO segments.

            SENTIMENT RULES:
            - Positive: praise, satisfaction, appreciation. "Sudah baik" → Positive.
            - Negative: complaints, dissatisfaction, problems.
            - Neutral: factual observations, mixed feelings.

            SUGGESTION DETECTION:
            Set "is_suggestion": true IF the student is proposing a change, wish, or specific fix.
            Common Indonesian keywords: "Semoga" (Hope), "Mohon" (Please), "Harap" (Hope), "Sebaiknya" (Should), "Agar" (So that), "Tolong" (Please help), "Perlu" (Need to).

            CROSS-UNIT TAGGING:
            If a comment clearly refers to another unit (e.g. "Library is cold" but you're analyzing "Finance"), set "related_unit_name" to the correct unit name from the list above. Use the unit descriptions to make intelligent decisions.

            DATA:
            ${mappedComments}

            OUTPUT FORMAT (JSON strictly matching this interface):
            [
                {
                    "raw_input_id": 123,
                    "segments": [
                        {
                            "text": "Extracted segment text",
                            "category_name": "Must be one of the EXACT category names provided above",
                            "sentiment": "Positive" | "Negative" | "Neutral",
                            "is_suggestion": true | false,
                            "related_unit_name": "Another Unit Name" | null
                        }
                    ]
                }
            ]
        `;

        // 6. Call Gemini (using default model from ai.ts)
        const aiResponse = await callGemini(prompt, { jsonMode: true });
        const aiParsed = typeof aiResponse === 'string' ? JSON.parse(aiResponse) : aiResponse;

        // 7. Save to Database
        let segmentsToInsert: any[] = [];
        let processedInputIds = new Set<number>();

        // Anti-Hallucination: track unique segments per input to avoid duplicates
        let seenSegmentsPerInput = new Map<number, Set<string>>();

        if (Array.isArray(aiParsed)) {
            aiParsed.forEach((res: any) => {
                const inputId = res.raw_input_id;
                processedInputIds.add(inputId);

                if (!seenSegmentsPerInput.has(inputId)) {
                    seenSegmentsPerInput.set(inputId, new Set());
                }
                const seenSet = seenSegmentsPerInput.get(inputId)!;

                if (Array.isArray(res.segments) && res.segments.length > 0) {
                    res.segments.forEach((seg: any) => {
                        // Deduplicate exact same text per input
                        const cleanText = (seg.text || "").trim();
                        if (!cleanText || seenSet.has(cleanText.toLowerCase())) return;
                        seenSet.add(cleanText.toLowerCase());

                        const matchedCat = categories.find((c: any) => c.name === seg.category_name);

                        // Resolve Cross-Unit Tagging
                        let relatedUnitIds: number[] | null = null;
                        if (seg.related_unit_name) {
                            const matchedRelated = (allUnits || []).find((u: any) => u.name.toLowerCase() === String(seg.related_unit_name).toLowerCase());
                            if (matchedRelated) {
                                relatedUnitIds = [matchedRelated.id];
                            }
                        }

                        segmentsToInsert.push({
                            raw_input_id: inputId,
                            segment_text: cleanText,
                            sentiment: seg.sentiment,
                            is_suggestion: seg.is_suggestion === true,
                            category_id: matchedCat ? matchedCat.id : null,
                            related_unit_ids: relatedUnitIds
                        });
                    });
                }
            });
        }

        // Track all requested items as processed (even if AI skipped them as noise)
        const allRequestedIds = rawItems.map(r => r.id);

        if (segmentsToInsert.length > 0) {
            const { error: insErr } = await supabase.from('feedback_segments').insert(segmentsToInsert);
            if (insErr) {
                console.error("Failed to insert segments:", insErr);
                throw new Error("DB Insert Failed: " + insErr.message);
            }
        }

        // Mark items as analyzed
        if (allRequestedIds.length > 0) {
            await supabase.from('raw_feedback_inputs').update({ requires_analysis: false }).in('id', allRequestedIds);
        }

        // Update Job Counter
        const newTotal = (job.processed_items || 0) + allRequestedIds.length;
        await supabase.from('analysis_jobs').update({ processed_items: newTotal }).eq('id', jobId);

        // Check if we probably have more
        const hasMore = allRequestedIds.length === BATCH_SIZE;

        return NextResponse.json({
            hasMore,
            processedIds: allRequestedIds
        });

    } catch (error) {
        return handleAIError(error);
    }
}
