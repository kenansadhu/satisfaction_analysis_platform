"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useTheme } from "next-themes";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowUpRight, ArrowDownLeft, ArrowLeftRight, Sparkles, Loader2, Search, X, Lightbulb, Target } from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────
type UnitAgg = { unit_id: number; unit_name: string; positive: number; negative: number; neutral: number; total: number };
type OutgoingSeg = { id: number; segment_text: string; sentiment: string; category_name: string; tagged_units: string; related_unit_ids: number[] };
type IncomingSeg = { id: number; segment_text: string; sentiment: string; source_unit_id: number; source_unit_name: string };
type CrossUnitData = {
    outgoing_segments: OutgoingSeg[];
    incoming_segments: IncomingSeg[];
    outgoing_by_target: UnitAgg[];
    incoming_by_source: UnitAgg[];
};
type ActiveFilter = { unitId: number; direction: "incoming" | "outgoing" } | null;

type CrossUnitReport = {
    headline: string;
    connection_overview: string;
    outgoing_analysis: {
        summary: string;
        top_themes: { theme: string; units: string[]; sentiment: "Positive" | "Negative" | "Mixed" }[];
    };
    incoming_analysis: {
        summary: string;
        top_themes: { theme: string; sources: string[]; sentiment: "Positive" | "Negative" | "Mixed" }[];
    };
    notable_patterns: { title: string; detail: string; type: "Bidirectional" | "Contrast" | "Gap" | "Opportunity" }[];
    recommended_actions: { action: string; rationale: string; priority: "Immediate" | "Short-term" | "Long-term" }[];
    closing_note: string;
};

const SEG_PAGE_SIZE = 20;
const MAX_VIZ_ITEMS = 9;

// ── Hub-and-spoke flow visualization ──────────────────────────────────────────
function FlowViz({
    outgoing, incoming, unitName, activeFilter, onNodeClick, isDark,
}: {
    outgoing: UnitAgg[];
    incoming: UnitAgg[];
    unitName: string;
    activeFilter: ActiveFilter;
    onNodeClick: (unitId: number, direction: "incoming" | "outgoing") => void;
    isDark: boolean;
}) {
    const outItems = outgoing.slice(0, MAX_VIZ_ITEMS);
    const inItems  = incoming.slice(0, MAX_VIZ_ITEMS);
    const n = Math.max(outItems.length, inItems.length, 1);

    // Layout constants
    const W = 640;
    const ROW_H = 46;
    const PAD_Y = 52;
    const H = Math.max(n * ROW_H + PAD_Y * 2, 200);
    const CY = H / 2;

    // Zone: labels stay outside the line corridor
    const IN_CX      = 180;
    const OUT_CX     = W - IN_CX;    // = 460
    const HUB_CX     = W / 2;        // = 320
    const HUB_HALF_W = 60;
    const HUB_HALF_H = 22;
    const HUB_RX     = 10;
    const PILL_HW    = 20;           // half-width used for line connections & label spacing
    const PILL_HH    = 11;           // half-height → pill is 22px tall
    const PILL_RX    = 11;           // fully-rounded pill
    const pillW = (count: number) => Math.max(PILL_HW * 2, String(count).length * 6 + 18);
    const MID_IN  = (IN_CX + PILL_HW + HUB_CX - HUB_HALF_W) / 2;
    const MID_OUT = (HUB_CX + HUB_HALF_W + OUT_CX - PILL_HW) / 2;

    const maxTotal = Math.max(...outItems.map(u => u.total), ...inItems.map(u => u.total), 1);

    // Y position for the i-th node out of `total`
    const getY = (i: number, total: number) => {
        if (total <= 1) return CY;
        return PAD_Y + (i / (total - 1)) * (H - PAD_Y * 2);
    };

    // Fan hub attachment points so lines don't all stack on one spot
    const hubY = (i: number, total: number) => {
        if (total <= 1) return CY;
        const spread = Math.min(HUB_HALF_H * 0.8, 16);
        return CY + (i - (total - 1) / 2) * ((spread * 2) / Math.max(total - 1, 1));
    };

    // Split hub label into at most 2 lines, breaking at a word boundary near the midpoint
    const hubLines = (s: string): [string, string | null] => {
        if (s.length <= 14) return [s, null];
        const mid = Math.ceil(s.length / 2);
        let bp = s.lastIndexOf(' ', mid);
        if (bp <= 1) bp = s.indexOf(' ', mid);
        if (bp <= 1) return [s.slice(0, 13) + '…', null];
        const l1 = s.slice(0, bp);
        const l2 = s.slice(bp + 1);
        return [
            l1.length > 14 ? l1.slice(0, 13) + '…' : l1,
            l2.length > 14 ? l2.slice(0, 13) + '…' : l2,
        ];
    };

    const lineW = (count: number) => 1.5 + (count / maxTotal) * 5;

    const isActive  = (uid: number, dir: "incoming" | "outgoing") => activeFilter?.unitId === uid && activeFilter.direction === dir;
    const isDimmed  = (uid: number, dir: "incoming" | "outgoing") => activeFilter !== null && !isActive(uid, dir);
    const short     = (s: string, max = 22) => s.length > max ? s.slice(0, max - 1) + '…' : s;
    const countStr  = (n: number) => String(n);
    const [hubL1, hubL2] = hubLines(unitName);

    // Theme-aware text colours
    const tc  = isDark ? "#cbd5e1" : "#1e293b";    // normal label
    const dim = isDark ? "#334155" : "#e2e8f0";    // dimmed label

    return (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minHeight: 180 }}>

            {/* ── Incoming bezier lines ── */}
            {inItems.map((u, i) => {
                const ny = getY(i, inItems.length);
                const hy = hubY(i, inItems.length);
                const act = isActive(u.unit_id, "incoming");
                const dimd = isDimmed(u.unit_id, "incoming");
                const w = lineW(u.total);
                return (
                    <path key={`li-${u.unit_id}`}
                        d={`M${IN_CX + PILL_HW},${ny} C${MID_IN},${ny} ${MID_IN},${hy} ${HUB_CX - HUB_HALF_W},${hy}`}
                        fill="none"
                        stroke="#14b8a6"
                        strokeWidth={act ? w + 2 : w}
                        strokeOpacity={dimd ? 0.07 : act ? 0.9 : 0.38}
                        style={{ transition: "all 0.2s", pointerEvents: "none" }}
                    />
                );
            })}

            {/* ── Outgoing bezier lines ── */}
            {outItems.map((u, i) => {
                const ny = getY(i, outItems.length);
                const hy = hubY(i, outItems.length);
                const act = isActive(u.unit_id, "outgoing");
                const dimd = isDimmed(u.unit_id, "outgoing");
                const w = lineW(u.total);
                return (
                    <path key={`lo-${u.unit_id}`}
                        d={`M${HUB_CX + HUB_HALF_W},${hy} C${MID_OUT},${hy} ${MID_OUT},${ny} ${OUT_CX - PILL_HW},${ny}`}
                        fill="none"
                        stroke="#f59e0b"
                        strokeWidth={act ? w + 2 : w}
                        strokeOpacity={dimd ? 0.07 : act ? 0.9 : 0.38}
                        style={{ transition: "all 0.2s", pointerEvents: "none" }}
                    />
                );
            })}

            {/* ── Hub ── */}
            <rect x={HUB_CX - HUB_HALF_W - 5} y={CY - HUB_HALF_H - 5}
                width={HUB_HALF_W * 2 + 10} height={HUB_HALF_H * 2 + 10}
                rx={HUB_RX + 3} fill="#6366f1" fillOpacity={0.12} />
            <rect x={HUB_CX - HUB_HALF_W} y={CY - HUB_HALF_H}
                width={HUB_HALF_W * 2} height={HUB_HALF_H * 2}
                rx={HUB_RX} fill="#6366f1" />
            {hubL2 ? (
                <>
                    <text textAnchor="middle" x={HUB_CX} y={CY - 5}
                        dominantBaseline="middle" fontSize={8.5} fontWeight="500"
                        fill="white" style={{ userSelect: "none" }}>{hubL1}</text>
                    <text textAnchor="middle" x={HUB_CX} y={CY + 9}
                        dominantBaseline="middle" fontSize={8.5} fontWeight="500"
                        fill="white" style={{ userSelect: "none" }}>{hubL2}</text>
                </>
            ) : (
                <text textAnchor="middle" x={HUB_CX} y={CY}
                    dominantBaseline="middle" fontSize={9} fontWeight="500"
                    fill="white" style={{ userSelect: "none" }}>{hubL1}</text>
            )}

            {/* ── Incoming nodes (left) ── */}
            {inItems.map((u, i) => {
                const ny = getY(i, inItems.length);
                const act = isActive(u.unit_id, "incoming");
                const dimd = isDimmed(u.unit_id, "incoming");
                const labelFill = dimd ? dim : act ? "#0d9488" : tc;
                return (
                    <g key={`ni-${u.unit_id}`} style={{ cursor: "pointer" }} onClick={() => onNodeClick(u.unit_id, "incoming")}>
                        <rect x={0} y={ny - PILL_HH - 4} width={IN_CX + PILL_HW + 4} height={(PILL_HH + 4) * 2} fill="transparent" />
                        <text
                            x={IN_CX - PILL_HW - 10} y={ny}
                            textAnchor="end" dominantBaseline="middle"
                            fontSize={9} fontWeight={act ? "500" : "400"}
                            fill={labelFill}
                            style={{ transition: "fill 0.2s", userSelect: "none" }}
                        >
                            {short(u.unit_name, 20)}
                        </text>
                        <rect
                            x={IN_CX - pillW(u.total) / 2} y={ny - PILL_HH}
                            width={pillW(u.total)} height={PILL_HH * 2} rx={PILL_RX}
                            fill="#14b8a6" fillOpacity={dimd ? 0.18 : act ? 1 : 0.72}
                            stroke={act ? "#0d9488" : isDark ? "#1e293b" : "white"} strokeWidth={act ? 2 : 1}
                            style={{ transition: "all 0.2s" }}
                        />
                        <text textAnchor="middle" x={IN_CX} y={ny}
                            dominantBaseline="middle" fontSize={8.5} fontWeight="600"
                            fill="white" fillOpacity={dimd ? 0.3 : 1}
                            style={{ userSelect: "none", pointerEvents: "none" }}
                        >
                            {countStr(u.total)}
                        </text>
                    </g>
                );
            })}

            {/* ── Outgoing nodes (right) ── */}
            {outItems.map((u, i) => {
                const ny = getY(i, outItems.length);
                const act = isActive(u.unit_id, "outgoing");
                const dimd = isDimmed(u.unit_id, "outgoing");
                const labelFill = dimd ? dim : act ? "#d97706" : tc;
                return (
                    <g key={`no-${u.unit_id}`} style={{ cursor: "pointer" }} onClick={() => onNodeClick(u.unit_id, "outgoing")}>
                        <rect x={OUT_CX - PILL_HW - 4} y={ny - PILL_HH - 4} width={W - (OUT_CX - PILL_HW - 4)} height={(PILL_HH + 4) * 2} fill="transparent" />
                        <rect
                            x={OUT_CX - pillW(u.total) / 2} y={ny - PILL_HH}
                            width={pillW(u.total)} height={PILL_HH * 2} rx={PILL_RX}
                            fill="#f59e0b" fillOpacity={dimd ? 0.18 : act ? 1 : 0.72}
                            stroke={act ? "#d97706" : isDark ? "#1e293b" : "white"} strokeWidth={act ? 2 : 1}
                            style={{ transition: "all 0.2s" }}
                        />
                        <text textAnchor="middle" x={OUT_CX} y={ny}
                            dominantBaseline="middle" fontSize={8.5} fontWeight="600"
                            fill="white" fillOpacity={dimd ? 0.3 : 1}
                            style={{ userSelect: "none", pointerEvents: "none" }}
                        >
                            {countStr(u.total)}
                        </text>
                        <text
                            x={OUT_CX + PILL_HW + 10} y={ny}
                            textAnchor="start" dominantBaseline="middle"
                            fontSize={9} fontWeight={act ? "500" : "400"}
                            fill={labelFill}
                            style={{ transition: "fill 0.2s", userSelect: "none" }}
                        >
                            {short(u.unit_name, 20)}
                        </text>
                    </g>
                );
            })}

            {/* ── Column headers ── */}
            <text x={IN_CX} y={16} textAnchor="middle" fontSize={9} fontWeight="600"
                fill={isDark ? "#5eead4" : "#0d9488"} style={{ userSelect: "none" }}>
                INCOMING
            </text>
            <text x={OUT_CX} y={16} textAnchor="middle" fontSize={9} fontWeight="600"
                fill={isDark ? "#fcd34d" : "#d97706"} style={{ userSelect: "none" }}>
                OUTGOING
            </text>
        </svg>
    );
}

// ── Sentiment bar ──────────────────────────────────────────────────────────────
function SentBar({ pos, neg, neu, total }: { pos: number; neg: number; neu: number; total: number }) {
    const pp = total > 0 ? (pos / total) * 100 : 0;
    const np = total > 0 ? (neg / total) * 100 : 0;
    const nup = total > 0 ? (neu / total) * 100 : 0;
    return (
        <div className="flex-1 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden flex">
            <div className="h-full bg-emerald-500" style={{ width: `${pp}%` }} />
            <div className="h-full bg-slate-300 dark:bg-slate-600" style={{ width: `${nup}%` }} />
            <div className="h-full bg-red-500" style={{ width: `${np}%` }} />
        </div>
    );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function CrossUnitSignals({ unitId, surveyId, unitName }: {
    unitId: string; surveyId: string; unitName: string;
}) {
    const { theme, systemTheme } = useTheme();
    const isDark = theme === "dark" || (theme === "system" && systemTheme === "dark");

    const [loading, setLoading]       = useState(true);
    const [data, setData]             = useState<CrossUnitData | null>(null);
    const [activeTab, setActiveTab]   = useState<"outgoing" | "incoming">("outgoing");
    const [activeFilter, setActiveFilter] = useState<ActiveFilter>(null);
    const [segSearch, setSegSearch]   = useState("");
    const [segPage, setSegPage]       = useState(0);
    const [aiReport, setAiReport]     = useState<CrossUnitReport | null>(null);
    const [aiLoading, setAiLoading]   = useState(false);
    const [aiError, setAiError]       = useState<string | null>(null);

    useEffect(() => {
        if (!unitId || !surveyId) return;
        setLoading(true);
        setData(null);
        setActiveFilter(null);
        setAiReport(null);
        fetch(`/api/unit-insights/cross-unit-signals?unitId=${unitId}&surveyId=${surveyId}`)
            .then(r => r.json())
            .then(d => setData(d))
            .catch(() => setData(null))
            .finally(() => setLoading(false));
    }, [unitId, surveyId]);

    // Load persisted AI report for this unit + survey
    useEffect(() => {
        if (!unitId || !surveyId) return;
        supabase
            .from("unit_ai_reports")
            .select("content")
            .eq("unit_id", unitId)
            .eq("report_type", `cross_unit_${surveyId}`)
            .maybeSingle()
            .then(({ data }) => {
                if (data?.content?.report) setAiReport(data.content.report as CrossUnitReport);
            });
    }, [unitId, surveyId]);

    // Auto-switch tab to match filter direction
    useEffect(() => {
        if (!activeFilter) return;
        setActiveTab(activeFilter.direction);
        setSegPage(0);
    }, [activeFilter]);

    const handleNodeClick = useCallback((uid: number, dir: "incoming" | "outgoing") => {
        setActiveFilter(prev =>
            prev?.unitId === uid && prev.direction === dir ? null : { unitId: uid, direction: dir }
        );
        setSegPage(0);
    }, []);

    const generateAI = useCallback(async () => {
        if (!data) return;
        setAiLoading(true);
        setAiError(null);
        try {
            const outgoingSample = data.outgoing_segments.slice(0, 20)
                .map(s => `[${s.sentiment}] (→${s.tagged_units}) "${s.segment_text}"`);
            const incomingSample = data.incoming_segments.slice(0, 20)
                .map(s => `[${s.sentiment}] (from ${s.source_unit_name}) "${s.segment_text}"`);
            const res = await fetch("/api/unit-insights/cross-unit-summary", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    unitName,
                    outgoingByTarget: data.outgoing_by_target,
                    incomingBySource: data.incoming_by_source,
                    outgoingSample,
                    incomingSample,
                }),
            });
            const json = await res.json();
            if (json.error) {
                setAiError(json.error);
            } else {
                const report = json.report as CrossUnitReport;
                setAiReport(report);
                await supabase.from("unit_ai_reports").upsert(
                    { unit_id: unitId, report_type: `cross_unit_${surveyId}`, content: { report } },
                    { onConflict: "unit_id,report_type" }
                );
            }
        } catch {
            setAiError("Failed to generate analysis. Please try again.");
        } finally {
            setAiLoading(false);
        }
    }, [data, unitName, unitId, surveyId]);

    // ── Loading ───────────────────────────────────────────────────────────────
    if (loading) return (
        <div className="flex justify-center items-center py-20 text-slate-400 gap-2">
            <Loader2 className="w-7 h-7 animate-spin" />
            <span>Loading cross-unit signals…</span>
        </div>
    );

    // ── Cache not built ───────────────────────────────────────────────────────
    if ((data as any)?.cacheEmpty) return (
        <div className="flex flex-col items-center gap-4 py-24 text-slate-400">
            <ArrowLeftRight className="w-14 h-14 opacity-15" />
            <p className="text-sm font-semibold text-slate-500">Cache not built yet</p>
            <p className="text-xs text-center max-w-sm leading-relaxed">
                Go to <span className="font-semibold text-slate-600 dark:text-slate-300">Settings → Rebuild Cache</span> to populate this tab.
                Cross-unit signals are computed once per survey during the cache build.
            </p>
        </div>
    );

    // ── No data ───────────────────────────────────────────────────────────────
    if (!data || (data.outgoing_segments.length === 0 && data.incoming_segments.length === 0)) return (
        <div className="flex flex-col items-center gap-4 py-24 text-slate-400">
            <ArrowLeftRight className="w-14 h-14 opacity-15" />
            <p className="text-sm font-semibold text-slate-500">No cross-unit signals for this unit</p>
            <p className="text-xs text-center max-w-xs leading-relaxed">
                No cross-unit mentions were detected. Students here didn't reference other departments,
                and no other departments referenced this unit.
            </p>
        </div>
    );

    // ── Derived values ────────────────────────────────────────────────────────
    const totalOut = data.outgoing_segments.length;
    const totalIn  = data.incoming_segments.length;
    const connectedUnits = new Set([
        ...data.outgoing_by_target.map(u => u.unit_id),
        ...data.incoming_by_source.map(u => u.unit_id),
    ]).size;
    const bidirCount = data.outgoing_by_target.filter(o =>
        data.incoming_by_source.some(inc => inc.unit_id === o.unit_id)
    ).length;

    // ── Segment filtering ─────────────────────────────────────────────────────
    const lower = segSearch.toLowerCase();
    const baseSegs = activeTab === "outgoing" ? data.outgoing_segments : data.incoming_segments;
    const activeSegs = baseSegs.filter(s => {
        // direction filter
        if (activeFilter) {
            if (activeTab === "outgoing") {
                if (activeFilter.direction !== "outgoing") return false;
                if (!(s as OutgoingSeg).related_unit_ids.includes(activeFilter.unitId)) return false;
            } else {
                if (activeFilter.direction !== "incoming") return false;
                if ((s as IncomingSeg).source_unit_id !== activeFilter.unitId) return false;
            }
        }
        // search
        if (lower) {
            const haystack = activeTab === "outgoing"
                ? `${s.segment_text} ${(s as OutgoingSeg).tagged_units}`.toLowerCase()
                : `${s.segment_text} ${(s as IncomingSeg).source_unit_name}`.toLowerCase();
            return haystack.includes(lower);
        }
        return true;
    });
    const pagedSegs = activeSegs.slice(segPage * SEG_PAGE_SIZE, (segPage + 1) * SEG_PAGE_SIZE);

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">

            {/* ── Hero stats ─────────────────────────────────────────────────── */}
            <div className="grid grid-cols-3 gap-4">
                {[
                    { label: "Outgoing", value: totalOut, sub: `${data.outgoing_by_target.length} unit${data.outgoing_by_target.length !== 1 ? "s" : ""} mentioned`, icon: <ArrowUpRight className="w-4 h-4 text-amber-500" />, color: "text-amber-600 dark:text-amber-400" },
                    { label: "Incoming", value: totalIn,  sub: `${data.incoming_by_source.length} source unit${data.incoming_by_source.length !== 1 ? "s" : ""}`, icon: <ArrowDownLeft className="w-4 h-4 text-teal-500" />, color: "text-teal-600 dark:text-teal-400" },
                    { label: "Connected", value: connectedUnits, sub: `${bidirCount} bidirectional link${bidirCount !== 1 ? "s" : ""}`, icon: <ArrowLeftRight className="w-4 h-4 text-indigo-500" />, color: "text-indigo-600 dark:text-indigo-400" },
                ].map(({ label, value, sub, icon, color }) => (
                    <div key={label} className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
                        <div className="flex items-center gap-2 mb-2">{icon}<p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">{label}</p></div>
                        <p className={`text-4xl font-black tabular-nums ${color}`}>{value}</p>
                        <p className="text-xs text-slate-400 mt-1.5">{sub}</p>
                    </div>
                ))}
            </div>

            {/* ── Connection map ─────────────────────────────────────────────── */}
            <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 shadow-sm overflow-hidden">
                <CardHeader className="pb-3 border-b border-slate-100 dark:border-slate-800">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <ArrowLeftRight className="w-4 h-4 text-indigo-500" />
                            <CardTitle className="text-sm text-slate-700 dark:text-slate-200">Connection Map</CardTitle>
                        </div>
                        {activeFilter && (
                            <button
                                onClick={() => setActiveFilter(null)}
                                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                            >
                                <X className="w-3 h-3" /> Clear filter
                            </button>
                        )}
                    </div>
                    <CardDescription className="text-xs dark:text-slate-500">
                        Click any node to filter the comment table below. Line thickness = comment volume.
                    </CardDescription>
                </CardHeader>
                <CardContent className="p-4 pb-3">
                    <FlowViz
                        outgoing={data.outgoing_by_target}
                        incoming={data.incoming_by_source}
                        unitName={unitName}
                        activeFilter={activeFilter}
                        onNodeClick={handleNodeClick}
                        isDark={isDark}
                    />
                    <div className="flex items-center justify-center gap-6 mt-1 text-[11px] text-slate-400">
                        <span className="flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-full bg-teal-500 shrink-0" />
                            Incoming — other units mention this one
                        </span>
                        <span className="flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-full bg-amber-400 shrink-0" />
                            Outgoing — this unit's students mention others
                        </span>
                    </div>
                </CardContent>
            </Card>

            {/* ── Two-column breakdown ────────────────────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card className="border-amber-200 dark:border-amber-900/40 shadow-sm">
                    <CardHeader className="pb-3 border-b border-amber-100 dark:border-amber-900/30 bg-amber-50/60 dark:bg-amber-950/20 rounded-t-lg">
                        <div className="flex items-center gap-2">
                            <ArrowUpRight className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                            <CardTitle className="text-sm text-amber-900 dark:text-amber-100">Outgoing Mentions</CardTitle>
                            <Badge className="text-[10px] bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-700 ml-auto">{totalOut}</Badge>
                        </div>
                        <CardDescription className="text-amber-700/70 dark:text-amber-500/70 text-[11px]">This unit's students mentioning other departments</CardDescription>
                    </CardHeader>
                    <CardContent className="p-3 space-y-1.5">
                        {data.outgoing_by_target.map(u => (
                            <div key={u.unit_id} className="flex items-center gap-2 py-0.5">
                                <span className="text-xs text-slate-700 dark:text-slate-300 w-40 shrink-0 truncate" title={u.unit_name}>{u.unit_name}</span>
                                <SentBar pos={u.positive} neg={u.negative} neu={u.neutral} total={u.total} />
                                <span className="text-xs font-bold text-amber-600 dark:text-amber-400 w-7 text-right tabular-nums shrink-0">{u.total}</span>
                            </div>
                        ))}
                        {data.outgoing_by_target.length === 0 && <p className="text-xs text-slate-400 py-4 text-center">No outgoing mentions</p>}
                        <div className="flex items-center gap-4 pt-2 text-[10px] text-slate-400 border-t border-slate-100 dark:border-slate-800">
                            <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />Positive</span>
                            <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-slate-600" />Neutral</span>
                            <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-red-500" />Negative</span>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-teal-200 dark:border-teal-900/40 shadow-sm">
                    <CardHeader className="pb-3 border-b border-teal-100 dark:border-teal-900/30 bg-teal-50/60 dark:bg-teal-950/20 rounded-t-lg">
                        <div className="flex items-center gap-2">
                            <ArrowDownLeft className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                            <CardTitle className="text-sm text-teal-900 dark:text-teal-100">Incoming Mentions</CardTitle>
                            <Badge className="text-[10px] bg-teal-100 text-teal-700 border-teal-300 dark:bg-teal-900/40 dark:text-teal-300 dark:border-teal-700 ml-auto">{totalIn}</Badge>
                        </div>
                        <CardDescription className="text-teal-700/70 dark:text-teal-500/70 text-[11px]">Students from other departments mentioning this unit</CardDescription>
                    </CardHeader>
                    <CardContent className="p-3 space-y-1.5">
                        {data.incoming_by_source.map(u => (
                            <div key={u.unit_id} className="flex items-center gap-2 py-0.5">
                                <span className="text-xs text-slate-700 dark:text-slate-300 w-40 shrink-0 truncate" title={u.unit_name}>{u.unit_name}</span>
                                <SentBar pos={u.positive} neg={u.negative} neu={u.neutral} total={u.total} />
                                <span className="text-xs font-bold text-teal-600 dark:text-teal-400 w-7 text-right tabular-nums shrink-0">{u.total}</span>
                            </div>
                        ))}
                        {data.incoming_by_source.length === 0 && <p className="text-xs text-slate-400 py-4 text-center">No incoming mentions</p>}
                        <div className="flex items-center gap-4 pt-2 text-[10px] text-slate-400 border-t border-slate-100 dark:border-slate-800">
                            <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />Positive</span>
                            <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-slate-600" />Neutral</span>
                            <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-red-500" />Negative</span>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* ── AI Analysis ────────────────────────────────────────────────── */}
            <Card className="border-violet-200 dark:border-violet-900/40 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
                <div className="h-0.5 bg-gradient-to-r from-violet-500 via-fuchsia-500 to-pink-500" />
                <CardHeader className="pb-3 border-b border-violet-100 dark:border-violet-900/30">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Sparkles className="w-4 h-4 text-violet-500" />
                            <CardTitle className="text-sm text-slate-800 dark:text-slate-100">AI Analysis</CardTitle>
                        </div>
                        {!aiReport ? (
                            <Button size="sm" variant="outline"
                                className="h-7 text-xs border-violet-300 text-violet-700 hover:bg-violet-50 dark:border-violet-700 dark:text-violet-300 dark:hover:bg-violet-950/30"
                                onClick={generateAI} disabled={aiLoading}>
                                {aiLoading ? <><Loader2 className="w-3 h-3 animate-spin mr-1" />Analyzing…</> : <><Sparkles className="w-3 h-3 mr-1" />Generate Analysis</>}
                            </Button>
                        ) : (
                            <Button size="sm" variant="ghost" className="h-7 text-xs text-slate-400"
                                onClick={() => { setAiReport(null); generateAI(); }} disabled={aiLoading}>
                                {aiLoading && <Loader2 className="w-3 h-3 animate-spin mr-1" />}Regenerate
                            </Button>
                        )}
                    </div>
                    <CardDescription className="text-xs dark:text-slate-500">Structured analysis combining incoming and outgoing signals</CardDescription>
                </CardHeader>
                <CardContent className="pt-5 pb-6 px-5">
                    {aiError && <p className="text-xs text-red-500 dark:text-red-400">{aiError}</p>}
                    {aiLoading && !aiReport && (
                        <div className="flex items-center gap-2 text-slate-400 py-3">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span className="text-sm animate-pulse">Synthesizing cross-unit analysis…</span>
                        </div>
                    )}
                    {!aiReport && !aiLoading && !aiError && (
                        <p className="text-xs text-slate-400 py-1">Click "Generate Analysis" for a structured AI breakdown of this unit's cross-unit relationships.</p>
                    )}
                    {aiReport && (
                        <div className="space-y-5">
                            {/* Headline + overview */}
                            <div className="bg-violet-50/60 dark:bg-violet-950/20 rounded-xl px-5 py-4 border border-violet-100 dark:border-violet-900/30">
                                <p className="text-base font-semibold text-violet-900 dark:text-violet-100 italic mb-2 leading-snug">{aiReport.headline}</p>
                                <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{aiReport.connection_overview}</p>
                            </div>

                            {/* Outgoing + Incoming analysis */}
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                                <div className="rounded-xl border border-amber-200 dark:border-amber-900/40 bg-amber-50/40 dark:bg-amber-950/10 p-4">
                                    <div className="flex items-center gap-1.5 mb-2">
                                        <ArrowUpRight className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                                        <span className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-widest">Outgoing signals</span>
                                    </div>
                                    <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed mb-3">{aiReport.outgoing_analysis.summary}</p>
                                    <div className="flex flex-wrap gap-1.5">
                                        {aiReport.outgoing_analysis.top_themes.map((t, i) => (
                                            <span key={i} className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                                t.sentiment === "Positive" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400" :
                                                t.sentiment === "Negative" ? "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400" :
                                                "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                                            }`}>{t.theme}</span>
                                        ))}
                                    </div>
                                </div>
                                <div className="rounded-xl border border-teal-200 dark:border-teal-900/40 bg-teal-50/40 dark:bg-teal-950/10 p-4">
                                    <div className="flex items-center gap-1.5 mb-2">
                                        <ArrowDownLeft className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                                        <span className="text-xs font-semibold text-teal-700 dark:text-teal-400 uppercase tracking-widest">Incoming signals</span>
                                    </div>
                                    <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed mb-3">{aiReport.incoming_analysis.summary}</p>
                                    <div className="flex flex-wrap gap-1.5">
                                        {aiReport.incoming_analysis.top_themes.map((t, i) => (
                                            <span key={i} className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                                t.sentiment === "Positive" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400" :
                                                t.sentiment === "Negative" ? "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400" :
                                                "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                                            }`}>{t.theme}</span>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Notable patterns */}
                            {aiReport.notable_patterns.length > 0 && (
                                <div className="space-y-2">
                                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                                        <Lightbulb className="w-3.5 h-3.5 text-amber-500" /> Notable Patterns
                                    </p>
                                    {aiReport.notable_patterns.map((p, i) => {
                                        const typeStyle: Record<string, string> = {
                                            Bidirectional: "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/30 dark:text-indigo-400",
                                            Contrast:      "bg-orange-50 text-orange-700 dark:bg-orange-950/30 dark:text-orange-400",
                                            Gap:           "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400",
                                            Opportunity:   "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400",
                                        };
                                        return (
                                            <div key={i} className="flex gap-3 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/30 px-4 py-3">
                                                <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full shrink-0 self-start mt-0.5 ${typeStyle[p.type] ?? "bg-slate-100 text-slate-600"}`}>{p.type}</span>
                                                <div>
                                                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-0.5">{p.title}</p>
                                                    <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">{p.detail}</p>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {/* Recommended actions */}
                            {aiReport.recommended_actions.length > 0 && (
                                <div className="space-y-2">
                                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                                        <Target className="w-3.5 h-3.5 text-violet-500" /> Recommended Actions
                                    </p>
                                    {aiReport.recommended_actions.map((a, i) => {
                                        const priStyle: Record<string, string> = {
                                            Immediate:    "bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-400",
                                            "Short-term": "bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400",
                                            "Long-term":  "bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400",
                                        };
                                        return (
                                            <div key={i} className="flex gap-3 rounded-lg border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3">
                                                <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full shrink-0 self-start mt-0.5 ${priStyle[a.priority] ?? "bg-slate-100 text-slate-600"}`}>{a.priority}</span>
                                                <div>
                                                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-0.5">{a.action}</p>
                                                    <p className="text-sm text-slate-400 dark:text-slate-500 leading-relaxed">{a.rationale}</p>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {/* Closing note */}
                            {aiReport.closing_note && (
                                <p className="text-sm italic text-slate-400 dark:text-slate-500 text-center pt-2 border-t border-slate-100 dark:border-slate-800">
                                    &ldquo;{aiReport.closing_note}&rdquo;
                                </p>
                            )}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* ── Segment browser ────────────────────────────────────────────── */}
            <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
                {/* Tab bar */}
                <div className="flex items-center justify-between px-4 pt-0 border-b border-slate-200 dark:border-slate-800">
                    <div className="flex">
                        <button
                            onClick={() => { setActiveTab("outgoing"); setSegPage(0); setSegSearch(""); }}
                            className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === "outgoing" ? "border-amber-500 text-amber-700 dark:text-amber-400" : "border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"}`}
                        >
                            <ArrowUpRight className="w-3.5 h-3.5 inline mr-1.5" />
                            Outgoing ({data.outgoing_segments.length})
                        </button>
                        <button
                            onClick={() => { setActiveTab("incoming"); setSegPage(0); setSegSearch(""); }}
                            className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === "incoming" ? "border-teal-500 text-teal-700 dark:text-teal-400" : "border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"}`}
                        >
                            <ArrowDownLeft className="w-3.5 h-3.5 inline mr-1.5" />
                            Incoming ({data.incoming_segments.length})
                        </button>
                    </div>
                    <div className="relative py-2">
                        <Search className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
                        <Input placeholder="Search…" className="h-7 pl-7 text-xs w-40 dark:bg-slate-800 dark:border-slate-700"
                            value={segSearch} onChange={e => { setSegSearch(e.target.value); setSegPage(0); }} />
                    </div>
                </div>

                {/* Filter chips — only units available in the data */}
                <div className="flex flex-wrap items-center gap-1.5 px-4 py-2.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/30">
                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mr-1">Filter</span>
                    <button
                        onClick={() => { setActiveFilter(null); setSegPage(0); }}
                        className={`px-2.5 py-0.5 rounded-full text-xs font-medium border transition-all ${activeFilter === null ? "bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-800 border-slate-800 dark:border-slate-200" : "bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-slate-400"}`}
                    >
                        All
                    </button>

                    {/* Incoming chips (teal) */}
                    {data.incoming_by_source.map(u => {
                        const active = activeFilter?.unitId === u.unit_id && activeFilter.direction === "incoming";
                        return (
                            <button key={`fc-in-${u.unit_id}`}
                                onClick={() => { handleNodeClick(u.unit_id, "incoming"); setSegPage(0); }}
                                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium border transition-all ${active ? "bg-teal-600 text-white border-teal-600" : "bg-white dark:bg-slate-800 text-teal-700 dark:text-teal-400 border-teal-200 dark:border-teal-800 hover:border-teal-400 dark:hover:border-teal-600"}`}
                            >
                                <ArrowDownLeft className="w-2.5 h-2.5" />
                                {u.unit_name.length > 22 ? u.unit_name.slice(0, 21) + '…' : u.unit_name}
                                <span className="font-bold tabular-nums">{u.total}</span>
                            </button>
                        );
                    })}

                    {/* Outgoing chips (amber) */}
                    {data.outgoing_by_target.map(u => {
                        const active = activeFilter?.unitId === u.unit_id && activeFilter.direction === "outgoing";
                        return (
                            <button key={`fc-out-${u.unit_id}`}
                                onClick={() => { handleNodeClick(u.unit_id, "outgoing"); setSegPage(0); }}
                                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium border transition-all ${active ? "bg-amber-500 text-white border-amber-500" : "bg-white dark:bg-slate-800 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800 hover:border-amber-400 dark:hover:border-amber-600"}`}
                            >
                                <ArrowUpRight className="w-2.5 h-2.5" />
                                {u.unit_name.length > 22 ? u.unit_name.slice(0, 21) + '…' : u.unit_name}
                                <span className="font-bold tabular-nums">{u.total}</span>
                            </button>
                        );
                    })}
                </div>

                {/* Active filter label */}
                {activeFilter && (
                    <div className={`flex items-center gap-2 px-4 py-2 text-xs border-b ${activeFilter.direction === "incoming" ? "bg-teal-50/60 dark:bg-teal-950/20 border-teal-100 dark:border-teal-900/30 text-teal-700 dark:text-teal-400" : "bg-amber-50/60 dark:bg-amber-950/20 border-amber-100 dark:border-amber-900/30 text-amber-700 dark:text-amber-400"}`}>
                        {activeFilter.direction === "incoming" ? <ArrowDownLeft className="w-3 h-3" /> : <ArrowUpRight className="w-3 h-3" />}
                        <span className="font-medium">
                            Showing {activeFilter.direction} comments
                            {" "}
                            {activeFilter.direction === "incoming" ? "from" : "about"}
                            {" "}
                            <span className="font-bold">
                                {activeFilter.direction === "incoming"
                                    ? data.incoming_by_source.find(u => u.unit_id === activeFilter.unitId)?.unit_name
                                    : data.outgoing_by_target.find(u => u.unit_id === activeFilter.unitId)?.unit_name}
                            </span>
                        </span>
                        <button onClick={() => setActiveFilter(null)} className="ml-auto hover:opacity-70">
                            <X className="w-3 h-3" />
                        </button>
                    </div>
                )}

                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                            <thead className="bg-slate-50 dark:bg-slate-950/50">
                                <tr>
                                    <th className="text-left p-3 font-medium text-slate-600 dark:text-slate-300 w-[55%]">Comment</th>
                                    <th className="text-left p-3 font-medium text-slate-600 dark:text-slate-300">Sentiment</th>
                                    <th className="text-left p-3 font-medium text-slate-600 dark:text-slate-300">
                                        {activeTab === "outgoing" ? "Mentions" : "From Unit"}
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {pagedSegs.map((seg: any, i: number) => (
                                    <tr key={seg.id || i} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                                        <td className="p-3 text-slate-700 dark:text-slate-300 leading-relaxed">&ldquo;{seg.segment_text}&rdquo;</td>
                                        <td className="p-3">
                                            <span className={`inline-flex items-center gap-1 text-[10px] font-medium ${seg.sentiment === "Positive" ? "text-green-700 dark:text-green-400" : seg.sentiment === "Negative" ? "text-red-700 dark:text-red-400" : "text-slate-500 dark:text-slate-400"}`}>
                                                <span className={`w-1.5 h-1.5 rounded-full ${seg.sentiment === "Positive" ? "bg-green-500" : seg.sentiment === "Negative" ? "bg-red-500" : "bg-slate-400"}`} />
                                                {seg.sentiment}
                                            </span>
                                        </td>
                                        <td className="p-3">
                                            {activeTab === "outgoing"
                                                ? <span className="font-semibold text-amber-700 dark:text-amber-400">{(seg as OutgoingSeg).tagged_units}</span>
                                                : <span className="font-semibold text-teal-700 dark:text-teal-400">{(seg as IncomingSeg).source_unit_name}</span>
                                            }
                                        </td>
                                    </tr>
                                ))}
                                {pagedSegs.length === 0 && (
                                    <tr><td colSpan={3} className="p-8 text-center text-slate-400">No comments match the current filter.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                    <div className="flex items-center justify-between px-4 py-2.5 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-500">
                        <span>
                            {activeSegs.length === 0 ? "0 results" : `${segPage * SEG_PAGE_SIZE + 1}–${Math.min((segPage + 1) * SEG_PAGE_SIZE, activeSegs.length)} of ${activeSegs.length}`}
                        </span>
                        <div className="flex gap-1">
                            <Button variant="outline" size="sm" className="h-6 text-xs" disabled={segPage === 0} onClick={() => setSegPage(p => p - 1)}>Previous</Button>
                            <Button variant="outline" size="sm" className="h-6 text-xs" disabled={(segPage + 1) * SEG_PAGE_SIZE >= activeSegs.length} onClick={() => setSegPage(p => p + 1)}>Next</Button>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
