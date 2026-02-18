"use client";

import { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Loader2, Plus, Trash2, Play, Sparkles, CheckCircle2, Save, X, RefreshCw } from "lucide-react";

type Category = { name: string; description: string; keywords: string[] };
type Instruction = { id: number; instruction: string };

export default function CategorizationEngine({ unitId }: { unitId: string }) {
    // Data State
    const [instructions, setInstructions] = useState<Instruction[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [totalComments, setTotalComments] = useState(0);

    // UI State
    const [newInstruction, setNewInstruction] = useState("");
    const [isProcessing, setIsProcessing] = useState(false);
    const [progress, setProgress] = useState(0);
    const [statusMsg, setStatusMsg] = useState("");
    const [unitName, setUnitName] = useState("");

    const stopRef = useRef(false);

    useEffect(() => {
        loadData();
    }, [unitId]);

    async function loadData() {
        const { data: unit } = await supabase.from('organization_units').select('name').eq('id', unitId).single();
        if (unit) setUnitName(unit.name);

        const { data: inst } = await supabase.from('unit_analysis_instructions').select('*').eq('unit_id', unitId).order('created_at');
        if (inst) setInstructions(inst);

        const { data: cats } = await supabase.from('analysis_categories').select('*').eq('unit_id', unitId);
        if (cats && cats.length > 0) {
            setCategories(cats.map(c => ({ name: c.name, description: c.description || "", keywords: c.keywords || [] })));
        }

        const { count } = await supabase.from('raw_feedback_inputs')
            .select('*', { count: 'exact', head: true })
            .eq('target_unit_id', unitId)
            .eq('requires_analysis', true);
        setTotalComments(count || 0);
    }

    const addInstruction = async () => {
        if (!newInstruction.trim()) return;
        const { data } = await supabase.from('unit_analysis_instructions').insert({ unit_id: unitId, instruction: newInstruction }).select().single();
        if (data) setInstructions([...instructions, data]);
        setNewInstruction("");
    };

    const deleteInstruction = async (id: number) => {
        await supabase.from('unit_analysis_instructions').delete().eq('id', id);
        setInstructions(instructions.filter(i => i.id !== id));
    };

    // --- RECURSIVE DISCOVERY ENGINE ---
    const startDiscovery = async () => {
        setIsProcessing(true);
        setProgress(0);
        stopRef.current = false;
        let currentCats = [...categories];

        try {
            setStatusMsg("Fetching all comments from database...");

            // 1. SAFE FETCH LOOP (Bypassing the 1000 row limit)
            let allRows: any[] = [];
            let hasMore = true;
            let page = 0;
            const DB_BATCH = 1000;

            while (hasMore) {
                const { data, error } = await supabase
                    .from('raw_feedback_inputs')
                    .select('id, raw_text')
                    .eq('target_unit_id', unitId)
                    .eq('requires_analysis', true)
                    .range(page * DB_BATCH, (page + 1) * DB_BATCH - 1);

                if (error) throw error;
                if (data.length > 0) {
                    allRows = [...allRows, ...data];
                    page++;
                    // If we got less than the limit, we reached the end
                    if (data.length < DB_BATCH) hasMore = false;
                } else {
                    hasMore = false;
                }
            }

            if (allRows.length === 0) {
                alert("No text comments found to analyze!");
                setIsProcessing(false);
                return;
            }

            // 2. AI BATCHING LOOP
            const AI_BATCH_SIZE = 1000;
            const totalBatches = Math.ceil(allRows.length / AI_BATCH_SIZE);

            for (let i = 0; i < totalBatches; i++) {
                if (stopRef.current) break;

                const batch = allRows.slice(i * AI_BATCH_SIZE, (i + 1) * AI_BATCH_SIZE);
                const batchNum = i + 1;

                setStatusMsg(`Analyzing Batch ${batchNum}/${totalBatches} (${batch.length} comments)...`);
                // Update progress: (Current Batch / Total Batches) * 100
                setProgress(Math.round((batchNum / totalBatches) * 100));

                const response = await fetch('/api/ai/discover-categories', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        comments: batch.map(r => r.raw_text),
                        currentCategories: currentCats,
                        instructions: instructions.map(i => i.instruction),
                        unitName
                    })
                });

                const result = await response.json();
                if (result.categories) {
                    currentCats = result.categories;
                    setCategories(currentCats);
                }
            }
            setStatusMsg("Discovery Complete! Please review categories below.");
            setProgress(100);
        } catch (e: any) {
            alert("Error during discovery: " + e.message);
        } finally {
            setIsProcessing(false);
        }
    };

    const saveTaxonomy = async () => {
        if (!confirm("This will overwrite existing categories for this unit. Continue?")) return;

        await supabase.from('analysis_categories').delete().eq('unit_id', unitId);

        const payload = categories.map(c => ({
            unit_id: unitId,
            name: c.name,
            description: c.description,
            keywords: c.keywords
        }));

        const { error } = await supabase.from('analysis_categories').insert(payload);
        if (!error) alert("Taxonomy Saved Successfully!");
        else alert("Save failed: " + error.message);
    };

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">

            <Card className="border-purple-200 bg-purple-50/30">
                <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2 text-purple-900"><Sparkles className="w-5 h-5" /> 1. Teach the AI</CardTitle>
                    <CardDescription>Add specific rules or terminology for {unitName}.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex gap-2">
                        <Input
                            placeholder="E.g. 'M-Flex' refers to the attendance system."
                            value={newInstruction}
                            onChange={e => setNewInstruction(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && addInstruction()}
                            className="bg-white"
                        />
                        <Button onClick={addInstruction} className="bg-purple-600 hover:bg-purple-700">Add Rule</Button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {instructions.map(inst => (
                            <Badge key={inst.id} variant="secondary" className="bg-white border-purple-200 text-purple-800 p-2 pl-3 gap-2 text-sm font-normal">
                                {inst.instruction}
                                <Trash2 className="w-3 h-3 cursor-pointer hover:text-red-500" onClick={() => deleteInstruction(inst.id)} />
                            </Badge>
                        ))}
                        {instructions.length === 0 && <span className="text-slate-400 text-sm italic">No instructions yet. AI will use general knowledge.</span>}
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2"><RefreshCw className="w-5 h-5 text-blue-600" /> 2. Discover Categories</CardTitle>
                    <CardDescription>AI will read {totalComments.toLocaleString()} comments in batches to build a taxonomy.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    {!isProcessing ? (
                        <Button size="lg" onClick={startDiscovery} className="w-full bg-blue-600 hover:bg-blue-700 h-12 text-md shadow-md">
                            <Play className="w-5 h-5 mr-2" /> Start Recursive Discovery
                        </Button>
                    ) : (
                        <div className="space-y-4 py-4 border rounded-md bg-slate-50 px-6">
                            <div className="flex justify-between items-center">
                                <div className="flex items-center gap-3 font-semibold text-blue-700"><Loader2 className="w-5 h-5 animate-spin" /> {statusMsg}</div>
                                <Button variant="destructive" size="sm" onClick={() => stopRef.current = true}>Stop</Button>
                            </div>
                            {/* Standard Progress Bar (Default Colors) */}
                            <Progress value={progress} className="h-3" />
                            <p className="text-xs text-slate-500">Please do not close this tab. The AI is reading and refining topics...</p>
                        </div>
                    )}
                </CardContent>
            </Card>

            {categories.length > 0 && (
                <Card className="border-green-200 bg-green-50/30">
                    <CardHeader className="flex flex-row justify-between items-center">
                        <div>
                            <CardTitle className="text-lg flex items-center gap-2 text-green-900"><CheckCircle2 className="w-5 h-5" /> 3. Review Taxonomy</CardTitle>
                            <CardDescription>Found {categories.length} categories. Edit before saving.</CardDescription>
                        </div>
                        <Button onClick={saveTaxonomy} className="bg-green-600 hover:bg-green-700 shadow-sm"><Save className="w-4 h-4 mr-2" /> Save & Lock Taxonomy</Button>
                    </CardHeader>
                    <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {categories.map((cat, idx) => (
                            <div key={idx} className="bg-white p-4 rounded-md border shadow-sm group hover:border-blue-400 transition-colors">
                                <div className="flex justify-between items-start mb-2">
                                    <Input
                                        value={cat.name}
                                        onChange={(e) => {
                                            const newCats = [...categories];
                                            newCats[idx].name = e.target.value;
                                            setCategories(newCats);
                                        }}
                                        className="font-bold border-none p-0 h-auto text-lg focus-visible:ring-0"
                                    />
                                    <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-300 hover:text-red-500" onClick={() => {
                                        setCategories(categories.filter((_, i) => i !== idx));
                                    }}><X className="w-4 h-4" /></Button>
                                </div>
                                <Textarea
                                    value={cat.description}
                                    onChange={(e) => {
                                        const newCats = [...categories];
                                        newCats[idx].description = e.target.value;
                                        setCategories(newCats);
                                    }}
                                    className="text-sm text-slate-500 border-none p-0 resize-none focus-visible:ring-0 min-h-[40px]"
                                />
                                <div className="flex flex-wrap gap-1 mt-2">
                                    {cat.keywords.map(k => <Badge key={k} variant="outline" className="text-xs text-slate-500">{k}</Badge>)}
                                </div>
                            </div>
                        ))}
                        <Button variant="outline" className="h-full min-h-[120px] border-dashed border-2 flex flex-col gap-2 text-slate-400 hover:text-slate-600 hover:border-slate-400" onClick={() => setCategories([...categories, { name: "New Category", description: "Description...", keywords: [] }])}>
                            <Plus className="w-8 h-8" /> Add Manual Category
                        </Button>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}