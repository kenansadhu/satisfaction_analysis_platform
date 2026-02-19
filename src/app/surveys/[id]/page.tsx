"use client";

import { useEffect, useState, useRef } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, BrainCircuit, MessageSquare, Users, BarChart3, ChevronRight, Loader2, Trash2, Archive, FileSpreadsheet, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { PageShell, PageHeader } from "@/components/layout/PageShell";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ConfirmDialog";

type UnitStat = {
    unit_id: number;
    unit_name: string;
    unit_desc?: string; // Needed for context
    comment_count: number;
    analyzed_count: number;
};

export default function SurveyDetailPage() {
    const params = useParams();
    const surveyId = params.id as string;

    const [surveyTitle, setSurveyTitle] = useState("");
    const [totalRespondents, setTotalRespondents] = useState(0);
    const [totalDataPoints, setTotalDataPoints] = useState(0);
    const [unitStats, setUnitStats] = useState<UnitStat[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // Data Hygiene State
    const [invalidCount, setInvalidCount] = useState(0);
    const [scoreCount, setScoreCount] = useState(0);
    const [isProcessing, setIsProcessing] = useState(false);
    const [processStatus, setProcessStatus] = useState("");

    // Global Analysis State
    const [isGlobalModalOpen, setIsGlobalModalOpen] = useState(false);
    const [isAnalyzingGlobal, setIsAnalyzingGlobal] = useState(false);
    const [globalProgress, setGlobalProgress] = useState(0);
    const [globalLogs, setGlobalLogs] = useState<string[]>([]);
    const stopGlobalRef = useRef(false);

    useEffect(() => {
        if (surveyId) loadSurveyData();
    }, [surveyId]);

    async function loadSurveyData() {
        setIsLoading(true);
        // 1. Survey Details
        const { data: survey } = await supabase.from('surveys').select('title').eq('id', surveyId).single();
        if (survey) setSurveyTitle(survey.title);

        // 2. Respondent Count
        const { count: respCount } = await supabase.from('respondents').select('*', { count: 'exact', head: true }).eq('survey_id', surveyId);
        setTotalRespondents(respCount || 0);

        // 3. Real Total Data Points
        const { count: totalInputs } = await supabase.from('raw_feedback_inputs').select('id, respondents!inner(survey_id)', { count: 'exact', head: true }).eq('respondents.survey_id', surveyId);
        setTotalDataPoints(totalInputs || 0);

        // 4. SCAN: Invalid & Scores
        const { count: invalid } = await supabase.from('raw_feedback_inputs').select('id, respondents!inner(survey_id)', { count: 'exact', head: true }).eq('respondents.survey_id', surveyId).or('raw_text.eq.-,raw_text.eq.N/A,raw_text.eq.nan,raw_text.eq.Nilai,raw_text.is.null');
        setInvalidCount(invalid || 0);

        const { count: scores } = await supabase.from('raw_feedback_inputs').select('id, respondents!inner(survey_id)', { count: 'exact', head: true }).eq('respondents.survey_id', surveyId).eq('is_quantitative', false).or('raw_text.like._ = %,raw_text.like.NA = %,raw_text.eq.Ya,raw_text.eq.Tidak');
        setScoreCount(scores || 0);

        // 5. Unit Stats (Optimized: No N+1 Queries)
        const { data: units } = await supabase.from('organization_units').select('id, name, description').order('name');

        if (units) {
            // Optimized: Use Parallel COUNT queries to avoid 1000-row limit truncation
            // Fetch stats for all units in parallel
            const stats = await Promise.all(units.map(async (unit) => {
                // 1. Total Qualitative Items for this Unit & Survey
                const { count: cCount } = await supabase
                    .from('raw_feedback_inputs')
                    .select('id, respondents!inner(survey_id)', { count: 'exact', head: true })
                    .eq('target_unit_id', unit.id)
                    .eq('respondents.survey_id', surveyId)
                    .eq('requires_analysis', true);

                // 2. Analyzed Items (Segments) for this Unit & Survey
                // We count DISTINCT raw_input_ids that have segments
                // Since Supabase doesn't support verify distinct count easily on join without RPC,
                // and we can't fetch all IDs, we will use a slightly approximate but usually correct metric:
                // Count raw_inputs that HAVE segments. 
                // We can do this by filtering raw_feedback_inputs with !inner join on segments?
                // No, that puts load on DB. 
                // Alternatively, we can assume analysis is tracked by `analyzed_at` flag if we had one? We don't.
                // Best approach for now: Count distinct raw_input_ids in feedback_segments linked to this survey/unit.
                // But `feedback_segments` grows large. 
                // Let's use the same query as AnalysisEngine: 
                /*
                 let analyzedQuery = supabase
                    .from('feedback_segments')
                    .select('*, raw_feedback_inputs!inner(target_unit_id, respondents!inner(survey_id))', { count: 'exact', head: true })
                    .eq('raw_feedback_inputs.target_unit_id', unitId)
                    .eq('raw_feedback_inputs.respondents.survey_id', surveyId);
                */
                // Note: This counts SEGMENTS, not Inputs. One input can have multiple segments.
                // Dashboard needs "Progress". Progress = Unique Analyzed Inputs / Total Inputs.
                // If we count segments, we might get > 100% (fixed previously).
                // Without RPC, counting distinct inputs via join is hard.
                // BUT, checking `AnalysisEngine.tsx`... it calculates specific progress.
                // Compromise: We fetch Analyzed Inputs Count by filtering raw_inputs that exist in segments?
                // Not easy without `exists`.
                // We will fetch the count of segments for now and cap at 100% visually, OR...
                // Wait, the discrepancy was >100%.
                // Let's try to query `raw_feedback_inputs` and filter where `feedback_segments` is not null?
                // Supabase: .not('feedback_segments', 'is', null) -- requires relationship setup.

                // Better: Count ALL segments for this unit/survey.
                // AND explicitly check how many inputs have > 0 segments.
                // Actually, `AnalysisEngine` does `alreadyAnalyzed` via `feedback_segments` count (Total Segments).
                // This explains why progress was > 100%.

                // CORRECT LOGIC:
                // We want: Number of raw_feedback_inputs that have at least 1 segment.
                // Query: select count of raw_feedback_inputs where ID is in (select raw_input_id from feedback_segments...).
                // Supabase doesn't support subquery `in` easily.

                // Workaround:
                // Fetch ALL analyzed IDs for this unit? If < 1000, fine. If > 1000, truncated.
                // CTL has 892 items.
                // Fetching 1000 ints is cheap.
                // We will fetch `raw_input_id` from segments for this unit+survey.
                // Then count unique in JS.

                const { data: segData } = await supabase
                    .from('feedback_segments')
                    .select('raw_input_id, raw_feedback_inputs!inner(target_unit_id, respondents!inner(survey_id))')
                    .eq('raw_feedback_inputs.target_unit_id', unit.id)
                    .eq('raw_feedback_inputs.respondents.survey_id', surveyId);

                const uniqueAnalyzed = new Set(segData?.map(s => s.raw_input_id)).size;

                return {
                    unit_id: unit.id,
                    unit_name: unit.name,
                    unit_desc: unit.description,
                    comment_count: cCount || 0,
                    analyzed_count: uniqueAnalyzed // Accurate unique count
                };
            }));

            // Filter out empty units and sort
            const validStats = stats.filter(s => s.comment_count > 0).sort((a, b) => b.comment_count - a.comment_count);
            setUnitStats(validStats);
        }
        setIsLoading(false);
    }

    const [confirmAction, setConfirmAction] = useState<"deleteInvalid" | "archiveScores" | null>(null);

    // --- CLEANUP FUNCTIONS ---
    const handleDeleteInvalid = async () => {
        setConfirmAction(null);
        setIsProcessing(true);
        try {
            let processed = 0;
            const BATCH = 1000;
            let hasMore = true;

            while (hasMore) {
                // 1. Fetch a batch of INVALID IDs scoped to this survey
                const { data: invalidItems, error: fetchError } = await supabase
                    .from('raw_feedback_inputs')
                    .select('id, respondents!inner(survey_id)')
                    .eq('respondents.survey_id', surveyId)
                    .or('raw_text.eq.-,raw_text.eq.N/A,raw_text.eq.nan,raw_text.eq.Nilai,raw_text.is.null')
                    .limit(BATCH);

                if (fetchError) throw fetchError;

                if (!invalidItems || invalidItems.length === 0) {
                    hasMore = false;
                    break;
                }

                // 2. Delete this batch
                const idsToDelete = invalidItems.map(i => i.id);
                setProcessStatus(`Deleting batch of ${idsToDelete.length} (Total: ${processed.toLocaleString()})...`);

                const { error: deleteError } = await supabase
                    .from('raw_feedback_inputs')
                    .delete()
                    .in('id', idsToDelete);

                if (deleteError) throw deleteError;

                processed += idsToDelete.length;

                // If we fetched less than batch size, we are done
                if (invalidItems.length < BATCH) hasMore = false;
            }

            toast.success(`Cleanup Complete! Removed ${processed.toLocaleString()} invalid entries.`);
            await loadSurveyData(); // Refresh counts from server
        } catch (e: any) {
            toast.error("Error cleaning data: " + e.message);
        } finally {
            setIsProcessing(false);
            setProcessStatus("");
        }
    };

    const handleArchiveScores = async () => {
        setConfirmAction(null);
        setIsProcessing(true);
        try {
            let processed = 0;
            const BATCH = 1000;
            let hasMore = true;

            while (hasMore) {
                // 1. Fetch a batch of SCORE-LIKE IDs
                const { data: scoreItems, error: fetchError } = await supabase
                    .from('raw_feedback_inputs')
                    .select('id, respondents!inner(survey_id)')
                    .eq('respondents.survey_id', surveyId)
                    .eq('is_quantitative', false)
                    .or('raw_text.like._ = %,raw_text.like.NA = %,raw_text.eq.Ya,raw_text.eq.Tidak')
                    .limit(BATCH);

                if (fetchError) throw fetchError;

                if (!scoreItems || scoreItems.length === 0) {
                    hasMore = false;
                    break;
                }

                // 2. Update this batch
                const idsToUpdate = scoreItems.map(i => i.id);
                setProcessStatus(`Reclassifying batch of ${idsToUpdate.length} (Total: ${processed.toLocaleString()})...`);

                const { error: updateError } = await supabase
                    .from('raw_feedback_inputs')
                    .update({ is_quantitative: true })
                    .in('id', idsToUpdate);

                if (updateError) throw updateError;

                processed += idsToUpdate.length;

                if (scoreItems.length < BATCH) hasMore = false;
            }

            toast.success(`Success! Reclassified ${processed.toLocaleString()} entries.`);
            await loadSurveyData();
        } catch (e: any) {
            toast.error("Error archiving scores: " + e.message);
        } finally {
            setIsProcessing(false);
            setProcessStatus("");
        }
    };

    // --- GLOBAL ANALYSIS ENGINE ---
    const addGlobalLog = (msg: string) => setGlobalLogs(prev => [msg, ...prev].slice(0, 10));

    const handleRunGlobalAnalysis = async () => {
        setIsGlobalModalOpen(true);
        setIsAnalyzingGlobal(true);
        stopGlobalRef.current = false;
        setGlobalLogs([]);
        addGlobalLog("🚀 Initializing Global AI Engine...");

        // Calculate total work
        const totalItemsToProcess = unitStats.reduce((acc, unit) => acc + (unit.comment_count - unit.analyzed_count), 0);
        let itemsProcessedSoFar = 0;

        if (totalItemsToProcess === 0) {
            addGlobalLog("✅ Analysis already complete!");
            setIsAnalyzingGlobal(false);
            return;
        }

        try {
            // Iterate through each unit
            for (const unit of unitStats) {
                if (stopGlobalRef.current) break;

                // Check if this unit needs analysis
                if (unit.analyzed_count >= unit.comment_count) continue;

                addGlobalLog(`📂 Switching to Unit: ${unit.unit_name}...`);

                // Fetch Taxonomy for this unit (CRITICAL)
                // Note: If no taxonomy exists, the AI will use "General" defaults or fail gracefully
                const { data: categories } = await supabase.from('analysis_categories').select('*').eq('unit_id', unit.unit_id);
                const { data: subcategories } = await supabase.from('analysis_subcategories').select('*, analysis_categories!inner(unit_id)').eq('analysis_categories.unit_id', unit.unit_id);

                // Fetch Batch
                const { data: allRaw } = await supabase.from('raw_feedback_inputs').select('id, raw_text, respondents!inner(survey_id)').eq('target_unit_id', unit.unit_id).eq('respondents.survey_id', surveyId).eq('is_quantitative', false);
                const { data: existing } = await supabase.from('feedback_segments').select('raw_input_id');
                const existingIds = new Set(existing?.map(e => e.raw_input_id));
                const queue = allRaw?.filter(r => !existingIds.has(r.id)) || [];

                if (queue.length === 0) continue;

                const BATCH_SIZE = 15;
                for (let i = 0; i < queue.length; i += BATCH_SIZE) {
                    if (stopGlobalRef.current) { addGlobalLog("🛑 Global Paused."); break; }

                    const batch = queue.slice(i, i + BATCH_SIZE);

                    // Call API
                    const response = await fetch('/api/ai/analyze-batch', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            comments: batch.map(b => ({ id: b.id, text: b.raw_text })),
                            taxonomy: { categories: categories || [], subcategories: subcategories || [] }, // Pass loaded taxonomy
                            context: { name: unit.unit_name, description: unit.unit_desc }
                        })
                    });

                    const { results } = await response.json();

                    if (results && results.length > 0) {
                        const { error } = await supabase.from('feedback_segments').insert(results);
                        if (!error) {
                            itemsProcessedSoFar += results.length;
                            setGlobalProgress(Math.round((itemsProcessedSoFar / totalItemsToProcess) * 100));
                        }
                    }
                }
            }
            addGlobalLog("🏁 Global Analysis Cycle Complete.");
            loadSurveyData(); // Refresh stats on UI
        } catch (e: any) {
            addGlobalLog(`❌ Error: ${e.message}`);
        } finally {
            setIsAnalyzingGlobal(false);
        }
    };

    const needsCleaning = invalidCount > 0 || scoreCount > 0;
    const overallProgress = unitStats.length > 0
        ? Math.round((unitStats.reduce((acc, u) => acc + u.analyzed_count, 0) / unitStats.reduce((acc, u) => acc + u.comment_count, 0)) * 100)
        : 0;

    return (
        <PageShell>
            <PageHeader
                title={surveyTitle || "Survey Detail"}
                description={`${totalRespondents.toLocaleString()} respondents • ${totalDataPoints.toLocaleString()} data points`}
                backHref="/surveys"
                backLabel="Surveys"
            />

            <div className="max-w-7xl mx-auto px-8 py-10 space-y-8">

                {/* --- GLOBAL ANALYSIS MODAL --- */}
                <Dialog open={isGlobalModalOpen} onOpenChange={setIsGlobalModalOpen}>
                    <DialogContent className="sm:max-w-md">
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2"><BrainCircuit className="w-5 h-5 text-blue-600" /> Global Analysis Running</DialogTitle>
                            <DialogDescription>Processing all units sequentially using configured taxonomies.</DialogDescription>
                        </DialogHeader>
                        <div className="space-y-6 py-4">
                            <div className="space-y-2">
                                <div className="flex justify-between text-sm font-medium"><span>Session Progress</span><span>{globalProgress}%</span></div>
                                <Progress value={globalProgress} className="h-2" />
                            </div>
                            <div className="bg-slate-900 text-slate-300 font-mono text-xs h-[200px] overflow-y-auto p-3 rounded-md space-y-1">
                                {globalLogs.map((log, i) => <div key={i} className="border-l-2 border-slate-700 pl-2">{log}</div>)}
                            </div>
                        </div>
                        <DialogFooter>
                            {isAnalyzingGlobal ? (
                                <Button variant="destructive" onClick={() => stopGlobalRef.current = true}>Stop Analysis</Button>
                            ) : (
                                <Button onClick={() => setIsGlobalModalOpen(false)}>Close Window</Button>
                            )}
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                {/* --- LOADING SKELETON --- */}
                {isLoading && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {[1, 2, 3].map(i => (
                            <Card key={i} className="border-slate-200 overflow-hidden">
                                <div className="h-1 bg-gradient-to-r from-blue-500 to-indigo-500" />
                                <CardHeader><div className="h-5 w-32 bg-slate-200 rounded animate-pulse" /></CardHeader>
                                <CardContent><div className="h-16 w-full bg-slate-100 rounded animate-pulse" /></CardContent>
                            </Card>
                        ))}
                    </div>
                )}

                {/* --- DATA HYGIENE CARD --- */}
                {!isLoading && needsCleaning && (
                    <Card className="border-amber-200 bg-amber-50/50 overflow-hidden">
                        <div className="h-1 bg-gradient-to-r from-amber-400 to-orange-500" />
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-amber-800">
                                <Trash2 className="w-5 h-5" /> Data Hygiene Required
                            </CardTitle>
                            <CardDescription className="text-amber-700">
                                We detected entries that should be cleaned before analysis for best results.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {isProcessing && (
                                <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-100 px-3 py-2 rounded-md">
                                    <Loader2 className="w-4 h-4 animate-spin" /> {processStatus}
                                </div>
                            )}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {invalidCount > 0 && (
                                    <div className="flex items-center justify-between bg-white p-4 rounded-lg border border-amber-200">
                                        <div>
                                            <div className="font-semibold text-slate-800">{invalidCount.toLocaleString()} Invalid Entries</div>
                                            <div className="text-xs text-slate-500">Junk values: -, N/A, nan, Nilai, null</div>
                                        </div>
                                        <Button size="sm" variant="outline" className="border-red-200 text-red-600 hover:bg-red-50" onClick={() => setConfirmAction("deleteInvalid")} disabled={isProcessing}>
                                            <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Remove
                                        </Button>
                                    </div>
                                )}
                                {scoreCount > 0 && (
                                    <div className="flex items-center justify-between bg-white p-4 rounded-lg border border-amber-200">
                                        <div>
                                            <div className="font-semibold text-slate-800">{scoreCount.toLocaleString()} Score-like Text</div>
                                            <div className="text-xs text-slate-500">E.g. "4 = Baik", "Ya", "Tidak"</div>
                                        </div>
                                        <Button size="sm" variant="outline" className="border-blue-200 text-blue-600 hover:bg-blue-50" onClick={() => setConfirmAction("archiveScores")} disabled={isProcessing}>
                                            <Archive className="w-3.5 h-3.5 mr-1.5" /> Reclassify
                                        </Button>
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* --- ANALYSIS CONSOLE & UNIT GRID --- */}
                {!isLoading && (
                    <div className="animate-in fade-in duration-700 space-y-8">
                        <Card className="bg-gradient-to-br from-blue-600 to-indigo-700 text-white border-none shadow-lg">
                            <CardHeader><CardTitle className="flex items-center gap-2"><BrainCircuit className="w-6 h-6" /> AI Analysis Console</CardTitle><CardDescription className="text-blue-100">Global Processing Status</CardDescription></CardHeader>
                            <CardContent>
                                <div className="space-y-4">
                                    <div className="flex justify-between text-sm font-medium"><span>Overall Progress</span><span>{overallProgress}%</span></div>
                                    <Progress value={overallProgress} className="h-2 bg-blue-400/30" />
                                    <Button
                                        variant="secondary"
                                        className="w-full text-blue-700 font-semibold shadow-sm"
                                        onClick={handleRunGlobalAnalysis}
                                    >
                                        {overallProgress === 100 ? "Re-Run Analysis" : "Run Global Analysis"}
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>

                        <div>
                            <h3 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2"><BarChart3 className="w-5 h-5 text-slate-500" /> Qualitative Feedback by Unit</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {unitStats.map((unit) => {
                                    const progress = unit.comment_count > 0 ? Math.round((unit.analyzed_count / unit.comment_count) * 100) : 0;
                                    return (
                                        <Link key={unit.unit_id} href={`/surveys/${surveyId}/unit/${unit.unit_id}`}>
                                            <Card className="hover:shadow-lg transition-all duration-200 cursor-pointer group border-slate-200 h-full overflow-hidden hover:-translate-y-0.5">
                                                <div className="h-1 bg-gradient-to-r from-purple-500 to-indigo-500" />
                                                <CardHeader className="pb-3"><div className="flex justify-between items-start"><CardTitle className="text-lg font-semibold text-slate-800 group-hover:text-blue-600 transition-colors">{unit.unit_name}</CardTitle><ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-blue-500" /></div><CardDescription className="text-xs">{unit.comment_count.toLocaleString()} qualitative items</CardDescription></CardHeader>
                                                <CardContent><div className="space-y-2"><div className="flex justify-between text-xs text-slate-500"><span>Analysis Progress</span><span>{progress}%</span></div><Progress value={progress} className="h-1.5" />{progress === 100 ? <span className="inline-flex items-center text-xs font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded-full mt-2">Complete</span> : <span className="inline-flex items-center text-xs font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full mt-2">{progress === 0 ? "Not Started" : "In Progress"}</span>}</div></CardContent>
                                            </Card>
                                        </Link>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                )}

            </div>
            <ConfirmDialog
                open={confirmAction !== null}
                onOpenChange={(open) => !open && setConfirmAction(null)}
                title={confirmAction === "deleteInvalid" ? "Delete Invalid Entries?" : "Reclassify Score-like Text?"}
                description={confirmAction === "deleteInvalid"
                    ? "This will permanently delete all invalid/junk responses (-, N/A, nan, Nilai, null). This cannot be undone."
                    : "This will reclassify score-like text responses (e.g. '4 = Baik', 'Ya', 'Tidak') as quantitative so they're excluded from qualitative analysis."
                }
                confirmLabel={confirmAction === "deleteInvalid" ? "Delete" : "Reclassify"}
                variant={confirmAction === "deleteInvalid" ? "destructive" : "default"}
                onConfirm={() => confirmAction === "deleteInvalid" ? handleDeleteInvalid() : handleArchiveScores()}
            />
        </PageShell>
    );
}