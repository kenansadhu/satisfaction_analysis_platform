"use client";

import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import { Badge } from "@/components/ui/badge";
import { Loader2, Network, ArrowRight } from "lucide-react";
// Explicitly resolve .default to handle both CJS and ESM builds
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ForceGraph2D = dynamic(() => import("react-force-graph-2d").then(m => (m as any).default || m), { ssr: false }) as any;

interface CrossMention {
    sourceId: number;
    sourceName: string;
    targetId: number;
    targetName: string;
    count: number;
}

interface GraphNode {
    id: string;
    name: string;
    received: number;
    sent: number;
    val: number;
    x?: number;
    y?: number;
}

export function DependencyGraph({ surveyId }: { surveyId: string }) {
    const [mentions, setMentions] = useState<CrossMention[]>([]);
    const [loading, setLoading] = useState(true);
    const [isClient, setIsClient] = useState(false);
    const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [dimensions, setDimensions] = useState({ width: 800, height: 460 });

    useEffect(() => { setIsClient(true); }, []);

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                const url = surveyId === 'all'
                    ? '/api/analytics/dependency-graph'
                    : `/api/analytics/dependency-graph?surveyId=${surveyId}`;
                const res = await fetch(url);
                const json = await res.json();
                if (json.error) throw new Error(json.error);
                setMentions(json.mentions || []);
            } catch (err) {
                console.error('DependencyGraph fetch failed:', err);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [surveyId]);


    useEffect(() => {
        if (!containerRef.current) return;
        const obs = new ResizeObserver(entries => {
            const { width, height } = entries[0].contentRect;
            if (width > 0 && height > 0) setDimensions({ width, height });
        });
        obs.observe(containerRef.current);
        return () => obs.disconnect();
    }, []);

    const graphData = useMemo(() => {
        if (!mentions.length) return { nodes: [] as GraphNode[], links: [] as { source: string; target: string; value: number }[] };

        const nameMap = new Map<number, string>();
        const receivedMap = new Map<number, number>();
        const sentMap = new Map<number, number>();

        for (const m of mentions) {
            nameMap.set(m.sourceId, m.sourceName);
            nameMap.set(m.targetId, m.targetName);
            receivedMap.set(m.targetId, (receivedMap.get(m.targetId) || 0) + m.count);
            sentMap.set(m.sourceId, (sentMap.get(m.sourceId) || 0) + m.count);
        }

        const unitSet = new Set<number>();
        for (const m of mentions) { unitSet.add(m.sourceId); unitSet.add(m.targetId); }
        const maxReceived = Math.max(...Array.from(receivedMap.values()), 1);

        const nodes: GraphNode[] = Array.from(unitSet).map(id => ({
            id: id.toString(),
            name: nameMap.get(id) || `Unit ${id}`,
            received: receivedMap.get(id) || 0,
            sent: sentMap.get(id) || 0,
            val: Math.max(((receivedMap.get(id) || 0) / maxReceived) * 18 + 4, 4),
        }));

        const links = mentions.map(m => ({
            source: m.sourceId.toString(),
            target: m.targetId.toString(),
            value: m.count,
        }));

        return { nodes, links };
    }, [mentions]);

    const maxReceived = useMemo(() =>
        Math.max(...graphData.nodes.map(n => n.received), 1),
        [graphData.nodes]
    );

    const nodeCanvasObject = useCallback((node: GraphNode & { x: number; y: number }, ctx: CanvasRenderingContext2D, globalScale: number) => {
        const r = Math.sqrt(node.val) * 2.5 + 3;
        const fontSize = Math.max(9, 11 / globalScale);
        const label = node.name.length > 13 ? node.name.slice(0, 12) + '…' : node.name;
        const isHovered = hoveredNode?.id === node.id;

        if (isHovered) {
            ctx.beginPath();
            ctx.arc(node.x, node.y, r + 5, 0, 2 * Math.PI);
            ctx.fillStyle = 'rgba(99,102,241,0.18)';
            ctx.fill();
        }

        const intensity = node.received / maxReceived;
        let fillColor = '#94a3b8';
        if (intensity > 0.7) fillColor = '#3730a3';
        else if (intensity > 0.4) fillColor = '#6366f1';
        else if (intensity > 0.1) fillColor = '#818cf8';

        ctx.beginPath();
        ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
        ctx.fillStyle = fillColor;
        ctx.globalAlpha = isHovered ? 1 : 0.9;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.lineWidth = 1.5 / globalScale;
        ctx.stroke();

        ctx.font = `${isHovered ? 'bold ' : ''}${fontSize}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillStyle = isHovered ? '#1e293b' : '#475569';
        ctx.fillText(label, node.x, node.y + r + 2 / globalScale);
    }, [hoveredNode, maxReceived]);

    const nodePointerAreaPaint = useCallback((node: GraphNode & { x: number; y: number }, color: string, ctx: CanvasRenderingContext2D) => {
        const r = Math.sqrt(node.val) * 2.5 + 8;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
        ctx.fill();
    }, []);

    const topMentions = mentions.slice(0, 6);

    const stats = useMemo(() => {
        if (!graphData.nodes.length) return null;
        const totalMentions = mentions.reduce((s, m) => s + m.count, 0);
        const sorted = [...graphData.nodes].sort((a, b) => b.received - a.received);
        const mostReferenced = sorted[0];
        const mostMentioning = [...graphData.nodes].sort((a, b) => b.sent - a.sent)[0];
        return { totalMentions, mostReferenced, mostMentioning };
    }, [graphData.nodes, mentions]);

    return (
        <div className="flex flex-col h-full gap-3 p-1">
            {!loading && stats && (
                <div className="shrink-0 grid grid-cols-3 gap-2">
                    {[
                        { label: "Total Cross-Mentions", value: stats.totalMentions, sub: "between units" },
                        { label: "Most Referenced", value: stats.mostReferenced?.name ?? "—", sub: `${stats.mostReferenced?.received ?? 0} times referenced` },
                        { label: "Most Mentioning", value: stats.mostMentioning?.name ?? "—", sub: `${stats.mostMentioning?.sent ?? 0} outbound mentions` },
                    ].map(({ label, value, sub }) => (
                        <div key={label} className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl px-4 py-3">
                            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">{label}</p>
                            <p className="text-base font-bold text-slate-800 dark:text-slate-100 truncate">{value}</p>
                            <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p>
                        </div>
                    ))}
                </div>
            )}
            {!loading && topMentions.length > 0 && (
                <div className="shrink-0 space-y-2">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Strongest Cross-Unit Signals</p>
                    <div className="flex flex-wrap gap-1.5">
                        {topMentions.map((m, i) => (
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

            <div ref={containerRef} className="flex-1 relative rounded-xl overflow-hidden bg-slate-50/80 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800">
                {loading ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                        <Loader2 className="w-7 h-7 animate-spin text-indigo-400" />
                        <p className="text-sm text-slate-400 font-medium animate-pulse">Mapping unit connections...</p>
                    </div>
                ) : mentions.length === 0 ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 gap-4 px-8">
                        <Network className="w-12 h-12 opacity-20" />
                        <div className="text-sm text-center">
                            <p className="font-semibold text-slate-500">No cross-unit mentions detected</p>
                            <p className="text-xs mt-2 text-slate-400 max-w-xs leading-relaxed">This graph populates when students reference other departments in their feedback during AI analysis. Run analysis on more units to populate the graph.</p>
                        </div>
                        <Badge variant="outline" className="text-xs font-normal opacity-60">Requires AI tagging with related_unit_ids</Badge>
                    </div>
                ) : (
                    <>
                        {hoveredNode && (
                            <div className="absolute top-3 left-3 z-10 bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800 rounded-xl px-4 py-3 shadow-xl text-sm pointer-events-none">
                                <p className="font-bold text-slate-800 dark:text-slate-100 mb-1.5">{hoveredNode.name}</p>
                                <div className="space-y-0.5 text-xs text-slate-500 dark:text-slate-400">
                                    <p>Cross-referenced by others: <span className="font-semibold text-indigo-600 dark:text-indigo-400">{hoveredNode.received} mentions</span></p>
                                    <p>References other units: <span className="font-semibold text-slate-600 dark:text-slate-300">{hoveredNode.sent} mentions</span></p>
                                </div>
                            </div>
                        )}
                        <div className="absolute bottom-3 right-3 z-10 flex items-center gap-3 text-[10px] text-slate-500 bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm rounded-lg px-2.5 py-1.5 border border-slate-100 dark:border-slate-800">
                            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-indigo-800 inline-block" /> High traffic</span>
                            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-indigo-500 inline-block" /> Moderate</span>
                            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-slate-400 inline-block" /> Low</span>
                        </div>
                        {isClient && (
                            <ForceGraph2D
                                graphData={graphData}
                                width={dimensions.width}
                                height={dimensions.height}
                                nodeCanvasObject={nodeCanvasObject}
                                nodeCanvasObjectMode={() => 'replace'}
                                nodePointerAreaPaint={nodePointerAreaPaint}
                                linkWidth={(link: { value: number }) => Math.log(link.value + 1) * 1.5 + 0.5}
                                linkDirectionalArrowLength={7}
                                linkDirectionalArrowRelPos={1}
                                linkColor={() => 'rgba(99,102,241,0.22)'}
                                linkDirectionalParticles={2}
                                linkDirectionalParticleWidth={(link: { value: number }) => Math.log(link.value + 1)}
                                linkDirectionalParticleColor={() => '#818cf8'}
                                onNodeHover={(node: GraphNode | null) => setHoveredNode(node || null)}
                                backgroundColor="transparent"
                                d3AlphaDecay={0.015}
                                d3VelocityDecay={0.35}
                                cooldownTicks={120}
                                enableZoomInteraction
                                enablePanInteraction
                            />
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
