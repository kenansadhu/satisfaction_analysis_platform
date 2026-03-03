"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Loader2, Play, Pause, Database, CheckCircle2, AlertCircle, Trash2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useAnalysis } from "@/context/AnalysisContext";

export default function AnalysisEngine({ unitId, surveyId }: { unitId: string; surveyId?: string }) {
    // Hooks
    const {
        isAnalyzing,
        currentUnitId,
        progress,
        logs,
        startAnalysis,
        stopAnalysis,
        resetAnalysis
    } = useAnalysis();

    // Local Data State (Visuals only)
    const [categories, setCategories] = useState<any[]>([]);
    const [allUnits, setAllUnits] = useState<any[]>([]);
    const [instructions, setInstructions] = useState<string[]>([]);

    const [confirmReset, setConfirmReset] = useState(false);
    const [isResetting, setIsResetting] = useState(false);

    useEffect(() => {
        loadStaticResources();
    }, [unitId]);

    // Independent loader for static stats (so we see them even if not running)
    async function loadStaticResources() {
        const { data: unit } = await supabase.from('organization_units').select('*').eq('id', unitId).single();
        if (unit) {
            const { data: inst } = await supabase.from('unit_analysis_instructions').select('instruction').eq('unit_id', unitId);
            if (inst) setInstructions([unit.analysis_context, ...inst.map((i: any) => i.instruction)].filter(Boolean));
        }
        const { data: cats } = await supabase.from('analysis_categories').select('id, name').eq('unit_id', unitId);
        if (cats) setCategories(cats);

        const { data: units } = await supabase.from('organization_units').select('id, name');
        if (units) setAllUnits(units);
    }

    const [pendingCount, setPendingCount] = useState<number | null>(null);

    const isActive = isAnalyzing && currentUnitId === unitId;
    const isOtherActive = isAnalyzing && currentUnitId !== unitId;

    useEffect(() => {
        if (!isActive) {
            fetchPendingCount();
        }
    }, [isActive, unitId, surveyId]);

    const fetchPendingCount = async () => {
        if (!unitId) return;

        try {
            // Pre-fetch respondent IDs (avoids slow inner join)
            let respIds: number[] = [];
            if (surveyId && surveyId.trim() !== '') {
                let rPage = 0;
                while (true) {
                    const { data: rBat } = await supabase.from('respondents').select('id').eq('survey_id', surveyId).order('id').range(rPage * 1000, (rPage + 1) * 1000 - 1);
                    if (!rBat || rBat.length === 0) break;
                    respIds.push(...rBat.map((r: any) => r.id));
                    if (rBat.length < 1000) break;
                    rPage++;
                }
            }

            // 1. & 2. Get Total Candidates and Analyzed Candidates
            let total = 0;
            let analyzed = 0;

            if (respIds.length > 0) {
                const CHUNK_SIZE = 100;

                // Get Total Candidates (Raw Inputs)
                let totalPromises = [];
                for (let i = 0; i < respIds.length; i += CHUNK_SIZE) {
                    const chunk = respIds.slice(i, i + CHUNK_SIZE);
                    totalPromises.push(
                        supabase.from('raw_feedback_inputs')
                            .select('*', { count: 'exact', head: true })
                            .eq('target_unit_id', unitId)
                            .eq('is_quantitative', false)
                            .eq('requires_analysis', true)
                            .in('respondent_id', chunk)
                    );
                }
                const totalResults = await Promise.all(totalPromises);
                for (const res of totalResults) total += (res.count || 0);

            } else if (!surveyId || surveyId.trim() === '') {
                // Fallback for when no survey ID is selected (all surveys for unit)
                const { count: t } = await supabase.from('raw_feedback_inputs')
                    .select('*', { count: 'exact', head: true })
                    .eq('target_unit_id', unitId)
                    .eq('is_quantitative', false)
                    .eq('requires_analysis', true);
                total = t || 0;
            }

            // 'total' perfectly reflects the current queue size
            setPendingCount(total || 0);

        } catch (e: any) {
            console.error("Error fetching pending count:", e);
            setPendingCount(0);
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in">
            <Card className="border-blue-200 bg-blue-50/20">
                <CardHeader>
                    <div className="flex justify-between items-center">
                        <div>
                            <CardTitle className="text-xl flex items-center gap-2"><Sparkles className="w-5 h-5 text-blue-600" /> Sentiment & Categorization Engine</CardTitle>
                            <CardDescription>
                                Sentiment Tagging • Category Assignment • Idea Segmentation • Cross-Unit Routing
                            </CardDescription>
                        </div>
                        <div className="text-right">
                            {/* Show Context Progress if active, else Local/Static */}
                            <div className="text-2xl font-bold text-slate-700">
                                {isActive ? Math.max(0, progress.total - progress.processed) : (pendingCount !== null ? pendingCount : "Loading...")}
                            </div>
                            <div className="text-xs text-slate-500">Pending Comments</div>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="space-y-6">

                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 gap-4 mb-4">
                        <div className="bg-white p-3 rounded border text-center">
                            <div className="text-sm text-slate-500">Categories Loaded</div>
                            <div className="font-bold text-lg">{categories.length}</div>
                        </div>
                        <div className="bg-white p-3 rounded border text-center">
                            <div className="text-sm text-slate-500">Custom Rules</div>
                            <div className="font-bold text-lg">{instructions.length}</div>
                        </div>
                    </div>

                    {/* Progress Section */}
                    {isActive && (
                        <div className="space-y-2">
                            <div className="flex justify-between text-xs font-semibold text-blue-700">
                                <span>Processing... {progress.processed} / {progress.total}</span>
                                <span>{progress.percentage}%</span>
                            </div>
                            <Progress value={progress.percentage} className="h-3" />
                        </div>
                    )}

                    {/* Controls */}
                    <div className="flex justify-center gap-4">
                        {isOtherActive ? (
                            <div className="text-amber-600 font-semibold bg-amber-50 px-4 py-2 rounded border border-amber-200">
                                ⚠️ Another unit is currently being analyzed. Please wait via the "Other Units" tab.
                            </div>
                        ) : !isActive ? (
                            <div className="flex gap-4">
                                <Button size="lg" className="w-48 bg-blue-600 hover:bg-blue-700 shadow-lg" onClick={() => startAnalysis(unitId, surveyId)} disabled={isResetting}>
                                    <Play className="w-5 h-5 mr-2" /> Start Analysis
                                </Button>
                                <Button size="lg" variant="outline" className="w-48 border-red-200 text-red-600 hover:bg-red-50" onClick={() => setConfirmReset(true)} disabled={isResetting}>
                                    {isResetting ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Trash2 className="w-5 h-5 mr-2" />}
                                    {isResetting ? "Resetting..." : "Reset & Clear"}
                                </Button>
                            </div>
                        ) : (
                            <Button size="lg" variant="destructive" className="w-48 shadow-lg" onClick={stopAnalysis}>
                                <Pause className="w-5 h-5 mr-2" /> Pause
                            </Button>
                        )}
                    </div>

                    {/* Logs Console */}
                    <div className="bg-slate-900 text-slate-300 font-mono text-xs h-[200px] overflow-y-auto p-4 rounded-md space-y-1 shadow-inner">
                        {logs.length === 0 && <div className="text-slate-600 italic">Ready to start...</div>}
                        {isActive || logs.length > 0 ? logs.map((log, i) => (
                            <div key={i} className="border-l-2 border-slate-600 pl-2">{log}</div>
                        )) : null}
                    </div>

                </CardContent>
            </Card>
            <ConfirmDialog
                open={confirmReset}
                onOpenChange={setConfirmReset}
                title="Clear All Analysis?"
                description="This will permanently delete ALL analysis results. Are you sure?"
                confirmLabel="Yes, Clear Everything"
                variant="destructive"
                onConfirm={async () => {
                    setConfirmReset(false);
                    setIsResetting(true);
                    await resetAnalysis(unitId, surveyId);
                    // Refresh pending count after reset
                    await fetchPendingCount();
                    setIsResetting(false);
                    toast.success("Reset complete! All analysis data has been cleared.");
                }}
            />
        </div>
    );
}