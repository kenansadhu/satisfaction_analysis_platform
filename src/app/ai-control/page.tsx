"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth, isOwner } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import { PageShell, PageHeader } from "@/components/layout/PageShell";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
    Bot, ChevronDown, ChevronUp, Save, DollarSign, Activity,
    Loader2, Download, RefreshCw, Zap, TrendingUp, AlertTriangle,
    FileCode, Cpu, CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import {
    BarChart, Bar, LineChart, Line,
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { cn } from "@/lib/utils";

// ─── Agent Registry ────────────────────────────────────────────────────────────
const AGENT_REGISTRY = [
    {
        id: "chat-analyst",
        name: "Chat Analyst",
        description: "Conversational analysis of the global dataset across all units. Generates live chart blueprints.",
        trigger: "User sends a message in the AI Data Scientist chat panel",
        sourceFile: "src/app/api/ai/chat-analyst/route.ts",
        promptSummary: `Role: SENIOR DATA SCIENTIST analyzing Student Satisfaction Survey data.

Key behaviors:
- Access to full pre-built global dataset (all units, category breakdowns, faculty summary)
- Generates chart blueprints in <charts_config> tags using exact dataset keys
- Cross-unit analysis focus — not single-unit deep dives
- Every thematic point wrapped in <box title="..."> tags
- Faculty names bold, unit names italic, column names in inline code
- Cites specific metrics; never hallucinates numbers
- Conversation history is included in context for multi-turn continuity`,
    },
    {
        id: "chat-unit",
        name: "Chat Unit",
        description: "Conversational analysis for a specific unit with qualitative segments, quantitative scores, and faculty demographic breakdowns.",
        trigger: "User sends a message in the Unit Insights chat panel",
        sourceFile: "src/app/api/ai/chat-unit/route.ts",
        promptSummary: `Role: Objective Data Intelligence Engine for a specific unit.

Key behaviors:
- Context: 200 qualitative segments (with faculty attribution), quant scores, exec report
- Every point wrapped in <box title="..."> tags
- Faculty crosstabulation: filters segments by faculty key for demographic questions
- Scale-aware: 1-4 Likert vs 0-1 Binary (percentage) clearly distinguished
- Evidence: cites verbatim quotes from the segment data
- No roleplay preambles — direct, data-first responses`,
    },
    {
        id: "generate-report",
        name: "Generate Report",
        description: "Generates a boardroom-quality JSON executive analysis report for a unit with strengths, concerns, and recommendations.",
        trigger: "User clicks 'Generate Executive Report' on a unit page",
        sourceFile: "src/app/api/ai/generate-report/route.ts",
        promptSummary: `Role: Objective Data Intelligence Engine (executive report mode).

Output: Strict JSON — executive_summary, overall_verdict, 3 strengths, 3 concerns, 3 recommendations.

Key rules:
- Utilization weighting: low reach (<30%) flagged separately from satisfaction scores
- Likert (1-4): 2.5 = average, 3.5+ = excellent
- Binary (0-1): 0.8 = 80% positivity
- Every strength/concern requires verbatim evidence from the sample
- Verdict options: Excellent | Good | Needs Improvement | Critical`,
    },
    {
        id: "generate-dashboard",
        name: "Generate Dashboard",
        description: "Generates 4 insightful chart blueprints for the executive macro dashboard by finding patterns across all units.",
        trigger: "User clicks 'Generate AI Dashboard' in the executive view",
        sourceFile: "src/app/api/ai/generate-dashboard/route.ts",
        promptSummary: `Role: Senior Data Scientist finding cross-university patterns.

Output: Exactly 4 chart blueprints (id, type, title, description, xKey, yKey/yKeys, aggregation).

Key rules:
- All keys MUST match exact keys from the dataset (no invented keys)
- SCATTER: only for correlating TWO different numeric metrics
- BAR with yKeys array: side-by-side positive vs negative comparisons
- Description must explain WHY units differ using unit_description context`,
    },
    {
        id: "map-columns",
        name: "Map Columns",
        description: "Classifies CSV column headers into data types and generates Likert score mappings. Handles Indonesian-language scales.",
        trigger: "User uploads a CSV in the Import Wizard (column mapping step)",
        sourceFile: "src/app/api/ai/map-columns/route.ts",
        promptSummary: `Role: Data Architect classifying survey columns.

Output: JSON mappings per column — type (SCORE/CATEGORY/TEXT/IGNORE), rule (LIKERT/BOOLEAN), customMapping.

Key rules:
- Logical Relative Scaling: most positive → 4, most negative → 1, fill middle
- Indonesian context: "Sangat" = extreme, "Puas/Setuju" = positive, "Cukup/Kurang" = neutral-negative
- N/A, "Tidak Relevan", blank → null (not quoted)
- Every SCORE column requires a complete customMapping`,
    },
    {
        id: "map-identity",
        name: "Map Identity",
        description: "Identifies which CSV columns contain respondent demographic data for cross-tabulation (location, faculty, major, year).",
        trigger: "User uploads a CSV in the Import Wizard (identity mapping step)",
        sourceFile: "src/app/api/ai/map-identity/route.ts",
        promptSummary: `Role: Data analyst identifying respondent identity columns.

Output: JSON with 4 groups:
- location: Campus/site name columns
- faculty: Faculty/school name columns
- major: Study program columns
- year: Entry year/batch columns

Each group is an array of matching header strings from the input.`,
    },
    {
        id: "discover-categories",
        name: "Discover Categories",
        description: "Reads a batch of student comments and evolves the unit's category taxonomy by discovering new topics.",
        trigger: "User runs 'Discover Categories' in the Unit Analysis setup",
        sourceFile: "src/app/api/ai/discover-categories/route.ts",
        promptSummary: `Role: Taxonomy Architect updating a unit's category list.

Key rules:
- Comment fits existing category → no change
- New distinct topic → add new category
- Existing category needs better name → update it
- MANDATORY CATEGORIES always preserved (never renamed/merged/removed):
  "Staff Service & Attitude", "Service & Response Speed", "Others"
- Output: complete updated category list as JSON`,
    },
    {
        id: "suggest-taxonomy",
        name: "Suggest Taxonomy",
        description: "Suggests an initial category set (CATEGORIES mode) or subcategories (SUBCATEGORIES mode) based on sample student comments.",
        trigger: "User clicks 'Suggest Categories' or 'Suggest Subcategories' in Unit setup",
        sourceFile: "src/app/api/ai/suggest-taxonomy/route.ts",
        promptSummary: `Role: Taxonomy architect for student feedback classification.

CATEGORIES mode: 8-15 main categories. Enforces globally standardized names:
- "Response Speed & Timeliness"
- "Staff Professionalism & Attitude"
- "Clarity of Information"
- "Accessibility"

SUBCATEGORIES mode: 5-10 subcategories for a given parent category.
Output: JSON suggestions array with name, description, keywords.`,
    },
    {
        id: "process-queue",
        name: "Process Queue",
        description: "Core analysis engine. Processes batches of 50 comments — segmenting by idea, classifying categories, assigning sentiment, detecting suggestions.",
        trigger: "User starts analysis for a unit (runs continuously until all comments processed)",
        sourceFile: "src/app/api/ai/process-queue/route.ts",
        promptSummary: `Role: Expert Data Analyst classifying student satisfaction comments.

Task: Segment each comment into distinct ideas, classify each segment.

Key rules:
- Split by DISTINCT IDEAS: one comment → multiple segments if multiple points
- Skip noise: "-", "ok", "no comment", "n/a", "cukup", "tidak ada"
- Sentiment: Positive (praise) | Negative (complaint) | Neutral (factual/mixed)
- Suggestion detection: is_suggestion=true for Indonesian request keywords
  (Semoga, Mohon, Sebaiknya, Agar, Tolong, Perlu, Harap)
- Cross-unit tagging: related_unit_name if comment refers to another unit`,
    },
];

// ─── Model Definitions ─────────────────────────────────────────────────────────
const GEMINI_MODELS = [
    { id: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite", description: "Fastest & cheapest — for simple classification tasks", inputRate: 0.018, outputRate: 0.072, tier: "fast" },
    { id: "gemini-2.5-flash",      label: "Gemini 2.5 Flash",      description: "Fast & balanced — recommended for most analysis",       inputRate: 0.075, outputRate: 0.30,  tier: "balanced" },
    { id: "gemini-2.5-pro",        label: "Gemini 2.5 Pro",        description: "Highest quality reasoning — complex reports & deep analysis", inputRate: 1.25, outputRate: 10.00, tier: "pro" },
];

const DEFAULT_FALLBACK = "gemini-2.5-flash";
const GLOBAL_KEY = "__global__";

// ─── Page Shell ────────────────────────────────────────────────────────────────
export default function AIControlPage() {
    const router = useRouter();
    const { role, profileLoading } = useAuth();

    useEffect(() => {
        if (!profileLoading && !isOwner(role)) router.replace("/");
    }, [role, profileLoading, router]);

    if (profileLoading) return (
        <PageShell>
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
            </div>
        </PageShell>
    );
    if (!isOwner(role)) return null;

    return (
        <PageShell>
            <PageHeader
                title={
                    <span className="flex items-center gap-2">
                        <Bot className="w-6 h-6 text-violet-500" />
                        AI Control Panel
                    </span>
                }
                description="Manage AI agents, models, prompt overrides, and monitor token usage. Owner access only."
            />
            <div className="px-8 py-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
                <Tabs defaultValue="agents">
                    <TabsList className="mb-6 bg-slate-100 dark:bg-slate-800/60 p-1 rounded-xl h-auto gap-1">
                        <TabsTrigger value="agents" className="rounded-lg gap-2 text-sm px-4 py-2 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700 data-[state=active]:shadow-sm">
                            <Bot className="w-4 h-4" /> Agents
                        </TabsTrigger>
                        <TabsTrigger value="model" className="rounded-lg gap-2 text-sm px-4 py-2 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700 data-[state=active]:shadow-sm">
                            <Cpu className="w-4 h-4" /> Model & Pricing
                        </TabsTrigger>
                        <TabsTrigger value="usage" className="rounded-lg gap-2 text-sm px-4 py-2 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700 data-[state=active]:shadow-sm">
                            <Activity className="w-4 h-4" /> Usage
                        </TabsTrigger>
                    </TabsList>
                    <TabsContent value="agents"><AgentsTab /></TabsContent>
                    <TabsContent value="model"><ModelPricingTab /></TabsContent>
                    <TabsContent value="usage"><UsageTab /></TabsContent>
                </Tabs>
            </div>
        </PageShell>
    );
}

// ─── Tab 1: Agents ─────────────────────────────────────────────────────────────
function AgentsTab() {
    const [addenda, setAddenda] = useState<Record<string, string>>({});
    const [overrides, setOverrides] = useState<Record<string, string>>({});
    const [defaultModel, setDefaultModel] = useState(DEFAULT_FALLBACK);
    const [savingId, setSavingId] = useState<string | null>(null);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const keys = [
            "default_model",
            ...AGENT_REGISTRY.flatMap(a => [`prompt_addendum_${a.id}`, `model_override_${a.id}`]),
        ];
        supabase.from("platform_settings").select("key, value").in("key", keys)
            .then(({ data }) => {
                const map: Record<string, string> = Object.fromEntries((data ?? []).map((r: any) => [r.key, r.value]));
                const add: Record<string, string> = {};
                const ovr: Record<string, string> = {};
                AGENT_REGISTRY.forEach(a => {
                    add[a.id] = map[`prompt_addendum_${a.id}`] ?? "";
                    ovr[a.id] = map[`model_override_${a.id}`] ?? GLOBAL_KEY;
                });
                setAddenda(add);
                setOverrides(ovr);
                setDefaultModel(map["default_model"] ?? DEFAULT_FALLBACK);
                setLoading(false);
            });
    }, []);

    const save = async (agentId: string) => {
        setSavingId(agentId);
        try {
            await supabase.from("platform_settings")
                .upsert({ key: `prompt_addendum_${agentId}`, value: addenda[agentId] ?? "" }, { onConflict: "key" });

            const override = overrides[agentId];
            if (!override || override === GLOBAL_KEY) {
                await supabase.from("platform_settings").delete().eq("key", `model_override_${agentId}`);
            } else {
                await supabase.from("platform_settings")
                    .upsert({ key: `model_override_${agentId}`, value: override }, { onConflict: "key" });
            }
            toast.success(`${AGENT_REGISTRY.find(a => a.id === agentId)?.name} saved`);
        } catch (e: any) {
            toast.error("Save failed: " + e.message);
        } finally {
            setSavingId(null);
        }
    };

    if (loading) return (
        <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 w-full rounded-xl" />)}
        </div>
    );

    return (
        <div className="space-y-4">
            <div className="flex items-start gap-3 p-4 bg-violet-50 dark:bg-violet-950/20 rounded-xl border border-violet-200 dark:border-violet-800/40">
                <AlertTriangle className="w-4 h-4 text-violet-500 mt-0.5 shrink-0" />
                <p className="text-sm text-violet-700 dark:text-violet-300">
                    <strong>Prompt Addendum</strong> text is appended to each agent's base system prompt on every call.
                    Changes take effect immediately — no redeploy needed. Each agent can also use a different model via the per-function override.
                </p>
            </div>

            {AGENT_REGISTRY.map(agent => {
                const isExpanded = expandedId === agent.id;
                const effectiveModel = (overrides[agent.id] && overrides[agent.id] !== GLOBAL_KEY)
                    ? overrides[agent.id]
                    : defaultModel;
                const modelLabel = GEMINI_MODELS.find(m => m.id === effectiveModel)?.label ?? effectiveModel;
                const hasOverride = overrides[agent.id] && overrides[agent.id] !== GLOBAL_KEY;
                const hasAddendum = (addenda[agent.id] ?? "").trim().length > 0;

                return (
                    <Card key={agent.id} className="overflow-hidden border border-slate-200 dark:border-slate-800 shadow-sm">
                        <CardHeader className="pb-3 bg-slate-50/60 dark:bg-slate-900/40">
                            <div className="flex items-start justify-between gap-4">
                                <div className="flex items-start gap-3 min-w-0">
                                    <div className="p-2 bg-violet-100 dark:bg-violet-900/30 rounded-lg shrink-0 mt-0.5">
                                        <Bot className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                                    </div>
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <CardTitle className="text-base">{agent.name}</CardTitle>
                                            {hasOverride ? (
                                                <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 text-[10px] gap-1">
                                                    <Zap className="w-2.5 h-2.5" /> Override: {modelLabel}
                                                </Badge>
                                            ) : (
                                                <Badge variant="outline" className="text-[10px] text-slate-400 gap-1">
                                                    <CheckCircle2 className="w-2.5 h-2.5" /> {modelLabel}
                                                </Badge>
                                            )}
                                            {hasAddendum && (
                                                <Badge className="bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400 text-[10px]">
                                                    + Addendum
                                                </Badge>
                                            )}
                                        </div>
                                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{agent.description}</p>
                                        <div className="flex items-center gap-1.5 mt-1.5">
                                            <FileCode className="w-3 h-3 text-slate-400 shrink-0" />
                                            <code className="text-[10px] text-slate-400 font-mono">{agent.sourceFile}</code>
                                        </div>
                                    </div>
                                </div>
                                <Button
                                    variant="ghost" size="sm"
                                    onClick={() => setExpandedId(isExpanded ? null : agent.id)}
                                    className="shrink-0 text-slate-400 hover:text-slate-600 gap-1 text-xs"
                                >
                                    {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                    {isExpanded ? "Collapse" : "Configure"}
                                </Button>
                            </div>
                            <div className="flex items-center gap-2 mt-2 ml-11">
                                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Trigger:</span>
                                <span className="text-[11px] text-slate-500 dark:text-slate-400 italic">{agent.trigger}</span>
                            </div>
                        </CardHeader>

                        {isExpanded && (
                            <CardContent className="pt-5 space-y-5">
                                {/* Base Prompt Summary */}
                                <div>
                                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Base System Prompt</p>
                                    <div className="bg-slate-900 dark:bg-slate-950 rounded-xl p-4 max-h-52 overflow-y-auto custom-scrollbar">
                                        <pre className="text-xs text-slate-300 font-mono whitespace-pre-wrap leading-relaxed">{agent.promptSummary}</pre>
                                    </div>
                                    <p className="text-[10px] text-slate-400 mt-1.5">
                                        Read-only summary — see <code className="font-mono">{agent.sourceFile}</code> for the full prompt.
                                        Use the Addendum below to extend it.
                                    </p>
                                </div>

                                <Separator className="dark:bg-slate-800" />

                                {/* Model Override */}
                                <div>
                                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Model Override</p>
                                    <p className="text-xs text-slate-500 mb-3">
                                        Override the global default model for this agent only.
                                        Useful when one function needs higher quality (e.g. Pro for reports) or lower cost (e.g. Lite for column mapping).
                                    </p>
                                    <Select
                                        value={overrides[agent.id] ?? GLOBAL_KEY}
                                        onValueChange={val => setOverrides(prev => ({ ...prev, [agent.id]: val }))}
                                    >
                                        <SelectTrigger className="w-80 text-sm">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value={GLOBAL_KEY}>
                                                Use Global Default ({GEMINI_MODELS.find(m => m.id === defaultModel)?.label ?? defaultModel})
                                            </SelectItem>
                                            {GEMINI_MODELS.map(m => (
                                                <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <Separator className="dark:bg-slate-800" />

                                {/* Addendum Editor */}
                                <div>
                                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Prompt Addendum</p>
                                    <p className="text-xs text-slate-500 mb-3">
                                        Appended to the base system prompt on every call. Takes effect on the <strong>next call</strong> — no redeploy.
                                        Leave blank to use the base prompt only.
                                    </p>
                                    <Textarea
                                        value={addenda[agent.id] ?? ""}
                                        onChange={e => setAddenda(prev => ({ ...prev, [agent.id]: e.target.value }))}
                                        placeholder={`Additional instructions for ${agent.name}...\n\nExamples:\n• "Always respond in Bahasa Indonesia."\n• "Prioritize concerns about staff attitude over other categories."`}
                                        rows={5}
                                        className="font-mono text-xs resize-y bg-slate-50 dark:bg-slate-900/60"
                                    />
                                </div>

                                <div className="flex justify-end">
                                    <Button
                                        size="sm"
                                        onClick={() => save(agent.id)}
                                        disabled={savingId === agent.id}
                                        className="bg-violet-600 hover:bg-violet-700 text-white gap-2"
                                    >
                                        {savingId === agent.id
                                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                            : <Save className="w-3.5 h-3.5" />}
                                        Save Changes
                                    </Button>
                                </div>
                            </CardContent>
                        )}
                    </Card>
                );
            })}
        </div>
    );
}

// ─── Tab 2: Model & Pricing ────────────────────────────────────────────────────
function ModelPricingTab() {
    const [defaultModel, setDefaultModel] = useState(DEFAULT_FALLBACK);
    const [saving, setSaving] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        supabase.from("platform_settings").select("value").eq("key", "default_model").maybeSingle()
            .then(({ data }) => {
                setDefaultModel(data?.value ?? DEFAULT_FALLBACK);
                setLoading(false);
            });
    }, []);

    const saveDefault = async (modelId: string) => {
        setSaving(true);
        try {
            const { error } = await supabase.from("platform_settings")
                .upsert({ key: "default_model", value: modelId }, { onConflict: "key" });
            if (error) throw error;
            setDefaultModel(modelId);
            toast.success("Default model updated — takes effect on the next AI call");
        } catch (e: any) {
            toast.error("Save failed: " + e.message);
        } finally {
            setSaving(false);
        }
    };

    if (loading) return (
        <div className="space-y-4">
            <Skeleton className="h-72 w-full rounded-xl" />
            <Skeleton className="h-52 w-full rounded-xl" />
        </div>
    );

    return (
        <div className="space-y-6">
            {/* Default Model Selector */}
            <Card className="overflow-hidden">
                <CardHeader className="bg-slate-50/60 dark:bg-slate-900/40 pb-4">
                    <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-indigo-100 dark:bg-indigo-900/40 rounded-lg">
                            <Cpu className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                        </div>
                        <div>
                            <CardTitle className="text-base">Global Default Model</CardTitle>
                            <CardDescription className="mt-0.5">
                                All agents use this model unless overridden per-function in the Agents tab.
                                Takes effect on the next call — no redeploy needed.
                            </CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="pt-5">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        {GEMINI_MODELS.map(model => {
                            const isSelected = defaultModel === model.id;
                            return (
                                <button
                                    key={model.id}
                                    onClick={() => saveDefault(model.id)}
                                    disabled={saving}
                                    className={cn(
                                        "relative text-left p-4 rounded-xl border-2 transition-all duration-200 disabled:opacity-60",
                                        isSelected
                                            ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30 shadow-sm"
                                            : "border-slate-200 dark:border-slate-800 hover:border-indigo-300 dark:hover:border-indigo-700 hover:bg-slate-50 dark:hover:bg-slate-900/50"
                                    )}
                                >
                                    {isSelected && (
                                        <div className="absolute top-3 right-3">
                                            <CheckCircle2 className="w-4 h-4 text-indigo-500" />
                                        </div>
                                    )}
                                    <div className="flex items-center gap-2 mb-2">
                                        <div className={cn("w-2.5 h-2.5 rounded-full shrink-0",
                                            model.tier === "fast" ? "bg-green-500" :
                                            model.tier === "balanced" ? "bg-blue-500" : "bg-purple-500"
                                        )} />
                                        <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{model.label}</span>
                                    </div>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-3 leading-relaxed">{model.description}</p>
                                    <div className="space-y-1 pt-2 border-t border-slate-200 dark:border-slate-700">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[10px] text-slate-400 uppercase tracking-wider">Input</span>
                                            <span className="text-xs font-mono text-slate-600 dark:text-slate-300">${model.inputRate}/1M tokens</span>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <span className="text-[10px] text-slate-400 uppercase tracking-wider">Output</span>
                                            <span className="text-xs font-mono text-slate-600 dark:text-slate-300">${model.outputRate}/1M tokens</span>
                                        </div>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </CardContent>
            </Card>

            {/* Pricing Reference */}
            <Card>
                <CardHeader className="pb-4">
                    <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-emerald-100 dark:bg-emerald-900/40 rounded-lg">
                            <DollarSign className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                        </div>
                        <div>
                            <CardTitle className="text-base">Token Pricing Reference</CardTitle>
                            <CardDescription className="mt-0.5">
                                Prices used for cost estimates in the Usage tab. All values in USD per 1 million tokens (Google AI pricing).
                            </CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60">
                                    {["Model", "Input / 1M tokens", "Output / 1M tokens", "Est. cost per 1k calls*"].map(h => (
                                        <th key={h} className="text-left py-2.5 px-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                                {GEMINI_MODELS.map(m => (
                                    <tr key={m.id} className={cn(
                                        "hover:bg-slate-50 dark:hover:bg-slate-900/40 transition-colors",
                                        defaultModel === m.id && "bg-indigo-50/40 dark:bg-indigo-950/10"
                                    )}>
                                        <td className="py-3 px-4">
                                            <div className="flex items-center gap-2">
                                                <div className={cn("w-2 h-2 rounded-full shrink-0",
                                                    m.tier === "fast" ? "bg-green-500" :
                                                    m.tier === "balanced" ? "bg-blue-500" : "bg-purple-500"
                                                )} />
                                                <span className="font-medium text-slate-700 dark:text-slate-300">{m.label}</span>
                                                {defaultModel === m.id && (
                                                    <Badge className="bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400 text-[10px]">Global default</Badge>
                                                )}
                                            </div>
                                            <p className="text-[10px] text-slate-400 font-mono ml-4 mt-0.5">{m.id}</p>
                                        </td>
                                        <td className="py-3 px-4 font-mono text-slate-600 dark:text-slate-300">${m.inputRate}</td>
                                        <td className="py-3 px-4 font-mono text-slate-600 dark:text-slate-300">${m.outputRate}</td>
                                        <td className="py-3 px-4 text-slate-500 dark:text-slate-400">
                                            ~${((1000 * (500 * m.inputRate + 300 * m.outputRate)) / 1_000_000).toFixed(3)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <p className="text-xs text-slate-400 mt-3">
                        * Assumes ~500 input tokens + ~300 output tokens per call. Actual usage varies significantly by agent and data size.
                    </p>
                </CardContent>
            </Card>
        </div>
    );
}

// ─── Tab 3: Usage ──────────────────────────────────────────────────────────────
const TIME_RANGES = [
    { label: "7 days",  days: 7   },
    { label: "30 days", days: 30  },
    { label: "90 days", days: 90  },
    { label: "All time", days: null },
];

function UsageTab() {
    const [logs, setLogs] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [timeRange, setTimeRange] = useState(TIME_RANGES[1]);

    const load = useCallback(async () => {
        setLoading(true);
        let query = supabase
            .from("ai_usage_logs")
            .select("id, function_name, model_id, input_tokens, output_tokens, total_tokens, estimated_cost_usd, created_at")
            .order("created_at", { ascending: false })
            .limit(5000);
        if (timeRange.days !== null) {
            const since = new Date(Date.now() - timeRange.days * 86_400_000).toISOString();
            query = query.gte("created_at", since);
        }
        const { data } = await query;
        setLogs(data ?? []);
        setLoading(false);
    }, [timeRange]);

    useEffect(() => { load(); }, [load]);

    // Client-side aggregations
    const totalCalls  = logs.length;
    const totalCost   = logs.reduce((s, r) => s + (r.estimated_cost_usd ?? 0), 0);
    const totalInput  = logs.reduce((s, r) => s + (r.input_tokens  ?? 0), 0);
    const totalOutput = logs.reduce((s, r) => s + (r.output_tokens ?? 0), 0);

    const byFunction = Object.values(
        logs.reduce((acc: any, r) => {
            if (!acc[r.function_name]) acc[r.function_name] = { name: r.function_name, calls: 0, cost: 0 };
            acc[r.function_name].calls++;
            acc[r.function_name].cost += r.estimated_cost_usd ?? 0;
            return acc;
        }, {})
    ).sort((a: any, b: any) => b.cost - a.cost) as any[];

    const byDay = Object.values(
        logs.reduce((acc: any, r) => {
            const day = r.created_at?.slice(0, 10);
            if (!day) return acc;
            if (!acc[day]) acc[day] = { day, calls: 0 };
            acc[day].calls++;
            return acc;
        }, {})
    ).sort((a: any, b: any) => (a.day < b.day ? -1 : 1)) as any[];

    const exportCSV = () => {
        const header = "date,function,model,input_tokens,output_tokens,total_tokens,cost_usd\n";
        const rows = logs.map(r =>
            [r.created_at?.slice(0, 19).replace("T", " "), r.function_name, r.model_id,
             r.input_tokens, r.output_tokens, r.total_tokens,
             r.estimated_cost_usd?.toFixed(8)].join(",")
        ).join("\n");
        const blob = new Blob([header + rows], { type: "text/csv" });
        const a = Object.assign(document.createElement("a"), {
            href: URL.createObjectURL(blob),
            download: `ai-usage-${new Date().toISOString().slice(0, 10)}.csv`,
        });
        a.click();
        URL.revokeObjectURL(a.href);
    };

    const summaryCards = [
        { label: "Total Calls",    value: totalCalls.toLocaleString(),                        sub: "AI function invocations", icon: Activity,   color: "blue"   },
        { label: "Estimated Cost", value: `$${totalCost.toFixed(4)}`,                         sub: "USD (approximate)",       icon: DollarSign, color: "emerald"},
        { label: "Input Tokens",   value: (totalInput  / 1000).toFixed(1) + "k",             sub: "tokens sent to model",    icon: TrendingUp, color: "violet" },
        { label: "Output Tokens",  value: (totalOutput / 1000).toFixed(1) + "k",             sub: "tokens generated",        icon: Zap,        color: "amber"  },
    ];

    return (
        <div className="space-y-6">
            {/* Controls */}
            <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-500 dark:text-slate-400">Range:</span>
                    <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800/60 p-1 rounded-lg">
                        {TIME_RANGES.map(tr => (
                            <button
                                key={tr.label}
                                onClick={() => setTimeRange(tr)}
                                className={cn(
                                    "px-3 py-1.5 text-xs font-medium rounded-md transition-all",
                                    timeRange.label === tr.label
                                        ? "bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 shadow-sm"
                                        : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                                )}
                            >
                                {tr.label}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1.5 text-xs">
                        <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} /> Refresh
                    </Button>
                    <Button variant="outline" size="sm" onClick={exportCSV} disabled={loading || logs.length === 0} className="gap-1.5 text-xs">
                        <Download className="w-3.5 h-3.5" /> Export CSV
                    </Button>
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {summaryCards.map(card => (
                    <Card key={card.label} className="overflow-hidden">
                        <CardContent className="p-5">
                            {loading ? (
                                <div className="space-y-2">
                                    <Skeleton className="h-3 w-20" />
                                    <Skeleton className="h-7 w-28" />
                                    <Skeleton className="h-3 w-16" />
                                </div>
                            ) : (
                                <>
                                    <div className="flex items-center justify-between mb-2">
                                        <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">{card.label}</p>
                                        <div className={cn("p-1.5 rounded-lg",
                                            card.color === "blue"   ? "bg-blue-100   dark:bg-blue-900/30"   :
                                            card.color === "emerald"? "bg-emerald-100 dark:bg-emerald-900/30":
                                            card.color === "violet" ? "bg-violet-100 dark:bg-violet-900/30" :
                                                                      "bg-amber-100  dark:bg-amber-900/30"
                                        )}>
                                            <card.icon className={cn("w-4 h-4",
                                                card.color === "blue"   ? "text-blue-600   dark:text-blue-400"   :
                                                card.color === "emerald"? "text-emerald-600 dark:text-emerald-400":
                                                card.color === "violet" ? "text-violet-600 dark:text-violet-400" :
                                                                          "text-amber-600  dark:text-amber-400"
                                            )} />
                                        </div>
                                    </div>
                                    <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">{card.value}</p>
                                    <p className="text-xs text-slate-400 mt-1">{card.sub}</p>
                                </>
                            )}
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Charts */}
            {!loading && byFunction.length > 0 && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-semibold">Cost by Function</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <ResponsiveContainer width="100%" height={220}>
                                <BarChart data={byFunction} layout="vertical" margin={{ left: 10, right: 40 }}>
                                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                                    <XAxis type="number" tickFormatter={v => `$${Number(v).toFixed(4)}`} tick={{ fontSize: 10, fill: "#94a3b8" }} />
                                    <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "#94a3b8" }} width={110} />
                                    <Tooltip
                                        formatter={(v: any) => [`$${Number(v).toFixed(6)}`, "Cost"]}
                                        contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: "8px", fontSize: "12px" }}
                                        labelStyle={{ color: "#e2e8f0" }}
                                        itemStyle={{ color: "#a78bfa" }}
                                    />
                                    <Bar dataKey="cost" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-semibold">Calls by Function</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <ResponsiveContainer width="100%" height={220}>
                                <BarChart data={byFunction} layout="vertical" margin={{ left: 10, right: 40 }}>
                                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                                    <XAxis type="number" tick={{ fontSize: 10, fill: "#94a3b8" }} />
                                    <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "#94a3b8" }} width={110} />
                                    <Tooltip
                                        formatter={(v: any) => [v, "Calls"]}
                                        contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: "8px", fontSize: "12px" }}
                                        labelStyle={{ color: "#e2e8f0" }}
                                        itemStyle={{ color: "#38bdf8" }}
                                    />
                                    <Bar dataKey="calls" fill="#38bdf8" radius={[0, 4, 4, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </CardContent>
                    </Card>

                    {byDay.length > 1 && (
                        <Card className="lg:col-span-2">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-semibold">Daily Call Volume</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <ResponsiveContainer width="100%" height={180}>
                                    <LineChart data={byDay} margin={{ left: 0, right: 10 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                        <XAxis dataKey="day" tick={{ fontSize: 10, fill: "#94a3b8" }} />
                                        <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} allowDecimals={false} />
                                        <Tooltip
                                            contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: "8px", fontSize: "12px" }}
                                            labelStyle={{ color: "#e2e8f0" }}
                                        />
                                        <Line type="monotone" dataKey="calls" stroke="#38bdf8" strokeWidth={2} dot={false} />
                                    </LineChart>
                                </ResponsiveContainer>
                            </CardContent>
                        </Card>
                    )}
                </div>
            )}

            {/* Recent Logs Table */}
            <Card>
                <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-semibold">Recent Calls</CardTitle>
                        <Badge variant="outline" className="text-[11px]">{logs.length.toLocaleString()} records</Badge>
                    </div>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
                    ) : logs.length === 0 ? (
                        <div className="text-center py-12 text-slate-400">
                            <Activity className="w-8 h-8 mx-auto mb-2 opacity-40" />
                            <p className="text-sm">No usage logs for this period.</p>
                            <p className="text-xs mt-1">Logs appear after the first AI call once the DB tables are created.</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-slate-200 dark:border-slate-800">
                                        {["Function", "Model", "Input", "Output", "Total", "Cost", "Time"].map(h => (
                                            <th key={h} className="text-left py-2 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                                    {logs.slice(0, 50).map(log => (
                                        <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/40 transition-colors">
                                            <td className="py-2.5 px-3">
                                                <span className="font-mono text-xs text-violet-600 dark:text-violet-400">{log.function_name}</span>
                                            </td>
                                            <td className="py-2.5 px-3 text-xs text-slate-500 font-mono">{log.model_id}</td>
                                            <td className="py-2.5 px-3 text-right text-xs text-slate-500 font-mono">{(log.input_tokens  ?? 0).toLocaleString()}</td>
                                            <td className="py-2.5 px-3 text-right text-xs text-slate-500 font-mono">{(log.output_tokens ?? 0).toLocaleString()}</td>
                                            <td className="py-2.5 px-3 text-right text-xs font-mono font-medium text-slate-700 dark:text-slate-300">{(log.total_tokens ?? 0).toLocaleString()}</td>
                                            <td className="py-2.5 px-3 text-right">
                                                <span className="text-xs font-mono text-emerald-600 dark:text-emerald-400">${(log.estimated_cost_usd ?? 0).toFixed(6)}</span>
                                            </td>
                                            <td className="py-2.5 px-3 text-xs text-slate-400 whitespace-nowrap">
                                                {new Date(log.created_at).toLocaleString()}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {logs.length > 50 && (
                                <p className="text-center text-xs text-slate-400 mt-3">
                                    Showing 50 of {logs.length.toLocaleString()} records — export CSV for full dataset.
                                </p>
                            )}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
