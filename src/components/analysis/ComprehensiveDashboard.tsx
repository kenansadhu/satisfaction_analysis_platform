"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { useTheme } from "next-themes";
import { Badge } from "@/components/ui/badge";
import { Loader2, AlertTriangle, BarChart2, MessageSquare, Target, CheckCircle2, Sparkles } from "lucide-react";
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

    const [unitName, setUnitName] = useState("");
    const [verifiedCount, setVerifiedCount] = useState(0);
    const [totalSegmentCount, setTotalSegmentCount] = useState(0);
    const [fastInputCount, setFastInputCount] = useState<number | null>(null);
    const insightsInitialized = useRef(false);

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
    // Per-column subgroup assignment loaded from survey_column_cache. Drives the
    // subgroup-aware per-respondent macro that computes the unit's headline SSI.
    const [subgroupByColumn, setSubgroupByColumn] = useState<Map<string, string | null>>(new Map());
    const [displayGroupByColumn, setDisplayGroupByColumn] = useState<Map<string, string | null>>(new Map());

    // Filter Options & Active State
    const [filterOptions, setFilterOptions] = useState<{ locations: string[], faculties: string[], programs: string[] }>({ locations: [], faculties: [], programs: [] });
    const [activeFilters, setActiveFilters] = useState<{ sentiment: string[], location: string[], faculty: string[], program: string[], category: string[] }>({
        sentiment: [], location: [], faculty: [], program: [], category: []
    });
    const [isFilterOpen, setIsFilterOpen] = useState(true);

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
    const [rawDataSuggestionOnly, setRawDataSuggestionOnly] = useState(false);
    const RAW_PAGE_SIZE = 25;

    useEffect(() => {
        if (isCurrentlyAnalyzing) return;
        insightsInitialized.current = false;
        if (view === "insights") {
            fetchInsightsMetrics();
        } else {
            fetchRawData();
        }
    }, [unitId, surveyId, isCurrentlyAnalyzing]);

    // Insights: re-fetch from server API when filters change
    useEffect(() => {
        if (view !== "insights" || !insightsInitialized.current) return;
        const timer = setTimeout(() => fetchInsightsMetrics(true), 60);
        return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeFilters]);

    // Voices: re-aggregate client-side when filters change
    useEffect(() => {
        if (view === "insights") return;
        if (!baseRawInputs.length && !baseScores.length && !baseCatScores.length) return;
        setIsFiltering(true);
        const timer = setTimeout(() => {
            applyFiltersAndMetrics();
            setRawDataPage(0);
            setIsFiltering(false);
        }, 30);
        return () => clearTimeout(timer);
    }, [activeFilters, baseRawInputs, baseScores, baseCatScores, subgroupByColumn]);

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
            // Paginate within each respondent chunk to dodge Supabase's silent
            // 1000-row response cap. For a unit with ~10 questions × 200 respondents
            // that's ~2000 rows per query, which would otherwise be truncated and
            // give an undercounted globalAvgScore.
            const PAGE = 1000;
            const fetchByRespondentChunks = async (
                select: string,
                filterFn: (q: any) => any
            ): Promise<any[]> => {
                let allData: any[] = [];

                if (respIds.length > 0) {
                    const MAX_CONCURRENT = 5;
                    const chunks: number[][] = [];
                    for (let i = 0; i < respIds.length; i += CHUNK) chunks.push(respIds.slice(i, i + CHUNK));

                    const fetchChunkAllPages = async (chunk: number[]): Promise<any[]> => {
                        const out: any[] = [];
                        let from = 0;
                        while (true) {
                            let q = supabase.from('raw_feedback_inputs')
                                .select(select)
                                .eq('target_unit_id', unitId)
                                .in('respondent_id', chunk)
                                .range(from, from + PAGE - 1);
                            const { data, error } = await filterFn(q);
                            if (error) {
                                console.error(`🔴 Supabase chunk error:`, error);
                                toast.error(`Data fetch warning: ${error.message}`);
                                break;
                            }
                            const rows = data || [];
                            out.push(...rows);
                            if (rows.length < PAGE) break;
                            from += PAGE;
                        }
                        return out;
                    };

                    for (let b = 0; b < chunks.length; b += MAX_CONCURRENT) {
                        const batch = chunks.slice(b, b + MAX_CONCURRENT);
                        const results = await Promise.all(batch.map(fetchChunkAllPages));
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
                    ? supabase.from('survey_column_cache').select('source_column, column_type, subgroup_name, display_group').eq('survey_id', parseInt(surveyId))
                    : Promise.resolve({ data: [] }),
            ]);

            qData.forEach((r: any) => { r.respondents = respMap.get(r.respondent_id) || null; });
            sData.forEach((r: any) => { r.respondents = respMap.get(r.respondent_id) || null; });

            const colTypeMap = new Map<string, string>(
                ((colTypeCacheRes as any).data || [])
                    .filter((r: any) => r.column_type)
                    .map((r: any) => [r.source_column, r.column_type as string])
            );
            // Subgroup map drives the per-respondent macro roll-up below.
            // null = column is its own implicit single-column bucket.
            const subgroupMap = new Map<string, string | null>(
                ((colTypeCacheRes as any).data || [])
                    .map((r: any) => [r.source_column, r.subgroup_name ?? null])
            );
            setSubgroupByColumn(subgroupMap);
            const displayGroupMap = new Map<string, string | null>(
                ((colTypeCacheRes as any).data || [])
                    .map((r: any) => [r.source_column, r.display_group ?? null])
            );
            setDisplayGroupByColumn(displayGroupMap);
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

    // ── Fast insights path: one server-side API call instead of chunked client fetches ──
    async function fetchInsightsMetrics(skipFullLoader = false) {
        if (skipFullLoader) setIsFiltering(true);
        else setLoading(true);
        setFastInputCount(null);
        try {
            const params = new URLSearchParams({ unitId, surveyId: surveyId! });
            activeFilters.location.forEach(v => params.append("location", v));
            activeFilters.faculty.forEach(v => params.append("faculty", v));
            activeFilters.program.forEach(v => params.append("program", v));
            activeFilters.sentiment.forEach(v => params.append("sentiment", v));
            activeFilters.category.forEach(v => params.append("category", v));

            const [unitRes, catRes, orgRes, json] = await Promise.all([
                supabase.from("organization_units").select("name").eq("id", unitId).single(),
                supabase.from("analysis_categories").select("id, name").eq("unit_id", unitId),
                supabase.from("organization_units").select("id, name"),
                fetch(`/api/unit-insights/agg-metrics?${params}`).then(r => r.json()),
            ]);

            if (unitRes.data) setUnitName(unitRes.data.name);
            setCategories(catRes.data || []);
            setAllUnits(orgRes.data || []);

            setDashboardMetrics({
                total_segments: json.total_segments,
                sentiment_counts: json.sentiment_counts,
                category_counts: json.category_counts,
                faculty_counts: json.faculty_counts,
            });
            setQuantGroups(json.quant_groups || []);
            setGlobalAvgScore(json.global_avg_score ?? "N/A");
            setTotalSegmentCount(json.total_segments);
            setFastInputCount(json.total_text_inputs);

            const displayGroupMap = new Map<string, string | null>(
                (json.col_type_cache || []).map((r: any) => [r.source_column, r.display_group ?? null])
            );
            setDisplayGroupByColumn(displayGroupMap);
            const subgroupMapNew = new Map<string, string | null>(
                (json.col_type_cache || []).map((r: any) => [r.source_column, r.subgroup_name ?? null])
            );
            setSubgroupByColumn(subgroupMapNew);

            setFilterOptions(json.filter_options || { locations: [], faculties: [], programs: [] });

            insightsInitialized.current = true;
        } catch (e) {
            console.error("fetchInsightsMetrics error:", e);
        } finally {
            setLoading(false);
            setIsFiltering(false);
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
                                tagged_units: otherNames,
                                related_unit_ids: s.related_unit_ids as number[]
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

            // Compute per-question max so we can identify SSI-included (Likert,
            // 1 < max ≤ 5) columns. Also colour the chart bars by score band.
            const includedCols = new Set<string>();
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
                if (maxVal > 1 && maxVal <= 5) includedCols.add(g.question);
            });

            // Headline SSI = per-respondent macro with subgroup-aware bucketing
            // (same methodology as the Executive Report tab):
            //   per respondent → bucket their answers by subgroup_name (unassigned
            //     cols are single-column buckets keyed by source_column)
            //   bucket avg = mean of their answers in that bucket
            //   respondent's unit score = mean of bucket avgs
            //   unit SSI = mean of per-respondent unit scores
            const respBuckets = new Map<number, Map<string, { sum: number; n: number }>>();
            scores?.forEach(row => {
                if (!includedCols.has(row.source_column)) return;
                // subgroupByColumn is component state set during initial data fetch
                // (this filter callback reruns whenever filters change but the
                // subgroup mapping is per-survey, not per-filter).
                const sub = subgroupByColumn.get(row.source_column) ?? null;
                const bucket = sub ?? `__col__::${row.source_column}`;
                if (!respBuckets.has(row.respondent_id)) respBuckets.set(row.respondent_id, new Map());
                const buckets = respBuckets.get(row.respondent_id)!;
                if (!buckets.has(bucket)) buckets.set(bucket, { sum: 0, n: 0 });
                const b = buckets.get(bucket)!;
                b.sum += row.numerical_score;
                b.n++;
            });
            const respScores: number[] = [];
            for (const [, buckets] of respBuckets) {
                let sumOfBucketAvgs = 0;
                let bucketCount = 0;
                for (const [, b] of buckets) {
                    if (b.n === 0) continue;
                    sumOfBucketAvgs += b.sum / b.n;
                    bucketCount++;
                }
                if (bucketCount === 0) continue;
                respScores.push(sumOfBucketAvgs / bucketCount);
            }
            if (respScores.length > 0) {
                const m = respScores.reduce((s, v) => s + v, 0) / respScores.length;
                setGlobalAvgScore(m.toFixed(2));
            } else {
                setGlobalAvgScore("N/A");
            }

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

    // Pick up to 4 representative student quotes for the voices summary card.
    // Aims for variety: one per top category, balanced across sentiments.
    const summaryQuotes: any[] = [];
    if (allSegments.length > 0) {
        const topCats = Object.values(catCounts)
            .filter((c: any) => c.total > 0)
            .sort((a: any, b: any) => b.total - a.total)
            .slice(0, 8)
            .map((c: any) => c.name);
        const addedCats = new Set<string>();
        const sentBudget: Record<string, number> = { Positive: 0, Negative: 0, Neutral: 0 };
        for (const catName of topCats) {
            if (summaryQuotes.length >= 4) break;
            if (addedCats.has(catName)) continue;
            const catSegs = allSegments.filter(s =>
                s.category_name === catName &&
                typeof s.segment_text === 'string' &&
                s.segment_text.length > 40 &&
                s.segment_text.length < 320
            );
            if (catSegs.length === 0) continue;
            const neededSent = Object.entries(sentBudget).sort(([, a], [, b]) => a - b)[0][0];
            const picked = catSegs.find(s => s.sentiment === neededSent) || catSegs[0];
            summaryQuotes.push(picked);
            addedCats.add(catName);
            sentBudget[picked.sentiment]++;
        }
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
            if (rawDataSuggestionOnly) filtered = filtered.filter((s: any) => s.is_suggestion);
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
    }, [unitId, surveyId, allSegments, rawDataSuggestionOnly]);

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

            {/* ─── INSIGHTS VIEW ─── */}
            {view === "insights" && (
                <div className="space-y-5">

                    {/* Hero strip — above filter */}
                    <div className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 rounded-2xl p-7 shadow-lg">
                        <div className="absolute -top-10 -right-10 w-56 h-56 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none" />
                        <div className="absolute -bottom-8 left-1/3 w-40 h-40 bg-violet-500/15 rounded-full blur-3xl pointer-events-none" />
                        <div className="relative grid grid-cols-1 lg:grid-cols-4 gap-4 items-stretch">

                            {/* Sentiment score */}
                            <div className="lg:col-span-1 flex flex-col justify-center py-2 pr-4 lg:border-r lg:border-white/10">
                                <p className="text-xs font-semibold text-indigo-300 uppercase tracking-widest mb-3">Sentiment Score</p>
                                <div className="flex items-end gap-3">
                                    <span className={`text-7xl font-black leading-none tabular-nums ${sentimentScore >= 70 ? "text-emerald-400" : sentimentScore >= 40 ? "text-amber-400" : "text-red-400"}`}>{sentimentScore}</span>
                                    <div className="mb-1 space-y-1">
                                        <span className="text-2xl text-indigo-300 font-light">/100</span>
                                        <p className={`text-xs font-semibold ${sentimentScore >= 70 ? "text-emerald-400" : sentimentScore >= 40 ? "text-amber-400" : "text-red-400"}`}>
                                            {sentimentScore >= 70 ? "Excellent" : sentimentScore >= 40 ? "Moderate" : "Needs Focus"}
                                        </p>
                                    </div>
                                </div>
                                <p className="text-[10px] text-indigo-300/30 mt-2">pos%×1 · neu%×0.5 · neg%×0</p>
                                <p className="text-[10px] text-indigo-300/30 mt-0.5">≥70 excellent · 40–69 moderate · &lt;40 needs focus</p>
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
                                <p className="text-4xl font-black text-white mt-3 tabular-nums">{(fastInputCount ?? baseRawInputs.length).toLocaleString()}</p>
                                <div className="mt-2 space-y-0.5">
                                    <p className="text-xs text-slate-500">
                                        {totalSegmentCount.toLocaleString()} segments analyzed
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

                    {/* Filter bar — below hero */}
                    <DashboardFilters
                        isFilterOpen={isFilterOpen}
                        setIsFilterOpen={setIsFilterOpen}
                        activeFilters={activeFilters}
                        setActiveFilters={setActiveFilters}
                        filterOptions={filterOptions}
                        categories={categories}
                    />

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
                            <DashboardQuantView quantGroups={quantGroups} handleQuantDrillDown={handleQuantDrillDown} displayGroupByColumn={displayGroupByColumn} />
                        </div>
                    )}

                </div>
            )}

            {/* ─── VOICES VIEW ─── */}
            {view === "voices" && (
                <div className="space-y-6">

                    {/* Filter bar */}
                    <DashboardFilters
                        isFilterOpen={isFilterOpen}
                        setIsFilterOpen={setIsFilterOpen}
                        activeFilters={activeFilters}
                        setActiveFilters={setActiveFilters}
                        filterOptions={filterOptions}
                        categories={categories}
                    />

                    {/* ── What Students Are Saying (summary card) ── */}
                    {summaryQuotes.length > 0 && (
                        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
                            <div className="h-1 bg-gradient-to-r from-pink-500 via-rose-400 to-fuchsia-500" />
                            <div className="p-5 space-y-4">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <MessageSquare className="w-4 h-4 text-pink-500" />
                                            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">What Students Are Saying</h2>
                                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-pink-50 dark:bg-pink-950/40 text-pink-600 dark:text-pink-400 border border-pink-100 dark:border-pink-900/50">
                                                {summaryQuotes.length} samples
                                            </span>
                                        </div>
                                        <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 ml-6">Representative quotes from top feedback categories</p>
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                                    {summaryQuotes.map((q, i) => {
                                        const sentStyle = q.sentiment === "Positive"
                                            ? { border: "border-l-emerald-400", bg: "bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800", badge: "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800", dot: "bg-emerald-500" }
                                            : q.sentiment === "Negative"
                                            ? { border: "border-l-red-400", bg: "bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800", badge: "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800", dot: "bg-red-500" }
                                            : { border: "border-l-slate-300 dark:border-l-slate-600", bg: "bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800", badge: "bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700", dot: "bg-slate-400" };
                                        const text = q.segment_text.length > 180 ? q.segment_text.slice(0, 177) + "…" : q.segment_text;
                                        return (
                                            <div key={i} className={`border-l-4 ${sentStyle.border} ${sentStyle.bg} rounded-r-xl px-4 py-3.5 space-y-2`}>
                                                <div className="flex items-center flex-wrap gap-1.5">
                                                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${sentStyle.badge}`}>
                                                        <span className={`w-1.5 h-1.5 rounded-full ${sentStyle.dot}`} />{q.sentiment}
                                                    </span>
                                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-900/50">
                                                        {q.category_name}
                                                    </span>
                                                </div>
                                                <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed italic">&ldquo;{text}&rdquo;</p>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Sentiment by Category — before Student Voices */}
                    <DashboardQualView
                        catCounts={catCounts}
                        handleQualDrillDown={handleQualDrillDown}
                        crossUnitSegments={crossUnitSegments}
                        allUnits={allUnits}
                        unitId={unitId}
                        surveyId={surveyId}
                        section="chart"
                    />

                    {/* Student Voices */}
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
                        suggestionOnly={rawDataSuggestionOnly}
                        setSuggestionOnly={setRawDataSuggestionOnly}
                        hideRatings={true}
                        categories={categories}
                        catCounts={catCounts}
                        activeCategories={activeFilters.category}
                        onCategoryToggle={catName => setActiveFilters(p => ({
                            ...p,
                            category: p.category.includes(catName)
                                ? p.category.filter(x => x !== catName)
                                : [...p.category, catName]
                        }))}
                        onCategoryClear={() => setActiveFilters(p => ({ ...p, category: [] }))}
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
