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

        addLog(`🚀 Starting Analysis ...`);

        try {
            // 1. Fetch Resources
            const { data: unit } = await supabase.from('organization_units').select('*').eq('id', unitId).single();
            const { data: inst } = await supabase.from('unit_analysis_instructions').select('instruction').eq('unit_id', unitId);
            const instructions = unit ? [unit.analysis_context, ...inst?.map((i: any) => i.instruction) || []].filter(Boolean) : [];

            const { data: categories } = await supabase.from('analysis_categories').select('id, name, description').eq('unit_id', unitId);
            const { data: allUnits } = await supabase.from('organization_units').select('id, name');

            if (!categories || categories.length === 0) {
                toast.warning("No categories found! Please build them in Tab 1.");
                setIsAnalyzing(false);
                return;
            }

            // 2. Determine Total Workload (Approximation for Progress Bar)
            // Just for the Progress Bar. If zero, we still proceed to chunking just in case.
            let countQuery = supabase
                .from('raw_feedback_inputs')
                .select('*', { count: 'exact', head: true })
                .eq('target_unit_id', unitId)
                .eq('is_quantitative', false)
                .eq('requires_analysis', true);
            if (surveyId) countQuery = countQuery.eq('respondents.survey_id', surveyId);

            const { count: approxTotal } = await countQuery;

            // We do NOT abort here. We let the chunking process discover the exact pending amount.
            // The unanalyzed count might be smaller than approxTotal.

            let hasMore = true;
            const BATCH_SIZE = 50;

            // To ensure we don't count rows we've already processed in this session, we keep track of their IDs
            const processedRowIds = new Set<number>();

            setProcessedCount(0);
            setTotalPending(approxTotal || 0);

            addLog("Beginning continuous analysis stream...");

            while (hasMore && !stopRef.current) {
                // Because we are continually adding to `feedback_segments`, we can just keep fetching 
                // the "Top 50" unanalyzed inputs over and over until none are left. 
                let query = supabase
                    .from('raw_feedback_inputs')
                    .select('id, raw_text, respondents!inner(survey_id)')
                    .eq('target_unit_id', unitId)
                    .eq('is_quantitative', false)
                    .eq('requires_analysis', true);

                if (surveyId) query = query.eq('respondents.survey_id', surveyId);

                // We fetch a block of rows. But since Postgres might return rows that are 
                // currently being processed (or failed), we exclude the ones we've already tried this session.
                if (processedRowIds.size > 0) {
                    query = query.not('id', 'in', `(${Array.from(processedRowIds).join(',')})`);
                }

                // Fetch exactly one batch size
                const { data } = await query.limit(BATCH_SIZE).order('id', { ascending: true });

                if (!data || data.length === 0) {
                    hasMore = false;
                    addLog("✅ No more pending comments found.");
                    break;
                }

                // Filter out any that actually DO have segments already (just in case)
                const { data: existingSegments } = await supabase
                    .from('feedback_segments')
                    .select('raw_input_id')
                    .in('raw_input_id', data.map(r => r.id));

                const analyzedSet = new Set(existingSegments?.map((s: any) => s.raw_input_id) || []);
                const batch = data.filter(r => !analyzedSet.has(r.id));

                // Mark all fetched rows as processed for this session loop so we don't infinitely re-fetch them if they fail
                data.forEach(r => processedRowIds.add(r.id));

                if (batch.length === 0) {
                    continue; // Skip to next fetch if this entire batch was already analyzed
                }

                addLog(`Processing next batch (${batch.length} items)...`);

                try {
                    const response = await fetch('/api/ai/run-analysis', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            comments: batch,
                            taxonomy: categories,
                            allUnits: allUnits,
                            unitContext: { name: unit?.name, instructions }
                        })
                    });

                    if (!response.ok) throw new Error(`Server Error ${response.status}`);

                    const responseData = await response.json();

                    if (Array.isArray(responseData)) {
                        const inserts: any[] = [];
                        responseData.forEach((item: any) => {
                            item.segments.forEach((seg: any) => {
                                const catId = categories.find((c: any) => c.name === seg.category_name)?.id;
                                const relatedId = allUnits?.find((u: any) => u.name === seg.related_unit_name)?.id;

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

                        if (inserts.length > 0) {
                            const { error } = await supabase.from('feedback_segments').insert(inserts);
                            if (error) {
                                addLog(`❌ DB Save Error: ${error.message}`);
                            } else {
                                setProcessedCount(prev => prev + batch.length);
                            }
                        }
                    }
                } catch (err: any) {
                    addLog(`⚠️ Batch Failed: ${err.message}`);
                }

                // Small delay to prevent hammering the database too hard in a tight loop
                await new Promise(resolve => setTimeout(resolve, 500));
            } // End of Pagination loop

            if (!stopRef.current && !hasMore) {
                addLog("🏁 Analysis Complete.");
            }

        } catch (e: any) {
            addLog(`❌ Error: ${e.message}`);
            toast.error(e.message);
        } finally {
            setIsAnalyzing(false);
        }
    };

    const stopAnalysis = () => {
        stopRef.current = true;
        addLog("🛑 Stopping analysis...");
    };

    const resetAnalysis = async (unitId: string, surveyId?: string) => {
        addLog("🗑️ Starting Full Reset...");
        let clearing = true;
        while (clearing) {
            let query = supabase
                .from('feedback_segments')
                .select('id, raw_feedback_inputs!inner(target_unit_id, respondents!inner(survey_id))')
                .eq('raw_feedback_inputs.target_unit_id', unitId)
                .limit(1000);

            if (surveyId) query = query.eq('raw_feedback_inputs.respondents.survey_id', surveyId);

            const { data: segments, error } = await query;
            if (error || !segments || segments.length === 0) {
                clearing = false;
                break;
            }

            const ids = segments.map((s: any) => s.id);
            await supabase.from('feedback_segments').delete().in('id', ids);
            if (segments.length < 1000) clearing = false;
        }
        addLog("✅ Reset Complete.");
        setTotalPending(0);
        setProcessedCount(0);
    };

    const pct = totalPending > 0 ? Math.round((processedCount / totalPending) * 100) : 0;

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
