"use client";

import { useState, useEffect } from "react";
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
import { Settings, Database, CheckCircle2, AlertCircle, Loader2, Trash2, RefreshCcw, ShieldAlert, Calendar, BarChart2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ConfirmDialog";

export default function SettingsPage() {
    const { surveys, activeSurveyId, setActiveSurveyId, activeSurvey, loading } = useActiveSurvey();

    const [confirmSurvey, setConfirmSurvey] = useState<SurveyInfo | null>(null);
    const [clearingCache, setClearingCache] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<SurveyInfo | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    const [allUnits, setAllUnits] = useState<{ id: number; name: string }[]>([]);
    const [excludedUnitIds, setExcludedUnitIds] = useState<number[]>([]);
    const [savingExclusions, setSavingExclusions] = useState(false);

    useEffect(() => {
        fetch("/api/settings/excluded-score-units")
            .then(r => r.json())
            .then(d => setExcludedUnitIds(d.excludedUnitIds || []));
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

    const handleClearCache = async () => {
        if (!activeSurveyId) return;
        setClearingCache(true);
        try {
            const res = await fetch(`/api/executive/cache-scores?surveyId=${activeSurveyId}`, { method: 'POST' });
            const data = await res.json();
            if (res.ok) toast.success("Cache cleared — scores will recompute on next report load.");
            else toast.error(data.error || "Failed to clear cache");
        } catch {
            toast.error("Failed to clear cache");
        } finally {
            setClearingCache(false);
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

                {/* ── Score Cache ───────────────────────────────── */}
                <Card className="shadow-sm">
                    <CardHeader className="pb-4">
                        <div className="flex items-center gap-2">
                            <div className="p-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg">
                                <RefreshCcw className="w-4 h-4 text-slate-500" />
                            </div>
                            <CardTitle className="text-base">Data Cache</CardTitle>
                        </div>
                        <CardDescription>
                            Scores and cross-unit mention data are cached for faster loading. Clear if you re-ran analysis or re-imported survey data.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800">
                            <div>
                                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                    {activeSurvey?.title || "Active survey"}
                                </p>
                                <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                                    Scores will recompute on the next executive report load
                                </p>
                            </div>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleClearCache}
                                disabled={clearingCache || !activeSurveyId}
                                className="gap-2 shrink-0 border-slate-300 hover:border-red-300 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors"
                            >
                                {clearingCache ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                                Clear Cache
                            </Button>
                        </div>
                    </CardContent>
                </Card>

                {/* ── Executive Score Calculation ──────────────── */}
                <Card className="shadow-sm">
                    <CardHeader className="pb-4">
                        <div className="flex items-center gap-2">
                            <div className="p-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg">
                                <BarChart2 className="w-4 h-4 text-slate-500" />
                            </div>
                            <CardTitle className="text-base">Executive Score Calculation</CardTitle>
                        </div>
                        <CardDescription>
                            Choose which units count toward the overall Satisfaction Index on the Executive Insights page. Uncheck units whose questions use a different scale or shouldn't factor into the institution-wide average.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {allUnits.length === 0 ? (
                            <div className="flex items-center justify-center py-6">
                                <Loader2 className="w-5 h-5 animate-spin text-slate-300" />
                            </div>
                        ) : (
                            <>
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
                                <div className="flex items-center justify-between pt-2">
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
