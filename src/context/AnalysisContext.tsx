"use client";

import { createContext, useContext, useState, useRef, ReactNode, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

type AnalysisState = {
    isAnalyzing: boolean;
    currentUnitId: string | null;
    currentSurveyId: string | null;
    progress: {
        processed: number;
        total: number;
        percentage: number;
    };
    logs: string[];
    startAnalysis: (unitId: string, surveyId?: string) => Promise<void>;
    stopAnalysis: () => void;
    resetAnalysis: (unitId: string, surveyId?: string) => Promise<void>;
};

const AnalysisContext = createContext<AnalysisState | undefined>(undefined);

export function AnalysisProvider({ children }: { children: ReactNode }) {
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [currentUnitId, setCurrentUnitId] = useState<string | null>(null);
    const [currentSurveyId, setCurrentSurveyId] = useState<string | null>(null);
    const [logs, setLogs] = useState<string[]>([]);
    const [processedCount, setProcessedCount] = useState(0);
    const [totalPending, setTotalPending] = useState(0);

    const stopRef = useRef(false);

    const addLog = (msg: string) => setLogs(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 50));

    const loadResources = async (unitId: string, surveyId?: string) => {
        // ... (Resource loading logic from AnalysisEngine) ...
        // We mainly need this for the *Process Loop*, but to keep Context clean, 
        // we might fetch these INSIDE startAnalysis or pass them in?
        // Better to fetch inside to keep it self-contained.
        return {};
    };

    const [jobId, setJobId] = useState<string | null>(null);

    const startAnalysis = async (unitId: string, surveyId?: string) => {
        if (isAnalyzing && currentUnitId !== unitId) {
            toast.error("Another analysis is already running. Please wait.");
            return;
        }

        setCurrentUnitId(unitId);
        setCurrentSurveyId(surveyId || null);
        setIsAnalyzing(true);
        stopRef.current = false;

        // Only clear logs if starting fresh
        if (!isAnalyzing) setLogs([]);

        addLog(`🚀 Triggering Background Analysis Job for Unit ${unitId} ...`);

        try {
            // 1. Check if there's already a running job
            const { data: existingJob } = await supabase
                .from('analysis_jobs')
                .select('id, status')
                .eq('unit_id', unitId)
                .in('status', ['PROCESSING', 'PENDING'])
                .order('created_at', { ascending: false })
                .limit(1)
                .single();

            let activeJobId = existingJob?.id;

            // 2. Start a new job if none exists
            if (!activeJobId) {
                const { data: newJob, error: jobErr } = await supabase
                    .from('analysis_jobs')
                    .insert({ unit_id: unitId, survey_id: surveyId || null, status: 'PENDING' })
                    .select('id')
                    .single();

                if (jobErr) throw jobErr;
                activeJobId = newJob.id;

                // Trigger Background Worker
                await fetch('/api/ai/process-queue', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ jobId: activeJobId, unitId, surveyId })
                });
            }

            setJobId(activeJobId);
            addLog("Job initialized. Starting batch processing...");

            // 3. Batch Processing Loop (Client Driven)
            let hasMore = true;
            let loopProcessed = 0;
            const sessionProcessedIds: number[] = [];

            // Optional: Fetch initial total workload to set the progress bar max
            let countQuery = supabase
                .from('raw_feedback_inputs')
                .select('id, respondents!inner(survey_id)', { count: 'exact', head: true })
                .eq('target_unit_id', unitId)
                .eq('is_quantitative', false)
                .eq('requires_analysis', true);

            if (surveyId) {
                countQuery = countQuery.eq('respondents.survey_id', surveyId);
            }

            const { count: initialTotal, error: countErr } = await countQuery;

            if (countErr) {
                addLog(`⚠️ Warning: Could not fetch initial total items.`);
            }

            setTotalPending(initialTotal || 0);

            // Fetch Watermark and Historical Progress (Survey Aware)
            let watermarkQuery = supabase
                .from('feedback_segments')
                .select('raw_input_id, raw_feedback_inputs!inner(target_unit_id, is_quantitative, respondents!inner(survey_id))')
                .eq('raw_feedback_inputs.target_unit_id', unitId)
                .eq('raw_feedback_inputs.is_quantitative', false);

            if (surveyId) {
                watermarkQuery = watermarkQuery.eq('raw_feedback_inputs.respondents.survey_id', surveyId);
            }

            const { data: lastSegment } = await watermarkQuery
                .order('raw_input_id', { ascending: false })
                .limit(1)
                .single();

            const watermarkId = lastSegment?.raw_input_id || 0;

            let analyzedCountQuery = supabase
                .from('raw_feedback_inputs')
                .select('id, respondents!inner(survey_id)', { count: 'exact', head: true })
                .eq('target_unit_id', unitId)
                .eq('is_quantitative', false) // CRITICAL SYNC
                .eq('requires_analysis', true)
                .lte('id', watermarkId);

            if (surveyId) analyzedCountQuery = analyzedCountQuery.eq('respondents.survey_id', surveyId);
            const { count: analyzedCount } = await analyzedCountQuery;

            const historicalOffset = analyzedCount || 0;
            setProcessedCount(historicalOffset);

            while (hasMore && !stopRef.current) {
                try {
                    addLog(`⏳ Processing next batch...`);
                    const res = await fetch('/api/ai/process-queue', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            jobId: activeJobId,
                            unitId,
                            surveyId,
                            skipIds: sessionProcessedIds.slice(-50) // Only skip the absolute latest to prevent duplicates in edge cases
                        })
                    });

                    if (!res.ok) {
                        throw new Error(`Batch processing returned ${res.status}`);
                    }

                    const data = await res.json();
                    if (data.error) throw new Error(data.error);

                    hasMore = data.hasMore;
                    if (data.processedIds && Array.isArray(data.processedIds)) {
                        sessionProcessedIds.push(...data.processedIds);
                    }

                    // We need to re-fetch the job strictly for the most accurate total processed,
                    // but we can also rely on data.processedCount + existing count
                    const { data: jobInfo } = await supabase.from('analysis_jobs').select('processed_items, total_items, status').eq('id', activeJobId).single();
                    if (jobInfo) {
                        setProcessedCount(historicalOffset + (jobInfo.processed_items || 0));
                        if (jobInfo.total_items && jobInfo.total_items > totalPending) {
                            setTotalPending(jobInfo.total_items);
                        }
                        if (jobInfo.status === 'STOPPED') {
                            addLog(`🛑 Job Stopped by system.`);
                            break;
                        }
                    } else {
                        // Fallback
                        loopProcessed += data.processedCount || 0;
                        setProcessedCount(prev => prev + (data.processedCount || 0));
                    }

                    if (hasMore) {
                        addLog(`✅ Batch complete. Pausing briefly...`);
                        await new Promise(r => setTimeout(r, 1500)); // Sleep between batches to prevent spamming
                    }
                } catch (batchErr: any) {
                    addLog(`❌ Batch Error: ${batchErr.message}`);
                    addLog("Retrying in 5 seconds...");
                    await new Promise(r => setTimeout(r, 5000));
                }
            }

            if (!stopRef.current) {
                addLog("✅ All batches complete!");
                setIsAnalyzing(false);
                setJobId(null);
            }

        } catch (e: any) {
            addLog(`❌ Fatal Error: ${e.message}`);
            toast.error("Failed to start analysis job.");
            setIsAnalyzing(false);
        }
    };

    const stopAnalysis = async () => {
        stopRef.current = true;
        setIsAnalyzing(false);
        addLog("🛑 Sending stop signal to background worker...");

        if (jobId) {
            await supabase.from('analysis_jobs').update({ status: 'STOPPED' }).eq('id', jobId);
            setJobId(null);
        }
    };

    const resetAnalysis = async (unitId: string, surveyId?: string) => {
        addLog("🗑️ Starting Optimized Reset...");

        // 1. Get ALL relevant raw feedback input IDs first (Clean & Efficient)
        let inputIdsQuery = supabase
            .from('raw_feedback_inputs')
            .select('id, respondents!inner(survey_id)')
            .eq('target_unit_id', unitId);

        if (surveyId) {
            inputIdsQuery = inputIdsQuery.eq('respondents.survey_id', surveyId);
        }

        const { data: inputs, error: inputError } = await inputIdsQuery;
        if (inputError) {
            toast.error("Failed to fetch inputs for reset: " + inputError.message);
            return;
        }

        const inputIds = inputs?.map(i => i.id) || [];

        // 2. Clear existing segments in batches by Input ID
        if (inputIds.length > 0) {
            const SEGMENT_BATCH = 1000;
            for (let i = 0; i < inputIds.length; i += SEGMENT_BATCH) {
                const batchIds = inputIds.slice(i, i + SEGMENT_BATCH);
                const { error: delError } = await supabase
                    .from('feedback_segments')
                    .delete()
                    .in('raw_input_id', batchIds);

                if (delError) {
                    toast.error("Partial reset failed: " + delError.message);
                    return;
                }
            }
        }

        // 3. Clean up Jobs
        await supabase.from('analysis_jobs').delete().eq('unit_id', unitId);

        addLog("✅ Reset Complete.");
        setTotalPending(0);
        setProcessedCount(0);
        setJobId(null);
    };

    const pct = totalPending > 0 ? Math.min(100, Math.round((processedCount / totalPending) * 100)) : 0;

    return (
        <AnalysisContext.Provider value={{
            isAnalyzing,
            currentUnitId,
            currentSurveyId,
            progress: { processed: processedCount, total: totalPending, percentage: pct },
            logs,
            startAnalysis,
            stopAnalysis,
            resetAnalysis
        }}>
            {children}
        </AnalysisContext.Provider>
    );
}

export const useAnalysis = () => {
    const context = useContext(AnalysisContext);
    if (!context) throw new Error("useAnalysis must be used within AnalysisProvider");
    return context;
};
