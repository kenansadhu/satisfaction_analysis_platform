"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { PageShell, PageHeader } from "@/components/layout/PageShell";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Loader2, Database, MessageSquare, BarChart3, Info, Search, ChevronDown, ChevronRight, Hash } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface ColumnInfo {
    name: string;
    type: "Qualitative" | "Quantitative";
    responses: number;
    samples: string[];
}

export default function UnitColumnsPage() {
    const params = useParams();
    const surveyId = params.id as string;
    const unitId = params.unitId as string;

    const [loading, setLoading] = useState(true);
    const [unitName, setUnitName] = useState("");
    const [columns, setColumns] = useState<ColumnInfo[]>([]);
    const [filterText, setFilterText] = useState("");
    const [expandedCols, setExpandedCols] = useState<Set<string>>(new Set());

    useEffect(() => {
        async function loadData() {
            try {
                // Fetch Unit Name
                const { data: unit } = await supabase
                    .from('organization_units')
                    .select('name')
                    .eq('id', unitId)
                    .single();
                if (unit) setUnitName(unit.name);

                // Fetch Respondent IDs for the survey (efficiently)
                let respIds: number[] = [];
                let rPage = 0;
                while (true) {
                    const { data: rBat } = await supabase
                        .from('respondents')
                        .select('id')
                        .eq('survey_id', surveyId)
                        .range(rPage * 1000, (rPage + 1) * 1000 - 1);
                    if (!rBat || rBat.length === 0) break;
                    respIds.push(...rBat.map((r: any) => r.id));
                    if (rBat.length < 1000) break;
                    rPage++;
                }

                if (respIds.length === 0) {
                    setColumns([]);
                    setLoading(false);
                    return;
                }

                // Fetch Column Groups
                const CHUNK_SIZE = 200;
                const columnMap = new Map<string, ColumnInfo>();

                for (let i = 0; i < respIds.length; i += CHUNK_SIZE) {
                    const chunk = respIds.slice(i, i + CHUNK_SIZE);
                    const { data } = await supabase
                        .from('raw_feedback_inputs')
                        .select('source_column, is_quantitative, raw_text, numerical_score')
                        .eq('target_unit_id', unitId)
                        .in('respondent_id', chunk);

                    if (data) {
                        data.forEach((row: any) => {
                            if (!columnMap.has(row.source_column)) {
                                columnMap.set(row.source_column, {
                                    name: row.source_column,
                                    type: row.is_quantitative ? "Quantitative" : "Qualitative",
                                    responses: 0,
                                    samples: []
                                });
                            }
                            const col = columnMap.get(row.source_column)!;
                            col.responses++;

                            // Add samples (unique and limit to 10)
                            const sampleText = (row.is_quantitative
                                ? row.numerical_score?.toString()
                                : row.raw_text)?.trim();

                            if (sampleText && sampleText !== "-" && col.samples.length < 10 && !col.samples.includes(sampleText)) {
                                col.samples.push(sampleText);
                            }
                        });
                    }
                }

                setColumns(Array.from(columnMap.values()).sort((a, b) => a.name.localeCompare(b.name)));
            } catch (error) {
                console.error("Failed to load columns:", error);
                toast.error("Failed to load source columns");
            } finally {
                setLoading(false);
            }
        }

        loadData();
    }, [surveyId, unitId]);

    const filteredColumns = useMemo(() =>
        columns.filter(c => c.name.toLowerCase().includes(filterText.toLowerCase())),
        [columns, filterText]
    );

    const toggleExpand = (name: string) => {
        setExpandedCols(prev => {
            const next = new Set(prev);
            if (next.has(name)) next.delete(name);
            else next.add(name);
            return next;
        });
    };

    return (
        <PageShell>
            <PageHeader
                title={`Source Columns: ${unitName}`}
                description="Explore all qualitative and quantitative data mapped to this unit."
                backHref={`/surveys/${surveyId}/unit/${unitId}?tab=categories`}
                backLabel="Back to Workspace"
            />

            <div className="max-w-5xl mx-auto px-8 py-10 space-y-8">
                {/* Statistics & Search Bar */}
                <div className="flex flex-col md:flex-row gap-6 items-center justify-between bg-slate-50/50 p-6 rounded-2xl border border-slate-200/60 shadow-sm backdrop-blur-sm">
                    <div className="flex items-center gap-8">
                        <div className="flex flex-col">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Columns</span>
                            <span className="text-2xl font-bold text-slate-800">{columns.length}</span>
                        </div>
                        <div className="w-px h-10 bg-slate-200" />
                        <div className="flex flex-col">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Qualitative</span>
                            <span className="text-2xl font-bold text-purple-600">{columns.filter(c => c.type === "Qualitative").length}</span>
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Quantitative</span>
                            <span className="text-2xl font-bold text-blue-600">{columns.filter(c => c.type === "Quantitative").length}</span>
                        </div>
                    </div>

                    <div className="relative w-full md:w-80">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <Input
                            placeholder="Search column names..."
                            className="pl-10 h-11 bg-white border-slate-200 shadow-sm focus:ring-indigo-500 rounded-xl"
                            value={filterText}
                            onChange={(e) => setFilterText(e.target.value)}
                        />
                    </div>
                </div>

                {loading ? (
                    <div className="flex flex-col items-center justify-center py-32 gap-6">
                        <div className="relative">
                            <div className="w-16 h-16 border-4 border-indigo-100 rounded-full animate-pulse" />
                            <Loader2 className="w-8 h-8 animate-spin text-indigo-600 absolute top-4 left-4" />
                        </div>
                        <p className="text-slate-500 font-medium animate-pulse">Analyzing column structure...</p>
                    </div>
                ) : filteredColumns.length === 0 ? (
                    <Card className="border-dashed border-2 py-32 bg-slate-50/20">
                        <div className="flex flex-col items-center text-center gap-4">
                            <div className="p-4 bg-slate-100 rounded-full">
                                <Info className="w-10 h-10 text-slate-300" />
                            </div>
                            <div className="space-y-1">
                                <h3 className="text-lg font-semibold text-slate-700">No Columns Found</h3>
                                <p className="text-sm text-slate-500 max-w-sm">
                                    {filterText ? `No columns match your search for "${filterText}"` : "We couldn't find any data columns mapped to this unit."}
                                </p>
                            </div>
                        </div>
                    </Card>
                ) : (
                    <div className="grid gap-4">
                        {filteredColumns.map((col) => {
                            const isExpanded = expandedCols.has(col.name);
                            return (
                                <div
                                    key={col.name}
                                    className={cn(
                                        "group border rounded-2xl overflow-hidden transition-all duration-300 bg-white shadow-sm",
                                        isExpanded ? "ring-2 ring-indigo-500/10 border-indigo-200" : "hover:border-slate-300 hover:shadow-md"
                                    )}
                                >
                                    {/* Header Section */}
                                    <div
                                        className={cn(
                                            "flex items-center justify-between p-5 cursor-pointer select-none",
                                            isExpanded ? "bg-slate-50/80 border-b border-slate-100" : "bg-white"
                                        )}
                                        onClick={() => toggleExpand(col.name)}
                                    >
                                        <div className="flex items-center gap-5 flex-1 min-w-0">
                                            <div className={cn(
                                                "p-3 rounded-xl shrink-0 transition-transform group-hover:scale-110",
                                                col.type === "Qualitative" ? "bg-purple-50 text-purple-600" : "bg-blue-50 text-blue-600"
                                            )}>
                                                {col.type === "Qualitative" ? <MessageSquare className="w-5 h-5" /> : <BarChart3 className="w-5 h-5" />}
                                            </div>
                                            <div className="flex flex-col min-w-0">
                                                <h3 className="text-base font-bold text-slate-900 truncate pr-4">
                                                    {col.name}
                                                </h3>
                                                <div className="flex items-center gap-3 mt-1">
                                                    <Badge
                                                        variant="secondary"
                                                        className={cn(
                                                            "text-[10px] uppercase tracking-wider font-bold py-0.5",
                                                            col.type === "Qualitative" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"
                                                        )}
                                                    >
                                                        {col.type}
                                                    </Badge>
                                                    <span className="text-[11px] text-slate-400 flex items-center gap-1 font-medium">
                                                        <Hash className="w-3 h-3" /> {col.responses.toLocaleString()} responses
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-4">
                                            <div className={cn(
                                                "p-2 rounded-full transition-colors",
                                                isExpanded ? "bg-indigo-100 text-indigo-600" : "bg-slate-50 text-slate-400 group-hover:bg-slate-100"
                                            )}>
                                                {isExpanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Content Section (Samples) */}
                                    {isExpanded && (
                                        <div className="p-6 bg-white animate-in slide-in-from-top-2 duration-300">
                                            <div className="space-y-4">
                                                <div className="flex items-center gap-2 mb-2">
                                                    <Database className="w-4 h-4 text-slate-400" />
                                                    <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Data Preview</span>
                                                </div>
                                                <div className="grid gap-2">
                                                    {col.samples.length > 0 ? (
                                                        col.samples.map((sample, i) => (
                                                            <div
                                                                key={i}
                                                                className="text-sm text-slate-700 bg-slate-50/80 px-4 py-3 rounded-xl border border-slate-100 leading-relaxed break-words"
                                                            >
                                                                {sample}
                                                            </div>
                                                        ))
                                                    ) : (
                                                        <div className="text-sm text-slate-400 italic py-4 flex items-center justify-center gap-2 bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
                                                            No previews available for this column.
                                                        </div>
                                                    )}
                                                </div>
                                                {col.samples.length >= 10 && (
                                                    <p className="text-[10px] text-center text-slate-400 font-medium pt-2 uppercase tracking-wide">Showing 10 latest unique samples</p>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            <style jsx global>{`
                .ring-indigo-500/10 {
                    box-shadow: 0 0 0 4px rgb(99 102 241 / 0.1);
                }
            `}</style>
        </PageShell>
    );
}
