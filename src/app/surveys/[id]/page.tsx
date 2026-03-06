"use client";

import { useEffect, useState, useRef } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, BrainCircuit, MessageSquare, Users, BarChart3, ChevronRight, Loader2, Trash2, Archive, FileSpreadsheet, CheckCircle2, Settings, PieChart } from "lucide-react";
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
    const [surveyYear, setSurveyYear] = useState<number | null>(null);
    const [totalRespondents, setTotalRespondents] = useState(0);
    const [totalDataPoints, setTotalDataPoints] = useState(0);
    const [unitStats, setUnitStats] = useState<UnitStat[]>([]);
    const [isLoading, setIsLoading] = useState(true);

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

        // === PHASE 1: Get survey info and ALL respondent IDs (paginated) ===
        const [surveyRes, unitsRes] = await Promise.all([
            supabase.from('surveys').select('title, year').eq('id', surveyId).single(),
            supabase.from('organization_units').select('id, name, description').order('name'),
        ]);

        if (surveyRes.data) {
            setSurveyTitle(surveyRes.data.title);
            setSurveyYear(surveyRes.data.year || null);
        }

        let allRespIds: string[] = [];
        let hasMoreResps = true;
        let page = 0;
        const PAGE_SIZE = 1000;

        while (hasMoreResps) {
            const { data, error } = await supabase
                .from('respondents')
                .select('id')
                .eq('survey_id', surveyId)
                .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

            if (error) {
                console.error("Error fetching respondents page:", error);
                break;
            }

            if (data && data.length > 0) {
                allRespIds = [...allRespIds, ...data.map(r => r.id)];
                hasMoreResps = data.length === PAGE_SIZE;
                page++;
            } else {
                hasMoreResps = false;
            }
        }

        setTotalRespondents(allRespIds.length);
        const respIds = allRespIds;

        // === PHASE 2: Controlled Parallel Aggregation — Speed + Safety ===
        let totalDP = 0;
        const totalByUnit = new Map<number, number>();
        const commentsByUnit = new Map<number, number>();
        const analyzedByUnit = new Map<number, number>();

        const AGG_CHUNK = 250;
        const CONCURRENCY_LIMIT = 5; // Fetch up to 5 chunks in parallel at once

        for (let i = 0; i < respIds.length; i += AGG_CHUNK * CONCURRENCY_LIMIT) {
            const batchPromises = [];
            for (let j = 0; j < CONCURRENCY_LIMIT; j++) {
                const start = i + (j * AGG_CHUNK);
                if (start >= respIds.length) break;
                const chunk = respIds.slice(start, start + AGG_CHUNK);
                batchPromises.push(
                    supabase.rpc('get_respondent_group_counts', {
                        p_respondent_ids: chunk
                    })
                );
            }

            const results = await Promise.all(batchPromises);

            for (const { data: rows, error: batchErr } of results) {
                if (batchErr) {
                    console.warn(`[survey detail counts] Aggregation batch failed:`, batchErr.message);
                    continue;
                }

                for (const row of (rows || [])) {
                    const uId = parseInt(row.out_unit_id);
                    const tCount = parseInt(row.total_count) || 0;
                    const cCount = parseInt(row.comment_count) || 0;
                    const aCount = parseInt(row.analyzed_count) || 0;

                    totalDP += tCount;
                    totalByUnit.set(uId, (totalByUnit.get(uId) || 0) + tCount);
                    commentsByUnit.set(uId, (commentsByUnit.get(uId) || 0) + cCount);
                    analyzedByUnit.set(uId, (analyzedByUnit.get(uId) || 0) + aCount);
                }
            }
        }

        setTotalDataPoints(totalDP);

        const units = unitsRes.data;
        if (units) {
            const stats = units.map((unit: { id: number; name: string; description: string | null }) => {
                const commentCount = commentsByUnit.get(unit.id) || 0;
                const analyzedCount = analyzedByUnit.get(unit.id) || 0;
                return {
                    unit_id: unit.id,
                    unit_name: unit.name,
                    unit_desc: unit.description || undefined,
                    comment_count: commentCount,
                    analyzed_count: analyzedCount,
                };
            });

            // Show units that have at least one total data point
            const sortedStats = stats
                .filter(s => (totalByUnit.get(s.unit_id) || 0) > 0)
                .sort((a: UnitStat, b: UnitStat) => a.unit_name.localeCompare(b.unit_name));

            setUnitStats(sortedStats);
        }
        setIsLoading(false);
    }

    // --- GLOBAL ANALYSIS ENGINE ---
    const addGlobalLog = (msg: string) => setGlobalLogs(prev => [msg, ...prev].slice(0, 50));

    const handleRunGlobalAnalysis = async () => {
        setIsGlobalModalOpen(true);
        setIsAnalyzingGlobal(true);
        stopGlobalRef.current = false;
        setGlobalLogs([]);
        setGlobalProgress(0);
        addGlobalLog("🚀 Initializing Global AI Engine...");

        // Pre-fetch respondent IDs
        const { data: resps } = await supabase.from('respondents').select('id').eq('survey_id', surveyId);
        const respIds = (resps || []).map((r: any) => r.id);
        addGlobalLog(`📋 Survey has ${respIds.length.toLocaleString()} respondents`);

        const unitsToProcess = unitStats.filter(u => u.comment_count > 0);
        let unitsDone = 0;

        try {
            for (const unit of unitsToProcess) {
                if (stopGlobalRef.current) { addGlobalLog("🛑 Stopped by user."); break; }

                addGlobalLog(`\n📂 Unit: ${unit.unit_name}`);

                // 1. Check categories exist
                const { data: categories } = await supabase.from('analysis_categories').select('id, name, keywords').eq('unit_id', unit.unit_id);
                if (!categories || categories.length === 0) {
                    addGlobalLog(`⚠️ SKIPPED: No categories built for ${unit.unit_name}`);
                    unitsDone++;
                    setGlobalProgress(Math.round((unitsDone / unitsToProcess.length) * 100));
                    continue;
                }
                addGlobalLog(`   ✅ ${categories.length} categories loaded`);

                // 2. Count pending comments (requires_analysis = true)
                let pendingCount = 0;
                const CHUNK = 50;
                for (let i = 0; i < respIds.length; i += CHUNK) {
                    const chunk = respIds.slice(i, i + CHUNK);
                    const { count } = await supabase.from('raw_feedback_inputs')
                        .select('*', { count: 'exact', head: true })
                        .eq('target_unit_id', unit.unit_id)
                        .eq('is_quantitative', false)
                        .eq('requires_analysis', true)
                        .in('respondent_id', chunk);
                    pendingCount += (count || 0);
                }

                if (pendingCount === 0) {
                    addGlobalLog(`   ✅ Already analyzed (0 pending)`);
                    unitsDone++;
                    setGlobalProgress(Math.round((unitsDone / unitsToProcess.length) * 100));
                    continue;
                }

                addGlobalLog(`   ⏳ ${pendingCount} comments to analyze...`);

                // 3. Process in batches of 50 using process-queue API
                let processed = 0;
                const BATCH_SIZE = 50;
                while (processed < pendingCount) {
                    if (stopGlobalRef.current) { addGlobalLog("🛑 Stopped by user."); break; }

                    const response = await fetch('/api/ai/process-queue', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            unitId: unit.unit_id,
                            surveyId: parseInt(surveyId),
                            batchSize: BATCH_SIZE
                        })
                    });

                    const result = await response.json();
                    if (result.error) {
                        addGlobalLog(`   ❌ Error: ${result.error}`);
                        break;
                    }

                    processed += (result.processed || 0);
                    addGlobalLog(`   ✅ Batch done: ${processed}/${pendingCount}`);

                    if (result.remaining === 0 || result.processed === 0) break;

                    // Brief pause between batches
                    await new Promise(r => setTimeout(r, 1000));
                }

                unitsDone++;
                setGlobalProgress(Math.round((unitsDone / unitsToProcess.length) * 100));
                addGlobalLog(`   🏁 ${unit.unit_name} complete!`);
            }

            addGlobalLog("\n🏁 Global Analysis Cycle Complete.");
            toast.success("Global analysis finished!");
            loadSurveyData();
        } catch (e: any) {
            addGlobalLog(`❌ Fatal Error: ${e.message}`);
            toast.error("Global analysis failed: " + e.message);
        } finally {
            setIsAnalyzingGlobal(false);
        }
    };

    const overallProgress = unitStats.length > 0
        ? Math.round((unitStats.reduce((acc: number, u: UnitStat) => acc + u.analyzed_count, 0) / unitStats.reduce((acc: number, u: UnitStat) => acc + (u.comment_count || 1), 0)) * 100)
        : 0;

    return (
        <PageShell>
            <PageHeader
                title={
                    <span className="flex items-center gap-3">
                        {surveyTitle || "Survey Detail"}
                        {surveyYear && (
                            <Badge variant="secondary" className="text-sm font-normal bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300">
                                {surveyYear}
                            </Badge>
                        )}
                    </span>
                }
                description={`${totalRespondents.toLocaleString()} respondents • ${totalDataPoints.toLocaleString()} data points`}
                backHref="/surveys"
                backLabel="Surveys"
                actions={
                    <Link href={`/surveys/${surveyId}/manage`}>
                        <Button variant="outline" size="sm" className="gap-2 border-slate-300 hover:border-blue-300 hover:text-blue-600">
                            <Settings className="w-4 h-4" /> Manage Survey
                        </Button>
                    </Link>
                }
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
                                        disabled={true}
                                        title="Global analysis is not yet activated. Contact admin to enable."
                                    >
                                        {overallProgress === 100 ? "Re-Run Analysis" : "Run Global Analysis"}
                                        <span className="ml-2 text-xs font-normal opacity-60">(Coming Soon)</span>
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>

                        <div>
                            <h3 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2"><BarChart3 className="w-5 h-5 text-slate-500" /> Qualitative Feedback by Unit</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {unitStats.map((unit) => {
                                    const progress = unit.comment_count > 0 ? Math.min(100, Math.round((unit.analyzed_count / unit.comment_count) * 100)) : 0;
                                    const isComplete = progress === 100;
                                    return (
                                        <Card key={unit.unit_id} className="hover:shadow-lg transition-all duration-200 border-slate-200 h-full overflow-hidden hover:-translate-y-0.5">
                                            <div className="h-1 bg-gradient-to-r from-purple-500 to-indigo-500" />
                                            <CardHeader className="pb-3">
                                                <div className="flex justify-between items-start">
                                                    <div>
                                                        <CardTitle className="text-lg font-semibold text-slate-800">{unit.unit_name}</CardTitle>
                                                        <CardDescription className="text-xs">{unit.comment_count.toLocaleString()} qualitative items</CardDescription>
                                                    </div>
                                                </div>
                                            </CardHeader>
                                            <CardContent className="space-y-3">
                                                <div className="space-y-2">
                                                    <div className="flex justify-between text-xs text-slate-500"><span>Analysis Progress</span><span>{progress}%</span></div>
                                                    <Progress value={progress} className="h-1.5" />
                                                    {isComplete
                                                        ? <span className="inline-flex items-center text-xs font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded-full">Complete</span>
                                                        : <span className="inline-flex items-center text-xs font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">{progress === 0 ? "Not Started" : "In Progress"}</span>
                                                    }
                                                </div>
                                                <div className="flex gap-2 pt-1">
                                                    <Link href={`/surveys/${surveyId}/unit/${unit.unit_id}`} className="flex-1">
                                                        <Button variant="outline" size="sm" className="w-full text-xs gap-1.5 border-slate-200 hover:border-blue-300 hover:text-blue-600">
                                                            <BrainCircuit className="w-3.5 h-3.5" /> Analysis Workspace
                                                        </Button>
                                                    </Link>
                                                    {unit.analyzed_count > 0 && (
                                                        <Link href={`/surveys/${surveyId}/unit/${unit.unit_id}?tab=insights`}>
                                                            <Button variant="outline" size="sm" className="text-xs gap-1.5 border-indigo-200 text-indigo-600 hover:bg-indigo-50 hover:border-indigo-300">
                                                                <PieChart className="w-3.5 h-3.5" /> Insights
                                                            </Button>
                                                        </Link>
                                                    )}
                                                </div>
                                            </CardContent>
                                        </Card>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                )}

            </div>

        </PageShell>
    );
}