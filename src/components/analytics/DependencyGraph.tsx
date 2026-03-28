"use client";

import { useEffect, useState, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Network, ArrowRight } from "lucide-react";
import { supabase } from "@/lib/supabase";

interface CrossMention {
    sourceId: number;
    sourceName: string;
    targetId: number;
    targetName: string;
    count: number;
}

export function DependencyGraph({ surveyId }: { surveyId: string }) {
    const [mentions, setMentions] = useState<CrossMention[]>([]);
    const [loading, setLoading] = useState(true);
    const [hoveredRow, setHoveredRow] = useState<number | null>(null);
    const [hoveredCell, setHoveredCell] = useState<{ s: number; t: number } | null>(null);

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                let segments: any[] = [];

                if (surveyId === "all") {
                    const { data } = await supabase
                        .from('feedback_segments')
                        .select('related_unit_ids, raw_input_id')
                        .not('related_unit_ids', 'is', null);
                    segments = data || [];
                } else {
                    // Fetch respondents → inputs → segments
                    let respIds: number[] = [];
                    let rPage = 0;
                    while (true) {
                        const { data: rBat } = await supabase.from('respondents').select('id').eq('survey_id', parseInt(surveyId)).range(rPage * 1000, (rPage + 1) * 1000 - 1);
                        if (!rBat || rBat.length === 0) break;
                        respIds.push(...rBat.map((r: any) => r.id));
                        if (rBat.length < 1000) break;
                        rPage++;
                    }

                    if (respIds.length > 0) {
                        let inputs: any[] = [];
                        const CHUNK = 400;
                        for (let i = 0; i < respIds.length; i += CHUNK) {
                            const chunk = respIds.slice(i, i + CHUNK);
                            const { data: iBat } = await supabase.from('raw_feedback_inputs').select('id, target_unit_id').in('respondent_id', chunk);
                            if (iBat) inputs.push(...iBat);
                        }
                        const inputMap = new Map(inputs.map((i: any) => [i.id, i]));
                        const inputIds = inputs.map((i: any) => i.id);

                        if (inputIds.length > 0) {
                            for (let i = 0; i < inputIds.length; i += CHUNK) {
                                const chunk = inputIds.slice(i, i + CHUNK);
                                const { data } = await supabase
                                    .from('feedback_segments')
                                    .select('related_unit_ids, raw_input_id')
                                    .not('related_unit_ids', 'is', null)
                                    .in('raw_input_id', chunk);
                                if (data) {
                                    segments.push(...data.map((d: any) => ({
                                        related_unit_ids: d.related_unit_ids,
                                        target_unit_id: inputMap.get(d.raw_input_id)?.target_unit_id
                                    })));
                                }
                            }
                        }
                    }
                }

                if (!segments.length) { setMentions([]); return; }

                const { data: unitsData } = await supabase.from('organization_units').select('id, name, short_name');
                const unitsMap = new Map((unitsData || []).map(u => [u.id, { name: u.name, short: u.short_name || u.name.split(' ')[0] }]));

                // Build cross-mention count map
                const countMap = new Map<string, number>();
                for (const seg of segments) {
                    const sourceId = seg.target_unit_id;
                    const related = seg.related_unit_ids;
                    if (!sourceId || !related || !Array.isArray(related)) continue;
                    for (const targetId of related) {
                        if (targetId !== sourceId) {
                            const key = `${sourceId}::${targetId}`;
                            countMap.set(key, (countMap.get(key) || 0) + 1);
                        }
                    }
                }

                const result: CrossMention[] = [];
                for (const [key, count] of countMap.entries()) {
                    const [sId, tId] = key.split('::').map(Number);
                    const src = unitsMap.get(sId);
                    const tgt = unitsMap.get(tId);
                    if (src && tgt) {
                        result.push({ sourceId: sId, sourceName: src.short, targetId: tId, targetName: tgt.short, count });
                    }
                }
                result.sort((a, b) => b.count - a.count);
                setMentions(result);
            } catch (err) {
                console.error("DependencyGraph fetch failed:", err);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [surveyId]);

    // Build matrix from mentions
    const { unitIds, unitNames, matrix, maxCount } = useMemo(() => {
        if (!mentions.length) return { unitIds: [], unitNames: [], matrix: [], maxCount: 0 };

        const idSet = new Set<number>();
        for (const m of mentions) { idSet.add(m.sourceId); idSet.add(m.targetId); }
        const unitIds = Array.from(idSet);
        const nameMap = new Map<number, string>();
        for (const m of mentions) {
            nameMap.set(m.sourceId, m.sourceName);
            nameMap.set(m.targetId, m.targetName);
        }
        const unitNames = unitIds.map(id => nameMap.get(id) || `Unit ${id}`);

        const mentionMap = new Map<string, number>();
        let maxCount = 0;
        for (const m of mentions) {
            mentionMap.set(`${m.sourceId}::${m.targetId}`, m.count);
            if (m.count > maxCount) maxCount = m.count;
        }

        const matrix = unitIds.map(sId =>
            unitIds.map(tId => mentionMap.get(`${sId}::${tId}`) || 0)
        );

        return { unitIds, unitNames, matrix, maxCount };
    }, [mentions]);

    const getColor = (count: number) => {
        if (count === 0) return undefined;
        const intensity = count / maxCount;
        if (intensity > 0.7) return 'bg-indigo-600 text-white';
        if (intensity > 0.4) return 'bg-indigo-400 text-white';
        if (intensity > 0.2) return 'bg-indigo-200 text-indigo-900';
        return 'bg-indigo-100 text-indigo-700';
    };

    const topMentions = mentions.slice(0, 5);

    return (
        <Card className="border-slate-200 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-900 col-span-full xl:col-span-2 flex flex-col">
            <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                    <div className="p-2 bg-indigo-100 dark:bg-indigo-950/50 rounded-lg">
                        <Network className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    </div>
                    <div>
                        <CardTitle className="text-base">Cross-Unit Mention Matrix</CardTitle>
                        <CardDescription className="text-xs">
                            When students mention one unit while responding to another — showing operational friction points.
                        </CardDescription>
                    </div>
                </div>
            </CardHeader>

            <CardContent className="pt-2">
                {loading ? (
                    <div className="h-48 flex items-center justify-center">
                        <Loader2 className="w-6 h-6 animate-spin text-slate-300" />
                    </div>
                ) : mentions.length === 0 ? (
                    <div className="h-48 flex flex-col items-center justify-center text-slate-400 gap-3">
                        <Network className="w-8 h-8 opacity-30" />
                        <div className="text-sm text-center">
                            <p className="font-medium">No cross-unit mentions detected</p>
                            <p className="text-xs mt-1 text-slate-400">This appears when students reference other departments in their feedback.</p>
                        </div>
                        <Badge variant="outline" className="text-xs font-normal opacity-60">Requires AI tagging with related_unit_ids</Badge>
                    </div>
                ) : (
                    <div className="space-y-5">
                        {/* TOP MENTIONS FEED */}
                        <div className="space-y-2">
                            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Top Cross-Unit Connections</p>
                            <div className="space-y-1.5">
                                {topMentions.map((m, i) => (
                                    <div key={i} className="flex items-center gap-3 p-2.5 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-100 dark:border-slate-800 text-sm">
                                        <span className="shrink-0 w-5 h-5 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 text-[10px] font-black flex items-center justify-center">
                                            {i + 1}
                                        </span>
                                        <span className="text-slate-700 dark:text-slate-300 truncate font-medium">{m.sourceName}</span>
                                        <ArrowRight className="w-3 h-3 text-slate-400 shrink-0" />
                                        <span className="text-slate-700 dark:text-slate-300 truncate font-medium">{m.targetName}</span>
                                        <Badge className="ml-auto shrink-0 bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800 text-xs font-bold">
                                            {m.count} mention{m.count !== 1 ? 's' : ''}
                                        </Badge>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* MATRIX HEATMAP */}
                        {unitIds.length >= 2 && (
                            <div className="space-y-2">
                                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Mention Heatmap (Row → Column)</p>
                                <div className="overflow-x-auto">
                                    <table className="text-[10px] border-separate border-spacing-0.5">
                                        <thead>
                                            <tr>
                                                <th className="w-20 text-right pr-1 font-medium text-slate-400 text-[9px] pb-1">Source ↓ / Target →</th>
                                                {unitNames.map((name, ci) => (
                                                    <th
                                                        key={ci}
                                                        className={`w-10 text-center font-semibold pb-1 transition-colors duration-150 ${hoveredCell?.t === ci || hoveredRow === ci ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-500 dark:text-slate-400'}`}
                                                        style={{ writingMode: 'vertical-lr', transform: 'rotate(180deg)', height: 64, verticalAlign: 'bottom' }}
                                                    >
                                                        {name.length > 8 ? name.slice(0, 8) + '…' : name}
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {matrix.map((row, ri) => (
                                                <tr key={ri}>
                                                    <td
                                                        className={`text-right pr-1.5 font-semibold text-[9px] transition-colors duration-150 ${hoveredRow === ri ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-500 dark:text-slate-400'}`}
                                                        onMouseEnter={() => setHoveredRow(ri)}
                                                        onMouseLeave={() => setHoveredRow(null)}
                                                    >
                                                        {unitNames[ri].length > 8 ? unitNames[ri].slice(0, 8) + '…' : unitNames[ri]}
                                                    </td>
                                                    {row.map((count, ci) => (
                                                        <td
                                                            key={ci}
                                                            className={`w-9 h-9 text-center font-bold rounded transition-all duration-150 cursor-default
                                                                ${ri === ci ? 'bg-slate-100 dark:bg-slate-800 opacity-40' : count > 0 ? getColor(count) : 'bg-slate-50 dark:bg-slate-900/30 text-slate-300'}
                                                                ${(hoveredRow === ri || hoveredCell?.t === ci) && count > 0 ? 'ring-2 ring-indigo-400 scale-105 shadow' : ''}
                                                            `}
                                                            onMouseEnter={() => setHoveredCell({ s: ri, t: ci })}
                                                            onMouseLeave={() => setHoveredCell(null)}
                                                            title={count > 0 ? `${unitNames[ri]} → ${unitNames[ci]}: ${count} mention${count !== 1 ? 's' : ''}` : ri === ci ? 'Self' : 'No mentions'}
                                                        >
                                                            {ri === ci ? '·' : count > 0 ? count : ''}
                                                        </td>
                                                    ))}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                <p className="text-[10px] text-slate-400 italic">
                                    Each cell shows how many times feedback for the <strong>row unit</strong> mentioned the <strong>column unit</strong>.
                                </p>
                            </div>
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
