"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { PageShell, PageHeader } from "@/components/layout/PageShell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { OrganizationUnit } from "@/types";
import {
    Save, Loader2, AlertTriangle, GraduationCap,
    FileText, Calendar, Info, Users, Columns3, Plus, Trash2,
    Eye, Search, ChevronDown, ChevronRight, BrainCircuit, CheckCircle2
} from "lucide-react";
import { cn } from "@/lib/utils";

// --- Types ---
type DataType = "TEXT" | "SCORE" | "CATEGORY" | "IGNORE";
type ScoreRule = "LIKERT" | "BOOLEAN" | "NUMBER" | "TEXT_SCALE" | "CUSTOM_MAPPING";

interface ColumnMapping {
    source_column: string;
    target_unit_id: number;
    unit_name: string;
    row_count: number;
    is_quantitative: boolean;
    requires_analysis: boolean;
    has_segments: number;
    // Editable fields (tracked for dirty detection)
    newUnitId?: number;
    newType?: DataType;
    newRule?: ScoreRule;
    ruleChanged?: boolean;
    customMapping?: Record<string, number | null>;
}

interface ProdiEnrollmentEntry {
    id?: number;
    study_program: string;
    faculty: string;
    student_count: number;
    actual_respondents: number;
}

export default function SurveyManagePage() {
    const params = useParams();
    const surveyId = params.id as string;

    // Survey metadata
    const [title, setTitle] = useState("");
    const [year, setYear] = useState<number | "">("");
    const [description, setDescription] = useState("");
    const [savingMeta, setSavingMeta] = useState(false);

    // AI Dataset Cache
    const [aiCacheUpdatedAt, setAiCacheUpdatedAt] = useState<string | null>(null);
    const [buildingAiCache, setBuildingAiCache] = useState(false);
    const [buildElapsed, setBuildElapsed] = useState(0);
    const buildTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    type BuildSummary = { total_org_units: number; analyzed_units: number; quant_only_units: number; cached_units: number };
    const [buildSummary, setBuildSummary] = useState<BuildSummary | null>(null);

    // Column mappings
    const [columns, setColumns] = useState<ColumnMapping[]>([]);
    const [units, setUnits] = useState<OrganizationUnit[]>([]);
    const [loadingCols, setLoadingCols] = useState(true);
    const [savingCols, setSavingCols] = useState(false);
    const [showConfirmSave, setShowConfirmSave] = useState(false);
    const [filterText, setFilterText] = useState("");

    // Expandable rows + eager-loaded unique values
    const [expandedCols, setExpandedCols] = useState<Set<string>>(new Set());
    const [colUniqueValues, setColUniqueValues] = useState<Map<string, string[]>>(new Map());
    const [loadingUniqueValues, setLoadingUniqueValues] = useState(false);
    // Lazy-load preview for TEXT columns
    const [previewCol, setPreviewCol] = useState<string | null>(null);
    const [previewData, setPreviewData] = useState<{ samples: string[]; uniqueValues: string[]; totalValid: number; uniqueCount: number } | null>(null);
    const [loadingPreview, setLoadingPreview] = useState(false);

    // Prodi Enrollment
    const [prodiEnrollments, setProdiEnrollments] = useState<ProdiEnrollmentEntry[]>([]);
    const [loadingProdi, setLoadingProdi] = useState(true);
    const [savingProdi, setSavingProdi] = useState(false);
    const [newProdiName, setNewProdiName] = useState('');
    const [newProdiFaculty, setNewProdiFaculty] = useState('');
    const [showAddProdi, setShowAddProdi] = useState(false);

    const [loading, setLoading] = useState(true);

    // --- Load Survey Metadata ---
    useEffect(() => {
        const load = async () => {
            setLoading(true);
            const { data } = await supabase
                .from('surveys')
                .select('title, year, description, ai_dataset_updated_at')
                .eq('id', surveyId)
                .single();

            if (data) {
                setTitle(data.title || "");
                setYear(data.year || "");
                setDescription(data.description || "");
                setAiCacheUpdatedAt(data.ai_dataset_updated_at || null);
                // Restore persisted build summary
                if (data.ai_dataset_updated_at) {
                    try {
                        const stored = localStorage.getItem(`ai_build_summary_${surveyId}`);
                        if (stored) setBuildSummary(JSON.parse(stored));
                    } catch {}
                }
            }
            setLoading(false);
        };
        load();
    }, [surveyId]);

    // --- Load Column Mappings ---
    const loadColumnMappings = useCallback(async () => {
        setLoadingCols(true);

        // 1. Fetch units first (fast)
        const { data: unitsData } = await supabase
            .from('organization_units')
            .select('id, name, short_name')
            .order('name');
        setUnits(unitsData || []);
        const unitMap = new Map((unitsData || []).map(u => [u.id, u.name]));

        // 2. Extract Respondent IDs with pagination
        let respIds: number[] = [];
        let rPage = 0;
        while (true) {
            const { data: rBat } = await supabase.from('respondents').select('id').eq('survey_id', surveyId).range(rPage * 1000, (rPage + 1) * 1000 - 1);
            if (!rBat || rBat.length === 0) break;
            respIds.push(...rBat.map((r: any) => r.id));
            if (rBat.length < 1000) break;
            rPage++;
        }

        let rawInputs: any[] = [];
        if (respIds.length > 0) {
            const CHUNK = 150;
            const promises = [];
            for (let i = 0; i < respIds.length; i += CHUNK) {
                const chunk = respIds.slice(i, i + CHUNK);
                promises.push(
                    supabase.from('raw_feedback_inputs')
                        .select('id, source_column, target_unit_id, is_quantitative, requires_analysis, score_rule, custom_mapping')
                        .in('respondent_id', chunk)
                );
            }
            const results = await Promise.all(promises);
            for (const res of results) {
                if (res.data) rawInputs.push(...res.data);
            }
        }

        if (rawInputs.length === 0) {
            setColumns([]);
            setLoadingCols(false);
            return;
        }

        // 3. Aggregate: group by source_column (unique column names)
        const groupMap = new Map<string, { source_column: string; target_unit_id: number; count: number; is_quantitative: boolean; requires_analysis: boolean; score_rule?: ScoreRule; custom_mapping?: Record<string, number | null>; inputIds: number[]; minId: number }>();
        rawInputs.forEach(row => {
            const key = row.source_column;
            const existing = groupMap.get(key);
            if (existing) {
                existing.count++;
                existing.inputIds.push(row.id);
                if (row.id < existing.minId) existing.minId = row.id;
                // OR-merge: if any row marks this column as text/quant, honour it
                if (row.requires_analysis) existing.requires_analysis = true;
                if (row.is_quantitative) existing.is_quantitative = true;
            } else {
                groupMap.set(key, {
                    source_column: row.source_column,
                    target_unit_id: row.target_unit_id,
                    count: 1,
                    is_quantitative: row.is_quantitative,
                    requires_analysis: row.requires_analysis ?? false,
                    score_rule: row.score_rule,
                    custom_mapping: row.custom_mapping,
                    inputIds: [row.id],
                    minId: row.id,
                });
            }
        });

        // 4. Count segments per column
        const allInputIds = rawInputs.map(r => r.id);
        const allSegInputIds = new Set<number>();
        const CHUNK2 = 1000;
        for (let i = 0; i < allInputIds.length; i += CHUNK2) {
            const chunk = allInputIds.slice(i, i + CHUNK2);
            const { data: segs } = await supabase
                .from('feedback_segments')
                .select('raw_input_id')
                .in('raw_input_id', chunk);
            segs?.forEach(s => allSegInputIds.add(s.raw_input_id));
        }

        const segmentCounts = new Map<string, number>();
        for (const [key, group] of groupMap) {
            const segCount = group.inputIds.filter(id => allSegInputIds.has(id)).length;
            segmentCounts.set(key, segCount);
        }

        const mappings: ColumnMapping[] = Array.from(groupMap.entries()).map(([key, g]) => {
            // Derive the current data type from flags
            let currentType: DataType = "IGNORE";
            if (g.is_quantitative) currentType = "SCORE";
            else if (g.requires_analysis) currentType = "TEXT";
            else currentType = "CATEGORY";

            return {
                source_column: g.source_column,
                target_unit_id: g.target_unit_id,
                unit_name: unitMap.get(g.target_unit_id) || "Unknown",
                row_count: g.count,
                is_quantitative: g.is_quantitative,
                requires_analysis: g.requires_analysis,
                has_segments: segmentCounts.get(key) || 0,
                // Initialize editable fields to current values
                newUnitId: g.target_unit_id,
                newType: currentType,
                newRule: g.score_rule || (currentType === "SCORE" ? "NUMBER" : undefined),
                customMapping: g.custom_mapping || {},
                _minId: g.minId,
            };
        });

        // Sort: by assigned unit name, pushing 'Unknown' to bottom, then by original import order
        mappings.sort((a, b) => {
            if (a.unit_name !== b.unit_name) {
                if (a.unit_name === "Unknown") return 1;
                if (b.unit_name === "Unknown") return -1;
                return a.unit_name.localeCompare(b.unit_name);
            }
            return (a as any)._minId - (b as any)._minId;
        });

        setColumns(mappings);
        setLoadingCols(false);
    }, [surveyId]);

    // --- Load Prodi Enrollment Data ---
    const loadProdiEnrollments = useCallback(async () => {
        setLoadingProdi(true);

        // Get study programs + faculties from respondents (to know the hierarchy)
        const { data: respondents } = await supabase
            .from('respondents')
            .select('study_program, faculty')
            .eq('survey_id', parseInt(surveyId));

        const prodiCounts = new Map<string, { count: number; faculty: string }>();
        (respondents || []).forEach((r: any) => {
            const p = r.study_program || 'Unknown';
            const f = r.faculty || 'Unknown';
            if (!prodiCounts.has(p)) prodiCounts.set(p, { count: 0, faculty: f });
            prodiCounts.get(p)!.count++;
        });

        // Get existing prodi enrollment data
        const { data: existing } = await supabase
            .from('prodi_enrollment')
            .select('*')
            .eq('survey_id', parseInt(surveyId));

        const existingMap = new Map((existing || []).map(e => [e.study_program, e]));

        // Merge: respondent data + saved enrollment + any saved entries not in respondent data
        const seenPrograms = new Set<string>();
        const entries: ProdiEnrollmentEntry[] = [];

        // First, add all programs from respondent data
        for (const [prodi, info] of prodiCounts.entries()) {
            if (prodi === 'Unknown') continue;
            seenPrograms.add(prodi);
            const ex = existingMap.get(prodi);
            entries.push({
                id: ex?.id,
                study_program: prodi,
                faculty: ex?.faculty || info.faculty,
                student_count: ex?.student_count || 0,
                actual_respondents: info.count,
            });
        }

        // Then, add any saved programs with 0 respondents (manually added)
        for (const ex of (existing || [])) {
            if (!seenPrograms.has(ex.study_program)) {
                entries.push({
                    id: ex.id,
                    study_program: ex.study_program,
                    faculty: ex.faculty || 'Unknown',
                    student_count: ex.student_count,
                    actual_respondents: 0,
                });
            }
        }

        // Sort by faculty then program name
        entries.sort((a, b) => a.faculty.localeCompare(b.faculty) || a.study_program.localeCompare(b.study_program));

        setProdiEnrollments(entries);
        setLoadingProdi(false);
    }, [surveyId]);

    // --- Save Prodi Enrollment ---
    const handleSaveProdiEnrollment = async () => {
        setSavingProdi(true);
        try {
            await supabase
                .from('prodi_enrollment')
                .delete()
                .eq('survey_id', parseInt(surveyId));

            const toInsert = prodiEnrollments
                .filter(e => e.student_count > 0)
                .map(e => ({
                    survey_id: parseInt(surveyId),
                    study_program: e.study_program,
                    faculty: e.faculty,
                    student_count: e.student_count,
                }));

            if (toInsert.length > 0) {
                const { error } = await supabase
                    .from('prodi_enrollment')
                    .insert(toInsert);
                if (error) throw error;
            }

            toast.success('Enrollment data saved!');
            loadProdiEnrollments();
        } catch (e: any) {
            toast.error('Failed to save: ' + e.message);
        } finally {
            setSavingProdi(false);
        }
    };

    // --- Add Study Program ---
    const handleAddProdi = () => {
        if (!newProdiName.trim() || !newProdiFaculty.trim()) return;
        if (prodiEnrollments.some(e => e.study_program === newProdiName.trim())) {
            toast.error('This study program already exists.');
            return;
        }
        setProdiEnrollments(prev => [...prev, {
            study_program: newProdiName.trim(),
            faculty: newProdiFaculty.trim(),
            student_count: 0,
            actual_respondents: 0,
        }]);
        setNewProdiName('');
        setNewProdiFaculty('');
        setShowAddProdi(false);
    };

    // --- Load unique values from cache (instant) ---
    const loadCachedUniqueValues = useCallback(async () => {
        setLoadingUniqueValues(true);
        try {
            const { data: cached } = await supabase
                .from('survey_column_cache')
                .select('source_column, unique_values')
                .eq('survey_id', parseInt(surveyId));

            if (cached && cached.length > 0) {
                const uniqueMap = new Map<string, string[]>();
                cached.forEach((row: any) => {
                    uniqueMap.set(row.source_column, row.unique_values || []);
                });
                setColUniqueValues(uniqueMap);
            }
        } catch (e) {
            console.error('Failed to load cached unique values:', e);
        } finally {
            setLoadingUniqueValues(false);
        }
    }, [surveyId]);

    // --- Build & persist unique values cache (heavy, user-triggered) ---
    const [buildingCache, setBuildingCache] = useState(false);
    const [cacheProgress, setCacheProgress] = useState(0);
    const [currentCacheCol, setCurrentCacheCol] = useState(0);
    const [totalCacheCols, setTotalCacheCols] = useState(0);
    const buildUniqueValuesCache = useCallback(async () => {
        setBuildingCache(true);
        setCacheProgress(0);
        setCurrentCacheCol(0);
        setTotalCacheCols(columns.length);
        try {
            // Get respondent IDs
            let respIds: number[] = [];
            let rp = 0;
            while (true) {
                const { data: rb } = await supabase.from('respondents').select('id').eq('survey_id', surveyId).range(rp * 1000, (rp + 1) * 1000 - 1);
                if (!rb || rb.length === 0) break;
                respIds.push(...rb.map((r: any) => r.id));
                if (rb.length < 1000) break;
                rp++;
            }
            if (respIds.length === 0) { setBuildingCache(false); return; }

            // Get all distinct source_columns for this survey
            const colNames = columns.map(c => c.source_column);
            const totalCols = colNames.length;
            const cacheRows: { survey_id: number; source_column: string; unique_values: string[] }[] = [];

            for (let idx = 0; idx < colNames.length; idx++) {
                setCurrentCacheCol(idx + 1);
                const colName = colNames[idx];

                // Resume logic: skip if already cached
                if (colUniqueValues.has(colName) && (colUniqueValues.get(colName)?.length || 0) > 0) {
                    setCacheProgress(Math.round(((idx + 1) / totalCols) * 90));
                    continue;
                }

                const allValues: string[] = [];
                const CHUNK = 200;
                for (let i = 0; i < respIds.length; i += CHUNK) {
                    const chunk = respIds.slice(i, i + CHUNK);
                    const { data: rows } = await supabase.from('raw_feedback_inputs')
                        .select('raw_text, numerical_score')
                        .eq('source_column', colName)
                        .in('respondent_id', chunk)
                        .limit(500);
                    (rows || []).forEach(r => {
                        const v = r.raw_text || r.numerical_score?.toString() || '';
                        if (v.trim() !== '' && v !== '-' && v !== 'N/A') allValues.push(v);
                    });
                }
                const uniqueSet = Array.from(new Set(allValues));
                cacheRows.push({
                    survey_id: parseInt(surveyId),
                    source_column: colName,
                    unique_values: uniqueSet.slice(0, 20),
                });

                // Update progress: 90% of bar for fetching, 10% for saving
                setCacheProgress(Math.round(((idx + 1) / totalCols) * 90));
            }

            // Upsert in batches
            for (let i = 0; i < cacheRows.length; i += 50) {
                const batch = cacheRows.slice(i, i + 50);
                const { error } = await supabase.from('survey_column_cache')
                    .upsert(batch, { onConflict: 'survey_id,source_column' });
                if (error) throw error;

                const saveProgress = 90 + Math.round(((i + batch.length) / cacheRows.length) * 10);
                setCacheProgress(saveProgress > 100 ? 100 : saveProgress);
            }

            // Update local state
            await loadCachedUniqueValues();
            setCacheProgress(100);

            toast.success(`Optimized cache updated! ${cacheRows.length > 0 ? `Built ${cacheRows.length} new entries.` : 'All columns already cached.'}`);
        } catch (e: any) {
            console.error('Failed to build cache:', e);
            toast.error('Failed to build optimized cache: ' + (e.message || 'Error'));
        } finally {
            setTimeout(() => {
                setBuildingCache(false);
                setCacheProgress(0);
            }, 1000);
        }
    }, [surveyId, columns]);

    // Toggle expand/collapse for a column row
    const toggleExpand = (colName: string) => {
        setExpandedCols(prev => {
            const next = new Set(prev);
            if (next.has(colName)) next.delete(colName);
            else next.add(colName);
            return next;
        });
    };

    useEffect(() => {
        loadColumnMappings();
        loadProdiEnrollments();
    }, [loadColumnMappings, loadProdiEnrollments]);

    // Load cached unique values once columns are loaded
    useEffect(() => {
        if (columns.length > 0 && colUniqueValues.size === 0 && !loadingUniqueValues) {
            loadCachedUniqueValues();
        }
    }, [columns, colUniqueValues.size, loadingUniqueValues, loadCachedUniqueValues]);

    // --- Save Survey Metadata ---
    const handleSaveMeta = async () => {
        setSavingMeta(true);
        const { error } = await supabase
            .from('surveys')
            .update({
                title: title.trim(),
                year: year || null,
                description: description.trim() || null,
            })
            .eq('id', surveyId);

        if (error) {
            toast.error("Failed to save: " + error.message);
        } else {
            toast.success("Survey details saved!");
        }
        setSavingMeta(false);
    };

    // --- Build AI Data Scientist Cache ---
    const handleBuildAiCache = async () => {
        setBuildingAiCache(true);
        setBuildElapsed(0);
        buildTimerRef.current = setInterval(() => setBuildElapsed(e => e + 1), 1000);
        try {
            const res = await fetch('/api/ai/cache-global-dataset', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ surveyId })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to build AI cache");

            const summary: BuildSummary = {
                total_org_units: data.total_org_units ?? 0,
                analyzed_units: data.analyzed_units ?? 0,
                quant_only_units: data.quant_only_units ?? 0,
                cached_units: data.count ?? 0,
            };
            setBuildSummary(summary);
            try { localStorage.setItem(`ai_build_summary_${surveyId}`, JSON.stringify(summary)); } catch {}

            const unanalyzed = summary.total_org_units - summary.analyzed_units;
            toast.success(`AI Context Built! ${summary.analyzed_units}/${summary.total_org_units} units analyzed.${unanalyzed > 0 ? ` ${unanalyzed} unit(s) still need analysis.` : ''}`);
            setAiCacheUpdatedAt(new Date().toISOString());
        } catch (e: any) {
            toast.error(e.message);
        } finally {
            if (buildTimerRef.current) clearInterval(buildTimerRef.current);
            setBuildingAiCache(false);
        }
    };

    // --- Inline edit helpers ---
    const updateColumn = (sourceColumn: string, field: keyof ColumnMapping, value: any) => {
        setColumns(prev => prev.map(c => {
            if (c.source_column === sourceColumn) {
                const isRuleChange = field === 'newRule';
                return { ...c, [field]: value, ...(isRuleChange ? { ruleChanged: true } : {}) };
            }
            return c;
        }));
    };

    const handleUpdateCustomMapping = (sourceColumn: string, valueStr: string, mappedScore: number | null) => {
        setColumns(prev => prev.map(c => {
            if (c.source_column === sourceColumn) {
                const currentMap = c.customMapping || {};
                const newMap = { ...currentMap, [valueStr]: mappedScore };
                return { ...c, customMapping: newMap, ruleChanged: true };
            }
            return c;
        }));
    };

    // Detect which columns have unsaved changes
    const dirtyColumns = useMemo(() => {
        return columns.filter(c => {
            const origType: DataType = c.is_quantitative ? "SCORE" : (c.requires_analysis ? "TEXT" : "CATEGORY");
            return c.newUnitId !== c.target_unit_id || c.newType !== origType || c.ruleChanged;
        });
    }, [columns]);

    // --- Save All Column Changes ---
    const handleSaveColumns = async () => {
        if (dirtyColumns.length === 0) return;
        setSavingCols(true);
        try {
            // Get all respondent IDs for chunked queries
            let allRespIds: number[] = [];
            let rp = 0;
            while (true) {
                const { data: rb } = await supabase.from('respondents').select('id').eq('survey_id', surveyId).range(rp * 1000, (rp + 1) * 1000 - 1);
                if (!rb || rb.length === 0) break;
                allRespIds.push(...rb.map((r: any) => r.id));
                if (rb.length < 1000) break;
                rp++;
            }

            for (const col of dirtyColumns) {
                // Get input IDs for this column
                const inputsToUpdate: any[] = [];
                const CHUNK = 500;
                for (let i = 0; i < allRespIds.length; i += CHUNK) {
                    const chunk = allRespIds.slice(i, i + CHUNK);
                    const { data } = await supabase.from('raw_feedback_inputs')
                        .select('id, raw_text')
                        .eq('source_column', col.source_column)
                        .in('respondent_id', chunk);
                    if (data) inputsToUpdate.push(...data);
                }

                if (inputsToUpdate.length === 0) continue;
                const inputIds = inputsToUpdate.map(t => t.id);

                // Delete stale segments if unit or type changed
                if (col.has_segments > 0) {
                    for (let i = 0; i < inputIds.length; i += 1000) {
                        await supabase.from('feedback_segments').delete().in('raw_input_id', inputIds.slice(i, i + 1000));
                    }
                }

                // Build update payload
                const isQuant = col.newType === "SCORE";
                const reqAnalysis = col.newType === "TEXT";
                const baseUpdatePayload: any = {
                    target_unit_id: col.newUnitId,
                    is_quantitative: isQuant,
                    requires_analysis: reqAnalysis,
                    score_rule: isQuant ? (col.newRule || "NUMBER") : null,
                    custom_mapping: isQuant && col.newRule === "CUSTOM_MAPPING" ? col.customMapping : null,
                };

                if (!isQuant && col.is_quantitative) {
                    baseUpdatePayload.numerical_score = null;
                }

                const needsScoreRecalc = isQuant && (col.ruleChanged || !col.is_quantitative);

                if (!needsScoreRecalc) {
                    // Normal scenario: Apply chunked updates directly
                    for (let i = 0; i < inputIds.length; i += 1000) {
                        const { error } = await supabase.from('raw_feedback_inputs')
                            .update(baseUpdatePayload)
                            .in('id', inputIds.slice(i, i + 1000));
                        if (error) throw error;
                    }
                } else {
                    // Need to Recalculate Score since the rule mapped changed
                    const scoreMapping = new Map<number | null, number[]>();
                    for (const input of inputsToUpdate) {
                        let score: number | null = null;
                        const rawValue = String(input.raw_text || "");
                        const rule = col.newRule || "NUMBER";

                        if (rule === "LIKERT") {
                            const match = rawValue.match(/^(\d+)/);
                            if (match) score = parseInt(match[1]);
                        } else if (rule === "BOOLEAN") {
                            const lower = rawValue.toLowerCase();
                            if (lower === "ya" || lower === "yes" || lower === "true") score = 1;
                            else score = 0;
                        } else if (rule === "NUMBER") {
                            const parsed = parseFloat(rawValue);
                            if (!isNaN(parsed)) score = parsed;
                        } else if (rule === "TEXT_SCALE") {
                            const lower = rawValue.toLowerCase();
                            if (lower.includes("tidak pernah") || lower.includes("sangat tidak") || lower.includes("never")) score = 1;
                            else if (lower.includes("jarang") || lower.includes("tidak setuju") || lower.includes("kurang") || lower.includes("rarely")) score = 2;
                            else if (lower.includes("sering") || lower.includes("setuju") || lower.includes("puas") || lower.includes("often") || lower.includes("kadang") || lower.includes("netral") || lower.includes("cukup") || lower.includes("ragu")) score = 3;
                            else if (lower.includes("selalu") || lower.includes("sangat") || lower.includes("lebih dari") || lower.includes("always")) score = 4;
                        } else if (rule === "CUSTOM_MAPPING") {
                            const map = col.customMapping || {};
                            if (rawValue in map) {
                                score = map[rawValue];
                            }
                        }

                        if (!scoreMapping.has(score)) scoreMapping.set(score, []);
                        scoreMapping.get(score)!.push(input.id);
                    }

                    // Update each score group
                    for (const [scoreVal, ids] of scoreMapping.entries()) {
                        const payload = { ...baseUpdatePayload, numerical_score: scoreVal };
                        for (let i = 0; i < ids.length; i += 1000) {
                            const { error } = await supabase.from('raw_feedback_inputs')
                                .update(payload)
                                .in('id', ids.slice(i, i + 1000));
                            if (error) throw error;
                        }
                    }
                }
            }

            // Invalidate derived caches — segments changed, all downstream caches are stale
            await Promise.all([
                supabase.from('survey_quant_cache').delete().eq('survey_id', parseInt(surveyId)),
                supabase.from('survey_faculty_cache').delete().eq('survey_id', parseInt(surveyId)),
                supabase.from('survey_cross_mentions_cache').delete().eq('survey_id', parseInt(surveyId)),
            ]);

            toast.success(`Saved changes to ${dirtyColumns.length} column(s). Analysis segments cleared for changed columns.`);
            loadColumnMappings();
        } catch (e: any) {
            toast.error("Save failed: " + e.message);
        } finally {
            setSavingCols(false);
        }
    };

    // --- Preview Column Data ---
    const handlePreview = async (sourceColumn: string) => {
        setPreviewCol(sourceColumn);
        setLoadingPreview(true);
        setPreviewData(null);
        try {
            // Get a sample of respondent IDs
            const { data: respSample } = await supabase.from('respondents')
                .select('id').eq('survey_id', surveyId).limit(200);
            const respIds = respSample?.map(r => r.id) || [];

            // Fetch raw texts for this column
            const { data: rows } = await supabase.from('raw_feedback_inputs')
                .select('raw_text, numerical_score')
                .eq('source_column', sourceColumn)
                .in('respondent_id', respIds)
                .limit(500);

            const allValues = (rows || []).map(r => r.raw_text || r.numerical_score?.toString() || '').filter(v => v.trim() !== '' && v !== '-' && v !== 'N/A');
            const uniqueSet = new Set(allValues);
            setPreviewData({
                samples: allValues.slice(0, 10),
                uniqueValues: Array.from(uniqueSet).slice(0, 30),
                totalValid: allValues.length,
                uniqueCount: uniqueSet.size,
            });
        } catch {
            toast.error("Failed to load preview");
        } finally {
            setLoadingPreview(false);
        }
    };

    const filteredColumns = useMemo(() =>
        columns.filter(c => c.source_column.toLowerCase().includes(filterText.toLowerCase())),
        [columns, filterText]);

    return (
        <PageShell>
            <PageHeader
                title="Manage Survey"
                description={title || "Loading..."}
                backHref={`/surveys/${surveyId}`}
                backLabel="Back to Survey"
            />

            <div className="max-w-[1600px] mx-auto px-4 md:px-8 py-10 space-y-8">
                <Tabs defaultValue="details" className="w-full">
                    <TabsList className="mb-8 p-0 bg-slate-200/50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-xl inline-flex h-12 items-center justify-center overflow-hidden w-full max-w-3xl grid grid-cols-3">
                        <TabsTrigger value="details" className="gap-2 h-full rounded-none data-[state=active]:bg-white dark:data-[state=active]:bg-slate-950 data-[state=active]:shadow-sm"><Info className="w-4 h-4" /> Survey Settings</TabsTrigger>
                        <TabsTrigger value="columns" className="gap-2 h-full rounded-none data-[state=active]:bg-white dark:data-[state=active]:bg-slate-950 data-[state=active]:shadow-sm"><Columns3 className="w-4 h-4" /> Column Mapping</TabsTrigger>
                        <TabsTrigger value="enrollments" className="gap-2 h-full rounded-none data-[state=active]:bg-white dark:data-[state=active]:bg-slate-950 data-[state=active]:shadow-sm"><GraduationCap className="w-4 h-4" /> Student Enrollment</TabsTrigger>
                    </TabsList>

                    <TabsContent value="details" className="space-y-8 max-w-5xl mx-auto mt-0">
                        {/* SECTION 1: Survey Metadata */}
                        <Card className="border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                            <div className="h-1 bg-gradient-to-r from-blue-500 to-indigo-500" />
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2 text-lg">
                                    <Info className="w-5 h-5 text-blue-600" /> Survey Information
                                </CardTitle>
                                <CardDescription>Edit the survey's metadata for identification and year-on-year tracking.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                {loading ? (
                                    <div className="space-y-4">
                                        <Skeleton className="h-10 w-full" />
                                        <Skeleton className="h-10 w-32" />
                                        <Skeleton className="h-20 w-full" />
                                    </div>
                                ) : (
                                    <div className="space-y-6">
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                            <div className="md:col-span-2 space-y-2">
                                                <label className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                                                    <FileText className="w-4 h-4" /> Survey Title
                                                </label>
                                                <Input
                                                    value={title}
                                                    onChange={(e) => setTitle(e.target.value)}
                                                    placeholder="e.g. Student Satisfaction Survey 2025"
                                                    className="bg-white dark:bg-slate-900"
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                                                    <Calendar className="w-4 h-4" /> Survey Year
                                                </label>
                                                <Input
                                                    type="number"
                                                    value={year}
                                                    onChange={(e) => setYear(e.target.value ? parseInt(e.target.value) : "")}
                                                    placeholder="e.g. 2025"
                                                    min={2000}
                                                    max={2099}
                                                    className="bg-white dark:bg-slate-900"
                                                />
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                                                <Info className="w-4 h-4" /> Description
                                            </label>
                                            <Textarea
                                                value={description}
                                                onChange={(e) => setDescription(e.target.value)}
                                                placeholder="Optional notes about this survey (e.g. Genap 2024/2025, includes all faculties)"
                                                className="bg-white dark:bg-slate-900 min-h-[80px] resize-none"
                                            />
                                        </div>

                                        <div className="flex justify-end">
                                            <Button onClick={handleSaveMeta} disabled={savingMeta} className="bg-blue-600 hover:bg-blue-700 gap-2">
                                                {savingMeta ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                                Save Changes
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        {/* Data Cache Card — separate from metadata */}
                        <Card className="border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                            <div className="h-1 bg-gradient-to-r from-teal-500 to-cyan-500" />
                            <CardContent className="p-6">
                                <div className="flex items-start justify-between gap-6">
                                    <div className="space-y-1.5">
                                        <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                                            <Columns3 className="w-5 h-5 text-teal-600" /> Column Value Cache
                                        </h3>
                                        <p className="text-sm text-slate-500 dark:text-slate-400 max-w-lg">
                                            Pre-compute unique values for all columns so they load instantly in the Column Mapping tab. Only needs to be done once per survey import. Values are capped at 20 per column.
                                        </p>
                                        {colUniqueValues.size > 0 && (
                                            <p className="text-xs text-green-600 dark:text-green-400 font-medium flex items-center gap-1 mt-2">
                                                ✓ {colUniqueValues.size} of {columns.length} columns cached
                                            </p>
                                        )}
                                    </div>
                                    <Button
                                        onClick={buildUniqueValuesCache}
                                        disabled={buildingCache || columns.length === 0}
                                        className={colUniqueValues.size > 0
                                            ? "shrink-0 gap-2 bg-slate-600 hover:bg-slate-700 text-white"
                                            : "shrink-0 gap-2 bg-teal-600 hover:bg-teal-700 text-white"
                                        }
                                    >
                                        {buildingCache ? (
                                            <><Loader2 className="w-4 h-4 animate-spin" /> Processing...</>
                                        ) : colUniqueValues.size > 0 ? (
                                            <><Eye className="w-4 h-4" /> Rebuild Cache</>
                                        ) : (
                                            <><Eye className="w-4 h-4" /> Build Cache</>
                                        )}
                                    </Button>
                                </div>
                                {buildingCache && (
                                    <div className="mt-6 space-y-2">
                                        <div className="flex justify-between text-xs font-medium">
                                            <span className="text-teal-600">Processing: {currentCacheCol} of {totalCacheCols} columns</span>
                                            <span className="text-slate-500">{cacheProgress}%</span>
                                        </div>
                                        <Progress value={cacheProgress} className="h-2 bg-teal-100" />
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        {/* AI Data Scientist Context Cache */}
                        <Card className="border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                            <div className="h-1 bg-gradient-to-r from-purple-500 to-fuchsia-500" />
                            <CardContent className="p-6">
                                <div className="flex items-start justify-between gap-6">
                                    <div className="space-y-1.5">
                                        <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                                            <BrainCircuit className="w-5 h-5 text-purple-600" /> AI Data Scientist Context
                                        </h3>
                                        <p className="text-sm text-slate-500 dark:text-slate-400 max-w-lg">
                                            Compile and freeze the current analysis metrics into a single dataset. The AI Data Scientist uses this snapshot to instantly answer complex queries without loading the entire database.
                                        </p>
                                        {aiCacheUpdatedAt && (
                                            <p className="text-xs text-green-600 dark:text-green-400 font-medium flex items-center gap-1 mt-2">
                                                <CheckCircle2 className="w-3.5 h-3.5" />
                                                Context Built: {new Date(aiCacheUpdatedAt).toLocaleString()}
                                            </p>
                                        )}
                                    </div>
                                    <div className="flex-shrink-0 flex items-center justify-center min-w-[140px]">
                                        <Button
                                            onClick={handleBuildAiCache}
                                            disabled={buildingAiCache}
                                            className="w-full gap-2 bg-purple-600 hover:bg-purple-700 text-white"
                                        >
                                            {buildingAiCache ? (
                                                <>
                                                    <Loader2 className="w-4 h-4 animate-spin" />
                                                    {buildElapsed > 0
                                                        ? `${Math.floor(buildElapsed / 60)}:${String(buildElapsed % 60).padStart(2, '0')}`
                                                        : "Building..."}
                                                </>
                                            ) : (
                                                <>
                                                    <BrainCircuit className="w-4 h-4" />
                                                    {aiCacheUpdatedAt ? "Re-Build Context" : "Build Context"}
                                                </>
                                            )}
                                        </Button>
                                    </div>
                                </div>

                                {buildSummary && (
                                    <div className="mt-5 pt-5 border-t border-slate-100 dark:border-slate-800 space-y-3">
                                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Coverage at Last Build</p>
                                        <div className="grid grid-cols-3 gap-3">
                                            <div className="bg-purple-50 dark:bg-purple-950/20 rounded-lg px-3 py-2.5 border border-purple-100 dark:border-purple-900/40">
                                                <p className="text-[10px] text-purple-500 font-semibold uppercase tracking-wide mb-0.5">In Dataset</p>
                                                <p className="text-xl font-black text-purple-700 dark:text-purple-300 tabular-nums">
                                                    {buildSummary.cached_units}
                                                    <span className="text-sm font-normal text-purple-400 ml-1">/ {buildSummary.total_org_units}</span>
                                                </p>
                                                <p className="text-[10px] text-purple-400 mt-0.5">org units with data</p>
                                            </div>
                                            <div className="bg-emerald-50 dark:bg-emerald-950/20 rounded-lg px-3 py-2.5 border border-emerald-100 dark:border-emerald-900/40">
                                                <p className="text-[10px] text-emerald-600 font-semibold uppercase tracking-wide mb-0.5">Analyzed</p>
                                                <p className="text-xl font-black text-emerald-700 dark:text-emerald-300 tabular-nums">
                                                    {buildSummary.analyzed_units}
                                                    <span className="text-sm font-normal text-emerald-400 ml-1">/ {buildSummary.total_org_units}</span>
                                                </p>
                                                <p className="text-[10px] text-emerald-500 mt-0.5">with qualitative analysis</p>
                                            </div>
                                            <div className={`rounded-lg px-3 py-2.5 border ${buildSummary.total_org_units - buildSummary.analyzed_units > 0 ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-100 dark:border-amber-900/40' : 'bg-slate-50 dark:bg-slate-900/40 border-slate-100 dark:border-slate-800'}`}>
                                                <p className={`text-[10px] font-semibold uppercase tracking-wide mb-0.5 ${buildSummary.total_org_units - buildSummary.analyzed_units > 0 ? 'text-amber-600' : 'text-slate-400'}`}>Not Yet Analyzed</p>
                                                <p className={`text-xl font-black tabular-nums ${buildSummary.total_org_units - buildSummary.analyzed_units > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-slate-400'}`}>
                                                    {buildSummary.total_org_units - buildSummary.analyzed_units}
                                                </p>
                                                <p className={`text-[10px] mt-0.5 ${buildSummary.total_org_units - buildSummary.analyzed_units > 0 ? 'text-amber-500' : 'text-slate-400'}`}>units still pending</p>
                                            </div>
                                        </div>
                                        {buildSummary.total_org_units - buildSummary.analyzed_units > 0 && (
                                            <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/40 rounded-lg px-3 py-2 flex items-center gap-2">
                                                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                                                {buildSummary.total_org_units - buildSummary.analyzed_units} unit{buildSummary.total_org_units - buildSummary.analyzed_units !== 1 ? 's' : ''} had not been analyzed yet. Re-build context after completing all unit analyses for full coverage.
                                            </p>
                                        )}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>


                    <TabsContent value="columns" className="space-y-8 mt-0">
                        {/* SECTION 2: Column Mapping */}
                        <Card className="border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                            <div className="h-1 bg-gradient-to-r from-purple-500 to-pink-500" />
                            <CardHeader>
                                <div className="flex items-center justify-between">
                                    <div>
                                        <CardTitle className="flex items-center gap-2 text-lg">
                                            <Columns3 className="w-5 h-5 text-purple-600" /> Column Mapping
                                        </CardTitle>
                                        <CardDescription>Manage column assignments: unit, data type, and transformation rules.</CardDescription>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent>
                                {loadingCols ? (
                                    <div className="space-y-3">
                                        {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
                                    </div>
                                ) : columns.length === 0 ? (
                                    <div className="text-center py-8 text-slate-400">
                                        <Columns3 className="w-8 h-8 mx-auto mb-2 opacity-50" />
                                        <p>No column mappings found for this survey.</p>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        {/* Search filter */}
                                        <div className="relative">
                                            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                                            <Input
                                                placeholder="Filter columns..."
                                                className="pl-9"
                                                value={filterText}
                                                onChange={e => setFilterText(e.target.value)}
                                            />
                                        </div>

                                        {/* Cache status indicator */}
                                        {buildingCache ? (
                                            <div className="space-y-2 bg-purple-50 dark:bg-purple-950/30 px-4 py-3 rounded-lg border border-purple-200 dark:border-purple-800">
                                                <div className="flex items-center justify-between gap-2 text-sm text-purple-600 dark:text-purple-400 font-medium">
                                                    <div className="flex items-center gap-2">
                                                        <Loader2 className="w-4 h-4 animate-spin" />
                                                        <span>Processing: {currentCacheCol} of {totalCacheCols} columns...</span>
                                                    </div>
                                                    <span>{cacheProgress}%</span>
                                                </div>
                                                <Progress value={cacheProgress} className="h-1.5 bg-purple-200 dark:bg-purple-900" />
                                            </div>
                                        ) : colUniqueValues.size === 0 && !loadingUniqueValues ? (
                                            <div className="text-sm text-slate-400 bg-slate-50 dark:bg-slate-900/50 px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-800">
                                                No cached values. Go to <span className="font-medium text-slate-600 dark:text-slate-300">Survey Settings → Build Cache</span> to enable inline unique values.
                                            </div>
                                        ) : colUniqueValues.size > 0 ? (
                                            <div className="text-xs text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/20 px-4 py-2 rounded-lg border border-green-200 dark:border-green-800">
                                                ✓ {colUniqueValues.size} of {columns.length} columns cached — expand rows to see values instantly
                                            </div>
                                        ) : null}

                                        {/* Expandable Column Cards */}
                                        <div className="space-y-2">
                                            {filteredColumns.map(col => {
                                                const origType: DataType = col.is_quantitative ? "SCORE" : (col.requires_analysis ? "TEXT" : "CATEGORY");
                                                const isDirty = col.newUnitId !== col.target_unit_id || col.newType !== origType || col.ruleChanged;
                                                const currentType = col.newType || origType;
                                                const isExpanded = expandedCols.has(col.source_column);
                                                const uniqueVals = colUniqueValues.get(col.source_column) || [];
                                                const hasUniqueVals = uniqueVals.length > 0;

                                                return (
                                                    <div
                                                        key={col.source_column}
                                                        className={cn(
                                                            "border rounded-xl overflow-hidden transition-all duration-200",
                                                            isDirty
                                                                ? "border-amber-300 dark:border-amber-700 bg-amber-50/30 dark:bg-amber-950/10"
                                                                : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950",
                                                            currentType === "IGNORE" && "opacity-50"
                                                        )}
                                                    >
                                                        {/* Collapsed Header Row */}
                                                        <div
                                                            className={cn(
                                                                "p-4 cursor-pointer transition-colors",
                                                                isExpanded ? "bg-slate-50 dark:bg-slate-900/50" : "hover:bg-slate-50/50 dark:hover:bg-slate-900/30"
                                                            )}
                                                            onClick={() => toggleExpand(col.source_column)}
                                                        >
                                                            {/* Row 1: Chevron + Full Column Name + Badges */}
                                                            <div className="flex items-start gap-3 mb-3">
                                                                <div className="mt-0.5 shrink-0">
                                                                    {isExpanded
                                                                        ? <ChevronDown className="w-4 h-4 text-slate-500" />
                                                                        : <ChevronRight className="w-4 h-4 text-slate-400" />
                                                                    }
                                                                </div>
                                                                <div className="flex-1 min-w-0">
                                                                    <span className="text-sm font-medium text-slate-800 dark:text-slate-200 leading-snug">
                                                                        {col.source_column}
                                                                    </span>
                                                                </div>
                                                                <div className="flex items-center gap-1.5 shrink-0">
                                                                    {isDirty && <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-400 text-[10px] px-1.5">edited</Badge>}
                                                                    {col.has_segments > 0 && (
                                                                        <Badge variant="outline" className="text-[10px] text-green-600 border-green-200 bg-green-50 dark:bg-green-950/30 dark:border-green-800">
                                                                            {col.has_segments} segs
                                                                        </Badge>
                                                                    )}
                                                                    {hasUniqueVals && uniqueVals.length <= 15 && (
                                                                        <Badge variant="outline" className="text-[10px] text-blue-600 border-blue-200 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-800">
                                                                            {uniqueVals.length} unique
                                                                        </Badge>
                                                                    )}
                                                                    <span className="text-xs text-slate-400 tabular-nums ml-1">
                                                                        {col.row_count.toLocaleString()} rows
                                                                    </span>
                                                                </div>
                                                            </div>
                                                            {/* Row 2: Selectors (click stops propagation) */}
                                                            <div className="flex items-center gap-3 pl-7" onClick={e => e.stopPropagation()}>
                                                                <div className="flex-1 min-w-0">
                                                                    <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1 block">Unit</label>
                                                                    <Select
                                                                        value={(col.newUnitId ?? col.target_unit_id).toString()}
                                                                        onValueChange={val => updateColumn(col.source_column, 'newUnitId', parseInt(val))}
                                                                    >
                                                                        <SelectTrigger className="h-9 bg-white dark:bg-slate-900 text-sm">
                                                                            <SelectValue placeholder="Select Unit" />
                                                                        </SelectTrigger>
                                                                        <SelectContent>
                                                                            {units.map(u => (
                                                                                <SelectItem key={u.id} value={u.id.toString()}>
                                                                                    {u.name} {u.short_name ? `(${u.short_name})` : ''}
                                                                                </SelectItem>
                                                                            ))}
                                                                        </SelectContent>
                                                                    </Select>
                                                                </div>
                                                                <div className="w-44 shrink-0">
                                                                    <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1 block">Type</label>
                                                                    <Select
                                                                        value={currentType}
                                                                        onValueChange={val => updateColumn(col.source_column, 'newType', val)}
                                                                    >
                                                                        <SelectTrigger className={cn("h-9 text-sm",
                                                                            currentType === "SCORE" ? "text-blue-700 bg-blue-50 dark:bg-blue-950/30" :
                                                                                currentType === "TEXT" ? "text-green-700 bg-green-50 dark:bg-green-950/30" :
                                                                                    currentType === "CATEGORY" ? "text-purple-700 bg-purple-50 dark:bg-purple-950/30" :
                                                                                        "bg-white dark:bg-slate-900"
                                                                        )}>
                                                                            <SelectValue />
                                                                        </SelectTrigger>
                                                                        <SelectContent>
                                                                            <SelectItem value="TEXT">Text (Analyze)</SelectItem>
                                                                            <SelectItem value="SCORE">Score (Number)</SelectItem>
                                                                            <SelectItem value="CATEGORY">Category (Filter)</SelectItem>
                                                                            <SelectItem value="IGNORE">Ignore</SelectItem>
                                                                        </SelectContent>
                                                                    </Select>
                                                                </div>
                                                                {currentType === "SCORE" && (
                                                                    <div className="w-40 shrink-0">
                                                                        <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1 block">Transform</label>
                                                                        <Select
                                                                            value={col.newRule || "NUMBER"}
                                                                            onValueChange={val => updateColumn(col.source_column, 'newRule', val)}
                                                                        >
                                                                            <SelectTrigger className="h-9 text-xs bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
                                                                                <SelectValue />
                                                                            </SelectTrigger>
                                                                            <SelectContent>
                                                                                <SelectItem value="LIKERT">Likert (4=Puas)</SelectItem>
                                                                                <SelectItem value="BOOLEAN">Yes/No (1/0)</SelectItem>
                                                                                <SelectItem value="TEXT_SCALE">Scale (Sering=4)</SelectItem>
                                                                                <SelectItem value="NUMBER">Raw Number</SelectItem>
                                                                                <SelectItem value="CUSTOM_MAPPING">Custom Mapping</SelectItem>
                                                                            </SelectContent>
                                                                        </Select>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>

                                                        {/* Expanded Section: Unique Values + Custom Mapping */}
                                                        {isExpanded && (
                                                            <div className="border-t border-slate-200 dark:border-slate-800 px-4 py-4 bg-slate-50/50 dark:bg-slate-900/30">
                                                                <div className="pl-7">
                                                                    {/* Show unique values */}
                                                                    {hasUniqueVals ? (
                                                                        <div className="space-y-3">
                                                                            <div className="flex items-center justify-between">
                                                                                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                                                                                    Unique Values ({uniqueVals.length}):
                                                                                </div>
                                                                                {currentType === "SCORE" && col.newRule !== "CUSTOM_MAPPING" && uniqueVals.length <= 20 && (
                                                                                    <Button
                                                                                        variant="outline"
                                                                                        size="sm"
                                                                                        onClick={() => updateColumn(col.source_column, 'newRule', 'CUSTOM_MAPPING')}
                                                                                        className="h-7 text-xs gap-1.5"
                                                                                    >
                                                                                        Switch to Custom Mapping
                                                                                    </Button>
                                                                                )}
                                                                            </div>

                                                                            {/* Custom Mapping Grid (inline!) */}
                                                                            {currentType === "SCORE" && col.newRule === "CUSTOM_MAPPING" ? (
                                                                                <div className="grid gap-2 border border-slate-200 dark:border-slate-800 rounded-lg p-3 bg-white dark:bg-slate-950 max-h-[400px] overflow-y-auto">
                                                                                    {uniqueVals.map((v, i) => (
                                                                                        <div key={i} className="flex items-center justify-between gap-4">
                                                                                            <span className="text-sm font-medium text-slate-700 dark:text-slate-300 break-all">{v || "(empty)"}</span>
                                                                                            <Select
                                                                                                value={col.customMapping?.[v] !== undefined ? (col.customMapping[v] === null ? "NA" : col.customMapping[v]?.toString()) : "NA"}
                                                                                                onValueChange={val => handleUpdateCustomMapping(col.source_column, v, val === "NA" ? null : parseInt(val))}
                                                                                            >
                                                                                                <SelectTrigger className="w-[120px] h-8 bg-white dark:bg-slate-950 shrink-0">
                                                                                                    <SelectValue placeholder="Map to..." />
                                                                                                </SelectTrigger>
                                                                                                <SelectContent>
                                                                                                    <SelectItem value="1">1</SelectItem>
                                                                                                    <SelectItem value="2">2</SelectItem>
                                                                                                    <SelectItem value="3">3</SelectItem>
                                                                                                    <SelectItem value="4">4</SelectItem>
                                                                                                    <SelectItem value="0">0</SelectItem>
                                                                                                    <SelectItem value="NA">NA / Ignore</SelectItem>
                                                                                                </SelectContent>
                                                                                            </Select>
                                                                                        </div>
                                                                                    ))}
                                                                                </div>
                                                                            ) : (
                                                                                /* Show values as badges */
                                                                                <div className="flex flex-wrap gap-1.5">
                                                                                    {uniqueVals.map((v, i) => (
                                                                                        <Badge key={i} variant="outline" className="text-xs py-1 px-2.5 bg-white dark:bg-slate-900 font-normal">
                                                                                            {v}
                                                                                        </Badge>
                                                                                    ))}
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    ) : loadingUniqueValues ? (
                                                                        <div className="flex items-center gap-2 text-sm text-slate-400 py-2">
                                                                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                                            <span>Loading values...</span>
                                                                        </div>
                                                                    ) : (
                                                                        <div className="flex items-center gap-3 py-2">
                                                                            <span className="text-sm text-slate-400">No unique values loaded.</span>
                                                                            <Button
                                                                                variant="outline"
                                                                                size="sm"
                                                                                onClick={() => handlePreview(col.source_column)}
                                                                                className="h-7 text-xs gap-1.5"
                                                                            >
                                                                                <Eye className="w-3 h-3" /> Load Preview
                                                                            </Button>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="enrollments" className="space-y-8 max-w-5xl mx-auto">
                        {/* SECTION 3: Prodi Enrollment */}
                        <Card className="border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                            <div className="h-1 bg-gradient-to-r from-emerald-500 to-teal-500" />
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2 text-lg">
                                    <GraduationCap className="w-5 h-5 text-emerald-600" /> Student Enrollment by Study Program
                                </CardTitle>
                                <CardDescription>
                                    Enter total enrolled students per study program. Faculty totals are auto-calculated. Used for response rate in reports.
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                {loadingProdi ? (
                                    <div className="space-y-3">
                                        {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        {/* Group by Faculty */}
                                        {(() => {
                                            const faculties = new Map<string, ProdiEnrollmentEntry[]>();
                                            prodiEnrollments.forEach(e => {
                                                if (!faculties.has(e.faculty)) faculties.set(e.faculty, []);
                                                faculties.get(e.faculty)!.push(e);
                                            });
                                            return Array.from(faculties.entries()).map(([faculty, programs]) => {
                                                const facTotal = programs.reduce((s, p) => s + p.student_count, 0);
                                                const facResp = programs.reduce((s, p) => s + p.actual_respondents, 0);
                                                const facRate = facTotal > 0 ? ((facResp / facTotal) * 100).toFixed(1) : null;
                                                return (
                                                    <div key={faculty} className="space-y-2">
                                                        <div className="flex items-center justify-between px-1">
                                                            <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300">{faculty}</h4>
                                                            <span className="text-xs text-slate-500">
                                                                {facResp.toLocaleString()} respondents / {facTotal > 0 ? facTotal.toLocaleString() : '?'} enrolled
                                                                {facRate && <span className="ml-1 font-semibold text-emerald-600">({facRate}%)</span>}
                                                            </span>
                                                        </div>
                                                        <div className="grid gap-2">
                                                            {programs.map(entry => {
                                                                const rate = entry.student_count > 0 ? ((entry.actual_respondents / entry.student_count) * 100).toFixed(1) : null;
                                                                return (
                                                                    <div key={entry.study_program} className="flex items-center gap-4 p-3 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800">
                                                                        <div className="flex-1 min-w-0">
                                                                            <span className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate block">{entry.study_program}</span>
                                                                            <span className="text-xs text-slate-400">
                                                                                {entry.actual_respondents} respondents
                                                                                {rate ? ` \u2022 ${rate}% response rate` : ''}
                                                                                {entry.actual_respondents === 0 && ' \u2022 Manually added'}
                                                                            </span>
                                                                        </div>
                                                                        <div className="flex items-center gap-2 shrink-0">
                                                                            <Users className="w-4 h-4 text-slate-400" />
                                                                            <Input type="number" value={entry.student_count || ''} onChange={(e) => { const val = parseInt(e.target.value) || 0; setProdiEnrollments(prev => prev.map(pe => pe.study_program === entry.study_program ? { ...pe, student_count: val } : pe)); }} placeholder="Total" min={0} className="w-28 bg-white dark:bg-slate-900 text-right" />
                                                                            <span className="text-xs text-slate-400 w-16">enrolled</span>
                                                                            {entry.actual_respondents === 0 && (
                                                                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-400 hover:text-red-600" onClick={() => setProdiEnrollments(prev => prev.filter(pe => pe.study_program !== entry.study_program))}>
                                                                                    <Trash2 className="w-3 h-3" />
                                                                                </Button>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                );
                                            });
                                        })()}

                                        {/* Add Study Program */}
                                        {showAddProdi ? (
                                            <div className="p-4 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 space-y-3">
                                                <div className="grid grid-cols-2 gap-3">
                                                    <div>
                                                        <label className="text-xs font-medium text-slate-500 mb-1 block">Study Program Name</label>
                                                        <Input value={newProdiName} onChange={(e) => setNewProdiName(e.target.value)} placeholder="e.g. S1 Pendidikan Kimia" />
                                                    </div>
                                                    <div>
                                                        <label className="text-xs font-medium text-slate-500 mb-1 block">Faculty</label>
                                                        <Input value={newProdiFaculty} onChange={(e) => setNewProdiFaculty(e.target.value)} placeholder="e.g. Fakultas Ilmu Pendidikan" />
                                                    </div>
                                                </div>
                                                <div className="flex justify-end gap-2">
                                                    <Button variant="ghost" size="sm" onClick={() => { setShowAddProdi(false); setNewProdiName(''); setNewProdiFaculty(''); }}>Cancel</Button>
                                                    <Button size="sm" onClick={handleAddProdi} disabled={!newProdiName.trim() || !newProdiFaculty.trim()} className="bg-emerald-600 hover:bg-emerald-700 gap-1">
                                                        <Plus className="w-3 h-3" /> Add
                                                    </Button>
                                                </div>
                                            </div>
                                        ) : (
                                            <Button variant="outline" className="w-full border-dashed gap-2 text-slate-500 hover:text-emerald-600 hover:border-emerald-300" onClick={() => setShowAddProdi(true)}>
                                                <Plus className="w-4 h-4" /> Add Study Program (0% response)
                                            </Button>
                                        )}

                                        <div className="flex justify-end">
                                            <Button onClick={handleSaveProdiEnrollment} disabled={savingProdi} className="bg-emerald-600 hover:bg-emerald-700 gap-2">
                                                {savingProdi ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                                Save Enrollment Data
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>
            </div>

            {/* Data Preview Dialog */}
            <Dialog open={!!previewCol} onOpenChange={(open) => { if (!open) setPreviewCol(null); }}>
                <DialogContent className="sm:max-w-xl">
                    <DialogHeader>
                        <DialogTitle>Data Preview</DialogTitle>
                        <DialogDescription>Column: <span className="font-semibold text-slate-800 dark:text-slate-200">{previewCol}</span></DialogDescription>
                    </DialogHeader>
                    {loadingPreview ? (
                        <div className="flex items-center justify-center py-12">
                            <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                        </div>
                    ) : previewData ? (
                        <div className="space-y-4">
                            <div className="flex gap-3 text-sm">
                                <div className="bg-slate-100 dark:bg-slate-800 px-3 py-2 rounded-lg">
                                    Valid Entries: <b>{previewData.totalValid}</b>
                                </div>
                                <div className="bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 px-3 py-2 rounded-lg">
                                    Unique Values: <b>{previewData.uniqueCount}</b>
                                </div>
                            </div>
                            {previewData.uniqueCount <= 20 ? (() => {
                                const activeCol = columns.find(c => c.source_column === previewCol);
                                return (
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between">
                                            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Distinct Values:</div>
                                            {activeCol?.newType === "SCORE" && activeCol?.newRule !== "CUSTOM_MAPPING" && (
                                                <Button variant="outline" size="sm" onClick={() => updateColumn(activeCol.source_column, 'newRule', 'CUSTOM_MAPPING')} className="h-7 text-xs">
                                                    Switch to Custom Mapping
                                                </Button>
                                            )}
                                        </div>
                                        {activeCol?.newType === "SCORE" && activeCol?.newRule === "CUSTOM_MAPPING" ? (
                                            <div className="grid gap-2 border border-slate-200 dark:border-slate-800 rounded-lg p-3 bg-slate-50 dark:bg-slate-900/50 max-h-[400px] overflow-y-auto">
                                                {previewData.uniqueValues.map((v, i) => (
                                                    <div key={i} className="flex items-center justify-between gap-4">
                                                        <span className="text-sm font-medium text-slate-700 dark:text-slate-300 break-all">{v || "(empty)"}</span>
                                                        <Select
                                                            value={activeCol.customMapping?.[v] !== undefined ? (activeCol.customMapping[v] === null ? "NA" : activeCol.customMapping[v]?.toString()) : "NA"}
                                                            onValueChange={val => handleUpdateCustomMapping(activeCol.source_column, v, val === "NA" ? null : parseInt(val))}
                                                        >
                                                            <SelectTrigger className="w-[120px] h-8 bg-white dark:bg-slate-950">
                                                                <SelectValue placeholder="Map to..." />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                <SelectItem value="1">1</SelectItem>
                                                                <SelectItem value="2">2</SelectItem>
                                                                <SelectItem value="3">3</SelectItem>
                                                                <SelectItem value="4">4</SelectItem>
                                                                <SelectItem value="0">0</SelectItem>
                                                                <SelectItem value="NA">NA / Ignore</SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="flex flex-wrap gap-2">
                                                {previewData.uniqueValues.map((v, i) => (
                                                    <Badge key={i} variant="outline" className="text-sm py-1 px-3 bg-white dark:bg-slate-900">{v}</Badge>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                );
                            })() : (
                                <div className="space-y-2">
                                    <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Sample Entries:</div>
                                    <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded-lg space-y-2 text-sm max-h-[300px] overflow-y-auto">
                                        {previewData.samples.map((val, i) => (
                                            <div key={i} className="border-b border-slate-200 dark:border-slate-700 pb-2 last:border-0 text-slate-700 dark:text-slate-300">{val}</div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : null}
                </DialogContent>
            </Dialog>
            {/* Floating Save Bar for Column Studio */}
            {
                dirtyColumns.length > 0 && (
                    <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-10 shadow-2xl border border-amber-300 dark:border-amber-800 rounded-full bg-amber-100 dark:bg-amber-950/90 backdrop-blur-md px-6 py-4 flex items-center gap-6">
                        <div className="flex items-center gap-2">
                            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-500 shrink-0" />
                            <div className="flex flex-col">
                                <span className="font-bold text-amber-900 dark:text-amber-400 leading-tight">{dirtyColumns.length} unsaved change{dirtyColumns.length > 1 ? 's' : ''}</span>
                                <span className="text-xs text-amber-700 dark:text-amber-500 font-medium">Please save mapping updates</span>
                            </div>
                        </div>
                        <Button onClick={() => setShowConfirmSave(true)} disabled={savingCols} size="lg" className="bg-amber-600 hover:bg-amber-700 text-white rounded-full px-8 shadow-sm gap-2">
                            {savingCols ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                            Review & Save
                        </Button>
                    </div>
                )
            }

            {/* Confirm Save Dialog */}
            <Dialog open={showConfirmSave} onOpenChange={setShowConfirmSave}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Save Column Changes?</DialogTitle>
                        <DialogDescription>
                            You are about to save <b>{dirtyColumns.length}</b> column mapping change{dirtyColumns.length > 1 ? 's' : ''}.
                            <br /><br />
                            <span className="text-amber-600 dark:text-amber-400 font-medium space-x-1">
                                <AlertTriangle className="w-4 h-4 inline" />
                                <span>Warning: modifying a column's unit or data type will forcefully delete any existing AI analysis segments for those specific columns.</span>
                            </span>
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex justify-end gap-3 mt-4">
                        <Button variant="outline" onClick={() => setShowConfirmSave(false)} disabled={savingCols}>Cancel</Button>
                        <Button
                            onClick={async () => {
                                await handleSaveColumns();
                                setShowConfirmSave(false);
                            }}
                            disabled={savingCols}
                            className="bg-amber-600 hover:bg-amber-700 text-white gap-2"
                        >
                            {savingCols ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                            Yes, Save Changes
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </PageShell >
    );
}
