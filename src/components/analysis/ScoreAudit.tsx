"use client";

import { useEffect, useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calculator, Loader2, Search, ChevronDown, ChevronRight, AlertCircle, Download, RefreshCw, Play } from "lucide-react";

interface GlobalResult {
    macro_units: number | null;
    micro_resp: number | null;
    macro_cols: number | null;
    unitCount: number;
    totalRespondents: number;
    totalCols: number;
    computedAt: string;
}
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// Score Audit: verify per-unit, per-question SSI calculations against an external
// reference (typically a manual Google Sheet). Surfaces both the micro-average
// (every response weighted equally — what the app's SSI uses) and the
// macro-average (each question weighted equally — what some manual sheets compute)
// so the user can pinpoint where a discrepancy comes from.

interface CampusStat {
    n: number;
    sum: number;
    avg: number | null;
    distribution: Record<string, number>;
    na: number;
}

interface PerCampusSummaryRow {
    micro_avg: number | null;
    macro_avg: number | null;
    resp_macro_avg: number | null;
    resp_macro_n: number;
    cache_avg: number | null;
    cache_n: number | null;
    n: number;
    columns_used: number;
}

interface ColumnData {
    source_column: string;
    score_rule: string | null;
    max_score: number;
    included_in_ssi: boolean;
    subgroup_name?: string | null;
    exclusion_reason: string | null;
    campus_stats: Record<string, CampusStat>;
    total: CampusStat;
}

interface UnitData {
    unit_id: number;
    unit_name: string;
    short_name: string;
    columns: ColumnData[];
    summary: {
        per_campus: Record<string, PerCampusSummaryRow>;
        overall: PerCampusSummaryRow;
    };
}

interface AuditPayload {
    survey: { id: number; title: string; year: number };
    campuses: string[];
    units: UnitData[];
}

function fmtAvg(v: number | null | undefined, digits = 2): string {
    if (v == null || isNaN(v as number)) return "—";
    return (v as number).toFixed(digits);
}

export function ScoreAudit({ surveyId }: { surveyId: string }) {
    const [data, setData] = useState<AuditPayload | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedUnitId, setSelectedUnitId] = useState<number | null>(null);
    const [expandedColumns, setExpandedColumns] = useState<Set<string>>(new Set());
    const [search, setSearch] = useState("");
    const [decimals, setDecimals] = useState(4);
    const [rebuilding, setRebuilding] = useState(false);

    // Global comparison — loaded independently so it doesn't block the per-unit table.
    const [globalResult, setGlobalResult] = useState<GlobalResult | null>(null);
    const [globalLoading, setGlobalLoading] = useState(false);
    const [globalInitialLoading, setGlobalInitialLoading] = useState(true);

    const loadAudit = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/surveys/${surveyId}/score-audit`);
            if (!res.ok) throw new Error(`Failed to load audit: ${res.status}`);
            const json = await res.json();
            setData(json);
            if (json.units?.length > 0 && selectedUnitId == null) {
                setSelectedUnitId(json.units[0].unit_id);
            }
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    const loadGlobalResult = async () => {
        setGlobalInitialLoading(true);
        try {
            const res = await fetch(`/api/surveys/${surveyId}/score-audit-global`);
            if (res.ok) {
                const json = await res.json();
                if (json.cached) setGlobalResult(json.cached);
            }
        } finally {
            setGlobalInitialLoading(false);
        }
    };

    const calculateGlobal = async () => {
        setGlobalLoading(true);
        try {
            const res = await fetch(`/api/surveys/${surveyId}/score-audit-global`, { method: "POST" });
            if (!res.ok) throw new Error(`Calculation failed: ${res.status}`);
            const json = await res.json();
            setGlobalResult(json);
            toast.success("Global SSI comparison calculated and saved.");
        } catch (e: any) {
            toast.error("Calculation failed: " + e.message);
        } finally {
            setGlobalLoading(false);
        }
    };

    useEffect(() => {
        loadAudit();
        loadGlobalResult();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [surveyId]);

    const handleForceRebuild = async () => {
        setRebuilding(true);
        try {
            // Step 1: clear ONLY survey_quant_cache (and the per-faculty score cache,
            // which also stores micro averages). Other caches (AI dataset, NPS, qual
            // summary, etc.) are left intact so the Executive Insights page and other
            // tabs keep working — they have nothing to do with the SSI calculation.
            const clearRes = await fetch(
                `/api/executive/cache-scores?surveyId=${surveyId}&onlyQuant=true&alsoFaculty=true`,
                { method: "POST" }
            );
            if (!clearRes.ok) throw new Error("Failed to clear cache");

            // Step 2: hit the report endpoint to force a fresh rebuild of the quant cache
            const reportRes = await fetch(`/api/executive/report?surveyId=${surveyId}`);
            if (!reportRes.ok) throw new Error("Failed to rebuild report cache");

            // Step 3: re-fetch the audit so the Cache column reflects the new state
            await loadAudit();
            toast.success("Quant cache rebuilt — Report tab values are now up to date.");
        } catch (e: any) {
            toast.error("Rebuild failed: " + e.message);
        } finally {
            setRebuilding(false);
        }
    };

    const selectedUnit = useMemo(() => {
        if (!data || selectedUnitId == null) return null;
        return data.units.find(u => u.unit_id === selectedUnitId) || null;
    }, [data, selectedUnitId]);

    const filteredColumns = useMemo(() => {
        if (!selectedUnit) return [];
        const q = search.trim().toLowerCase();
        if (!q) return selectedUnit.columns;
        return selectedUnit.columns.filter(c => c.source_column.toLowerCase().includes(q));
    }, [selectedUnit, search]);

    const handleExportCsv = () => {
        if (!data) return;
        const lines: string[] = [];
        lines.push(["Unit", "Short", "Source Column", "Campus", "N", "Sum", "Avg", "Score Rule", "Max", "Included in SSI", "NA count"].join(","));
        for (const u of data.units) {
            for (const c of u.columns) {
                for (const campus of data.campuses) {
                    const s = c.campus_stats[campus];
                    if (!s) continue;
                    const row = [
                        JSON.stringify(u.unit_name),
                        JSON.stringify(u.short_name || ""),
                        JSON.stringify(c.source_column),
                        JSON.stringify(campus),
                        s.n,
                        s.sum,
                        s.avg ?? "",
                        c.score_rule || "",
                        c.max_score,
                        c.included_in_ssi ? "yes" : "no",
                        s.na,
                    ];
                    lines.push(row.join(","));
                }
            }
        }
        const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `score-audit-survey-${surveyId}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const toggleCol = (col: string) => {
        setExpandedColumns(prev => {
            const next = new Set(prev);
            if (next.has(col)) next.delete(col); else next.add(col);
            return next;
        });
    };

    if (loading) {
        return (
            <div className="space-y-4">
                <Skeleton className="h-32 w-full rounded-xl" />
                <Skeleton className="h-64 w-full rounded-xl" />
            </div>
        );
    }

    if (error) {
        return (
            <Card className="border-red-200">
                <CardContent className="p-6 text-red-600 flex items-center gap-2">
                    <AlertCircle className="w-5 h-5" /> {error}
                </CardContent>
            </Card>
        );
    }

    if (!data || data.units.length === 0) {
        return (
            <Card className="border-slate-200">
                <CardContent className="p-8 text-center text-slate-500">
                    No quantitative columns found for this survey.
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="space-y-6">
            {/* Global SSI Index Comparison — independent from per-unit audit load */}
            <Card className="border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                <div className="h-1 bg-gradient-to-r from-indigo-500 to-violet-500" />
                <CardHeader className="pb-3">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <CardTitle className="text-base">Global SSI Index — Aggregation Comparison</CardTitle>
                            <CardDescription>
                                Three ways to roll up unit scores into one university-wide number. Compare against the QA team's figure to identify which method they use.
                            </CardDescription>
                        </div>
                        <Button
                            onClick={calculateGlobal}
                            disabled={globalLoading}
                            className="gap-2 shrink-0"
                            variant={globalResult ? "outline" : "default"}
                        >
                            {globalLoading
                                ? <><Loader2 className="w-4 h-4 animate-spin" /> Calculating…</>
                                : <><Play className="w-4 h-4" /> {globalResult ? "Recalculate" : "Calculate"}</>
                            }
                        </Button>
                    </div>
                </CardHeader>
                <CardContent>
                    {globalInitialLoading ? (
                        <Skeleton className="h-24 w-full rounded-lg" />
                    ) : globalResult ? (
                        <>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500 uppercase tracking-wider">
                                            <th className="text-left py-2 pr-4">Method</th>
                                            <th className="text-right py-2 px-3">Score</th>
                                            <th className="text-left py-2 pl-4 text-slate-400 font-normal normal-case text-[11px]">Formula</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr className="border-b border-slate-100 dark:border-slate-800/50 bg-indigo-50/40 dark:bg-indigo-950/20">
                                            <td className="py-3 pr-4">
                                                <div className="font-semibold text-indigo-800 dark:text-indigo-300">Macroaverage across units</div>
                                                <div className="text-[11px] text-slate-500 mt-0.5">Each unit contributes equally — current Executive page value</div>
                                            </td>
                                            <td className="py-3 px-3 text-right font-mono font-bold text-lg text-indigo-700 dark:text-indigo-300">
                                                {globalResult.macro_units != null ? globalResult.macro_units.toFixed(decimals) : "—"}
                                            </td>
                                            <td className="py-3 pl-4 text-[11px] text-slate-500 font-mono">
                                                avg(unit_ssi) over {globalResult.unitCount} units
                                            </td>
                                        </tr>
                                        <tr className="border-b border-slate-100 dark:border-slate-800/50 bg-blue-50/40 dark:bg-blue-950/20">
                                            <td className="py-3 pr-4">
                                                <div className="font-semibold text-blue-800 dark:text-blue-300">Microaverage (respondent-weighted)</div>
                                                <div className="text-[11px] text-slate-500 mt-0.5">Units with more students have proportionally more weight</div>
                                            </td>
                                            <td className="py-3 px-3 text-right font-mono font-bold text-lg text-blue-700 dark:text-blue-300">
                                                {globalResult.micro_resp != null ? globalResult.micro_resp.toFixed(decimals) : "—"}
                                            </td>
                                            <td className="py-3 pl-4 text-[11px] text-slate-500 font-mono">
                                                Σ(unit_ssi × n) / Σn &nbsp;({globalResult.totalRespondents} respondents)
                                            </td>
                                        </tr>
                                        <tr className="bg-purple-50/40 dark:bg-purple-950/20">
                                            <td className="py-3 pr-4">
                                                <div className="font-semibold text-purple-800 dark:text-purple-300">Macroaverage across Likert columns</div>
                                                <div className="text-[11px] text-slate-500 mt-0.5">Each column contributes equally — units with more questions have no extra weight</div>
                                            </td>
                                            <td className="py-3 px-3 text-right font-mono font-bold text-lg text-purple-700 dark:text-purple-300">
                                                {globalResult.macro_cols != null ? globalResult.macro_cols.toFixed(decimals) : "—"}
                                            </td>
                                            <td className="py-3 pl-4 text-[11px] text-slate-500 font-mono">
                                                avg(col_avg) over {globalResult.totalCols} columns across all units
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                            <p className="text-xs text-slate-500 mt-3">
                                All three use <strong>live raw data</strong>. Last computed: {new Date(globalResult.computedAt).toLocaleString()}.
                            </p>
                        </>
                    ) : (
                        <div className="py-8 text-center text-slate-400 text-sm">
                            Click <strong>Calculate</strong> to compute the three global SSI aggregations from raw data.
                            The result will be saved and loaded instantly on future visits.
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Header card with explainer */}
            <Card className="border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                <div className="h-1 bg-gradient-to-r from-amber-500 to-orange-500" />
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg">
                        <Calculator className="w-5 h-5 text-amber-600" /> Score Audit
                    </CardTitle>
                    <CardDescription>
                        Verify the Satisfaction Index Score calculation column-by-column. Compare the app's <strong>micro-average</strong> (every individual response weighted equally — the method used by SSI) against the <strong>macro-average</strong> (each question weighted equally — what many manual Google Sheets compute).
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900 rounded-xl p-4">
                            <div className="text-xs font-semibold text-blue-700 dark:text-blue-400 uppercase tracking-wider mb-1">Micro-average</div>
                            <div className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                                Σ(all scores) / Σ(all responses). The app's SSI. Every individual response weighted equally.
                            </div>
                        </div>
                        <div className="bg-purple-50 dark:bg-purple-950/30 border border-purple-100 dark:border-purple-900 rounded-xl p-4">
                            <div className="text-xs font-semibold text-purple-700 dark:text-purple-400 uppercase tracking-wider mb-1">Macro-average (columns)</div>
                            <div className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                                avg(column averages). Each <strong>question</strong> contributes equally regardless of N.
                            </div>
                        </div>
                        <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900 rounded-xl p-4">
                            <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider mb-1">Macro-average (respondents)</div>
                            <div className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                                avg(per-respondent avgs). Each <strong>respondent</strong> contributes equally regardless of how many cols they answered.
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-3 items-end">
                        <div className="flex-1 min-w-[260px]">
                            <label className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1 block">Unit</label>
                            <Select value={selectedUnitId?.toString() || ""} onValueChange={v => setSelectedUnitId(parseInt(v))}>
                                <SelectTrigger className="bg-white dark:bg-slate-900">
                                    <SelectValue placeholder="Select a unit" />
                                </SelectTrigger>
                                <SelectContent className="max-h-[400px]">
                                    {data.units.map(u => (
                                        <SelectItem key={u.unit_id} value={u.unit_id.toString()}>
                                            {u.unit_name}
                                            {u.short_name ? ` (${u.short_name})` : ""}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <label className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1 block">Decimals</label>
                            <Select value={decimals.toString()} onValueChange={v => setDecimals(parseInt(v))}>
                                <SelectTrigger className="w-24 bg-white dark:bg-slate-900">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {[2, 3, 4].map(d => (
                                        <SelectItem key={d} value={d.toString()}>{d}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <Button variant="outline" onClick={handleExportCsv} className="gap-2">
                            <Download className="w-4 h-4" /> Export CSV
                        </Button>
                        <Button
                            variant="outline"
                            onClick={handleForceRebuild}
                            disabled={rebuilding || loading}
                            className="gap-2 border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-400"
                        >
                            {rebuilding ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                            Force Cache Rebuild
                        </Button>
                    </div>
                    <p className="text-xs text-slate-500">
                        <strong>Force Cache Rebuild</strong> only refreshes the SSI cache (<code className="text-[10px] bg-slate-100 dark:bg-slate-800 px-1 rounded">survey_quant_cache</code> + <code className="text-[10px] bg-slate-100 dark:bg-slate-800 px-1 rounded">survey_faculty_score_cache</code>) for this survey. AI, NPS, and qualitative caches are left intact, so unrelated pages keep working. Use this after column-mapping changes.
                    </p>
                </CardContent>
            </Card>

            {selectedUnit && (
                <>
                    {/* Unit summary */}
                    <Card className="border-slate-200 dark:border-slate-800 shadow-sm">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base flex items-center justify-between gap-3">
                                <span>{selectedUnit.unit_name}</span>
                                <Badge variant="outline">{selectedUnit.columns.length} column{selectedUnit.columns.length !== 1 ? "s" : ""}</Badge>
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500 uppercase tracking-wider">
                                            <th className="text-left py-2 pr-3">Scope</th>
                                            <th className="text-right py-2 px-3 bg-blue-50/50 dark:bg-blue-950/20">Micro avg<br/><span className="text-[10px] text-slate-400 normal-case font-normal">live raw</span></th>
                                            <th className="text-right py-2 px-3 bg-purple-50/50 dark:bg-purple-950/20">Macro<br/><span className="text-[10px] text-slate-400 normal-case font-normal">by column</span></th>
                                            <th className="text-right py-2 px-3 bg-emerald-50/50 dark:bg-emerald-950/20">Macro<br/><span className="text-[10px] text-slate-400 normal-case font-normal">by respondent</span></th>
                                            <th className="text-right py-2 px-3">Resp N</th>
                                            <th className="text-right py-2 px-3 bg-amber-50/50 dark:bg-amber-950/20">Cache avg<br/><span className="text-[10px] text-slate-400 normal-case font-normal">Report tab</span></th>
                                            <th className="text-right py-2 px-3">Cache N</th>
                                            <th className="text-right py-2 px-3">Resp-macro<br/><span className="text-[10px] text-slate-400 normal-case font-normal">vs Cache</span></th>
                                            <th className="text-right py-2 px-3">N (responses)</th>
                                            <th className="text-right py-2 pl-3">Cols</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.campuses.map(campus => {
                                            const s = selectedUnit.summary.per_campus[campus];
                                            if (!s) return null;
                                            // Cache now stores per-respondent macro (matches the
                                            // Google Sheet convention), so compare against resp_macro.
                                            const cacheDiff = s.resp_macro_avg != null && s.cache_avg != null
                                                ? s.resp_macro_avg - s.cache_avg : null;
                                            // Cache N is now respondent count, not response count.
                                            const nMismatch = s.cache_n != null && s.cache_n !== s.resp_macro_n;
                                            return (
                                                <tr key={campus} className="border-b border-slate-100 dark:border-slate-800/50">
                                                    <td className="py-2 pr-3 font-medium">{campus}</td>
                                                    <td className="py-2 px-3 text-right font-mono bg-blue-50/30 dark:bg-blue-950/10">{fmtAvg(s.micro_avg, decimals)}</td>
                                                    <td className="py-2 px-3 text-right font-mono bg-purple-50/30 dark:bg-purple-950/10">{fmtAvg(s.macro_avg, decimals)}</td>
                                                    <td className="py-2 px-3 text-right font-mono bg-emerald-50/30 dark:bg-emerald-950/10">{fmtAvg(s.resp_macro_avg, decimals)}</td>
                                                    <td className="py-2 px-3 text-right font-mono text-xs text-slate-500">{s.resp_macro_n || "—"}</td>
                                                    <td className="py-2 px-3 text-right font-mono bg-amber-50/30 dark:bg-amber-950/10">{fmtAvg(s.cache_avg, decimals)}</td>
                                                    <td className={cn("py-2 px-3 text-right font-mono text-xs",
                                                        nMismatch ? "text-red-600 font-semibold" : "text-slate-500"
                                                    )}>
                                                        {s.cache_n ?? "—"}
                                                    </td>
                                                    <td className={cn("py-2 px-3 text-right font-mono",
                                                        cacheDiff != null && Math.abs(cacheDiff) >= 0.01 ? "text-red-600 font-semibold" : "text-slate-400"
                                                    )}>
                                                        {cacheDiff != null ? (cacheDiff >= 0 ? "+" : "") + cacheDiff.toFixed(decimals) : "—"}
                                                    </td>
                                                    <td className="py-2 px-3 text-right text-slate-500">{s.n}</td>
                                                    <td className="py-2 pl-3 text-right text-slate-500">{s.columns_used}</td>
                                                </tr>
                                            );
                                        })}
                                        {/* Overall row */}
                                        {(() => {
                                            const o = selectedUnit.summary.overall;
                                            const cacheDiff = o.micro_avg != null && o.cache_avg != null
                                                ? o.micro_avg - o.cache_avg : null;
                                            return (
                                                <tr className="bg-slate-50 dark:bg-slate-900/40 font-semibold">
                                                    <td className="py-2.5 pr-3">All campuses</td>
                                                    <td className="py-2.5 px-3 text-right font-mono">{fmtAvg(o.micro_avg, decimals)}</td>
                                                    <td className="py-2.5 px-3 text-right font-mono">{fmtAvg(o.macro_avg, decimals)}</td>
                                                    <td className="py-2.5 px-3 text-right font-mono">{fmtAvg(o.resp_macro_avg, decimals)}</td>
                                                    <td className="py-2.5 px-3 text-right font-mono text-xs">{o.resp_macro_n || "—"}</td>
                                                    <td className="py-2.5 px-3 text-right font-mono">{fmtAvg(o.cache_avg, decimals)}</td>
                                                    <td className="py-2.5 px-3 text-right font-mono text-xs">{o.cache_n ?? "—"}</td>
                                                    <td className={cn("py-2.5 px-3 text-right font-mono",
                                                        cacheDiff != null && Math.abs(cacheDiff) >= 0.01 ? "text-red-600" : "text-slate-400"
                                                    )}>
                                                        {cacheDiff != null ? (cacheDiff >= 0 ? "+" : "") + cacheDiff.toFixed(decimals) : "—"}
                                                    </td>
                                                    <td className="py-2.5 px-3 text-right">{o.n}</td>
                                                    <td className="py-2.5 pl-3 text-right">{o.columns_used}</td>
                                                </tr>
                                            );
                                        })()}
                                    </tbody>
                                </table>
                            </div>
                            <p className="text-xs text-slate-500 mt-3 leading-relaxed">
                                <strong className="text-slate-700 dark:text-slate-300">Cache avg</strong> is what the Executive Report tab actually displays — stored in <code className="text-[10px] bg-slate-100 dark:bg-slate-800 px-1 rounded">survey_quant_cache</code> as <strong>per-respondent macro</strong> (the Google Sheet convention). A red <strong>Resp-macro vs Cache</strong> diff means the cache is stale — click <strong>Force Cache Rebuild</strong> above to refresh.
                            </p>
                        </CardContent>
                    </Card>

                    {/* Per-column breakdown */}
                    <Card className="border-slate-200 dark:border-slate-800 shadow-sm">
                        <CardHeader className="pb-3">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <CardTitle className="text-base">Column-level Breakdown</CardTitle>
                                    <CardDescription>Expand a column to see the score distribution and N/A count per campus.</CardDescription>
                                </div>
                                <div className="relative w-72">
                                    <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                                    <Input
                                        placeholder="Filter columns..."
                                        className="pl-8 h-9 text-sm"
                                        value={search}
                                        onChange={e => setSearch(e.target.value)}
                                    />
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-2">
                                {filteredColumns.length === 0 && (
                                    <div className="text-sm text-slate-400 py-6 text-center">No columns match the filter.</div>
                                )}
                                {filteredColumns.map(col => {
                                    const expanded = expandedColumns.has(col.source_column);
                                    return (
                                        <div
                                            key={col.source_column}
                                            className={cn(
                                                "border rounded-xl overflow-hidden transition-all",
                                                col.included_in_ssi
                                                    ? "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950"
                                                    : "border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 opacity-75"
                                            )}
                                        >
                                            <div
                                                className="p-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900/50"
                                                onClick={() => toggleCol(col.source_column)}
                                            >
                                                <div className="flex items-start gap-3">
                                                    <div className="mt-0.5">
                                                        {expanded
                                                            ? <ChevronDown className="w-4 h-4 text-slate-500" />
                                                            : <ChevronRight className="w-4 h-4 text-slate-400" />
                                                        }
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2 flex-wrap mb-1">
                                                            <span className="text-sm font-medium text-slate-800 dark:text-slate-200 break-words">
                                                                {col.source_column}
                                                            </span>
                                                            {col.included_in_ssi ? (
                                                                <Badge className="bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400 text-[10px]">In SSI</Badge>
                                                            ) : (
                                                                <Badge variant="outline" className="text-[10px] text-slate-500">Excluded: {col.exclusion_reason}</Badge>
                                                            )}
                                                            {col.score_rule && (
                                                                <Badge variant="outline" className="text-[10px] text-slate-500">{col.score_rule}</Badge>
                                                            )}
                                                            {col.subgroup_name && (
                                                                <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 text-[10px] border border-amber-200 dark:border-amber-800">
                                                                    Subgroup: {col.subgroup_name}
                                                                </Badge>
                                                            )}
                                                        </div>
                                                        <div className="flex gap-4 text-xs text-slate-500">
                                                            <span>N = <span className="font-mono font-medium text-slate-700 dark:text-slate-300">{col.total.n}</span></span>
                                                            <span>Avg = <span className="font-mono font-medium text-slate-700 dark:text-slate-300">{fmtAvg(col.total.avg, decimals)}</span></span>
                                                            <span>Max = <span className="font-mono">{col.max_score}</span></span>
                                                            {col.total.na > 0 && <span className="text-amber-600">N/A = {col.total.na}</span>}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            {expanded && (
                                                <div className="border-t border-slate-200 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-900/30 p-4">
                                                    <div className="overflow-x-auto">
                                                        <table className="w-full text-xs">
                                                            <thead>
                                                                <tr className="text-slate-500 uppercase tracking-wider">
                                                                    <th className="text-left py-1.5 pr-3">Campus</th>
                                                                    <th className="text-right py-1.5 px-2">N</th>
                                                                    <th className="text-right py-1.5 px-2">Sum</th>
                                                                    <th className="text-right py-1.5 px-2">Avg</th>
                                                                    <th className="text-right py-1.5 px-2">N/A</th>
                                                                    <th className="text-right py-1.5 px-2 text-slate-400">Distribution</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {data.campuses.map(campus => {
                                                                    const s = col.campus_stats[campus];
                                                                    if (!s) {
                                                                        return (
                                                                            <tr key={campus} className="border-t border-slate-200/60 dark:border-slate-800/60 text-slate-300">
                                                                                <td className="py-1.5 pr-3">{campus}</td>
                                                                                <td colSpan={5} className="py-1.5 px-2 text-right italic">no data</td>
                                                                            </tr>
                                                                        );
                                                                    }
                                                                    const distEntries = Object.entries(s.distribution).sort(([a], [b]) => parseFloat(a) - parseFloat(b));
                                                                    return (
                                                                        <tr key={campus} className="border-t border-slate-200/60 dark:border-slate-800/60">
                                                                            <td className="py-1.5 pr-3 font-medium">{campus}</td>
                                                                            <td className="py-1.5 px-2 text-right font-mono">{s.n}</td>
                                                                            <td className="py-1.5 px-2 text-right font-mono text-slate-500">{s.sum}</td>
                                                                            <td className="py-1.5 px-2 text-right font-mono font-semibold">{fmtAvg(s.avg, decimals)}</td>
                                                                            <td className="py-1.5 px-2 text-right font-mono text-amber-600">{s.na || ""}</td>
                                                                            <td className="py-1.5 px-2 text-right font-mono text-slate-400">
                                                                                {distEntries.map(([k, v]) => `${k}×${v}`).join(" · ")}
                                                                            </td>
                                                                        </tr>
                                                                    );
                                                                })}
                                                                <tr className="border-t border-slate-300 dark:border-slate-700 bg-white/60 dark:bg-slate-900/40 font-semibold">
                                                                    <td className="py-1.5 pr-3">Total</td>
                                                                    <td className="py-1.5 px-2 text-right font-mono">{col.total.n}</td>
                                                                    <td className="py-1.5 px-2 text-right font-mono">{col.total.sum}</td>
                                                                    <td className="py-1.5 px-2 text-right font-mono">{fmtAvg(col.total.avg, decimals)}</td>
                                                                    <td className="py-1.5 px-2 text-right font-mono text-amber-600">{col.total.na || ""}</td>
                                                                    <td className="py-1.5 px-2 text-right font-mono text-slate-400">
                                                                        {Object.entries(col.total.distribution).sort(([a], [b]) => parseFloat(a) - parseFloat(b)).map(([k, v]) => `${k}×${v}`).join(" · ")}
                                                                    </td>
                                                                </tr>
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </CardContent>
                    </Card>
                </>
            )}
        </div>
    );
}
