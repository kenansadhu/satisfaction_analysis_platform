"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ArrowRight, BarChart3, BrainCircuit, CheckCircle2, Clock, AlertCircle, FileText, Database } from "lucide-react";

type UnitStatus = {
    unit_id: number;
    unit_name: string;
    analysis_status: string;
    stats: {
        total_rows: number;
        text_cols: number;     // "TEXT" type columns
        score_cols: number;    // "SCORE" type columns
        category_cols: number; // "CATEGORY" type columns
        analyzed_segments: number;
    }
};

export default function AnalysisDashboard() {
    const [units, setUnits] = useState<UnitStatus[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => { loadDashboard(); }, []);

    async function loadDashboard() {
        setIsLoading(true);
        const { data: orgUnits } = await supabase.from('organization_units').select('*').order('name');

        if (orgUnits) {
            const statsPromises = orgUnits.map(async (u) => {
                // 1. Get Column Configs (to count types)
                // Note: We scan the raw inputs to infer column types used in this unit
                // A more optimized way is to store column metadata, but scanning `source_column` + `is_quantitative` works for now.

                // Count Qualitative (Text) inputs
                const { count: textCount } = await supabase.from('raw_feedback_inputs')
                    .select('*', { count: 'exact', head: true })
                    .eq('target_unit_id', u.id)
                    .eq('requires_analysis', true); // The new flag for Open Text

                // Count Quantitative (Score) inputs
                const { count: scoreCount } = await supabase.from('raw_feedback_inputs')
                    .select('*', { count: 'exact', head: true })
                    .eq('target_unit_id', u.id)
                    .eq('is_quantitative', true);

                // Count Categorical inputs (Quantitative=False AND RequiresAnalysis=False)
                const { count: catCount } = await supabase.from('raw_feedback_inputs')
                    .select('*', { count: 'exact', head: true })
                    .eq('target_unit_id', u.id)
                    .eq('is_quantitative', false)
                    .eq('requires_analysis', false);

                const { count: analyzed } = await supabase.from('feedback_segments')
                    .select('*', { count: 'exact', head: true })
                    .eq('category_id', u.id); // This join needs refinement in real app, relying on raw_input link usually

                return {
                    unit_id: u.id,
                    unit_name: u.name,
                    analysis_status: u.analysis_status || "NOT_STARTED",
                    stats: {
                        total_rows: (textCount || 0) + (scoreCount || 0) + (catCount || 0),
                        text_cols: textCount || 0 > 0 ? 1 : 0, // Approximate "Columns" by presence of data type
                        score_cols: scoreCount || 0 > 0 ? 1 : 0,
                        category_cols: catCount || 0 > 0 ? 1 : 0,
                        analyzed_segments: analyzed || 0
                    }
                };
            });

            const results = await Promise.all(statsPromises);
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
        <div className="min-h-screen bg-slate-50 p-8 font-sans">
            <div className="max-w-7xl mx-auto space-y-8">

                <div className="flex justify-between items-center">
                    <div>
                        <h1 className="text-3xl font-bold text-slate-900">Analysis Board</h1>
                        <p className="text-slate-500">Overview of analysis progress by unit.</p>
                    </div>
                    <Link href="/">
                        <Button variant="outline">Back to Home</Button>
                    </Link>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {units.map(unit => (
                        <Link key={unit.unit_id} href={`/analysis/unit/${unit.unit_id}`} className="group">
                            <Card className="h-full hover:shadow-lg transition-all duration-200 cursor-pointer border-slate-200 hover:border-blue-300">
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
                                        <div className="flex justify-between text-xs text-slate-500">
                                            <span>Analysis Progress</span>
                                            <span>0%</span> {/* Placeholder logic */}
                                        </div>
                                        <Progress value={0} className="h-1.5" />
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
            </div>
        </div>
    );
}