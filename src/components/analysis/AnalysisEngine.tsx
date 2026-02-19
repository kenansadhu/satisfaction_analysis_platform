"use client";

import { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Loader2, Play, Pause, Database, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";

export default function AnalysisEngine({ unitId }: { unitId: string }) {
    // Data State
    const [categories, setCategories] = useState<any[]>([]);
    const [allUnits, setAllUnits] = useState<any[]>([]);
    const [instructions, setInstructions] = useState<string[]>([]);
    const [unitName, setUnitName] = useState("");

    // Progress State
    const [totalPending, setTotalPending] = useState(0);
    const [processedCount, setProcessedCount] = useState(0);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [logs, setLogs] = useState<string[]>([]);
    const stopRef = useRef(false);

    useEffect(() => { loadResources(); }, [unitId]);

    async function loadResources() {
        // 1. Get Unit Details & Instructions
        const { data: unit } = await supabase.from('organization_units').select('*').eq('id', unitId).single();
        if (unit) {
            setUnitName(unit.name);
            const { data: inst } = await supabase.from('unit_analysis_instructions').select('instruction').eq('unit_id', unitId);
            if (inst) setInstructions([unit.analysis_context, ...inst.map(i => i.instruction)].filter(Boolean));
        }

        // 2. Get Taxonomy (Categories)
        const { data: cats } = await supabase.from('analysis_categories').select('id, name, description').eq('unit_id', unitId);
        if (cats) setCategories(cats);

        // 3. Get All Units (For cross-tagging)
        const { data: units } = await supabase.from('organization_units').select('id, name');
        if (units) setAllUnits(units);

        // 4. Count Pending Work (Efficient: count queries instead of loading IDs)
        const { count: totalNeeded } = await supabase
            .from('raw_feedback_inputs')
            .select('*', { count: 'exact', head: true })
            .eq('target_unit_id', unitId)
            .eq('requires_analysis', true);

        const { count: alreadyAnalyzed } = await supabase
            .from('feedback_segments')
            .select('*, raw_feedback_inputs!inner(target_unit_id)', { count: 'exact', head: true })
            .eq('raw_feedback_inputs.target_unit_id', unitId);

        // Use a subquery approach: count raw inputs that DON'T have segments yet
        setTotalPending(Math.max(0, (totalNeeded || 0) - (alreadyAnalyzed || 0)));
    }

    const addLog = (msg: string) => setLogs(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 10));

    const runAnalysis = async () => {
        if (categories.length === 0) { toast.warning("No Categories found! Please go to Tab 2 and build them first."); return; }

        setIsAnalyzing(true);
        stopRef.current = false;
        addLog("🚀 Starting Deep Analysis Engine (Turbo Mode)...");

        try {
            // 1. Fetch pending text rows using LEFT JOIN approach
            // Only fetch rows that DON'T have segments yet (avoids loading ALL IDs)
            let allRows: any[] = [];
            let hasMore = true;
            let page = 0;

            addLog("Fetching pending comments...");

            while (hasMore) {
                const { data } = await supabase
                    .from('raw_feedback_inputs')
                    .select('id, raw_text')
                    .eq('target_unit_id', unitId)
                    .eq('requires_analysis', true)
                    .range(page * 1000, (page + 1) * 1000 - 1);

                if (data && data.length > 0) {
                    allRows.push(...data); // push() instead of spread-copy
                    if (data.length < 1000) hasMore = false;
                    page++;
                } else hasMore = false;
            }

            // 2. Filter out already analyzed (use Set for O(1) lookups)
            const { data: existingSegments } = await supabase
                .from('feedback_segments')
                .select('raw_input_id')
                .in('raw_input_id', allRows.map(r => r.id));

            const analyzedSet = new Set(existingSegments?.map(s => s.raw_input_id) || []);
            const queue = allRows.filter(r => !analyzedSet.has(r.id));

            if (queue.length === 0) {
                addLog("✅ No pending comments found.");
                setIsAnalyzing(false);
                setTotalPending(0);
                return;
            }

            addLog(`Found ${queue.length} comments to process.`);
            setTotalPending(queue.length);
            setProcessedCount(0);

            // 3. Batch Process (Turbo Batch Size)
            const BATCH_SIZE = 50;

            for (let i = 0; i < queue.length; i += BATCH_SIZE) {
                if (stopRef.current) { addLog("🛑 Process Paused."); break; }

                const batch = queue.slice(i, i + BATCH_SIZE);
                addLog(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1} (${batch.length} items)...`);

                try {
                    const response = await fetch('/api/ai/run-analysis', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            comments: batch,
                            taxonomy: categories,
                            allUnits: allUnits,
                            unitContext: { name: unitName, instructions }
                        })
                    });

                    if (!response.ok) throw new Error(`Server Error ${response.status}`);

                    const data = await response.json();

                    if (Array.isArray(data)) {
                        const inserts: any[] = [];
                        data.forEach((item: any) => {
                            item.segments.forEach((seg: any) => {
                                // Map Names back to IDs
                                const catId = categories.find(c => c.name === seg.category_name)?.id;
                                const relatedId = allUnits.find(u => u.name === seg.related_unit_name)?.id;

                                inserts.push({
                                    raw_input_id: item.raw_input_id,
                                    segment_text: seg.text,
                                    sentiment: seg.sentiment,
                                    category_id: catId || null,
                                    related_unit_ids: relatedId ? [relatedId] : [], // Store as array
                                    is_suggestion: seg.is_suggestion || false // <--- SAVING SUGGESTION FLAG
                                });
                            });
                        });

                        if (inserts.length > 0) {
                            const { error } = await supabase.from('feedback_segments').insert(inserts);
                            if (error) addLog(`❌ DB Save Error: ${error.message}`);
                            else setProcessedCount(prev => prev + batch.length);
                        }
                    } else {
                        addLog(`⚠️ API Warning: Empty response for batch.`);
                    }
                } catch (err: any) {
                    addLog(`⚠️ Batch Failed (Retrying...): ${err.message}`);
                }
            }

            if (!stopRef.current) addLog("🏁 Analysis Complete.");
            loadResources();

        } catch (e: any) {
            addLog(`❌ System Error: ${e.message}`);
        } finally {
            setIsAnalyzing(false);
        }
    };

    const pct = totalPending > 0 ? Math.round((processedCount / totalPending) * 100) : 0;

    return (
        <div className="space-y-6 animate-in fade-in">
            <Card className="border-blue-200 bg-blue-50/20">
                <CardHeader>
                    <div className="flex justify-between items-center">
                        <div>
                            <CardTitle className="text-xl flex items-center gap-2"><Database className="w-5 h-5 text-blue-600" /> Deep Analysis</CardTitle>
                            <CardDescription>
                                Sentiment • Categorization • Cross-Unit Tagging (Turbo Mode: 50/batch)
                            </CardDescription>
                        </div>
                        <div className="text-right">
                            <div className="text-2xl font-bold text-slate-700">{totalPending}</div>
                            <div className="text-xs text-slate-500">Pending Comments</div>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="space-y-6">

                    {/* Stats Grid */}
                    <div className="grid grid-cols-3 gap-4 mb-4">
                        <div className="bg-white p-3 rounded border text-center">
                            <div className="text-sm text-slate-500">Categories Loaded</div>
                            <div className="font-bold text-lg">{categories.length}</div>
                        </div>
                        <div className="bg-white p-3 rounded border text-center">
                            <div className="text-sm text-slate-500">Other Units</div>
                            <div className="font-bold text-lg">{allUnits.length}</div>
                        </div>
                        <div className="bg-white p-3 rounded border text-center">
                            <div className="text-sm text-slate-500">Custom Rules</div>
                            <div className="font-bold text-lg">{instructions.length}</div>
                        </div>
                    </div>

                    {/* Progress Section */}
                    {isAnalyzing && (
                        <div className="space-y-2">
                            <div className="flex justify-between text-xs font-semibold text-blue-700">
                                <span>Processing... {processedCount} / {totalPending}</span>
                                <span>{pct}%</span>
                            </div>
                            <Progress value={pct} className="h-3" />
                        </div>
                    )}

                    {/* Controls */}
                    <div className="flex justify-center gap-4">
                        {!isAnalyzing ? (
                            <Button size="lg" className="w-48 bg-blue-600 hover:bg-blue-700 shadow-lg" onClick={runAnalysis} disabled={totalPending === 0}>
                                <Play className="w-5 h-5 mr-2" /> {totalPending === 0 ? "All Done" : "Start Analysis"}
                            </Button>
                        ) : (
                            <Button size="lg" variant="destructive" className="w-48 shadow-lg" onClick={() => stopRef.current = true}>
                                <Pause className="w-5 h-5 mr-2" /> Pause
                            </Button>
                        )}
                    </div>

                    {/* Logs Console */}
                    <div className="bg-slate-900 text-slate-300 font-mono text-xs h-[200px] overflow-y-auto p-4 rounded-md space-y-1 shadow-inner">
                        {logs.length === 0 && <div className="text-slate-600 italic">Ready to start...</div>}
                        {logs.map((log, i) => (
                            <div key={i} className="border-l-2 border-slate-600 pl-2">{log}</div>
                        ))}
                    </div>

                </CardContent>
            </Card>
        </div>
    );
}