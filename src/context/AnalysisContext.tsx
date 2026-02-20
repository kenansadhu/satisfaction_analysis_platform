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

            // 2. Determine Total Candidates
            let countQuery = supabase
                .from('raw_feedback_inputs')
                .select('*', { count: 'exact', head: true })
                .eq('target_unit_id', unitId)
                .eq('is_quantitative', false)
                .eq('requires_analysis', true);
            if (surveyId) countQuery = countQuery.eq('respondents.survey_id', surveyId);

            const { count: totalCandidates } = await countQuery;
            setTotalPending(totalCandidates || 0);
            setProcessedCount(0);

            if (!totalCandidates) {
                addLog("✅ No pending comments found.");
                setIsAnalyzing(false);
                return;
            }

            // 3. Process in Chunks to prevent memory bloat
            let hasMore = true;
            let page = 0;
            const PAGE_SIZE = 500;
            const BATCH_SIZE = 50;

            addLog("Beginning continuous analysis stream...");

            while (hasMore && !stopRef.current) {
                let query = supabase
                    .from('raw_feedback_inputs')
                    .select('id, raw_text, respondents!inner(survey_id)')
                    .eq('target_unit_id', unitId)
                    .eq('is_quantitative', false)
                    .eq('requires_analysis', true);

                if (surveyId) query = query.eq('respondents.survey_id', surveyId);

                const { data } = await query.range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

                if (!data || data.length === 0) {
                    hasMore = false;
                    break;
                }

                // Filter already analyzed from this specific page
                const { data: existingSegments } = await supabase
                    .from('feedback_segments')
                    .select('raw_input_id')
                    .in('raw_input_id', data.map(r => r.id));

                const analyzedSet = new Set(existingSegments?.map((s: any) => s.raw_input_id) || []);
                const queue = data.filter(r => !analyzedSet.has(r.id));

                // Process the valid items in this page
                for (let i = 0; i < queue.length; i += BATCH_SIZE) {
                    if (stopRef.current) { addLog("🛑 Process Paused."); break; }

                    const batch = queue.slice(i, i + BATCH_SIZE);
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

                        const data = await response.json();

                        if (Array.isArray(data)) {
                            const inserts: any[] = [];
                            data.forEach((item: any) => {
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
                                if (error) addLog(`❌ DB Save Error: ${error.message}`);
                                else setProcessedCount(prev => prev + batch.length);
                            }
                        }
                    } catch (err: any) {
                        addLog(`⚠️ Batch Failed: ${err.message}`);
                    }
                } // End of Queue chunk logic

                if (data.length < PAGE_SIZE) hasMore = false;
                page++;
            } // End of Pagination loop

            if (!stopRef.current) addLog("🏁 Analysis Complete.");

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
