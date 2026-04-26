"use client";

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Search, Lightbulb, Building2, ChevronRight, Inbox, Sparkles, CheckCircle2, Clock, XCircle, Circle, Download, AlertTriangle, Minus } from "lucide-react";

type Status = "unreviewed" | "in_review" | "actioned" | "dismissed";

type Suggestion = {
    id: number;
    text: string;
    original_text: string;
    sentiment: string;
    category: string;
    unit: { id: number; name: string; short_name: string | null };
    context: { faculty: string; program: string; location: string };
};

const STATUS_CONFIG: Record<Status, { label: string; icon: React.ElementType; cardClass: string; badgeClass: string }> = {
    unreviewed: { label: "Unreviewed", icon: Circle, cardClass: "", badgeClass: "bg-slate-100 text-slate-500 border-slate-200" },
    in_review:  { label: "In Review",  icon: Clock,   cardClass: "border-blue-200 dark:border-blue-800/50",  badgeClass: "bg-blue-50 text-blue-600 border-blue-200" },
    actioned:   { label: "Actioned",   icon: CheckCircle2, cardClass: "border-emerald-200 dark:border-emerald-800/50 opacity-70", badgeClass: "bg-emerald-50 text-emerald-600 border-emerald-200" },
    dismissed:  { label: "Dismissed",  icon: XCircle, cardClass: "opacity-40",  badgeClass: "bg-slate-100 text-slate-400 border-slate-200" },
};

export default function SuggestionHub({ surveyId }: { surveyId?: string }) {
    const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [sentimentFilter, setSentimentFilter] = useState("ALL");
    const [unitFilter, setUnitFilter] = useState("ALL");
    const [statusFilter, setStatusFilter] = useState<Status | "ALL">("ALL");
    const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
    const [statusMap, setStatusMap] = useState<Record<number, Status>>({});

    const storageKey = `suggestion_status_${surveyId || 'global'}`;

    // Load persisted statuses
    useEffect(() => {
        try {
            const stored = localStorage.getItem(storageKey);
            if (stored) setStatusMap(JSON.parse(stored));
        } catch {}
    }, [storageKey]);

    const updateStatus = (id: number, status: Status) => {
        const next = { ...statusMap, [id]: status };
        setStatusMap(next);
        try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch {}
    };

    useEffect(() => {
        const fetchSuggestions = async () => {
            setLoading(true);
            setError(null);
            try {
                const url = surveyId ? `/api/executive/suggestions?surveyId=${surveyId}` : `/api/executive/suggestions`;
                const res = await fetch(url);
                const data = await res.json();

                if (data.error) {
                    throw new Error(data.error);
                }

                setSuggestions(Array.isArray(data) ? data : []);
            } catch (err: any) {
                console.error("Failed to fetch suggestions:", err);
                setError(err.message || "An unexpected error occurred.");
                setSuggestions([]);
            } finally {
                setLoading(false);
            }
        };
        fetchSuggestions();
    }, [surveyId]);

    // Derived Data for Filters
    const uniqueUnits = Array.from(new Set(suggestions.map(s => s.unit.name))).sort();

    // Status counts for summary
    const statusCounts = suggestions.reduce((acc, s) => {
        const st = statusMap[s.id] || "unreviewed";
        acc[st] = (acc[st] || 0) + 1;
        return acc;
    }, {} as Record<Status, number>);

    // Filtering Logic
    const filteredSuggestions = suggestions.filter(s => {
        const matchesSearch = s.text.toLowerCase().includes(searchQuery.toLowerCase()) || (s.original_text ?? "").toLowerCase().includes(searchQuery.toLowerCase());
        const matchesSentiment = sentimentFilter === "ALL" || s.sentiment === sentimentFilter;
        const matchesUnit = unitFilter === "ALL" || s.unit.name === unitFilter;
        const currentStatus = statusMap[s.id] || "unreviewed";
        const matchesStatus = statusFilter === "ALL" || currentStatus === statusFilter;
        return matchesSearch && matchesSentiment && matchesUnit && matchesStatus;
    });

    const toggleExpand = (id: number) => {
        const next = new Set(expandedIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setExpandedIds(next);
    };

    const getSentimentColor = (s: string) => {
        if (s === "Positive") return "bg-green-100/50 text-green-700 border-green-200";
        if (s === "Negative") return "bg-red-100/50 text-red-700 border-red-200";
        return "bg-slate-100/50 text-slate-700 border-slate-200";
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center py-24 space-y-4">
                <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                <p className="text-slate-500 font-medium animate-pulse">Gathering institution-wide suggestions...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="bg-red-50 border border-red-200 shadow-sm rounded-xl p-8 text-center">
                <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                    <span className="font-bold text-xl">!</span>
                </div>
                <h3 className="text-lg font-bold text-red-800 mb-2">Could Not Load Suggestions</h3>
                <p className="text-red-600 max-w-md mx-auto text-sm">
                    {error}
                </p>
                <Button onClick={() => window.location.reload()} variant="outline" className="mt-6 border-red-200 text-red-700 hover:bg-red-100">
                    Try Again
                </Button>
            </div>
        );
    }

    if (suggestions.length === 0) {
        return (
            <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-12 text-center">
                <div className="w-16 h-16 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center mx-auto mb-6">
                    <Inbox className="w-8 h-8 opacity-80" />
                </div>
                <h3 className="text-xl font-bold text-slate-800 mb-2">No Suggestions Found</h3>
                <p className="text-slate-500 max-w-md mx-auto">
                    The AI hasn't flagged any specific, actionable suggestions in the analyzed feedback yet. Try analyzing more raw comments!
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-6">

            {/* Header & Controls */}
            <div className="bg-gradient-to-br from-indigo-900 via-blue-900 to-slate-900 p-8 rounded-2xl shadow-xl border border-white/10 text-white relative overflow-hidden">
                <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
                    <Lightbulb className="w-48 h-48 rotate-12" />
                </div>

                <div className="relative z-10">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-amber-500/20 text-amber-300 rounded-lg backdrop-blur-sm">
                            <Sparkles className="w-5 h-5" />
                        </div>
                        <h2 className="text-2xl font-bold tracking-tight">Institutional Suggestions Hub</h2>
                    </div>
                    <p className="text-blue-100/70 max-w-2xl text-sm leading-relaxed mb-8">
                        A curated feed of highly actionable suggestions and ideas automatically extracted by AI from thousands of student voices across all departments and faculties.
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                        <div className="relative">
                            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                            <Input
                                placeholder="Search suggestions..."
                                className="pl-9 bg-white/10 border-white/20 text-white placeholder:text-slate-400 backdrop-blur-md focus:bg-white/20 focus:border-white/30 transition-all"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                        <Select value={unitFilter} onValueChange={setUnitFilter}>
                            <SelectTrigger className="bg-white/10 border-white/20 text-white backdrop-blur-md focus:ring-0">
                                <SelectValue placeholder="All Units" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="ALL">All Departments/Units</SelectItem>
                                {uniqueUnits.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                            </SelectContent>
                        </Select>
                        <Select value={sentimentFilter} onValueChange={setSentimentFilter}>
                            <SelectTrigger className="bg-white/10 border-white/20 text-white backdrop-blur-md focus:ring-0">
                                <SelectValue placeholder="All Sentiments" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="ALL">All Sentiments</SelectItem>
                                <SelectItem value="Positive">Constructive Positives</SelectItem>
                                <SelectItem value="Negative">Critical Fixes</SelectItem>
                                <SelectItem value="Neutral">Neutral Proposals</SelectItem>
                            </SelectContent>
                        </Select>
                        <Select value={statusFilter} onValueChange={v => setStatusFilter(v as Status | "ALL")}>
                            <SelectTrigger className="bg-white/10 border-white/20 text-white backdrop-blur-md focus:ring-0">
                                <SelectValue placeholder="All Statuses" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="ALL">All Statuses</SelectItem>
                                <SelectItem value="unreviewed">Unreviewed ({statusCounts.unreviewed || 0})</SelectItem>
                                <SelectItem value="in_review">In Review ({statusCounts.in_review || 0})</SelectItem>
                                <SelectItem value="actioned">Actioned ({statusCounts.actioned || 0})</SelectItem>
                                <SelectItem value="dismissed">Dismissed ({statusCounts.dismissed || 0})</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    {/* Status summary pills */}
                    <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-white/10">
                        {(Object.entries(STATUS_CONFIG) as [Status, typeof STATUS_CONFIG[Status]][]).map(([key, cfg]) => {
                            const Icon = cfg.icon;
                            const count = statusCounts[key] || 0;
                            if (count === 0) return null;
                            return (
                                <button
                                    key={key}
                                    onClick={() => setStatusFilter(statusFilter === key ? "ALL" : key)}
                                    className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all border ${
                                        statusFilter === key
                                            ? 'bg-white text-slate-800 border-white'
                                            : 'bg-white/10 text-white/70 border-white/20 hover:bg-white/20'
                                    }`}
                                >
                                    <Icon className="w-3 h-3" />
                                    {cfg.label}: <span className="font-bold ml-0.5">{count}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Metric Summary + Export */}
            <div className="flex items-center justify-between px-2">
                <p className="text-sm font-medium text-slate-500">
                    Showing <span className="text-slate-900 font-bold">{filteredSuggestions.length}</span> actionable ideas
                    {filteredSuggestions.length !== suggestions.length && (
                        <span className="text-slate-400"> (filtered from {suggestions.length})</span>
                    )}
                </p>
                <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs gap-1.5 border-slate-200 text-slate-600 hover:bg-slate-50"
                    onClick={() => {
                        if (!filteredSuggestions.length) return;
                        const headers = ["Unit", "Category", "Sentiment", "Priority", "Suggestion", "Original Context", "Faculty", "Program", "Status"];
                        const rows = filteredSuggestions.map(s => [
                            s.unit.name,
                            s.category,
                            s.sentiment,
                            s.sentiment === "Negative" ? "High" : s.sentiment === "Neutral" ? "Medium" : "Low",
                            s.text,
                            s.original_text,
                            s.context.faculty || "",
                            s.context.program || "",
                            statusMap[s.id] || "unreviewed",
                        ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(","));
                        const csv = [headers.join(","), ...rows].join("\n");
                        const a = Object.assign(document.createElement("a"), {
                            href: URL.createObjectURL(new Blob([csv], { type: "text/csv" })),
                            download: `suggestions_${new Date().toISOString().split("T")[0]}.csv`,
                        });
                        a.click();
                    }}
                >
                    <Download className="w-3.5 h-3.5" /> Export CSV
                </Button>
            </div>

            {/* Masonry-Style Grid for Cards */}
            <div className="columns-1 md:columns-2 lg:columns-3 gap-6 space-y-6 pb-20">
                {filteredSuggestions.map((suggestion) => {
                    const currentStatus: Status = statusMap[suggestion.id] || "unreviewed";
                    const statusCfg = STATUS_CONFIG[currentStatus];
                    const priority = suggestion.sentiment === "Negative" ? "High" : suggestion.sentiment === "Neutral" ? "Medium" : "Low";
                    const PriorityIcon = priority === "High" ? AlertTriangle : priority === "Medium" ? Minus : CheckCircle2;
                    const priorityClass = priority === "High"
                        ? "text-red-600 bg-red-50 border-red-200"
                        : priority === "Medium"
                        ? "text-amber-600 bg-amber-50 border-amber-200"
                        : "text-emerald-600 bg-emerald-50 border-emerald-200";
                    return (
                    <Card key={suggestion.id} className={`break-inside-avoid shadow-sm hover:shadow-lg transition-all duration-300 border-slate-200 hover:border-blue-300 group bg-white/60 backdrop-blur-xl ${statusCfg.cardClass}`}>
                        <CardContent className="p-6">

                            {/* Card Header Metadata */}
                            <div className="flex justify-between items-start mb-4 gap-2">
                                <div className="flex items-center gap-2 min-w-0">
                                    <div className="p-1.5 bg-blue-50 text-blue-600 rounded-md shrink-0">
                                        <Building2 className="w-3.5 h-3.5" />
                                    </div>
                                    <span className="text-xs font-bold text-slate-700 leading-tight truncate">
                                        {suggestion.unit.name}
                                    </span>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                    <Badge variant="outline" className={`text-[10px] px-2 py-0.5 font-semibold border flex items-center gap-1 ${priorityClass}`}>
                                        <PriorityIcon className="w-2.5 h-2.5" />
                                        {priority}
                                    </Badge>
                                </div>
                            </div>

                            {/* Main Suggestion Text */}
                            <p className="text-slate-800 text-sm leading-relaxed font-medium mb-4">
                                &ldquo;{suggestion.text}&rdquo;
                            </p>

                            {/* Tags / Sub-metadata */}
                            <div className="flex flex-wrap gap-2 mb-4">
                                <Badge variant="secondary" className="bg-slate-100 text-slate-600 hover:bg-slate-200 text-xs font-normal border-transparent">
                                    {suggestion.category}
                                </Badge>
                                {suggestion.context.faculty && (
                                    <Badge variant="outline" className="text-xs text-slate-500 font-normal">
                                        {suggestion.context.faculty}
                                    </Badge>
                                )}
                            </div>

                            {/* Status controls */}
                            <div className="flex items-center gap-1 mb-3">
                                <span className="text-[10px] text-slate-400 mr-1 font-medium">Status:</span>
                                {(Object.entries(STATUS_CONFIG) as [Status, typeof STATUS_CONFIG[Status]][]).map(([key, cfg]) => {
                                    const Icon = cfg.icon;
                                    const isActive = currentStatus === key;
                                    return (
                                        <button
                                            key={key}
                                            onClick={() => updateStatus(suggestion.id, key)}
                                            title={cfg.label}
                                            className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border transition-all ${
                                                isActive
                                                    ? cfg.badgeClass + ' shadow-sm'
                                                    : 'bg-transparent text-slate-300 border-slate-200 hover:border-slate-300 hover:text-slate-500'
                                            }`}
                                        >
                                            <Icon className="w-2.5 h-2.5" />
                                            {isActive && <span>{cfg.label}</span>}
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Expanded Context Toggle */}
                            <div className="pt-3 border-t border-slate-100 flex flex-col gap-3">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 px-2 justify-between w-full text-xs text-slate-500 hover:text-blue-600 group/btn"
                                    onClick={() => toggleExpand(suggestion.id)}
                                >
                                    <span>{expandedIds.has(suggestion.id) ? "Hide Original Context" : "View Original Context"}</span>
                                    <ChevronRight className={`w-3.5 h-3.5 transition-transform duration-200 ${expandedIds.has(suggestion.id) ? "rotate-90" : "group-hover/btn:translate-x-1"}`} />
                                </Button>

                                {expandedIds.has(suggestion.id) && (
                                    <div className="bg-slate-50 p-4 rounded-lg text-xs text-slate-600 italic leading-relaxed border border-slate-100 animate-in slide-in-from-top-2 fade-in duration-200">
                                        &ldquo;{suggestion.original_text}&rdquo;
                                    </div>
                                )}
                            </div>

                        </CardContent>
                    </Card>
                    );
                })}
            </div>

            {filteredSuggestions.length === 0 && (
                <div className="text-center py-20 text-slate-500 border-2 border-dashed border-slate-200 rounded-xl">
                    No suggestions match your current filters.
                </div>
            )}
        </div>
    );
}
