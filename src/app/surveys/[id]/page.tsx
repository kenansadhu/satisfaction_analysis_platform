"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    ArrowRight, BrainCircuit, Users, BarChart3, CheckCircle2,
    Settings, PieChart, Clock, Loader2, CircleDashed, Sparkles,
    Search, Filter
} from "lucide-react";
import Link from "next/link";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { PageShell, PageHeader } from "@/components/layout/PageShell";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";

type AnalysisStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";

type UnitCard = {
    unit_id: number;
    unit_name: string;
    unit_short_name: string | null;
    unit_desc: string | null;
    analysis_status: AnalysisStatus;
};

export default function SurveyDetailPage() {
    const params = useParams();
    const surveyId = params.id as string;
    const router = useRouter();

    const [surveyTitle, setSurveyTitle] = useState("");
    const [surveyYear, setSurveyYear] = useState<number | null>(null);
    const [totalRespondents, setTotalRespondents] = useState(0);
    const [units, setUnits] = useState<UnitCard[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [statusFilter, setStatusFilter] = useState<AnalysisStatus | "ALL">("ALL");

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

        // === Fast parallel fetch: survey info + units + respondent count + per-survey jobs ===
        const [surveyRes, unitsRes, respCountRes, jobsRes] = await Promise.all([
            supabase.from('surveys').select('title, year').eq('id', surveyId).single(),
            supabase.from('organization_units').select('id, name, short_name, description, analysis_status').order('name'),
            supabase.from('respondents').select('id', { count: 'exact', head: true }).eq('survey_id', surveyId),
            supabase.from('analysis_jobs').select('unit_id, status').eq('survey_id', parseInt(surveyId)),
        ]);

        if (surveyRes.data) {
            setSurveyTitle(surveyRes.data.title);
            setSurveyYear(surveyRes.data.year || null);
        }

        setTotalRespondents(respCountRes.count || 0);

        if (unitsRes.data) {
            // Derive per-survey status from analysis_jobs (not the global organization_units.analysis_status)
            const surveyStatusMap = new Map<number, AnalysisStatus>();
            for (const job of (jobsRes.data || [])) {
                const unitId = job.unit_id as number;
                const current = surveyStatusMap.get(unitId);
                if (job.status === 'COMPLETED') {
                    surveyStatusMap.set(unitId, 'COMPLETED');
                } else if ((job.status === 'PROCESSING' || job.status === 'PENDING' || job.status === 'STOPPED') && current !== 'COMPLETED') {
                    surveyStatusMap.set(unitId, 'IN_PROGRESS');
                }
            }

            setUnits(unitsRes.data.map((u: any) => {
                return {
                    unit_id: u.id,
                    unit_name: u.name,
                    unit_short_name: u.short_name || null,
                    unit_desc: u.description || null,
                    analysis_status: surveyStatusMap.get(u.id) || 'NOT_STARTED',
                };
            }));

            // Background self-heal: if any jobs are stale (PENDING/PROCESSING/STOPPED) but
            // all feedback items for this survey have been analyzed, mark them COMPLETED.
            const staleUnitIds = [...surveyStatusMap.entries()]
                .filter(([, s]) => s === 'IN_PROGRESS')
                .map(([id]) => id);

            if (staleUnitIds.length > 0) {
                void (async () => {
                    const nowComplete: number[] = [];

                    for (const unitId of staleUnitIds) {
                        const { count } = await supabase.from('raw_feedback_inputs')
                            .select('*', { count: 'exact', head: true })
                            .eq('target_unit_id', unitId)
                            .eq('is_quantitative', false)
                            .eq('requires_analysis', true);
                        if ((count || 0) === 0) nowComplete.push(unitId);
                    }

                    if (nowComplete.length === 0) return;

                    await supabase.from('analysis_jobs')
                        .update({ status: 'COMPLETED' })
                        .eq('survey_id', parseInt(surveyId))
                        .in('unit_id', nowComplete)
                        .in('status', ['PENDING', 'PROCESSING', 'STOPPED']);

                    setUnits(prev => prev.map(u =>
                        nowComplete.includes(u.unit_id) ? { ...u, analysis_status: 'COMPLETED' } : u
                    ));
                })();
            }
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

        const { data: resps } = await supabase.from('respondents').select('id').eq('survey_id', surveyId);
        const respIds = (resps || []).map((r: any) => r.id);
        addGlobalLog(`📋 Survey has ${respIds.length.toLocaleString()} respondents`);

        const unitsToProcess = units.filter(u => u.analysis_status !== "COMPLETED");
        let unitsDone = 0;

        try {
            for (const unit of unitsToProcess) {
                if (stopGlobalRef.current) { addGlobalLog("🛑 Stopped by user."); break; }
                addGlobalLog(`\n📂 Unit: ${unit.unit_name}`);

                const { data: categories } = await supabase.from('analysis_categories').select('id, name').eq('unit_id', unit.unit_id);
                if (!categories || categories.length === 0) {
                    addGlobalLog(`⚠️ SKIPPED: No categories for ${unit.unit_name}`);
                    unitsDone++;
                    setGlobalProgress(Math.round((unitsDone / unitsToProcess.length) * 100));
                    continue;
                }

                // Count pending items — filter BOTH requires_analysis AND is_quantitative
                const CHUNK = 50;
                let pendingCount = 0;
                for (let i = 0; i < respIds.length; i += CHUNK) {
                    const chunk = respIds.slice(i, i + CHUNK);
                    const { count } = await supabase.from('raw_feedback_inputs')
                        .select('*', { count: 'exact', head: true })
                        .eq('target_unit_id', unit.unit_id)
                        .eq('requires_analysis', true)
                        .eq('is_quantitative', false)  // Bug #3: was missing this filter
                        .in('respondent_id', chunk);
                    pendingCount += (count || 0);
                }

                if (pendingCount === 0) {
                    addGlobalLog(`   ✅ Already analyzed (0 pending)`);
                    unitsDone++;
                    setGlobalProgress(Math.round((unitsDone / unitsToProcess.length) * 100));
                    continue;
                }

                // Bug #1 FIX: Create a real analysis_jobs record before calling process-queue
                // process-queue route REQUIRES a jobId to function
                await supabase.from('organization_units').update({ analysis_status: 'IN_PROGRESS' }).eq('id', unit.unit_id);
                await supabase.from('analysis_jobs').update({ status: 'CANCELLED' }).eq('unit_id', unit.unit_id).in('status', ['PROCESSING', 'PENDING']);
                const { data: newJob, error: jobErr } = await supabase
                    .from('analysis_jobs')
                    .insert({ unit_id: unit.unit_id, survey_id: parseInt(surveyId), status: 'PENDING' })
                    .select('id')
                    .single();

                if (jobErr || !newJob) {
                    addGlobalLog(`   ❌ Failed to create job for ${unit.unit_name}: ${jobErr?.message}`);
                    unitsDone++;
                    setGlobalProgress(Math.round((unitsDone / unitsToProcess.length) * 100));
                    continue;
                }

                const activeJobId = newJob.id;
                addGlobalLog(`   ⏳ ${pendingCount} comments to analyze...`);

                let hasMore = true;
                const sessionProcessedIds: number[] = [];

                while (hasMore && !stopGlobalRef.current) {
                    const response = await fetch('/api/ai/process-queue', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            jobId: activeJobId,
                            unitId: unit.unit_id,
                            surveyId: parseInt(surveyId),
                            skipIds: sessionProcessedIds.slice(-50)
                        })
                    });
                    const result = await response.json();
                    if (result.error) { addGlobalLog(`   ❌ Error: ${result.error}`); break; }
                    if (result.processedIds) sessionProcessedIds.push(...result.processedIds);
                    hasMore = result.hasMore;
                    addGlobalLog(`   ✅ Batch done: ${sessionProcessedIds.length}/${pendingCount}`);
                    if (hasMore) await new Promise(r => setTimeout(r, 1000));
                }

                if (!stopGlobalRef.current) {
                    await supabase.from('organization_units').update({ analysis_status: 'COMPLETED' }).eq('id', unit.unit_id);
                    await supabase.from('analysis_jobs').update({ status: 'COMPLETED' }).eq('id', activeJobId);
                } else {
                    await supabase.from('organization_units').update({ analysis_status: 'NOT_STARTED' }).eq('id', unit.unit_id);
                    await supabase.from('analysis_jobs').update({ status: 'STOPPED' }).eq('id', activeJobId);
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


    // --- Derived stats ---
    const completedCount = units.filter(u => u.analysis_status === "COMPLETED").length;
    const inProgressCount = units.filter(u => u.analysis_status === "IN_PROGRESS").length;
    const notStartedCount = units.filter(u => u.analysis_status === "NOT_STARTED").length;
    const overallProgress = units.length > 0 ? Math.round((completedCount / units.length) * 100) : 0;

    const filteredUnits = units.filter(u => {
        const matchesSearch = u.unit_name.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesStatus = statusFilter === "ALL" || u.analysis_status === statusFilter;
        return matchesSearch && matchesStatus;
    });

    // --- Status helpers ---
    const statusConfig = {
        COMPLETED: {
            label: "Complete",
            icon: CheckCircle2,
            badge: "bg-emerald-50 text-emerald-700 border-emerald-200",
            bar: "from-emerald-500 to-teal-500",
            glow: "hover:border-emerald-200",
        },
        IN_PROGRESS: {
            label: "In Progress",
            icon: Clock,
            badge: "bg-amber-50 text-amber-700 border-amber-200",
            bar: "from-amber-400 to-orange-400",
            glow: "hover:border-amber-200",
        },
        NOT_STARTED: {
            label: "Not Started",
            icon: CircleDashed,
            badge: "bg-slate-100 text-slate-500 border-slate-200",
            bar: "from-slate-300 to-slate-400",
            glow: "hover:border-slate-300",
        },
    };

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
                description={`${totalRespondents.toLocaleString()} respondents`}
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

                {/* --- SUMMARY BANNER --- */}
                {!isLoading && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 animate-in fade-in duration-500">
                        {/* Completed */}
                        <div className="relative overflow-hidden bg-white border border-emerald-100 rounded-2xl p-5 flex items-center gap-4 shadow-sm hover:shadow-md transition-shadow">
                            <div className="p-3 rounded-xl bg-emerald-50 text-emerald-600 shrink-0">
                                <CheckCircle2 className="w-5 h-5" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold text-slate-900">{completedCount}</p>
                                <p className="text-sm text-slate-500">Analysis Complete</p>
                            </div>
                            <div className="absolute inset-0 bg-gradient-to-br from-emerald-50/50 via-transparent to-transparent pointer-events-none" />
                        </div>

                        {/* In Progress */}
                        <div className="relative overflow-hidden bg-white border border-amber-100 rounded-2xl p-5 flex items-center gap-4 shadow-sm hover:shadow-md transition-shadow">
                            <div className="p-3 rounded-xl bg-amber-50 text-amber-600 shrink-0">
                                <Clock className="w-5 h-5" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold text-slate-900">{inProgressCount}</p>
                                <p className="text-sm text-slate-500">In Progress</p>
                            </div>
                            <div className="absolute inset-0 bg-gradient-to-br from-amber-50/50 via-transparent to-transparent pointer-events-none" />
                        </div>

                        {/* Not Started */}
                        <div className="relative overflow-hidden bg-white border border-slate-100 rounded-2xl p-5 flex items-center gap-4 shadow-sm hover:shadow-md transition-shadow">
                            <div className="p-3 rounded-xl bg-slate-100 text-slate-500 shrink-0">
                                <CircleDashed className="w-5 h-5" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold text-slate-900">{notStartedCount}</p>
                                <p className="text-sm text-slate-500">Not Yet Started</p>
                            </div>
                            <div className="absolute inset-0 bg-gradient-to-br from-slate-50/50 via-transparent to-transparent pointer-events-none" />
                        </div>
                    </div>
                )}

                {/* --- OVERALL PROGRESS STRIP --- */}
                {!isLoading && units.length > 0 && (
                    <div className="bg-gradient-to-r from-indigo-600 via-blue-600 to-purple-600 rounded-2xl p-6 text-white shadow-lg animate-in fade-in duration-700">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-white/10 rounded-lg backdrop-blur-sm">
                                    <Sparkles className="w-5 h-5" />
                                </div>
                                <div>
                                    <p className="font-semibold text-white">Analysis Coverage</p>
                                    <p className="text-blue-100 text-sm">{completedCount} of {units.length} units fully analyzed</p>
                                </div>
                            </div>
                            <span className="text-3xl font-bold">{overallProgress}%</span>
                        </div>
                        <div className="h-2 bg-white/20 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-white rounded-full transition-all duration-1000"
                                style={{ width: `${overallProgress}%` }}
                            />
                        </div>
                    </div>
                )}

                {/* --- SEARCH & FILTER BAR --- */}
                {!isLoading && units.length > 0 && (
                    <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center animate-in fade-in duration-700">
                        <div className="relative flex-1 max-w-xs">
                            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                            <Input
                                placeholder="Search units..."
                                className="pl-9 bg-white border-slate-200"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                        <div className="flex gap-2">
                            {(["ALL", "COMPLETED", "IN_PROGRESS", "NOT_STARTED"] as const).map(s => (
                                <button
                                    key={s}
                                    onClick={() => setStatusFilter(s)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                                        statusFilter === s
                                            ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                                            : "bg-white text-slate-600 border-slate-200 hover:border-blue-300 hover:text-blue-600"
                                    }`}
                                >
                                    {s === "ALL" ? "All" : s === "COMPLETED" ? "Complete" : s === "IN_PROGRESS" ? "In Progress" : "Not Started"}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* --- LOADING SKELETON --- */}
                {isLoading && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                        {[1, 2, 3, 4, 5, 6].map(i => (
                            <div key={i} className="bg-white rounded-2xl border border-slate-100 overflow-hidden animate-pulse">
                                <div className="h-1.5 bg-gradient-to-r from-slate-200 to-slate-100" />
                                <div className="p-5 space-y-3">
                                    <div className="flex justify-between items-center">
                                        <div className="h-4 w-32 bg-slate-200 rounded" />
                                        <div className="h-5 w-16 bg-slate-100 rounded-full" />
                                    </div>
                                    <div className="h-3 w-full bg-slate-100 rounded" />
                                    <div className="h-8 w-full bg-slate-100 rounded-lg mt-4" />
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* --- UNIT CARD GRID --- */}
                {!isLoading && filteredUnits.length === 0 && (
                    <div className="text-center py-16 text-slate-400">
                        <CircleDashed className="w-10 h-10 mx-auto mb-3 opacity-40" />
                        <p className="font-medium">No units match your filters</p>
                        <p className="text-sm mt-1">Try adjusting the search or status filter.</p>
                    </div>
                )}

                {!isLoading && filteredUnits.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 animate-in fade-in slide-in-from-bottom-2 duration-700">
                        {filteredUnits.map((unit) => {
                            const cfg = statusConfig[unit.analysis_status];
                            const StatusIcon = cfg.icon;

                            return (
                                <div
                                    key={unit.unit_id}
                                    className="group block cursor-pointer"
                                    onClick={() => router.push(`/surveys/${surveyId}/unit/${unit.unit_id}`)}
                                >
                                    <div className={`relative bg-white rounded-2xl border border-slate-200 overflow-hidden h-full transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 ${cfg.glow}`}>
                                        {/* Top color bar */}
                                        <div className={`h-1.5 bg-gradient-to-r ${cfg.bar}`} />

                                        <div className="p-5 flex flex-col h-[calc(100%-6px)]">
                                            {/* Header row */}
                                            <div className="flex items-start justify-between gap-2 mb-3">
                                                <div className="flex-1 min-w-0">
                                                    <h3 className="font-semibold text-slate-800 group-hover:text-blue-700 transition-colors line-clamp-2 leading-snug">
                                                        {unit.unit_name}
                                                    </h3>
                                                    {unit.unit_short_name && (
                                                        <span className="inline-block mt-1 text-xs text-slate-400 font-medium bg-slate-50 border border-slate-200 px-1.5 py-0.5 rounded">
                                                            {unit.unit_short_name}
                                                        </span>
                                                    )}
                                                </div>
                                                <Badge className={`shrink-0 text-xs border px-2 py-0.5 rounded-full font-medium flex items-center gap-1 ${cfg.badge}`}>
                                                    <StatusIcon className="w-3 h-3" />
                                                    {cfg.label}
                                                </Badge>
                                            </div>

                                            {/* Description */}
                                            {unit.unit_desc && (
                                                <p className="text-xs text-slate-400 line-clamp-2 mb-4 leading-relaxed">
                                                    {unit.unit_desc}
                                                </p>
                                            )}

                                            {/* Spacer */}
                                            <div className="flex-1" />

                                            {/* Footer actions */}
                                            <div className="flex items-center justify-between pt-4 border-t border-slate-100 mt-2">
                                                <span className="text-xs text-slate-400 flex items-center gap-1.5">
                                                    <BrainCircuit className="w-3.5 h-3.5" />
                                                    {unit.analysis_status === "COMPLETED"
                                                        ? "Fully analyzed"
                                                        : unit.analysis_status === "IN_PROGRESS"
                                                            ? "Analysis running"
                                                            : "Pending analysis"}
                                                </span>
                                                <div className="flex items-center gap-1.5">
                                                    {unit.analysis_status === "COMPLETED" && (
                                                        <Link
                                                            href={`/surveys/${surveyId}/unit/${unit.unit_id}?tab=insights`}
                                                            onClick={e => e.stopPropagation()}
                                                            className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-2.5 py-1 rounded-lg transition-colors"
                                                        >
                                                            <PieChart className="w-3 h-3" /> Insights
                                                        </Link>
                                                    )}
                                                    <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 bg-blue-50 group-hover:bg-blue-100 border border-blue-200 px-2.5 py-1 rounded-lg transition-colors">
                                                        Open <ArrowRight className="w-3 h-3 transition-transform group-hover:translate-x-0.5" />
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

            </div>
        </PageShell>
    );
}