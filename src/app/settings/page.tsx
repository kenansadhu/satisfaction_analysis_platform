"use client";

import { useState } from "react";
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
import { Settings, Database, CheckCircle2, AlertCircle, Loader2, Trash2, RefreshCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export default function SettingsPage() {
    const { surveys, activeSurveyId, setActiveSurveyId, activeSurvey, loading } = useActiveSurvey();

    // Confirmation dialog state
    const [confirmSurvey, setConfirmSurvey] = useState<SurveyInfo | null>(null);

    // Cache clearing state
    const [clearingCache, setClearingCache] = useState(false);

    const handleSurveyClick = (survey: SurveyInfo) => {
        if (survey.id.toString() === activeSurveyId) return; // Already active
        setConfirmSurvey(survey);
    };

    const confirmSurveySwitch = () => {
        if (confirmSurvey) {
            setActiveSurveyId(confirmSurvey.id.toString());
            toast.success(`Active survey changed to "${confirmSurvey.title}"`);
            setConfirmSurvey(null);
        }
    };

    const handleClearCache = async () => {
        if (!activeSurveyId) return;
        setClearingCache(true);
        try {
            const res = await fetch(`/api/executive/cache-scores?surveyId=${activeSurveyId}`, {
                method: 'POST',
            });
            const data = await res.json();
            if (res.ok) {
                toast.success("Score cache cleared. Next executive report load will recompute scores.");
            } else {
                toast.error(data.error || "Failed to clear cache");
            }
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

            <div className="grid gap-6 max-w-3xl">
                {/* Active Survey Card */}
                <Card className="border-2 border-indigo-200 dark:border-indigo-900/50 shadow-lg">
                    <CardHeader className="bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-950/20 dark:to-purple-950/20 rounded-t-lg">
                        <div className="flex items-center gap-2">
                            <Database className="w-5 h-5 text-indigo-500" />
                            <CardTitle className="text-lg">Active Survey</CardTitle>
                        </div>
                        <CardDescription>
                            All dashboards, charts, and AI analysis will use data from the selected survey.
                            Changing this affects <strong>all pages</strong> globally.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-6">
                        {/* Current Selection */}
                        {activeSurvey && (
                            <div className="mb-6 p-4 bg-indigo-50 dark:bg-indigo-950/20 rounded-xl border border-indigo-200 dark:border-indigo-800/40">
                                <p className="text-xs text-indigo-600 dark:text-indigo-400 font-medium uppercase tracking-wide mb-1">Currently Active</p>
                                <p className="text-xl font-bold text-slate-800 dark:text-slate-100">
                                    {activeSurvey.title}
                                    {activeSurvey.year && <span className="text-base font-normal text-slate-500 ml-2">({activeSurvey.year})</span>}
                                </p>
                                {activeSurvey.hasData ? (
                                    <div className="flex items-center gap-1.5 mt-2 text-green-600 dark:text-green-400">
                                        <CheckCircle2 className="w-4 h-4" />
                                        <span className="text-sm font-medium">Analyzed data available</span>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-1.5 mt-2 text-amber-600 dark:text-amber-400">
                                        <AlertCircle className="w-4 h-4" />
                                        <span className="text-sm font-medium">No analyzed data — run analysis first</span>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Survey List */}
                        <p className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-3">Select a survey to activate:</p>
                        <div className="space-y-2">
                            {surveys.map(s => (
                                <button
                                    key={s.id}
                                    onClick={() => handleSurveyClick(s)}
                                    className={cn(
                                        "w-full flex items-center justify-between px-4 py-3 rounded-xl border-2 transition-all duration-200 text-left group",
                                        s.id.toString() === activeSurveyId
                                            ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30 shadow-md shadow-indigo-500/10"
                                            : "border-slate-200 dark:border-slate-800 hover:border-indigo-300 dark:hover:border-indigo-700 hover:bg-slate-50 dark:hover:bg-slate-900"
                                    )}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={cn(
                                            "w-3 h-3 rounded-full transition-colors",
                                            s.id.toString() === activeSurveyId ? "bg-indigo-500 ring-4 ring-indigo-500/20" : "bg-slate-300 dark:bg-slate-700"
                                        )} />
                                        <div>
                                            <p className={cn(
                                                "font-semibold text-sm",
                                                s.id.toString() === activeSurveyId ? "text-indigo-700 dark:text-indigo-300" : "text-slate-700 dark:text-slate-300"
                                            )}>
                                                {s.title}
                                                {s.year && <span className="text-xs font-normal text-slate-400 ml-2">({s.year})</span>}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {s.hasData ? (
                                            <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-[10px] font-medium">
                                                <CheckCircle2 className="w-3 h-3 mr-1" /> Data Ready
                                            </Badge>
                                        ) : (
                                            <Badge variant="outline" className="text-slate-400 text-[10px]">
                                                No Data
                                            </Badge>
                                        )}
                                    </div>
                                </button>
                            ))}
                        </div>
                    </CardContent>
                </Card>

                {/* Cache Management Card */}
                <Card>
                    <CardHeader>
                        <div className="flex items-center gap-2">
                            <RefreshCcw className="w-5 h-5 text-slate-500" />
                            <CardTitle className="text-lg">Score Cache</CardTitle>
                        </div>
                        <CardDescription>
                            Quantitative satisfaction scores are cached for faster loading. Clear the cache if you re-imported survey data.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
                            <div>
                                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                    Clear cache for {activeSurvey?.title || "active survey"}
                                </p>
                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                    Next executive report load will recompute and re-cache scores
                                </p>
                            </div>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleClearCache}
                                disabled={clearingCache || !activeSurveyId}
                                className="gap-2 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/30"
                            >
                                {clearingCache ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                                Clear Cache
                            </Button>
                        </div>
                    </CardContent>
                </Card>

                {/* Placeholder for future settings */}
                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg text-slate-600 dark:text-slate-400">More Settings</CardTitle>
                        <CardDescription>Additional platform settings will appear here in future updates.</CardDescription>
                    </CardHeader>
                </Card>
            </div>

            {/* Survey Switch Confirmation Dialog */}
            <Dialog open={!!confirmSurvey} onOpenChange={(open) => { if (!open) setConfirmSurvey(null); }}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Change Active Survey?</DialogTitle>
                        <DialogDescription>
                            Switching the active survey will change the data displayed across <strong>all pages</strong> —
                            dashboards, charts, analysis, and executive reports will reload with data from the new survey.
                        </DialogDescription>
                    </DialogHeader>
                    {confirmSurvey && (
                        <div className="py-3">
                            <div className="flex items-center gap-3 p-3 bg-indigo-50 dark:bg-indigo-950/20 rounded-lg border border-indigo-200 dark:border-indigo-800/40">
                                <div className="w-3 h-3 rounded-full bg-indigo-500 ring-4 ring-indigo-500/20" />
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
                        <Button variant="outline" onClick={() => setConfirmSurvey(null)}>
                            Cancel
                        </Button>
                        <Button onClick={confirmSurveySwitch} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                            Confirm Switch
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </PageShell>
    );
}
