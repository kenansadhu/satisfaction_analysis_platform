"use client";

import { useActiveSurvey, SurveyInfo } from "@/context/SurveyContext";
import { PageShell, PageHeader } from "@/components/layout/PageShell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Settings, Database, CheckCircle2, AlertCircle } from "lucide-react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export default function SettingsPage() {
    const { surveys, activeSurveyId, setActiveSurveyId, activeSurvey, loading } = useActiveSurvey();

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
                                    onClick={() => setActiveSurveyId(s.id.toString())}
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

                {/* Placeholder for future settings */}
                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg text-slate-600 dark:text-slate-400">More Settings</CardTitle>
                        <CardDescription>Additional platform settings will appear here in future updates.</CardDescription>
                    </CardHeader>
                </Card>
            </div>
        </PageShell>
    );
}
