"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useTheme } from "next-themes";
import { Badge } from "@/components/ui/badge";
import { Loader2, AlertTriangle, BarChart2, MessageSquare, Target, CheckCircle2, GitCompareArrows, Sparkles } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from "recharts";
import { toast } from "sonner";
import { useAnalysis } from "@/context/AnalysisContext";

// --- IMPORT SUB-COMPONENTS ---
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


export default function ComprehensiveDashboard({ unitId, surveyId, view = "insights" }: { unitId: string; surveyId?: string; view?: "insights" | "voices" }) {
    const dashboardRef = useRef<HTMLDivElement>(null);
    const [loading, setLoading] = useState(true);
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

    // Incoming cross-unit mentions (other units referencing this one)
    const [incomingMentions, setIncomingMentions] = useState<any>(null);
    const [incomingLoading, setIncomingLoading] = useState(false);
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

    // Filter Options & Active State
    const [filterOptions, setFilterOptions] = useState<{ locations: string[], faculties: string[], programs: string[] }>({ locations: [], faculties: [], programs: [] });
    const [activeFilters, setActiveFilters] = useState<{ sentiment: string[], location: string[], faculty: string[], program: string[], category: string[] }>({
        sentiment: [], location: [], faculty: [], program: [], category: []
    });
    const [isFilterOpen, setIsFilterOpen] = useState(false);

    // Drill-Down States
    const [activeQualDrillDown, setActiveQualDrillDown] = useState<ActiveQualDrillDown | null>(null);
    const [activeQuantDrillDown, setActiveQuantDrillDown] = useState<ActiveQuantDrillDown | null>(null);

    // Raw Data Explorer
    const [rawDataTab, setRawDataTab] = useState<"comments" | "ratings">("comments");
    const [rawDataEntries, setRawDataEntries] = useState<any[]>([]);
    const [rawDataLoading, setRawDataLoading] = useState(false);
    const [rawDataPage, setRawDataPage] = useState(0);
    const [rawDataSearch, setRawDataSearch] = useState("");
    const [rawDataTotal, setRawDataTotal] = useState(0);
    const RAW_PAGE_SIZE = 25;

    useEffect(() => {
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

    useEffect(() => {
        if (!unitId || !surveyId || isCurrentlyAnalyzing) { setIncomingMentions(null); return; }
        setIncomingLoading(true);
        fetch(`/api/executive/incoming-mentions?unitId=${unitId}&surveyId=${surveyId}`)
            .then(r => r.json())
            .then(data => setIncomingMentions(data))
            .catch(() => setIncomingMentions(null))
            .finally(() => setIncomingLoading(false));
    }, [unitId, surveyId, isCurrentlyAnalyzing]);

    // --- DATA LOADING ---

    async function fetchRawData() {
        setLoading(true);
        try {
            const [unitRes, catRes, orgRes] = await Promise.all([
                supabase.from('organization_units').select('name').eq('id', unitId).single(),
                supabase.from('analysis_categories').select('id, name').eq('unit_id', unitId),
                supabase.from('organization_units').select('id, name')
            ]);
            if (unitRes.data) setUnitName(unitRes.data.name);
            setCategories(catRes.data || []);
            setAllUnits(orgRes.data || []);

            let respMap = new Map<number, any>();
            if (surveyId) {
                const firstPage = await supabase
                    .from('respondents')
                    .select('id, location, faculty, study_program')
                    .eq('survey_id', surveyId)
                    .range(0, 999);
                (firstPage.data || []).forEach((r: any) => respMap.set(r.id, r));

                if (firstPage.data && firstPage.data.length === 1000) {
                    const { count: totalResps } = await supabase.from('respondents')
                        .select('*', { count: 'exact', head: true }).eq('survey_id', surveyId);
                    const extraPages = Math.ceil(((totalResps || 1000) - 1000) / 1000);
                    const rest = await Promise.all(
                        Array.from({ length: extraPages }, (_, i) =>
                            supabase.from('respondents')
                                .select('id, location, faculty, study_program')
                                .eq('survey_id', surveyId)
                                .range((i + 1) * 1000, (i + 2) * 1000 - 1)
                        )
                    );
                    for (const pg of rest) (pg.data || []).forEach((r: any) => respMap.set(r.id, r));
                }
            }
            const respIds = Array.from(respMap.keys());

            const CHUNK = 200;
            const fetchByRespondentChunks = async (
                select: string,
                filterFn: (q: any) => any
            ): Promise<any[]> => {
                let allData: any[] = [];

                if (respIds.length > 0) {
                    const MAX_CONCURRENT = 5;
                    const chunks: number[][] = [];
                    for (let i = 0; i < respIds.length; i += CHUNK) chunks.push(respIds.slice(i, i + CHUNK));

                    for (let b = 0; b < chunks.length; b += MAX_CONCURRENT) {
                        const batch = chunks.slice(b, b + MAX_CONCURRENT);
                        const results = await Promise.all(batch.map(async (chunk) => {
                            let q = supabase.from('raw_feedback_inputs')
                                .select(select)
                                .eq('target_unit_id', unitId)
                                .in('respondent_id', chunk);
                            const { data, error } = await filterFn(q);
                            if (error) {
                                console.error(`🔴 Supabase chunk error:`, error);
                                toast.error(`Data fetch warning: ${error.message}`);
                                return [];
                            }
                            return data || [];
                        }));
                        for (const result of results) allData.push(...result);
                    }
                } else {
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
                        if (error) { console.error(`🔴 Supabase fallback error:`, error); break; }
                        if (!data || data.length === 0) break;
                        allData.push(...data);
                        lastId = (data as any[])[data.length - 1].id;
                        if (data.length < 100) break;
                    }
                }
                return allData;
            };

            const [qData, sData, colTypeCacheRes] = await Promise.all([
                fetchByRespondentChunks(
                    `id, respondent_id, source_column, raw_text, feedback_segments (id, segment_text, sentiment, category_id, is_suggestion, related_unit_ids)`,
                    (q) => q.eq('is_quantitative', false).eq('requires_analysis', false)
                ),
                fetchByRespondentChunks(
                    'id, respondent_id, source_column, numerical_score, raw_text',
                    (q) => q.eq('is_quantitative', true).not('numerical_score', 'is', null)
                ),
                surveyId
                    ? supabase.from('survey_column_cache').select('source_column, column_type').eq('survey_id', parseInt(surveyId))
                    : Promise.resolve({ data: [] }),
            ]);

            qData.forEach((r: any) => { r.respondents = respMap.get(r.respondent_id) || null; });
            sData.forEach((r: any) => { r.respondents = respMap.get(r.respondent_id) || null; });

            const colTypeMap = new Map<string, string>(
                ((colTypeCacheRes as any).data || [])
                    .filter((r: any) => r.column_type)
                    .map((r: any) => [r.source_column, r.column_type as string])
            );
            const colsWithSegments = new Set<string>();
            qData.forEach((r: any) => {
                if (r.feedback_segments && r.feedback_segments.length > 0) colsWithSegments.add(r.source_column);
            });
            const isTextCol = (col: string) => {
                const t = colTypeMap.get(col);
                if (t) return t === 'TEXT';
                return colsWithSegments.has(col);
            };
            const textRows = qData.filter((r: any) => isTextCol(r.source_column));
            const catRows  = qData.filter((r: any) => !isTextCol(r.source_column));

            const allInputIds = textRows.map((r: any) => r.id);
            const STAT_CHUNK = 500;
            const statChunks: number[][] = [];
            for (let i = 0; i < allInputIds.length; i += STAT_CHUNK) statChunks.push(allInputIds.slice(i, i + STAT_CHUNK));

            if (statChunks.length > 0) {
                const statResults = await Promise.all(
                    statChunks.map(chunk => Promise.all([
                        supabase.from('feedback_segments').select('*', { count: 'exact', head: true }).eq('is_verified', true).in('raw_input_id', chunk),
                        supabase.from('feedback_segments').select('*', { count: 'exact', head: true }).in('raw_input_id', chunk)
                    ]))
                );
                let vCount = 0, tSegCount = 0;
                for (const [vRes, tRes] of statResults) {
                    vCount += vRes.count || 0;
                    tSegCount += tRes.count || 0;
                }
                setVerifiedCount(vCount);
                setTotalSegmentCount(tSegCount);
            } else {
                setVerifiedCount(0);
                setTotalSegmentCount(0);
            }

            setBaseRawInputs(textRows);
            setBaseScores(sData);
            setBaseCatScores(catRows);

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

                r.feedback_segments?.forEach((s: any) => {
                    const catName = catMap.get(s.category_id) || "Uncategorized";
                    if (catName === "Uncategorized") return;

                    if (!catCountsMap[s.category_id]) {
                        catCountsMap[s.category_id] = { category_name: catName, positive_count: 0, negative_count: 0, neutral_count: 0, total: 0, true_negative_count: 0 };
                    }
                    if (s.sentiment === 'Negative') catCountsMap[s.category_id].true_negative_count += 1;

                    if (activeFilters.sentiment.length && !activeFilters.sentiment.includes(s.sentiment)) return;
                    if (activeFilters.category.length && !activeFilters.category.includes(catName)) return;

                    totalSegments++;
                    sentimentCounts[s.sentiment as keyof typeof sentimentCounts] += 1;

                    const sentL = s.sentiment.toLowerCase();
                    if (catCountsMap[s.category_id][`${sentL}_count`] !== undefined) {
                        catCountsMap[s.category_id][`${sentL}_count`] += 1;
                    }
                    catCountsMap[s.category_id].total += 1;

                    if (!facCountsMap[facName]) {
                        facCountsMap[facName] = { faculty_name: facName, positive: 0, neutral: 0, negative: 0, total: 0 };
                    }
                    if (s.sentiment === 'Positive') facCountsMap[facName].positive += 1;
                    if (s.sentiment === 'Neutral') facCountsMap[facName].neutral += 1;
                    if (s.sentiment === 'Negative') facCountsMap[facName].negative += 1;
                    facCountsMap[facName].total += 1;

                    sampleSegments.push({ ...s, category_name: catName });

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
                const maxVal = Math.max(...g.chartData.map(d => parseFloat(d.name)));
                g.chartData.forEach(d => {
                    const val = parseFloat(d.name);
                    const weight = d.value;
                    gSum += val * weight;
                    if (maxVal <= 1) {
                        d.color = val === 0 ? "#f43f5e" : "#10b981";
                    } else {
                        if (val <= 1) d.color = "#ef4444";
                        else if (val === 2) d.color = "#f59e0b";
                        else if (val === 3) d.color = "#84cc16";
                        else d.color = "#22c55e";
                    }
                });
                g.average = g.totalResponses > 0 ? (gSum / g.totalResponses).toFixed(2) : "0.00";
                g.chartData.sort((a, b) => parseFloat(a.name) - parseFloat(b.name));
                if (maxVal > 1) { totalSum += gSum; totalCount += g.totalResponses; }
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

    const pieData = [
        { name: 'Positive', value: sentimentCounts.Positive, color: '#22c55e' },
        { name: 'Neutral',  value: sentimentCounts.Neutral,  color: '#94a3b8' },
        { name: 'Negative', value: sentimentCounts.Negative, color: '#ef4444' },
    ];

    const facultyChartData = [...(dashboardMetrics?.faculty_counts || [])].sort((a, b) => b.positive - a.positive);

    // --- HANDLERS ---
    const handleQualDrillDown = (data: any) => {
        if (data?.activePayload?.length > 0) {
            setActiveQualDrillDown({ category: data.activeLabel, sentiment: data.activePayload[0].name });
        }
    };

    const handleQuantDrillDown = async (question: string, type: "SCORE" | "CATEGORY", filterValue: string) => {
        setActiveQuantDrillDown({ question, filterValue, type, entries: [], loading: true });
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
            let filtered = allSegments;
            if (search) filtered = filtered.filter(s => s.segment_text?.toLowerCase().includes(search.toLowerCase()));
            setRawDataTotal(filtered.length);
            setRawDataEntries(filtered.slice(from, to + 1));
        } else {
            let filtered = baseScores.filter((r: any) => {
                const resp = r.respondents;
                if (!resp) return false;
                const matchLoc = activeFilters.location.length === 0 || activeFilters.location.includes(resp.location);
                const matchFac = activeFilters.faculty.length === 0 || activeFilters.faculty.includes(resp.faculty);
                const matchProg = activeFilters.program.length === 0 || activeFilters.program.includes(resp.study_program);
                if (!matchLoc || !matchFac || !matchProg) return false;
                if (search && !(r.source_column?.toLowerCase().includes(search.toLowerCase())) && !(r.raw_text?.toLowerCase().includes(search.toLowerCase()))) return false;
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

    if (isCurrentlyAnalyzing) return (
        <div className="flex flex-col items-center justify-center py-20 space-y-4">
            <Loader2 className="w-10 h-10 animate-spin text-indigo-600" />
            <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-200">Analysis In Progress ({analysisProgress.percentage}%)</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">Processing {analysisProgress.processed} / {analysisProgress.total} comments. Insights will load automatically once complete.</p>
        </div>
    );

    if (loading) return (
        <div className="flex justify-center py-20 text-slate-400">
            <Loader2 className="w-8 h-8 animate-spin mr-2" /> Loading Analysis...
        </div>
    );

    return (
        <div ref={dashboardRef} className={`relative space-y-5 animate-in fade-in pb-20 transition-all duration-300 ${isFiltering ? 'opacity-60 blur-sm pointer-events-none' : ''}`}>

            {isFiltering && (
                <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center pointer-events-none">
                    <Loader2 className="w-10 h-10 animate-spin text-indigo-600 mb-3 drop-shadow-md" />
                    <span className="font-semibold text-indigo-900 bg-white/80 px-4 py-1 rounded-full shadow-sm">Applying Filters…</span>
                </div>
            )}

            {/* Filter bar — shown on both views */}
            <DashboardFilters
                isFilterOpen={isFilterOpen}
                setIsFilterOpen={setIsFilterOpen}
                activeFilters={activeFilters}
                setActiveFilters={setActiveFilters}
                filterOptions={filterOptions}
                categories={categories}
            />

            {/* ─── INSIGHTS VIEW ─── */}
            {view === "insights" && (
                <div className="space-y-5">

                    {/* Hero strip */}
                    <div className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 rounded-2xl p-7 shadow-lg">
                        <div className="absolute -top-10 -right-10 w-56 h-56 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none" />
                        <div className="absolute -bottom-8 left-1/3 w-40 h-40 bg-violet-500/15 rounded-full blur-3xl pointer-events-none" />
                        <div className="relative grid grid-cols-1 lg:grid-cols-4 gap-4 items-stretch">

                            {/* Sentiment score */}
                            <div className="lg:col-span-1 flex flex-col justify-center py-2 pr-4 lg:border-r lg:border-white/10">
                                <p className="text-xs font-semibold text-indigo-300 uppercase tracking-widest mb-3">Sentiment Score</p>
                                <div className="flex items-end gap-3">
                                    <span className="text-7xl font-black text-white leading-none tabular-nums">{sentimentScore}</span>
                                    <div className="mb-1 space-y-1">
                                        <span className="text-2xl text-indigo-300 font-light">/100</span>
                                        <p className={`text-xs font-semibold ${sentimentScore >= 70 ? "text-emerald-400" : sentimentScore >= 40 ? "text-amber-400" : "text-red-400"}`}>
                                            {sentimentScore >= 70 ? "Excellent" : sentimentScore >= 40 ? "Moderate" : "Needs Focus"}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Avg Rating */}
                            <div className="bg-white/5 rounded-xl p-5 border border-white/10 flex flex-col justify-between">
                                <div className="flex items-center gap-2">
                                    <BarChart2 className="w-4 h-4 text-blue-400 shrink-0" />
                                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Avg. Rating</p>
                                </div>
                                <p className="text-4xl font-black text-white mt-3 tabular-nums">
                                    {globalAvgScore}<span className="text-lg font-normal text-slate-400">/4.0</span>
                                </p>
                                <p className="text-xs text-slate-500 mt-2">{quantGroups.filter(g => g.type === "SCORE").length} score metrics</p>
                            </div>

                            {/* Comments */}
                            <div className="bg-white/5 rounded-xl p-5 border border-white/10 flex flex-col justify-between">
                                <div className="flex items-center gap-2">
                                    <MessageSquare className="w-4 h-4 text-violet-400 shrink-0" />
                                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Comments</p>
                                </div>
                                <p className="text-4xl font-black text-white mt-3 tabular-nums">{baseRawInputs.length.toLocaleString()}</p>
                                <div className="mt-2 space-y-0.5">
                                    <p className="text-xs text-slate-500">
                                        {totalSegmentCount.toLocaleString()} segments ·{" "}
                                        <span className="text-emerald-400">{verifiedCount.toLocaleString()} verified</span>
                                    </p>
                                </div>
                            </div>

                            {/* Top Issue */}
                            <div className="bg-red-900/30 rounded-xl p-5 border border-red-800/40 flex flex-col justify-between">
                                <div className="flex items-center gap-2">
                                    <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                                    <p className="text-xs font-semibold text-red-300 uppercase tracking-wider">Top Issue</p>
                                </div>
                                <p className="text-lg font-bold text-white mt-3 leading-snug line-clamp-2">{topNegativeCategory.name}</p>
                                <p className="text-xs text-red-300/70 mt-2">
                                    {topNegativeCategory.count} negative
                                    {sentimentCounts.Negative > 0 && ` (${Math.round(topNegativeCategory.count / sentimentCounts.Negative * 100)}% of all)`}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Sentiment Analysis band */}
                    <div className="bg-indigo-50/60 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/40 rounded-2xl p-5 space-y-5">
                        <div className="flex items-center gap-2">
                            <Sparkles className="w-4 h-4 text-indigo-500" />
                            <h2 className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 uppercase tracking-widest">Sentiment Analysis</h2>
                        </div>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                            {/* Donut pie */}
                            <div className="bg-white dark:bg-slate-900 rounded-xl border border-indigo-100 dark:border-indigo-900/40 p-4">
                                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Overall Distribution</p>
                                <div style={{ height: 260 }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie data={pieData} cx="50%" cy="50%" innerRadius={65} outerRadius={95} paddingAngle={4} dataKey="value" stroke={isDark ? "#0f172a" : "#ffffff"} strokeWidth={2}>
                                                {pieData.map((entry, i) => <Cell key={i} fill={entry.color} className="hover:opacity-80 transition-opacity" />)}
                                            </Pie>
                                            <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }} itemStyle={{ color: isDark ? '#f8fafc' : '#0f172a', fontWeight: 600 }} />
                                            <Legend verticalAlign="bottom" height={30} wrapperStyle={{ color: isDark ? "#cbd5e1" : "#475569", fontWeight: 500 }} />
                                        </PieChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                            {/* Faculty breakdown */}
                            {facultyChartData.length > 0 ? (
                                <div className="bg-white dark:bg-slate-900 rounded-xl border border-indigo-100 dark:border-indigo-900/40 p-4">
                                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">By Faculty</p>
                                    <div style={{ height: Math.max(260, facultyChartData.length * 36 + 40) }}>
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={facultyChartData} layout="vertical" margin={{ top: 0, right: 20, bottom: 0, left: 0 }}>
                                                <CartesianGrid strokeDasharray="3 3" horizontal vertical={false} stroke={isDark ? "#334155" : "#f1f5f9"} />
                                                <XAxis type="number" tick={{ fontSize: 10, fill: isDark ? "#94a3b8" : "#64748b" }} axisLine={false} tickLine={false} />
                                                <YAxis dataKey="faculty_name" type="category" width={180} tick={{ fontSize: 10, fill: isDark ? "#cbd5e1" : "#475569" }} axisLine={false} tickLine={false} />
                                                <Tooltip cursor={{ fill: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)' }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }} />
                                                <Legend verticalAlign="top" height={30} wrapperStyle={{ color: isDark ? "#cbd5e1" : "#475569", fontWeight: 500 }} />
                                                <Bar dataKey="positive" name="Positive" stackId="a" fill="#22c55e" />
                                                <Bar dataKey="neutral"  name="Neutral"  stackId="a" fill="#94a3b8" />
                                                <Bar dataKey="negative" name="Negative" stackId="a" fill="#ef4444" radius={[0, 3, 3, 0]} />
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>
                            ) : (
                                <div className="bg-white dark:bg-slate-900 rounded-xl border border-indigo-100 dark:border-indigo-900/40 p-4 flex items-center justify-center text-slate-400 text-sm">
                                    No faculty breakdown available
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Performance Metrics band */}
                    {quantGroups.length > 0 && (
                        <div className="bg-sky-50/60 dark:bg-sky-950/20 border border-sky-100 dark:border-sky-900/40 rounded-2xl p-5 space-y-5">
                            <div className="flex items-center gap-2">
                                <BarChart2 className="w-4 h-4 text-sky-500" />
                                <h2 className="text-xs font-semibold text-sky-700 dark:text-sky-300 uppercase tracking-widest">Performance Metrics</h2>
                                <span className="text-xs text-slate-400 dark:text-slate-500 ml-1">Satisfaction scores and categorical distributions</span>
                            </div>
                            <DashboardQuantView quantGroups={quantGroups} handleQuantDrillDown={handleQuantDrillDown} />
                        </div>
                    )}

                    {/* Incoming mentions band */}
                    {surveyId && (incomingLoading || (incomingMentions && incomingMentions.total_mentions > 0)) && (
                        <div className="bg-amber-50/60 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/40 rounded-2xl p-5 space-y-4">
                            <div className="flex items-center gap-2">
                                <GitCompareArrows className="w-4 h-4 text-amber-500" />
                                <h2 className="text-xs font-semibold text-amber-700 dark:text-amber-300 uppercase tracking-widest">Mentioned By Other Units</h2>
                                {!incomingLoading && incomingMentions && (
                                    <span className="ml-1 px-2 py-0.5 text-[10px] font-bold bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 rounded-full">
                                        {incomingMentions.total_mentions} mention{incomingMentions.total_mentions !== 1 ? "s" : ""}
                                    </span>
                                )}
                            </div>
                            {incomingLoading ? (
                                <div className="flex items-center gap-2 text-slate-400 py-2">
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    <span className="text-sm">Loading incoming mentions…</span>
                                </div>
                            ) : incomingMentions?.sources?.length > 0 ? (
                                <div className="bg-white dark:bg-slate-900 rounded-xl border border-amber-100 dark:border-amber-900/30 p-4 space-y-3">
                                    <p className="text-xs text-slate-500 dark:text-slate-400">
                                        Feedback from other units' respondents that referenced {unitName}. These are issues or praises directed at this unit but captured in a different unit's analysis.
                                    </p>
                                    <div className="space-y-2">
                                        {incomingMentions.sources.map((src: any) => {
                                            const posPct = src.total > 0 ? (src.positive / src.total) * 100 : 0;
                                            const negPct = src.total > 0 ? (src.negative / src.total) * 100 : 0;
                                            const neuPct = src.total > 0 ? (src.neutral / src.total) * 100 : 0;
                                            return (
                                                <div key={src.source_unit_id} className="flex items-center gap-3 py-1">
                                                    <span className="text-sm text-slate-700 dark:text-slate-300 w-44 shrink-0 truncate" title={src.source_unit_name}>{src.source_unit_name}</span>
                                                    <div className="flex-1 h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden flex">
                                                        <div className="h-full bg-emerald-500" style={{ width: `${posPct}%` }} />
                                                        <div className="h-full bg-slate-300 dark:bg-slate-600" style={{ width: `${neuPct}%` }} />
                                                        <div className="h-full bg-red-500" style={{ width: `${negPct}%` }} />
                                                    </div>
                                                    <span className="text-xs font-bold text-slate-500 dark:text-slate-400 w-8 text-right tabular-nums shrink-0">{src.total}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    <div className="flex gap-4 pt-2 text-[11px] text-slate-400 border-t border-amber-100 dark:border-amber-900/30">
                                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />{incomingMentions.positive_count} positive</span>
                                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-slate-300 dark:bg-slate-600 inline-block" />{incomingMentions.neutral_count} neutral</span>
                                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" />{incomingMentions.negative_count} negative</span>
                                        <span className="ml-auto">{incomingMentions.source_unit_count} source unit{incomingMentions.source_unit_count !== 1 ? "s" : ""}</span>
                                    </div>
                                </div>
                            ) : null}
                        </div>
                    )}
                </div>
            )}

            {/* ─── VOICES VIEW ─── */}
            {view === "voices" && (
                <div className="space-y-6">
                    <DashboardQualView
                        catCounts={catCounts}
                        handleQualDrillDown={handleQualDrillDown}
                        crossUnitSegments={crossUnitSegments}
                    />
                    <RawDataExplorer
                        rawDataTab={rawDataTab}
                        setRawDataTab={setRawDataTab}
                        showRawData={true}
                        setShowRawData={() => {}}
                        rawDataPage={rawDataPage}
                        setRawDataPage={setRawDataPage}
                        rawDataSearch={rawDataSearch}
                        setRawDataSearch={setRawDataSearch}
                        rawDataLoading={rawDataLoading}
                        rawDataEntries={rawDataEntries}
                        rawDataTotal={rawDataTotal}
                        RAW_PAGE_SIZE={RAW_PAGE_SIZE}
                    />
                </div>
            )}

            {/* Drill-down modals — shared across both views */}
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
