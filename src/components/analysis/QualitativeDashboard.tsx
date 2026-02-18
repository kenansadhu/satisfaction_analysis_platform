"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, TrendingUp, AlertTriangle, Lightbulb, Filter, Sparkles, RefreshCcw, Save } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from "recharts";
import { Badge } from "@/components/ui/badge";
import ReactMarkdown from "react-markdown";

type Suggestion = { id: number; text: string; category: string; sentiment: string };

export default function QualitativeDashboard({ unitId }: { unitId: string }) {
    const [loading, setLoading] = useState(true);

    // Data State
    const [allSegments, setAllSegments] = useState<any[]>([]);
    const [quantData, setQuantData] = useState<any[]>([]);
    const [categories, setCategories] = useState<any[]>([]);
    const [unitName, setUnitName] = useState("");

    // Filter State
    const [filterCategory, setFilterCategory] = useState<string>("ALL");
    const [filterSentiment, setFilterSentiment] = useState<string>("ALL");
    const [filterActionable, setFilterActionable] = useState<boolean>(false);

    // AI Report State
    const [report, setReport] = useState<string | null>(null);
    const [generatingReport, setGeneratingReport] = useState(false);
    const [lastSaved, setLastSaved] = useState<string | null>(null);

    useEffect(() => {
        loadSavedReport();
        loadData();
    }, [unitId]);

    async function loadSavedReport() {
        const { data } = await supabase
            .from('unit_ai_reports')
            .select('content, created_at')
            .eq('unit_id', unitId)
            .eq('report_type', 'executive')
            .maybeSingle();

        if (data) {
            setReport(data.content.report);
            setLastSaved(new Date(data.created_at).toLocaleString());
        }
    }

    async function loadData() {
        setLoading(true);

        // 1. Unit Name
        const { data: u } = await supabase.from('organization_units').select('name').eq('id', unitId).single();
        if (u) setUnitName(u.name);

        // 2. Categories
        const { data: cats } = await supabase.from('analysis_categories').select('id, name').eq('unit_id', unitId);
        setCategories(cats || []);
        const catMap = new Map(cats?.map(c => [c.id, c.name]));

        // 3. Quantitative Scores
        const { data: scores } = await supabase
            .from('raw_feedback_inputs')
            .select('source_column, numerical_score')
            .eq('target_unit_id', unitId)
            .eq('is_quantitative', true)
            .not('numerical_score', 'is', null);

        const scoreMap: Record<string, { sum: number, count: number }> = {};
        scores?.forEach(s => {
            if (!scoreMap[s.source_column]) scoreMap[s.source_column] = { sum: 0, count: 0 };
            scoreMap[s.source_column].sum += s.numerical_score;
            scoreMap[s.source_column].count++;
        });
        const quantStats = Object.entries(scoreMap).map(([k, v]) => ({
            metric: k,
            average: (v.sum / v.count).toFixed(2),
            count: v.count
        }));
        setQuantData(quantStats);

        // 4. Qualitative Segments
        const { data: rawInputs } = await supabase
            .from('raw_feedback_inputs')
            .select(`
            id,
            feedback_segments (
                id, segment_text, sentiment, category_id, is_suggestion
            )
        `)
            .eq('target_unit_id', unitId)
            .eq('requires_analysis', true);

        if (rawInputs) {
            const flat = rawInputs.flatMap(r => r.feedback_segments).map((s: any) => ({
                ...s,
                category_name: catMap.get(s.category_id) || "Uncategorized"
            }));
            setAllSegments(flat);
        }
        setLoading(false);
    }

    // --- DERIVED DATA ---
    const filteredSegments = allSegments.filter(s => {
        if (filterCategory !== "ALL" && s.category_name !== filterCategory) return false;
        if (filterSentiment !== "ALL" && s.sentiment !== filterSentiment) return false;
        if (filterActionable && !s.is_suggestion) return false;
        return true;
    });

    const sentimentCounts = { Positive: 0, Negative: 0, Neutral: 0 };
    const catCounts: Record<string, any> = {};
    const suggestionList: Suggestion[] = [];

    filteredSegments.forEach(s => {
        if (s.sentiment === "Positive") sentimentCounts.Positive++;
        else if (s.sentiment === "Negative") sentimentCounts.Negative++;
        else sentimentCounts.Neutral++;

        if (!catCounts[s.category_name]) catCounts[s.category_name] = { name: s.category_name, positive: 0, negative: 0, neutral: 0, total: 0 };
        catCounts[s.category_name].total++;
        if (s.sentiment === "Positive") catCounts[s.category_name].positive++;
        else if (s.sentiment === "Negative") catCounts[s.category_name].negative++;
        else catCounts[s.category_name].neutral++;

        if (s.is_suggestion) suggestionList.push({ id: s.id, text: s.segment_text, category: s.category_name, sentiment: s.sentiment });
    });

    const pieData = [
        { name: 'Positive', value: sentimentCounts.Positive, color: '#22c55e' },
        { name: 'Neutral', value: sentimentCounts.Neutral, color: '#94a3b8' },
        { name: 'Negative', value: sentimentCounts.Negative, color: '#ef4444' },
    ];

    const barData = Object.values(catCounts).sort((a: any, b: any) => b.total - a.total);

    // --- AI GENERATOR ---
    const generateReport = async () => {
        setGeneratingReport(true);
        try {
            const response = await fetch('/api/ai/generate-report', {
                method: 'POST',
                body: JSON.stringify({
                    unitName,
                    quantitative: quantData,
                    qualitative: barData.slice(0, 8),
                    suggestions: suggestionList.slice(0, 10)
                })
            });
            const data = await response.json();
            if (data.report) {
                setReport(data.report);

                // SAVE to Database (Upsert)
                const { error: saveError } = await supabase.from('unit_ai_reports').upsert({
                    unit_id: parseInt(unitId),
                    report_type: 'executive',
                    content: { report: data.report }
                }, { onConflict: 'unit_id, report_type' });

                if (!saveError) setLastSaved(new Date().toLocaleString());
            }
        } catch (e) {
            alert("Failed to generate report");
        } finally {
            setGeneratingReport(false);
        }
    };

    if (loading) return <div className="flex justify-center py-20 text-slate-400"><Loader2 className="w-8 h-8 animate-spin mr-2" /> Analysis in progress...</div>;

    return (
        <div className="space-y-6 animate-in fade-in">

            {/* --- FILTERS --- */}
            <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center bg-white p-4 rounded-lg border shadow-sm">
                <div className="flex items-center gap-2">
                    <div className="p-2 bg-indigo-50 rounded-md"><Filter className="w-5 h-5 text-indigo-600" /></div>
                    <h3 className="font-semibold text-slate-800">Dashboard Filters</h3>
                </div>

                <div className="flex flex-wrap gap-2 w-full md:w-auto">
                    <Select value={filterCategory} onValueChange={setFilterCategory}>
                        <SelectTrigger className="w-[180px] h-9"><SelectValue placeholder="All Topics" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="ALL">All Topics</SelectItem>
                            {categories.map(c => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}
                        </SelectContent>
                    </Select>

                    <Select value={filterSentiment} onValueChange={setFilterSentiment}>
                        <SelectTrigger className="w-[150px] h-9"><SelectValue placeholder="All Sentiment" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="ALL">All Sentiment</SelectItem>
                            <SelectItem value="Positive">Positive</SelectItem>
                            <SelectItem value="Negative">Negative</SelectItem>
                            <SelectItem value="Neutral">Neutral</SelectItem>
                        </SelectContent>
                    </Select>

                    <Button
                        variant={filterActionable ? "default" : "outline"}
                        className={`h-9 gap-2 ${filterActionable ? "bg-amber-500 hover:bg-amber-600 border-amber-500" : "text-slate-600"}`}
                        onClick={() => setFilterActionable(!filterActionable)}
                    >
                        <Lightbulb className={`w-4 h-4 ${filterActionable ? "fill-white" : ""}`} />
                        Suggestions
                    </Button>

                    {(filterCategory !== "ALL" || filterSentiment !== "ALL" || filterActionable) && (
                        <Button variant="ghost" size="icon" className="h-9 w-9 text-slate-400" onClick={() => { setFilterCategory("ALL"); setFilterSentiment("ALL"); setFilterActionable(false); }}>
                            <RefreshCcw className="w-4 h-4" />
                        </Button>
                    )}
                </div>
            </div>

            {/* --- CHARTS --- */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card className="col-span-1 lg:col-span-2">
                    <CardHeader><CardTitle>Topic Sentiment distribution</CardTitle></CardHeader>
                    <CardContent className="h-[350px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={barData} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                                <XAxis type="number" />
                                <YAxis dataKey="name" type="category" width={150} tick={{ fontSize: 12 }} />
                                <Tooltip cursor={{ fill: 'transparent' }} />
                                <Bar dataKey="positive" stackId="a" fill="#22c55e" name="Positive" radius={[0, 4, 4, 0]} />
                                <Bar dataKey="neutral" stackId="a" fill="#cbd5e1" name="Neutral" />
                                <Bar dataKey="negative" stackId="a" fill="#ef4444" name="Negative" radius={[4, 0, 0, 4]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>

                <Card className="col-span-1">
                    <CardHeader><CardTitle>Overall Sentiment</CardTitle></CardHeader>
                    <CardContent className="h-[350px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                                    {pieData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                                </Pie>
                                <Tooltip />
                                <Legend verticalAlign="bottom" />
                            </PieChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
            </div>

            {/* --- AI EXECUTIVE REPORT --- */}
            <Card className="border-indigo-200 bg-indigo-50/20 shadow-md">
                <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                        <CardTitle className="flex items-center gap-2 text-indigo-900"><Sparkles className="w-5 h-5 text-indigo-600" /> Executive Summary</CardTitle>
                        <CardDescription>Generated Strategic Analysis</CardDescription>
                        {lastSaved && <p className="text-[10px] text-slate-400 mt-1 flex items-center gap-1"><Save className="w-3 h-3" /> Last update: {lastSaved}</p>}
                    </div>
                    <Button onClick={generateReport} disabled={generatingReport} className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-md">
                        {generatingReport ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCcw className="w-4 h-4 mr-2" />}
                        {report ? "Re-Generate Report" : "Generate Report"}
                    </Button>
                </CardHeader>
                <CardContent>
                    {report ? (
                        <div className="bg-white p-8 rounded-lg border border-indigo-100 shadow-sm text-slate-700 leading-relaxed text-sm">
                            <ReactMarkdown
                                components={{
                                    h1: ({ node, ...props }) => <h1 className="text-2xl font-bold text-indigo-900 mt-6 mb-4 border-b pb-2" {...props} />,
                                    h2: ({ node, ...props }) => <h2 className="text-lg font-semibold text-indigo-800 mt-6 mb-3 flex items-center gap-2" {...props} />,
                                    ul: ({ node, ...props }) => <ul className="list-disc pl-5 space-y-2 mb-4 text-slate-600" {...props} />,
                                    li: ({ node, ...props }) => <li className="pl-1" {...props} />,
                                    p: ({ node, ...props }) => <p className="mb-4" {...props} />,
                                    strong: ({ node, ...props }) => <strong className="font-bold text-slate-900 bg-indigo-50 px-1 rounded" {...props} />,
                                }}
                            >
                                {report}
                            </ReactMarkdown>
                        </div>
                    ) : (
                        <div className="text-center py-10 text-slate-400 border-2 border-dashed border-indigo-100 rounded-lg italic">
                            No report generated for this unit yet.
                        </div>
                    )}
                </CardContent>
            </Card>

        </div>
    );
}