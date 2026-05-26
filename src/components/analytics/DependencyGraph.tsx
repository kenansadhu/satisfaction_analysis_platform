"use client";

import { useEffect, useState, useMemo } from "react";
import { Loader2, Network, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface CrossMention {
    sourceId: number;
    sourceName: string;
    targetId: number;
    targetName: string;
    count: number;
}

const COLORS = [
    '#6366f1', '#8b5cf6', '#3b82f6', '#06b6d4',
    '#10b981', '#f59e0b', '#ef4444', '#ec4899',
    '#84cc16', '#f97316', '#14b8a6', '#a855f7',
    '#0ea5e9', '#22c55e', '#eab308', '#64748b',
];

function toXY(angle: number, r: number): [number, number] {
    return [r * Math.sin(angle), -r * Math.cos(angle)];
}

function arcD(sa: number, ea: number, ir: number, or_: number): string {
    const [ax, ay] = toXY(sa, or_);
    const [bx, by] = toXY(ea, or_);
    const [cx, cy] = toXY(ea, ir);
    const [dx, dy] = toXY(sa, ir);
    const lg = ea - sa > Math.PI ? 1 : 0;
    return `M${ax},${ay} A${or_},${or_} 0 ${lg},1 ${bx},${by} L${cx},${cy} A${ir},${ir} 0 ${lg},0 ${dx},${dy} Z`;
}

function ribbonD(ss: number, se: number, ts: number, te: number, r: number): string {
    const [x1, y1] = toXY(ss, r);
    const [x2, y2] = toXY(se, r);
    const [x3, y3] = toXY(ts, r);
    const [x4, y4] = toXY(te, r);
    const sl = se - ss > Math.PI ? 1 : 0;
    const tl = te - ts > Math.PI ? 1 : 0;
    return `M${x1},${y1} A${r},${r} 0 ${sl},1 ${x2},${y2} Q0,0 ${x3},${y3} A${r},${r} 0 ${tl},1 ${x4},${y4} Q0,0 ${x1},${y1} Z`;
}

interface GroupItem {
    index: number;
    value: number;
    startAngle: number;
    endAngle: number;
    midAngle: number;
}

interface ChordItem {
    srcIdx: number;
    tgtIdx: number;
    value: number;
    src: { sa: number; ea: number };
    tgt: { sa: number; ea: number };
}

function buildLayout(sym: number[][], pad = 0.028): { groups: GroupItem[]; chords: ChordItem[] } {
    const n = sym.length;
    const rowSums = sym.map(r => r.reduce((a, b) => a + b, 0));
    const total = rowSums.reduce((a, b) => a + b, 0);
    if (total === 0) return { groups: [], chords: [] };

    const scale = (2 * Math.PI - pad * n) / total;
    let cur = 0;
    const groups: GroupItem[] = rowSums.map((val, i) => {
        const sa = cur;
        const ea = sa + val * scale;
        cur = ea + pad;
        return { index: i, value: val, startAngle: sa, endAngle: ea, midAngle: (sa + ea) / 2 };
    });

    const cursors = groups.map(g => g.startAngle);
    const chords: ChordItem[] = [];

    for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
            const v = sym[i][j];
            if (v === 0) continue;
            const span = v * scale;
            const srcSa = cursors[i]; cursors[i] += span;
            const tgtSa = cursors[j]; cursors[j] += span;
            chords.push({ srcIdx: i, tgtIdx: j, value: v, src: { sa: srcSa, ea: srcSa + span }, tgt: { sa: tgtSa, ea: tgtSa + span } });
        }
    }

    return { groups, chords };
}

export function DependencyGraph({ surveyId, npsUnitIds = [] }: { surveyId: string; npsUnitIds?: number[] }) {
    const [mentions, setMentions] = useState<CrossMention[]>([]);
    const [loading, setLoading] = useState(true);
    const [hovered, setHovered] = useState<number | null>(null);

    useEffect(() => {
        setLoading(true);
        const url = surveyId === 'all'
            ? '/api/analytics/dependency-graph'
            : `/api/analytics/dependency-graph?surveyId=${surveyId}`;
        fetch(url)
            .then(r => r.json())
            .then(d => setMentions(d.mentions || []))
            .catch(() => setMentions([]))
            .finally(() => setLoading(false));
    }, [surveyId]);

    const filtered = useMemo(() =>
        npsUnitIds.length > 0
            ? mentions.filter(m => !npsUnitIds.includes(m.sourceId) && !npsUnitIds.includes(m.targetId))
            : mentions,
        [mentions, npsUnitIds]
    );

    const { units, sym, dir } = useMemo(() => {
        if (!filtered.length) return { units: [] as { id: number; name: string; color: string }[], sym: [] as number[][], dir: [] as number[][] };
        const names = new Map<number, string>();
        const ids = new Set<number>();
        for (const m of filtered) {
            ids.add(m.sourceId); ids.add(m.targetId);
            names.set(m.sourceId, m.sourceName);
            names.set(m.targetId, m.targetName);
        }
        const units = Array.from(ids).sort((a, b) => a - b).map((id, i) => ({
            id, name: names.get(id)!, color: COLORS[i % COLORS.length],
        }));
        const idxMap = new Map(units.map((u, i) => [u.id, i]));
        const n = units.length;
        const sym: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
        const dir: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
        for (const m of filtered) {
            const i = idxMap.get(m.sourceId)!, j = idxMap.get(m.targetId)!;
            sym[i][j] += m.count;
            sym[j][i] += m.count;
            dir[i][j] += m.count;
        }
        return { units, sym, dir };
    }, [filtered]);

    const { groups, chords } = useMemo(() => buildLayout(sym), [sym]);

    const stats = useMemo(() => {
        if (!filtered.length) return null;
        const total = filtered.reduce((s, m) => s + m.count, 0);
        const recv = new Map<number, number>(), sent = new Map<number, number>(), names = new Map<number, string>();
        for (const m of filtered) {
            recv.set(m.targetId, (recv.get(m.targetId) || 0) + m.count);
            sent.set(m.sourceId, (sent.get(m.sourceId) || 0) + m.count);
            names.set(m.sourceId, m.sourceName); names.set(m.targetId, m.targetName);
        }
        const topRecv = [...recv.entries()].sort((a, b) => b[1] - a[1])[0];
        const topSent = [...sent.entries()].sort((a, b) => b[1] - a[1])[0];
        return {
            total,
            mostReferenced: topRecv ? { name: names.get(topRecv[0])!, count: topRecv[1] } : null,
            mostMentioning: topSent ? { name: names.get(topSent[0])!, count: topSent[1] } : null,
        };
    }, [filtered]);

    const topSignals = useMemo(() => [...filtered].sort((a, b) => b.count - a.count).slice(0, 5), [filtered]);

    const OR = 182, IR = 155, LR = 197;

    return (
        <div className="flex flex-col h-full gap-3 p-1">
            {!loading && stats && (
                <div className="shrink-0 grid grid-cols-3 gap-2">
                    {[
                        { label: "Total Cross-Mentions", value: stats.total, sub: "between units" },
                        { label: "Most Referenced", value: stats.mostReferenced?.name ?? "—", sub: `${stats.mostReferenced?.count ?? 0} times referenced` },
                        { label: "Most Mentioning", value: stats.mostMentioning?.name ?? "—", sub: `${stats.mostMentioning?.count ?? 0} outbound mentions` },
                    ].map(({ label, value, sub }) => (
                        <div key={label} className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl px-4 py-3">
                            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">{label}</p>
                            <p className="text-base font-bold text-slate-800 dark:text-slate-100 truncate">{value}</p>
                            <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p>
                        </div>
                    ))}
                </div>
            )}

            {!loading && topSignals.length > 0 && (
                <div className="shrink-0 space-y-1.5">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Strongest Cross-Unit Signals</p>
                    <div className="flex flex-wrap gap-1.5">
                        {topSignals.map((m, i) => (
                            <div key={i} className="flex items-center gap-1.5 px-2.5 py-1 bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/40 rounded-full text-xs">
                                <span className="font-semibold text-indigo-700 dark:text-indigo-300">{m.sourceName}</span>
                                <ArrowRight className="w-2.5 h-2.5 text-indigo-400" />
                                <span className="font-semibold text-indigo-700 dark:text-indigo-300">{m.targetName}</span>
                                <Badge className="bg-indigo-100 dark:bg-indigo-900/60 text-indigo-600 dark:text-indigo-300 border-0 text-[10px] px-1.5 py-0 h-4 ml-0.5">{m.count}</Badge>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div className="flex-1 relative rounded-xl overflow-hidden bg-white dark:bg-slate-950 border border-slate-100 dark:border-slate-800 flex items-center justify-center min-h-[320px]">
                {loading ? (
                    <div className="flex flex-col items-center gap-3">
                        <Loader2 className="w-7 h-7 animate-spin text-indigo-400" />
                        <p className="text-sm text-slate-400 font-medium animate-pulse">Mapping unit connections...</p>
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="flex flex-col items-center text-slate-400 gap-4 px-8">
                        <Network className="w-12 h-12 opacity-20" />
                        <div className="text-sm text-center">
                            <p className="font-semibold text-slate-500">No cross-unit mentions detected</p>
                            <p className="text-xs mt-2 text-slate-400 max-w-xs leading-relaxed">
                                This graph populates when students reference other departments in their feedback during AI analysis.
                            </p>
                        </div>
                        <Badge variant="outline" className="text-xs font-normal opacity-60">Requires AI tagging with related_unit_ids</Badge>
                    </div>
                ) : (
                    <svg
                        viewBox="-265 -265 530 530"
                        className="w-full h-full"
                        style={{ maxHeight: '100%' }}
                        onMouseLeave={() => setHovered(null)}
                    >
                        {/* Ribbons rendered first (behind arcs) */}
                        <g>
                            {chords.map((c, idx) => {
                                const hi = hovered !== null && (c.srcIdx === hovered || c.tgtIdx === hovered);
                                const dim = hovered !== null && !hi;

                                let color = units[c.srcIdx].color;
                                if (hi && hovered !== null) {
                                    const otherIdx = c.srcIdx === hovered ? c.tgtIdx : c.srcIdx;
                                    const out = dir[hovered][otherIdx];
                                    const inc = dir[otherIdx][hovered];
                                    if (out > inc) color = '#f59e0b';       // amber = outgoing
                                    else if (inc > out) color = '#10b981';  // emerald = incoming
                                }

                                return (
                                    <path
                                        key={idx}
                                        d={ribbonD(c.src.sa, c.src.ea, c.tgt.sa, c.tgt.ea, IR - 1)}
                                        fill={color}
                                        fillOpacity={dim ? 0.03 : hi ? 0.55 : 0.18}
                                        stroke={color}
                                        strokeOpacity={dim ? 0.05 : hi ? 0.8 : 0.3}
                                        strokeWidth={0.5}
                                        style={{ transition: 'fill-opacity 0.15s, stroke-opacity 0.15s' }}
                                    />
                                );
                            })}
                        </g>

                        {/* Arc segments + labels */}
                        <g>
                            {groups.map((g) => {
                                const u = units[g.index];
                                const isH = hovered === g.index;
                                const isDim = hovered !== null && !isH;
                                const showLabel = (g.endAngle - g.startAngle) > 0.07;
                                const deg = g.midAngle * 180 / Math.PI - 90;
                                const flip = g.midAngle > Math.PI;
                                return (
                                    <g
                                        key={g.index}
                                        onMouseEnter={() => setHovered(g.index)}
                                        onMouseLeave={() => setHovered(null)}
                                        style={{ cursor: 'pointer' }}
                                    >
                                        <path
                                            d={arcD(g.startAngle, g.endAngle, IR, OR)}
                                            fill={u.color}
                                            fillOpacity={isDim ? 0.25 : 1}
                                            stroke="white"
                                            strokeWidth={1.5}
                                            style={{ transition: 'fill-opacity 0.15s' }}
                                        />
                                        {showLabel && (
                                            <text
                                                transform={`rotate(${deg}) translate(${LR},0)${flip ? ' rotate(180)' : ''}`}
                                                textAnchor={flip ? "end" : "start"}
                                                dominantBaseline="middle"
                                                fontSize={9}
                                                fontWeight={isH ? "700" : "500"}
                                                fill={isDim ? "#94a3b8" : u.color}
                                                style={{ transition: 'fill 0.15s', userSelect: 'none', pointerEvents: 'none' }}
                                            >
                                                {u.name.length > 16 ? u.name.slice(0, 15) + '…' : u.name}
                                            </text>
                                        )}
                                    </g>
                                );
                            })}
                        </g>

                        {/* Center info on hover */}
                        {hovered !== null && (() => {
                            const u = units[hovered];
                            const r = filtered.filter(m => m.targetId === u.id).reduce((acc, m) => acc + m.count, 0);
                            const s = filtered.filter(m => m.sourceId === u.id).reduce((acc, m) => acc + m.count, 0);
                            return (
                                <g pointerEvents="none">
                                    <text textAnchor="middle" y={-20} fontSize={11} fontWeight="700" fill={u.color}>
                                        {u.name.length > 22 ? u.name.slice(0, 21) + '…' : u.name}
                                    </text>
                                    <text textAnchor="middle" y={-4} fontSize={9} fill="#64748b">↑ {r} received</text>
                                    <text textAnchor="middle" y={11} fontSize={9} fill="#64748b">↓ {s} sent</text>
                                </g>
                            );
                        })()}
                    </svg>
                )}
            </div>

            {/* Direction legend — HTML so it's readable at any size */}
            <div className={`shrink-0 flex items-center justify-center gap-5 text-xs transition-opacity duration-200 ${hovered !== null ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                <span className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400 font-medium">
                    <span className="w-3 h-3 rounded-full bg-amber-400 inline-block" />
                    Outgoing — this unit mentions others
                </span>
                <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium">
                    <span className="w-3 h-3 rounded-full bg-emerald-500 inline-block" />
                    Incoming — others mention this unit
                </span>
            </div>
        </div>
    );
}
