"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Loader2, Maximize2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Badge } from "@/components/ui/badge";

// Dynamic import for client-side rendering only since ForceGraph uses Canvas/Window
import dynamic from 'next/dynamic';
const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), { ssr: false });

export function DependencyGraph({ surveyId }: { surveyId: string }) {
    const [graphData, setGraphData] = useState<{ nodes: any[]; links: any[] }>({ nodes: [], links: [] });
    const [loading, setLoading] = useState(true);
    const containerRef = useRef<HTMLDivElement>(null);
    const [dimensions, setDimensions] = useState({ width: 0, height: 300 });

    useEffect(() => {
        if (containerRef.current) {
            setDimensions({
                width: containerRef.current.clientWidth,
                height: 300
            });
        }
    }, [containerRef.current]);

    useEffect(() => {
        const fetchGraphData = async () => {
            setLoading(true);
            try {
                // To build a nice graph, we want units to be Nodes, and edges to be created when
                // a respondent from target_unit_id mentions a related_unit_id in their feedback.
                // We'll fetch segments that have related_unit_ids.
                let query = supabase
                    .from('feedback_segments')
                    .select('related_unit_ids, raw_feedback_inputs!inner(target_unit_id, respondents!inner(survey_id))')
                    .not('related_unit_ids', 'is', null);

                if (surveyId !== "all") {
                    query = query.eq('raw_feedback_inputs.respondents.survey_id', parseInt(surveyId));
                }

                const { data: segments } = await query;

                if (!segments || segments.length === 0) {
                    setGraphData({ nodes: [], links: [] });
                    return;
                }

                // Fetch all units so we have names
                const { data: unitsRes } = await supabase.from('organization_units').select('id, name');
                const unitsMap = new Map(unitsRes?.map(u => [u.id, u.name]));

                const nodesMap = new Map();
                const linksMap = new Map(); // source-target -> weight

                // Only plot connections with weight
                segments.forEach(s => {
                    const rIds = s.related_unit_ids;
                    const rawInput: any = s.raw_feedback_inputs;
                    const sourceId = Array.isArray(rawInput) ? rawInput[0]?.target_unit_id : rawInput?.target_unit_id;

                    if (rIds && Array.isArray(rIds) && sourceId) {
                        rIds.forEach(targetId => {
                            if (sourceId !== targetId) { // Ignore self-references
                                const linkId = `${sourceId}-${targetId}`;
                                linksMap.set(linkId, {
                                    source: sourceId,
                                    target: targetId,
                                    weight: (linksMap.get(linkId)?.weight || 0) + 1
                                });

                                nodesMap.set(sourceId, unitsMap.get(sourceId) || `Unit ${sourceId}`);
                                nodesMap.set(targetId, unitsMap.get(targetId) || `Unit ${targetId}`);
                            }
                        });
                    }
                });

                const nodes = Array.from(nodesMap.entries()).map(([id, name]) => ({
                    id,
                    name,
                    val: 1 // Default node size, we could scale based on total mentions
                }));

                const links = Array.from(linksMap.values()).map(link => ({
                    source: link.source,
                    target: link.target,
                    value: link.weight
                }));

                setGraphData({ nodes, links });
            } catch (err) {
                console.error("Failed to fetch graph data", err);
            } finally {
                setLoading(false);
            }
        };

        fetchGraphData();
    }, [surveyId]);

    const nodeColors = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4'];

    const paintNode = useCallback((node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
        const label = node.name as string;
        const fontSize = 12 / globalScale;
        ctx.font = `${fontSize}px Sans-Serif`;
        const textWidth = ctx.measureText(label).width;
        const bckgDimensions = [textWidth, fontSize].map(n => n + fontSize * 0.2);

        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';

        // Draw rounded rectangle
        ctx.beginPath();
        const r = 2;
        const x = node.x - bckgDimensions[0] / 2;
        const y = node.y - bckgDimensions[1] / 2;
        const w = bckgDimensions[0];
        const h = bckgDimensions[1];

        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.arcTo(x + w, y, x + w, y + r, r);
        ctx.lineTo(x + w, y + h - r);
        ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
        ctx.lineTo(x + r, y + h);
        ctx.arcTo(x, y + h, x, y + h - r, r);
        ctx.lineTo(x, y + r);
        ctx.arcTo(x, y, x + r, y, r);
        ctx.fill();

        ctx.strokeStyle = '#cbd5e1';
        ctx.stroke();

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        // Assign color deterministically based on ID to keep it consistent
        ctx.fillStyle = nodeColors[node.id % nodeColors.length];
        ctx.fillText(label, node.x, node.y);

        node.__bckgDimensions = bckgDimensions;
    }, []);

    return (
        <Card className="border-slate-200 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-900 col-span-full xl:col-span-2 flex flex-col h-full">
            <CardHeader className="pb-0 shrink-0">
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle className="text-slate-800 dark:text-slate-100 text-base">Cross-Unit Dependency Graph</CardTitle>
                        <CardDescription className="dark:text-slate-400 text-xs">Visualizing operational friction points between departments.</CardDescription>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="pt-4 grow min-h-[300px]" ref={containerRef}>
                {loading ? (
                    <div className="w-full h-full flex flex-col items-center justify-center">
                        <Loader2 className="w-8 h-8 animate-spin text-slate-300 dark:text-slate-700 mb-2" />
                    </div>
                ) : graphData.nodes.length < 2 ? (
                    <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 text-sm">
                        <div className="italic text-center px-4">
                            Not enough cross-departmental feedback mentions in this survey to form a network map.
                        </div>
                        <Badge variant="outline" className="mt-4 opacity-50 font-normal">Requires 'Related Units' AI tagging</Badge>
                    </div>
                ) : (
                    <div className="w-full h-full rounded-md overflow-hidden bg-slate-50 dark:bg-slate-950/50 border border-slate-100 dark:border-slate-800">
                        <ForceGraph2D
                            width={dimensions.width}
                            height={300}
                            graphData={graphData}
                            nodeCanvasObject={paintNode}
                            nodePointerAreaPaint={(node: any, color, ctx) => {
                                ctx.fillStyle = color;
                                const bckgDimensions = node.__bckgDimensions;
                                if (bckgDimensions) {
                                    ctx.fillRect(node.x - bckgDimensions[0] / 2, node.y - bckgDimensions[1] / 2, bckgDimensions[0], bckgDimensions[1]);
                                }
                            }}
                            linkColor={() => '#94a3b8'}
                            linkWidth={(link: any) => Math.min(link.value, 5)} // Thicker lines for more mentions
                            linkDirectionalParticles={(link: any) => link.value} // Animated particles
                            linkDirectionalParticleSpeed={0.005}
                            d3VelocityDecay={0.6}
                            cooldownTicks={100}
                            onEngineStop={() => console.log('Graph rendering complete')}
                        />
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
