"use client";

import { useEffect, useState, useRef } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Play, Pause, Loader2, Sparkles, Trash2, CheckCircle, ChevronRight, Plus, Search, Save, Pencil, X } from "lucide-react";
import Link from "next/link";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { PageShell, PageHeader } from "@/components/layout/PageShell";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/ConfirmDialog";

// Types
type Category = { id: number; name: string; description: string; keywords?: string[] };
type Subcategory = { id: number; category_id: number; name: string; description: string; keywords?: string[] };

export default function UnitAnalysisPage() {
    const params = useParams();
    const surveyId = params.id as string;
    const unitId = params.unitId as string;

    // Unit State
    const [unitName, setUnitName] = useState("");
    const [unitDesc, setUnitDesc] = useState("");
    const [customContext, setCustomContext] = useState(""); // The "Specific Terms"
    const [isSavingContext, setIsSavingContext] = useState(false);

    const [totalComments, setTotalComments] = useState(0);
    const [analyzedCount, setAnalyzedCount] = useState(0);

    // Taxonomy State
    const [categories, setCategories] = useState<Category[]>([]);
    const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
    const [activeCategory, setActiveCategory] = useState<Category | null>(null);
    const [isConfiguring, setIsConfiguring] = useState(false);

    // Subcategory editing state
    const [editingSubId, setEditingSubId] = useState<number | null>(null);
    const [subEditForm, setSubEditForm] = useState({ name: "", description: "" });
    const [addingSubForCatId, setAddingSubForCatId] = useState<number | null>(null);
    const [newSubForm, setNewSubForm] = useState({ name: "", description: "" });
    const [suggestingForCatId, setSuggestingForCatId] = useState<number | null>(null);

    // Editing State
    const [editingCatId, setEditingCatId] = useState<number | null>(null);
    const [editForm, setEditForm] = useState({ name: "", description: "", keywords: "" });

    // Evidence State
    const [evidenceComments, setEvidenceComments] = useState<{ id: number, text: string }[]>([]);
    const [isFetchingEvidence, setIsFetchingEvidence] = useState(false);

    // Analysis State
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [logs, setLogs] = useState<string[]>([]);
    const stopRef = useRef(false);

    useEffect(() => { loadUnitData(); loadTaxonomy(); }, []);
    useEffect(() => { if (activeCategory) fetchEvidence(activeCategory); }, [activeCategory]);

    async function loadUnitData() {
        const { data: unit } = await supabase.from('organization_units').select('*').eq('id', unitId).single();
        if (unit) {
            setUnitName(unit.name);
            setUnitDesc(unit.description);
            setCustomContext(unit.analysis_context || ""); // Load saved prompt
        }

        const { count } = await supabase.from('raw_feedback_inputs').select('id', { count: 'exact', head: true }).eq('target_unit_id', unitId).eq('is_quantitative', false);
        if (count) setTotalComments(count);

        const { data: rawInputs } = await supabase.from('raw_feedback_inputs').select('id').eq('target_unit_id', unitId).eq('is_quantitative', false);
        if (rawInputs && rawInputs.length > 0) {
            const { count: analyzed } = await supabase.from('feedback_segments').select('id', { count: 'exact', head: true }).in('raw_input_id', rawInputs.map(r => r.id));
            setAnalyzedCount(analyzed || 0);
        }
    }

    async function loadTaxonomy() {
        const { data: cats } = await supabase.from('analysis_categories').select('*').eq('unit_id', unitId).order('name');
        if (cats) {
            setCategories(cats);
            // Keep active category if it still exists, else reset
            if (activeCategory) {
                const stillExists = cats.find(c => c.id === activeCategory.id);
                if (stillExists) setActiveCategory(stillExists);
                else if (cats.length > 0) setActiveCategory(cats[0]);
                else setActiveCategory(null);
            } else if (cats.length > 0) {
                setActiveCategory(cats[0]);
            }
        }
        const { data: subs } = await supabase.from('analysis_subcategories').select('*, analysis_categories!inner(unit_id)').eq('analysis_categories.unit_id', unitId).order('name');
        if (subs) setSubcategories(subs);
    }

    // --- CONTEXT SAVING ---
    const handleSaveContext = async () => {
        setIsSavingContext(true);
        await supabase.from('organization_units').update({ analysis_context: customContext }).eq('id', unitId);
        setIsSavingContext(false);
        toast.success("AI Instructions Saved! Future suggestions will use this context.");
    };

    // --- EVIDENCE FETCHER ---
    const fetchEvidence = async (category: Category) => {
        if (!category.keywords || category.keywords.length === 0) {
            setEvidenceComments([]); return;
        }
        setIsFetchingEvidence(true);
        const queryParts = category.keywords.map(k => `raw_text.ilike.%${k}%`).join(',');
        const { data } = await supabase.from('raw_feedback_inputs').select('id, raw_text').eq('target_unit_id', unitId).eq('is_quantitative', false).or(queryParts).limit(10);
        if (data) setEvidenceComments(data.map(d => ({ id: d.id, text: d.raw_text })));
        setIsFetchingEvidence(false);
    };

    // --- AI SUGGESTIONS ---
    const handleAiSuggestCategories = async () => {
        setIsConfiguring(true);
        try {
            const { data: samples } = await supabase.from('raw_feedback_inputs').select('raw_text').eq('target_unit_id', unitId).eq('is_quantitative', false).limit(100);

            const res = await fetch('/api/ai/suggest-taxonomy', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ unitName, unitDesc, sampleComments: samples?.map(s => s.raw_text), mode: 'CATEGORIES', additionalContext: customContext })
            });
            const data = await res.json();

            if (data.suggestions) {
                for (const cat of data.suggestions) {
                    await supabase.from('analysis_categories').insert({
                        unit_id: unitId, name: cat.name, description: cat.description, keywords: cat.keywords
                    });
                }
                await loadTaxonomy();
            }
        } catch (e) { toast.error("AI Error"); } finally { setIsConfiguring(false); }
    };

    // --- EDITING LOGIC ---
    const startEditing = (cat: Category, e: any) => {
        e.stopPropagation();
        setEditingCatId(cat.id);
        setEditForm({ name: cat.name, description: cat.description || "", keywords: cat.keywords?.join(", ") || "" });
    };

    const saveEditing = async () => {
        if (!editingCatId) return;
        // Parse keywords back to array
        const keywordArray = editForm.keywords.split(',').map(s => s.trim()).filter(s => s.length > 0);

        await supabase.from('analysis_categories').update({
            name: editForm.name,
            description: editForm.description,
            keywords: keywordArray
        }).eq('id', editingCatId);

        setEditingCatId(null);
        loadTaxonomy();
    };

    const [deleteCatTarget, setDeleteCatTarget] = useState<number | null>(null);

    const handleDeleteCategory = async (id: number) => {
        await supabase.from('analysis_categories').delete().eq('id', id);
        loadTaxonomy();
        setDeleteCatTarget(null);
    };

    // --- SUBCATEGORY HANDLERS ---
    const handleAddSubcategory = async (categoryId: number) => {
        if (!newSubForm.name.trim()) return;
        await supabase.from('analysis_subcategories').insert({
            category_id: categoryId, name: newSubForm.name.trim(), description: newSubForm.description.trim()
        });
        setAddingSubForCatId(null);
        setNewSubForm({ name: "", description: "" });
        loadTaxonomy();
        toast.success("Subcategory added.");
    };

    const handleSaveSubcategory = async () => {
        if (!editingSubId) return;
        await supabase.from('analysis_subcategories').update({
            name: subEditForm.name, description: subEditForm.description
        }).eq('id', editingSubId);
        setEditingSubId(null);
        loadTaxonomy();
    };

    const handleDeleteSubcategory = async (id: number) => {
        await supabase.from('analysis_subcategories').delete().eq('id', id);
        loadTaxonomy();
        toast.success("Subcategory deleted.");
    };

    const handleAiSuggestSubcategories = async (category: Category) => {
        setSuggestingForCatId(category.id);
        try {
            const { data: samples } = await supabase.from('raw_feedback_inputs').select('raw_text').eq('target_unit_id', unitId).eq('is_quantitative', false).limit(100);
            const res = await fetch('/api/ai/suggest-taxonomy', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ unitName, unitDesc, sampleComments: samples?.map(s => s.raw_text), mode: 'SUBCATEGORIES', existingCategories: category, additionalContext: customContext })
            });
            const data = await res.json();
            if (data.suggestions) {
                for (const sub of data.suggestions) {
                    await supabase.from('analysis_subcategories').insert({
                        category_id: category.id, name: sub.name, description: sub.description
                    });
                }
                await loadTaxonomy();
                toast.success(`Added ${data.suggestions.length} subcategories for "${category.name}".`);
            }
        } catch (e) { toast.error("AI Error"); } finally { setSuggestingForCatId(null); }
    };

    // --- ANALYSIS ENGINE ---
    const addLog = (msg: string) => setLogs(prev => [msg, ...prev].slice(0, 50));

    const handleStartAnalysis = async () => {
        if (categories.length === 0) { toast.warning("Please configure categories first!"); return; }
        setIsAnalyzing(true); stopRef.current = false; addLog("🚀 Starting Analysis Engine...");

        try {
            const { data: allRaw } = await supabase.from('raw_feedback_inputs').select('id, raw_text, respondents!inner(survey_id)').eq('target_unit_id', unitId).eq('respondents.survey_id', surveyId).eq('is_quantitative', false);
            const { data: existing } = await supabase.from('feedback_segments').select('raw_input_id');
            const existingIds = new Set(existing?.map(e => e.raw_input_id));
            const queue = allRaw?.filter(r => !existingIds.has(r.id)) || [];

            addLog(`Found ${queue.length} pending items.`);

            const BATCH_SIZE = 15;
            for (let i = 0; i < queue.length; i += BATCH_SIZE) {
                if (stopRef.current) { addLog("🛑 Paused."); break; }
                const batch = queue.slice(i, i + BATCH_SIZE);
                addLog(`Processing batch ${i + 1}-${i + batch.length}...`);

                const response = await fetch('/api/ai/analyze-batch', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        comments: batch.map(b => ({ id: b.id, text: b.raw_text })),
                        taxonomy: { categories, subcategories },
                        context: { name: unitName, description: unitDesc }
                    })
                });

                const { results } = await response.json();
                if (results && results.length > 0) {
                    const { error } = await supabase.from('feedback_segments').insert(results);
                    if (error) throw error;
                    setAnalyzedCount(prev => prev + results.length);
                    addLog(`✅ Saved ${results.length} segments.`);
                }
            }
            addLog("🏁 Batch complete.");
        } catch (error: any) { addLog(`❌ Error: ${error.message}`); } finally { setIsAnalyzing(false); }
    };

    const progressPct = totalComments > 0 ? Math.round((analyzedCount / totalComments) * 100) : 0;

    return (
        <PageShell>
            <PageHeader
                title={unitName || "Unit Analysis"}
                description={`Architect Console • ${analyzedCount}/${totalComments} analyzed`}
                backHref={`/dashboard/${surveyId}`}
                backLabel="Survey Detail"
            />

            <div className="max-w-7xl mx-auto px-8 py-10 space-y-8">

                <Tabs defaultValue="categories" className="w-full">
                    <TabsList className="grid w-full grid-cols-3 mb-6">
                        <TabsTrigger value="categories">1. Build Categories ({categories.length})</TabsTrigger>
                        <TabsTrigger value="subcategories" disabled={categories.length === 0}>2. Build Subcategories</TabsTrigger>
                        <TabsTrigger value="analysis" disabled={categories.length === 0}>3. Run Unit Test</TabsTrigger>
                    </TabsList>

                    {/* TAB 1: CATEGORIES */}
                    <TabsContent value="categories">

                        {/* --- TEACH THE AI SECTION --- */}
                        <Card className="mb-6 border-purple-100 bg-purple-50/30">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-bold text-purple-800 flex items-center gap-2"><Sparkles className="w-4 h-4" /> Teach the AI</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="flex gap-2">
                                    <Textarea
                                        placeholder="E.g., 'Focus on these systems: M-Flex (attendance), Eduhub (LMS), and Panopto (video). Treat 'AC' as a specific category.'"
                                        value={customContext}
                                        onChange={(e) => setCustomContext(e.target.value)}
                                        className="bg-white"
                                    />
                                    <Button onClick={handleSaveContext} disabled={isSavingContext} className="h-auto w-24 bg-purple-600 hover:bg-purple-700">
                                        {isSavingContext ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save Rules"}
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-[600px]">

                            {/* LEFT: LIST */}
                            <Card className="flex flex-col">
                                <CardHeader className="flex flex-row items-center justify-between py-4">
                                    <div><CardTitle className="text-lg">Categories</CardTitle><CardDescription>Editable Taxonomy</CardDescription></div>
                                    <Button onClick={handleAiSuggestCategories} disabled={isConfiguring} size="sm" className="gap-2 bg-purple-100 text-purple-700 hover:bg-purple-200 border-none">{isConfiguring ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />} AI Suggest</Button>
                                </CardHeader>
                                <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-slate-50/50">
                                    {categories.map(cat => (
                                        <div
                                            key={cat.id}
                                            onClick={() => setActiveCategory(cat)}
                                            className={`flex flex-col gap-1 p-3 border rounded-md cursor-pointer transition-all ${activeCategory?.id === cat.id ? 'bg-white border-blue-500 shadow-md ring-1 ring-blue-500' : 'bg-white hover:border-blue-300'}`}
                                        >
                                            {editingCatId === cat.id ? (
                                                <div className="space-y-2" onClick={e => e.stopPropagation()}>
                                                    <Input value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} placeholder="Name" />
                                                    <Input value={editForm.description} onChange={e => setEditForm({ ...editForm, description: e.target.value })} placeholder="Description" />
                                                    <Input value={editForm.keywords} onChange={e => setEditForm({ ...editForm, keywords: e.target.value })} placeholder="Keywords (comma separated)" />
                                                    <div className="flex gap-2 justify-end">
                                                        <Button size="xs" variant="ghost" onClick={() => setEditingCatId(null)}>Cancel</Button>
                                                        <Button size="xs" onClick={saveEditing}>Save Changes</Button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <>
                                                    <div className="flex justify-between items-start">
                                                        <div className="font-semibold text-slate-800">{cat.name}</div>
                                                        <div className="flex gap-1">
                                                            <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-400 hover:text-blue-500" onClick={(e) => startEditing(cat, e)}><Pencil className="w-3 h-3" /></Button>
                                                            <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-300 hover:text-red-500" onClick={(e) => { e.stopPropagation(); setDeleteCatTarget(cat.id); }}><Trash2 className="w-3 h-3" /></Button>
                                                        </div>
                                                    </div>
                                                    <div className="text-xs text-slate-500 line-clamp-2">{cat.description}</div>
                                                    {cat.keywords && (
                                                        <div className="flex flex-wrap gap-1 mt-2">
                                                            {cat.keywords.slice(0, 4).map(k => <Badge key={k} variant="secondary" className="text-[10px] px-1 h-4">{k}</Badge>)}
                                                        </div>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    ))}
                                    {categories.length === 0 && <div className="text-center py-10 text-slate-400 italic">No categories. Teach the AI above and click Suggest.</div>}
                                </div>
                            </Card>

                            {/* RIGHT: EVIDENCE LOCKER (Same as before) */}
                            <Card className="flex flex-col border-l-4 border-l-blue-100">
                                <CardHeader className="py-4 bg-slate-50/50 border-b">
                                    <div className="flex justify-between items-center">
                                        <div><CardTitle className="text-lg flex items-center gap-2"><Search className="w-4 h-4 text-slate-400" /> Live Preview</CardTitle><CardDescription>{activeCategory ? `Comments matching "${activeCategory.name}"` : "Select a category"}</CardDescription></div>
                                        {activeCategory && <Badge variant="outline" className="bg-white">{evidenceComments.length} Samples</Badge>}
                                    </div>
                                </CardHeader>
                                <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-white">
                                    {isFetchingEvidence ? <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-blue-400" /></div> : activeCategory ? (evidenceComments.length > 0 ? evidenceComments.map((c) => <div key={c.id} className="p-3 bg-slate-50 rounded border text-sm text-slate-700 italic">"{c.text}"</div>) : <div className="text-center py-10 text-slate-400">No keyword matches found.<br /><span className="text-xs">Try editing the keywords.</span></div>) : <div className="text-center py-20 text-slate-300">Select a category on the left</div>}
                                </div>
                            </Card>
                        </div>
                    </TabsContent>

                    {/* TAB 2 & 3 (Subcategories & Analysis - Standard) */}
                    <TabsContent value="subcategories">
                        <Card className="border-t-4 border-t-indigo-500">
                            <CardContent className="py-6 space-y-6">
                                {categories.length === 0 ? (
                                    <div className="text-center py-10 text-slate-400">Configure categories first in Tab 1.</div>
                                ) : (
                                    categories.map(cat => {
                                        const catSubs = subcategories.filter(s => s.category_id === cat.id);
                                        return (
                                            <div key={cat.id} className="border rounded-lg overflow-hidden">
                                                <div className="bg-slate-50 px-4 py-3 flex items-center justify-between border-b">
                                                    <div>
                                                        <div className="font-semibold text-slate-800">{cat.name}</div>
                                                        <div className="text-xs text-slate-500">{catSubs.length} subcategories</div>
                                                    </div>
                                                    <div className="flex gap-2">
                                                        <Button size="sm" variant="outline" onClick={() => { setAddingSubForCatId(cat.id); setNewSubForm({ name: "", description: "" }); }}>
                                                            <Plus className="w-3.5 h-3.5 mr-1" /> Add
                                                        </Button>
                                                        <Button size="sm" variant="outline" className="text-purple-600 border-purple-200 hover:bg-purple-50" onClick={() => handleAiSuggestSubcategories(cat)} disabled={suggestingForCatId === cat.id}>
                                                            {suggestingForCatId === cat.id ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-1" />} AI Suggest
                                                        </Button>
                                                    </div>
                                                </div>
                                                <div className="divide-y">
                                                    {catSubs.map(sub => (
                                                        <div key={sub.id} className="px-4 py-3 flex items-center justify-between hover:bg-slate-50/50 transition-colors">
                                                            {editingSubId === sub.id ? (
                                                                <div className="flex-1 flex gap-2 items-center">
                                                                    <Input className="h-8 text-sm" value={subEditForm.name} onChange={e => setSubEditForm(f => ({ ...f, name: e.target.value }))} />
                                                                    <Input className="h-8 text-sm" placeholder="Description" value={subEditForm.description} onChange={e => setSubEditForm(f => ({ ...f, description: e.target.value }))} />
                                                                    <Button size="sm" variant="ghost" onClick={handleSaveSubcategory}><CheckCircle className="w-4 h-4 text-green-600" /></Button>
                                                                    <Button size="sm" variant="ghost" onClick={() => setEditingSubId(null)}><X className="w-4 h-4" /></Button>
                                                                </div>
                                                            ) : (
                                                                <>
                                                                    <div>
                                                                        <div className="text-sm font-medium text-slate-700">{sub.name}</div>
                                                                        {sub.description && <div className="text-xs text-slate-500">{sub.description}</div>}
                                                                    </div>
                                                                    <div className="flex gap-1">
                                                                        <Button size="sm" variant="ghost" onClick={() => { setEditingSubId(sub.id); setSubEditForm({ name: sub.name, description: sub.description || "" }); }}><Pencil className="w-3.5 h-3.5 text-slate-400" /></Button>
                                                                        <Button size="sm" variant="ghost" onClick={() => handleDeleteSubcategory(sub.id)}><Trash2 className="w-3.5 h-3.5 text-red-400" /></Button>
                                                                    </div>
                                                                </>
                                                            )}
                                                        </div>
                                                    ))}
                                                    {catSubs.length === 0 && !addingSubForCatId && (
                                                        <div className="px-4 py-6 text-center text-sm text-slate-400">No subcategories. Click "Add" or "AI Suggest" to create some.</div>
                                                    )}
                                                    {addingSubForCatId === cat.id && (
                                                        <div className="px-4 py-3 bg-blue-50/50 flex gap-2 items-center">
                                                            <Input className="h-8 text-sm" placeholder="Subcategory name" value={newSubForm.name} onChange={e => setNewSubForm(f => ({ ...f, name: e.target.value }))} />
                                                            <Input className="h-8 text-sm" placeholder="Description (optional)" value={newSubForm.description} onChange={e => setNewSubForm(f => ({ ...f, description: e.target.value }))} />
                                                            <Button size="sm" onClick={() => handleAddSubcategory(cat.id)}><Save className="w-3.5 h-3.5" /></Button>
                                                            <Button size="sm" variant="ghost" onClick={() => setAddingSubForCatId(null)}><X className="w-3.5 h-3.5" /></Button>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="analysis">
                        <Card className="border-t-4 border-t-blue-600">
                            <CardContent className="py-8 space-y-6">
                                <div className="space-y-2"><div className="flex justify-between text-sm font-medium"><span>Progress</span><span>{progressPct}%</span></div><Progress value={progressPct} className="h-4" /></div>
                                <div className="flex gap-4 justify-center">
                                    {!isAnalyzing ? <Button size="lg" className="w-40 bg-blue-600 hover:bg-blue-700 shadow-lg" onClick={handleStartAnalysis}><Play className="w-4 h-4 mr-2" /> Start Test</Button> : <Button size="lg" variant="destructive" className="w-40 shadow-lg" onClick={() => { stopRef.current = true; }}><Pause className="w-4 h-4 mr-2" /> Pause</Button>}
                                </div>
                                <div className="bg-slate-900 text-slate-300 font-mono text-sm h-[300px] overflow-y-auto p-4 rounded-md space-y-1">{logs.map((log, i) => <div key={i} className="border-l-2 border-slate-700 pl-2"><span className="text-slate-500 text-xs mr-2">[{new Date().toLocaleTimeString()}]</span>{log}</div>)}</div>
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>
            </div>
            <ConfirmDialog
                open={deleteCatTarget !== null}
                onOpenChange={(open) => !open && setDeleteCatTarget(null)}
                title="Delete Category?"
                description="This will permanently delete this category and any associated analysis data."
                confirmLabel="Delete"
                variant="destructive"
                onConfirm={() => deleteCatTarget && handleDeleteCategory(deleteCatTarget)}
            />
        </PageShell>
    );
}