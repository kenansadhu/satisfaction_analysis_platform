"use client";

import { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, TrendingUp, AlertTriangle, Lightbulb, Filter, Sparkles, RefreshCcw, Save, Download } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from "recharts";
import { Badge } from "@/components/ui/badge";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";

type Suggestion = { id: number; text: string; category: string; sentiment: string };

export default function QualitativeDashboard({ unitId }: { unitId: string }) {
    const [loading, setLoading] = useState(true);
    const dashboardRef = useRef<HTMLDivElement>(null);
    const [exportingPdf, setExportingPdf] = useState(false);

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

    // --- DERIVED METRICS ---
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

    const totalSegments = allSegments.length;

    // 1. Sentiment Score (0-100)
    // Formula: (Pos * 100 + Neu * 50 + Neg * 0) / Total
    let sentimentScore = 0;
    if (totalSegments > 0) {
        const rawScore = (sentimentCounts.Positive * 100 + sentimentCounts.Neutral * 50);
        sentimentScore = Math.round(rawScore / totalSegments);
    }

    // 2. Top "Hot Spot" (Category with most negatives)
    let topNegativeCategory = { name: "N/A", count: 0 };
    Object.values(catCounts).forEach((c: any) => {
        if (c.negative > topNegativeCategory.count) {
            topNegativeCategory = { name: c.name, count: c.negative };
        }
    });

    // 3. Drill-down State
    const [activeDrillDown, setActiveDrillDown] = useState<{ category: string, sentiment: string } | null>(null);

    // 4. Quote Carousel Data
    const randomQuotes = allSegments
        .filter(s => s.segment_text.length > 20 && s.segment_text.length < 150)
        .sort(() => 0.5 - Math.random())
        .slice(0, 5);

    // --- CHART HANDLER ---
    const handleBarClick = (data: any) => {
        if (data && data.activePayload && data.activePayload.length > 0) {
            const category = data.activeLabel;
            const sentiment = data.activePayload[0].name; // 'Positive', 'Negative', 'Neutral'
            setActiveDrillDown({ category, sentiment });
            // Scroll to drill-down section
            setTimeout(() => {
                document.getElementById('drill-down-panel')?.scrollIntoView({ behavior: 'smooth' });
            }, 100);
        }
    };

    // --- AI GENERATOR ---
    const generateReport = async () => {
        setGeneratingReport(true);
        try {
            const response = await fetch('/api/ai/generate-report', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
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
            toast.error("Failed to generate report");
        } finally {
            setGeneratingReport(false);
        }
    };

    // --- PDF EXPORT ---
    const exportToPdf = async () => {
        if (!dashboardRef.current) return;
        setExportingPdf(true);
        toast.info("Generating PDF... please wait.");
        try {
            const html2canvas = (await import('html2canvas')).default;
            const jsPDF = (await import('jspdf')).default;

            const canvas = await html2canvas(dashboardRef.current, {
                scale: 2,
                useCORS: true,
                backgroundColor: '#ffffff',
                logging: false,
            });

            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF('p', 'mm', 'a4');
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = pdf.internal.pageSize.getHeight();
            const imgWidth = pdfWidth - 20; // 10mm margin each side
            const imgHeight = (canvas.height * imgWidth) / canvas.width;

            let heightLeft = imgHeight;
            let position = 10; // top margin

            pdf.addImage(imgData, 'PNG', 10, position, imgWidth, imgHeight);
            heightLeft -= (pdfHeight - 20);

            while (heightLeft > 0) {
                position = position - (pdfHeight - 20);
                pdf.addPage();
                pdf.addImage(imgData, 'PNG', 10, position, imgWidth, imgHeight);
                heightLeft -= (pdfHeight - 20);
            }

            pdf.save(`${unitName || 'unit'}_analysis_report.pdf`);
            toast.success("PDF downloaded successfully!");
        } catch (e: any) {
            toast.error("Failed to export PDF: " + e.message);
        } finally {
            setExportingPdf(false);
        }
    };

    if (loading) return <div className="flex justify-center py-20 text-slate-400"><Loader2 className="w-8 h-8 animate-spin mr-2" /> Analysis in progress...</div>;

    return (
        <div ref={dashboardRef} className="space-y-8 animate-in fade-in pb-20">

            {/* --- TOP METRICS ROW --- */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Sentiment Score */}
                <Card className="border-none shadow-lg bg-gradient-to-br from-indigo-600 to-violet-700 text-white overflow-hidden relative group">
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity"><TrendingUp className="w-24 h-24" /></div>
                    <CardHeader className="pb-2">
                        <CardDescription className="text-indigo-100 font-medium">Sentiment Index</CardDescription>
                        <CardTitle className="text-5xl font-bold tracking-tight">{sentimentScore}<span className="text-2xl opacity-50">/100</span></CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center gap-2 text-sm text-indigo-100">
                            {sentimentScore >= 70 ? <Sparkles className="w-4 h-4 text-green-300" /> : sentimentScore >= 40 ? <TrendingUp className="w-4 h-4 text-amber-300" /> : <AlertTriangle className="w-4 h-4 text-red-300" />}
                            {sentimentScore >= 70 ? "Excellent Student Satisfaction" : sentimentScore >= 40 ? "Moderate Satisfaction" : "Urgent Attention Needed"}
                        </div>
                    </CardContent>
                </Card>

                {/* Response Volume */}
                <Card className="border-slate-200 shadow-md hover:shadow-lg transition-shadow bg-white/50 backdrop-blur-sm">
                    <CardHeader className="pb-2">
                        <CardDescription className="font-medium text-slate-500">Analyzed Opinions</CardDescription>
                        <CardTitle className="text-4xl font-bold text-slate-800">{totalSegments.toLocaleString()}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-sm text-slate-500 flex flex-col gap-1">
                            <span className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-green-500" /> {sentimentCounts.Positive} Positive</span>
                            <span className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-red-500" /> {sentimentCounts.Negative} Negative</span>
                        </div>
                    </CardContent>
                </Card>

                {/* Hot Spot */}
                <Card className="border-red-100 shadow-md bg-red-50/50 hover:bg-red-50 transition-colors">
                    <CardHeader className="pb-2">
                        <CardDescription className="font-medium text-red-600 flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> Top Issue Area</CardDescription>
                        <CardTitle className="text-2xl font-bold text-red-900 leading-tight">{topNegativeCategory.name}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-sm text-red-700">
                            <strong>{topNegativeCategory.count}</strong> negative comments flagged in this category.
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* --- QUOTE CAROUSEL --- */}
            {randomQuotes.length > 0 && (
                <div className="bg-slate-900 text-slate-200 p-4 rounded-lg overflow-hidden relative shadow-inner">
                    <div className="flex items-center gap-4 animate-marquee whitespace-nowrap">
                        <span className="font-bold text-indigo-400 flex items-center gap-2 px-4 border-r border-slate-700"><Loader2 className="w-4 h-4 animate-spin" /> LIVE FEED</span>
                        {randomQuotes.map((q, i) => (
                            <span key={i} className="mx-8 italic opacity-80 hover:opacity-100 transition-opacity flex items-center gap-2">
                                <span className={`w-2 h-2 rounded-full ${q.sentiment === 'Positive' ? 'bg-green-400' : q.sentiment === 'Negative' ? 'bg-red-400' : 'bg-slate-400'}`} />
                                "{q.segment_text}"
                            </span>
                        ))}
                        {randomQuotes.map((q, i) => (
                            <span key={`dup-${i}`} className="mx-8 italic opacity-80 hover:opacity-100 transition-opacity flex items-center gap-2">
                                <span className={`w-2 h-2 rounded-full ${q.sentiment === 'Positive' ? 'bg-green-400' : q.sentiment === 'Negative' ? 'bg-red-400' : 'bg-slate-400'}`} />
                                "{q.segment_text}"
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {/* --- MAIN CHARTS GRID --- */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Interactive Bar Chart */}
                <Card className="lg:col-span-2 shadow-md border-slate-200">
                    <CardHeader>
                        <CardTitle>Sentiment by Category</CardTitle>
                        <CardDescription>Click any bar to drill down into specific comments.</CardDescription>
                    </CardHeader>
                    <CardContent className="h-[400px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={Object.values(catCounts)} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }} onClick={handleBarClick}>
                                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                                <XAxis type="number" />
                                <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 12 }} />
                                <Tooltip
                                    cursor={{ fill: 'rgba(99, 102, 241, 0.1)' }}
                                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                                />
                                <Legend />
                                <Bar dataKey="positive" name="Positive" stackId="a" fill="#4ade80" radius={[0, 4, 4, 0]} cursor="pointer" />
                                <Bar dataKey="neutral" name="Neutral" stackId="a" fill="#94a3b8" cursor="pointer" />
                                <Bar dataKey="negative" name="Negative" stackId="a" fill="#f87171" radius={[4, 0, 0, 4]} cursor="pointer" />
                            </BarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>

                {/* Sentiment Donut */}
                <Card className="shadow-md border-slate-200">
                    <CardHeader>
                        <CardTitle>Overall Sentiment</CardTitle>
                        <CardDescription>Distribution across all categories</CardDescription>
                    </CardHeader>
                    <CardContent className="h-[400px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={pieData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={100}
                                    paddingAngle={5}
                                    dataKey="value"
                                >
                                    {pieData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                                </Pie>
                                <Tooltip />
                                <Legend verticalAlign="bottom" height={36} />
                            </PieChart>
                        </ResponsiveContainer>
                        <div className="text-center mt-[-20px] text-sm text-slate-500">
                            Total: {totalSegments}
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* --- DRILL DOWN PANEL (Conditionally Rendered) --- */}
            {activeDrillDown && (
                <div id="drill-down-panel" className="scroll-mt-20">
                    <Card className="border-indigo-200 bg-indigo-50/30 shadow-lg ring-1 ring-indigo-200">
                        <CardHeader className="flex flex-row items-center justify-between">
                            <div>
                                <CardTitle className="text-indigo-900 flex items-center gap-2">
                                    <Filter className="w-5 h-5" /> Drill Down: {activeDrillDown.category}
                                </CardTitle>
                                <CardDescription>
                                    Showing <span className="font-semibold text-indigo-700">{activeDrillDown.sentiment}</span> comments
                                </CardDescription>
                            </div>
                            <Button variant="ghost" size="sm" onClick={() => setActiveDrillDown(null)}>Close</Button>
                        </CardHeader>
                        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[400px] overflow-y-auto">
                            {allSegments
                                .filter(s => s.category_name === activeDrillDown.category &&
                                    (activeDrillDown.sentiment === 'Positive' ? s.sentiment === 'Positive' :
                                        activeDrillDown.sentiment === 'Negative' ? s.sentiment === 'Negative' :
                                            s.sentiment === 'Neutral')) // Simple mapping, could be more robust
                                .map(s => (
                                    <div key={s.id} className="bg-white p-3 rounded border border-indigo-100 shadow-sm text-sm text-slate-700">
                                        "{s.segment_text}"
                                    </div>
                                ))
                            }
                            {allSegments.filter(s => s.category_name === activeDrillDown.category && s.sentiment === activeDrillDown.sentiment).length === 0 && (
                                <div className="col-span-2 text-center py-8 text-slate-400 italic">No comments found for this selection.</div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* --- AI EXECUTIVE REPORT --- */}
            <Card className="border-indigo-200 bg-white shadow-xl overflow-hidden">
                <div className="h-2 bg-gradient-to-r from-indigo-500 to-purple-500" />
                <CardHeader className="flex flex-row items-center justify-between bg-slate-50 border-b border-slate-100 pb-4">
                    <div>
                        <CardTitle className="flex items-center gap-2 text-slate-800 text-xl"><Sparkles className="w-5 h-5 text-indigo-600" /> Executive AI Report</CardTitle>
                        <CardDescription>Strategic Analysis & Recommendations</CardDescription>
                        {lastSaved && <p className="text-[10px] text-slate-400 mt-1 flex items-center gap-1"><Save className="w-3 h-3" /> Last update: {lastSaved}</p>}
                    </div>
                    <div className="flex gap-2">
                        <Button onClick={generateReport} disabled={generatingReport} className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-md">
                            {generatingReport ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCcw className="w-4 h-4 mr-2" />}
                            {report ? "Re-Generate" : "Generate Report"}
                        </Button>
                        {report && (
                            <Button variant="outline" onClick={exportToPdf} disabled={exportingPdf} className="border-indigo-200 text-indigo-700 hover:bg-indigo-50">
                                {exportingPdf ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Download className="w-4 h-4 mr-2" />}
                                PDF
                            </Button>
                        )}
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    {report ? (
                        <div className="bg-white p-8 md:p-12 text-slate-700 leading-relaxed text-base max-w-4xl mx-auto prose prose-indigo">
                            <ReactMarkdown
                                components={{
                                    h1: ({ node, ...props }) => <h1 className="text-3xl font-bold text-slate-900 mt-8 mb-6 pb-2 border-b-2 border-indigo-100" {...props} />,
                                    h2: ({ node, ...props }) => <h2 className="text-xl font-semibold text-indigo-900 mt-8 mb-4 flex items-center gap-2" {...props} />,
                                    ul: ({ node, ...props }) => <ul className="list-disc pl-5 space-y-2 mb-6 text-slate-600" {...props} />,
                                    li: ({ node, ...props }) => <li className="pl-1" {...props} />,
                                    p: ({ node, ...props }) => <p className="mb-6 opacity-90" {...props} />,
                                    strong: ({ node, ...props }) => <strong className="font-bold text-slate-900 bg-indigo-50 px-1 rounded" {...props} />,
                                }}
                            >
                                {report}
                            </ReactMarkdown>
                        </div>
                    ) : (
                        <div className="text-center py-20 bg-slate-50/50">
                            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-indigo-50 mb-4">
                                <Sparkles className="w-8 h-8 text-indigo-300" />
                            </div>
                            <h3 className="text-lg font-medium text-slate-800">No Analysis Generated Yet</h3>
                            <p className="text-slate-500 mt-2 mb-6 max-w-sm mx-auto">Click "Generate Report" to have AI analyze all student feedback and create a strategic executive summary.</p>
                            <Button onClick={generateReport} disabled={generatingReport} variant="outline" className="border-indigo-200 text-indigo-600">
                                Generate First Report
                            </Button>
                        </div>
                    )}
                </CardContent>
            </Card>

        </div>
    );
}