"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Loader2, Plus, Trash2, Play, Sparkles, CheckCircle2, Save, X, RefreshCw, Lock, Info, ArrowRight, ExternalLink, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MANDATORY_CATEGORIES } from "@/lib/constants";
import Link from "next/link";

type Category = { name: string; description: string; keywords: string[] };
type Instruction = { id: number; instruction: string };

export default function CategorizationEngine({ unitId, surveyId, onDataChange }: { unitId: string; surveyId?: string; onDataChange?: () => void }) {
    // Data State
    const [instructions, setInstructions] = useState<Instruction[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [totalComments, setTotalComments] = useState(0);
    const [pendingComments, setPendingComments] = useState(0);

    // UI State
    const [newInstruction, setNewInstruction] = useState("");
    const [isProcessing, setIsProcessing] = useState(false);
    const [progress, setProgress] = useState(0);
    const [statusMsg, setStatusMsg] = useState("");
    const [unitName, setUnitName] = useState("");
    const [unitDescription, setUnitDescription] = useState("");

    const stopRef = useRef(false);
    const [showSaveConfirm, setShowSaveConfirm] = useState(false);
    const [showDeleteAllConfirm, setShowDeleteAllConfirm] = useState(false);
    const [instructionToDelete, setInstructionToDelete] = useState<number | null>(null);

    // Unsaved changes tracking
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const [savedSnapshot, setSavedSnapshot] = useState<string>("");

    // Keyword interaction state
    const [newKeywordInputs, setNewKeywordInputs] = useState<Record<number, string>>({});
    const [movingKeyword, setMovingKeyword] = useState<{ catIdx: number; keyword: string } | null>(null);

    const isMounted = useRef(true);

    useEffect(() => {
        isMounted.current = true;
        loadData();
        return () => {
            isMounted.current = false;
        };
    }, [unitId, surveyId]);

    // --- Unsaved Changes Warning ---
    useEffect(() => {
        if (!hasUnsavedChanges) return;

        const handler = (e: BeforeUnloadEvent) => {
            e.preventDefault();
            e.returnValue = "";
        };
        window.addEventListener("beforeunload", handler);
        return () => window.removeEventListener("beforeunload", handler);
    }, [hasUnsavedChanges]);

    // Check if categories changed from saved snapshot
    const markDirty = useCallback(() => {
        setHasUnsavedChanges(true);
    }, []);

    async function loadData() {
        const { data: unit } = await supabase.from('organization_units').select('name, description').eq('id', unitId).single();
        if (!isMounted.current) return;
        if (unit) {
            setUnitName(unit.name);
            setUnitDescription(unit.description || "");
        }

        const { data: inst } = await supabase.from('unit_analysis_instructions').select('*').eq('unit_id', unitId).order('created_at');
        if (!isMounted.current) return;
        if (inst) setInstructions(inst);

        const { data: cats } = await supabase.from('analysis_categories').select('*').eq('unit_id', unitId);
        if (!isMounted.current) return;
        if (cats && cats.length > 0) {
            const loaded = cats.map(c => ({ name: c.name, description: c.description || "", keywords: [...new Set((c.keywords || []) as string[])] }));
            setCategories(loaded);
            setSavedSnapshot(JSON.stringify(loaded));
        } else {
            setCategories([]);
            setSavedSnapshot("[]");
        }

        // Count qualitative comments for this unit
        // Scope by survey if provided
        if (surveyId) {
            let respIds: number[] = [];
            let rPage = 0;
            while (true) {
                const { data: rBat } = await supabase.from('respondents').select('id').eq('survey_id', surveyId).range(rPage * 1000, (rPage + 1) * 1000 - 1);
                if (!rBat || rBat.length === 0) break;
                respIds.push(...rBat.map((r: any) => r.id));
                if (rBat.length < 1000) break;
                rPage++;
            }

            if (respIds.length > 0) {
                let totalC = 0;
                let pendingC = 0;
                const CHUNK_SIZE = 100;
                const totalPromises = [];
                const pendingPromises = [];
                for (let i = 0; i < respIds.length; i += CHUNK_SIZE) {
                    const chunk = respIds.slice(i, i + CHUNK_SIZE);
                    totalPromises.push(
                        supabase.from('raw_feedback_inputs')
                            .select('*', { count: 'exact', head: true })
                            .eq('target_unit_id', unitId)
                            .eq('is_quantitative', false)
                            .in('respondent_id', chunk)
                    );
                    pendingPromises.push(
                        supabase.from('raw_feedback_inputs')
                            .select('*', { count: 'exact', head: true })
                            .eq('target_unit_id', unitId)
                            .eq('is_quantitative', false)
                            .eq('requires_analysis', true)
                            .in('respondent_id', chunk)
                    );
                }
                const [totalResults, pendingResults] = await Promise.all([
                    Promise.all(totalPromises),
                    Promise.all(pendingPromises)
                ]);
                if (!isMounted.current) return;
                for (const res of totalResults) totalC += (res.count || 0);
                for (const res of pendingResults) pendingC += (res.count || 0);
                setTotalComments(totalC);
                setPendingComments(pendingC);
            } else {
                if (!isMounted.current) return;
                setTotalComments(0);
                setPendingComments(0);
            }
        } else {
            const { count: total } = await supabase.from('raw_feedback_inputs')
                .select('*', { count: 'exact', head: true })
                .eq('target_unit_id', unitId)
                .eq('is_quantitative', false);
            const { count: pending } = await supabase.from('raw_feedback_inputs')
                .select('*', { count: 'exact', head: true })
                .eq('target_unit_id', unitId)
                .eq('is_quantitative', false)
                .eq('requires_analysis', true);
            if (!isMounted.current) return;
            setTotalComments(total || 0);
            setPendingComments(pending || 0);
        }
    }

    const addInstruction = async () => {
        if (!newInstruction.trim()) return;
        const { data } = await supabase.from('unit_analysis_instructions').insert({ unit_id: unitId, instruction: newInstruction }).select().single();
        if (data) setInstructions([...instructions, data]);
        setNewInstruction("");
    };

    const promptDeleteInstruction = (id: number) => {
        setInstructionToDelete(id);
    };

    const confirmDeleteInstruction = async () => {
        if (!instructionToDelete) return;
        await supabase.from('unit_analysis_instructions').delete().eq('id', instructionToDelete);
        setInstructions(instructions.filter(i => i.id !== instructionToDelete));
        setInstructionToDelete(null);
    };

    // --- Helper: Check if a category is mandatory ---
    const isMandatory = (catName: string) => {
        return MANDATORY_CATEGORIES.some(mc => mc.name.toLowerCase() === catName.toLowerCase());
    };

    // --- RECURSIVE DISCOVERY ENGINE ---
    const startDiscovery = async () => {
        setIsProcessing(true);
        setProgress(0);
        stopRef.current = false;

        // Seed mandatory categories if not already present
        let currentCats = [...categories];
        for (const mc of MANDATORY_CATEGORIES) {
            if (!currentCats.some(c => c.name.toLowerCase() === mc.name.toLowerCase())) {
                currentCats.push({ ...mc });
            }
        }
        setCategories(currentCats);

        try {
            setStatusMsg("Fetching all comments from database...");

            // 1. SAFE FETCH LOOP (Bypassing the 1000 row limit)
            let allRows: any[] = [];
            let hasMore = true;
            let page = 0;
            const DB_BATCH = 1000;

            // Pre-fetch respondent IDs for global batch loop
            let respIds: number[] = [];
            if (surveyId) {
                let rPage = 0;
                while (true) {
                    const { data: rBat } = await supabase.from('respondents').select('id').eq('survey_id', surveyId).order('id').range(rPage * 1000, (rPage + 1) * 1000 - 1);
                    if (!rBat || rBat.length === 0) break;
                    respIds.push(...rBat.map((r: any) => r.id));
                    if (rBat.length < 1000) break;
                    rPage++;
                }
            }

            if (surveyId && respIds.length > 0) {
                const CHUNK_SIZE = 100;
                const fetchPromises = [];
                for (let i = 0; i < respIds.length; i += CHUNK_SIZE) {
                    const chunk = respIds.slice(i, i + CHUNK_SIZE);
                    fetchPromises.push(
                        supabase.from('raw_feedback_inputs')
                            .select('id, raw_text')
                            .eq('target_unit_id', unitId)
                            .eq('is_quantitative', false)
                            .in('respondent_id', chunk)
                    );
                }
                const results = await Promise.all(fetchPromises);
                for (const res of results) {
                    if (res.data) allRows.push(...res.data);
                }
            } else if (!surveyId) {
                while (hasMore) {
                    let query = supabase
                        .from('raw_feedback_inputs')
                        .select('id, raw_text')
                        .eq('target_unit_id', unitId)
                        .eq('is_quantitative', false)
                        .order('id');

                    const { data, error } = await query.range(page * DB_BATCH, (page + 1) * DB_BATCH - 1);

                    if (error) throw error;
                    if (data.length > 0) {
                        allRows = [...allRows, ...data];
                        page++;
                        if (data.length < DB_BATCH) hasMore = false;
                    } else {
                        hasMore = false;
                    }
                }
            }

            if (allRows.length === 0) {
                toast.warning("No text comments found to analyze!");
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
                setProgress(Math.round((batchNum / totalBatches) * 100));

                const response = await fetch('/api/ai/discover-categories', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        comments: batch.map(r => r.raw_text),
                        currentCategories: currentCats,
                        instructions: instructions.map(i => i.instruction),
                        unitName,
                        unitDescription
                    })
                });

                const result = await response.json();
                if (result.categories && Array.isArray(result.categories)) {
                    const sanitized = result.categories
                        .filter((c: any) => {
                            const n = (c.name || "").toLowerCase();
                            // Do not keep AI's versions of mandatory categories to prevent duplicates
                            return !MANDATORY_CATEGORIES.some(mc => {
                                const mcn = mc.name.toLowerCase();
                                return n === mcn ||
                                    n === mcn.replace("&", "and") ||
                                    n.includes("others") ||
                                    n.includes("service & response") ||
                                    n.includes("service and response") ||
                                    n.includes("staff service");
                            });
                        })
                        .map((c: any) => ({
                            name: typeof c.name === 'string' ? c.name : "Unnamed Category",
                            description: typeof c.description === 'string' ? c.description : "",
                            keywords: Array.isArray(c.keywords) ? [...new Set(c.keywords)] : []
                        }));

                    // Ensure perfect mandatory categories are still present after AI processing
                    for (const mc of MANDATORY_CATEGORIES) {
                        if (!sanitized.some((c: Category) => c.name.toLowerCase() === mc.name.toLowerCase())) {
                            sanitized.push({ ...mc });
                        }
                    }

                    currentCats = sanitized;
                    setCategories(currentCats);
                }
            }
            setStatusMsg("Discovery Complete! Please review categories below.");
            setProgress(100);
            setHasUnsavedChanges(true);
        } catch (e: any) {
            toast.error("Error during discovery: " + e.message);
        } finally {
            setIsProcessing(false);
        }
    };

    const saveTaxonomy = async () => {
        // 1. To completely replace the taxonomy for this unit, we MUST delete any existing
        // feedback_segments that reference the old categories to avoid Foreign Key constraint 
        // violations when we delete the old categories.

        const { data: oldCats } = await supabase.from('analysis_categories').select('id').eq('unit_id', unitId);
        if (oldCats && oldCats.length > 0) {
            const catIds = oldCats.map(c => c.id);
            const { error: delSegError } = await supabase
                .from('feedback_segments')
                .delete()
                .in('category_id', catIds);

            if (delSegError) {
                toast.error("Segment cleanup failed: " + delSegError.message);
                return;
            }
        }

        // 2. Clear old categories safely now that segments are gone
        const { error: catDeleteError } = await supabase.from('analysis_categories').delete().eq('unit_id', unitId);

        if (catDeleteError) {
            toast.error("Failed to delete old categories: " + catDeleteError.message);
            return;
        }

        const payload = categories.map(c => ({
            unit_id: unitId,
            name: c.name,
            description: c.description,
            keywords: c.keywords
        }));

        const { error } = await supabase.from('analysis_categories').insert(payload);
        if (!error) {
            toast.success("Taxonomy Saved Successfully!");
            setHasUnsavedChanges(false);
            setSavedSnapshot(JSON.stringify(categories));
            if (onDataChange) onDataChange();
        } else {
            toast.error("Save failed: " + error.message);
        }
        setShowSaveConfirm(false);
    };

    const confirmDeleteAllAndSave = async () => {
        const justMandatory = MANDATORY_CATEGORIES.map(mc => ({ ...mc }));
        setCategories(justMandatory);
        markDirty();

        // We cannot rely on the 'categories' state being updated immediately in saveTaxonomy,
        // so we manually perform the save logic here using justMandatory.

        // 1. Clear existing segments related to old categories
        const { data: oldCats } = await supabase.from('analysis_categories').select('id').eq('unit_id', unitId);
        if (oldCats && oldCats.length > 0) {
            const catIds = oldCats.map(c => c.id);
            const { error: delSegError } = await supabase
                .from('feedback_segments')
                .delete()
                .in('category_id', catIds);

            if (delSegError) {
                toast.error("Segment cleanup failed: " + delSegError.message);
                return;
            }
        }

        // 2. Clear old categories safely
        const { error: catDeleteError } = await supabase.from('analysis_categories').delete().eq('unit_id', unitId);

        if (catDeleteError) {
            toast.error("Failed to delete old categories: " + catDeleteError.message);
            return;
        }

        // 3. Insert only mandatory categories
        const payload = justMandatory.map(c => ({
            unit_id: unitId,
            name: c.name,
            description: c.description,
            keywords: c.keywords
        }));

        const { error } = await supabase.from('analysis_categories').insert(payload);
        if (!error) {
            toast.success("All non-mandatory categories deleted successfully!");
            setHasUnsavedChanges(false);
            setSavedSnapshot(JSON.stringify(justMandatory));
            if (onDataChange) onDataChange();
        } else {
            toast.error("Save failed: " + error.message);
        }
        setShowDeleteAllConfirm(false);
    };

    // --- Category editing helpers ---
    const updateCategoryField = (idx: number, field: keyof Category, value: any) => {
        const newCats = [...categories];
        (newCats[idx] as any)[field] = value;
        setCategories(newCats);
        markDirty();
    };

    const deleteCategory = (idx: number) => {
        if (isMandatory(categories[idx].name)) {
            toast.error("This is a mandatory category and cannot be deleted.");
            return;
        }
        setCategories(categories.filter((_, i) => i !== idx));
        markDirty();
    };

    const removeKeyword = (catIdx: number, keyword: string) => {
        const newCats = [...categories];
        newCats[catIdx].keywords = newCats[catIdx].keywords.filter(k => k !== keyword);
        setCategories(newCats);
        markDirty();
    };

    const addKeyword = (catIdx: number) => {
        const kw = (newKeywordInputs[catIdx] || "").trim();
        if (!kw) return;
        if (categories[catIdx].keywords.includes(kw)) {
            toast.warning("This keyword already exists in this category.");
            return;
        }
        const newCats = [...categories];
        newCats[catIdx].keywords = [...newCats[catIdx].keywords, kw];
        setCategories(newCats);
        setNewKeywordInputs({ ...newKeywordInputs, [catIdx]: "" });
        markDirty();
    };

    const moveKeyword = (fromIdx: number, keyword: string, toIdx: number) => {
        const newCats = [...categories];
        newCats[fromIdx].keywords = newCats[fromIdx].keywords.filter(k => k !== keyword);
        if (!newCats[toIdx].keywords.includes(keyword)) {
            newCats[toIdx].keywords = [...newCats[toIdx].keywords, keyword];
        }
        setCategories(newCats);
        setMovingKeyword(null);
        markDirty();
    };

    // --- Save & Delete Button Components ---
    const SaveButton = () => (
        <Button onClick={() => setShowSaveConfirm(true)} className="bg-green-600 hover:bg-green-700 shadow-sm">
            <Save className="w-4 h-4 mr-2" /> Save Taxonomy
        </Button>
    );

    const DeleteAllButton = () => (
        <Button
            variant="destructive"
            onClick={() => setShowDeleteAllConfirm(true)}
            className="shadow-sm"
        >
            <Trash2 className="w-4 h-4 mr-2" /> Delete All
        </Button>
    );

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">

            {/* Unsaved Changes Banner */}
            {hasUnsavedChanges && categories.length > 0 && (
                <div className="sticky top-0 z-40 bg-amber-50 border border-amber-300 rounded-lg px-4 py-3 flex items-center gap-3 shadow-md animate-in fade-in slide-in-from-top-2">
                    <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                    <span className="text-sm font-medium text-amber-800 flex-1">
                        You have unsaved changes to your taxonomy. Remember to save before leaving this page.
                    </span>
                    <SaveButton />
                </div>
            )}

            {/* Section 1: Teach the AI */}
            <Card className="border-purple-200 bg-purple-50/30">
                <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2 text-purple-900"><Sparkles className="w-5 h-5" /> 1. Teach the AI</CardTitle>
                    <CardDescription>Add specific rules or terminology for {unitName}.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    {/* Unit Description Display */}
                    <div className="bg-white rounded-md border border-purple-100 p-4 space-y-2">
                        <div className="flex items-center justify-between">
                            <span className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                                <Info className="w-4 h-4 text-purple-500" /> Unit Description
                            </span>
                            <Link
                                href="/units"
                                className="text-xs text-purple-600 hover:text-purple-800 flex items-center gap-1 hover:underline"
                            >
                                Edit in Unit Settings <ExternalLink className="w-3 h-3" />
                            </Link>
                        </div>
                        <p className="text-sm text-slate-600 leading-relaxed">
                            {unitDescription || (
                                <span className="italic text-slate-400">
                                    No description set. The AI will rely only on the unit name. You can add context in{" "}
                                    <Link href="/units" className="underline text-purple-500 hover:text-purple-700">Unit Settings</Link>.
                                </span>
                            )}
                        </p>
                    </div>

                    {/* Custom Instructions */}
                    <div className="space-y-3">
                        <span className="text-sm font-semibold text-slate-700">Custom Rules</span>
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
                                    <Trash2 className="w-3 h-3 cursor-pointer hover:text-red-500" onClick={() => promptDeleteInstruction(inst.id)} />
                                </Badge>
                            ))}
                            {instructions.length === 0 && <span className="text-slate-400 text-sm italic">No instructions yet. AI will use general knowledge.</span>}
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Section 2: Discover Categories */}
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
                            <Progress value={progress} className="h-3" />
                            <p className="text-xs text-slate-500">Please do not close this tab. The AI is reading and refining topics...</p>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Section 3: Review Taxonomy */}
            {categories.length > 0 && (
                <Card className="border-green-200 bg-green-50/30">
                    <CardHeader className="flex flex-row justify-between items-center">
                        <div>
                            <CardTitle className="text-lg flex items-center gap-2 text-green-900"><CheckCircle2 className="w-5 h-5" /> 3. Review Taxonomy</CardTitle>
                            <CardDescription>Found {categories.length} categories. Edit before saving.</CardDescription>
                        </div>
                        <div className="flex gap-2">
                            <DeleteAllButton />
                            <SaveButton />
                        </div>
                    </CardHeader>
                    <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {categories.map((cat, idx) => {
                            const mandatory = isMandatory(cat.name);
                            return (
                                <div key={idx} className={`bg-white p-4 rounded-md border shadow-sm group hover:border-blue-400 transition-colors ${mandatory ? "ring-1 ring-amber-200" : ""}`}>
                                    <div className="flex justify-between items-start mb-2">
                                        <div className="flex items-center gap-2 flex-1 min-w-0">
                                            {mandatory && (
                                                <TooltipProvider>
                                                    <Tooltip>
                                                        <TooltipTrigger>
                                                            <Lock className="w-4 h-4 text-amber-500 shrink-0" />
                                                        </TooltipTrigger>
                                                        <TooltipContent>
                                                            <p>Mandatory category — cannot be deleted</p>
                                                        </TooltipContent>
                                                    </Tooltip>
                                                </TooltipProvider>
                                            )}
                                            <Input
                                                value={cat.name}
                                                onChange={(e) => updateCategoryField(idx, 'name', e.target.value)}
                                                className="font-bold border-none p-0 h-auto text-lg focus-visible:ring-0"
                                                readOnly={mandatory}
                                            />
                                        </div>
                                        {!mandatory && (
                                            <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-300 hover:text-red-500" onClick={() => deleteCategory(idx)}>
                                                <X className="w-4 h-4" />
                                            </Button>
                                        )}
                                    </div>
                                    <Textarea
                                        value={cat.description}
                                        onChange={(e) => updateCategoryField(idx, 'description', e.target.value)}
                                        className="text-sm text-slate-500 border-none p-0 resize-none focus-visible:ring-0 min-h-[40px]"
                                    />

                                    {/* Keywords Section */}
                                    <div className="mt-3 space-y-2">
                                        <div className="flex flex-wrap gap-1.5">
                                            {cat.keywords?.map((k, ki) => (
                                                <Badge
                                                    key={`${k}-${ki}`}
                                                    variant="outline"
                                                    className="text-xs text-slate-600 bg-slate-50 pr-0.5 pl-2 py-1 gap-1.5 group/kw hover:border-blue-400 transition-colors cursor-default"
                                                >
                                                    <span
                                                        className="cursor-pointer hover:text-blue-600"
                                                        onClick={() => setMovingKeyword(
                                                            movingKeyword?.catIdx === idx && movingKeyword?.keyword === k
                                                                ? null
                                                                : { catIdx: idx, keyword: k }
                                                        )}
                                                        title="Click to move to another category"
                                                    >
                                                        {k}
                                                    </span>
                                                    <button
                                                        className="inline-flex items-center justify-center w-4 h-4 rounded-full cursor-pointer text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                                                        onClick={(e) => { e.stopPropagation(); removeKeyword(idx, k); }}
                                                        title="Remove keyword"
                                                    >
                                                        <X className="w-3 h-3" />
                                                    </button>
                                                </Badge>
                                            ))}
                                        </div>

                                        {/* Move keyword dropdown */}
                                        {movingKeyword && movingKeyword.catIdx === idx && (
                                            <div className="flex items-center gap-2 p-2 bg-blue-50 rounded border border-blue-200 animate-in fade-in">
                                                <ArrowRight className="w-3 h-3 text-blue-500 shrink-0" />
                                                <span className="text-xs text-blue-700 shrink-0">Move "{movingKeyword.keyword}" to:</span>
                                                <Select onValueChange={(val) => moveKeyword(idx, movingKeyword.keyword, parseInt(val))}>
                                                    <SelectTrigger className="h-7 text-xs flex-1 bg-white">
                                                        <SelectValue placeholder="Select category..." />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {categories.map((c, i) =>
                                                            i !== idx && (
                                                                <SelectItem key={i} value={i.toString()} className="text-xs">
                                                                    {c.name}
                                                                </SelectItem>
                                                            )
                                                        )}
                                                    </SelectContent>
                                                </Select>
                                                <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => setMovingKeyword(null)}>
                                                    <X className="w-3 h-3" />
                                                </Button>
                                            </div>
                                        )}

                                        {/* Add keyword input */}
                                        <div className="flex items-center gap-1.5">
                                            <Input
                                                value={newKeywordInputs[idx] || ""}
                                                onChange={(e) => setNewKeywordInputs({ ...newKeywordInputs, [idx]: e.target.value })}
                                                onKeyDown={(e) => e.key === 'Enter' && addKeyword(idx)}
                                                placeholder="Add keyword..."
                                                className="h-7 text-xs bg-slate-50 border-dashed"
                                            />
                                            <TooltipProvider>
                                                <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-7 w-7 shrink-0 text-slate-400 hover:text-green-600"
                                                            onClick={() => addKeyword(idx)}
                                                        >
                                                            <Plus className="w-3.5 h-3.5" />
                                                        </Button>
                                                    </TooltipTrigger>
                                                    <TooltipContent side="top" className="max-w-[250px]">
                                                        <p className="text-xs">Custom keywords help the AI match related comments during analysis. They don&apos;t need to appear verbatim in the data.</p>
                                                    </TooltipContent>
                                                </Tooltip>
                                            </TooltipProvider>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                        <Button variant="outline" className="h-full min-h-[120px] border-dashed border-2 flex flex-col gap-2 text-slate-400 hover:text-slate-600 hover:border-slate-400" onClick={() => {
                            setCategories([...categories, { name: "New Category", description: "Description...", keywords: [] }]);
                            markDirty();
                        }}>
                            <Plus className="w-8 h-8" /> Add Manual Category
                        </Button>
                    </CardContent>
                    <CardFooter className="flex justify-between border-t pt-4">
                        <DeleteAllButton />
                        <SaveButton />
                    </CardFooter>
                </Card>
            )}

            {/* Dialogs */}
            <ConfirmDialog
                open={showSaveConfirm}
                onOpenChange={setShowSaveConfirm}
                title="Save Taxonomy?"
                description="This will overwrite existing categories for this unit and clear previous analysis results. You can still edit them later. Continue?"
                confirmLabel="Save"
                onConfirm={saveTaxonomy}
            />

            <ConfirmDialog
                open={showDeleteAllConfirm}
                onOpenChange={setShowDeleteAllConfirm}
                title="Delete All Non-Mandatory Categories?"
                description="This will instantly wipe out all your custom categories and clear previous analysis results for this unit. This action is irreversible. Continue?"
                confirmLabel="Delete All & Save"
                variant="destructive"
                onConfirm={confirmDeleteAllAndSave}
            />

            <ConfirmDialog
                open={instructionToDelete !== null}
                onOpenChange={(open) => !open && setInstructionToDelete(null)}
                title="Delete Instruction?"
                description="Are you sure you want to remove this customized instruction? This may affect future analysis."
                confirmLabel="Delete"
                variant="destructive"
                onConfirm={confirmDeleteInstruction}
            />
        </div>
    );
}