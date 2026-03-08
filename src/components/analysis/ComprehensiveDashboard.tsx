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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import UnitInsightChat from "./UnitInsightChat";
import { useAnalysis } from "@/context/AnalysisContext";

// --- IMPORT NEW SUB-COMPONENTS ---
import DashboardFilters from "./DashboardFilters";
import DashboardQualView from "./DashboardQualView";
import DashboardQuantView from "./DashboardQuantView";
import RawDataExplorer from "./RawDataExplorer";
import DrillDownModal, { ActiveQuantDrillDown, ActiveQualDrillDown } from "./DrillDownModal";

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


export default function ComprehensiveDashboard({ unitId, surveyId }: { unitId: string; surveyId?: string }) {
    const dashboardRef = useRef<HTMLDivElement>(null);
    const [loading, setLoading] = useState(true);
    const [exportingPdf, setExportingPdf] = useState(false);
    const { theme, systemTheme } = useTheme();
    const isDark = theme === "dark" || (theme === "system" && systemTheme === "dark");
    const { isAnalyzing, currentUnitId, progress: analysisProgress } = useAnalysis();
    const isCurrentlyAnalyzing = isAnalyzing && currentUnitId === unitId;

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
    const [verifiedCount, setVerifiedCount] = useState(0);
    const [totalSegmentCount, setTotalSegmentCount] = useState(0);

    // Aggregated Metrics from RPC
    const [dashboardMetrics, setDashboardMetrics] = useState<{
        total_segments: number;
        sentiment_counts: { Positive: number; Negative: number; Neutral: number };
        category_counts: any[];
        faculty_counts: any[];
    } | null>(null);

    // Quantitative
    const [quantGroups, setQuantGroups] = useState<QuestionGroup[]>([]);
    const [globalAvgScore, setGlobalAvgScore] = useState<string>("N/A");

    const [generatingReport, setGeneratingReport] = useState(false);
    const [lastSaved, setLastSaved] = useState<string | null>(null);

    // Filter Options & Active State
    const [filterOptions, setFilterOptions] = useState<{ locations: string[], faculties: string[], programs: string[] }>({ locations: [], faculties: [], programs: [] });
    const [activeFilters, setActiveFilters] = useState<{ sentiment: string[], location: string[], faculty: string[], program: string[] }>({
        sentiment: [], location: [], faculty: [], program: []
    });
    const [isFilterOpen, setIsFilterOpen] = useState(false);

    // Drill-Down States
    const [activeQualDrillDown, setActiveQualDrillDown] = useState<ActiveQualDrillDown | null>(null);
    const [activeQuantDrillDown, setActiveQuantDrillDown] = useState<ActiveQuantDrillDown | null>(null);

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
        // Don't load data while analysis is running
        if (isCurrentlyAnalyzing) return;
        fetchRawData();
    }, [unitId, surveyId, isCurrentlyAnalyzing]);

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

            // 2. Pre-fetch respondent IDs for this survey (uses idx_respondents_survey_id)
            let respMap = new Map<number, any>();
            if (surveyId) {
                let rPage = 0;
                while (true) {
                    const { data: rBat } = await supabase
                        .from('respondents')
                        .select('id, location, faculty, study_program')
                        .eq('survey_id', surveyId)
                        .range(rPage * 1000, (rPage + 1) * 1000 - 1);
                    if (!rBat || rBat.length === 0) break;
                    rBat.forEach((r: any) => respMap.set(r.id, r));
                    if (rBat.length < 1000) break;
                    rPage++;
                }
            }
            const respIds = Array.from(respMap.keys());

            // 3. Chunked fetch helper — uses respondent IDs to leverage composite index
            // Chunk size 50: keeps URL under Supabase REST API length limit 
            // (300 IDs × URL encoding = too long, causes 500 errors)
            const CHUNK = 200;
            const fetchByRespondentChunks = async (
                select: string,
                filterFn: (q: any) => any
            ): Promise<any[]> => {
                let allData: any[] = [];

                if (respIds.length > 0) {
                    // With survey: chunk by respondent IDs (fast, uses idx_rfi_respondent_unit_analysis)
                    for (let i = 0; i < respIds.length; i += CHUNK) {
                        const chunk = respIds.slice(i, i + CHUNK);
                        let q = supabase.from('raw_feedback_inputs')
                            .select(select)
                            .eq('target_unit_id', unitId)
                            .in('respondent_id', chunk);
                        q = filterFn(q);
                        const { data, error } = await q;
                        if (error) {
                            console.error(`🔴 Supabase chunk error:`, error);
                            toast.error(`Data fetch warning: ${error.message}`);
                            continue;
                        }
                        if (data) allData.push(...data);
                    }
                } else {
                    // No survey: keyset pagination fallback
                    let lastId = 0;
                    while (true) {
                        let q = supabase.from('raw_feedback_inputs')
                            .select(select)
                            .eq('target_unit_id', unitId)
                            .gt('id', lastId)
                            .order('id', { ascending: true })
                            .limit(100);
                        q = filterFn(q);
                        const { data, error } = await q;
                        if (error) {
                            console.error(`🔴 Supabase fallback error:`, error);
                            break;
                        }
                        if (!data || data.length === 0) break;
                        allData.push(...data);
                        lastId = (data as any[])[data.length - 1].id;
                        if (data.length < 100) break;
                    }
                }
                return allData;
            };

            // 4. Fetch qualitative data (with segments) and quantitative data in parallel
            const [qData, sData] = await Promise.all([
                fetchByRespondentChunks(
                    `id, respondent_id, source_column, raw_text, feedback_segments (id, segment_text, sentiment, category_id, is_suggestion, related_unit_ids)`,
                    (q) => q.eq('is_quantitative', false).eq('requires_analysis', false)
                ),
                fetchByRespondentChunks(
                    'id, respondent_id, source_column, numerical_score, raw_text',
                    (q) => q.eq('is_quantitative', true).not('numerical_score', 'is', null)
                )
            ]);

            // Attach respondent info
            qData.forEach((r: any) => { r.respondents = respMap.get(r.respondent_id) || null; });
            sData.forEach((r: any) => { r.respondents = respMap.get(r.respondent_id) || null; });

            console.log(`✅ Loaded: ${qData.length} qualitative, ${sData.length} quantitative`);

            // 5. Fetch verification stats
            const allInputIds = qData.map((r: any) => r.id);
            let vCount = 0;
            let tSegCount = 0;
            for (let i = 0; i < allInputIds.length; i += 200) {
                const chunk = allInputIds.slice(i, i + 200);
                const [vRes, tRes] = await Promise.all([
                    supabase.from('feedback_segments').select('*', { count: 'exact', head: true }).eq('is_verified', true).in('raw_input_id', chunk),
                    supabase.from('feedback_segments').select('*', { count: 'exact', head: true }).in('raw_input_id', chunk)
                ]);
                vCount += (vRes.count || 0);
                tSegCount += (tRes.count || 0);
            }
            setVerifiedCount(vCount);
            setTotalSegmentCount(tSegCount);

            // csData is the same rows as qData (qualitative non-quant), just used for categorical score grouping
            // No need for a separate fetch — reuse qData
            setBaseRawInputs(qData);
            setBaseScores(sData);
            setBaseCatScores(qData);

        } catch (error) {
            console.error(error);
            toast.error("Failed to load full dataset. Metrics may be truncated.");
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

            let facCountsMap: Record<string, any> = {};

            filteredInputs.forEach((r: any) => {
                const facName = r.respondents?.faculty_short_name || r.respondents?.faculty || "Unknown Faculty";

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

                    // Aggregate Faculty Sentiments
                    if (!facCountsMap[facName]) {
                        facCountsMap[facName] = { faculty_name: facName, positive: 0, neutral: 0, negative: 0, total: 0 };
                    }
                    if (s.sentiment === 'Positive') facCountsMap[facName].positive += 1;
                    if (s.sentiment === 'Neutral') facCountsMap[facName].neutral += 1;
                    if (s.sentiment === 'Negative') facCountsMap[facName].negative += 1;
                    facCountsMap[facName].total += 1;

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
                category_counts: Object.values(catCountsMap),
                faculty_counts: Object.values(facCountsMap)
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

    const facultyChartData = [...(dashboardMetrics?.faculty_counts || [])]
        .sort((a, b) => b.positive - a.positive);

    // --- HANDLERS ---
    const handleQualDrillDown = (data: any) => {
        if (data && data.activePayload && data.activePayload.length > 0) {
            setActiveQualDrillDown({ category: data.activeLabel, sentiment: data.activePayload[0].name });
        }
    };

    const handleQuantDrillDown = async (question: string, type: "SCORE" | "CATEGORY", filterValue: string) => {
        setActiveQuantDrillDown({ question, filterValue, type, entries: [], loading: true });

        // Use the memory array baseScores instead of querying the DB
        let filtered = baseScores.filter((r: any) => r.source_column === question);

        if (type === "SCORE") {
            const numVal = parseFloat(filterValue);
            filtered = filtered.filter((r: any) => r.numerical_score === numVal);
        } else {
            filtered = filtered.filter((r: any) => r.raw_text === filterValue);
        }

        setActiveQuantDrillDown(prev => prev ? { ...prev, entries: filtered.slice(0, 50), loading: false } : null);
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
            // Local pagination memory for Quantitative Data
            let filtered = baseScores.filter((r: any) => {
                const resp = r.respondents;
                if (!resp) return false;

                const matchLoc = activeFilters.location.length === 0 || activeFilters.location.includes(resp.location);
                const matchFac = activeFilters.faculty.length === 0 || activeFilters.faculty.includes(resp.faculty);
                const matchProg = activeFilters.program.length === 0 || activeFilters.program.includes(resp.study_program);

                if (!matchLoc || !matchFac || !matchProg) return false;

                if (search && !(r.source_column && r.source_column.toLowerCase().includes(search.toLowerCase())) && !(r.raw_text && r.raw_text.toLowerCase().includes(search.toLowerCase()))) return false;

                return true;
            });

            setRawDataTotal(filtered.length);
            setRawDataEntries(filtered.slice(from, to + 1));
        }
        setRawDataLoading(false);
    }, [unitId, surveyId, allSegments]);

    useEffect(() => {
        loadRawData(rawDataTab, rawDataPage, rawDataSearch);
    }, [rawDataTab, rawDataPage, rawDataSearch, loadRawData]);

    const exportToPdf = () => {
        toast.info("Preparing PDF... Please follow the browser print dialog.");
        setTimeout(() => {
            window.print();
        }, 500);
    };

    if (isCurrentlyAnalyzing) return (
        <div className="flex flex-col items-center justify-center py-20 space-y-4">
            <Loader2 className="w-10 h-10 animate-spin text-indigo-600" />
            <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-200">Analysis In Progress ({analysisProgress.percentage}%)</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">Processing {analysisProgress.processed} / {analysisProgress.total} comments. Insights will load automatically once complete.</p>
        </div>
    );

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
            <DashboardFilters
                isFilterOpen={isFilterOpen}
                setIsFilterOpen={setIsFilterOpen}
                activeFilters={activeFilters}
                setActiveFilters={setActiveFilters}
                filterOptions={filterOptions}
            />

            {/* --- SUB TABS NAVIGATION --- */}
            <Tabs defaultValue="overview" className="w-full space-y-6">
                <TabsList className="grid w-full grid-cols-4 bg-slate-200/50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 p-0 h-12 shadow-sm rounded-xl overflow-hidden print:hidden">
                    <TabsTrigger value="overview" className="h-full rounded-none gap-2 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-950 data-[state=active]:text-indigo-700 data-[state=active]:shadow-sm">
                        <Target className="w-4 h-4" /> Overview
                    </TabsTrigger>
                    <TabsTrigger value="qualitative" className="h-full rounded-none gap-2 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-950 data-[state=active]:text-pink-700 data-[state=active]:shadow-sm">
                        <MessageSquare className="w-4 h-4" /> Qualitative Insights
                    </TabsTrigger>
                    <TabsTrigger value="quantitative" className="h-full rounded-none gap-2 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-950 data-[state=active]:text-blue-700 data-[state=active]:shadow-sm">
                        <BarChart2 className="w-4 h-4" /> Performance Metrics
                    </TabsTrigger>
                    <TabsTrigger value="rawdata" className="h-full rounded-none gap-2 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-950 data-[state=active]:text-slate-700 dark:data-[state=active]:text-slate-300 data-[state=active]:shadow-sm">
                        <Table2 className="w-4 h-4" /> Raw Data Explorer
                    </TabsTrigger>
                </TabsList>

                {/* TAB A: OVERVIEW */}
                <TabsContent value="overview" className="space-y-8 focus-visible:ring-0">
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
                            <CardHeader className="pb-2"><CardDescription className="font-medium text-slate-500 dark:text-slate-300">Analyzed Comments</CardDescription><CardTitle className="text-4xl font-bold text-slate-800 dark:text-slate-100">{baseRawInputs.length.toLocaleString()}</CardTitle></CardHeader>
                            <CardContent>
                                <div className="flex flex-col gap-1">
                                    <div className="text-xs text-indigo-600 dark:text-indigo-400 flex items-center gap-1 font-medium"><MessageSquare className="w-3 h-3" /> {totalSegmentCount.toLocaleString()} segments extracted</div>
                                    <div className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1 font-medium"><CheckCircle2 className="w-3 h-3" /> {verifiedCount.toLocaleString()} / {totalSegmentCount.toLocaleString()} verified ({totalSegmentCount > 0 ? Math.round(verifiedCount / totalSegmentCount * 100) : 0}%)</div>
                                    <div className="text-xs text-blue-600 dark:text-blue-400 flex items-center gap-1 font-medium"><BarChart2 className="w-3 h-3" /> {quantGroups.reduce((a, b) => a + b.totalResponses, 0).toLocaleString()} quantitative data points</div>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Hot Spot */}
                        <Card className="border-red-100 dark:border-red-900/30 shadow-md bg-red-50/50 dark:bg-red-950/20 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors print:break-inside-avoid">
                            <CardHeader className="pb-2"><CardDescription className="font-medium text-red-600 dark:text-red-400 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Top Issue</CardDescription><CardTitle className="text-2xl font-bold text-red-900 dark:text-red-200 leading-tight md:text-xl line-clamp-2">{topNegativeCategory.name}</CardTitle></CardHeader>
                            <CardContent><div className="text-xs text-red-700 dark:text-red-400/80"><strong>{topNegativeCategory.count}</strong> negative comments {sentimentCounts.Negative > 0 && <span className="text-red-500 dark:text-red-500/70">({Math.round(topNegativeCategory.count / sentimentCounts.Negative * 100)}% of all negatives)</span>}</div></CardContent>
                        </Card>
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

                    {/* --- OVERALL SENTIMENT OVERVIEW --- */}
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

                    {/* --- FACULTY SENTIMENT DISTRIBUTION --- */}
                    {facultyChartData.length > 0 && (
                        <div className="space-y-4 pt-4">
                            <div className="flex items-center gap-2 pb-2 border-b border-slate-200 dark:border-slate-800">
                                <Target className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                                <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Sentiment Distribution by Faculty</h2>
                            </div>
                            <Card className="shadow-md border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                                <CardContent className="pt-6 relative" style={{ height: Math.max(300, facultyChartData.length * 40 + 60) + 'px' }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={facultyChartData} layout="vertical" margin={{ top: 0, right: 30, bottom: 0, left: 0 }}>
                                            <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke={isDark ? "#334155" : "#f1f5f9"} />
                                            <XAxis type="number" tick={{ fontSize: 11, fill: isDark ? "#94a3b8" : "#64748b" }} axisLine={false} tickLine={false} />
                                            <YAxis dataKey="faculty_name" type="category" width={200} tick={{ fontSize: 11, fill: isDark ? "#cbd5e1" : "#475569" }} axisLine={false} tickLine={false} />
                                            <Tooltip
                                                cursor={{ fill: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)' }}
                                                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                            />
                                            <Legend verticalAlign="top" height={36} wrapperStyle={{ color: isDark ? "#cbd5e1" : "#475569", fontWeight: 500, paddingBottom: '20px' }} />
                                            <Bar dataKey="positive" name="Positive" stackId="a" fill="#22c55e" radius={[0, 0, 0, 0]} />
                                            <Bar dataKey="neutral" name="Neutral" stackId="a" fill="#94a3b8" radius={[0, 0, 0, 0]} />
                                            <Bar dataKey="negative" name="Negative" stackId="a" fill="#ef4444" radius={[0, 4, 4, 0]} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </CardContent>
                            </Card>
                        </div>
                    )}
                </TabsContent>

                {/* TAB B: QUALITATIVE INSIGHTS */}
                <TabsContent value="qualitative" className="focus-visible:ring-0">
                    <DashboardQualView
                        catCounts={catCounts}
                        handleQualDrillDown={handleQualDrillDown}
                        crossUnitSegments={crossUnitSegments}
                    />
                </TabsContent>

                {/* TAB C: QUANTITATIVE PERFORMANCE */}
                <TabsContent value="quantitative" className="focus-visible:ring-0">
                    <DashboardQuantView
                        quantGroups={quantGroups}
                        handleQuantDrillDown={handleQuantDrillDown}
                    />
                </TabsContent>

                {/* TAB D: RAW DATA EXPLORER */}
                <TabsContent value="rawdata" className="focus-visible:ring-0">
                    <RawDataExplorer
                        rawDataTab={rawDataTab}
                        setRawDataTab={setRawDataTab}
                        showRawData={true} // Always open in its dedicated tab
                        setShowRawData={() => { }} // Not toggleable when in its own tab
                        rawDataPage={rawDataPage}
                        setRawDataPage={setRawDataPage}
                        rawDataSearch={rawDataSearch}
                        setRawDataSearch={setRawDataSearch}
                        rawDataLoading={rawDataLoading}
                        rawDataEntries={rawDataEntries}
                        rawDataTotal={rawDataTotal}
                        RAW_PAGE_SIZE={RAW_PAGE_SIZE}
                    />
                </TabsContent>

            </Tabs>

            {/* --- DRILL DOWN MODALS --- */}
            <DrillDownModal
                activeQuantDrillDown={activeQuantDrillDown}
                setActiveQuantDrillDown={setActiveQuantDrillDown}
                activeQualDrillDown={activeQualDrillDown}
                setActiveQualDrillDown={setActiveQualDrillDown}
                allSegments={allSegments}
            />
        </div>
    );
}
