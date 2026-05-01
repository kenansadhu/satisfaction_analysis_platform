"use client";

import { useState, useEffect, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
    Loader2, Search, ChevronDown, ChevronUp,
    Inbox, AlertTriangle, Minus, TrendingUp, Building2,
    Tag, Users, Download, MessageSquare, Sparkles, RefreshCw,
    ArrowUpDown, Layers, GitMerge, Zap, Clock, CalendarClock,
    GitBranch, Star, CheckCircle2,
} from "lucide-react";

type StructuredSummary = {
    headline: string;
    overall_mood: "Urgent" | "Concerning" | "Mixed" | "Constructive" | "Positive";
    top_issues: { title: string; detail: string; units_affected: string[]; evidence: string; urgency: "High" | "Medium" | "Low" }[];
    bright_spots: { title: string; detail: string; evidence: string }[];
    recommended_actions: { action: string; rationale: string; timeline: "Immediate" | "Short-term" | "Long-term" }[];
    closing_statement: string;
};


type Suggestion = {
    id: number;
    text: string;
    original_text: string;
    sentiment: string;
    category: string;
    unit: { id: number; name: string; short_name: string | null };
    context: { faculty: string; program: string; location: string };
};

type Theme = {
    key: string;
    unit: { id: number; name: string; short_name: string | null };
    category: string;
    count: number;
    negative: number;
    neutral: number;
    positive: number;
    topQuote: string;
    suggestions: Suggestion[];
};

type UnitSlice = {
    unit: { id: number; name: string; short_name: string | null };
    count: number;
    negative: number;
    positive: number;
    neutral: number;
    topQuote: string;
};

type Pattern = {
    category: string;
    total: number;
    negative: number;
    positive: number;
    neutral: number;
    unitSlices: UnitSlice[];
};


const weightedScore = (t: Theme) => t.negative * 3 + t.neutral * 2 + t.positive;

const PRIORITY_STYLE = {
    High:   { bar: "bg-red-500",     badge: "bg-red-50 text-red-700 border-red-200",       left: "border-l-red-400" },
    Medium: { bar: "bg-amber-400",   badge: "bg-amber-50 text-amber-700 border-amber-200", left: "border-l-amber-400" },
    Low:    { bar: "bg-emerald-500", badge: "bg-emerald-50 text-emerald-700 border-emerald-200", left: "border-l-emerald-400" },
};

export default function SuggestionHub({ surveyId }: { surveyId?: string }) {
    const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState("");
    const [unitFilter, setUnitFilter] = useState("ALL");
    const [priorityFilter, setPriorityFilter] = useState<"ALL" | "High" | "Medium" | "Low">("ALL");
    const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());

    const [viewMode, setViewMode] = useState<"summary" | "themes" | "patterns">("summary");
    const [sortBy, setSortBy] = useState<"weighted" | "priority" | "count" | "negative">("weighted");
    const [groupBy, setGroupBy] = useState<"none" | "unit" | "category">("none");

    // AI executive narrative — persisted in localStorage per surveyId
    const [aiSummary, setAiSummary] = useState<StructuredSummary | null>(null);
    const [aiLoading, setAiLoading] = useState(false);
    const [aiError, setAiError] = useState<string | null>(null);

    // AI per-theme one-line summaries
    const [themeSummaries, setThemeSummaries] = useState<Record<string, string>>({});
    const [summaryLoading, setSummaryLoading] = useState(false);
    const [summaryError, setSummaryError] = useState<string | null>(null);

    // Load persisted AI summary + theme summaries from DB on mount
    useEffect(() => {
        if (!surveyId) return;
        fetch(`/api/executive/suggestions-cache?surveyId=${surveyId}`)
            .then(r => r.json())
            .then(data => {
                if (data.exec_summary) setAiSummary(data.exec_summary);
                if (data.theme_summaries) setThemeSummaries(data.theme_summaries);
            })
            .catch(() => {});
    }, [surveyId]);

    useEffect(() => {
        setLoading(true);
        setError(null);
        const url = surveyId ? `/api/executive/suggestions?surveyId=${surveyId}` : `/api/executive/suggestions`;
        fetch(url)
            .then(r => r.json())
            .then(data => {
                if (data.error) throw new Error(data.error);
                setSuggestions(Array.isArray(data) ? data : []);
            })
            .catch(e => setError(e.message || "Failed to load"))
            .finally(() => setLoading(false));
    }, [surveyId]);

    const themes = useMemo<Theme[]>(() => {
        const map = new Map<string, Theme>();
        for (const s of suggestions) {
            const key = `${s.unit.id}__${s.category}`;
            if (!map.has(key)) {
                map.set(key, { key, unit: s.unit, category: s.category, count: 0, negative: 0, neutral: 0, positive: 0, topQuote: s.text, suggestions: [] });
            }
            const t = map.get(key)!;
            t.count++;
            if (s.sentiment === "Negative") t.negative++;
            else if (s.sentiment === "Positive") t.positive++;
            else t.neutral++;
            t.suggestions.push(s);
            if (s.sentiment === "Negative" && t.suggestions.filter(x => x.sentiment === "Negative").length === 1) {
                t.topQuote = s.text;
            }
        }
        return Array.from(map.values()).sort((a, b) => b.count - a.count);
    }, [suggestions]);

    // Rank all themes by weighted score, then cut top 25% = High, bottom 25% = Low
    const priorityMap = useMemo<Map<string, "High" | "Medium" | "Low">>(() => {
        const sorted = [...themes].sort((a, b) => weightedScore(b) - weightedScore(a));
        const result = new Map<string, "High" | "Medium" | "Low">();
        sorted.forEach(({ key }, i) => {
            const rank = i / sorted.length;
            result.set(key, rank < 0.25 ? "High" : rank < 0.75 ? "Medium" : "Low");
        });
        return result;
    }, [themes]);

    const priorityFor = (theme: Theme) => priorityMap.get(theme.key) ?? "Low";

    const patterns = useMemo<Pattern[]>(() => {
        const map = new Map<string, { category: string; units: Map<number, UnitSlice>; total: number; negative: number; positive: number; neutral: number }>();
        for (const s of suggestions) {
            if (!map.has(s.category)) {
                map.set(s.category, { category: s.category, units: new Map(), total: 0, negative: 0, positive: 0, neutral: 0 });
            }
            const p = map.get(s.category)!;
            p.total++;
            if (s.sentiment === "Negative") p.negative++;
            else if (s.sentiment === "Positive") p.positive++;
            else p.neutral++;
            if (!p.units.has(s.unit.id)) {
                p.units.set(s.unit.id, { unit: s.unit, count: 0, negative: 0, positive: 0, neutral: 0, topQuote: s.text });
            }
            const u = p.units.get(s.unit.id)!;
            u.count++;
            if (s.sentiment === "Negative") u.negative++;
            else if (s.sentiment === "Positive") u.positive++;
            else u.neutral++;
            if (s.sentiment === "Negative" && u.negative === 1) u.topQuote = s.text;
        }
        return Array.from(map.values())
            .filter(p => p.units.size >= 2)
            .map(p => ({ ...p, unitSlices: Array.from(p.units.values()).sort((a, b) => b.count - a.count) }))
            .sort((a, b) => b.unitSlices.length - a.unitSlices.length || b.total - a.total);
    }, [suggestions]);

    const uniqueUnits = useMemo(
        () => [...new Map(suggestions.map(s => [s.unit.id, s.unit])).values()].sort((a, b) => a.name.localeCompare(b.name)),
        [suggestions]
    );

    const filtered = useMemo(() => themes.filter(t => {
        if (unitFilter !== "ALL" && t.unit.id.toString() !== unitFilter) return false;
        if (priorityFilter !== "ALL" && priorityFor(t) !== priorityFilter) return false;
        if (search) {
            const q = search.toLowerCase();
            if (!t.category.toLowerCase().includes(q) && !t.unit.name.toLowerCase().includes(q) && !t.topQuote.toLowerCase().includes(q)) return false;
        }
        return true;
    }), [themes, unitFilter, priorityFilter, search]);

    const sortedFiltered = useMemo(() => {
        const arr = [...filtered];
        if (sortBy === "weighted") return arr.sort((a, b) => weightedScore(b) - weightedScore(a));
        if (sortBy === "count") return arr.sort((a, b) => b.count - a.count);
        if (sortBy === "negative") return arr.sort((a, b) => {
            const aPct = a.count > 0 ? a.negative / a.count : 0;
            const bPct = b.count > 0 ? b.negative / b.count : 0;
            return bPct - aPct;
        });
        const order: Record<string, number> = { High: 0, Medium: 1, Low: 2 };
        return arr.sort((a, b) => order[priorityFor(a)] - order[priorityFor(b)] || b.count - a.count);
    }, [filtered, sortBy]);

    const grouped = useMemo<[string, Theme[]][] | null>(() => {
        if (groupBy === "none") return null;
        const map = new Map<string, Theme[]>();
        for (const t of sortedFiltered) {
            const key = groupBy === "unit" ? (t.unit.short_name || t.unit.name) : t.category;
            if (!map.has(key)) map.set(key, []);
            map.get(key)!.push(t);
        }
        return Array.from(map.entries()).sort((a, b) => b[1].length - a[1].length);
    }, [sortedFiltered, groupBy]);

    const toggle = (key: string) => {
        const next = new Set(expandedKeys);
        next.has(key) ? next.delete(key) : next.add(key);
        setExpandedKeys(next);
    };

    const handleExport = () => {
        const rows = filtered.flatMap(t =>
            t.suggestions.map(s => [
                t.unit.name, t.category, priorityFor(t),
                s.sentiment, s.text, s.original_text,
                s.context.faculty || "", s.context.program || "",
            ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(","))
        );
        const csv = [["Unit", "Category", "Priority", "Sentiment", "Suggestion", "Original Text", "Faculty", "Program"].join(","), ...rows].join("\n");
        const a = Object.assign(document.createElement("a"), {
            href: URL.createObjectURL(new Blob([csv], { type: "text/csv" })),
            download: `suggestions_${new Date().toISOString().split("T")[0]}.csv`,
        });
        a.click();
    };

    const handleGenerateSummary = async () => {
        setAiLoading(true);
        setAiError(null);
        try {
            const res = await fetch("/api/executive/suggestions-summary", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    surveyId,
                    stats: {
                        total_suggestions: suggestions.length,
                        themes_count: themes.length,
                        units_count: uniqueUnits.length,
                        high_priority_themes: themes.filter(t => priorityFor(t) === "High").length,
                    },
                    themes: themes.slice(0, 20).map(t => ({
                        unit: t.unit.name,
                        category: t.category,
                        count: t.count,
                        negative: t.negative,
                        positive: t.positive,
                        neutral: t.neutral,
                        priority: priorityFor(t),
                        quotes: t.suggestions.slice(0, 5).map(s => ({ text: s.text, sentiment: s.sentiment })),
                    })),
                }),
            });
            const data = await res.json();
            if (data.error) throw new Error(data.error);
            setAiSummary(data.report as StructuredSummary);
        } catch (e: any) {
            setAiError(e.message || "Failed to generate summary");
        } finally {
            setAiLoading(false);
        }
    };

    const handleSummarizeThemes = async () => {
        setSummaryLoading(true);
        setSummaryError(null);
        if (themes.length === 0) { setSummaryLoading(false); return; }
        try {
            const res = await fetch("/api/executive/theme-summaries", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    surveyId,
                    themes: themes.map(t => ({
                        key: t.key,
                        unit: t.unit.name,
                        category: t.category,
                        count: t.count,
                        quotes: t.suggestions.slice(0, 10).map(s => s.text),
                    })),
                }),
            });
            const data = await res.json();
            if (data.error) throw new Error(data.error);
            setThemeSummaries(data.summaries as Record<string, string>);
        } catch (e: any) {
            setSummaryError(e.message || "Failed to generate summaries");
        } finally {
            setSummaryLoading(false);
        }
    };

    // Compact list row for a single theme
    const renderThemeRow = (theme: Theme) => {
        const priority = priorityFor(theme);
        const style = PRIORITY_STYLE[priority];
        const isOpen = expandedKeys.has(theme.key);
        const negPct = theme.count > 0 ? Math.round(theme.negative / theme.count * 100) : 0;
        const posPct = theme.count > 0 ? Math.round(theme.positive / theme.count * 100) : 0;
        const aiLine = themeSummaries[theme.key];

        return (
            <div key={theme.key}>
                <button
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                    onClick={() => toggle(theme.key)}
                >
                    {/* Priority badge — leftmost */}
                    <Badge variant="outline" className={`text-[10px] font-semibold px-1.5 border w-16 shrink-0 flex items-center justify-center gap-1 ${style.badge}`}>
                        {priority === "High" ? <AlertTriangle className="w-2.5 h-2.5" /> : priority === "Medium" ? <Minus className="w-2.5 h-2.5" /> : <TrendingUp className="w-2.5 h-2.5" />}
                        {priority}
                    </Badge>

                    {/* Voice count */}
                    <span className="w-8 text-center text-sm font-bold tabular-nums text-slate-700 dark:text-slate-300 shrink-0">{theme.count}</span>

                    {/* Unit + Category */}
                    <div className="w-44 shrink-0 min-w-0">
                        <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">{theme.unit.short_name || theme.unit.name}</div>
                        <div className="text-[11px] text-slate-500 truncate">{theme.category}</div>
                    </div>

                    {/* Summary line */}
                    <div className="flex-1 min-w-0">
                        {summaryLoading ? (
                            <div className="h-2.5 w-56 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
                        ) : aiLine ? (
                            <span className="text-xs text-slate-700 dark:text-slate-300 truncate block">{aiLine}</span>
                        ) : (
                            <span className="text-xs text-slate-500 dark:text-slate-400 italic truncate block">"{theme.topQuote}"</span>
                        )}
                    </div>

                    {/* Sentiment bar */}
                    <div className="hidden lg:flex items-center gap-2 shrink-0 w-28">
                        <div className="flex h-1.5 flex-1 rounded-full overflow-hidden bg-slate-100 dark:bg-slate-800">
                            <div className="bg-red-400 h-full" style={{ width: `${negPct}%` }} />
                            <div className="bg-slate-300 dark:bg-slate-600 h-full" style={{ width: `${100 - negPct - posPct}%` }} />
                            <div className="bg-emerald-400 h-full" style={{ width: `${posPct}%` }} />
                        </div>
                        <span className="text-[10px] text-slate-400 w-8 text-right">{negPct}%</span>
                    </div>

                    <ChevronDown className={`w-4 h-4 text-slate-400 shrink-0 transition-transform duration-150 ${isOpen ? "rotate-180" : ""}`} />
                </button>

                {/* Expanded quotes */}
                {isOpen && (
                    <div className="bg-slate-50 dark:bg-slate-900/50 border-t border-slate-100 dark:border-slate-800 px-5 py-4 space-y-2 animate-in slide-in-from-top-1 fade-in duration-150">
                        <div className="flex items-center gap-2 mb-2">
                            <Users className="w-3.5 h-3.5 text-slate-400" />
                            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{theme.count} student suggestion{theme.count !== 1 ? "s" : ""}</span>
                        </div>
                        {theme.suggestions.map(s => (
                            <div key={s.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-4 py-3">
                                <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">"{s.text}"</p>
                                <div className="flex items-center gap-2 mt-2 flex-wrap">
                                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                                        s.sentiment === "Negative" ? "bg-red-50 text-red-600" :
                                        s.sentiment === "Positive" ? "bg-emerald-50 text-emerald-600" :
                                        "bg-slate-100 text-slate-500"
                                    }`}>{s.sentiment}</span>
                                    {s.context.faculty && <span className="text-[10px] text-slate-400">{s.context.faculty}</span>}
                                    {s.context.program && <span className="text-[10px] text-slate-400">· {s.context.program}</span>}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        );
    };

    if (loading) return (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
            <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
            <p className="text-slate-500 font-medium animate-pulse">Aggregating student suggestions…</p>
        </div>
    );

    if (error) return (
        <div className="bg-red-50 border border-red-200 rounded-xl p-8 text-center">
            <AlertTriangle className="w-10 h-10 text-red-400 mx-auto mb-3" />
            <p className="text-red-700 font-semibold mb-1">Could not load suggestions</p>
            <p className="text-red-500 text-sm">{error}</p>
            <Button variant="outline" className="mt-4 border-red-200 text-red-700" onClick={() => window.location.reload()}>Retry</Button>
        </div>
    );

    if (suggestions.length === 0) return (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
            <Inbox className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-slate-700 mb-1">No Suggestions Yet</h3>
            <p className="text-slate-400 text-sm">Run analysis on more text columns to surface student suggestions.</p>
        </div>
    );

    const hasSummaries = Object.keys(themeSummaries).length > 0;

    return (
        <div className="space-y-5">

            {/* Stats strip */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                    { label: "Total Suggestions", value: suggestions.length.toLocaleString(), icon: MessageSquare, color: "text-blue-600",   bg: "bg-blue-50 dark:bg-blue-950/30" },
                    { label: "Distinct Themes",   value: themes.length,                       icon: Tag,           color: "text-violet-600", bg: "bg-violet-50 dark:bg-violet-950/30" },
                    { label: "Units Covered",     value: uniqueUnits.length,                  icon: Building2,     color: "text-teal-600",   bg: "bg-teal-50 dark:bg-teal-950/30" },
                    { label: "High Priority",     value: themes.filter(t => priorityFor(t) === "High").length, icon: AlertTriangle, color: "text-red-600", bg: "bg-red-50 dark:bg-red-950/30" },
                ].map(({ label, value, icon: Icon, color, bg }) => (
                    <div key={label} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-5 py-4 flex items-center gap-3 shadow-sm">
                        <div className={`p-2 rounded-lg ${bg} shrink-0`}>
                            <Icon className={`w-4 h-4 ${color}`} />
                        </div>
                        <div>
                            <div className="text-2xl font-black text-slate-900 dark:text-slate-100 tabular-nums">{value}</div>
                            <div className="text-xs text-slate-500 font-medium">{label}</div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Tab bar */}
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg w-fit">
                {([
                    { key: "summary",  label: "AI Summary",         icon: Sparkles },
                    { key: "themes",   label: "Themes",             icon: Layers },
                    { key: "patterns", label: "Cross-Unit Patterns", icon: GitMerge },
                ] as const).map(({ key, label, icon: Icon }) => (
                    <button
                        key={key}
                        onClick={() => setViewMode(key)}
                        className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                            viewMode === key ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm" : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                        }`}
                    >
                        <Icon className="w-3.5 h-3.5" />
                        {label}
                        {key === "patterns" && patterns.length > 0 && (
                            <span className="ml-1 px-1.5 py-0.5 text-[10px] font-bold bg-amber-100 text-amber-700 rounded-full">{patterns.length}</span>
                        )}
                        {key === "summary" && aiSummary && (
                            <span className="ml-1 w-1.5 h-1.5 rounded-full bg-violet-500 inline-block" />
                        )}
                    </button>
                ))}
            </div>

            {viewMode === "summary" && (() => {
                const moodStyle: Record<string, string> = {
                    Urgent:       "bg-red-100 text-red-800 border-red-300",
                    Concerning:   "bg-amber-100 text-amber-800 border-amber-300",
                    Mixed:        "bg-blue-100 text-blue-800 border-blue-300",
                    Constructive: "bg-teal-100 text-teal-800 border-teal-300",
                    Positive:     "bg-emerald-100 text-emerald-800 border-emerald-300",
                };
                const urgencyStyle: Record<string, string> = {
                    High:   "bg-red-50 text-red-700 border-red-200",
                    Medium: "bg-amber-50 text-amber-700 border-amber-200",
                    Low:    "bg-emerald-50 text-emerald-700 border-emerald-200",
                };
                const timelineIcon: Record<string, any> = {
                    Immediate:    Zap,
                    "Short-term": Clock,
                    "Long-term":  CalendarClock,
                };
                const timelineStyle: Record<string, string> = {
                    Immediate:    "bg-red-50 text-red-700 border-red-200",
                    "Short-term": "bg-amber-50 text-amber-700 border-amber-200",
                    "Long-term":  "bg-slate-100 text-slate-600 border-slate-200",
                };

                if (!aiSummary && !aiLoading) return (
                    <div className="bg-gradient-to-br from-violet-50 to-indigo-50 dark:from-violet-950/20 dark:to-indigo-950/20 border border-violet-200 dark:border-violet-800 rounded-xl p-12 flex flex-col items-center text-center gap-4">
                        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-violet-200 dark:border-violet-700 shadow-sm">
                            <Sparkles className="w-8 h-8 text-violet-500" />
                        </div>
                        <div>
                            <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200 mb-1">No summary yet</h3>
                            <p className="text-sm text-slate-500 max-w-sm">Generate an AI-powered executive briefing covering top issues, bright spots, and recommended actions.</p>
                        </div>
                        <Button className="gap-2 bg-violet-600 hover:bg-violet-700 text-white" onClick={handleGenerateSummary}>
                            <Sparkles className="w-4 h-4" /> Generate Summary
                        </Button>
                        {aiError && (
                            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 w-full max-w-md">
                                <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {aiError}
                            </div>
                        )}
                    </div>
                );

                if (aiLoading) return (
                    <div className="flex flex-col items-center justify-center py-24 gap-4">
                        <Loader2 className="w-8 h-8 text-violet-500 animate-spin" />
                        <p className="text-slate-500 font-medium animate-pulse">Generating executive briefing…</p>
                    </div>
                );

                const s = aiSummary!;
                return (
                    <div className="space-y-4">
                        {/* Headline + mood + regenerate */}
                        <div className="bg-white dark:bg-slate-900 border border-violet-100 dark:border-violet-900 rounded-xl px-5 py-4 flex items-start justify-between gap-4">
                            <p className="text-base font-semibold text-slate-800 dark:text-slate-200 leading-snug">{s.headline}</p>
                            <div className="flex items-center gap-2 shrink-0">
                                <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${moodStyle[s.overall_mood] || moodStyle.Mixed}`}>{s.overall_mood}</span>
                                <Button size="sm" variant="outline" className="gap-1.5 text-xs border-violet-300 text-violet-700 hover:bg-violet-50" onClick={handleGenerateSummary} disabled={aiLoading}>
                                    <RefreshCw className="w-3 h-3" /> Regenerate
                                </Button>
                            </div>
                        </div>
                        {aiError && (
                            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                                <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {aiError}
                            </div>
                        )}

                        {/* Top Issues + Bright Spots */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                            <div className="space-y-2">
                                <div className="flex items-center gap-1.5 px-1">
                                    <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Top Issues</span>
                                </div>
                                {(s.top_issues || []).map((issue, i) => (
                                    <div key={i} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-3">
                                        <div className="flex items-start justify-between gap-2 mb-1.5">
                                            <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 leading-tight">{issue.title}</span>
                                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border shrink-0 ${urgencyStyle[issue.urgency] || urgencyStyle.Medium}`}>{issue.urgency}</span>
                                        </div>
                                        <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed mb-2">{issue.detail}</p>
                                        {issue.units_affected?.length > 0 && (
                                            <div className="flex flex-wrap gap-1 mb-2">
                                                {issue.units_affected.map((u, j) => (
                                                    <span key={j} className="text-[9px] font-medium px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-full">{u}</span>
                                                ))}
                                            </div>
                                        )}
                                        <p className="text-[10px] text-slate-500 italic border-l-2 border-slate-200 pl-2 leading-relaxed">"{issue.evidence}"</p>
                                    </div>
                                ))}
                            </div>

                            <div className="space-y-2">
                                <div className="flex items-center gap-1.5 px-1">
                                    <Star className="w-3.5 h-3.5 text-emerald-500" />
                                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Bright Spots</span>
                                </div>
                                {(s.bright_spots || []).map((spot, i) => (
                                    <div key={i} className="bg-white dark:bg-slate-900 border border-emerald-100 dark:border-emerald-900 rounded-lg p-3">
                                        <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 block mb-1">{spot.title}</span>
                                        <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed mb-2">{spot.detail}</p>
                                        <p className="text-[10px] text-slate-500 italic border-l-2 border-emerald-200 pl-2 leading-relaxed">"{spot.evidence}"</p>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Recommended Actions */}
                        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
                            <div className="flex items-center gap-1.5 mb-3">
                                <CheckCircle2 className="w-3.5 h-3.5 text-slate-500" />
                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Recommended Actions</span>
                            </div>
                            <div className="space-y-2">
                                {(s.recommended_actions || []).map((action, i) => {
                                    const Icon = timelineIcon[action.timeline] || Zap;
                                    return (
                                        <div key={i} className="flex items-start gap-3">
                                            <span className={`flex items-center gap-1 text-[9px] font-bold px-2 py-1 rounded border shrink-0 ${timelineStyle[action.timeline] || timelineStyle["Long-term"]}`}>
                                                <Icon className="w-2.5 h-2.5" />{action.timeline}
                                            </span>
                                            <div>
                                                <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">{action.action}</p>
                                                <p className="text-[11px] text-slate-500 leading-relaxed">{action.rationale}</p>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        <p className="text-xs text-slate-500 dark:text-slate-400 italic text-center px-4">{s.closing_statement}</p>
                    </div>
                );
            })()}


            {viewMode === "themes" ? (
                <>
                    {/* Filter bar */}
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="relative flex-1 min-w-[160px] max-w-xs">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <Input placeholder="Search themes…" className="pl-9 h-9" value={search} onChange={e => setSearch(e.target.value)} />
                        </div>
                        <Select value={unitFilter} onValueChange={setUnitFilter}>
                            <SelectTrigger className="w-40 h-9">
                                <Building2 className="w-3.5 h-3.5 mr-1.5 text-slate-400" />
                                <SelectValue placeholder="All Units" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="ALL">All Units</SelectItem>
                                {uniqueUnits.map(u => <SelectItem key={u.id} value={u.id.toString()}>{u.short_name || u.name}</SelectItem>)}
                            </SelectContent>
                        </Select>
                        <Select value={priorityFilter} onValueChange={v => setPriorityFilter(v as any)}>
                            <SelectTrigger className="w-40 h-9">
                                <AlertTriangle className="w-3.5 h-3.5 mr-1.5 text-slate-400" />
                                <SelectValue placeholder="Priority" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="ALL">All Priorities</SelectItem>
                                <SelectItem value="High">High</SelectItem>
                                <SelectItem value="Medium">Medium</SelectItem>
                                <SelectItem value="Low">Low</SelectItem>
                            </SelectContent>
                        </Select>
                        <Select value={sortBy} onValueChange={v => setSortBy(v as any)}>
                            <SelectTrigger className="w-40 h-9">
                                <ArrowUpDown className="w-3.5 h-3.5 mr-1.5 text-slate-400" />
                                <SelectValue placeholder="Sort by" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="weighted">Weighted Score (−×3 ·×2 +×1)</SelectItem>
                                <SelectItem value="priority">By Priority</SelectItem>
                                <SelectItem value="count">Most Voices</SelectItem>
                                <SelectItem value="negative">Most Critical</SelectItem>
                            </SelectContent>
                        </Select>
                        <Select value={groupBy} onValueChange={v => setGroupBy(v as any)}>
                            <SelectTrigger className="w-40 h-9">
                                <Layers className="w-3.5 h-3.5 mr-1.5 text-slate-400" />
                                <SelectValue placeholder="Group by" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="none">No Grouping</SelectItem>
                                <SelectItem value="unit">By Unit</SelectItem>
                                <SelectItem value="category">By Category</SelectItem>
                            </SelectContent>
                        </Select>

                        <div className="ml-auto flex items-center gap-2">
                            <span className="text-xs text-slate-400 hidden md:block">
                                {filtered.length}{filtered.length !== themes.length ? `/${themes.length}` : ""} themes
                            </span>
                            {/* Summarize Themes button */}
                            {themes.length > 0 && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className={`gap-1.5 text-xs ${hasSummaries ? "border-violet-300 text-violet-700" : ""}`}
                                    onClick={handleSummarizeThemes}
                                    disabled={summaryLoading}
                                >
                                    {summaryLoading
                                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                        : hasSummaries ? <RefreshCw className="w-3.5 h-3.5" /> : <Sparkles className="w-3.5 h-3.5" />
                                    }
                                    {summaryLoading ? "Summarizing…" : hasSummaries ? "Re-summarize" : `Summarize Themes`}
                                </Button>
                            )}
                            <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={handleExport}>
                                <Download className="w-3.5 h-3.5" /> Export
                            </Button>
                        </div>
                    </div>

                    {summaryError && (
                        <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {summaryError}
                        </div>
                    )}

                    {/* Column header */}
                    {filtered.length > 0 && (
                        <div className="flex items-center gap-3 px-4 py-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wide border-b border-slate-200 dark:border-slate-800">
                            <span className="w-16 shrink-0">Priority</span>
                            <span className="w-8 text-center shrink-0">N</span>
                            <span className="w-44 shrink-0">Unit / Category</span>
                            <span className="flex-1">Summary</span>
                            <span className="hidden lg:block w-28 shrink-0">Sentiment</span>
                            <span className="w-4 shrink-0" />
                        </div>
                    )}

                    {/* Theme rows — flat or grouped */}
                    {filtered.length === 0 ? (
                        <div className="text-center py-16 text-slate-400 border-2 border-dashed border-slate-200 rounded-xl">
                            No themes match your filters.
                        </div>
                    ) : grouped ? (
                        <div className="space-y-4">
                            {grouped.map(([groupName, groupThemes]) => (
                                <div key={groupName}>
                                    <div className="flex items-center gap-2 mb-1">
                                        <div className="flex items-center gap-1.5 px-3 py-1 bg-slate-100 dark:bg-slate-800 rounded-full">
                                            {groupBy === "unit" ? <Building2 className="w-3 h-3 text-slate-500" /> : <Tag className="w-3 h-3 text-slate-500" />}
                                            <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">{groupName}</span>
                                            <span className="text-[10px] text-slate-400">({groupThemes.length})</span>
                                        </div>
                                        <div className="flex-1 border-t border-slate-200 dark:border-slate-700" />
                                    </div>
                                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden divide-y divide-slate-100 dark:divide-slate-800 shadow-sm">
                                        {groupThemes.map(renderThemeRow)}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden divide-y divide-slate-100 dark:divide-slate-800 shadow-sm">
                            {sortedFiltered.map(renderThemeRow)}
                        </div>
                    )}
                </>
            ) : viewMode === "patterns" ? (
                /* Cross-Unit Patterns */
                <div className="space-y-4">
                    {patterns.length === 0 ? (
                        <div className="text-center py-16 text-slate-400 border-2 border-dashed border-slate-200 rounded-xl">
                            <GitMerge className="w-10 h-10 mx-auto mb-3 opacity-30" />
                            <p className="text-sm">No cross-unit patterns found yet.</p>
                            <p className="text-xs mt-1">Patterns appear when the same category has suggestions from 2 or more units.</p>
                        </div>
                    ) : (
                        <>
                            <p className="text-sm text-slate-500">
                                <span className="font-semibold text-slate-700 dark:text-slate-300">{patterns.length}</span>{" "}
                                categor{patterns.length !== 1 ? "ies" : "y"} appear across multiple units — likely institution-wide issues.
                            </p>

                            {/* Pattern column header */}
                            <div className="flex items-center gap-3 px-4 py-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wide border-b border-slate-200 dark:border-slate-800">
                                <span className="w-12 text-center shrink-0">Units</span>
                                <span className="flex-1">Category</span>
                                <span className="hidden md:block">Affected Units</span>
                                <span className="hidden lg:block w-28 shrink-0 text-right">Sentiment</span>
                                <span className="w-4 shrink-0" />
                            </div>

                            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden divide-y divide-slate-100 dark:divide-slate-800 shadow-sm">
                                {patterns.map(p => {
                                    const key = `pattern__${p.category}`;
                                    const isOpen = expandedKeys.has(key);
                                    const negPct = p.total > 0 ? Math.round(p.negative / p.total * 100) : 0;
                                    const posPct = p.total > 0 ? Math.round(p.positive / p.total * 100) : 0;

                                    return (
                                        <div key={key}>
                                            <button
                                                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors border-l-4 border-l-indigo-400"
                                                onClick={() => toggle(key)}
                                            >
                                                {/* Units count */}
                                                <div className="w-12 shrink-0 flex flex-col items-center justify-center">
                                                    <span className="text-base font-bold text-indigo-700 dark:text-indigo-300 tabular-nums leading-none">{p.unitSlices.length}</span>
                                                    <span className="text-[9px] text-indigo-400 uppercase tracking-wide">units</span>
                                                </div>

                                                {/* Category + total */}
                                                <div className="w-40 shrink-0 min-w-0">
                                                    <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">{p.category}</div>
                                                    <div className="text-[11px] text-slate-500">{p.total} voices</div>
                                                </div>

                                                {/* Unit tags */}
                                                <div className="flex-1 flex flex-wrap gap-1 min-w-0">
                                                    {p.unitSlices.map(u => (
                                                        <span key={u.unit.id} className="text-[10px] font-medium px-1.5 py-0.5 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 rounded-full truncate max-w-[120px]">
                                                            {u.unit.short_name || u.unit.name} ({u.count})
                                                        </span>
                                                    ))}
                                                </div>

                                                {/* Sentiment bar */}
                                                <div className="hidden lg:flex items-center gap-2 shrink-0 w-28">
                                                    <div className="flex h-1.5 flex-1 rounded-full overflow-hidden bg-slate-100 dark:bg-slate-800">
                                                        <div className="bg-red-400 h-full" style={{ width: `${negPct}%` }} />
                                                        <div className="bg-slate-300 dark:bg-slate-600 h-full" style={{ width: `${100 - negPct - posPct}%` }} />
                                                        <div className="bg-emerald-400 h-full" style={{ width: `${posPct}%` }} />
                                                    </div>
                                                    <span className="text-[10px] text-slate-400 w-8 text-right">{negPct}%</span>
                                                </div>

                                                <ChevronDown className={`w-4 h-4 text-slate-400 shrink-0 transition-transform duration-150 ${isOpen ? "rotate-180" : ""}`} />
                                            </button>

                                            {isOpen && (
                                                <div className="bg-slate-50 dark:bg-slate-900/50 border-t border-slate-100 dark:border-slate-800 px-5 py-4 space-y-2 animate-in slide-in-from-top-1 fade-in duration-150">
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <Building2 className="w-3.5 h-3.5 text-slate-400" />
                                                        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Per-unit breakdown</span>
                                                    </div>
                                                    {p.unitSlices.map(u => {
                                                        const uNegPct = u.count > 0 ? Math.round(u.negative / u.count * 100) : 0;
                                                        return (
                                                            <div key={u.unit.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-4 py-3">
                                                                <div className="flex items-center justify-between mb-1.5">
                                                                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">{u.unit.name}</span>
                                                                    <span className="text-[10px] text-slate-400">{u.count} voice{u.count !== 1 ? "s" : ""} · {uNegPct}% critical</span>
                                                                </div>
                                                                <p className="text-sm text-slate-600 dark:text-slate-400 italic leading-relaxed">"{u.topQuote}"</p>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </>
                    )}
                </div>
            ) : null}
        </div>
    );
}
