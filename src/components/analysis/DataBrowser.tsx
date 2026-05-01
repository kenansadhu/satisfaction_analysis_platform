"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Search, Lightbulb, Filter, ChevronLeft, ChevronRight, CheckCircle2, Circle, ListChecks, ShieldCheck } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ConfirmDialog";

type Segment = {
    id: number;
    segment_text: string;
    sentiment: string;
    category_id: number | null;
    is_suggestion: boolean;
    is_verified: boolean;
};

type FeedbackRow = {
    id: number;
    raw_text: string;
    segments: Segment[];
};

import { useAnalysis } from "@/context/AnalysisContext";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2 } from "lucide-react";

export default function DataBrowser({ unitId, surveyId }: { unitId: string; surveyId?: string }) {
    const { isAnalyzing, currentUnitId, progress } = useAnalysis();
    const [rows, setRows] = useState<FeedbackRow[]>([]);
    const [categories, setCategories] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterText, setFilterText] = useState("");
    const [debouncedFilter, setDebouncedFilter] = useState("");

    // Pagination State
    const [page, setPage] = useState(0);
    const [totalCount, setTotalCount] = useState(0);
    const PAGE_SIZE = 50;

    // Verification State
    const [verifiedCount, setVerifiedCount] = useState(0);
    const [totalSegments, setTotalSegments] = useState(0);
    const [verificationFilter, setVerificationFilter] = useState<"all" | "unverified" | "verified">("all");
    const [showVerifyConfirm, setShowVerifyConfirm] = useState(false);

    // Cache refs — avoid redundant DB round-trips on page turns.
    // respIds only change when surveyId changes; inputIds only change when unit/survey/filter changes.
    const respIdsCacheRef = useRef<{ key: string; ids: number[] } | null>(null);
    const inputIdsCacheRef = useRef<{ key: string; ids: number[] } | null>(null);

    useEffect(() => {
        loadCategories();
        // Invalidate caches whenever the context changes
        respIdsCacheRef.current = null;
        inputIdsCacheRef.current = null;
    }, [unitId, surveyId]);

    // Debounce search input (300ms)
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedFilter(filterText);
            setPage(0);
        }, 300);
        return () => clearTimeout(timer);
    }, [filterText]);

    useEffect(() => {
        // Don't load data while analysis is running — show wait overlay instead
        if (isAnalyzing && currentUnitId === unitId) return;
        loadData();
    }, [unitId, surveyId, page, debouncedFilter, verificationFilter, isAnalyzing, currentUnitId]);

    // When analysis finishes (transition from analyzing→done), reload everything
    const wasAnalyzingRef = useRef(false);
    useEffect(() => {
        if (isAnalyzing && currentUnitId === unitId) {
            wasAnalyzingRef.current = true;
        } else if (wasAnalyzingRef.current) {
            wasAnalyzingRef.current = false;
            // Invalidate caches — new segments may have been added
            respIdsCacheRef.current = null;
            inputIdsCacheRef.current = null;
            loadData();
            loadCategories();
        }
    }, [isAnalyzing]);

    async function loadCategories() {
        const { data } = await supabase.from('analysis_categories').select('*').eq('unit_id', unitId);
        if (data) setCategories(data);
    }

    async function loadData() {
        setLoading(true);

        // ── Step 1: Respondent IDs (cached per surveyId) ───────────────────────
        // For 8k respondents this was 8+ sequential round-trips; now it's 1-2 parallel calls.
        const respCacheKey = surveyId || 'all';
        let respIds: number[] = [];
        if (surveyId) {
            if (respIdsCacheRef.current?.key === respCacheKey) {
                respIds = respIdsCacheRef.current.ids;
            } else {
                const firstPage = await supabase.from('respondents').select('id').eq('survey_id', surveyId).range(0, 999);
                respIds = (firstPage.data || []).map((r: any) => r.id);
                if (firstPage.data && firstPage.data.length === 1000) {
                    const { count: totalResps } = await supabase.from('respondents')
                        .select('*', { count: 'exact', head: true }).eq('survey_id', surveyId);
                    const extraPages = Math.ceil(((totalResps || 1000) - 1000) / 1000);
                    const rest = await Promise.all(
                        Array.from({ length: extraPages }, (_, i) =>
                            supabase.from('respondents').select('id').eq('survey_id', surveyId)
                                .range((i + 1) * 1000, (i + 2) * 1000 - 1)
                        )
                    );
                    for (const pg of rest) respIds.push(...(pg.data || []).map((r: any) => r.id));
                }
                respIdsCacheRef.current = { key: respCacheKey, ids: respIds };
            }
        }

        // ── Step 2: All matching input IDs (cached per unit+survey+filter) ──────
        // Page turns skip this entirely and use the cached array.
        const inputCacheKey = `${unitId}|${surveyId}|${debouncedFilter}`;
        let inputIds: number[];

        if (inputIdsCacheRef.current?.key === inputCacheKey) {
            inputIds = inputIdsCacheRef.current.ids;
            setTotalCount(inputIds.length);
        } else {
            const CHUNK = 500;
            let collectedIds: number[] = [];

            if (surveyId && respIds.length > 0) {
                // Split into chunks and query ALL chunks in parallel instead of sequentially
                const chunks: number[][] = [];
                for (let i = 0; i < respIds.length; i += CHUNK) chunks.push(respIds.slice(i, i + CHUNK));

                const chunkResults = await Promise.all(chunks.map(async (chunk) => {
                    const ids: number[] = [];
                    let iPage = 0;
                    while (true) {
                        let q = supabase.from('raw_feedback_inputs')
                            .select('id, feedback_segments!inner(id)')
                            .eq('target_unit_id', unitId)
                            .eq('requires_analysis', false)
                            .in('respondent_id', chunk)
                            .range(iPage * 1000, (iPage + 1) * 1000 - 1);
                        if (debouncedFilter) q = q.ilike('raw_text', `%${debouncedFilter}%`);
                        const { data } = await q;
                        if (!data || data.length === 0) break;
                        ids.push(...data.map((d: any) => d.id));
                        if (data.length < 1000) break;
                        iPage++;
                    }
                    return ids;
                }));
                collectedIds = chunkResults.flat();
            } else if (!surveyId) {
                let iPage = 0;
                while (true) {
                    let q = supabase.from('raw_feedback_inputs')
                        .select('id, feedback_segments!inner(id)')
                        .eq('target_unit_id', unitId)
                        .eq('requires_analysis', false)
                        .range(iPage * 1000, (iPage + 1) * 1000 - 1);
                    if (debouncedFilter) q = q.ilike('raw_text', `%${debouncedFilter}%`);
                    const { data } = await q;
                    if (!data || data.length === 0) break;
                    collectedIds.push(...data.map((d: any) => d.id));
                    if (data.length < 1000) break;
                    iPage++;
                }
            }

            inputIds = Array.from(new Set(collectedIds)).sort((a, b) => a - b);
            inputIdsCacheRef.current = { key: inputCacheKey, ids: inputIds };
            setTotalCount(inputIds.length);

            // Verification stats — all chunks fired simultaneously instead of sequentially
            const STAT_CHUNK = 500;
            const statChunks: number[][] = [];
            for (let i = 0; i < inputIds.length; i += STAT_CHUNK) statChunks.push(inputIds.slice(i, i + STAT_CHUNK));

            if (statChunks.length > 0) {
                const statResults = await Promise.all(
                    statChunks.map(chunk => Promise.all([
                        supabase.from('feedback_segments').select('*', { count: 'exact', head: true }).in('raw_input_id', chunk),
                        supabase.from('feedback_segments').select('*', { count: 'exact', head: true }).in('raw_input_id', chunk).eq('is_verified', true)
                    ]))
                );
                let totalSegs = 0, verifiedSegs = 0;
                for (const [tRes, vRes] of statResults) {
                    totalSegs += tRes.count || 0;
                    verifiedSegs += vRes.count || 0;
                }
                setTotalSegments(totalSegs);
                setVerifiedCount(verifiedSegs);
            } else {
                setTotalSegments(0);
                setVerifiedCount(0);
            }
        }

        // ── Step 3: Fetch current page (always fresh — just 50 rows, 1 DB call) ─
        const pageInputIds = inputIds.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
        let rawData: any[] = [];
        if (pageInputIds.length > 0) {
            const { data } = await supabase
                .from('raw_feedback_inputs')
                .select(`
                    id,
                    raw_text,
                    respondent_id,
                    feedback_segments (
                        id,
                        segment_text,
                        sentiment,
                        category_id,
                        is_suggestion,
                        is_verified
                    )
                `)
                .in('id', pageInputIds)
                .order('id', { ascending: true });

            rawData = data || [];
        }

        let cleanRows = rawData.map((r: any) => ({
            ...r,
            segments: r.feedback_segments.filter((s: any) => s.segment_text.length > 1 && s.segment_text !== "-")
        })).filter((r: any) => r.segments.length > 0);

        // Apply verification filter (client-side — totalCount intentionally reflects unfiltered total)
        if (verificationFilter === "unverified") {
            cleanRows = cleanRows.map((r: any) => ({
                ...r,
                segments: r.segments.filter((s: any) => !s.is_verified)
            })).filter((r: any) => r.segments.length > 0);
        } else if (verificationFilter === "verified") {
            cleanRows = cleanRows.map((r: any) => ({
                ...r,
                segments: r.segments.filter((s: any) => s.is_verified)
            })).filter((r: any) => r.segments.length > 0);
        }

        setRows(cleanRows);
        setLoading(false);
    }

    // --- ACTIONS ---

    const updateCategory = async (segmentId: number, newCatId: string) => {
        setRows(prev => prev.map(r => ({
            ...r, segments: r.segments.map(s => s.id === segmentId ? { ...s, category_id: parseInt(newCatId) } : s)
        })));
        await supabase.from('feedback_segments').update({ category_id: parseInt(newCatId) }).eq('id', segmentId);
    };

    const updateSentiment = async (segmentId: number, current: string) => {
        const next = current === "Positive" ? "Negative" : current === "Negative" ? "Neutral" : "Positive";
        setRows(prev => prev.map(r => ({
            ...r, segments: r.segments.map(s => s.id === segmentId ? { ...s, sentiment: next } : s)
        })));
        await supabase.from('feedback_segments').update({ sentiment: next }).eq('id', segmentId);
    };

    const toggleSuggestion = async (segmentId: number, current: boolean) => {
        const next = !current;
        setRows(prev => prev.map(r => ({
            ...r, segments: r.segments.map(s => s.id === segmentId ? { ...s, is_suggestion: next } : s)
        })));
        await supabase.from('feedback_segments').update({ is_suggestion: next }).eq('id', segmentId);
    };

    const toggleVerified = async (segmentId: number, current: boolean) => {
        const next = !current;
        setRows(prev => prev.map(r => ({
            ...r, segments: r.segments.map(s => s.id === segmentId ? { ...s, is_verified: next } : s)
        })));
        await supabase.from('feedback_segments').update({ is_verified: next }).eq('id', segmentId);
        setVerifiedCount(prev => next ? prev + 1 : prev - 1);
    };

    const verifyAllOnPage = async () => {
        const segmentIds = rows.flatMap(r => r.segments.filter(s => !s.is_verified).map(s => s.id));
        if (segmentIds.length === 0) {
            toast.info("All segments on this page are already verified!");
            return;
        }

        // Optimistic UI update
        setRows(prev => prev.map(r => ({
            ...r, segments: r.segments.map(s => ({ ...s, is_verified: true }))
        })));
        setVerifiedCount(prev => prev + segmentIds.length);

        // Batch DB update
        const BATCH = 200;
        for (let i = 0; i < segmentIds.length; i += BATCH) {
            const chunk = segmentIds.slice(i, i + BATCH);
            await supabase.from('feedback_segments').update({ is_verified: true }).in('id', chunk);
        }

        toast.success(`Verified ${segmentIds.length} segments on this page!`);
    };

    const getSentimentColor = (s: string) => {
        if (s === "Positive") return "bg-green-100 text-green-700 border-green-200 hover:bg-green-200";
        if (s === "Negative") return "bg-red-100 text-red-700 border-red-200 hover:bg-red-200";
        return "bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200";
    };

    const getCategoryName = (catId: number | null) => {
        if (!catId) return null;
        return categories.find(c => c.id === catId)?.name || null;
    };

    const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFilterText(e.target.value);
        setPage(0);
    };

    const totalPages = Math.ceil(totalCount / PAGE_SIZE);
    const verificationPct = totalSegments > 0 ? Math.round((verifiedCount / totalSegments) * 100) : 0;

    return (
        <div className="space-y-5 animate-in fade-in">
            {isAnalyzing && currentUnitId === unitId && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-8 text-center space-y-4">
                    <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto" />
                    <div>
                        <h3 className="text-lg font-semibold text-blue-800">Analysis In Progress ({progress.percentage}%)</h3>
                        <p className="text-sm text-blue-600 mt-1">Processing {progress.processed} / {progress.total} comments. Results will appear here automatically once analysis is complete.</p>
                    </div>
                </div>
            )}

            {/* QA Progress Bar */}
            <div className="bg-white rounded-lg border shadow-sm p-4 space-y-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <ShieldCheck className={`w-5 h-5 ${verificationPct === 100 ? "text-green-600" : "text-slate-400"}`} />
                        <span className="text-sm font-semibold text-slate-700">QA Verification Progress</span>
                    </div>
                    <div className="text-sm text-slate-500">
                        <span className="font-bold text-slate-700">{verifiedCount.toLocaleString()}</span> / {totalSegments.toLocaleString()} segments verified
                        <span className="ml-2 font-semibold text-slate-600">({verificationPct}%)</span>
                    </div>
                </div>
                <Progress
                    value={verificationPct}
                    className={`h-2 ${verificationPct === 100 ? "[&>div]:bg-green-500" : "[&>div]:bg-blue-500"}`}
                />
                {verificationPct === 100 && totalSegments > 0 && (
                    <p className="text-xs text-green-600 font-medium flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> All segments have been verified by QA!
                    </p>
                )}
            </div>

            {/* Toolbar */}
            <div className="bg-white rounded-lg border shadow-sm sticky top-0 z-10 divide-y divide-slate-100">

                {/* Row 1: Search + Filter + Verify */}
                <div className="flex items-center gap-3 px-4 py-3">
                    <div className="relative flex-1 max-w-sm">
                        <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                        <Input
                            placeholder="Search comments..."
                            value={filterText}
                            onChange={handleSearch}
                            className="pl-9"
                        />
                    </div>

                    <div className="h-5 w-px bg-slate-200" />

                    <div className="flex items-center gap-2">
                        <Filter className="w-4 h-4 text-slate-400 shrink-0" />
                        <Select value={verificationFilter} onValueChange={(v) => { setVerificationFilter(v as any); setPage(0); }}>
                            <SelectTrigger className="h-8 w-[160px] text-xs">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Segments</SelectItem>
                                <SelectItem value="unverified">Unverified Only</SelectItem>
                                <SelectItem value="verified">Verified Only</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="text-xs gap-1.5 border-green-200 text-green-700 hover:bg-green-50 hover:border-green-300 ml-auto"
                                    onClick={() => setShowVerifyConfirm(true)}
                                >
                                    <ListChecks className="w-3.5 h-3.5" /> Verify Page
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                                <p>Mark all segments on this page as verified</p>
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                </div>

                {/* Row 2: Record count + Jump to + Page buttons */}
                <div className="flex items-center justify-between gap-4 px-4 py-2 bg-slate-50/60">
                    <span className="text-xs text-slate-500 whitespace-nowrap">
                        Showing <span className="font-semibold text-slate-700">{totalCount > 0 ? page * PAGE_SIZE + 1 : 0}–{Math.min((page + 1) * PAGE_SIZE, totalCount)}</span> of <span className="font-semibold text-slate-700">{totalCount}</span> comments
                    </span>

                    <div className="flex items-center gap-3">
                        {/* Jump to page */}
                        <div className="flex items-center gap-1.5">
                            <span className="text-xs text-slate-400">Go to</span>
                            <Input
                                type="number"
                                min={1}
                                max={totalPages}
                                className="w-14 h-7 text-xs p-1 px-2"
                                placeholder="pg"
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        const val = parseInt((e.target as HTMLInputElement).value);
                                        if (!isNaN(val) && val >= 1 && val <= totalPages) {
                                            setPage(val - 1);
                                        }
                                    }
                                }}
                            />
                        </div>

                        <div className="h-4 w-px bg-slate-200" />

                        {/* Prev / page numbers / Next */}
                        <div className="flex items-center gap-1">
                            <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setPage(0)} disabled={page === 0}>
                                <ChevronLeft className="w-3.5 h-3.5 mr-[-3px]" /><ChevronLeft className="w-3.5 h-3.5 ml-[-3px]" />
                            </Button>
                            <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}>
                                <ChevronLeft className="w-3.5 h-3.5" />
                            </Button>

                            <div className="flex items-center gap-1 mx-1">
                                {Array.from({ length: totalPages }, (_, i) => i)
                                    .filter(p => p === 0 || p === totalPages - 1 || Math.abs(p - page) <= 2)
                                    .map((p, idx, arr) => (
                                        <div key={p} className="flex items-center gap-1">
                                            {idx > 0 && arr[idx] !== arr[idx - 1] + 1 && (
                                                <span className="text-slate-300 px-0.5 text-xs">…</span>
                                            )}
                                            <Button
                                                variant={page === p ? "default" : "outline"}
                                                size="sm"
                                                className={`h-7 w-7 p-0 text-xs ${page === p ? "bg-blue-600 hover:bg-blue-700" : ""}`}
                                                onClick={() => setPage(p)}
                                            >
                                                {p + 1}
                                            </Button>
                                        </div>
                                    ))
                                }
                            </div>

                            <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}>
                                <ChevronRight className="w-3.5 h-3.5" />
                            </Button>
                            <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setPage(totalPages - 1)} disabled={page >= totalPages - 1}>
                                <ChevronRight className="w-3.5 h-3.5 mr-[-3px]" /><ChevronRight className="w-3.5 h-3.5 ml-[-3px]" />
                            </Button>
                        </div>
                    </div>
                </div>
            </div>

            {/* The Data Table */}
            <div className="border rounded-lg bg-white overflow-hidden shadow-sm">
                <Table className="table-fixed w-full">
                    <TableHeader>
                        <TableRow className="bg-slate-50 border-b border-slate-200">
                            <TableHead className="w-[35%] px-6 py-4">Original Comment</TableHead>
                            <TableHead className="w-[65%] px-6 py-4">Analysis Segments</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRow><TableCell colSpan={2} className="text-center py-20 text-slate-400">Loading data...</TableCell></TableRow>
                        ) : rows.length === 0 ? (
                            <TableRow><TableCell colSpan={2} className="text-center py-20 text-slate-400">No results found.</TableCell></TableRow>
                        ) : (
                            rows.map((row) => (
                                <TableRow key={row.id} className="group hover:bg-slate-50/50 align-top border-b border-slate-100 last:border-0">

                                    {/* 1. Original Text */}
                                    <TableCell className="align-top py-6 px-6 border-r border-slate-100">
                                        <div className="text-sm text-slate-600 italic whitespace-pre-wrap break-words leading-relaxed">
                                            &quot;{row.raw_text}&quot;
                                        </div>
                                    </TableCell>

                                    {/* 2. Analysis Segments */}
                                    <TableCell className="align-top py-6 px-6 space-y-3">
                                        {row.segments.map(seg => (
                                            <div
                                                key={seg.id}
                                                className={`flex flex-col sm:flex-row sm:items-start gap-3 p-3 rounded-lg shadow-sm transition-all duration-200
                                                    ${seg.is_verified
                                                        ? "bg-green-50/50 border border-green-200 border-l-[3px] border-l-green-400"
                                                        : "bg-white border border-slate-200 hover:border-blue-300"
                                                    }`}
                                            >

                                                {/* Left Controls */}
                                                <div className="flex gap-2 shrink-0 items-center">
                                                    {/* Suggestion Toggle */}
                                                    <TooltipProvider>
                                                        <Tooltip>
                                                            <TooltipTrigger asChild>
                                                                <Button
                                                                    variant="ghost" size="icon"
                                                                    className={`h-8 w-8 border ${seg.is_suggestion ? "text-amber-600 bg-amber-50 border-amber-200" : "text-slate-300 border-transparent hover:border-slate-300"}`}
                                                                    onClick={() => toggleSuggestion(seg.id, seg.is_suggestion)}
                                                                >
                                                                    <Lightbulb className={`w-4 h-4 ${seg.is_suggestion ? "fill-current" : ""}`} />
                                                                </Button>
                                                            </TooltipTrigger>
                                                            <TooltipContent><p>Suggestion / Action Item</p></TooltipContent>
                                                        </Tooltip>
                                                    </TooltipProvider>

                                                    {/* Sentiment Badge */}
                                                    <Badge
                                                        variant="outline"
                                                        className={`cursor-pointer h-8 px-3 justify-center select-none ${getSentimentColor(seg.sentiment)}`}
                                                        onClick={() => updateSentiment(seg.id, seg.sentiment)}
                                                    >
                                                        {seg.sentiment}
                                                    </Badge>
                                                </div>

                                                {/* Middle: Content */}
                                                <div className="flex-1 min-w-0 space-y-2">
                                                    <div className="text-sm font-medium text-slate-900 whitespace-pre-wrap break-words leading-relaxed">
                                                        {seg.segment_text}
                                                    </div>

                                                    {/* Category Dropdown */}
                                                    <div className="pt-1">
                                                        <Select
                                                            value={seg.category_id?.toString() || "null"}
                                                            onValueChange={(val) => updateCategory(seg.id, val)}
                                                        >
                                                            <SelectTrigger className="h-8 w-full sm:w-[320px] text-xs bg-purple-50/50 border-purple-200 text-purple-700 hover:bg-purple-50 hover:border-purple-300 focus:ring-purple-200 transition-colors rounded-full px-3">
                                                                <SelectValue />
                                                            </SelectTrigger>
                                                            <SelectContent className="max-w-[400px]">
                                                                <SelectItem value="null" className="text-slate-400 italic">Uncategorized</SelectItem>
                                                                {categories.map(c => (
                                                                    <SelectItem key={c.id} value={c.id.toString()} className="text-sm">{c.name}</SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>
                                                    </div>
                                                </div>

                                                {/* Right: Verification Checkmark */}
                                                <div className="shrink-0 flex items-start">
                                                    <TooltipProvider>
                                                        <Tooltip>
                                                            <TooltipTrigger asChild>
                                                                <button
                                                                    className={`flex items-center justify-center w-8 h-8 rounded-full transition-all duration-200
                                                                        ${seg.is_verified
                                                                            ? "bg-green-100 text-green-600 hover:bg-green-200 ring-1 ring-green-300"
                                                                            : "bg-slate-50 text-slate-300 hover:bg-slate-100 hover:text-slate-500 ring-1 ring-slate-200"
                                                                        }`}
                                                                    onClick={() => toggleVerified(seg.id, seg.is_verified)}
                                                                >
                                                                    {seg.is_verified
                                                                        ? <CheckCircle2 className="w-5 h-5" />
                                                                        : <Circle className="w-5 h-5" />
                                                                    }
                                                                </button>
                                                            </TooltipTrigger>
                                                            <TooltipContent>
                                                                <p>{seg.is_verified ? "Verified ✓ — Click to unverify" : "Click to mark as verified"}</p>
                                                            </TooltipContent>
                                                        </Tooltip>
                                                    </TooltipProvider>
                                                </div>
                                            </div>
                                        ))}
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>

            {/* Pagination Footer + Bottom Verify */}
            <div className="flex items-center justify-between pt-4 pb-8">
                <div className="text-xs text-slate-400">Page {page + 1} of {totalPages}</div>
                <Button
                    variant="outline"
                    size="sm"
                    className="text-xs gap-1.5 border-green-200 text-green-700 hover:bg-green-50 hover:border-green-300"
                    onClick={() => setShowVerifyConfirm(true)}
                >
                    <ListChecks className="w-3.5 h-3.5" /> Verify Page
                </Button>
            </div>

            {/* Verify Page Confirmation */}
            <ConfirmDialog
                open={showVerifyConfirm}
                onOpenChange={setShowVerifyConfirm}
                title="Verify all segments on this page?"
                description={`This will mark all ${rows.flatMap(r => r.segments.filter(s => !s.is_verified)).length} unverified segments on this page as verified. You can still unverify individual segments after.`}
                confirmLabel="Verify All"
                onConfirm={verifyAllOnPage}
            />
        </div>
    );
}
