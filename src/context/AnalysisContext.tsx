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

            // Pre-fetch respondent IDs for survey filtering
            let respIds: number[] = [];
            if (surveyId) {
                let rPage = 0;
                while (true) {
                    const { data: rBat } = await supabase.from('respondents').select('id').eq('survey_id', surveyId).range(rPage * 1000, (rPage + 1) * 1000 - 1);
                    if (!rBat || rBat.length === 0) break;
                    respIds.push(...rBat.map((r: any) => r.id));
                    if (rBat.length < 1000) break;
                    rPage++;
                }
            }

            let initialTotal = 0;
            let analyzedCount = 0;
            const CHUNK = 400;

            if (surveyId && respIds.length > 0) {
                for (let i = 0; i < respIds.length; i += CHUNK) {
                    const chunk = respIds.slice(i, i + CHUNK);
                    const { count } = await supabase.from('raw_feedback_inputs').select('*', { count: 'exact', head: true }).eq('target_unit_id', unitId).eq('is_quantitative', false).eq('requires_analysis', true).in('respondent_id', chunk);
                    initialTotal += count || 0;
                }
            } else if (!surveyId) {
                const { count } = await supabase.from('raw_feedback_inputs').select('*', { count: 'exact', head: true }).eq('target_unit_id', unitId).eq('is_quantitative', false).eq('requires_analysis', true);
                initialTotal = count || 0;
            }
            setTotalPending(initialTotal);

            setProcessedCount(0);

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

                    const { data: jobInfo } = await supabase.from('analysis_jobs').select('processed_items, total_items, status').eq('id', activeJobId).single();
                    if (jobInfo) {
                        setProcessedCount(jobInfo.processed_items || 0);
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
                        await new Promise(r => setTimeout(r, 1000)); // Sleep between batches
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

        // 1. Get ALL relevant raw feedback input IDs first (avoid slow inner join)
        let respIds: number[] = [];
        if (surveyId) {
            const { data: resps } = await supabase.from('respondents').select('id').eq('survey_id', surveyId);
            respIds = (resps || []).map((r: any) => r.id);
        }

        let inputIdsQuery = supabase
            .from('raw_feedback_inputs')
            .select('id')
            .eq('target_unit_id', unitId);

        if (surveyId && respIds.length > 0) {
            inputIdsQuery = inputIdsQuery.in('respondent_id', respIds.slice(0, 500));
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
