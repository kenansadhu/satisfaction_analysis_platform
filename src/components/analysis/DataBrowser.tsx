"use client";

import { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Search, Lightbulb, ArrowRight, Filter, MinusCircle, ChevronLeft, ChevronRight } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type Segment = {
    id: number;
    segment_text: string;
    sentiment: string;
    category_id: number | null;
    is_suggestion: boolean;
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
    const PAGE_SIZE = 20;

    useEffect(() => {
        loadCategories();
    }, [unitId, surveyId]);

    // Debounce search input (300ms)
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedFilter(filterText);
            setPage(0); // Reset to first page on new search
        }, 300);
        return () => clearTimeout(timer);
    }, [filterText]);

    useEffect(() => {
        loadData();
    }, [unitId, surveyId, page, debouncedFilter]); // Reload when page or debounced filter changes

    async function loadCategories() {
        // Categories are unit-specific (likely shared across surveys for consistency, or we could scope them too?
        // Usually taxonomy is persistent. Let's keep it unit-scoped for now.)
        const { data } = await supabase.from('analysis_categories').select('*').eq('unit_id', unitId);
        if (data) setCategories(data);
    }

    async function loadData() {
        setLoading(true);

        // Build query
        let query = supabase
            .from('raw_feedback_inputs')
            .select(`
            id, 
            raw_text,
            respondents!inner(survey_id),
            feedback_segments (
                id,
                segment_text,
                sentiment,
                category_id,
                is_suggestion
            )
        `, { count: 'exact' }) // Get Total Count
            .eq('target_unit_id', unitId)
            .eq('requires_analysis', true);

        if (surveyId) {
            query = query.eq('respondents.survey_id', surveyId);
        }

        // Apply Filter if typed (Simple ILIKE for search)
        if (debouncedFilter) {
            query = query.ilike('raw_text', `%${debouncedFilter}%`);
        }

        const { data: rawData, count } = await query
            .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
            .order('id', { ascending: true });

        if (count !== null) setTotalCount(count);

        if (rawData) {
            // Filter out empty rows/noise
            const cleanRows = rawData.map((r: any) => ({
                ...r,
                segments: r.feedback_segments.filter((s: any) => s.segment_text.length > 1 && s.segment_text !== "-")
            })).filter((r: any) => r.segments.length > 0);

            setRows(cleanRows);
        }
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

    const getSentimentColor = (s: string) => {
        if (s === "Positive") return "bg-green-100 text-green-700 border-green-200 hover:bg-green-200";
        if (s === "Negative") return "bg-red-100 text-red-700 border-red-200 hover:bg-red-200";
        return "bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200";
    };

    // Debounce filter input to prevent spamming DB
    const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFilterText(e.target.value);
        setPage(0); // Reset to page 1 on search
    };

    const totalPages = Math.ceil(totalCount / PAGE_SIZE);

    return (
        <div className="space-y-6 animate-in fade-in">
            {isAnalyzing && currentUnitId === unitId && (
                <Alert className="bg-blue-50 border-blue-200 animate-pulse">
                    <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                    <AlertTitle className="text-blue-800">Analysis In Progress</AlertTitle>
                    <AlertDescription className="text-blue-700">
                        New data is being processed ({progress.percentage}%). Results shown here may be incomplete.
                    </AlertDescription>
                </Alert>
            )}

            {/* Toolbar */}
            <div className="flex justify-between items-center bg-white p-4 rounded-lg border shadow-sm sticky top-0 z-10">
                <div className="flex gap-2 w-full max-w-sm relative">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <Input
                        placeholder="Search comments..."
                        value={filterText}
                        onChange={handleSearch}
                        className="pl-9"
                    />
                </div>
                <div className="flex items-center gap-4">
                    <span className="text-sm text-slate-500">
                        Showing {page * PAGE_SIZE + 1}-{Math.min((page + 1) * PAGE_SIZE, totalCount)} of <strong>{totalCount}</strong>
                    </span>
                    <div className="flex gap-1">
                        <Button variant="outline" size="icon" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}>
                            <ChevronLeft className="w-4 h-4" />
                        </Button>
                        <Button variant="outline" size="icon" onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}>
                            <ChevronRight className="w-4 h-4" />
                        </Button>
                    </div>
                </div>
            </div >

            {/* The New Clean Table with Fixed Widths & Wrapping */}
            < div className="border rounded-lg bg-white overflow-hidden shadow-sm" >
                <Table className="table-fixed w-full">
                    <TableHeader>
                        <TableRow className="bg-slate-50 border-b border-slate-200">
                            <TableHead className="w-[35%] px-6 py-4">Original Context</TableHead>
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

                                    {/* 1. Original Text (Wrapped) */}
                                    <TableCell className="align-top py-6 px-6 border-r border-slate-100">
                                        <div className="text-sm text-slate-600 italic whitespace-pre-wrap break-words leading-relaxed">
                                            "{row.raw_text}"
                                        </div>
                                    </TableCell>

                                    {/* 2. Analysis Segments (Wrapped) */}
                                    <TableCell className="align-top py-6 px-6 space-y-3">
                                        {row.segments.map(seg => (
                                            <div key={seg.id} className="flex flex-col sm:flex-row sm:items-start gap-3 p-3 bg-white border border-slate-200 rounded-lg shadow-sm hover:border-blue-300 transition-colors">

                                                {/* Left Controls */}
                                                <div className="flex gap-2 shrink-0">
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
                                                    {/* Text Segment */}
                                                    <div className="text-sm font-medium text-slate-900 whitespace-pre-wrap break-words leading-relaxed">
                                                        {seg.segment_text}
                                                    </div>

                                                    {/* Category Dropdown (Smaller, below text on mobile) */}
                                                    <div className="pt-1">
                                                        <Select
                                                            value={seg.category_id?.toString() || "null"}
                                                            onValueChange={(val) => updateCategory(seg.id, val)}
                                                        >
                                                            <SelectTrigger className="h-7 w-full sm:w-[200px] text-xs bg-slate-50 border-slate-200 text-slate-600 focus:ring-0">
                                                                <SelectValue />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                <SelectItem value="null">Uncategorized</SelectItem>
                                                                {categories.map(c => (
                                                                    <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>
                                                    </div>
                                                </div>

                                            </div>
                                        ))}
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div >

            {/* Pagination Footer */}
            < div className="flex justify-center pt-4 pb-8" >
                <div className="text-xs text-slate-400">Page {page + 1} of {totalPages}</div>
            </div >
        </div >
    );
}