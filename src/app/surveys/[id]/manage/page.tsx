"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { PageShell, PageHeader } from "@/components/layout/PageShell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { toast } from "sonner";
import { OrganizationUnit, FacultyEnrollment } from "@/types";
import {
    Save, Loader2, ArrowLeftRight, AlertTriangle, GraduationCap,
    FileText, Calendar, Info, Users, Columns3, Plus, Trash2
} from "lucide-react";

// --- Types ---
interface ColumnMapping {
    source_column: string;
    target_unit_id: number;
    unit_name: string;
    row_count: number;
    is_quantitative: boolean;
    has_segments: number; // count of feedback_segments for this column
}

interface EnrollmentEntry {
    id?: number;
    unit_id: number;
    unit_name: string;
    student_count: number;
    isNew?: boolean;
}

export default function SurveyManagePage() {
    const params = useParams();
    const surveyId = params.id as string;

    // Survey metadata
    const [title, setTitle] = useState("");
    const [year, setYear] = useState<number | "">("");
    const [description, setDescription] = useState("");
    const [savingMeta, setSavingMeta] = useState(false);

    // Column mappings
    const [columns, setColumns] = useState<ColumnMapping[]>([]);
    const [units, setUnits] = useState<OrganizationUnit[]>([]);
    const [loadingCols, setLoadingCols] = useState(true);

    // Reassignment state
    const [reassignCol, setReassignCol] = useState<string | null>(null);
    const [reassignNewUnit, setReassignNewUnit] = useState<string>("");
    const [reassigning, setReassigning] = useState(false);

    // Enrollment
    const [enrollments, setEnrollments] = useState<EnrollmentEntry[]>([]);
    const [loadingEnroll, setLoadingEnroll] = useState(true);
    const [savingEnroll, setSavingEnroll] = useState(false);

    const [loading, setLoading] = useState(true);

    // --- Load Survey Metadata ---
    useEffect(() => {
        const load = async () => {
            setLoading(true);
            const { data } = await supabase
                .from('surveys')
                .select('title, year, description')
                .eq('id', surveyId)
                .single();

            if (data) {
                setTitle(data.title || "");
                setYear(data.year || "");
                setDescription(data.description || "");
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

        // 2. Use inner join to directly scope to this survey's respondents (no ID list needed)
        // Fetch ALL raw inputs for this survey with just the fields we need for grouping
        const { data: rawInputs } = await supabase
            .from('raw_feedback_inputs')
            .select('id, source_column, target_unit_id, is_quantitative, respondents!inner(survey_id)')
            .eq('respondents.survey_id', surveyId);

        if (!rawInputs || rawInputs.length === 0) {
            setColumns([]);
            setLoadingCols(false);
            return;
        }

        // 3. Aggregate: group by source_column + target_unit_id in JS
        const groupMap = new Map<string, { source_column: string; target_unit_id: number; count: number; is_quantitative: boolean; inputIds: number[] }>();
        rawInputs.forEach(row => {
            const key = `${row.source_column}__${row.target_unit_id}`;
            const existing = groupMap.get(key);
            if (existing) {
                existing.count++;
                existing.inputIds.push(row.id);
            } else {
                groupMap.set(key, {
                    source_column: row.source_column,
                    target_unit_id: row.target_unit_id,
                    count: 1,
                    is_quantitative: row.is_quantitative,
                    inputIds: [row.id],
                });
            }
        });

        // 4. Single batch: fetch ALL segment raw_input_ids for this survey at once
        const allInputIds = rawInputs.map(r => r.id);
        const segmentCounts = new Map<string, number>();

        // Fetch in chunks to avoid URL size limits
        const CHUNK = 1000;
        const allSegInputIds = new Set<number>();
        for (let i = 0; i < allInputIds.length; i += CHUNK) {
            const chunk = allInputIds.slice(i, i + CHUNK);
            const { data: segs } = await supabase
                .from('feedback_segments')
                .select('raw_input_id')
                .in('raw_input_id', chunk);
            segs?.forEach(s => allSegInputIds.add(s.raw_input_id));
        }

        // 5. Count segments per column group in JS
        for (const [key, group] of groupMap) {
            const segCount = group.inputIds.filter(id => allSegInputIds.has(id)).length;
            segmentCounts.set(key, segCount);
        }

        const mappings: ColumnMapping[] = Array.from(groupMap.entries()).map(([key, g]) => ({
            source_column: g.source_column,
            target_unit_id: g.target_unit_id,
            unit_name: unitMap.get(g.target_unit_id) || "Unknown",
            row_count: g.count,
            is_quantitative: g.is_quantitative,
            has_segments: segmentCounts.get(key) || 0,
        }));

        // Sort: text columns first, then by unit name
        mappings.sort((a, b) => {
            if (a.is_quantitative !== b.is_quantitative) return a.is_quantitative ? 1 : -1;
            return a.unit_name.localeCompare(b.unit_name);
        });

        setColumns(mappings);
        setLoadingCols(false);
    }, [surveyId]);

    // --- Load Enrollment Data ---
    const loadEnrollments = useCallback(async () => {
        setLoadingEnroll(true);

        const { data: unitsData } = await supabase
            .from('organization_units')
            .select('id, name')
            .order('name');

        const { data: existingEnroll } = await supabase
            .from('faculty_enrollment')
            .select('*')
            .eq('survey_id', parseInt(surveyId));

        const enrollMap = new Map((existingEnroll || []).map(e => [e.unit_id, e]));

        const entries: EnrollmentEntry[] = (unitsData || []).map(u => {
            const existing = enrollMap.get(u.id);
            return {
                id: existing?.id,
                unit_id: u.id,
                unit_name: u.name,
                student_count: existing?.student_count || 0,
                isNew: !existing,
            };
        });

        setEnrollments(entries);
        setLoadingEnroll(false);
    }, [surveyId]);

    useEffect(() => {
        loadColumnMappings();
        loadEnrollments();
    }, [loadColumnMappings, loadEnrollments]);

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

    // --- Reassign Column ---
    const handleReassign = async () => {
        if (!reassignCol || !reassignNewUnit) return;

        const col = columns.find(c => c.source_column === reassignCol);
        if (!col) return;

        setReassigning(true);
        try {
            // 1. Get respondent IDs for this survey
            const { data: respondents } = await supabase
                .from('respondents')
                .select('id')
                .eq('survey_id', surveyId);
            const respondentIds = respondents?.map(r => r.id) || [];

            // 2. Get all raw_input IDs for this column in this survey
            const { data: inputIds } = await supabase
                .from('raw_feedback_inputs')
                .select('id')
                .eq('source_column', reassignCol)
                .in('respondent_id', respondentIds.slice(0, 1000));

            const ids = inputIds?.map(i => i.id) || [];

            if (ids.length === 0) {
                toast.error("No data found for this column.");
                setReassigning(false);
                return;
            }

            // 3. Delete stale feedback_segments for these inputs
            if (col.has_segments > 0) {
                const { error: delError } = await supabase
                    .from('feedback_segments')
                    .delete()
                    .in('raw_input_id', ids);

                if (delError) {
                    toast.error("Failed to clear old analysis: " + delError.message);
                    setReassigning(false);
                    return;
                }
            }

            // 4. Update target_unit_id for all rows in this column
            const { error: updateError } = await supabase
                .from('raw_feedback_inputs')
                .update({ target_unit_id: parseInt(reassignNewUnit) })
                .in('id', ids);

            if (updateError) {
                toast.error("Failed to reassign: " + updateError.message);
            } else {
                const newUnitName = units.find(u => u.id === parseInt(reassignNewUnit))?.name || "New Unit";
                toast.success(`"${reassignCol}" reassigned to ${newUnitName}. ${col.has_segments > 0 ? "Old analysis deleted." : ""}`);
                setReassignCol(null);
                setReassignNewUnit("");
                loadColumnMappings();
            }
        } catch (e: any) {
            toast.error("Reassignment failed: " + e.message);
        } finally {
            setReassigning(false);
        }
    };

    // --- Save Enrollment ---
    const handleSaveEnrollment = async () => {
        setSavingEnroll(true);
        try {
            const toUpsert = enrollments
                .filter(e => e.student_count > 0)
                .map(e => ({
                    ...(e.id ? { id: e.id } : {}),
                    unit_id: e.unit_id,
                    survey_id: parseInt(surveyId),
                    student_count: e.student_count,
                }));

            // Delete any existing entries for this survey first, then insert
            await supabase
                .from('faculty_enrollment')
                .delete()
                .eq('survey_id', parseInt(surveyId));

            if (toUpsert.length > 0) {
                const { error } = await supabase
                    .from('faculty_enrollment')
                    .insert(toUpsert.map(e => ({
                        unit_id: e.unit_id,
                        survey_id: e.survey_id,
                        student_count: e.student_count,
                    })));

                if (error) throw error;
            }

            toast.success("Enrollment data saved!");
            loadEnrollments();
        } catch (e: any) {
            toast.error("Failed to save enrollment: " + e.message);
        } finally {
            setSavingEnroll(false);
        }
    };

    // --- Respondent count for response rate display ---
    const [respondentCounts, setRespondentCounts] = useState<Map<number, number>>(new Map());
    useEffect(() => {
        const fetchCounts = async () => {
            const { data } = await supabase
                .from('respondents')
                .select('faculty')
                .eq('survey_id', surveyId);
            if (!data) return;

            // Group by... but we don't have a direct faculty -> unit mapping
            // For now, just show total respondents
        };
        fetchCounts();
    }, [surveyId]);

    const staleCol = columns.find(c => c.source_column === reassignCol);

    return (
        <PageShell>
            <PageHeader
                title="Manage Survey"
                description={title || "Loading..."}
                backHref={`/surveys/${surveyId}`}
                backLabel="Back to Survey"
            />

            <div className="max-w-5xl mx-auto px-8 py-10 space-y-8">

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

                {/* SECTION 2: Column-to-Unit Mappings */}
                <Card className="border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                    <div className="h-1 bg-gradient-to-r from-purple-500 to-pink-500" />
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-lg">
                            <Columns3 className="w-5 h-5 text-purple-600" /> Column-to-Unit Assignments
                        </CardTitle>
                        <CardDescription>View how each CSV column was mapped during import. You can reassign columns to different units.</CardDescription>
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
                            <div className="space-y-2">
                                {columns.map((col) => (
                                    <div
                                        key={`${col.source_column}__${col.target_unit_id}`}
                                        className="flex items-center justify-between gap-4 p-4 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800 hover:border-slate-200 dark:hover:border-slate-700 transition-colors"
                                    >
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="font-semibold text-slate-800 dark:text-slate-200 truncate text-sm">
                                                    {col.source_column}
                                                </span>
                                                <Badge variant="secondary" className="text-xs shrink-0">
                                                    {col.is_quantitative ? "Score" : "Text"}
                                                </Badge>
                                                {col.has_segments > 0 && (
                                                    <Badge variant="outline" className="text-xs text-green-600 border-green-200 bg-green-50 shrink-0">
                                                        {col.has_segments} segments
                                                    </Badge>
                                                )}
                                            </div>
                                            <div className="text-xs text-slate-500 mt-1">
                                                {col.row_count.toLocaleString()} rows
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-3 shrink-0">
                                            <Badge className="bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950 dark:text-indigo-300 dark:border-indigo-800">
                                                {col.unit_name}
                                            </Badge>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="text-slate-400 hover:text-purple-600 h-8 px-2"
                                                onClick={() => {
                                                    setReassignCol(col.source_column);
                                                    setReassignNewUnit("");
                                                }}
                                            >
                                                <ArrowLeftRight className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* SECTION 3: Faculty Enrollment */}
                <Card className="border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                    <div className="h-1 bg-gradient-to-r from-emerald-500 to-teal-500" />
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-lg">
                            <GraduationCap className="w-5 h-5 text-emerald-600" /> Faculty Enrollment Data
                        </CardTitle>
                        <CardDescription>
                            Enter the number of students enrolled in each faculty for this survey period. Used to calculate response rates.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {loadingEnroll ? (
                            <div className="space-y-3">
                                {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div className="grid gap-3">
                                    {enrollments.map((entry) => (
                                        <div
                                            key={entry.unit_id}
                                            className="flex items-center gap-4 p-3 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800"
                                        >
                                            <div className="flex-1 min-w-0">
                                                <span className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate block">
                                                    {entry.unit_name}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2 shrink-0">
                                                <Users className="w-4 h-4 text-slate-400" />
                                                <Input
                                                    type="number"
                                                    value={entry.student_count || ""}
                                                    onChange={(e) => {
                                                        const val = parseInt(e.target.value) || 0;
                                                        setEnrollments(prev =>
                                                            prev.map(en =>
                                                                en.unit_id === entry.unit_id
                                                                    ? { ...en, student_count: val }
                                                                    : en
                                                            )
                                                        );
                                                    }}
                                                    placeholder="0"
                                                    min={0}
                                                    className="w-28 bg-white dark:bg-slate-900 text-right"
                                                />
                                                <span className="text-xs text-slate-400 w-16">students</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <div className="flex justify-end">
                                    <Button onClick={handleSaveEnrollment} disabled={savingEnroll} className="bg-emerald-600 hover:bg-emerald-700 gap-2">
                                        {savingEnroll ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                        Save Enrollment Data
                                    </Button>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>

            </div>

            {/* Reassignment Confirmation Dialog */}
            <ConfirmDialog
                open={reassignCol !== null}
                onOpenChange={(open) => !open && setReassignCol(null)}
                title={`Reassign "${reassignCol}" to a different unit`}
                description={
                    <div className="space-y-4 mt-2">
                        {staleCol && staleCol.has_segments > 0 && (
                            <div className="flex items-start gap-2 text-amber-700 bg-amber-50 p-3 rounded-md border border-amber-200 text-sm">
                                <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                                <span>
                                    <strong>Warning:</strong> This column has {staleCol.has_segments.toLocaleString()} existing analysis segments.
                                    They will be <strong>permanently deleted</strong> so you can re-run analysis on the new unit.
                                </span>
                            </div>
                        )}
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-700">
                                New Unit:
                            </label>
                            <Select value={reassignNewUnit} onValueChange={setReassignNewUnit}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select target unit..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {units.map(u => (
                                        <SelectItem key={u.id} value={u.id.toString()}>
                                            {u.name} {u.short_name ? `(${u.short_name})` : ""}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                }
                confirmLabel={reassigning ? "Reassigning..." : "Reassign Column"}
                variant="default"
                onConfirm={handleReassign}
            />
        </PageShell>
    );
}
