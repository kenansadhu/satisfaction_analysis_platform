"use client";

import { useEffect, useState, useCallback, useMemo, memo } from "react";
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
    Eye, Search, ChevronDown, ChevronRight, CheckCircle2, MapPin,
    Calculator, Layers, X
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ScoreAudit } from "@/components/analysis/ScoreAudit";

// --- Types ---
type DataType = "TEXT" | "SCORE" | "CATEGORY" | "IGNORE";
type ScoreRule = "LIKERT" | "BOOLEAN" | "NUMBER" | "TEXT_SCALE" | "CUSTOM_MAPPING" | "NPS_0_10";

/**
 * Resolve what numerical_score a raw cell value produces under a given rule.
 * Priority: explicit customMapping → rule heuristic → null.
 * Mirrors the import flow's priority so the manage page and import flow stay in sync.
 */
function resolveScore(rawValue: string, rule: ScoreRule, customMapping?: Record<string, number | null>): number | null {
    if (customMapping && rawValue in customMapping) {
        return customMapping[rawValue];
    }
    const lower = rawValue.toLowerCase();
    switch (rule) {
        case "LIKERT": {
            const match = rawValue.match(/^(\d+)/);
            return match ? parseInt(match[1]) : null;
        }
        case "BOOLEAN":
            return (lower === "ya" || lower === "yes" || lower === "true") ? 1 : 0;
        case "NUMBER": {
            const n = parseFloat(rawValue);
            return isNaN(n) ? null : n;
        }
        case "TEXT_SCALE":
            if (lower.includes("tidak pernah") || lower.includes("sangat tidak") || lower.includes("never")) return 1;
            if (lower.includes("jarang") || lower.includes("tidak setuju") || lower.includes("kurang") || lower.includes("rarely")) return 2;
            if (lower.includes("sering") || lower.includes("setuju") || lower.includes("puas") || lower.includes("often") || lower.includes("kadang") || lower.includes("netral") || lower.includes("cukup") || lower.includes("ragu")) return 3;
            if (lower.includes("selalu") || lower.includes("sangat") || lower.includes("lebih dari") || lower.includes("always")) return 4;
            return null;
        case "NPS_0_10": {
            const n = parseFloat(rawValue);
            return (!isNaN(n) && n >= 0 && n <= 10) ? Math.round(n) : null;
        }
        case "CUSTOM_MAPPING":
            // No fallback — only the explicit map counts.
            return null;
    }
}

interface ColumnMapping {
    source_column: string;
    target_unit_id: number;
    unit_name: string;
    row_count: number;
    is_quantitative: boolean;
    requires_analysis: boolean;
    has_segments: number;
    // Subgroup membership (null = column is its own implicit single-column subgroup,
    // i.e. behaves like today's flat per-respondent macro).
    subgroup_name?: string | null;
    display_group?: string | null;
    // Editable fields (tracked for dirty detection)
    newUnitId?: number;
    newType?: DataType;
    newRule?: ScoreRule;
    newSubgroupName?: string | null;
    newDisplayGroup?: string | null;
    ruleChanged?: boolean;
    customMapping?: Record<string, number | null>;
    // The resolved type at load time (source of truth for dirty detection)
    _initialType?: DataType;
}

interface ProdiEnrollmentEntry {
    id?: number;
    campus: string;
    study_program: string;
    faculty: string;
    student_count: number;
    actual_respondents: number;
}

// ── Memoised column row ──────────────────────────────────────────────────────
// Extracted so React.memo can skip re-rendering rows whose props haven't changed.
// Without this every keystroke / dropdown change re-renders ALL 50+ rows.
interface ColumnRowProps {
    col: ColumnMapping;
    units: OrganizationUnit[];
    displayGroups: string[];
    isExpanded: boolean;
    uniqueVals: string[];
    loadingUniqueValues: boolean;
    onToggleExpand: (col: string) => void;
    onUpdateColumn: (col: string, field: keyof ColumnMapping, value: any) => void;
    onUpdateCustomMapping: (col: string, valueStr: string, score: number | null) => void;
    onPreview: (col: string) => void;
}

const ColumnRow = memo(function ColumnRow({
    col, units, displayGroups, isExpanded, uniqueVals,
    loadingUniqueValues, onToggleExpand, onUpdateColumn, onUpdateCustomMapping, onPreview,
}: ColumnRowProps) {
    const isDirty = col.newUnitId !== col.target_unit_id || col.newType !== col._initialType || col.ruleChanged;
    const currentType = col.newType || col._initialType || "CATEGORY";
    const hasUniqueVals = uniqueVals.length > 0;

    return (
        <div
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
                onClick={() => onToggleExpand(col.source_column)}
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
                <div className="flex flex-wrap items-start gap-3 pl-7" onClick={e => e.stopPropagation()}>
                    <div className="flex-1 min-w-[160px]">
                        <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1 block">Unit</label>
                        <Select
                            value={(col.newUnitId ?? col.target_unit_id).toString()}
                            onValueChange={val => onUpdateColumn(col.source_column, 'newUnitId', parseInt(val))}
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
                            onValueChange={val => onUpdateColumn(col.source_column, 'newType', val)}
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
                                onValueChange={val => onUpdateColumn(col.source_column, 'newRule', val)}
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
                                    <SelectItem value="NPS_0_10">NPS (0–10)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    )}
                    {currentType === "SCORE" && col.newRule !== "NPS_0_10" && (() => {
                        const targetUnit = units.find(u => u.id === (col.newUnitId ?? col.target_unit_id));
                        const subgroups = targetUnit?.score_subgroups || [];
                        if (subgroups.length === 0) return null;
                        return (
                            <div className="w-44 shrink-0">
                                <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1 block">Subgroup</label>
                                <Select
                                    value={col.newSubgroupName ?? "__INDIVIDUAL__"}
                                    onValueChange={val => onUpdateColumn(col.source_column, 'newSubgroupName', val === "__INDIVIDUAL__" ? null : val)}
                                >
                                    <SelectTrigger className="h-9 text-xs bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="__INDIVIDUAL__">(Individual)</SelectItem>
                                        {subgroups.map(sg => (
                                            <SelectItem key={sg} value={sg}>{sg}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        );
                    })()}
                    {currentType === "SCORE" && displayGroups.length > 0 && (
                        <div className="min-w-36 max-w-xs shrink-0">
                            <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1 block">Group</label>
                            <Select
                                value={col.newDisplayGroup ?? "__NONE__"}
                                onValueChange={val => onUpdateColumn(col.source_column, 'newDisplayGroup', val === "__NONE__" ? null : val)}
                            >
                                <SelectTrigger className={cn(
                                    "!h-auto min-h-9 py-1.5 !whitespace-normal text-xs border-slate-200 dark:border-slate-800",
                                    "*:data-[slot=select-value]:line-clamp-none *:data-[slot=select-value]:whitespace-normal *:data-[slot=select-value]:break-words *:data-[slot=select-value]:text-left",
                                    col.newDisplayGroup ? "bg-purple-50 dark:bg-purple-950/30 text-purple-700 dark:text-purple-300" : "bg-white dark:bg-slate-900"
                                )}>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="__NONE__">No group</SelectItem>
                                    {displayGroups.map(g => (
                                        <SelectItem key={g} value={g}>{g}</SelectItem>
                                    ))}
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
                        {hasUniqueVals ? (
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                                        Unique Values ({uniqueVals.length}):
                                    </div>
                                    {currentType === "SCORE" && col.newRule !== "NPS_0_10" && (() => {
                                        const nullCount = uniqueVals.filter(v => resolveScore(v, col.newRule || "NUMBER", col.customMapping) === null).length;
                                        if (nullCount === 0) return null;
                                        return (
                                            <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md px-2 py-0.5">
                                                {nullCount} value{nullCount === 1 ? "" : "s"} → NA (excluded from score)
                                            </span>
                                        );
                                    })()}
                                </div>

                                {currentType === "SCORE" && col.newRule !== "NPS_0_10" ? (
                                    <div className="grid gap-2 border border-slate-200 dark:border-slate-800 rounded-lg p-3 bg-white dark:bg-slate-950 max-h-[400px] overflow-y-auto">
                                        {uniqueVals.map((v, i) => {
                                            const resolved = resolveScore(v, col.newRule || "NUMBER", col.customMapping);
                                            const isOverride = !!(col.customMapping && v in col.customMapping);
                                            const selectValue = resolved === null ? "NA" : resolved.toString();
                                            return (
                                                <div key={i} className="flex items-center justify-between gap-4">
                                                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300 break-all flex items-center gap-2">
                                                        {v || "(empty)"}
                                                        {isOverride && (
                                                            <span className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30 px-1.5 py-0.5 rounded">override</span>
                                                        )}
                                                    </span>
                                                    <Select
                                                        value={selectValue}
                                                        onValueChange={val => onUpdateCustomMapping(col.source_column, v, val === "NA" ? null : parseInt(val))}
                                                    >
                                                        <SelectTrigger className={cn(
                                                            "w-[120px] h-8 shrink-0",
                                                            resolved === null ? "bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800" : "bg-white dark:bg-slate-950"
                                                        )}>
                                                            <SelectValue placeholder="Map to..." />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="1">1</SelectItem>
                                                            <SelectItem value="2">2</SelectItem>
                                                            <SelectItem value="3">3</SelectItem>
                                                            <SelectItem value="4">4</SelectItem>
                                                            <SelectItem value="0">0</SelectItem>
                                                            <SelectItem value="NA">NA (exclude)</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
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
                                    onClick={() => onPreview(col.source_column)}
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
});

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
    const [savingCols, setSavingCols] = useState(false);
    const [showConfirmSave, setShowConfirmSave] = useState(false);
    const [filterText, setFilterText] = useState("");
    const [displayGroups, setDisplayGroups] = useState<string[]>([]);
    const [newGroupName, setNewGroupName] = useState("");

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
    const [newProdiCampus, setNewProdiCampus] = useState('');
    const [showAddProdi, setShowAddProdi] = useState(false);

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

        // Run three fast queries in parallel: units, column cache, and aggregated column stats.
        // The column-stats API does all the heavy raw_feedback_inputs aggregation server-side
        // (single round-trip instead of 50+ browser→DB queries).
        const [unitsRes, colCacheRes, statsRes] = await Promise.all([
            supabase
                .from('organization_units')
                .select('id, name, short_name, score_subgroups')
                .order('name'),
            supabase
                .from('survey_column_cache')
                .select('source_column, column_type, subgroup_name, display_group')
                .eq('survey_id', parseInt(surveyId)),
            fetch(`/api/surveys/${surveyId}/column-stats`).then(r => r.json()),
        ]);

        setUnits(unitsRes.data || []);
        const unitMap = new Map((unitsRes.data || []).map((u: any) => [u.id, u.name]));

        const colTypeCache: any[] = colCacheRes.data || [];
        const colTypeCacheMap = new Map<string, DataType>(
            colTypeCache.filter(r => r.column_type).map(r => [r.source_column, r.column_type as DataType])
        );
        const colSubgroupCacheMap = new Map<string, string | null>(
            colTypeCache.map(r => [r.source_column, r.subgroup_name ?? null])
        );
        const colDisplayGroupCacheMap = new Map<string, string | null>(
            colTypeCache.map(r => [r.source_column, r.display_group ?? null])
        );

        const rawCols: any[] = statsRes.columns ?? [];
        if (rawCols.length === 0) {
            setColumns([]);
            setLoadingCols(false);
            return;
        }

        const mappings: ColumnMapping[] = rawCols.map((g: any) => {
            const key = g.source_column;
            let currentType: DataType = colTypeCacheMap.get(key) ?? (
                g.is_quantitative ? "SCORE" : g.requires_analysis ? "TEXT" : "CATEGORY"
            );
            const subgroupName = colSubgroupCacheMap.get(key) ?? null;
            const displayGroup = colDisplayGroupCacheMap.get(key) ?? null;
            return {
                source_column: key,
                target_unit_id: g.target_unit_id,
                unit_name: unitMap.get(g.target_unit_id) || "Unknown",
                row_count: g.row_count,
                is_quantitative: g.is_quantitative,
                requires_analysis: g.requires_analysis,
                has_segments: g.has_segments ?? 0,
                subgroup_name: subgroupName,
                display_group: displayGroup,
                newUnitId: g.target_unit_id,
                newType: currentType,
                _initialType: currentType,
                newRule: g.score_rule || (currentType === "SCORE" ? "NUMBER" : undefined),
                newSubgroupName: subgroupName,
                newDisplayGroup: displayGroup,
                customMapping: g.custom_mapping || {},
                _minId: g.min_id,
            };
        });

        const existingGroups = [...new Set(mappings.map(m => m.display_group).filter(Boolean))] as string[];
        setDisplayGroups(existingGroups);

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

        // Get study programs + faculties + location (campus) from respondents (paginated)
        const respondents: any[] = [];
        let from = 0;
        const PAGE = 1000;
        while (true) {
            const { data: batch } = await supabase
                .from('respondents')
                .select('study_program, faculty, location')
                .eq('survey_id', parseInt(surveyId))
                .range(from, from + PAGE - 1);
            if (!batch || batch.length === 0) break;
            respondents.push(...batch);
            if (batch.length < PAGE) break;
            from += PAGE;
        }

        // Composite key: "campus|||study_program" to distinguish same-named programs at different campuses
        const prodiCounts = new Map<string, { count: number; faculty: string; campus: string; prodi: string }>();
        (respondents || []).forEach((r: any) => {
            const prodi = r.study_program || 'Unknown';
            const fac = r.faculty || 'Unknown';
            const campus = r.location || 'Unknown';
            const key = `${campus}|||${prodi}`;
            if (!prodiCounts.has(key)) prodiCounts.set(key, { count: 0, faculty: fac, campus, prodi });
            prodiCounts.get(key)!.count++;
        });

        // Get existing prodi enrollment data
        const { data: existing } = await supabase
            .from('prodi_enrollment')
            .select('*')
            .eq('survey_id', parseInt(surveyId));

        const existingMap = new Map<string, any>((existing || []).map(e => [
            `${e.location || 'Unknown'}|||${e.study_program}`, e
        ]));

        // Merge: respondent data + saved enrollment + any saved entries not in respondent data
        const seenKeys = new Set<string>();
        const entries: ProdiEnrollmentEntry[] = [];

        for (const [key, info] of prodiCounts.entries()) {
            if (info.prodi === 'Unknown') continue;
            seenKeys.add(key);
            const ex = existingMap.get(key);
            entries.push({
                id: ex?.id,
                campus: info.campus,
                study_program: info.prodi,
                faculty: ex?.faculty || info.faculty,
                student_count: ex?.student_count || 0,
                actual_respondents: info.count,
            });
        }

        // Also add manually saved programs with 0 respondents
        for (const [key, ex] of existingMap.entries()) {
            if (!seenKeys.has(key)) {
                entries.push({
                    id: ex.id,
                    campus: ex.location || 'Unknown',
                    study_program: ex.study_program,
                    faculty: ex.faculty || 'Unknown',
                    student_count: ex.student_count,
                    actual_respondents: 0,
                });
            }
        }

        // Sort by campus, then faculty, then program name
        entries.sort((a, b) =>
            a.campus.localeCompare(b.campus) ||
            a.faculty.localeCompare(b.faculty) ||
            a.study_program.localeCompare(b.study_program)
        );

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
                    location: e.campus,
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
        if (!newProdiName.trim() || !newProdiFaculty.trim() || !newProdiCampus.trim()) return;
        if (prodiEnrollments.some(e =>
            e.study_program === newProdiName.trim() && e.campus === newProdiCampus.trim()
        )) {
            toast.error('This study program already exists for that campus.');
            return;
        }
        setProdiEnrollments(prev => [...prev, {
            campus: newProdiCampus.trim(),
            study_program: newProdiName.trim(),
            faculty: newProdiFaculty.trim(),
            student_count: 0,
            actual_respondents: 0,
        }]);
        setNewProdiName('');
        setNewProdiFaculty('');
        setNewProdiCampus('');
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
    const toggleExpand = useCallback((colName: string) => {
        setExpandedCols(prev => {
            const next = new Set(prev);
            if (next.has(colName)) next.delete(colName);
            else next.add(colName);
            return next;
        });
    }, []);

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

    // --- Inline edit helpers ---
    const updateColumn = useCallback((sourceColumn: string, field: keyof ColumnMapping, value: any) => {
        setColumns(prev => prev.map(c => {
            if (c.source_column === sourceColumn) {
                const isRuleChange = field === 'newRule';
                return { ...c, [field]: value, ...(isRuleChange ? { ruleChanged: true } : {}) };
            }
            return c;
        }));
    }, []);

    const handleUpdateCustomMapping = useCallback((sourceColumn: string, valueStr: string, mappedScore: number | null) => {
        setColumns(prev => prev.map(c => {
            if (c.source_column === sourceColumn) {
                const currentMap = c.customMapping || {};
                const newMap = { ...currentMap, [valueStr]: mappedScore };
                return { ...c, customMapping: newMap, ruleChanged: true };
            }
            return c;
        }));
    }, []);

    // Detect which columns have unsaved changes
    const dirtyColumns = useMemo(() => {
        return columns.filter(c => {
            const subgroupChanged = (c.newSubgroupName ?? null) !== (c.subgroup_name ?? null);
            const displayGroupChanged = (c.newDisplayGroup ?? null) !== (c.display_group ?? null);
            return c.newUnitId !== c.target_unit_id || c.newType !== c._initialType || c.ruleChanged || subgroupChanged || displayGroupChanged;
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
                // Skip raw-input work for columns whose ONLY change is subgroup —
                // subgroup lives in survey_column_cache, not raw_feedback_inputs.
                // The colTypeCache upsert later in this function will handle it.
                const subgroupOnlyChange =
                    col.newUnitId === col.target_unit_id &&
                    col.newType === col._initialType &&
                    !col.ruleChanged;
                if (subgroupOnlyChange) continue;

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
                    // Persist per-value overrides for any score rule (matches the import flow),
                    // so the manage page can read them back next visit.
                    custom_mapping: isQuant && col.customMapping && Object.keys(col.customMapping).length > 0
                        ? col.customMapping
                        : null,
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
                    // Need to Recalculate Score since the rule mapping changed.
                    // customMapping takes priority over the rule heuristic — matches the import flow,
                    // so any per-value overrides set on the manage page are preserved.
                    const scoreMapping = new Map<number | null, number[]>();
                    const rule = col.newRule || "NUMBER";
                    for (const input of inputsToUpdate) {
                        const rawValue = String(input.raw_text || "");
                        const score = resolveScore(rawValue, rule, col.customMapping);

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

            // Persist explicit column types + subgroup names so they survive analysis
            // flipping requires_analysis. survey_column_cache is the per-survey-per-column
            // source of truth read by the cache rebuild and the Manage UI.
            const colTypeRows = dirtyColumns.map(col => ({
                survey_id: parseInt(surveyId),
                source_column: col.source_column,
                column_type: col.newType || 'CATEGORY',
                subgroup_name: col.newSubgroupName ?? null,
                display_group: col.newDisplayGroup ?? null,
            }));
            for (let i = 0; i < colTypeRows.length; i += 50) {
                await supabase.from('survey_column_cache')
                    .upsert(colTypeRows.slice(i, i + 50), { onConflict: 'survey_id,source_column' });
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
    const handlePreview = useCallback(async (sourceColumn: string) => {
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
    }, [surveyId]);

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
                    <TabsList className="mb-8 p-0 bg-slate-200/50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-xl inline-flex h-12 items-center justify-center overflow-hidden w-full max-w-4xl grid grid-cols-4">
                        <TabsTrigger value="details" className="gap-2 h-full rounded-none data-[state=active]:bg-white dark:data-[state=active]:bg-slate-950 data-[state=active]:shadow-sm"><Info className="w-4 h-4" /> Survey Settings</TabsTrigger>
                        <TabsTrigger value="columns" className="gap-2 h-full rounded-none data-[state=active]:bg-white dark:data-[state=active]:bg-slate-950 data-[state=active]:shadow-sm"><Columns3 className="w-4 h-4" /> Column Mapping</TabsTrigger>
                        <TabsTrigger value="audit" className="gap-2 h-full rounded-none data-[state=active]:bg-white dark:data-[state=active]:bg-slate-950 data-[state=active]:shadow-sm"><Calculator className="w-4 h-4" /> Score Audit</TabsTrigger>
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
                                        {/* Column Groups panel */}
                                        <div className="border border-slate-200 dark:border-slate-700 rounded-xl p-4 space-y-3 bg-slate-50 dark:bg-slate-900/50">
                                            <div className="flex items-center gap-2">
                                                <Layers className="w-4 h-4 text-purple-500" />
                                                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Column Groups</h3>
                                                {displayGroups.length > 0 && (
                                                    <Badge variant="outline" className="text-[10px] text-purple-600 border-purple-200 bg-purple-50 dark:bg-purple-950/30 dark:border-purple-800">{displayGroups.length} group{displayGroups.length !== 1 ? "s" : ""}</Badge>
                                                )}
                                            </div>
                                            <p className="text-xs text-slate-400">Create named groups to combine related binary (Yes/No) columns into a single chart.</p>
                                            {displayGroups.length > 0 && (
                                                <div className="flex flex-wrap gap-2">
                                                    {displayGroups.map(g => (
                                                        <div key={g} className="flex items-center gap-1 px-2.5 py-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-300">
                                                            <Layers className="w-3 h-3 text-purple-400 shrink-0" />
                                                            {g}
                                                            <button
                                                                onClick={() => {
                                                                    setDisplayGroups(prev => prev.filter(x => x !== g));
                                                                    setColumns(prev => prev.map(c => c.newDisplayGroup === g ? { ...c, newDisplayGroup: null } : c));
                                                                }}
                                                                className="ml-1 text-slate-400 hover:text-red-500 transition-colors"
                                                            >
                                                                <X className="w-3 h-3" />
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                            <div className="flex gap-2">
                                                <Input
                                                    placeholder="New group name (e.g. M-Flex Learning Activities)"
                                                    value={newGroupName}
                                                    onChange={e => setNewGroupName(e.target.value)}
                                                    onKeyDown={e => {
                                                        if (e.key === "Enter") {
                                                            const name = newGroupName.trim();
                                                            if (name && !displayGroups.includes(name)) {
                                                                setDisplayGroups(prev => [...prev, name]);
                                                                setNewGroupName("");
                                                            }
                                                        }
                                                    }}
                                                    className="h-8 text-sm bg-white dark:bg-slate-900"
                                                />
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    className="h-8 gap-1.5 shrink-0"
                                                    disabled={!newGroupName.trim() || displayGroups.includes(newGroupName.trim())}
                                                    onClick={() => {
                                                        const name = newGroupName.trim();
                                                        if (name && !displayGroups.includes(name)) {
                                                            setDisplayGroups(prev => [...prev, name]);
                                                            setNewGroupName("");
                                                        }
                                                    }}
                                                >
                                                    <Plus className="w-3.5 h-3.5" /> Add Group
                                                </Button>
                                            </div>
                                        </div>

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
                                            {filteredColumns.map(col => (
                                                <ColumnRow
                                                    key={col.source_column}
                                                    col={col}
                                                    units={units}
                                                    displayGroups={displayGroups}
                                                    isExpanded={expandedCols.has(col.source_column)}
                                                    uniqueVals={colUniqueValues.get(col.source_column) || []}
                                                    loadingUniqueValues={loadingUniqueValues}
                                                    onToggleExpand={toggleExpand}
                                                    onUpdateColumn={updateColumn}
                                                    onUpdateCustomMapping={handleUpdateCustomMapping}
                                                    onPreview={handlePreview}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="audit" className="space-y-6 mt-0">
                        <ScoreAudit surveyId={surveyId} />
                    </TabsContent>

                    <TabsContent value="enrollments" className="space-y-6 max-w-5xl mx-auto">
                        {/* SECTION 3: Prodi Enrollment */}
                        {loadingProdi ? (
                            <div className="space-y-3">
                                {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-16 w-full rounded-2xl" />)}
                            </div>
                        ) : (() => {
                            // Build campus > faculty > programs hierarchy
                            const campusMap = new Map<string, Map<string, ProdiEnrollmentEntry[]>>();
                            prodiEnrollments.forEach(e => {
                                if (!campusMap.has(e.campus)) campusMap.set(e.campus, new Map());
                                const facMap = campusMap.get(e.campus)!;
                                if (!facMap.has(e.faculty)) facMap.set(e.faculty, []);
                                facMap.get(e.faculty)!.push(e);
                            });

                            const allPrograms = prodiEnrollments;
                            const totalEnrolledAll = allPrograms.reduce((s, p) => s + p.student_count, 0);
                            const totalRespAll = allPrograms.reduce((s, p) => s + p.actual_respondents, 0);
                            const overallRate = totalEnrolledAll > 0 ? ((totalRespAll / totalEnrolledAll) * 100).toFixed(1) : null;

                            return (
                                <>
                                    {/* Summary strip */}
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                        {[
                                            { label: 'Campuses', value: campusMap.size, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-950/30', border: 'border-blue-100 dark:border-blue-900' },
                                            { label: 'Study Programs', value: allPrograms.length, color: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-50 dark:bg-purple-950/30', border: 'border-purple-100 dark:border-purple-900' },
                                            { label: 'Total Enrolled', value: totalEnrolledAll > 0 ? totalEnrolledAll.toLocaleString() : '\u2014', color: 'text-slate-700 dark:text-slate-300', bg: 'bg-slate-50 dark:bg-slate-900/50', border: 'border-slate-100 dark:border-slate-800' },
                                            { label: 'Overall Rate', value: overallRate ? `${overallRate}%` : '\u2014', color: overallRate ? (parseFloat(overallRate) >= 80 ? 'text-emerald-600' : parseFloat(overallRate) >= 50 ? 'text-amber-600' : 'text-red-500') : 'text-slate-400', bg: 'bg-emerald-50 dark:bg-emerald-950/30', border: 'border-emerald-100 dark:border-emerald-900' },
                                        ].map(({ label, value, color, bg, border }) => (
                                            <div key={label} className={`${bg} ${border} border rounded-2xl p-4`}>
                                                <div className={`text-2xl font-bold ${color}`}>{value}</div>
                                                <div className="text-xs text-slate-500 mt-0.5">{label}</div>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Campus sections */}
                                    <div className="space-y-4">
                                        {Array.from(campusMap.entries()).map(([campus, faculties]) => {
                                            const campusPrograms = Array.from(faculties.values()).flat();
                                            const campusTotal = campusPrograms.reduce((s, p) => s + p.student_count, 0);
                                            const campusResp = campusPrograms.reduce((s, p) => s + p.actual_respondents, 0);
                                            const campusRate = campusTotal > 0 ? ((campusResp / campusTotal) * 100) : null;
                                            const campusRateStr = campusRate !== null ? campusRate.toFixed(1) : null;
                                            const rateColor = campusRate === null ? '' : campusRate >= 80 ? 'text-emerald-600' : campusRate >= 50 ? 'text-amber-600' : 'text-red-500';

                                            return (
                                                <Card key={campus} className="border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                                                    {/* Campus header */}
                                                    <div className="px-5 py-3.5 bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-950/30 dark:to-cyan-950/20 border-b border-blue-100 dark:border-blue-900/50 flex items-center justify-between">
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-7 h-7 rounded-lg bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center">
                                                                <MapPin className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                                                            </div>
                                                            <span className="font-bold text-blue-900 dark:text-blue-200 text-sm">{campus}</span>
                                                            <Badge variant="secondary" className="text-xs bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 border-0">
                                                                {campusPrograms.length} program{campusPrograms.length !== 1 ? 's' : ''}
                                                            </Badge>
                                                        </div>
                                                        <div className="text-right">
                                                            <div className="text-xs text-slate-500">{campusResp.toLocaleString()} / {campusTotal > 0 ? campusTotal.toLocaleString() : <span className="text-amber-500">not set</span>} enrolled</div>
                                                            {campusRateStr && <div className={`text-sm font-bold ${rateColor}`}>{campusRateStr}% response</div>}
                                                        </div>
                                                    </div>

                                                    {/* Faculty groups within campus */}
                                                    <CardContent className="p-4 space-y-4">
                                                        {Array.from(faculties.entries()).map(([faculty, programs]) => {
                                                            const facTotal = programs.reduce((s, p) => s + p.student_count, 0);
                                                            const facResp = programs.reduce((s, p) => s + p.actual_respondents, 0);
                                                            const facRateNum = facTotal > 0 ? (facResp / facTotal * 100) : null;
                                                            const facRateStr = facRateNum !== null ? facRateNum.toFixed(1) : null;
                                                            return (
                                                                <div key={faculty} className="space-y-2">
                                                                    {/* Faculty sub-header */}
                                                                    <div className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                                                                        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{faculty}</span>
                                                                        <span className="text-xs text-slate-400">
                                                                            {facResp.toLocaleString()} / {facTotal > 0 ? facTotal.toLocaleString() : '?'} enrolled
                                                                            {facRateStr && <span className="ml-1.5 font-semibold text-emerald-600">{facRateStr}%</span>}
                                                                        </span>
                                                                    </div>
                                                                    {/* Program rows */}
                                                                    <div className="space-y-1.5">
                                                                        {programs.map(entry => {
                                                                            const rateNum = entry.student_count > 0 ? (entry.actual_respondents / entry.student_count * 100) : null;
                                                                            const rateStr = rateNum !== null ? rateNum.toFixed(1) : null;
                                                                            const barColor = rateNum === null ? '' : rateNum >= 80 ? 'bg-emerald-500' : rateNum >= 50 ? 'bg-amber-500' : 'bg-red-400';
                                                                            return (
                                                                                <div key={`${entry.campus}|||${entry.study_program}`} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800 hover:border-slate-200 dark:hover:border-slate-700 transition-colors group">
                                                                                    {/* Program info */}
                                                                                    <div className="flex-1 min-w-0">
                                                                                        <div className="flex items-center gap-2 mb-1">
                                                                                            <span className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate">{entry.study_program}</span>
                                                                                            {entry.actual_respondents === 0 && <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 text-slate-400 border-slate-300">manual</Badge>}
                                                                                        </div>
                                                                                        <div className="flex items-center gap-3">
                                                                                            <span className="text-xs text-slate-400">{entry.actual_respondents.toLocaleString()} respondents</span>
                                                                                            {rateStr && (
                                                                                                <div className="flex items-center gap-1.5">
                                                                                                    <div className="w-16 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                                                                                                        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${Math.min(parseFloat(rateStr), 100)}%` }} />
                                                                                                    </div>
                                                                                                    <span className="text-xs font-medium text-slate-500">{rateStr}%</span>
                                                                                                </div>
                                                                                            )}
                                                                                        </div>
                                                                                    </div>
                                                                                    {/* Enrollment input */}
                                                                                    <div className="flex items-center gap-2 shrink-0">
                                                                                        <Input
                                                                                            type="number"
                                                                                            value={entry.student_count || ''}
                                                                                            onChange={(e) => {
                                                                                                const val = parseInt(e.target.value) || 0;
                                                                                                setProdiEnrollments(prev => prev.map(pe =>
                                                                                                    pe.study_program === entry.study_program && pe.campus === entry.campus
                                                                                                        ? { ...pe, student_count: val } : pe
                                                                                                ));
                                                                                            }}
                                                                                            placeholder="Enrolled"
                                                                                            min={0}
                                                                                            className="w-28 bg-white dark:bg-slate-900 text-right h-8 text-sm"
                                                                                        />
                                                                                        {entry.actual_respondents === 0 && (
                                                                                            <Button
                                                                                                variant="ghost"
                                                                                                size="sm"
                                                                                                className="h-8 w-8 p-0 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                                                                                onClick={() => setProdiEnrollments(prev => prev.filter(pe =>
                                                                                                    !(pe.study_program === entry.study_program && pe.campus === entry.campus)
                                                                                                ))}
                                                                                            >
                                                                                                <Trash2 className="w-3.5 h-3.5" />
                                                                                            </Button>
                                                                                        )}
                                                                                    </div>
                                                                                </div>
                                                                            );
                                                                        })}
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </CardContent>
                                                </Card>
                                            );
                                        })}
                                    </div>

                                    {/* Add Study Program */}
                                    {showAddProdi ? (
                                        <Card className="border-2 border-dashed border-slate-300 dark:border-slate-700 shadow-none">
                                            <CardContent className="p-4 space-y-3">
                                                <div className="text-sm font-semibold text-slate-600 dark:text-slate-400 mb-1">Add Study Program with 0% response</div>
                                                <div className="grid grid-cols-3 gap-3">
                                                    <div>
                                                        <label className="text-xs font-medium text-slate-500 mb-1.5 block">Campus (Location)</label>
                                                        <Input value={newProdiCampus} onChange={(e) => setNewProdiCampus(e.target.value)} placeholder="e.g. Kampus LV" />
                                                    </div>
                                                    <div>
                                                        <label className="text-xs font-medium text-slate-500 mb-1.5 block">Study Program</label>
                                                        <Input value={newProdiName} onChange={(e) => setNewProdiName(e.target.value)} placeholder="e.g. S1 Pendidikan Kimia" />
                                                    </div>
                                                    <div>
                                                        <label className="text-xs font-medium text-slate-500 mb-1.5 block">Faculty</label>
                                                        <Input value={newProdiFaculty} onChange={(e) => setNewProdiFaculty(e.target.value)} placeholder="e.g. Fakultas Ilmu Pendidikan" />
                                                    </div>
                                                </div>
                                                <div className="flex justify-end gap-2">
                                                    <Button variant="ghost" size="sm" onClick={() => { setShowAddProdi(false); setNewProdiName(''); setNewProdiFaculty(''); setNewProdiCampus(''); }}>Cancel</Button>
                                                    <Button size="sm" onClick={handleAddProdi} disabled={!newProdiName.trim() || !newProdiFaculty.trim() || !newProdiCampus.trim()} className="bg-emerald-600 hover:bg-emerald-700 gap-1">
                                                        <Plus className="w-3 h-3" /> Add Program
                                                    </Button>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    ) : (
                                        <Button variant="outline" className="w-full border-dashed gap-2 text-slate-400 hover:text-emerald-600 hover:border-emerald-300 h-11" onClick={() => setShowAddProdi(true)}>
                                            <Plus className="w-4 h-4" /> Add Study Program (manually \u2014 0 respondents)
                                        </Button>
                                    )}

                                    {/* Save button */}
                                    <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
                                        <p className="text-xs text-slate-400">Enrollment figures are used to calculate response rates in the executive report.</p>
                                        <Button onClick={handleSaveProdiEnrollment} disabled={savingProdi} className="bg-emerald-600 hover:bg-emerald-700 gap-2 shrink-0">
                                            {savingProdi ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                            Save Enrollment Data
                                        </Button>
                                    </div>
                                </>
                            );
                        })()}
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
