"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useTheme } from "next-themes";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Loader2, TrendingUp, AlertTriangle, Lightbulb, Filter, Sparkles, RefreshCcw, Save, Download, BarChart2, MessageSquare, ChevronRight, ChevronDown, X, Quote, Target, CheckCircle2, AlertCircle, Search, Table2, Check } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from "recharts";
import { toast } from "sonner";
import UnitInsightChat from "./UnitInsightChat";

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
    const { theme, systemTheme } = useTheme();
    const isDark = theme === "dark" || (theme === "system" && systemTheme === "dark");

    const [baseRawInputs, setBaseRawInputs] = useState<any[]>([]);
    const [baseScores, setBaseScores] = useState<any[]>([]);
    const [baseCatScores, setBaseCatScores] = useState<any[]>([]);
    const [allUnits, setAllUnits] = useState<any[]>([]);
    const [isFiltering, setIsFiltering] = useState(false);

    // Qualitative
    const [allSegments, setAllSegments] = useState<any[]>([]);
    const [crossUnitSegments, setCrossUnitSegments] = useState<any[]>([]);
    const [categories, setCategories] = useState<any[]>([]);
    const [unitName, setUnitName] = useState("");

    // Aggregated Metrics from RPC
    const [dashboardMetrics, setDashboardMetrics] = useState<{
        total_segments: number;
        sentiment_counts: { Positive: number; Negative: number; Neutral: number };
        category_counts: any[];
    } | null>(null);

    // Quantitative
    const [quantGroups, setQuantGroups] = useState<QuestionGroup[]>([]);
    const [globalAvgScore, setGlobalAvgScore] = useState<string>("N/A");

    // AI Report
    const [report, setReport] = useState<ExecutiveReportData | null>(null);
    const [generatingReport, setGeneratingReport] = useState(false);
    const [lastSaved, setLastSaved] = useState<string | null>(null);

    // Filter Options & Active State
    const [filterOptions, setFilterOptions] = useState<{ locations: string[], faculties: string[], programs: string[] }>({ locations: [], faculties: [], programs: [] });
    const [activeFilters, setActiveFilters] = useState<{ sentiment: string[], location: string[], faculty: string[], program: string[] }>({
        sentiment: [], location: [], faculty: [], program: []
    });
    const [isFilterOpen, setIsFilterOpen] = useState(false);

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
        fetchRawData();
        loadSavedReport();
    }, [unitId, surveyId]);

    useEffect(() => {
        if (!baseRawInputs.length && !baseScores.length && !baseCatScores.length) return;
        setIsFiltering(true);
        const timer = setTimeout(() => {
            applyFiltersAndMetrics();
            setIsFiltering(false);
        }, 30);
        return () => clearTimeout(timer);
    }, [activeFilters, baseRawInputs, baseScores, baseCatScores]);

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

    async function fetchRawData() {
        setLoading(true);
        try {
            // 1. Unit Info & Categories & Orgs
            const [unitRes, catRes, orgRes] = await Promise.all([
                supabase.from('organization_units').select('name').eq('id', unitId).single(),
                supabase.from('analysis_categories').select('id, name').eq('unit_id', unitId),
                supabase.from('organization_units').select('id, name')
            ]);
            if (unitRes.data) setUnitName(unitRes.data.name);
            setCategories(catRes.data || []);
            setAllUnits(orgRes.data || []);

            // 2. Raw Qual
            let qualQuery = supabase
                .from('raw_feedback_inputs')
                .select(`id, feedback_segments (id, segment_text, sentiment, category_id, is_suggestion, related_unit_ids), respondents!inner(survey_id, location, faculty, study_program)`)
                .eq('target_unit_id', unitId)
                .eq('requires_analysis', true);

            if (surveyId) qualQuery = qualQuery.eq('respondents.survey_id', surveyId);

            const { data: qData, error: metricsError } = await qualQuery;
            if (metricsError) {
                console.error("Fetch Error:", metricsError);
                toast.error("Failed to load metrics.");
            }
            setBaseRawInputs(qData || []);

            // 3. Raw Scores
            let scoresQuery = supabase.from('raw_feedback_inputs').select('source_column, numerical_score, respondents!inner(survey_id, location, faculty, study_program)').eq('target_unit_id', unitId).eq('is_quantitative', true).not('numerical_score', 'is', null);
            if (surveyId) scoresQuery = scoresQuery.eq('respondents.survey_id', surveyId);
            const { data: rawScores } = await scoresQuery;
            setBaseScores(rawScores || []);

            let catScoresQuery = supabase.from('raw_feedback_inputs').select('source_column, raw_text, respondents!inner(survey_id, location, faculty, study_program)').eq('target_unit_id', unitId).eq('is_quantitative', false).eq('requires_analysis', false);
            if (surveyId) catScoresQuery = catScoresQuery.eq('respondents.survey_id', surveyId);
            const { data: rawCatScores } = await catScoresQuery;
            setBaseCatScores(rawCatScores || []);

        } catch (error) {
            console.error(error);
            toast.error("Failed to fetch raw data");
        } finally {
            setLoading(false);
        }
    }

    function applyFiltersAndMetrics() {
        try {
            const catMap = new Map(categories.map(c => [c.id, c.name]));
            const orgMap = new Map(allUnits.map(u => [u.id, u.name]));

            const locs = new Set<string>();
            const facs = new Set<string>();
            const progs = new Set<string>();

            // Apply Active Filters (Qualitative)
            const filteredInputs = baseRawInputs.filter((r: any) => {
                const resp = r.respondents;
                if (!resp) return false;

                const matchFac = activeFilters.faculty.length === 0 || activeFilters.faculty.includes(resp.faculty);
                const matchProg = activeFilters.program.length === 0 || activeFilters.program.includes(resp.study_program);
                if (matchFac && matchProg && resp.location) locs.add(resp.location);

                const matchLoc = activeFilters.location.length === 0 || activeFilters.location.includes(resp.location);
                if (matchLoc && matchProg && resp.faculty) facs.add(resp.faculty);

                if (matchLoc && matchFac && resp.study_program) progs.add(resp.study_program);

                if (!matchLoc || !matchFac || !matchProg) return false;
                return true;
            });

            setFilterOptions({
                locations: Array.from(locs).sort(),
                faculties: Array.from(facs).sort(),
                programs: Array.from(progs).sort()
            });

            let sentimentCounts = { Positive: 0, Negative: 0, Neutral: 0 };
            let totalSegments = 0;
            let catCountsMap: Record<number, any> = {};
            let sampleSegments: any[] = [];
            let crossUnits: any[] = [];

            filteredInputs.forEach((r: any) => {
                // Determine if this input mentions any segments
                r.feedback_segments?.forEach((s: any) => {
                    const catName = catMap.get(s.category_id) || "Uncategorized";

                    // The user requested that if a comment is "Uncategorized" (i.e. skipped by AI), 
                    // it should NOT be counted in the Comprehensive Insights at all.
                    if (catName === "Uncategorized") {
                        return;
                    }

                    // Always process for top negative category (independent of sentiment filter)
                    if (!catCountsMap[s.category_id]) {
                        catCountsMap[s.category_id] = { category_name: catName, positive_count: 0, negative_count: 0, neutral_count: 0, total: 0, true_negative_count: 0 };
                    }
                    if (s.sentiment === 'Negative') catCountsMap[s.category_id].true_negative_count += 1;

                    // Now apply sentiment filter
                    if (activeFilters.sentiment.length && !activeFilters.sentiment.includes(s.sentiment)) return;

                    totalSegments++;
                    sentimentCounts[s.sentiment as keyof typeof sentimentCounts] += 1;

                    const sentL = s.sentiment.toLowerCase();
                    if (catCountsMap[s.category_id][`${sentL}_count`] !== undefined) {
                        catCountsMap[s.category_id][`${sentL}_count`] += 1;
                    }
                    catCountsMap[s.category_id].total += 1;

                    sampleSegments.push({ ...s, category_name: catName });

                    // Cross-Unit Mentions logic
                    if (s.related_unit_ids && s.related_unit_ids.length > 0) {
                        const otherIds = s.related_unit_ids.filter((id: number) => id !== parseInt(unitId));
                        if (otherIds.length > 0) {
                            const otherNames = otherIds.map((id: number) => orgMap.get(id)).join(', ');
                            crossUnits.push({
                                id: s.id,
                                segment_text: s.segment_text,
                                sentiment: s.sentiment,
                                category_name: catName,
                                tagged_units: otherNames
                            });
                        }
                    }
                });
            });

            setDashboardMetrics({
                total_segments: totalSegments,
                sentiment_counts: sentimentCounts,
                category_counts: Object.values(catCountsMap)
            });
            setAllSegments(sampleSegments);
            setCrossUnitSegments(crossUnits);
            const scores = baseScores.filter((r: any) => {
                const resp = r.respondents;
                if (!resp) return false;
                if (activeFilters.location.length && (!resp.location || !activeFilters.location.includes(resp.location))) return false;
                if (activeFilters.faculty.length && (!resp.faculty || !activeFilters.faculty.includes(resp.faculty))) return false;
                if (activeFilters.program.length && (!resp.study_program || !activeFilters.program.includes(resp.study_program))) return false;
                return true;
            });

            const catScores = baseCatScores.filter((r: any) => {
                const resp = r.respondents;
                if (!resp) return false;
                if (activeFilters.location.length && (!resp.location || !activeFilters.location.includes(resp.location))) return false;
                if (activeFilters.faculty.length && (!resp.faculty || !activeFilters.faculty.includes(resp.faculty))) return false;
                if (activeFilters.program.length && (!resp.study_program || !activeFilters.program.includes(resp.study_program))) return false;
                return true;
            });

            const grouped: Record<string, QuestionGroup> = {};

            scores?.forEach(row => {
                const key = row.source_column;
                if (!grouped[key]) grouped[key] = { question: key, type: "SCORE", totalResponses: 0, chartData: [] };
                const val = row.numerical_score;
                const existing = grouped[key].chartData.find(d => d.name === val.toString());
                if (existing) existing.value++; else grouped[key].chartData.push({ name: val.toString(), value: 1 });
                grouped[key].totalResponses++;
            });

            let totalSum = 0;
            let totalCount = 0;
            Object.values(grouped).forEach(g => {
                let gSum = 0;

                // First pass: find max scale
                const maxVal = Math.max(...g.chartData.map(d => parseFloat(d.name)));

                // Second pass: apply colors based on scale and compute sum
                g.chartData.forEach(d => {
                    const val = parseFloat(d.name);
                    const weight = d.value;
                    gSum += val * weight;

                    if (maxVal <= 1) { // 0-1 Binary scale
                        d.color = val === 0 ? "#f43f5e" : "#10b981"; // Red for 0, Green for 1
                    } else { // 1-4 scale
                        if (val <= 1) d.color = "#ef4444";
                        else if (val === 2) d.color = "#f59e0b";
                        else if (val === 3) d.color = "#84cc16";
                        else d.color = "#22c55e";
                    }
                });

                g.average = g.totalResponses > 0 ? (gSum / g.totalResponses).toFixed(2) : "0.00";
                g.chartData.sort((a, b) => parseFloat(a.name) - parseFloat(b.name));

                if (maxVal > 1) {
                    totalSum += gSum;
                    totalCount += g.totalResponses;
                }
            });
            if (totalCount > 0) setGlobalAvgScore((totalSum / totalCount).toFixed(2));
            else setGlobalAvgScore("N/A");

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
        }
    }

    // --- DERIVED METRICS ---
    const sentimentCounts = dashboardMetrics?.sentiment_counts || { Positive: 0, Negative: 0, Neutral: 0 };
    const totalSegments = dashboardMetrics?.total_segments || 0;

    let sentimentScore = 0;
    if (totalSegments > 0) {
        sentimentScore = Math.round((sentimentCounts.Positive * 100 + sentimentCounts.Neutral * 50) / totalSegments);
    }

    let topNegativeCategory = { name: "N/A", count: 0 };
    let catCounts: Record<string, any> = {};

    if (dashboardMetrics?.category_counts) {
        dashboardMetrics.category_counts.forEach((c: any) => {
            // Re-format for the Recharts BarChart which expects an object map
            catCounts[c.category_name] = {
                name: c.category_name,
                positive: c.positive_count,
                negative: c.negative_count,
                neutral: c.neutral_count,
                total: c.total
            };

            if (c.true_negative_count > topNegativeCategory.count) {
                topNegativeCategory = { name: c.category_name, count: c.true_negative_count };
            }
        });
    }

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
                .select('id, source_column, raw_text, numerical_score, respondents!inner(survey_id, location, faculty, study_program)', { count: 'exact' })
                .eq('target_unit_id', unitId)
                .eq('is_quantitative', true)
                .not('numerical_score', 'is', null)
                .order('id', { ascending: true });

            if (surveyId) query = query.eq('respondents.survey_id', surveyId);
            if (activeFilters.location.length) query = query.in('respondents.location', activeFilters.location);
            if (activeFilters.faculty.length) query = query.in('respondents.faculty', activeFilters.faculty);
            if (activeFilters.program.length) query = query.in('respondents.study_program', activeFilters.program);

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
        <div ref={dashboardRef} className={`relative pt-4 space-y-8 animate-in fade-in pb-20 transition-all duration-300 ${isFiltering ? 'opacity-60 blur-sm pointer-events-none' : ''}`}>

            {/* The spinner overlay is pulled out of the blurred wrapper and injected globally via Fixed instead, or it would be fully blurred too */}
            {isFiltering && (
                <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center pointer-events-none">
                    <Loader2 className="w-10 h-10 animate-spin text-indigo-600 mb-3 drop-shadow-md" />
                    <span className="font-semibold text-indigo-900 bg-white/80 px-4 py-1 rounded-full shadow-sm">Applying Filters...</span>
                </div>
            )}

            {/* --- FILTER CONTROL ROW --- */}
            <div className="print:hidden space-y-3">
                <div className="flex items-center justify-between bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3 rounded-xl shadow-sm">
                    <div className="flex items-center gap-3">
                        <Filter className="w-5 h-5 text-indigo-500" />
                        <span className="font-medium text-slate-700 dark:text-slate-200">Data Filters</span>

                        {(activeFilters.sentiment.length + activeFilters.location.length + activeFilters.faculty.length + activeFilters.program.length) > 0 && (
                            <div className="flex items-center gap-2 ml-4">
                                <Badge variant="secondary" className="bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400 hover:bg-indigo-100">
                                    {activeFilters.sentiment.length + activeFilters.location.length + activeFilters.faculty.length + activeFilters.program.length} Active
                                </Badge>
                                <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200" onClick={() => setActiveFilters({ sentiment: [], location: [], faculty: [], program: [] })}>Clear All</Button>
                            </div>
                        )}
                    </div>
                    <Button variant="outline" size="sm" className="gap-2 dark:border-slate-700 dark:hover:bg-slate-800" onClick={() => setIsFilterOpen(!isFilterOpen)}>
                        {isFilterOpen ? 'Close Filters' : 'Edit Filters'} <ChevronDown className={`w-4 h-4 transition-transform ${isFilterOpen ? 'rotate-180' : ''}`} />
                    </Button>
                </div>

                {isFilterOpen && (
                    <Card className="border-indigo-100 dark:border-indigo-900/40 bg-indigo-50/30 dark:bg-indigo-950/20 shadow-inner animate-in slide-in-from-top-2">
                        <CardContent className="p-5 grid grid-cols-1 md:grid-cols-4 gap-6">

                            {/* Sentiment */}
                            <div className="space-y-3">
                                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1"><MessageSquare className="w-3 h-3" /> Sentiment</label>
                                <div className="flex flex-col gap-2">
                                    {['Positive', 'Neutral', 'Negative'].map(s => (
                                        <label key={s} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer">
                                            <input type="checkbox" className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-800"
                                                checked={activeFilters.sentiment.includes(s)}
                                                onChange={(e) => {
                                                    if (e.target.checked) setActiveFilters(p => ({ ...p, sentiment: [...p.sentiment, s] }));
                                                    else setActiveFilters(p => ({ ...p, sentiment: p.sentiment.filter(x => x !== s) }));
                                                }}
                                            />
                                            <span className={`w-2 h-2 rounded-full ${s === 'Positive' ? 'bg-green-500' : s === 'Negative' ? 'bg-red-500' : 'bg-slate-400'}`} />
                                            {s}
                                        </label>
                                    ))}
                                </div>
                            </div>

                            {/* Location */}
                            <div className="space-y-3">
                                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Location</label>
                                <div className="flex flex-col gap-2 max-h-[160px] overflow-y-auto pr-2 custom-scrollbar">
                                    {filterOptions.locations.length === 0 ? <span className="text-xs text-slate-400 italic">No locations</span> : filterOptions.locations.map(s => (
                                        <label key={s} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer">
                                            <input type="checkbox" className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-800"
                                                checked={activeFilters.location.includes(s)}
                                                onChange={(e) => {
                                                    if (e.target.checked) setActiveFilters(p => ({ ...p, location: [...p.location, s] }));
                                                    else setActiveFilters(p => ({ ...p, location: p.location.filter(x => x !== s) }));
                                                }}
                                            /> <span className="truncate" title={s}>{s}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            {/* Faculty */}
                            <div className="space-y-3">
                                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Faculty</label>
                                <div className="flex flex-col gap-2 max-h-[160px] overflow-y-auto pr-2 custom-scrollbar">
                                    {filterOptions.faculties.length === 0 ? <span className="text-xs text-slate-400 italic">No faculties</span> : filterOptions.faculties.map(s => (
                                        <label key={s} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer">
                                            <input type="checkbox" className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-800"
                                                checked={activeFilters.faculty.includes(s)}
                                                onChange={(e) => {
                                                    if (e.target.checked) setActiveFilters(p => ({ ...p, faculty: [...p.faculty, s] }));
                                                    else setActiveFilters(p => ({ ...p, faculty: p.faculty.filter(x => x !== s) }));
                                                }}
                                            /> <span className="truncate" title={s}>{s}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            {/* Study Program */}
                            <div className="space-y-3">
                                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Study Program</label>
                                <div className="flex flex-col gap-2 max-h-[160px] overflow-y-auto pr-2 custom-scrollbar">
                                    {filterOptions.programs.length === 0 ? <span className="text-xs text-slate-400 italic">No programs</span> : filterOptions.programs.map(s => (
                                        <label key={s} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer">
                                            <input type="checkbox" className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-800"
                                                checked={activeFilters.program.includes(s)}
                                                onChange={(e) => {
                                                    if (e.target.checked) setActiveFilters(p => ({ ...p, program: [...p.program, s] }));
                                                    else setActiveFilters(p => ({ ...p, program: p.program.filter(x => x !== s) }));
                                                }}
                                            /> <span className="truncate" title={s}>{s}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>

                        </CardContent>
                    </Card>
                )}
            </div>

            {/* --- UNIFIED METRICS ROW --- */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                {/* Sentiment Score */}
                <Card className="border-none shadow-lg bg-gradient-to-br from-indigo-600 to-violet-700 text-white relative group overflow-hidden print:break-inside-avoid">
                    <div className="absolute top-0 right-0 p-4 opacity-10"><TrendingUp className="w-24 h-24" /></div>
                    <CardHeader className="pb-2"><CardDescription className="text-indigo-100 font-medium">Sentiment Index</CardDescription><CardTitle className="text-4xl font-bold">{sentimentScore}<span className="text-xl opacity-50">/100</span></CardTitle></CardHeader>
                    <CardContent><div className="text-xs text-indigo-100 flex items-center gap-1">{sentimentScore >= 70 ? <Sparkles className="w-3 h-3" /> : sentimentScore >= 40 ? <TrendingUp className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />} {sentimentScore >= 70 ? "Excellent" : sentimentScore >= 40 ? "Moderate" : "Needs Focus"}</div></CardContent>
                </Card>

                {/* Avg Quant Score */}
                <Card className="border-slate-200 dark:border-slate-800 shadow-md bg-white dark:bg-slate-900 hover:shadow-lg transition-shadow print:break-inside-avoid">
                    <CardHeader className="pb-2"><CardDescription className="font-medium text-slate-500 dark:text-slate-300">Avg. Rating</CardDescription><CardTitle className="text-4xl font-bold text-slate-800 dark:text-slate-100">{globalAvgScore}<span className="text-xl text-slate-400 dark:text-slate-500 font-normal">/4.0</span></CardTitle></CardHeader>
                    <CardContent><div className="text-xs text-slate-500 dark:text-slate-300">Across {quantGroups.filter(g => g.type === "SCORE").length} metrics</div></CardContent>
                </Card>

                {/* Volume */}
                <Card className="border-slate-200 dark:border-slate-800 shadow-md bg-white dark:bg-slate-900 hover:shadow-lg transition-shadow print:break-inside-avoid">
                    <CardHeader className="pb-2"><CardDescription className="font-medium text-slate-500 dark:text-slate-300">Analyzed Voices</CardDescription><CardTitle className="text-4xl font-bold text-slate-800 dark:text-slate-100">{totalSegments.toLocaleString()}</CardTitle></CardHeader>
                    <CardContent><div className="text-xs text-green-600 dark:text-green-500 flex items-center gap-1"><MessageSquare className="w-3 h-3" /> {quantGroups.reduce((a, b) => a + b.totalResponses, 0).toLocaleString()} quant data points</div></CardContent>
                </Card>

                {/* Hot Spot */}
                <Card className="border-red-100 dark:border-red-900/30 shadow-md bg-red-50/50 dark:bg-red-950/20 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors print:break-inside-avoid">
                    <CardHeader className="pb-2"><CardDescription className="font-medium text-red-600 dark:text-red-400 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Top Issue</CardDescription><CardTitle className="text-2xl font-bold text-red-900 dark:text-red-200 leading-tight md:text-xl line-clamp-2">{topNegativeCategory.name}</CardTitle></CardHeader>
                    <CardContent><div className="text-xs text-red-700 dark:text-red-400/80"><strong>{topNegativeCategory.count}</strong> negative comments {totalSegments > 0 && <span className="text-red-500 dark:text-red-500/70">({Math.round(topNegativeCategory.count / sentimentCounts.Negative * 100)}% of all negatives)</span>}</div></CardContent>
                </Card>
            </div>

            {/* --- EXECUTIVE REPORT --- */}
            <Card className="border-indigo-200 dark:border-indigo-900/50 bg-white dark:bg-slate-900 shadow-xl overflow-hidden">
                <div className="h-1 bg-gradient-to-r from-indigo-500 to-purple-500 print:hidden" />
                <CardHeader className="flex flex-row items-center justify-between bg-slate-50/50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800 py-4 print:hidden">
                    <div className="flex items-center gap-2"><Sparkles className="w-5 h-5 text-indigo-600 dark:text-indigo-400" /><h3 className="font-semibold text-slate-800 dark:text-slate-100">Executive Analysis</h3>{lastSaved && <span className="text-[10px] text-slate-400 ml-2">Last: {lastSaved}</span>}</div>
                    <div className="flex gap-2">
                        <Button onClick={generateReport} disabled={generatingReport} size="sm" className="bg-indigo-600 dark:bg-indigo-500 dark:hover:bg-indigo-600 dark:text-white">{generatingReport ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <RefreshCcw className="w-3 h-3 mr-1" />} {report ? "Regenerate" : "Generate"}</Button>
                        {report && <Button variant="outline" size="sm" onClick={exportToPdf} disabled={exportingPdf} className="dark:border-slate-700 dark:hover:bg-slate-800"><Download className="w-3 h-3 mr-1" /> PDF</Button>}
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    {report ? (
                        <div className="divide-y divide-slate-100 dark:divide-slate-800">
                            {/* Header Banner */}
                            <div className="bg-gradient-to-r from-indigo-50 to-violet-50 dark:from-indigo-950/30 dark:to-violet-950/30 px-8 py-6">
                                <div className="flex items-center justify-between mb-3">
                                    <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">Executive Analysis Report</h2>
                                    <Badge className={`text-xs px-3 py-1 ${report.overall_verdict === 'Excellent' ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-400' : report.overall_verdict === 'Good' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400' : report.overall_verdict === 'Needs Improvement' ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-400' : 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400'}`}>
                                        {report.overall_verdict === 'Excellent' ? '🟢' : report.overall_verdict === 'Good' ? '🔵' : report.overall_verdict === 'Needs Improvement' ? '🟡' : '🔴'} {report.overall_verdict}
                                    </Badge>
                                </div>
                                <p className="text-sm text-slate-500 dark:text-slate-400">{unitName} · Generated {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
                            </div>

                            {/* Executive Summary */}
                            <div className="px-8 py-6">
                                <p className="text-[15px] text-slate-700 dark:text-slate-300 leading-relaxed italic border-l-4 border-indigo-300 dark:border-indigo-700 pl-4">{report.executive_summary}</p>
                            </div>

                            {/* Strengths */}
                            <div className="px-8 py-6">
                                <div className="flex items-center gap-2 mb-4"><CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-500" /><h3 className="text-base font-bold text-slate-800 dark:text-slate-200">Strengths</h3></div>
                                <div className="space-y-4">
                                    {report.strengths?.map((s, i) => (
                                        <div key={i} className="bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30 rounded-lg p-4">
                                            <h4 className="font-semibold text-emerald-900 dark:text-emerald-400 text-sm mb-1">▸ {s.title}</h4>
                                            <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{s.detail}</p>
                                            {s.evidence && <div className="mt-2 flex items-start gap-2 text-xs text-slate-500 dark:text-slate-400 italic"><Quote className="w-3 h-3 mt-0.5 text-emerald-400 dark:text-emerald-600 shrink-0" /><span>&ldquo;{s.evidence}&rdquo;</span></div>}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Concerns */}
                            <div className="px-8 py-6">
                                <div className="flex items-center gap-2 mb-4"><AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-500" /><h3 className="text-base font-bold text-slate-800 dark:text-slate-200">Areas of Concern</h3></div>
                                <div className="space-y-4">
                                    {report.concerns?.map((c, i) => (
                                        <div key={i} className="bg-amber-50/30 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/30 rounded-lg p-4">
                                            <div className="flex items-center justify-between mb-1">
                                                <h4 className="font-semibold text-amber-900 dark:text-amber-400 text-sm">▸ {c.title}</h4>
                                                <Badge variant="outline" className={`text-[10px] ${c.severity === 'High' ? 'border-red-300 dark:border-red-800 text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/30' : c.severity === 'Medium' ? 'border-amber-300 dark:border-amber-800 text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30' : 'border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/50'}`}>{c.severity === 'High' ? '🔴' : c.severity === 'Medium' ? '🟡' : '🟢'} {c.severity}</Badge>
                                            </div>
                                            <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{c.detail}</p>
                                            {c.evidence && <div className="mt-2 flex items-start gap-2 text-xs text-slate-500 dark:text-slate-400 italic"><Quote className="w-3 h-3 mt-0.5 text-amber-400 dark:text-amber-600 shrink-0" /><span>&ldquo;{c.evidence}&rdquo;</span></div>}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Recommendations */}
                            <div className="px-8 py-6">
                                <div className="flex items-center gap-2 mb-4"><Target className="w-5 h-5 text-blue-600 dark:text-blue-500" /><h3 className="text-base font-bold text-slate-800 dark:text-slate-200">Recommendations</h3></div>
                                <div className="space-y-3">
                                    {report.recommendations?.map((r, i) => (
                                        <div key={i} className="bg-white dark:bg-slate-900 border border-blue-100 dark:border-blue-900/50 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow">
                                            <div className="flex items-center justify-between mb-2">
                                                <h4 className="font-semibold text-blue-900 dark:text-blue-400 text-sm">{i + 1}. {r.title}</h4>
                                                <Badge className={`text-[10px] px-2 ${r.priority === 'Immediate' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' : r.priority === 'Short-term' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'}`}>
                                                    {r.priority === 'Immediate' ? '⚡' : r.priority === 'Short-term' ? '📅' : '🔮'} {r.priority}
                                                </Badge>
                                            </div>
                                            <div className="space-y-1 text-sm">
                                                <p className="text-slate-700 dark:text-slate-300"><span className="font-medium text-slate-500 dark:text-slate-400">Action:</span> {r.action}</p>
                                                <p className="text-slate-600 dark:text-slate-400"><span className="font-medium text-slate-500 dark:text-slate-500">Impact:</span> {r.impact}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Closing */}
                            <div className="px-8 py-6 bg-slate-50/50 dark:bg-slate-900/50">
                                <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed text-center italic" style={{ fontFamily: 'Georgia, serif' }}>{report.closing_statement}</p>
                            </div>
                        </div>
                    ) : (
                        <div className="p-8 text-center text-slate-400 dark:text-slate-600 italic">Generate a report to see strategic insights.</div>
                    )}
                </CardContent>
            </Card>

            {/* --- AI INSIGHT CHAT (UNIT LEVEL) MOVED UNDER EXEC ANALYSIS --- */}
            <div className="print:hidden">
                <UnitInsightChat unitId={unitId} surveyId={surveyId} />
            </div>

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
            <Card className="shadow-sm border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 print:break-inside-avoid">
                <CardHeader className="pb-2">
                    <div className="flex items-center gap-2"><MessageSquare className="w-5 h-5 text-indigo-600 dark:text-indigo-400" /><CardTitle className="text-base text-slate-800 dark:text-slate-100">Sentiment by Category</CardTitle></div>
                    <CardDescription className="dark:text-slate-400">Click bars to view comments. {Object.keys(catCounts).length} categories detected.</CardDescription>
                </CardHeader>
                <CardContent style={{ height: `${Math.max(300, Object.keys(catCounts).length * 40)}px` }}>
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={Object.values(catCounts)} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }} onClick={handleQualDrillDown}>
                            <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke={isDark ? "#334155" : "#e2e8f0"} />
                            <XAxis type="number" tick={{ fill: isDark ? "#94a3b8" : "#64748b" }} />
                            <YAxis dataKey="name" type="category" width={140} tick={{ fontSize: 11, fill: isDark ? "#cbd5e1" : "#475569" }} />
                            <Tooltip cursor={{ fill: isDark ? 'rgba(99, 102, 241, 0.2)' : 'rgba(99, 102, 241, 0.1)' }} contentStyle={isDark ? { backgroundColor: '#1e293b', borderColor: '#334155', color: '#f8fafc' } : undefined} />
                            <Legend wrapperStyle={{ color: isDark ? "#cbd5e1" : undefined }} />
                            <Bar dataKey="positive" stackId="a" fill="#4ade80" name="Positive" radius={[4, 0, 0, 4]} cursor="pointer" />
                            <Bar dataKey="neutral" stackId="a" fill="#94a3b8" name="Neutral" cursor="pointer" />
                            <Bar dataKey="negative" stackId="a" fill="#f87171" name="Negative" radius={[0, 4, 4, 0]} cursor="pointer" />
                        </BarChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card>

            {/* QUAL DRILL DOWN PREVIEW */}
            {activeQualDrillDown && (
                <Card className="border-indigo-200 dark:border-indigo-900/50 bg-indigo-50/30 dark:bg-indigo-950/20 animate-in fade-in slide-in-from-top-2 print:hidden">
                    <CardHeader className="py-3 flex flex-row items-center justify-between">
                        <div className="text-sm font-medium text-indigo-900 dark:text-indigo-300">Drill Down: {activeQualDrillDown.category} ({activeQualDrillDown.sentiment})</div>
                        <Button variant="ghost" size="sm" onClick={() => setActiveQualDrillDown(null)} className="h-6 w-6 p-0 dark:text-slate-400 dark:hover:text-slate-200"><X className="w-4 h-4" /></Button>
                    </CardHeader>
                    <CardContent className="max-h-[300px] overflow-y-auto space-y-2">
                        {allSegments.filter(s => s.category_name === activeQualDrillDown.category && (activeQualDrillDown.sentiment === 'Positive' ? s.sentiment === 'Positive' : activeQualDrillDown.sentiment === 'Negative' ? s.sentiment === 'Negative' : s.sentiment === 'Neutral')).map(s => (
                            <div key={s.id} className="bg-white dark:bg-slate-900 p-2 text-xs rounded border border-indigo-100 dark:border-slate-800 shadow-sm dark:text-slate-300">&ldquo;{s.segment_text}&rdquo;</div>
                        ))}
                    </CardContent>
                </Card>
            )}

            {/* --- OVERALL SENTIMENT --- */}
            <div className="space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b border-slate-200 dark:border-slate-800">
                    <MessageSquare className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                    <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Overall Sentiment Distribution</h2>
                </div>
                <Card className="shadow-md border-indigo-100 dark:border-indigo-900/30 bg-gradient-to-br from-white to-slate-50 dark:from-slate-900 dark:to-slate-900 overflow-hidden">
                    <CardContent className="h-[300px] pt-6 flex items-center justify-center relative">
                        <div className="absolute inset-0 bg-grid-slate-100 dark:bg-grid-slate-800/20 [mask-image:linear-gradient(0deg,white,rgba(255,255,255,0.5))] pointer-events-none" />
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={pieData}
                                    cx="50%" cy="50%"
                                    innerRadius={70} outerRadius={100}
                                    paddingAngle={5}
                                    dataKey="value"
                                    stroke={isDark ? "#0f172a" : "#ffffff"}
                                    strokeWidth={3}
                                >
                                    {pieData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} className="drop-shadow-sm hover:opacity-80 transition-opacity" />)}
                                </Pie>
                                <Tooltip
                                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)' }}
                                    itemStyle={{ color: isDark ? '#f8fafc' : '#0f172a', fontWeight: 600 }}
                                />
                                <Legend verticalAlign="bottom" height={36} wrapperStyle={{ color: isDark ? "#cbd5e1" : "#475569", fontWeight: 500 }} />
                            </PieChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
            </div>

            {/* --- QUANTITATIVE METRICS by Scale --- */}
            <div className="space-y-8">
                <div className="flex items-center gap-2 pb-2 border-b border-slate-200 dark:border-slate-800">
                    <BarChart2 className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Performance Metrics</h2>
                </div>

                {quantGroups.length === 0 && <div className="text-center py-10 text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-lg">No quantitative columns detected.</div>}

                {/* 1-4 Scale (Likert / Ratings) */}
                {quantGroups.filter(g => g.type === "SCORE" && g.chartData.some(d => parseFloat(d.name) > 1)).length > 0 && (
                    <div className="space-y-4">
                        <h3 className="text-sm font-semibold text-slate-500 tracking-widest uppercase ml-1">Satisfaction Scores (1.0 - 4.0)</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {quantGroups.filter(g => g.type === "SCORE" && g.chartData.some(d => parseFloat(d.name) > 1)).map((group, idx) => (
                                <Card key={`4scale-${idx}`} className="hover:shadow-lg transition-all duration-300 border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 group">
                                    <CardHeader className="py-4 bg-slate-50/50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800 relative overflow-hidden">
                                        <div className="absolute top-0 right-0 w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-bl-full opacity-0 group-hover:opacity-100 transition-opacity" />
                                        <div className="flex justify-between items-start gap-4 z-10 relative">
                                            <CardTitle className="text-sm font-semibold text-slate-800 dark:text-slate-100 line-clamp-2 leading-relaxed" title={group.question}>{group.question}</CardTitle>
                                            <Badge variant="secondary" className="bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300 font-bold whitespace-nowrap text-xs">{group.average}</Badge>
                                        </div>
                                    </CardHeader>
                                    <CardContent className="py-4 h-[180px]">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={group.chartData} layout="horizontal" margin={{ top: 10, right: 10, bottom: 0, left: -20 }}>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDark ? "#334155" : "#f1f5f9"} />
                                                <XAxis dataKey="name" tick={{ fontSize: 11, fill: isDark ? "#94a3b8" : "#64748b" }} axisLine={false} tickLine={false} />
                                                <YAxis tick={{ fontSize: 11, fill: isDark ? "#94a3b8" : "#64748b" }} axisLine={false} tickLine={false} />
                                                <Tooltip cursor={{ fill: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)' }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                                                <Bar dataKey="value" barSize={24} radius={[4, 4, 0, 0]} onClick={(d: any) => handleQuantDrillDown(group.question, group.type, d.name)}>
                                                    {group.chartData.map((e, i) => <Cell key={i} fill={e.color || "#3b82f6"} className="cursor-pointer hover:opacity-80 transition-opacity" />)}
                                                </Bar>
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    </div>
                )}

                {/* 0-1 Scale (Binary / Yes-No) */}
                {quantGroups.filter(g => g.type === "SCORE" && !g.chartData.some(d => parseFloat(d.name) > 1)).length > 0 && (
                    <div className="space-y-4">
                        <h3 className="text-sm font-semibold text-slate-500 tracking-widest uppercase ml-1">Binary Indicators (0.0 - 1.0)</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {quantGroups.filter(g => g.type === "SCORE" && !g.chartData.some(d => parseFloat(d.name) > 1)).map((group, idx) => (
                                <Card key={`bin-${idx}`} className="hover:shadow-lg transition-all duration-300 border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                                    <CardHeader className="py-4 bg-slate-50/50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800">
                                        <div className="flex justify-between items-start gap-4">
                                            <CardTitle className="text-sm font-semibold text-slate-800 dark:text-slate-100 line-clamp-2 leading-relaxed" title={group.question}>{group.question}</CardTitle>
                                            <Badge variant="secondary" className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300 font-bold whitespace-nowrap text-xs">{group.average}</Badge>
                                        </div>
                                    </CardHeader>
                                    <CardContent className="py-4 h-[150px]">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={group.chartData} layout="horizontal" margin={{ top: 10, right: 10, bottom: 0, left: -20 }}>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDark ? "#334155" : "#f1f5f9"} />
                                                <XAxis dataKey="name" tick={{ fontSize: 11, fill: isDark ? "#94a3b8" : "#64748b" }} axisLine={false} tickLine={false} />
                                                <YAxis tick={{ fontSize: 11, fill: isDark ? "#94a3b8" : "#64748b" }} axisLine={false} tickLine={false} />
                                                <Tooltip cursor={{ fill: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)' }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                                                <Bar dataKey="value" barSize={32} radius={[4, 4, 0, 0]} fill="#10b981" onClick={(d: any) => handleQuantDrillDown(group.question, group.type, d.name)} className="cursor-pointer hover:opacity-80 transition-opacity" />
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    </div>
                )}

                {/* Categorical Distribution */}
                {quantGroups.filter(g => g.type === "CATEGORY").length > 0 && (
                    <div className="space-y-4">
                        <h3 className="text-sm font-semibold text-slate-500 tracking-widest uppercase ml-1">Categorical Distributions</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {quantGroups.filter(g => g.type === "CATEGORY").map((group, idx) => (
                                <Card key={`cat-${idx}`} className="hover:shadow-lg transition-all duration-300 border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                                    <CardHeader className="py-4 bg-slate-50/50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800">
                                        <div className="flex justify-between items-start gap-4">
                                            <CardTitle className="text-sm font-semibold text-slate-800 dark:text-slate-100 line-clamp-2 leading-relaxed" title={group.question}>{group.question}</CardTitle>
                                            <Badge variant="outline" className="border-violet-200 text-violet-700 dark:border-violet-800 dark:text-violet-400 font-medium whitespace-nowrap text-xs">Categories</Badge>
                                        </div>
                                    </CardHeader>
                                    <CardContent className="py-4 h-[250px]">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={group.chartData} layout="vertical" margin={{ top: 0, right: 30, bottom: 0, left: 0 }}>
                                                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke={isDark ? "#334155" : "#f1f5f9"} />
                                                <XAxis type="number" tick={{ fontSize: 11, fill: isDark ? "#94a3b8" : "#64748b" }} axisLine={false} tickLine={false} />
                                                <YAxis dataKey="name" type="category" width={110} tick={{ fontSize: 11, fill: isDark ? "#cbd5e1" : "#475569" }} axisLine={false} tickLine={false} />
                                                <Tooltip cursor={{ fill: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)' }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                                                <Bar dataKey="value" barSize={16} radius={[0, 4, 4, 0]} fill="#8b5cf6" onClick={(d: any) => handleQuantDrillDown(group.question, group.type, d.name)}>
                                                    {group.chartData.map((e, i) => <Cell key={i} fill={e.color || "#8b5cf6"} className="cursor-pointer hover:opacity-80 transition-opacity" />)}
                                                </Bar>
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* --- CROSS-UNIT MENTIONS TABLE --- */}
            {crossUnitSegments.length > 0 && (
                <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm print:hidden">
                    <CardHeader className="py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
                        <div className="flex items-center gap-2">
                            <Lightbulb className="w-5 h-5 text-amber-500" />
                            <CardTitle className="text-base text-slate-800 dark:text-slate-100">Cross-Unit Mentions</CardTitle>
                            <Badge variant="outline" className="text-[10px] ml-2 border-amber-200 text-amber-700 bg-amber-50 dark:border-amber-900/40 dark:text-amber-400 dark:bg-amber-950/20">{crossUnitSegments.length} comments</Badge>
                        </div>
                        <CardDescription className="dark:text-slate-500">Comments processed in this unit that explicitly mention or relate to other departments.</CardDescription>
                    </CardHeader>
                    <CardContent className="p-0 max-h-[400px] overflow-y-auto custom-scrollbar">
                        <table className="w-full text-xs">
                            <thead className="bg-slate-50 dark:bg-slate-950/50 sticky top-0 z-10 shadow-sm">
                                <tr>
                                    <th className="text-left p-3 font-medium text-slate-600 dark:text-slate-300 w-[45%]">Student Comment</th>
                                    <th className="text-left p-3 font-medium text-slate-600 dark:text-slate-300">Sentiment</th>
                                    <th className="text-left p-3 font-medium text-slate-600 dark:text-slate-300">Category</th>
                                    <th className="text-left p-3 font-medium text-slate-600 dark:text-slate-300">Tagged Units</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {crossUnitSegments.map((entry, i) => (
                                    <tr key={i} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                                        <td className="p-3 text-slate-700 dark:text-slate-300 leading-relaxed">&ldquo;{entry.segment_text}&rdquo;</td>
                                        <td className="p-3">
                                            <span className={`inline-flex items-center gap-1 text-[10px] font-medium ${entry.sentiment === 'Positive' ? 'text-green-700 dark:text-green-400' : entry.sentiment === 'Negative' ? 'text-red-700 dark:text-red-400' : 'text-slate-500 dark:text-slate-400'}`}>
                                                <span className={`w-1.5 h-1.5 rounded-full ${entry.sentiment === 'Positive' ? 'bg-green-500' : entry.sentiment === 'Negative' ? 'bg-red-500' : 'bg-slate-400'}`} />
                                                {entry.sentiment}
                                            </span>
                                        </td>
                                        <td className="p-3"><Badge variant="outline" className="text-[10px] dark:border-slate-700 dark:text-slate-300">{entry.category_name}</Badge></td>
                                        <td className="p-3"><span className="font-semibold text-indigo-600 dark:text-indigo-400">{entry.tagged_units}</span></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </CardContent>
                </Card>
            )}

            {/* --- RAW DATA EXPLORER --- */}
            <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm print:hidden">
                <CardHeader className="py-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors" onClick={() => setShowRawData(!showRawData)}>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Table2 className="w-5 h-5 text-slate-600 dark:text-slate-400" />
                            <CardTitle className="text-base text-slate-800 dark:text-slate-100">Raw Data Explorer</CardTitle>
                            <Badge variant="outline" className="text-[10px] dark:border-slate-700 dark:text-slate-300">Verify</Badge>
                        </div>
                        <ChevronDown className={`w-4 h-4 text-slate-400 dark:text-slate-500 transition-transform ${showRawData ? 'rotate-180' : ''}`} />
                    </div>
                    <CardDescription className="dark:text-slate-500">Click to inspect actual comments and ratings</CardDescription>
                </CardHeader>
                {showRawData && (
                    <CardContent className="pt-0">
                        {/* Tab Switcher */}
                        <div className="flex items-center gap-4 mb-4 border-b border-slate-200 dark:border-slate-800">
                            <button onClick={() => { setRawDataTab("comments"); setRawDataPage(0); }} className={`pb-2 text-sm font-medium border-b-2 transition-colors ${rawDataTab === "comments" ? "border-indigo-500 text-indigo-700 dark:text-indigo-400" : "border-transparent text-slate-400 hover:text-slate-600 dark:text-slate-400 dark:hover:text-slate-200"}`}>
                                <MessageSquare className="w-3 h-3 inline mr-1" /> Comments
                            </button>
                            <button onClick={() => { setRawDataTab("ratings"); setRawDataPage(0); }} className={`pb-2 text-sm font-medium border-b-2 transition-colors ${rawDataTab === "ratings" ? "border-indigo-500 text-indigo-700 dark:text-indigo-400" : "border-transparent text-slate-400 hover:text-slate-600 dark:text-slate-400 dark:hover:text-slate-200"}`}>
                                <BarChart2 className="w-3 h-3 inline mr-1" /> Ratings
                            </button>
                            <div className="flex-1" />
                            <div className="relative mb-1">
                                <Search className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
                                <Input placeholder="Search..." className="h-7 pl-7 text-xs w-40 dark:bg-slate-800 dark:border-slate-700" value={rawDataSearch} onChange={e => { setRawDataSearch(e.target.value); setRawDataPage(0); }} />
                            </div>
                        </div>

                        {/* Table */}
                        {rawDataLoading ? (
                            <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
                        ) : (
                            <>
                                <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
                                    <table className="w-full text-xs">
                                        <thead className="bg-slate-50 dark:bg-slate-950/50">
                                            <tr>
                                                {rawDataTab === "comments" ? (
                                                    <>
                                                        <th className="text-left p-2 font-medium text-slate-600 dark:text-slate-300 w-[50%]">Comment</th>
                                                        <th className="text-left p-2 font-medium text-slate-600 dark:text-slate-300">Category</th>
                                                        <th className="text-left p-2 font-medium text-slate-600 dark:text-slate-300">Sentiment</th>
                                                    </>
                                                ) : (
                                                    <>
                                                        <th className="text-left p-2 font-medium text-slate-600 dark:text-slate-300 w-[40%]">Question</th>
                                                        <th className="text-left p-2 font-medium text-slate-600 dark:text-slate-300">Score</th>
                                                        <th className="text-left p-2 font-medium text-slate-600 dark:text-slate-300">Raw Text</th>
                                                    </>
                                                )}
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                            {rawDataEntries.map((entry, i) => (
                                                <tr key={entry.id || i} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                                                    {rawDataTab === "comments" ? (
                                                        <>
                                                            <td className="p-2 text-slate-700 dark:text-slate-300">{entry.segment_text}</td>
                                                            <td className="p-2"><Badge variant="outline" className="text-[10px] dark:border-slate-700 dark:text-slate-300">{entry.category_name}</Badge></td>
                                                            <td className="p-2"><span className={`inline-flex items-center gap-1 text-[10px] font-medium ${entry.sentiment === 'Positive' ? 'text-green-700 dark:text-green-400' : entry.sentiment === 'Negative' ? 'text-red-700 dark:text-red-400' : 'text-slate-500 dark:text-slate-400'}`}><span className={`w-1.5 h-1.5 rounded-full ${entry.sentiment === 'Positive' ? 'bg-green-500' : entry.sentiment === 'Negative' ? 'bg-red-500' : 'bg-slate-400'}`} />{entry.sentiment}</span></td>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <td className="p-2 text-slate-700 dark:text-slate-300 font-medium">{entry.source_column}</td>
                                                            <td className="p-2"><Badge className={`text-[10px] ${entry.numerical_score <= 1 ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' : entry.numerical_score === 2 ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400' : 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'}`}>{entry.numerical_score}</Badge></td>
                                                            <td className="p-2 text-slate-500 dark:text-slate-400 italic">{entry.raw_text || '—'}</td>
                                                        </>
                                                    )}
                                                </tr>
                                            ))}
                                            {rawDataEntries.length === 0 && (
                                                <tr><td colSpan={3} className="p-6 text-center text-slate-400 dark:text-slate-500">No data found.</td></tr>
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
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in duration-200 print:hidden">
                    <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col m-4 border border-slate-200 dark:border-slate-800">
                        <div className="flex items-center justify-between p-4 border-b border-slate-100 dark:border-slate-800">
                            <h3 className="font-semibold text-slate-800 dark:text-slate-100">Drill Down: {activeQuantDrillDown.filterValue}</h3>
                            <Button variant="ghost" size="sm" onClick={() => setActiveQuantDrillDown(null)} className="dark:text-slate-400 dark:hover:text-slate-200"><X className="w-4 h-4" /></Button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 space-y-2">
                            {activeQuantDrillDown.loading ? <Loader2 className="w-6 h-6 animate-spin mx-auto text-blue-500" /> :
                                activeQuantDrillDown.entries.map((e, i) => (
                                    <div key={e.id} className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded border border-slate-100 dark:border-slate-700 text-sm text-slate-700 dark:text-slate-300">{e.raw_text || <em>(No text response)</em>}</div>
                                ))}
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
}
