"use client";

/**
 * AnalysisControlContext — stable, low-frequency updates.
 *
 * Holds: isAnalyzing, currentUnitId, currentSurveyId, jobId, and all actions.
 * Re-renders only at session start/stop — NOT on every log line.
 *
 * Most components only need this context.
 * Use useAnalysisProgress() (AnalysisProgressContext) only in AnalysisEngine.
 */

import { createContext, useContext, useState, useRef, ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { useAnalysisProgress } from "@/context/AnalysisProgressContext";

type AnalysisProgress = {
    processed: number;
    total: number;
    percentage: number;
};

type AnalysisControlState = {
    isAnalyzing: boolean;
    currentUnitId: string | null;
    currentSurveyId: string | null;
    jobId: string | null;
    // progress is included here so existing subscribers (Dashboard, DataBrowser etc.)
    // don't need a second hook — it is updated at batch boundaries not on every log.
    progress: AnalysisProgress;
    startAnalysis: (unitId: string, surveyId?: string) => Promise<void>;
    stopAnalysis: () => Promise<void>;
    resetAnalysis: (unitId: string, surveyId?: string) => Promise<void>;
};

const AnalysisControlContext = createContext<AnalysisControlState | undefined>(undefined);

export function AnalysisProvider({ children }: { children: ReactNode }) {
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [currentUnitId, setCurrentUnitId] = useState<string | null>(null);
    const [currentSurveyId, setCurrentSurveyId] = useState<string | null>(null);
    const [jobId, setJobId] = useState<string | null>(null);
    const [processedCount, setProcessedCount] = useState(0);
    const [totalPending, setTotalPending] = useState(0);

    const stopRef = useRef(false);

    // Pull the volatile logger from ProgressContext (AnalysisProvider wraps ProgressProvider)
    const { addLog } = useAnalysisProgress();

    const startAnalysis = async (unitId: string, surveyId?: string) => {
        if (isAnalyzing && currentUnitId !== unitId) {
            toast.error("Another analysis is already running. Please wait.");
            return;
        }

        setCurrentUnitId(unitId);
        setCurrentSurveyId(surveyId || null);
        setIsAnalyzing(true);
        stopRef.current = false;
        if (!isAnalyzing) {
            setProcessedCount(0);
            setTotalPending(0);
        }

        addLog(`🚀 Triggering Background Analysis Job for Unit ${unitId} ...`);

        try {
            await supabase.from('organization_units').update({ analysis_status: 'IN_PROGRESS' }).eq('id', unitId);
            await supabase.from('analysis_jobs').update({ status: 'CANCELLED' }).eq('unit_id', unitId).in('status', ['PROCESSING', 'PENDING']);

            const { data: newJob, error: jobErr } = await supabase
                .from('analysis_jobs')
                .insert({ unit_id: unitId, survey_id: surveyId || null, status: 'PENDING' })
                .select('id')
                .single();

            if (jobErr) throw jobErr;
            let activeJobId = newJob.id;
            setJobId(activeJobId);
            addLog("Job initialized. Starting batch processing...");

            // Pre-fetch respondent IDs for survey filtering (parallel page loading)
            let respIds: number[] = [];
            if (surveyId) {
                const firstPage = await supabase.from('respondents').select('id').eq('survey_id', surveyId).range(0, 999);
                respIds = (firstPage.data || []).map((r: any) => r.id);
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
            }

            // Count total pending items
            let initialTotal = 0;
            const CHUNK = 400;
            if (surveyId && respIds.length > 0) {
                for (let i = 0; i < respIds.length; i += CHUNK) {
                    const chunk = respIds.slice(i, i + CHUNK);
                    const { count } = await supabase.from('raw_feedback_inputs')
                        .select('*', { count: 'exact', head: true })
                        .eq('target_unit_id', unitId)
                        .eq('is_quantitative', false)
                        .eq('requires_analysis', true)
                        .in('respondent_id', chunk);
                    initialTotal += count || 0;
                }
            } else if (!surveyId) {
                const { count } = await supabase.from('raw_feedback_inputs')
                    .select('*', { count: 'exact', head: true })
                    .eq('target_unit_id', unitId)
                    .eq('is_quantitative', false)
                    .eq('requires_analysis', true);
                initialTotal = count || 0;
            }
            setTotalPending(initialTotal);

            // Batch processing loop
            let hasMore = true;
            const sessionProcessedIds: number[] = [];

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
                            skipIds: sessionProcessedIds.slice(-50)
                        })
                    });

                    if (!res.ok) throw new Error(`Batch processing returned ${res.status}`);

                    const data = await res.json();
                    if (data.error) throw new Error(data.error);

                    hasMore = data.hasMore;
                    if (data.processedIds && Array.isArray(data.processedIds)) {
                        sessionProcessedIds.push(...data.processedIds);
                    }

                    // Sync progress from job record (authoritative)
                    const { data: jobInfo } = await supabase
                        .from('analysis_jobs')
                        .select('processed_items, total_items, status')
                        .eq('id', activeJobId)
                        .single();

                    if (jobInfo) {
                        setProcessedCount(jobInfo.processed_items || 0);
                        if (jobInfo.status === 'STOPPED') {
                            addLog(`🛑 Job Stopped by system.`);
                            break;
                        }
                    } else {
                        setProcessedCount(prev => prev + (data.processedCount || 0));
                    }

                    if (hasMore) {
                        addLog(`✅ Batch complete. Pausing briefly...`);
                        await new Promise(r => setTimeout(r, 1000));
                    }
                } catch (batchErr: any) {
                    addLog(`❌ Batch Error: ${batchErr.message}`);
                    addLog("Retrying in 5 seconds...");
                    await new Promise(r => setTimeout(r, 5000));
                }
            }

            if (!stopRef.current) {
                addLog("✅ All batches complete!");
                await supabase.from('analysis_jobs').update({ status: 'COMPLETED' }).eq('id', activeJobId);
                await supabase.from('organization_units').update({ analysis_status: 'COMPLETED' }).eq('id', unitId);
                addLog("🏁 Unit status set to COMPLETED.");
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

        if (currentUnitId) {
            // Check if any items were actually analyzed (requires_analysis = false means processed).
            // If yes → keep IN_PROGRESS (yellow bar) so user knows there's partial data.
            // If none were processed → reset to NOT_STARTED (grey).
            const { count: analyzedCount } = await supabase
                .from('raw_feedback_inputs')
                .select('id', { count: 'exact', head: true })
                .eq('target_unit_id', currentUnitId)
                .eq('is_quantitative', false)
                .eq('requires_analysis', false);

            const newStatus = (analyzedCount && analyzedCount > 0) ? 'IN_PROGRESS' : 'NOT_STARTED';
            await supabase.from('organization_units').update({ analysis_status: newStatus }).eq('id', currentUnitId);

            if (newStatus === 'IN_PROGRESS') {
                addLog(`⏸️ Analysis paused. ${analyzedCount} items analyzed so far — unit stays yellow.`);
            } else {
                addLog("🔄 No items analyzed yet. Unit status reset to NOT_STARTED.");
            }
        }
    };

    const resetAnalysis = async (unitId: string, surveyId?: string) => {
        addLog("🗑️ Starting Optimized Reset...");

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

        let inputIds: number[] = [];
        const CHUNK = 200;
        if (surveyId && respIds.length > 0) {
            for (let i = 0; i < respIds.length; i += CHUNK) {
                const chunk = respIds.slice(i, i + CHUNK);
                let iPage = 0;
                while (true) {
                    const { data } = await supabase.from('raw_feedback_inputs').select('id').eq('target_unit_id', unitId).in('respondent_id', chunk).range(iPage * 1000, (iPage + 1) * 1000 - 1);
                    if (!data || data.length === 0) break;
                    inputIds.push(...data.map(d => d.id));
                    if (data.length < 1000) break;
                    iPage++;
                }
            }
        } else {
            let iPage = 0;
            while (true) {
                const { data } = await supabase.from('raw_feedback_inputs').select('id').eq('target_unit_id', unitId).range(iPage * 1000, (iPage + 1) * 1000 - 1);
                if (!data || data.length === 0) break;
                inputIds.push(...data.map(d => d.id));
                if (data.length < 1000) break;
                iPage++;
            }
        }

        const SEGMENT_BATCH = 1000;
        if (inputIds.length > 0) {
            for (let i = 0; i < inputIds.length; i += SEGMENT_BATCH) {
                const { error: delError } = await supabase.from('feedback_segments').delete().in('raw_input_id', inputIds.slice(i, i + SEGMENT_BATCH));
                if (delError) { toast.error("Partial reset failed: " + delError.message); return; }
            }
            for (let i = 0; i < inputIds.length; i += SEGMENT_BATCH) {
                await supabase.from('raw_feedback_inputs').update({ requires_analysis: true }).in('id', inputIds.slice(i, i + SEGMENT_BATCH));
            }
        }

        let jobDelete = supabase.from('analysis_jobs').delete().eq('unit_id', unitId);
        if (surveyId) jobDelete = jobDelete.eq('survey_id', surveyId);
        await jobDelete;
        await supabase.from('organization_units').update({ analysis_status: 'NOT_STARTED' }).eq('id', unitId);

        addLog("✅ Reset Complete.");
        setTotalPending(0);
        setProcessedCount(0);
        setJobId(null);
    };

    const pct = totalPending > 0 ? Math.min(100, Math.round((processedCount / totalPending) * 100)) : 0;

    return (
        <AnalysisControlContext.Provider value={{
            isAnalyzing,
            currentUnitId,
            currentSurveyId,
            jobId,
            progress: { processed: processedCount, total: totalPending, percentage: pct },
            startAnalysis,
            stopAnalysis,
            resetAnalysis,
        }}>
            {children}
        </AnalysisControlContext.Provider>
    );
}

export const useAnalysisControl = () => {
    const ctx = useContext(AnalysisControlContext);
    if (!ctx) throw new Error("useAnalysisControl must be used within AnalysisProvider");
    return ctx;
};

/**
 * Legacy alias — keeps existing `useAnalysis()` callers working without any changes.
 * They get stable control state only (no logs/progress re-renders).
 */
export const useAnalysis = useAnalysisControl;
