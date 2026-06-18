"use client";

import { useState, useEffect, useRef } from "react";
import { useActiveSurvey, SurveyInfo } from "@/context/SurveyContext";
import { PageShell, PageHeader } from "@/components/layout/PageShell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Settings, Database, CheckCircle2, AlertCircle, Loader2, Trash2, RefreshCcw, ShieldAlert, Calendar, BarChart2, AlertTriangle, Target, Sparkles, BookOpen } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ConfirmDialog";

export default function SettingsPage() {
    useEffect(() => { document.title = "Settings | Satisfaction Voice"; }, []);
    const { surveys, activeSurveyId, setActiveSurveyId, activeSurvey, loading } = useActiveSurvey();

    const [confirmSurvey, setConfirmSurvey] = useState<SurveyInfo | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<SurveyInfo | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    // Rebuild cache state
    type RebuildStep = 'idle' | 'clearing' | 'phase1' | 'phase2' | 'warm_report' | 'warm_nps' | 'warm_radar' | 'warm_qual' | 'warm_faculty_rollup' | 'warm_faculty_list' | 'warm_cross_mentions' | 'warm_dependency_graph' | 'warm_cross_signals' | 'warm_faculty_detail' | 'done' | 'error';
    const [rebuildStep, setRebuildStep] = useState<RebuildStep>('idle');
    const [rebuildElapsed, setRebuildElapsed] = useState(0);
    const [rebuildError, setRebuildError] = useState<string | null>(null);
    const [buildSummary, setBuildSummary] = useState<{ analyzed_units: number; total_org_units: number; cached_units: number; suggestions_count: number } | null>(null);
    const [warmFacultyProgress, setWarmFacultyProgress] = useState<{ current: number; total: number } | null>(null);
    const [aiCacheUpdatedAt, setAiCacheUpdatedAt] = useState<string | null>(null);
    const rebuildTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const [allUnits, setAllUnits] = useState<{ id: number; name: string }[]>([]);
    const [excludedUnitIds, setExcludedUnitIds] = useState<number[]>([]);
    const [savingExclusions, setSavingExclusions] = useState(false);
    const [npsUnitIds, setNpsUnitIds] = useState<number[]>([]);
    const [savingNpsUnits, setSavingNpsUnits] = useState(false);
    const [studyProgramUnitId, setStudyProgramUnitId] = useState<number | null>(null);
    const [savingStudyProgramUnit, setSavingStudyProgramUnit] = useState(false);

    // Executive AI summary state
    const [execSummaryGeneratedAt, setExecSummaryGeneratedAt] = useState<string | null>(null);
    const [isGeneratingExecSummary, setIsGeneratingExecSummary] = useState(false);
    const [execSummaryError, setExecSummaryError] = useState<string | null>(null);

    // Load ai_dataset_updated_at + exec summary status for the active survey
    useEffect(() => {
        if (!activeSurveyId || activeSurveyId === 'all') return;
        setAiCacheUpdatedAt(null);
        setBuildSummary(null);
        setRebuildStep('idle');
        setExecSummaryGeneratedAt(null);
        setExecSummaryError(null);
        import("@/lib/supabase").then(({ supabase }) =>
            supabase.from("surveys")
                .select("ai_dataset_updated_at")
                .eq("id", parseInt(activeSurveyId))
                .single()
                .then(({ data }) => {
                    setAiCacheUpdatedAt((data as any)?.ai_dataset_updated_at ?? null);
                    if ((data as any)?.ai_dataset_updated_at) {
                        try {
                            const stored = localStorage.getItem(`ai_build_summary_${activeSurveyId}`);
                            if (stored) setBuildSummary(JSON.parse(stored));
                        } catch {}
                    }
                })
        );
        // Check if exec summary exists for this survey
        fetch(`/api/executive/ai-summary?surveyId=${activeSurveyId}`)
            .then(r => r.ok ? r.json() : null)
            .then(d => { if (d?.generated_at) setExecSummaryGeneratedAt(d.generated_at); })
            .catch(() => {});
    }, [activeSurveyId]);

    const handleGenerateExecSummary = async () => {
        if (!activeSurveyId) return;
        setIsGeneratingExecSummary(true);
        setExecSummaryError(null);
        try {
            const res = await fetch("/api/executive/ai-summary", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ surveyId: activeSurveyId }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
            setExecSummaryGeneratedAt(data.generated_at);
            toast.success("Executive AI analysis generated successfully!");
        } catch (e: any) {
            setExecSummaryError(e.message || "Generation failed");
            toast.error("Failed to generate AI analysis: " + (e.message || "Unknown error"));
        } finally {
            setIsGeneratingExecSummary(false);
        }
    };

    const REBUILD_STEPS: { key: RebuildStep; label: string }[] = [
        { key: 'clearing',            label: 'Clearing existing caches' },
        { key: 'phase1',              label: 'Building analysis dataset' },
        { key: 'phase2',              label: 'Indexing suggestions' },
        { key: 'warm_report',         label: 'Warming report & scores cache' },
        { key: 'warm_nps',            label: 'Warming NPS cache' },
        { key: 'warm_radar',          label: 'Warming radar charts cache' },
        { key: 'warm_qual',           label: 'Warming qualitative summary' },
        { key: 'warm_faculty_rollup',     label: 'Warming faculty sentiment rollup' },
        { key: 'warm_faculty_list',      label: 'Warming faculty list cache' },
        { key: 'warm_cross_mentions',    label: 'Warming cross-unit mentions cache' },
        { key: 'warm_dependency_graph',  label: 'Warming dependency graph cache' },
        { key: 'warm_cross_signals',     label: 'Building cross-unit signals cache' },
        { key: 'warm_faculty_detail',    label: 'Warming faculty detail caches' },
        { key: 'done',                   label: 'Complete' },
    ];

    const STEP_PROGRESS: Partial<Record<RebuildStep, number>> = {
        clearing: 5, phase1: 20, phase2: 37,
        warm_report: 48, warm_nps: 55, warm_radar: 61,
        warm_qual: 67, warm_faculty_rollup: 72, warm_faculty_list: 76,
        warm_cross_mentions: 79, warm_dependency_graph: 83, warm_cross_signals: 87, warm_faculty_detail: 93,
    };

    const formatElapsed = (secs: number) => {
        const m = Math.floor(secs / 60);
        const s = secs % 60;
        return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`;
    };

    const handleRebuildCache = async () => {
        if (!activeSurveyId) return;
        setRebuildStep('clearing');
        setRebuildElapsed(0);
        setRebuildError(null);
        setBuildSummary(null);
        setWarmFacultyProgress(null);
        rebuildTimerRef.current = setInterval(() => setRebuildElapsed(e => e + 1), 1000);
        try {
            // Step 1: clear all caches
            const clearRes = await fetch(`/api/executive/cache-scores?surveyId=${activeSurveyId}`, { method: 'POST' });
            if (!clearRes.ok) throw new Error('Failed to clear caches');

            // Robust parser: if a route returned an HTML/text error page (e.g. Next.js's
            // default "An error occurred while processing your request"), surface the
            // first chunk of the body as the error instead of crashing on JSON.parse.
            const parsePhase = async (res: Response, label: string) => {
                const txt = await res.text();
                let parsed: any = null;
                try { parsed = txt ? JSON.parse(txt) : null; } catch { /* not JSON */ }
                if (!res.ok) {
                    const msg = parsed?.error || (txt ? txt.slice(0, 200) : `${label} failed (${res.status})`);
                    throw new Error(`${label}: ${msg}`);
                }
                return parsed ?? {};
            };

            // Step 2: heavy compute — analysis metrics
            setRebuildStep('phase1');
            const res1 = await fetch('/api/ai/cache-global-dataset', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ surveyId: activeSurveyId, phase: 1 }),
            });
            const data1 = await parsePhase(res1, 'Phase 1');

            // Step 3: suggestions merge
            setRebuildStep('phase2');
            const res2 = await fetch('/api/ai/cache-global-dataset', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ surveyId: activeSurveyId, phase: 2 }),
            });
            const data2 = await parsePhase(res2, 'Phase 2');

            const summary = {
                total_org_units: data1.total_org_units ?? 0,
                analyzed_units: data1.analyzed_units ?? 0,
                cached_units: data1.count ?? 0,
                suggestions_count: data2.suggestions_count ?? 0,
            };
            setBuildSummary(summary);
            try { localStorage.setItem(`ai_build_summary_${activeSurveyId}`, JSON.stringify(summary)); } catch {}
            setAiCacheUpdatedAt(new Date().toISOString());

            // Steps 4–9: pre-warm all insight caches so every page loads instantly.
            // Errors here are non-fatal — the page will just compute on first access instead.
            setRebuildStep('warm_report');
            await fetch(`/api/executive/report?surveyId=${activeSurveyId}`).catch(() => {});

            setRebuildStep('warm_nps');
            await fetch(`/api/executive/nps?surveyId=${activeSurveyId}`).catch(() => {});

            setRebuildStep('warm_radar');
            await Promise.all([
                fetch(`/api/analytics/radar-aggregation?surveyId=${activeSurveyId}&sentiment=Positive`).catch(() => {}),
                fetch(`/api/analytics/radar-aggregation?surveyId=${activeSurveyId}&sentiment=Negative`).catch(() => {}),
            ]);

            setRebuildStep('warm_qual');
            await fetch(`/api/analytics/unit-qual-summary?surveyId=${activeSurveyId}`).catch(() => {});

            setRebuildStep('warm_faculty_rollup');
            await fetch(`/api/executive/faculty-rollup?surveyId=${activeSurveyId}`).catch(() => {});

            setRebuildStep('warm_faculty_list');
            await fetch(`/api/executive/faculty-list?surveyId=${activeSurveyId}`).catch(() => {});

            // Cross-mentions must warm before dependency-graph — the graph reads from its cache.
            setRebuildStep('warm_cross_mentions');
            await fetch(`/api/executive/cross-unit-mentions?surveyId=${activeSurveyId}`).catch(() => {});

            setRebuildStep('warm_dependency_graph');
            await fetch(`/api/analytics/dependency-graph?surveyId=${activeSurveyId}`).catch(() => {});

            setRebuildStep('warm_cross_signals');
            await fetch('/api/unit-insights/warm-cross-unit-signals', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ surveyId: activeSurveyId }),
            }).catch(() => {});

            setRebuildStep('warm_faculty_detail');
            const { supabase: sb } = await import("@/lib/supabase");
            const { data: faculties } = await sb.from('faculties').select('id');
            if (faculties?.length) {
                setWarmFacultyProgress({ current: 0, total: faculties.length });
                for (let i = 0; i < faculties.length; i++) {
                    await fetch(`/api/executive/faculty-detail?surveyId=${activeSurveyId}&facultyId=${faculties[i].id}`).catch(() => {});
                    setWarmFacultyProgress({ current: i + 1, total: faculties.length });
                }
                setWarmFacultyProgress(null);
            }

            setRebuildStep('done');
            toast.success(`Cache rebuilt & warmed! ${summary.analyzed_units}/${summary.total_org_units} units · ${summary.suggestions_count.toLocaleString()} suggestions indexed.`);
        } catch (e: any) {
            setRebuildError(e.message || 'Rebuild failed');
            setRebuildStep('error');
            toast.error('Cache rebuild failed: ' + (e.message || 'Unknown error'));
        } finally {
            if (rebuildTimerRef.current) clearInterval(rebuildTimerRef.current);
        }
    };

    const isRebuilding = rebuildStep !== 'idle' && rebuildStep !== 'done' && rebuildStep !== 'error';

    useEffect(() => {
        fetch("/api/settings/excluded-score-units")
            .then(r => r.json())
            .then(d => setExcludedUnitIds(d.excludedUnitIds || []));
        fetch("/api/settings/nps-units")
            .then(r => r.json())
            .then(d => setNpsUnitIds(d.npsUnitIds || []));
        fetch("/api/settings/study-program-unit")
            .then(r => r.json())
            .then(d => setStudyProgramUnitId(d.studyProgramUnitId ?? null));
        import("@/lib/supabase").then(({ supabase }) =>
            supabase.from("organization_units").select("id, name").order("name")
                .then(({ data }) => setAllUnits(data || []))
        );
    }, []);

    const toggleUnitExclusion = (id: number) => {
        setExcludedUnitIds(prev =>
            prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
        );
    };

    const toggleNpsUnit = (id: number) => {
        setNpsUnitIds(prev =>
            prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
        );
    };

    const saveExclusions = async () => {
        setSavingExclusions(true);
        try {
            const res = await fetch("/api/settings/excluded-score-units", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ excludedUnitIds }),
            });
            if (res.ok) toast.success("Score calculation settings saved.");
            else toast.error("Failed to save settings.");
        } catch {
            toast.error("Failed to save settings.");
        } finally {
            setSavingExclusions(false);
        }
    };

    const saveNpsUnits = async () => {
        setSavingNpsUnits(true);
        try {
            const res = await fetch("/api/settings/nps-units", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ npsUnitIds }),
            });
            if (res.ok) toast.success("NPS unit settings saved.");
            else toast.error("Failed to save NPS settings.");
        } catch {
            toast.error("Failed to save NPS settings.");
        } finally {
            setSavingNpsUnits(false);
        }
    };

    const saveStudyProgramUnit = async () => {
        setSavingStudyProgramUnit(true);
        try {
            const res = await fetch("/api/settings/study-program-unit", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ studyProgramUnitId }),
            });
            if (res.ok) toast.success("Study program unit saved.");
            else toast.error("Failed to save setting.");
        } catch {
            toast.error("Failed to save setting.");
        } finally {
            setSavingStudyProgramUnit(false);
        }
    };

    const handleSurveyClick = (survey: SurveyInfo) => {
        if (survey.id.toString() === activeSurveyId) return;
        setConfirmSurvey(survey);
    };

    const confirmSurveySwitch = () => {
        if (confirmSurvey) {
            setActiveSurveyId(confirmSurvey.id.toString());
            toast.success(`Switched to "${confirmSurvey.title}"`);
            setConfirmSurvey(null);
        }
    };

    const handleDelete = async (survey: SurveyInfo) => {
        setDeleteTarget(null);
        setIsDeleting(true);
        try {
            const res = await fetch(`/api/surveys/${survey.id}`, { method: 'DELETE' });
            const json = await res.json();
            if (!res.ok) {
                toast.error("Delete failed: " + (json.error || "Unknown error"));
            } else {
                toast.success(`"${survey.title}" deleted.`);
                window.location.reload();
            }
        } catch {
            toast.error("Delete failed — please try again.");
        } finally {
            setIsDeleting(false);
        }
    };

    if (loading) return (
        <PageShell>
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
            </div>
        </PageShell>
    );

    return (
        <PageShell>
            <PageHeader
                title={
                    <span className="flex items-center gap-2">
                        <Settings className="w-6 h-6 text-slate-500" />
                        Settings
                    </span>
                }
                description="Platform configuration and data scope management."
            />

            <div className="max-w-3xl mx-auto px-8 py-10 space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">

                {/* ── Active Survey ─────────────────────────────── */}
                <Card className="border-2 border-indigo-200 dark:border-indigo-900/50 shadow-md overflow-hidden">
                    <CardHeader className="bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-950/20 dark:to-purple-950/20 pb-4">
                        <div className="flex items-center gap-2">
                            <div className="p-1.5 bg-indigo-100 dark:bg-indigo-900/40 rounded-lg">
                                <Database className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                            </div>
                            <CardTitle className="text-base">Active Survey</CardTitle>
                        </div>
                        <CardDescription>
                            All dashboards, charts, and AI analysis use data from the selected survey.
                            Changing this affects <strong>all pages</strong> globally.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-5">
                        {/* Current Selection Banner */}
                        {activeSurvey && (
                            <div className="mb-5 flex items-center justify-between p-4 bg-indigo-50 dark:bg-indigo-950/20 rounded-xl border border-indigo-200 dark:border-indigo-800/40">
                                <div>
                                    <p className="text-[10px] font-semibold text-indigo-500 dark:text-indigo-400 uppercase tracking-widest mb-0.5">Currently Active</p>
                                    <p className="text-lg font-bold text-slate-800 dark:text-slate-100 leading-tight">
                                        {activeSurvey.title}
                                        {activeSurvey.year && <span className="text-sm font-normal text-slate-400 ml-2">({activeSurvey.year})</span>}
                                    </p>
                                </div>
                                {activeSurvey.hasData ? (
                                    <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 gap-1 shrink-0">
                                        <CheckCircle2 className="w-3 h-3" /> Ready
                                    </Badge>
                                ) : (
                                    <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 gap-1 shrink-0">
                                        <AlertCircle className="w-3 h-3" /> No data yet
                                    </Badge>
                                )}
                            </div>
                        )}

                        <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3">Select Survey</p>
                        <div className="space-y-2">
                            {surveys.map(s => {
                                const isActive = s.id.toString() === activeSurveyId;
                                return (
                                    <button
                                        key={s.id}
                                        onClick={() => handleSurveyClick(s)}
                                        className={cn(
                                            "w-full flex items-center justify-between px-4 py-3 rounded-xl border-2 transition-all duration-200 text-left",
                                            isActive
                                                ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30 shadow-sm"
                                                : "border-slate-200 dark:border-slate-800 hover:border-indigo-300 dark:hover:border-indigo-700 hover:bg-slate-50 dark:hover:bg-slate-900/50"
                                        )}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className={cn(
                                                "w-3 h-3 rounded-full shrink-0 transition-all",
                                                isActive ? "bg-indigo-500 ring-4 ring-indigo-500/20" : "bg-slate-300 dark:bg-slate-600"
                                            )} />
                                            <span className={cn(
                                                "font-semibold text-sm",
                                                isActive ? "text-indigo-700 dark:text-indigo-300" : "text-slate-700 dark:text-slate-300"
                                            )}>
                                                {s.title}
                                                {s.year && <span className="text-xs font-normal text-slate-400 ml-2">({s.year})</span>}
                                            </span>
                                        </div>
                                        {s.hasData ? (
                                            <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 text-[10px] gap-1">
                                                <CheckCircle2 className="w-3 h-3" /> Data Ready
                                            </Badge>
                                        ) : (
                                            <Badge variant="outline" className="text-slate-400 text-[10px]">No Data</Badge>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </CardContent>
                </Card>

                {/* ── Cache Rebuild ─────────────────────────────── */}
                <Card className="shadow-sm">
                    <CardHeader className="pb-4">
                        <div className="flex items-center gap-2">
                            <div className="p-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg">
                                <RefreshCcw className="w-4 h-4 text-slate-500" />
                            </div>
                            <CardTitle className="text-base">Data Cache</CardTitle>
                        </div>
                        <CardDescription>
                            Rebuild all caches after importing new survey data. Clears existing caches, recomputes the full analysis dataset and suggestions, then pre-warms every report and insight page. Run once after each import — takes 5–15 minutes locally, but all pages load instantly afterwards for every user.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4 p-4 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800">
                            {/* Survey name + last built + button */}
                            <div className="flex items-center justify-between gap-4">
                                <div>
                                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                        {activeSurvey?.title || "Active survey"}
                                    </p>
                                    {aiCacheUpdatedAt ? (
                                        <p className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1 mt-0.5">
                                            <CheckCircle2 className="w-3 h-3" />
                                            Last rebuilt: {new Date(aiCacheUpdatedAt).toLocaleString()}
                                        </p>
                                    ) : (
                                        <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                                            Cache not yet built for this survey
                                        </p>
                                    )}
                                </div>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={handleRebuildCache}
                                    disabled={isRebuilding || !activeSurveyId}
                                    className="gap-2 shrink-0 min-w-[130px] justify-center"
                                >
                                    {isRebuilding ? (
                                        <>
                                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                            {formatElapsed(rebuildElapsed)}
                                        </>
                                    ) : (
                                        <>
                                            <RefreshCcw className="w-3.5 h-3.5" />
                                            {aiCacheUpdatedAt ? 'Rebuild Cache' : 'Build Cache'}
                                        </>
                                    )}
                                </Button>
                            </div>

                            {/* Step progress — shown while rebuilding or after */}
                            {rebuildStep !== 'idle' && (
                                <div className="space-y-2 pt-1">
                                    {REBUILD_STEPS.map((s, i) => {
                                        const currentIdx = REBUILD_STEPS.findIndex(x => x.key === rebuildStep);
                                        const isDone = rebuildStep === 'done' || i < currentIdx;
                                        const isCurrent = s.key === rebuildStep;
                                        return (
                                            <div key={s.key} className="flex items-center gap-2.5">
                                                <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold border-2 transition-colors ${
                                                    isDone    ? 'bg-emerald-500 border-emerald-500 text-white' :
                                                    isCurrent ? 'bg-white dark:bg-slate-900 border-indigo-500 text-indigo-600' :
                                                                'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-400'
                                                }`}>
                                                    {isDone ? '✓' : i + 1}
                                                </div>
                                                <span className={`text-xs flex-1 ${
                                                    isDone    ? 'text-emerald-600 dark:text-emerald-400' :
                                                    isCurrent ? 'text-slate-800 dark:text-slate-200 font-medium' :
                                                                'text-slate-400 dark:text-slate-600'
                                                }`}>{s.label}</span>
                                                {isCurrent && s.key === 'warm_faculty_detail' && warmFacultyProgress && warmFacultyProgress.total > 0 && (
                                                    <span className="text-[10px] text-slate-400 shrink-0 tabular-nums">
                                                        {warmFacultyProgress.current}/{warmFacultyProgress.total}
                                                    </span>
                                                )}
                                                {isCurrent && rebuildStep !== 'done' && (
                                                    <Loader2 className="w-3 h-3 animate-spin text-indigo-500 shrink-0" />
                                                )}
                                            </div>
                                        );
                                    })}
                                    {/* Progress bar */}
                                    {isRebuilding && (
                                        <Progress
                                            value={STEP_PROGRESS[rebuildStep] ?? 5}
                                            className="h-1.5 mt-1"
                                        />
                                    )}
                                    {rebuildStep === 'done' && (
                                        <Progress value={100} className="h-1.5 mt-1" />
                                    )}
                                </div>
                            )}

                            {/* Error message */}
                            {rebuildStep === 'error' && rebuildError && (
                                <div className="flex items-center gap-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/40 rounded-lg px-3 py-2">
                                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {rebuildError}
                                </div>
                            )}

                            {/* Build summary */}
                            {rebuildStep === 'done' && buildSummary && (
                                <div className="grid grid-cols-3 gap-2">
                                    <div className="bg-white dark:bg-slate-900 rounded-lg px-3 py-2.5 border border-slate-200 dark:border-slate-800 text-center">
                                        <p className="text-base font-black text-slate-800 dark:text-slate-200 tabular-nums leading-none">
                                            {buildSummary.cached_units}
                                            <span className="text-xs font-normal text-slate-400">/{buildSummary.total_org_units}</span>
                                        </p>
                                        <p className="text-[10px] text-slate-500 mt-1">units cached</p>
                                    </div>
                                    <div className="bg-white dark:bg-slate-900 rounded-lg px-3 py-2.5 border border-slate-200 dark:border-slate-800 text-center">
                                        <p className="text-base font-black text-emerald-700 dark:text-emerald-300 tabular-nums leading-none">
                                            {buildSummary.analyzed_units}
                                        </p>
                                        <p className="text-[10px] text-slate-500 mt-1">units analyzed</p>
                                    </div>
                                    <div className="bg-white dark:bg-slate-900 rounded-lg px-3 py-2.5 border border-slate-200 dark:border-slate-800 text-center">
                                        <p className="text-base font-black text-indigo-700 dark:text-indigo-300 tabular-nums leading-none">
                                            {buildSummary.suggestions_count.toLocaleString()}
                                        </p>
                                        <p className="text-[10px] text-slate-500 mt-1">suggestions</p>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* ── Executive AI Summary ──────────────────── */}
                        <div className="space-y-3 pt-2">
                            <div className="border-t border-slate-200 dark:border-slate-800 pt-4">
                                <div className="flex items-center justify-between gap-4">
                                    <div>
                                        <div className="flex items-center gap-2 mb-0.5">
                                            <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
                                            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Executive AI Analysis</p>
                                        </div>
                                        {execSummaryGeneratedAt ? (
                                            <p className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                                                <CheckCircle2 className="w-3 h-3" />
                                                Generated: {new Date(execSummaryGeneratedAt).toLocaleString()}
                                            </p>
                                        ) : (
                                            <p className="text-xs text-slate-500 dark:text-slate-400">
                                                Not generated yet for this survey. Run after the data cache is built.
                                            </p>
                                        )}
                                    </div>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={handleGenerateExecSummary}
                                        disabled={isGeneratingExecSummary || !activeSurveyId || !aiCacheUpdatedAt}
                                        className="gap-2 shrink-0 min-w-[160px] justify-center"
                                    >
                                        {isGeneratingExecSummary ? (
                                            <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Generating…</>
                                        ) : (
                                            <><Sparkles className="w-3.5 h-3.5" /> {execSummaryGeneratedAt ? "Regenerate Analysis" : "Generate AI Analysis"}</>
                                        )}
                                    </Button>
                                </div>
                                {execSummaryError && (
                                    <div className="flex items-center gap-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/40 rounded-lg px-3 py-2 mt-2">
                                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {execSummaryError}
                                    </div>
                                )}
                                {!aiCacheUpdatedAt && (
                                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-1.5">
                                        Build the data cache first before generating the AI analysis.
                                    </p>
                                )}
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* ── Score & Metric Configuration ──────────────── */}
                <Card className="shadow-sm">
                    <CardHeader className="pb-4">
                        <div className="flex items-center gap-2">
                            <div className="p-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg">
                                <BarChart2 className="w-4 h-4 text-slate-500" />
                            </div>
                            <CardTitle className="text-base">Score &amp; Metric Configuration</CardTitle>
                        </div>
                        <CardDescription>
                            Control which units factor into the institution-wide Satisfaction Index, and flag units that use a 0–10 NPS scale so they get their own tab and per-faculty card.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-8">
                        {allUnits.length === 0 ? (
                            <div className="flex items-center justify-center py-6">
                                <Loader2 className="w-5 h-5 animate-spin text-slate-300" />
                            </div>
                        ) : (
                            <>
                                {/* Subsection 1: Satisfaction Index inclusion */}
                                <div className="space-y-3">
                                    <div className="flex items-center gap-2">
                                        <BarChart2 className="w-3.5 h-3.5 text-indigo-500" />
                                        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">Satisfaction Index inclusion</h3>
                                    </div>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 -mt-1">
                                        Checked units count toward the overall Satisfaction Index on the Executive Insights page. Uncheck units whose questions use a different scale or shouldn&apos;t factor into the institution-wide average.
                                    </p>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        {allUnits.map(unit => {
                                            const excluded = excludedUnitIds.includes(unit.id);
                                            return (
                                                <button
                                                    key={unit.id}
                                                    onClick={() => toggleUnitExclusion(unit.id)}
                                                    className={cn(
                                                        "flex items-center gap-3 px-3 py-2.5 rounded-xl border-2 text-left transition-all duration-150",
                                                        excluded
                                                            ? "border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40 opacity-50"
                                                            : "border-indigo-200 dark:border-indigo-900/50 bg-indigo-50/50 dark:bg-indigo-950/20"
                                                    )}
                                                >
                                                    <div className={cn(
                                                        "w-4 h-4 rounded border-2 shrink-0 flex items-center justify-center transition-colors",
                                                        excluded
                                                            ? "border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900"
                                                            : "border-indigo-500 bg-indigo-500"
                                                    )}>
                                                        {!excluded && (
                                                            <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 10 8">
                                                                <path d="M1 4l3 3 5-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                                            </svg>
                                                        )}
                                                    </div>
                                                    <span className={cn(
                                                        "text-sm font-medium truncate",
                                                        excluded ? "text-slate-400 dark:text-slate-600" : "text-slate-700 dark:text-slate-300"
                                                    )}>
                                                        {unit.name}
                                                    </span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                    <div className="flex items-center justify-between pt-1">
                                        <p className="text-xs text-slate-400">
                                            {allUnits.length - excludedUnitIds.length} of {allUnits.length} units included
                                        </p>
                                        <Button
                                            size="sm"
                                            onClick={saveExclusions}
                                            disabled={savingExclusions}
                                            className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white"
                                        >
                                            {savingExclusions ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                                            Save
                                        </Button>
                                    </div>
                                </div>

                                {/* Divider */}
                                <div className="border-t border-slate-200 dark:border-slate-800" />

                                {/* Subsection 2: NPS Units */}
                                <div className="space-y-3">
                                    <div className="flex items-center gap-2">
                                        <Target className="w-3.5 h-3.5 text-blue-500" />
                                        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">NPS units</h3>
                                    </div>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 -mt-1">
                                        Mark units that use a 0–10 NPS (Net Promoter Score) scale. They appear in a dedicated NPS tab on Executive Insights and a per-faculty card on Faculty Insights, and are hidden from cross-unit views (Unit Insights list, sentiment heatmap, faculty rollups) where mixing them with Likert data would be misleading. Their score column must also be set to <strong>NPS (0–10)</strong> on the survey manage page.
                                    </p>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        {allUnits.map(unit => {
                                            const isNps = npsUnitIds.includes(unit.id);
                                            return (
                                                <button
                                                    key={unit.id}
                                                    onClick={() => toggleNpsUnit(unit.id)}
                                                    className={cn(
                                                        "flex items-center gap-3 px-3 py-2.5 rounded-xl border-2 text-left transition-all duration-150",
                                                        isNps
                                                            ? "border-blue-200 dark:border-blue-900/50 bg-blue-50/50 dark:bg-blue-950/20"
                                                            : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40"
                                                    )}
                                                >
                                                    <div className={cn(
                                                        "w-4 h-4 rounded border-2 shrink-0 flex items-center justify-center transition-colors",
                                                        isNps
                                                            ? "border-blue-500 bg-blue-500"
                                                            : "border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900"
                                                    )}>
                                                        {isNps && (
                                                            <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 10 8">
                                                                <path d="M1 4l3 3 5-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                                            </svg>
                                                        )}
                                                    </div>
                                                    <span className={cn(
                                                        "text-sm font-medium truncate",
                                                        isNps ? "text-blue-700 dark:text-blue-300" : "text-slate-700 dark:text-slate-300"
                                                    )}>
                                                        {unit.name}
                                                    </span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                    <div className="flex items-center justify-between pt-1">
                                        <p className="text-xs text-slate-400">
                                            {npsUnitIds.length} NPS unit{npsUnitIds.length === 1 ? "" : "s"} configured
                                        </p>
                                        <Button
                                            size="sm"
                                            onClick={saveNpsUnits}
                                            disabled={savingNpsUnits}
                                            className="gap-2 bg-blue-600 hover:bg-blue-700 text-white"
                                        >
                                            {savingNpsUnits ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                                            Save
                                        </Button>
                                    </div>
                                </div>

                                {/* Divider */}
                                <div className="border-t border-slate-200 dark:border-slate-800" />

                                {/* Subsection 3: Study Program Unit */}
                                <div className="space-y-3">
                                    <div className="flex items-center gap-2">
                                        <BookOpen className="w-3.5 h-3.5 text-violet-500" />
                                        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">Study Program unit</h3>
                                    </div>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 -mt-1">
                                        Select the unit that represents <strong>Study Program (Prodi)</strong> feedback. This unit&apos;s comments and scores are shown under the Study Programs tab on Faculty Insights, separate from campus service units. Only one unit can be selected.
                                    </p>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        {allUnits.map(unit => {
                                            const isSelected = studyProgramUnitId === unit.id;
                                            return (
                                                <button
                                                    key={unit.id}
                                                    onClick={() => setStudyProgramUnitId(isSelected ? null : unit.id)}
                                                    className={cn(
                                                        "flex items-center gap-3 px-3 py-2.5 rounded-xl border-2 text-left transition-all duration-150",
                                                        isSelected
                                                            ? "border-violet-200 dark:border-violet-900/50 bg-violet-50/50 dark:bg-violet-950/20"
                                                            : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40"
                                                    )}
                                                >
                                                    <div className={cn(
                                                        "w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors",
                                                        isSelected
                                                            ? "border-violet-500 bg-violet-500"
                                                            : "border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900"
                                                    )}>
                                                        {isSelected && (
                                                            <div className="w-1.5 h-1.5 rounded-full bg-white" />
                                                        )}
                                                    </div>
                                                    <span className={cn(
                                                        "text-sm font-medium truncate",
                                                        isSelected ? "text-violet-700 dark:text-violet-300" : "text-slate-700 dark:text-slate-300"
                                                    )}>
                                                        {unit.name}
                                                    </span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                    <div className="flex items-center justify-between pt-1">
                                        <p className="text-xs text-slate-400">
                                            {studyProgramUnitId != null
                                                ? `"${allUnits.find(u => u.id === studyProgramUnitId)?.name}" selected`
                                                : "No unit selected — falls back to unit named \"Study Program\""}
                                        </p>
                                        <Button
                                            size="sm"
                                            onClick={saveStudyProgramUnit}
                                            disabled={savingStudyProgramUnit}
                                            className="gap-2 bg-violet-600 hover:bg-violet-700 text-white"
                                        >
                                            {savingStudyProgramUnit ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                                            Save
                                        </Button>
                                    </div>
                                </div>
                            </>
                        )}
                    </CardContent>
                </Card>

                {/* ── Danger Zone ───────────────────────────────── */}
                <Card className="border-2 border-red-200 dark:border-red-900/40 shadow-sm overflow-hidden">
                    <CardHeader className="bg-red-50/60 dark:bg-red-950/10 pb-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <div className="p-1.5 bg-red-100 dark:bg-red-900/40 rounded-lg">
                                    <ShieldAlert className="w-4 h-4 text-red-600 dark:text-red-400" />
                                </div>
                                <CardTitle className="text-base text-red-700 dark:text-red-400">Danger Zone</CardTitle>
                            </div>
                            <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 text-[10px] font-medium">
                                Admin only after auth
                            </Badge>
                        </div>
                        <CardDescription>
                            Permanently deletes all respondent data, feedback, and analysis for a survey. This cannot be undone.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-5">
                        <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3">Delete Survey</p>
                        <div className="space-y-2">
                            {surveys.map(s => (
                                <div key={s.id} className="flex items-center justify-between px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className="shrink-0 p-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg">
                                            <Calendar className="w-3.5 h-3.5 text-slate-400" />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 truncate">
                                                {s.title}
                                                {s.year && <span className="text-xs font-normal text-slate-400 ml-2">({s.year})</span>}
                                            </p>
                                            {s.id.toString() === activeSurveyId && (
                                                <p className="text-[10px] text-indigo-500 font-medium mt-0.5">Currently active</p>
                                            )}
                                        </div>
                                    </div>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setDeleteTarget(s)}
                                        disabled={isDeleting}
                                        className="shrink-0 gap-1.5 border-red-200 text-red-500 hover:bg-red-50 hover:border-red-400 hover:text-red-700 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/30"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                        Delete
                                    </Button>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>

            </div>

            {/* ── Survey Switch Dialog ──────────────────────────── */}
            <Dialog open={!!confirmSurvey} onOpenChange={(open) => { if (!open) setConfirmSurvey(null); }}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Change Active Survey?</DialogTitle>
                        <DialogDescription>
                            Switching the active survey changes the data shown across <strong>all pages</strong> — dashboards, charts, analysis, and executive reports.
                        </DialogDescription>
                    </DialogHeader>
                    {confirmSurvey && (
                        <div className="py-2">
                            <div className="flex items-center gap-3 p-3 bg-indigo-50 dark:bg-indigo-950/20 rounded-xl border border-indigo-200 dark:border-indigo-800/40">
                                <div className="w-3 h-3 rounded-full bg-indigo-500 ring-4 ring-indigo-500/20 shrink-0" />
                                <div>
                                    <p className="font-semibold text-sm text-indigo-700 dark:text-indigo-300">
                                        {confirmSurvey.title}
                                        {confirmSurvey.year && <span className="text-xs font-normal text-slate-400 ml-2">({confirmSurvey.year})</span>}
                                    </p>
                                    <p className="text-xs text-slate-500 mt-0.5">
                                        {confirmSurvey.hasData ? "✅ Data is ready" : "⚠️ No analyzed data yet"}
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}
                    <DialogFooter className="gap-2 sm:gap-0">
                        <Button variant="outline" onClick={() => setConfirmSurvey(null)}>Cancel</Button>
                        <Button onClick={confirmSurveySwitch} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                            Confirm Switch
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ── Delete Confirmation ───────────────────────────── */}
            <ConfirmDialog
                open={deleteTarget !== null}
                onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
                title={`Delete "${deleteTarget?.title}"?`}
                description="This will permanently delete all respondent data, feedback segments, and analysis for this survey. This action cannot be undone."
                confirmLabel="Delete Permanently"
                variant="destructive"
                onConfirm={() => deleteTarget && handleDelete(deleteTarget)}
            />

            {/* ── Deletion Overlay ─────────────────────────────── */}
            {isDeleting && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                    <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl p-8 flex flex-col items-center gap-4 max-w-sm w-full mx-4 border border-red-100 dark:border-red-900/40">
                        <div className="p-3 bg-red-50 dark:bg-red-950/30 rounded-full">
                            <Loader2 className="w-8 h-8 animate-spin text-red-500" />
                        </div>
                        <div className="text-center">
                            <p className="font-semibold text-slate-800 dark:text-slate-100 text-lg">Deleting survey…</p>
                            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">This may take up to a minute for large surveys.<br />Please stay on this page.</p>
                        </div>
                    </div>
                </div>
            )}
        </PageShell>
    );
}
