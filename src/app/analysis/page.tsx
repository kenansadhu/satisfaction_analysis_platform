"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ArrowRight, AlertCircle, BarChart3 } from "lucide-react";
import { PageShell, PageHeader } from "@/components/layout/PageShell";
import { UnitStats } from "@/types";

export default function AnalysisDashboard() {
    const [units, setUnits] = useState<UnitStats[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => { loadDashboard(); }, []);

    async function loadDashboard() {
        setIsLoading(true);
        const { data: orgUnits } = await supabase.from('organization_units').select('*').order('name');

        if (orgUnits) {
            // 1. Fetch aggregated stats for ALL units in one single RPC request
            const { data: rawStats, error } = await supabase.rpc('get_analysis_status_stats');

            if (error) {
                console.error("Failed to load dashboard stats", error);
            }

            // 2. Map stats back into the format the UI expects
            const results = orgUnits.map(u => {
                const uStats = rawStats?.find((r: any) => r.unit_id === u.id);

                return {
                    unit_id: u.id,
                    unit_name: u.name,
                    analysis_status: u.analysis_status || "NOT_STARTED",
                    stats: {
                        total_rows: (uStats?.text_cols || 0) + (uStats?.score_cols || 0) + (uStats?.category_cols || 0),
                        text_cols: (uStats?.text_cols || 0) > 0 ? 1 : 0,
                        score_cols: (uStats?.score_cols || 0) > 0 ? 1 : 0,
                        category_cols: (uStats?.category_cols || 0) > 0 ? 1 : 0,
                        analyzed_segments: uStats?.analyzed_segments || 0
                    }
                };
            });

            setUnits(results);
        }
        setIsLoading(false);
    }

    const getStatusColor = (status: string) => {
        switch (status) {
            case "COMPLETED": return "bg-green-100 text-green-700 border-green-200";
            case "ANALYZING": return "bg-blue-100 text-blue-700 border-blue-200";
            case "CATEGORIES_REVIEW": return "bg-amber-100 text-amber-700 border-amber-200";
            case "DRAFTING_CATEGORIES": return "bg-purple-100 text-purple-700 border-purple-200";
            default: return "bg-slate-100 text-slate-700 border-slate-200";
        }
    };

    return (
        <PageShell>
            <PageHeader
                title="Analysis Board"
                description="Overview of analysis progress by unit."
                backHref="/"
                backLabel="Home"
            />

            <div className="max-w-7xl mx-auto px-8 py-10 space-y-8">
                {isLoading ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {[1, 2, 3].map(i => (
                            <div key={i} className="flex flex-col space-y-3">
                                <Skeleton className="h-[200px] w-full rounded-xl" />
                                <div className="space-y-2">
                                    <Skeleton className="h-4 w-full" />
                                    <Skeleton className="h-4 w-[80%]" />
                                </div>
                            </div>
                        ))}
                    </div>
                ) : units.length === 0 ? (
                    <EmptyState
                        title="No units found"
                        description="Create units and import survey data first to see analysis progress."
                        icon={AlertCircle}
                        actionLabel="Manage Units"
                        onAction={() => window.location.href = "/units"}
                    />
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {units.map(unit => (
                            <Link key={unit.unit_id} href={`/analysis/unit/${unit.unit_id}`} className="group">
                                <Card className="h-full hover:shadow-lg transition-all duration-200 cursor-pointer border-slate-200 hover:border-blue-300 overflow-hidden hover:-translate-y-0.5">
                                    <div className="h-1 bg-gradient-to-r from-purple-500 to-indigo-500" />
                                    <CardHeader className="pb-3">
                                        <div className="flex justify-between items-start mb-2">
                                            <Badge variant="outline" className={getStatusColor(unit.analysis_status)}>
                                                {unit.analysis_status.replace(/_/g, " ")}
                                            </Badge>
                                        </div>
                                        <CardTitle className="text-lg group-hover:text-blue-700 transition-colors">{unit.unit_name}</CardTitle>
                                    </CardHeader>
                                    <CardContent className="space-y-4">
                                        <div className="grid grid-cols-3 gap-2 text-xs text-slate-500 bg-slate-50 p-3 rounded-md">
                                            <div className="text-center p-1 border-r border-slate-200">
                                                <div className="font-bold text-slate-800 text-lg">{unit.stats.text_cols > 0 ? "Yes" : "-"}</div>
                                                <div>Text</div>
                                            </div>
                                            <div className="text-center p-1 border-r border-slate-200">
                                                <div className="font-bold text-slate-800 text-lg">{unit.stats.score_cols > 0 ? "Yes" : "-"}</div>
                                                <div>Scores</div>
                                            </div>
                                            <div className="text-center p-1">
                                                <div className="font-bold text-slate-800 text-lg">{unit.stats.category_cols > 0 ? "Yes" : "-"}</div>
                                                <div>Categorical</div>
                                            </div>
                                        </div>

                                        <div className="space-y-1">
                                            {(() => {
                                                const total = unit.stats.total_rows;
                                                const done = unit.stats.analyzed_segments;
                                                const pct = total > 0 ? Math.round((done / total) * 100) : 0;
                                                return (
                                                    <>
                                                        <div className="flex justify-between text-xs text-slate-500">
                                                            <span>Analysis Progress</span>
                                                            <span>{pct}%</span>
                                                        </div>
                                                        <Progress value={pct} className="h-1.5" />
                                                    </>
                                                );
                                            })()}
                                        </div>
                                    </CardContent>
                                    <CardFooter className="pt-0 pb-4">
                                        <div className="text-sm font-medium text-blue-600 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            Enter Workspace <ArrowRight className="w-4 h-4" />
                                        </div>
                                    </CardFooter>
                                </Card>
                            </Link>
                        ))}
                    </div>
                )}
            </div>
        </PageShell>
    );
}