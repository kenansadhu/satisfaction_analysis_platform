"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Loader2, TrendingUp, AlertTriangle, Lightbulb, Filter, Sparkles, RefreshCcw, Save, Download, BarChart2, MessageSquare, ChevronRight, ChevronDown, X, Quote, Target, CheckCircle2, AlertCircle, Search, Table2 } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from "recharts";
import { toast } from "sonner";

// --- TYPES ---
type ChartData = { name: string; value: number; color?: string };
type QuestionGroup = {
    question: string;
    type: "SCORE" | "CATEGORY";
    average?: string;
    totalResponses: number;
    chartData: ChartData[];
};
type DrillDownEntry = { id: number; raw_text: string; numerical_score?: number };

type ExecutiveReportData = {
    executive_summary: string;
    overall_verdict: "Excellent" | "Good" | "Needs Improvement" | "Critical";
    strengths: { title: string; detail: string; evidence: string }[];
    concerns: { title: string; detail: string; severity: "High" | "Medium" | "Low"; evidence: string }[];
    recommendations: { title: string; action: string; impact: string; priority: "Immediate" | "Short-term" | "Long-term" }[];
    closing_statement: string;
};

export default function ComprehensiveDashboard({ unitId, surveyId }: { unitId: string; surveyId?: string }) {
    const dashboardRef = useRef<HTMLDivElement>(null);
    const [loading, setLoading] = useState(true);
    const [exportingPdf, setExportingPdf] = useState(false);

    // --- DATA STATE ---
    // Qualitative
    const [allSegments, setAllSegments] = useState<any[]>([]);
    const [categories, setCategories] = useState<any[]>([]);
    const [unitName, setUnitName] = useState("");

    // Quantitative
    const [quantGroups, setQuantGroups] = useState<QuestionGroup[]>([]);
    const [globalAvgScore, setGlobalAvgScore] = useState<string>("N/A");

    // AI Report
    const [report, setReport] = useState<ExecutiveReportData | null>(null);
    const [generatingReport, setGeneratingReport] = useState(false);
    const [lastSaved, setLastSaved] = useState<string | null>(null);

    // Drill-Down States
    const [activeQualDrillDown, setActiveQualDrillDown] = useState<{ category: string, sentiment: string } | null>(null);
    const [activeQuantDrillDown, setActiveQuantDrillDown] = useState<{ question: string, filterValue: string, type: "SCORE" | "CATEGORY", entries: DrillDownEntry[], loading: boolean } | null>(null);

    // Raw Data Explorer
    const [showRawData, setShowRawData] = useState(false);
    const [rawDataTab, setRawDataTab] = useState<"comments" | "ratings">("comments");
    const [rawDataEntries, setRawDataEntries] = useState<any[]>([]);
    const [rawDataLoading, setRawDataLoading] = useState(false);
    const [rawDataPage, setRawDataPage] = useState(0);
    const [rawDataSearch, setRawDataSearch] = useState("");
    const [rawDataTotal, setRawDataTotal] = useState(0);
    const RAW_PAGE_SIZE = 25;

    useEffect(() => {
        loadAllData();
        loadSavedReport();
    }, [unitId, surveyId]);

    // --- DATA LOADING ---
    async function loadSavedReport() {
        // TODO: ideally scope report by survey_id too if table allows
        const { data } = await supabase.from('unit_ai_reports').select('content, created_at').eq('unit_id', unitId).eq('report_type', 'executive').maybeSingle();
        if (data) {
            const saved = data.content.report;
            // Support both old (string) and new (object) format
            if (typeof saved === 'object' && saved.executive_summary) {
                setReport(saved);
            }
            setLastSaved(new Date(data.created_at).toLocaleString());
        }
    }

    async function loadAllData() {
        setLoading(true);
        try {
            // 1. Unit Info & Categories
            const [unitRes, catRes] = await Promise.all([
                supabase.from('organization_units').select('name').eq('id', unitId).single(),
                supabase.from('analysis_categories').select('id, name').eq('unit_id', unitId)
            ]);
            if (unitRes.data) setUnitName(unitRes.data.name);
            const catMap = new Map(catRes.data?.map(c => [c.id, c.name]));
            setCategories(catRes.data || []);

            // 2. Qualitative Segments
            let qualQuery = supabase
                .from('raw_feedback_inputs')
                .select(`id, feedback_segments (id, segment_text, sentiment, category_id, is_suggestion), respondents!inner(survey_id)`)
                .eq('target_unit_id', unitId)
                .eq('requires_analysis', true);

            if (surveyId) qualQuery = qualQuery.eq('respondents.survey_id', surveyId);

            const { data: rawInputs } = await qualQuery;

            if (rawInputs) {
                const flat = rawInputs.flatMap(r => r.feedback_segments).map((s: any) => ({
                    ...s,
                    category_name: catMap.get(s.category_id) || "Uncategorized"
                }));
                setAllSegments(flat);
            }

            // 3. Quantitative Data
            let scoresQuery = supabase.from('raw_feedback_inputs').select('source_column, numerical_score, respondents!inner(survey_id)').eq('target_unit_id', unitId).eq('is_quantitative', true).not('numerical_score', 'is', null);
            if (surveyId) scoresQuery = scoresQuery.eq('respondents.survey_id', surveyId);
            const { data: scores } = await scoresQuery;

            let catScoresQuery = supabase.from('raw_feedback_inputs').select('source_column, raw_text, respondents!inner(survey_id)').eq('target_unit_id', unitId).eq('is_quantitative', false).eq('requires_analysis', false);
            if (surveyId) catScoresQuery = catScoresQuery.eq('respondents.survey_id', surveyId);
            const { data: catScores } = await catScoresQuery;

            const grouped: Record<string, QuestionGroup> = {};

            // Process Scores
            scores?.forEach(row => {
                const key = row.source_column;
                if (!grouped[key]) grouped[key] = { question: key, type: "SCORE", totalResponses: 0, chartData: [] };
                const val = row.numerical_score;
                const existing = grouped[key].chartData.find(d => d.name === val.toString());
                if (existing) existing.value++; else grouped[key].chartData.push({ name: val.toString(), value: 1 });
                grouped[key].totalResponses++;
            });

            // Calculate Scoring Metrics
            let totalSum = 0;
            let totalCount = 0;
            let likertGroupCount = 0;
            Object.values(grouped).forEach(g => {
                let gSum = 0;
                g.chartData.forEach(d => {
                    const val = parseFloat(d.name);
                    const weight = d.value;
                    gSum += val * weight;
                    // Color logic
                    const maxVal = Math.max(...g.chartData.map(d2 => parseFloat(d2.name)));
                    if (maxVal <= 1) {
                        // Boolean (0/1) — use neutral blue/indigo tones
                        d.color = val === 0 ? "#94a3b8" : "#6366f1";
                    } else {
                        // Likert (1-4 scale) — red/yellow/green
                        if (val <= 1) d.color = "#ef4444";
                        else if (val === 2) d.color = "#f59e0b";
                        else d.color = "#22c55e";
                    }
                });
                g.average = (gSum / g.totalResponses).toFixed(2);
                g.chartData.sort((a, b) => parseFloat(a.name) - parseFloat(b.name));
                // Only include 1-4 scale groups in global avg (skip 0-1 booleans)
                const maxVal = Math.max(...g.chartData.map(d => parseFloat(d.name)));
                if (maxVal > 1) {
                    totalSum += gSum;
                    totalCount += g.totalResponses;
                    likertGroupCount++;
                }
            });
            if (totalCount > 0) setGlobalAvgScore((totalSum / totalCount).toFixed(2));

            // Process Categorical (Non-analyzed)
            const catGrouped: Record<string, QuestionGroup> = {};
            catScores?.forEach(row => {
                const key = row.source_column;
                if (!catGrouped[key]) catGrouped[key] = { question: key, type: "CATEGORY", totalResponses: 0, chartData: [] };
                const val = row.raw_text || "Unknown";
                const existing = catGrouped[key].chartData.find(d => d.name === val);
                if (existing) existing.value++; else catGrouped[key].chartData.push({ name: val, value: 1 });
                catGrouped[key].totalResponses++;
            });
            Object.values(catGrouped).forEach(g => {
                g.chartData.sort((a, b) => b.value - a.value);
                if (g.chartData.length > 5) {
                    const others = g.chartData.slice(5).reduce((acc, curr) => acc + curr.value, 0);
                    g.chartData = g.chartData.slice(0, 5);
                    g.chartData.push({ name: "Others", value: others, color: "#94a3b8" });
                }
            });

            setQuantGroups([...Object.values(grouped), ...Object.values(catGrouped)]);

        } catch (error) {
            console.error(error);
            toast.error("Failed to load dashboard data");
        } finally {
            setLoading(false);
        }
    }

    // --- DERIVED METRICS ---
    const sentimentCounts = { Positive: 0, Negative: 0, Neutral: 0 };
    const catCounts: Record<string, any> = {};
    allSegments.forEach(s => {
        if (s.sentiment === "Positive") sentimentCounts.Positive++;
        else if (s.sentiment === "Negative") sentimentCounts.Negative++;
        else sentimentCounts.Neutral++;

        if (!catCounts[s.category_name]) catCounts[s.category_name] = { name: s.category_name, positive: 0, negative: 0, neutral: 0, total: 0 };
        catCounts[s.category_name].total++;
        if (s.sentiment === "Positive") catCounts[s.category_name].positive++;
        else if (s.sentiment === "Negative") catCounts[s.category_name].negative++;
        else catCounts[s.category_name].neutral++;
    });

    const totalSegments = allSegments.length;
    let sentimentScore = 0;
    if (totalSegments > 0) {
        sentimentScore = Math.round((sentimentCounts.Positive * 100 + sentimentCounts.Neutral * 50) / totalSegments);
    }

    let topNegativeCategory = { name: "N/A", count: 0 };
    Object.values(catCounts).forEach((c: any) => {
        if (c.negative > topNegativeCategory.count) topNegativeCategory = { name: c.name, count: c.negative };
    });

    const randomQuotes = allSegments
        .filter(s => s.segment_text.length > 20 && s.segment_text.length < 150)
        .sort(() => 0.5 - Math.random())
        .slice(0, 8);

    const pieData = [
        { name: 'Positive', value: sentimentCounts.Positive, color: '#22c55e' },
        { name: 'Neutral', value: sentimentCounts.Neutral, color: '#94a3b8' },
        { name: 'Negative', value: sentimentCounts.Negative, color: '#ef4444' },
    ];

    // --- HANDLERS ---
    const handleQualDrillDown = (data: any) => {
        if (data && data.activePayload && data.activePayload.length > 0) {
            setActiveQualDrillDown({ category: data.activeLabel, sentiment: data.activePayload[0].name });
        }
    };

    const handleQuantDrillDown = async (question: string, type: "SCORE" | "CATEGORY", filterValue: string) => {
        setActiveQuantDrillDown({ question, filterValue, type, entries: [], loading: true });
        let query = supabase.from('raw_feedback_inputs').select('id, raw_text, numerical_score, respondents!inner(survey_id)').eq('target_unit_id', unitId).eq('source_column', question);

        if (surveyId) query = query.eq('respondents.survey_id', surveyId);

        if (type === "SCORE") query = query.eq('numerical_score', parseFloat(filterValue));
        else query = query.eq('raw_text', filterValue);

        const { data } = await query.limit(50).order('id', { ascending: true });
        setActiveQuantDrillDown(prev => prev ? { ...prev, entries: data || [], loading: false } : null);
    };


    const generateReport = async () => {
        setGeneratingReport(true);
        try {
            const { data: unit } = await supabase.from('organization_units').select('*').eq('id', unitId).single();
            const topSegments = allSegments.slice(0, 100);
            const quantSummary = quantGroups.filter(g => g.type === "SCORE").map(g => `${g.question}: ${g.average}/4`).join(', ');
            const categoryBreakdown = Object.values(catCounts).map((c: any) => ({
                name: c.name, positive: c.positive, negative: c.negative, neutral: c.neutral, total: c.total
            }));

            const res = await fetch('/api/ai/generate-report', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    unitName: unit?.name || unitName,
                    unitDescription: unit?.description || '',
                    stats: `Total Comments: ${allSegments.length}. Sentiment: ${sentimentCounts.Positive} Positive, ${sentimentCounts.Negative} Negative, ${sentimentCounts.Neutral} Neutral. Quantitative: ${quantSummary}. Sentiment Score: ${sentimentScore}/100.`,
                    segments: topSegments,
                    categoryBreakdown
                })
            });

            const data = await res.json();
            if (data.report) {
                setReport(data.report as ExecutiveReportData);
                await supabase.from('unit_ai_reports').upsert(
                    { unit_id: unitId, report_type: 'executive', content: { report: data.report } },
                    { onConflict: 'unit_id,report_type' }
                );
                setLastSaved(new Date().toLocaleString());
                toast.success("Executive Report Generated");
            } else if (data.error) {
                toast.error("AI Error: " + data.error);
            }
        } catch (e) { toast.error("Generation failed"); } finally { setGeneratingReport(false); }
    };

    // --- RAW DATA LOADING ---
    const loadRawData = useCallback(async (tab: "comments" | "ratings", page: number, search: string) => {
        setRawDataLoading(true);
        const from = page * RAW_PAGE_SIZE;
        const to = from + RAW_PAGE_SIZE - 1;

        if (tab === "comments") {
            // Use already-loaded allSegments (client-side pagination)
            let filtered = allSegments;
            if (search) filtered = filtered.filter(s => s.segment_text?.toLowerCase().includes(search.toLowerCase()));
            setRawDataTotal(filtered.length);
            setRawDataEntries(filtered.slice(from, to + 1));
        } else {
            let query = supabase
                .from('raw_feedback_inputs')
                .select('id, source_column, raw_text, numerical_score, respondents!inner(survey_id)', { count: 'exact' })
                .eq('target_unit_id', unitId)
                .eq('is_quantitative', true)
                .not('numerical_score', 'is', null)
                .order('id', { ascending: true });

            if (surveyId) query = query.eq('respondents.survey_id', surveyId);
            if (search) query = query.ilike('source_column', `%${search}%`);

            const { data, count } = await query.range(from, to);
            setRawDataEntries(data || []);
            setRawDataTotal(count || 0);
        }
        setRawDataLoading(false);
    }, [unitId, surveyId, allSegments]);

    useEffect(() => {
        if (showRawData) loadRawData(rawDataTab, rawDataPage, rawDataSearch);
    }, [showRawData, rawDataTab, rawDataPage, rawDataSearch, loadRawData]);

    const exportToPdf = () => {
        toast.info("Preparing PDF... Please follow the browser print dialog.");
        setTimeout(() => {
            window.print();
        }, 500);
    };

    if (loading) return <div className="flex justify-center py-20 text-slate-400"><Loader2 className="w-8 h-8 animate-spin mr-2" /> Loading Analysis...</div>;

    return (
        <div ref={dashboardRef} className="space-y-8 animate-in fade-in pb-20">

            {/* --- UNIFIED METRICS ROW --- */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                {/* Sentiment Score */}
                <Card className="border-none shadow-lg bg-gradient-to-br from-indigo-600 to-violet-700 text-white relative group overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-10"><TrendingUp className="w-24 h-24" /></div>
                    <CardHeader className="pb-2"><CardDescription className="text-indigo-100 font-medium">Sentiment Index</CardDescription><CardTitle className="text-4xl font-bold">{sentimentScore}<span className="text-xl opacity-50">/100</span></CardTitle></CardHeader>
                    <CardContent><div className="text-xs text-indigo-100 flex items-center gap-1">{sentimentScore >= 70 ? <Sparkles className="w-3 h-3" /> : sentimentScore >= 40 ? <TrendingUp className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />} {sentimentScore >= 70 ? "Excellent" : sentimentScore >= 40 ? "Moderate" : "Needs Focus"}</div></CardContent>
                </Card>

                {/* Avg Quant Score */}
                <Card className="border-slate-200 shadow-md bg-white hover:shadow-lg transition-shadow">
                    <CardHeader className="pb-2"><CardDescription className="font-medium text-slate-500">Avg. Rating</CardDescription><CardTitle className="text-4xl font-bold text-slate-800">{globalAvgScore}<span className="text-xl text-slate-400 font-normal">/4.0</span></CardTitle></CardHeader>
                    <CardContent><div className="text-xs text-slate-500">Across {quantGroups.filter(g => g.type === "SCORE").length} metrics</div></CardContent>
                </Card>

                {/* Volume */}
                <Card className="border-slate-200 shadow-md bg-white hover:shadow-lg transition-shadow">
                    <CardHeader className="pb-2"><CardDescription className="font-medium text-slate-500">Analyzed Voices</CardDescription><CardTitle className="text-4xl font-bold text-slate-800">{totalSegments.toLocaleString()}</CardTitle></CardHeader>
                    <CardContent><div className="text-xs text-green-600 flex items-center gap-1"><MessageSquare className="w-3 h-3" /> {quantGroups.reduce((a, b) => a + b.totalResponses, 0).toLocaleString()} quant data points</div></CardContent>
                </Card>

                {/* Hot Spot */}
                <Card className="border-red-100 shadow-md bg-red-50/50 hover:bg-red-50 transition-colors">
                    <CardHeader className="pb-2"><CardDescription className="font-medium text-red-600 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Top Issue</CardDescription><CardTitle className="text-2xl font-bold text-red-900 leading-tight md:text-xl line-clamp-2">{topNegativeCategory.name}</CardTitle></CardHeader>
                    <CardContent><div className="text-xs text-red-700"><strong>{topNegativeCategory.count}</strong> negative comments {totalSegments > 0 && <span className="text-red-500">({Math.round(topNegativeCategory.count / sentimentCounts.Negative * 100)}% of all negatives)</span>}</div></CardContent>
                </Card>
            </div>

            {/* --- EXECUTIVE REPORT --- */}
            <Card className="border-indigo-200 bg-white shadow-xl overflow-hidden">
                <div className="h-1 bg-gradient-to-r from-indigo-500 to-purple-500" />
                <CardHeader className="flex flex-row items-center justify-between bg-slate-50/50 border-b border-slate-100 py-4">
                    <div className="flex items-center gap-2"><Sparkles className="w-5 h-5 text-indigo-600" /><h3 className="font-semibold text-slate-800">Executive Analysis</h3>{lastSaved && <span className="text-[10px] text-slate-400 ml-2">Last: {lastSaved}</span>}</div>
                    <div className="flex gap-2">
                        <Button onClick={generateReport} disabled={generatingReport} size="sm" className="bg-indigo-600">{generatingReport ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <RefreshCcw className="w-3 h-3 mr-1" />} {report ? "Regenerate" : "Generate"}</Button>
                        {report && <Button variant="outline" size="sm" onClick={exportToPdf} disabled={exportingPdf}><Download className="w-3 h-3 mr-1" /> PDF</Button>}
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    {report ? (
                        <div className="divide-y divide-slate-100">
                            {/* Header Banner */}
                            <div className="bg-gradient-to-r from-indigo-50 to-violet-50 px-8 py-6">
                                <div className="flex items-center justify-between mb-3">
                                    <h2 className="text-xl font-bold text-slate-900 tracking-tight">Executive Analysis Report</h2>
                                    <Badge className={`text-xs px-3 py-1 ${report.overall_verdict === 'Excellent' ? 'bg-emerald-100 text-emerald-800' : report.overall_verdict === 'Good' ? 'bg-blue-100 text-blue-800' : report.overall_verdict === 'Needs Improvement' ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'}`}>
                                        {report.overall_verdict === 'Excellent' ? '🟢' : report.overall_verdict === 'Good' ? '🔵' : report.overall_verdict === 'Needs Improvement' ? '🟡' : '🔴'} {report.overall_verdict}
                                    </Badge>
                                </div>
                                <p className="text-sm text-slate-500">{unitName} · Generated {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
                            </div>

                            {/* Executive Summary */}
                            <div className="px-8 py-6">
                                <p className="text-[15px] text-slate-700 leading-relaxed italic border-l-4 border-indigo-300 pl-4">{report.executive_summary}</p>
                            </div>

                            {/* Strengths */}
                            <div className="px-8 py-6">
                                <div className="flex items-center gap-2 mb-4"><CheckCircle2 className="w-5 h-5 text-emerald-600" /><h3 className="text-base font-bold text-slate-800">Strengths</h3></div>
                                <div className="space-y-4">
                                    {report.strengths?.map((s, i) => (
                                        <div key={i} className="bg-emerald-50/50 border border-emerald-100 rounded-lg p-4">
                                            <h4 className="font-semibold text-emerald-900 text-sm mb-1">▸ {s.title}</h4>
                                            <p className="text-sm text-slate-700 leading-relaxed">{s.detail}</p>
                                            {s.evidence && <div className="mt-2 flex items-start gap-2 text-xs text-slate-500 italic"><Quote className="w-3 h-3 mt-0.5 text-emerald-400 shrink-0" /><span>&ldquo;{s.evidence}&rdquo;</span></div>}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Concerns */}
                            <div className="px-8 py-6">
                                <div className="flex items-center gap-2 mb-4"><AlertCircle className="w-5 h-5 text-amber-600" /><h3 className="text-base font-bold text-slate-800">Areas of Concern</h3></div>
                                <div className="space-y-4">
                                    {report.concerns?.map((c, i) => (
                                        <div key={i} className="bg-amber-50/30 border border-amber-100 rounded-lg p-4">
                                            <div className="flex items-center justify-between mb-1">
                                                <h4 className="font-semibold text-amber-900 text-sm">▸ {c.title}</h4>
                                                <Badge variant="outline" className={`text-[10px] ${c.severity === 'High' ? 'border-red-300 text-red-700 bg-red-50' : c.severity === 'Medium' ? 'border-amber-300 text-amber-700 bg-amber-50' : 'border-slate-300 text-slate-600 bg-slate-50'}`}>{c.severity === 'High' ? '🔴' : c.severity === 'Medium' ? '🟡' : '🟢'} {c.severity}</Badge>
                                            </div>
                                            <p className="text-sm text-slate-700 leading-relaxed">{c.detail}</p>
                                            {c.evidence && <div className="mt-2 flex items-start gap-2 text-xs text-slate-500 italic"><Quote className="w-3 h-3 mt-0.5 text-amber-400 shrink-0" /><span>&ldquo;{c.evidence}&rdquo;</span></div>}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Recommendations */}
                            <div className="px-8 py-6">
                                <div className="flex items-center gap-2 mb-4"><Target className="w-5 h-5 text-blue-600" /><h3 className="text-base font-bold text-slate-800">Recommendations</h3></div>
                                <div className="space-y-3">
                                    {report.recommendations?.map((r, i) => (
                                        <div key={i} className="bg-white border border-blue-100 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow">
                                            <div className="flex items-center justify-between mb-2">
                                                <h4 className="font-semibold text-blue-900 text-sm">{i + 1}. {r.title}</h4>
                                                <Badge className={`text-[10px] px-2 ${r.priority === 'Immediate' ? 'bg-red-100 text-red-700' : r.priority === 'Short-term' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>
                                                    {r.priority === 'Immediate' ? '⚡' : r.priority === 'Short-term' ? '📅' : '🔮'} {r.priority}
                                                </Badge>
                                            </div>
                                            <div className="space-y-1 text-sm">
                                                <p className="text-slate-700"><span className="font-medium text-slate-500">Action:</span> {r.action}</p>
                                                <p className="text-slate-600"><span className="font-medium text-slate-500">Impact:</span> {r.impact}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Closing */}
                            <div className="px-8 py-6 bg-slate-50/50">
                                <p className="text-sm text-slate-600 leading-relaxed text-center italic" style={{ fontFamily: 'Georgia, serif' }}>{report.closing_statement}</p>
                            </div>
                        </div>
                    ) : (
                        <div className="p-8 text-center text-slate-400 italic">Generate a report to see strategic insights.</div>
                    )}
                </CardContent>
            </Card>

            {/* --- CAROUSEL --- */}
            {randomQuotes.length > 0 && (
                <div className="bg-slate-900 text-slate-200 p-3 rounded-lg overflow-hidden relative shadow-inner">
                    <div className="flex items-center gap-4 animate-marquee whitespace-nowrap">
                        <span className="font-bold text-indigo-400 text-xs flex items-center gap-2 px-4 border-r border-slate-700">LIVE FEED</span>
                        {randomQuotes.map((q, i) => (
                            <span key={i} className="mx-8 text-sm italic opacity-80 flex items-center gap-2">
                                <span className={`w-2 h-2 rounded-full ${q.sentiment === 'Positive' ? 'bg-green-400' : q.sentiment === 'Negative' ? 'bg-red-400' : 'bg-slate-400'}`} /> &ldquo;{q.segment_text}&rdquo;
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {/* --- SENTIMENT BY CATEGORY (FULL WIDTH) --- */}
            <Card className="shadow-sm border-slate-200">
                <CardHeader className="pb-2">
                    <div className="flex items-center gap-2"><MessageSquare className="w-5 h-5 text-indigo-600" /><CardTitle className="text-base">Sentiment by Category</CardTitle></div>
                    <CardDescription>Click bars to view comments. {Object.keys(catCounts).length} categories detected.</CardDescription>
                </CardHeader>
                <CardContent style={{ height: `${Math.max(300, Object.keys(catCounts).length * 40)}px` }}>
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={Object.values(catCounts)} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }} onClick={handleQualDrillDown}>
                            <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                            <XAxis type="number" />
                            <YAxis dataKey="name" type="category" width={140} tick={{ fontSize: 11 }} />
                            <Tooltip cursor={{ fill: 'rgba(99, 102, 241, 0.1)' }} />
                            <Legend />
                            <Bar dataKey="positive" stackId="a" fill="#4ade80" name="Positive" radius={[4, 0, 0, 4]} cursor="pointer" />
                            <Bar dataKey="neutral" stackId="a" fill="#94a3b8" name="Neutral" cursor="pointer" />
                            <Bar dataKey="negative" stackId="a" fill="#f87171" name="Negative" radius={[0, 4, 4, 0]} cursor="pointer" />
                        </BarChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card>

            {/* QUAL DRILL DOWN PREVIEW */}
            {activeQualDrillDown && (
                <Card className="border-indigo-200 bg-indigo-50/30 animate-in fade-in slide-in-from-top-2">
                    <CardHeader className="py-3 flex flex-row items-center justify-between">
                        <div className="text-sm font-medium text-indigo-900">Drill Down: {activeQualDrillDown.category} ({activeQualDrillDown.sentiment})</div>
                        <Button variant="ghost" size="sm" onClick={() => setActiveQualDrillDown(null)} className="h-6 w-6 p-0"><X className="w-4 h-4" /></Button>
                    </CardHeader>
                    <CardContent className="max-h-[300px] overflow-y-auto space-y-2">
                        {allSegments.filter(s => s.category_name === activeQualDrillDown.category && (activeQualDrillDown.sentiment === 'Positive' ? s.sentiment === 'Positive' : activeQualDrillDown.sentiment === 'Negative' ? s.sentiment === 'Negative' : s.sentiment === 'Neutral')).map(s => (
                            <div key={s.id} className="bg-white p-2 text-xs rounded border border-indigo-100 shadow-sm">&ldquo;{s.segment_text}&rdquo;</div>
                        ))}
                    </CardContent>
                </Card>
            )}

            {/* --- MAIN CONTENT GRID --- */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">

                {/* LEFT: QUALITATIVE */}
                <div className="space-y-6">
                    <div className="flex items-center gap-2 pb-2 border-b border-slate-200">
                        <MessageSquare className="w-5 h-5 text-indigo-600" />
                        <h2 className="text-lg font-semibold text-slate-800">Overall Sentiment</h2>
                    </div>
                    <Card className="shadow-sm border-slate-200">
                        <CardContent className="h-[250px] pt-6">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={70} paddingAngle={5} dataKey="value">
                                        {pieData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                                    </Pie>
                                    <Tooltip />
                                    <Legend verticalAlign="bottom" height={36} />
                                </PieChart>
                            </ResponsiveContainer>
                        </CardContent>
                    </Card>
                </div>

                {/* RIGHT: QUANTITATIVE METRICS */}
                <div className="space-y-6">
                    <div className="flex items-center gap-2 pb-2 border-b border-slate-200">
                        <BarChart2 className="w-5 h-5 text-blue-600" />
                        <h2 className="text-lg font-semibold text-slate-800">Quantitative Metrics</h2>
                    </div>

                    <div className="space-y-4">
                        {quantGroups.map((group, idx) => (
                            <Card key={idx} className="hover:shadow-md transition-shadow">
                                <CardHeader className="py-3">
                                    <div className="flex justify-between items-start">
                                        <CardTitle className="text-sm font-medium text-slate-700 line-clamp-2 w-3/4" title={group.question}>{group.question}</CardTitle>
                                        {group.type === "SCORE" ? <Badge variant="secondary">{group.average}</Badge> : <Badge variant="outline">Cat</Badge>}
                                    </div>
                                </CardHeader>
                                <CardContent className="py-2 h-[180px]">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={group.chartData} layout={group.type === "CATEGORY" ? "vertical" : "horizontal"} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} horizontal={group.type !== "CATEGORY"} />
                                            {group.type === "CATEGORY" ? <YAxis dataKey="name" type="category" width={80} tick={{ fontSize: 10 }} /> : <XAxis dataKey="name" tick={{ fontSize: 10 }} />}
                                            {group.type === "CATEGORY" ? <XAxis type="number" hide /> : <YAxis />}
                                            <Tooltip cursor={{ fill: 'rgba(0,0,0,0.05)' }} contentStyle={{ fontSize: '12px' }} />
                                            <Bar dataKey="value" barSize={20} radius={[4, 4, 4, 4]} onClick={(d: any) => handleQuantDrillDown(group.question, group.type, d.name)}>
                                                {group.chartData.map((e, i) => <Cell key={i} fill={e.color || (group.type === "CATEGORY" ? "#8b5cf6" : "#3b82f6")} className="cursor-pointer hover:opacity-80" />)}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </CardContent>
                            </Card>
                        ))}
                        {quantGroups.length === 0 && <div className="text-center py-10 text-slate-400 border border-dashed rounded-lg">No quantitative columns detected.</div>}
                    </div>
                </div>

            </div>

            {/* --- RAW DATA EXPLORER --- */}
            <Card className="border-slate-200 shadow-sm">
                <CardHeader className="py-3 cursor-pointer hover:bg-slate-50 transition-colors" onClick={() => setShowRawData(!showRawData)}>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Table2 className="w-5 h-5 text-slate-600" />
                            <CardTitle className="text-base">Raw Data Explorer</CardTitle>
                            <Badge variant="outline" className="text-[10px]">Verify</Badge>
                        </div>
                        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${showRawData ? 'rotate-180' : ''}`} />
                    </div>
                    <CardDescription>Click to inspect actual comments and ratings</CardDescription>
                </CardHeader>
                {showRawData && (
                    <CardContent className="pt-0">
                        {/* Tab Switcher */}
                        <div className="flex items-center gap-4 mb-4 border-b border-slate-200">
                            <button onClick={() => { setRawDataTab("comments"); setRawDataPage(0); }} className={`pb-2 text-sm font-medium border-b-2 transition-colors ${rawDataTab === "comments" ? "border-indigo-500 text-indigo-700" : "border-transparent text-slate-400 hover:text-slate-600"}`}>
                                <MessageSquare className="w-3 h-3 inline mr-1" /> Comments
                            </button>
                            <button onClick={() => { setRawDataTab("ratings"); setRawDataPage(0); }} className={`pb-2 text-sm font-medium border-b-2 transition-colors ${rawDataTab === "ratings" ? "border-indigo-500 text-indigo-700" : "border-transparent text-slate-400 hover:text-slate-600"}`}>
                                <BarChart2 className="w-3 h-3 inline mr-1" /> Ratings
                            </button>
                            <div className="flex-1" />
                            <div className="relative mb-1">
                                <Search className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
                                <Input placeholder="Search..." className="h-7 pl-7 text-xs w-40" value={rawDataSearch} onChange={e => { setRawDataSearch(e.target.value); setRawDataPage(0); }} />
                            </div>
                        </div>

                        {/* Table */}
                        {rawDataLoading ? (
                            <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
                        ) : (
                            <>
                                <div className="overflow-x-auto rounded-lg border border-slate-200">
                                    <table className="w-full text-xs">
                                        <thead className="bg-slate-50">
                                            <tr>
                                                {rawDataTab === "comments" ? (
                                                    <>
                                                        <th className="text-left p-2 font-medium text-slate-600 w-[50%]">Comment</th>
                                                        <th className="text-left p-2 font-medium text-slate-600">Category</th>
                                                        <th className="text-left p-2 font-medium text-slate-600">Sentiment</th>
                                                    </>
                                                ) : (
                                                    <>
                                                        <th className="text-left p-2 font-medium text-slate-600 w-[40%]">Question</th>
                                                        <th className="text-left p-2 font-medium text-slate-600">Score</th>
                                                        <th className="text-left p-2 font-medium text-slate-600">Raw Text</th>
                                                    </>
                                                )}
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {rawDataEntries.map((entry, i) => (
                                                <tr key={entry.id || i} className="hover:bg-slate-50/50">
                                                    {rawDataTab === "comments" ? (
                                                        <>
                                                            <td className="p-2 text-slate-700">{entry.segment_text}</td>
                                                            <td className="p-2"><Badge variant="outline" className="text-[10px]">{entry.category_name}</Badge></td>
                                                            <td className="p-2"><span className={`inline-flex items-center gap-1 text-[10px] font-medium ${entry.sentiment === 'Positive' ? 'text-green-700' : entry.sentiment === 'Negative' ? 'text-red-700' : 'text-slate-500'}`}><span className={`w-1.5 h-1.5 rounded-full ${entry.sentiment === 'Positive' ? 'bg-green-500' : entry.sentiment === 'Negative' ? 'bg-red-500' : 'bg-slate-400'}`} />{entry.sentiment}</span></td>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <td className="p-2 text-slate-700 font-medium">{entry.source_column}</td>
                                                            <td className="p-2"><Badge className={`text-[10px] ${entry.numerical_score <= 1 ? 'bg-red-100 text-red-700' : entry.numerical_score === 2 ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>{entry.numerical_score}</Badge></td>
                                                            <td className="p-2 text-slate-500 italic">{entry.raw_text || '—'}</td>
                                                        </>
                                                    )}
                                                </tr>
                                            ))}
                                            {rawDataEntries.length === 0 && (
                                                <tr><td colSpan={3} className="p-6 text-center text-slate-400">No data found.</td></tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>

                                {/* Pagination */}
                                <div className="flex items-center justify-between mt-3 text-xs text-slate-500">
                                    <span>Showing {rawDataPage * RAW_PAGE_SIZE + 1}–{Math.min((rawDataPage + 1) * RAW_PAGE_SIZE, rawDataTotal)} of {rawDataTotal}</span>
                                    <div className="flex gap-1">
                                        <Button variant="outline" size="sm" className="h-6 text-xs" disabled={rawDataPage === 0} onClick={() => setRawDataPage(p => p - 1)}>Previous</Button>
                                        <Button variant="outline" size="sm" className="h-6 text-xs" disabled={(rawDataPage + 1) * RAW_PAGE_SIZE >= rawDataTotal} onClick={() => setRawDataPage(p => p + 1)}>Next</Button>
                                    </div>
                                </div>
                            </>
                        )}
                    </CardContent>
                )}
            </Card>

            {/* --- QUANT DRILL DOWN MODAL --- */}
            {activeQuantDrillDown && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col m-4">
                        <div className="flex items-center justify-between p-4 border-b">
                            <h3 className="font-semibold text-slate-800">Drill Down: {activeQuantDrillDown.filterValue}</h3>
                            <Button variant="ghost" size="sm" onClick={() => setActiveQuantDrillDown(null)}><X className="w-4 h-4" /></Button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 space-y-2">
                            {activeQuantDrillDown.loading ? <Loader2 className="w-6 h-6 animate-spin mx-auto text-blue-500" /> :
                                activeQuantDrillDown.entries.map((e, i) => (
                                    <div key={e.id} className="p-3 bg-slate-50 rounded border border-slate-100 text-sm">{e.raw_text || <em>(No text response)</em>}</div>
                                ))}
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
}
