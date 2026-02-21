import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// This route processes a single batch of feedback for analysis.
// By processing only one batch at a time, we avoid Vercel Serverless Function timeouts (10s-60s)
// and give the client explicit control over each AI context boundary to prevent hallucination.

export async function POST(req: Request) {
    let jobId = 'Unknown';
    try {
        const body = await req.json();
        jobId = body.jobId || 'Unknown';
        const { unitId, surveyId, skipIds = [] } = body;

        if (jobId === 'Unknown' || !unitId) {
            return NextResponse.json({ error: "Missing jobId or unitId" }, { status: 400 });
        }

        const result = await processBatch(jobId, unitId, surveyId, skipIds);

        return NextResponse.json({
            success: true,
            hasMore: result?.hasMore || false,
            processedCount: result?.processedCount || 0,
            processedIds: result?.processedIds || []
        });

    } catch (e: unknown) {
        const details = e instanceof Error ? e.message : String(e);
        console.error(`[Job ${jobId || 'Unknown'}] Failed:`, details);
        return NextResponse.json({ error: "Failed to process batch", details }, { status: 500 });
    }
}

async function processBatch(jobId: string, unitId: string, surveyId?: string, skipIds: number[] = []) {
    console.log(`[Job ${jobId}] Processing Single Batch for Unit: ${unitId}`);

    // Update job status to PROCESSING if it isn't already
    await supabase.from('analysis_jobs')
        .update({ status: 'PROCESSING', updated_at: new Date().toISOString() })
        .eq('id', jobId)
        .eq('status', 'PENDING');

    // 1. Fetch Resources Needed for AI
    const { data: unit } = await supabase.from('organization_units').select('*').eq('id', unitId).single();
    const { data: inst } = await supabase.from('unit_analysis_instructions').select('instruction').eq('unit_id', unitId);
    const instructions = unit ? [unit.analysis_context, ...inst?.map((i: { instruction: string }) => i.instruction) || []].filter(Boolean) : [];

    const { data: categories } = await supabase.from('analysis_categories').select('id, name, description').eq('unit_id', unitId);
    const { data: allUnits } = await supabase.from('organization_units').select('id, name');

    if (!categories || categories.length === 0) {
        await failJob(jobId, "No categories found for this unit. Please define taxonomy first.");
        return { hasMore: false, processedCount: 0, processedIds: [] };
    }

    // Determine Total pending workload (to update job table if needed)
    let countQuery = supabase
        .from('raw_feedback_inputs')
        .select('id, respondents!inner(survey_id)', { count: 'exact', head: true })
        .eq('target_unit_id', unitId)
        .eq('is_quantitative', false)
        .eq('requires_analysis', true);

    if (surveyId) countQuery = countQuery.eq('respondents.survey_id', surveyId);

    const { count: approxTotal } = await countQuery;
    await supabase.from('analysis_jobs').update({ total_items: approxTotal || 0 }).eq('id', jobId);

    const BATCH_SIZE = 50;
    let currentProcessed = 0;

    // Check if the job was cancelled by the user
    const { data: jobCheck } = await supabase.from('analysis_jobs').select('status, processed_items').eq('id', jobId).single();
    if (jobCheck?.status === 'STOPPED') {
        console.log(`[Job ${jobId}] Stopped by user.`);
        return { hasMore: false, processedCount: 0, processedIds: [] };
    }

    // 2. Fetch actually processed IDs so we can skip them in the database query
    const { data: analyzedData } = await supabase
        .from('feedback_segments')
        .select('raw_input_id, raw_feedback_inputs!inner(target_unit_id)')
        .eq('raw_feedback_inputs.target_unit_id', unitId);

    const analyzedIds = Array.from(new Set(analyzedData?.map(r => r.raw_input_id) || []));

    // Fetch Next Batch (Candidates)
    let query = supabase
        .from('raw_feedback_inputs')
        .select('id, raw_text, respondents!inner(survey_id)')
        .eq('target_unit_id', unitId)
        .eq('is_quantitative', false)
        .eq('requires_analysis', true);

    if (surveyId) query = query.eq('respondents.survey_id', surveyId);

    // Skip already analyzed IDs AND session skipIds
    const allSkipIds = Array.from(new Set([...analyzedIds, ...skipIds]));
    if (allSkipIds.length > 0) {
        query = query.not('id', 'in', `(${allSkipIds.join(',')})`);
    }

    // Since we've filtered out already analyzed ones, we can just grab the exact BATCH_SIZE
    const { data } = await query.limit(BATCH_SIZE).order('id', { ascending: true });

    if (!data || data.length === 0) {
        await finishJob(jobId);
        return { hasMore: false, processedCount: 0, processedIds: [] };
    }

    // The batch is exactly our query payload now Since we did DB-level filtering
    const batch = data;

    if (batch.length === 0) {
        // Technically this shouldn't happen unless everything was already analyzed, but just in case:
        await finishJob(jobId);
        return { hasMore: false, processedCount: 0, processedIds: [] };
    }

    try {
        // NOTE: We call our own API route locally to actually invoke Gemini
        const NEXT_PUBLIC_BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
        const response = await fetch(`${NEXT_PUBLIC_BASE_URL}/api/ai/run-analysis`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                comments: batch,
                taxonomy: categories,
                allUnits: allUnits,
                unitContext: {
                    name: unit?.name,
                    description: unit?.description,
                    instructions
                }
            })
        });

        if (!response.ok) throw new Error(`Gemini Analysis Failed: ${response.status}`);

        const responseData = await response.json();

        type APIResponseItem = {
            raw_input_id: number;
            segments: { category_name: string; related_unit_name?: string; text: string; sentiment: string; is_suggestion?: boolean }[];
        };

        if (Array.isArray(responseData)) {
            const inserts: { raw_input_id: number; segment_text: string; sentiment: string; category_id: number | null; related_unit_ids: number[]; is_suggestion: boolean }[] = [];
            responseData.forEach((item: APIResponseItem) => {
                item.segments.forEach((seg) => {
                    const catId = categories.find((c: { id: number; name: string }) => c.name === seg.category_name)?.id;
                    const relatedId = allUnits?.find((u: { id: number; name: string }) => u.name === seg.related_unit_name)?.id;

                    inserts.push({
                        raw_input_id: item.raw_input_id,
                        segment_text: seg.text,
                        sentiment: seg.sentiment,
                        category_id: catId || null,
                        related_unit_ids: relatedId ? [relatedId] : [],
                        is_suggestion: seg.is_suggestion || false
                    });
                });
            });

            // Detect if the AI skipped any comments due to safety or failures
            const returnedIds = new Set(responseData.map((item: APIResponseItem) => item.raw_input_id));
            const skippedIds = batch.filter(b => !returnedIds.has(b.id)).map(b => b.id);

            // Automatically insert dummy segments for skipped comments so they don't block the queue
            // and so the user can see them in "Audit Results" as Uncategorized.
            skippedIds.forEach(id => {
                const originalText = batch.find(b => b.id === id)?.raw_text || "Unprocessed";
                inserts.push({
                    raw_input_id: id,
                    segment_text: originalText,
                    sentiment: "Neutral",
                    category_id: null,
                    related_unit_ids: [],
                    is_suggestion: false
                });
            });

            if (inserts.length > 0) {
                const { error } = await supabase.from('feedback_segments').insert(inserts);
                if (error) {
                    console.error(`[Job ${jobId}] DB Save Error:`, error);
                    throw error;
                } else {
                    currentProcessed = batch.length;
                    const previousProcessed = jobCheck?.processed_items || 0;

                    // Update progress in the database so UI can poll it
                    await supabase.from('analysis_jobs')
                        .update({
                            processed_items: previousProcessed + currentProcessed,
                            updated_at: new Date().toISOString()
                        })
                        .eq('id', jobId);
                }
            }
        }
    } catch (err: unknown) {
        console.error(`[Job ${jobId}] Batch Error:`, err);
        throw err;
    }

    // Has more if we took a full batch and there were more than what we took
    const hasMore = (batch.length === BATCH_SIZE);

    if (!hasMore) {
        await finishJob(jobId);
    }

    return { hasMore, processedCount: currentProcessed, processedIds: batch.map(b => b.id) };
}

async function finishJob(jobId: string) {
    const { data: finalCheck } = await supabase.from('analysis_jobs').select('status').eq('id', jobId).single();
    if (finalCheck?.status !== 'STOPPED') {
        await supabase.from('analysis_jobs')
            .update({
                status: 'COMPLETED',
                updated_at: new Date().toISOString()
            })
            .eq('id', jobId);
    }
}

async function failJob(jobId: string, message: string) {
    await supabase.from('analysis_jobs').update({
        status: 'FAILED',
        logs: [message],
        updated_at: new Date().toISOString()
    }).eq('id', jobId);
}
