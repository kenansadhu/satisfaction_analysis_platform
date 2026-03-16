"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import Papa from "papaparse";
import { Upload, CheckCircle, Search, ArrowRight, MapPin, Building2, GraduationCap, Filter, Loader2, Save, CalendarDays, Eye, AlertTriangle, ArrowLeft, Sparkles, User, Info, BarChart3, List, Tag, FileSpreadsheet, Layers, ShieldCheck } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { PageShell, PageHeader } from "@/components/layout/PageShell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/lib/supabase";
import { Badge } from "@/components/ui/badge";

type Unit = { id: number; name: string; description?: string };
type ColumnConfig = {
  unitId: string;
  type: "TEXT" | "SCORE" | "CATEGORY" | "IGNORE";
  rule?: "LIKERT" | "BOOLEAN" | "NUMBER" | "TEXT_SCALE" | "CUSTOM_MAPPING";
  customMapping?: Record<string, number | null>;
};

// --- Helper: Identity Column Selector ---
function ColumnSelector({
  allHeaders, selected, setSelected, icon: Icon, title, description
}: {
  allHeaders: string[], selected: string[], setSelected: (v: string[]) => void, icon: any, title: string, description: string
}) {
  const [localSearch, setLocalSearch] = useState("");
  const [showSelectedOnly, setShowSelectedOnly] = useState(false);

  const filteredHeaders = allHeaders.filter(h => {
    const matchesSearch = h.toLowerCase().includes(localSearch.toLowerCase());
    const matchesFilter = showSelectedOnly ? selected.includes(h) : true;
    return matchesSearch && matchesFilter;
  });

  const toggleItem = (item: string) => {
    if (selected.includes(item)) setSelected(selected.filter(i => i !== item));
    else setSelected([...selected, item]);
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-blue-500/10 dark:bg-blue-500/20 rounded-xl">
            <Icon className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h3 className="font-bold text-slate-800 dark:text-slate-100">{title}</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">{description}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
            <Input
              placeholder="Search columns..."
              className="pl-10 h-10 w-[200px] md:w-[300px] bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800"
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
            />
          </div>
          <Button
            variant={showSelectedOnly ? "default" : "outline"}
            size="sm"
            onClick={() => setShowSelectedOnly(!showSelectedOnly)}
            className={`gap-2 h-10 rounded-lg font-bold ${showSelectedOnly ? "bg-blue-600" : "border-slate-200 dark:border-slate-800"}`}
          >
            <Filter className={`w-4 h-4 ${showSelectedOnly ? "text-white" : "text-slate-400"}`} />
            {showSelectedOnly ? `Selected (${selected.length})` : "Filter Selected"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 max-h-[400px] overflow-y-auto p-1 custom-scrollbar">
        {filteredHeaders.map(h => (
          <div
            key={h}
            onClick={() => toggleItem(h)}
            className={`group cursor-pointer p-3 rounded-xl border-2 transition-all duration-200 flex items-center gap-3 select-none ${selected.includes(h)
              ? "bg-blue-50/50 border-blue-500 dark:bg-blue-900/10 dark:border-blue-500 shadow-md ring-1 ring-blue-500/20"
              : "bg-white dark:bg-slate-900/50 border-slate-100 dark:border-slate-800 hover:border-blue-300 dark:hover:border-blue-800 hover:shadow-sm"
              }`}
          >
            <div className={`shrink-0 w-5 h-5 rounded-lg border-2 flex items-center justify-center transition-colors ${selected.includes(h)
              ? "bg-blue-500 border-blue-500"
              : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              }`}>
              {selected.includes(h) && <CheckCircle className="w-3.5 h-3.5 text-white" />}
            </div>
            <span className={`truncate text-sm font-semibold transition-colors ${selected.includes(h) ? "text-blue-700 dark:text-blue-300" : "text-slate-600 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-slate-200"
              }`} title={h}>
              {h}
            </span>
          </div>
        ))}
        {filteredHeaders.length === 0 && (
          <div className="col-span-full py-20 text-center space-y-2">
            <div className="p-4 bg-slate-50 dark:bg-slate-900 rotate-12 inline-block rounded-3xl border border-slate-100 dark:border-slate-800">
              <Search className="w-8 h-8 text-slate-300" />
            </div>
            <p className="text-slate-400 font-medium tracking-tight">No columns found matching your search</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ImportPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState(1);
  const [headers, setHeaders] = useState<string[]>([]);
  const [csvData, setCsvData] = useState<any[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [surveyTitle, setSurveyTitle] = useState("");
  const [surveyDescription, setSurveyDescription] = useState("");

  const [locationCols, setLocationCols] = useState<string[]>([]);
  const [facultyCols, setFacultyCols] = useState<string[]>([]);
  const [majorCols, setMajorCols] = useState<string[]>([]);
  const [yearCols, setYearCols] = useState<string[]>([]);

  const [columnConfigs, setColumnConfigs] = useState<Record<string, ColumnConfig>>({});

  const [previewHeader, setPreviewHeader] = useState<string | null>(null);
  const [filterText, setFilterText] = useState("");
  const [isAiMapping, setIsAiMapping] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState("");

  useEffect(() => { loadUnits(); }, []);
  async function loadUnits() {
    const { data } = await supabase.from('organization_units').select('*').order('name');
    if (data) setUnits(data);
  }

  // --- SMART PREVIEW LOGIC ---
  const previewStats = useMemo(() => {
    if (!previewHeader) return null;

    const allValues = csvData
      .map(row => row[previewHeader])
      .filter(v => v && v.trim() !== "" && v !== "-" && v !== "N/A");

    const uniqueSet = new Set(allValues);
    const uniqueCount = uniqueSet.size;
    const uniqueValues = Array.from(uniqueSet).slice(0, 20);

    return {
      totalValid: allValues.length,
      uniqueCount,
      uniqueValues,
      isCategorical: uniqueCount < 15 && uniqueCount > 0,
      samples: allValues.slice(0, 5)
    };
  }, [previewHeader, csvData]);

  // --- Helper for Custom Mapping on the Card ---
  const getUniqueValuesForHeader = (header: string) => {
    const allValues = csvData
      .map(row => row[header])
      .filter(v => v && v.trim() !== "" && v !== "-" && v !== "N/A");
    return Array.from(new Set(allValues)).slice(0, 20); // Limit to 20 for safety
  };

  // --- 1. UPLOAD ---
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    Papa.parse(file, {
      header: true, skipEmptyLines: true,
      complete: (results) => {
        if (results.data && results.data.length > 0) {
          setHeaders(results.meta.fields || []);
          setCsvData(results.data);
        }
      },
    });
  };

  // --- 2. AI IDENTITY ---
  const handleAutoIdentityMap = async () => {
    setIsAiMapping(true);
    try {
      const response = await fetch('/api/ai/map-identity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ headers })
      });
      const data = await response.json();
      if (data.mapping) {
        if (data.mapping.location) setLocationCols(data.mapping.location);
        if (data.mapping.faculty) setFacultyCols(data.mapping.faculty);
        if (data.mapping.major) setMajorCols(data.mapping.major);
        if (data.mapping.year) setYearCols(data.mapping.year);
      }
    } catch (e) { toast.error("AI Identity Map Failed"); } finally { setIsAiMapping(false); }
  };

  // --- 3. AI COLUMN MAP (UPDATED FOR 3 TYPES) ---
  const handleAutoMapColumns = async () => {
    setIsAiMapping(true);
    try {
      const samples: Record<string, string[]> = {};
      const headersToMap = headers.filter(h => !isIdentity(h));

      headersToMap.forEach(h => {
        samples[h] = Array.from(new Set(csvData.map(row => row[h]).filter(v => v))).slice(0, 20);
      });

      const response = await fetch('/api/ai/map-columns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ headers: headersToMap, samples, units, surveyDescription })
      });

      const data = await response.json();
      if (data.mappings) {
        const newConfigs = { ...columnConfigs };
        Object.entries(data.mappings).forEach(([header, config]: [string, any]) => {
          newConfigs[header] = {
            unitId: config.unit_id,
            type: config.type, // SCORE, TEXT, CATEGORY
            rule: config.rule,
            customMapping: config.customMapping || {}
          };
        });
        setColumnConfigs(newConfigs);
      }
    } catch (e) { toast.error("AI Error"); } finally { setIsAiMapping(false); }
  };

  const getSamples = (header: string) => {
    return csvData.map(row => row[header]).filter(v => v && v.trim() !== "").slice(0, 5);
  };

  const updateConfig = (header: string, field: keyof ColumnConfig, value: any) => {
    setColumnConfigs(prev => ({ ...prev, [header]: { ...prev[header], [field]: value } }));
  };

  const handleUpdateCustomMapping = (header: string, valueStr: string, mappedScore: number | null) => {
    setColumnConfigs(prev => ({
      ...prev,
      [header]: {
        ...prev[header],
        customMapping: {
          ...(prev[header]?.customMapping || {}),
          [valueStr]: mappedScore
        }
      }
    }));
  };

  // --- 4. IMPORT EXECUTION (UPDATED) ---
  const handleStartImport = async () => {
    setIsProcessing(true);
    try {
      const { data: survey, error: surveyError } = await supabase.from('surveys').insert({ title: surveyTitle, description: surveyDescription }).select().single();
      if (surveyError) throw surveyError;
      const surveyId = survey.id;

      const BATCH_SIZE = 50;
      let processedRows = 0;

      for (let i = 0; i < csvData.length; i += BATCH_SIZE) {
        const chunk = csvData.slice(i, i + BATCH_SIZE);
        const respondentsPayload = chunk.map((row, idx) => {
          const loc = locationCols.find(c => row[c]) ? row[locationCols.find(c => row[c])!] : "Unknown";
          const fac = facultyCols.find(c => row[c]) ? row[facultyCols.find(c => row[c])!] : "Unknown";
          const maj = majorCols.find(c => row[c]) ? row[majorCols.find(c => row[c])!] : "Unknown";
          const year = yearCols.find(c => row[c]) ? row[yearCols.find(c => row[c])!] : "Unknown";
          return { survey_id: surveyId, location: loc, faculty: fac, study_program: maj, entry_year: year, student_hash: `temp_${i + idx}` };
        });

        const { data: insertedRespondents, error: respError } = await supabase.from('respondents').insert(respondentsPayload).select('id, student_hash');
        if (respError) throw respError;

        const feedbackPayload: any[] = [];
        insertedRespondents!.forEach(resp => {
          const originalIdx = parseInt(resp.student_hash!.split('_')[1]);
          const row = csvData[originalIdx];
          Object.entries(columnConfigs).forEach(([header, config]) => {
            if (config.type === "IGNORE" || !config.unitId) return;
            const rawValue = row[header];
            if (!rawValue) return;

            let payload: any = {
              respondent_id: resp.id,
              target_unit_id: parseInt(config.unitId),
              raw_text: rawValue,
              source_column: header,
              is_quantitative: config.type === "SCORE", // Only scores are quantitative
              requires_analysis: config.type === "TEXT", // Only open text needs AI
              numerical_score: null,
              score_rule: config.type === "SCORE" ? (config.rule || "NUMBER") : null,
              custom_mapping: config.type === "SCORE" && (config.rule === "CUSTOM_MAPPING" || config.rule === "LIKERT" || config.rule === "BOOLEAN") ? config.customMapping : null
            };

            // --- TRANSFORMATIONS (Updated to prioritize mapping overrides) ---
            if (config.type === "SCORE") {
              const mappedValue = config.customMapping?.[rawValue];

              if (mappedValue !== undefined) {
                // Priority 1: Use the explicit mapping from the UI (Data Translation Layer)
                payload.numerical_score = mappedValue;
              } else {
                // Priority 2: Fallback to heuristic rules
                if (config.rule === "LIKERT") {
                  const match = rawValue.match(/^(\d+)/);
                  if (match) payload.numerical_score = parseInt(match[1]);
                } else if (config.rule === "BOOLEAN") {
                  const lower = rawValue.toLowerCase();
                  if (lower === "ya" || lower === "yes" || lower === "true") payload.numerical_score = 1;
                  else payload.numerical_score = 0;
                } else if (config.rule === "NUMBER") {
                  const parsed = parseFloat(rawValue);
                  if (!isNaN(parsed)) payload.numerical_score = parsed;
                } else if (config.rule === "TEXT_SCALE") {
                  const lower = rawValue.toLowerCase();
                  if (lower.includes("tidak pernah") || lower.includes("sangat tidak") || lower.includes("never")) payload.numerical_score = 1;
                  else if (lower.includes("jarang") || lower.includes("tidak setuju") || lower.includes("kurang") || lower.includes("rarely")) payload.numerical_score = 2;
                  else if (lower.includes("sering") || lower.includes("setuju") || lower.includes("puas") || lower.includes("often") || lower.includes("kadang") || lower.includes("netral") || lower.includes("cukup") || lower.includes("ragu")) payload.numerical_score = 3;
                  else if (lower.includes("selalu") || lower.includes("sangat") || lower.includes("lebih dari") || lower.includes("always")) payload.numerical_score = 4;
                }
              }
            }

            feedbackPayload.push(payload);
          });
        });

        if (feedbackPayload.length > 0) {
          await supabase.from('raw_feedback_inputs').insert(feedbackPayload);
        }
        processedRows += chunk.length;
        setProgress(Math.round((processedRows / csvData.length) * 100));
        setStatusMessage(`Processed ${processedRows} rows...`);
      }
      setStatusMessage("Import Complete!");
      setTimeout(() => window.location.href = "/surveys", 1000);
    } catch (e: any) { toast.error(e.message); setIsProcessing(false); }
  };

  const isIdentity = (h: string) => locationCols.includes(h) || facultyCols.includes(h) || majorCols.includes(h) || yearCols.includes(h);

  return (
    <PageShell>
      <PageHeader
        title={<div className="flex items-center gap-3"><div className="p-2 bg-blue-500/20 rounded-lg"><FileSpreadsheet className="w-6 h-6 text-blue-400" /></div> Import Wizard</div>}
        description={step === 1 ? "Start by uploading your survey data" : step === 2 ? "Define column identities" : step === 3 ? "Map columns to organization units" : "Final validation before import"}
        backHref="/surveys"
        backLabel="Dashboard"
      />

      <div className="max-w-7xl mx-auto px-6 md:px-8 py-8 space-y-8">
        {/* PROGRESS TRACKER */}
        <div className="relative mb-12">
          <div className="absolute top-1/2 left-0 w-full h-0.5 bg-slate-200 dark:bg-slate-800 -translate-y-1/2" />
          <div className="relative flex justify-between">
            {[
              { id: 1, label: "Upload", icon: Upload },
              { id: 2, label: "Identity", icon: User },
              { id: 3, label: "Mapping", icon: Layers },
              { id: 4, label: "Validate", icon: ShieldCheck }
            ].map((s) => (
              <div key={s.id} className="flex flex-col items-center gap-3 relative z-10">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-500 ${step >= s.id ? "bg-blue-600 text-white shadow-lg shadow-blue-500/30 scale-110" : "bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 text-slate-400"
                  }`}>
                  <s.icon className="w-5 h-5" />
                </div>
                <span className={`text-xs font-bold uppercase tracking-wider ${step >= s.id ? "text-blue-600 dark:text-blue-400" : "text-slate-400"}`}>{s.label}</span>
              </div>
            ))}
          </div>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
          >

            {/* STEP 1: UPLOAD */}
            {step === 1 && (
              <Card className="border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm">
                <div className="h-1.5 bg-gradient-to-r from-blue-600 to-indigo-600" />
                <CardHeader>
                  <CardTitle className="text-2xl font-bold flex items-center gap-2">
                    <FileSpreadsheet className="w-6 h-6 text-blue-600" />
                    Survey Details
                  </CardTitle>
                  <CardDescription>Name your survey and upload the raw CSV data for processing.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-8 p-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">Survey Title</label>
                        <Input
                          value={surveyTitle}
                          onChange={e => setSurveyTitle(e.target.value)}
                          placeholder="e.g. Student Satisfaction 2025"
                          className="text-lg py-6 font-semibold bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-blue-500/20"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">Survey Context (AI Description)</label>
                        <Textarea
                          value={surveyDescription}
                          onChange={e => setSurveyDescription(e.target.value)}
                          placeholder="Optional: Describe the survey context (e.g., 'This is a year-end survey for all engineering students regarding lab facilities'). This helps the AI map columns accurately."
                          className="min-h-[150px] bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-blue-500/20 resize-none"
                        />
                      </div>
                    </div>

                    <div className="flex flex-col h-full">
                      <label className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">Data Source (.CSV)</label>
                      <Card className={`flex-1 border-dashed border-2 transition-all duration-300 relative group ${csvData.length > 0
                        ? "bg-green-50/30 border-green-200 dark:bg-green-950/10 dark:border-green-900"
                        : "bg-slate-50 border-slate-200 dark:bg-slate-900/30 dark:border-slate-800 hover:border-blue-400 dark:hover:border-blue-500"
                        }`}>
                        <CardContent className="flex flex-col items-center justify-center h-full py-12 space-y-6">
                          {csvData.length > 0 ? (
                            <div className="text-center space-y-4 animate-in zoom-in duration-300">
                              <div className="mx-auto w-20 h-20 bg-green-100 dark:bg-green-900/40 rounded-3xl flex items-center justify-center shadow-inner">
                                <CheckCircle className="w-10 h-10 text-green-600 dark:text-green-400" />
                              </div>
                              <div>
                                <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 italic">File Loaded!</h3>
                                <div className="flex items-center justify-center gap-2 text-slate-500 mt-1">
                                  <Badge variant="secondary" className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">{csvData.length} Rows</Badge>
                                  <Badge variant="secondary" className="bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">{headers.length} Columns</Badge>
                                </div>
                              </div>
                              <Button variant="ghost" size="sm" onClick={() => { setCsvData([]); setHeaders([]); }} className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30">Replace File</Button>
                            </div>
                          ) : (
                            <>
                              <div className="w-20 h-20 bg-white dark:bg-slate-800 rounded-3xl flex items-center justify-center shadow-sm border border-slate-100 dark:border-slate-700 group-hover:scale-110 transition-transform duration-300">
                                <Upload className="w-10 h-10 text-slate-300 group-hover:text-blue-500 transition-colors" />
                              </div>
                              <div className="text-center space-y-2">
                                <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-200">Drop your survey file here</h3>
                                <p className="text-sm text-slate-400 mb-4">Only CSV files are supported</p>
                                <input
                                  type="file"
                                  ref={fileInputRef}
                                  accept=".csv"
                                  onChange={handleFileUpload}
                                  className="absolute inset-0 opacity-0 cursor-pointer"
                                />
                                <Button
                                  variant="outline"
                                  className="relative z-10 font-bold border-slate-300 dark:border-slate-700"
                                  onClick={() => fileInputRef.current?.click()}
                                >
                                  Choose File
                                </Button>
                              </div>
                            </>
                          )}
                        </CardContent>
                      </Card>
                    </div>
                  </div>

                  <div className="flex justify-end pt-6 border-t border-slate-100 dark:border-slate-800">
                    <Button
                      size="lg"
                      disabled={!surveyTitle || csvData.length === 0}
                      onClick={() => setStep(2)}
                      className="px-10 py-7 text-lg bg-blue-600 hover:bg-blue-700 shadow-xl shadow-blue-500/20 group h-auto"
                    >
                      Continue to Mapping
                      <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* STEP 2: IDENTITY */}
            {step === 2 && (
              <Card className="border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm">
                <div className="h-1.5 bg-gradient-to-r from-purple-600 to-blue-600" />
                <CardHeader className="border-b border-slate-100 dark:border-slate-800 bg-white/30 dark:bg-slate-900/30">
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                      <CardTitle className="text-2xl font-bold flex items-center gap-2">
                        <User className="w-6 h-6 text-purple-600" />
                        Student Identity
                      </CardTitle>
                      <CardDescription>Select columns that identify the student's background.</CardDescription>
                    </div>
                    <Button
                      variant="secondary"
                      className="gap-2 bg-purple-100 text-purple-700 border-purple-200 hover:bg-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800 shadow-sm"
                      onClick={handleAutoIdentityMap}
                      disabled={isAiMapping}
                    >
                      {isAiMapping ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                      AI Auto-Detect Identity
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="p-8">
                  <Tabs defaultValue="location" className="w-full">
                    <TabsList className="mb-8 p-0 bg-slate-200/50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-xl flex w-full h-12 items-center justify-center overflow-hidden">
                      <TabsTrigger value="location" className="flex-1 rounded-none flex items-center justify-center gap-2 px-6 h-full data-[state=active]:bg-white dark:data-[state=active]:bg-slate-950 data-[state=active]:shadow-sm transition-all font-bold text-slate-500 data-[state=active]:text-blue-600 dark:data-[state=active]:text-blue-400">
                        <MapPin className="w-4 h-4 text-blue-500" />
                        <span className="hidden sm:inline">Location</span>
                        {locationCols.length > 0 && <Badge className="ml-1 bg-blue-500 px-1.5 h-4 text-[10px] font-black">{locationCols.length}</Badge>}
                      </TabsTrigger>
                      <TabsTrigger value="faculty" className="flex-1 rounded-none flex items-center justify-center gap-2 px-6 h-full data-[state=active]:bg-white dark:data-[state=active]:bg-slate-950 data-[state=active]:shadow-sm transition-all font-bold text-slate-500 data-[state=active]:text-indigo-600 dark:data-[state=active]:text-indigo-400">
                        <Building2 className="w-4 h-4 text-indigo-500" />
                        <span className="hidden sm:inline">Faculty</span>
                        {facultyCols.length > 0 && <Badge className="ml-1 bg-indigo-500 px-1.5 h-4 text-[10px] font-black">{facultyCols.length}</Badge>}
                      </TabsTrigger>
                      <TabsTrigger value="major" className="flex-1 rounded-none flex items-center justify-center gap-2 px-6 h-full data-[state=active]:bg-white dark:data-[state=active]:bg-slate-950 data-[state=active]:shadow-sm transition-all font-bold text-slate-500 data-[state=active]:text-purple-600 dark:data-[state=active]:text-purple-400">
                        <GraduationCap className="w-4 h-4 text-purple-500" />
                        <span className="hidden sm:inline">Program</span>
                        {majorCols.length > 0 && <Badge className="ml-1 bg-purple-500 px-1.5 h-4 text-[10px] font-black">{majorCols.length}</Badge>}
                      </TabsTrigger>
                      <TabsTrigger value="year" className="flex-1 rounded-none flex items-center justify-center gap-2 px-6 h-full data-[state=active]:bg-white dark:data-[state=active]:bg-slate-950 data-[state=active]:shadow-sm transition-all font-bold text-slate-500 data-[state=active]:text-amber-600 dark:data-[state=active]:text-amber-400">
                        <CalendarDays className="w-4 h-4 text-amber-500" />
                        <span className="hidden sm:inline">Year</span>
                        {yearCols.length > 0 && <Badge className="ml-1 bg-amber-500 px-1.5 h-4 text-[10px] font-black">{yearCols.length}</Badge>}
                      </TabsTrigger>
                    </TabsList>

                    <div className="bg-white/40 dark:bg-slate-900/40 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 min-h-[450px]">
                      <TabsContent value="location" className="mt-0"><ColumnSelector allHeaders={headers} title="Campus Location" description="Which column contains the campus or city?" icon={MapPin} selected={locationCols} setSelected={setLocationCols} /></TabsContent>
                      <TabsContent value="faculty" className="mt-0"><ColumnSelector allHeaders={headers} title="Faculty / School" description="Which column contains the faculty name?" icon={Building2} selected={facultyCols} setSelected={setFacultyCols} /></TabsContent>
                      <TabsContent value="major" className="mt-0"><ColumnSelector allHeaders={headers} title="Study Program" description="Which column contains the major or prodi?" icon={GraduationCap} selected={majorCols} setSelected={setMajorCols} /></TabsContent>
                      <TabsContent value="year" className="mt-0"><ColumnSelector allHeaders={headers} title="Entry Year" description="Which column contains the enrollment year?" icon={CalendarDays} selected={yearCols} setSelected={setYearCols} /></TabsContent>
                    </div>
                  </Tabs>

                  <div className="flex justify-between mt-10 border-t border-slate-100 dark:border-slate-800 pt-8">
                    <Button variant="outline" size="lg" onClick={() => setStep(1)} className="px-8 border-slate-300 dark:border-slate-700">
                      <ArrowLeft className="w-4 h-4 mr-2" />
                      Back to Start
                    </Button>
                    <Button
                      size="lg"
                      onClick={() => setStep(3)}
                      className="px-10 bg-blue-600 hover:bg-blue-700 shadow-xl shadow-blue-500/20"
                    >
                      Next: Column Studio
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* STEP 3: COLUMN STUDIO */}
            {step === 3 && (
              <div className="space-y-6">
                <Card className="bg-slate-900 dark:bg-slate-950 border-slate-800 overflow-hidden shadow-2xl">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl -mr-16 -mt-16" />
                  <CardHeader className="pb-4 relative z-10">
                    <CardTitle className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-blue-500" />
                      Locked Identity Columns
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-wrap gap-2 pb-6 relative z-10">
                    {headers.filter(isIdentity).map(h => (
                      <Badge key={h} className="text-[10px] font-bold py-1.5 px-3 bg-white/5 border-white/10 text-white backdrop-blur-md">
                        {h}
                      </Badge>
                    ))}
                    {headers.filter(isIdentity).length === 0 && <span className="text-slate-500 text-xs italic">No identity columns defined.</span>}
                  </CardContent>
                </Card>

                <Card className="border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm">
                  <div className="h-1.5 bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600" />
                  <CardHeader className="border-b border-slate-100 dark:border-slate-800 bg-white/30 dark:bg-slate-900/30">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                      <div>
                        <CardTitle className="text-2xl font-bold flex items-center gap-2">
                          <Layers className="w-6 h-6 text-indigo-600" />
                          Column Studio
                        </CardTitle>
                        <CardDescription>Assign how each column should be processed and which unit it belongs to.</CardDescription>
                      </div>
                      <div className="flex gap-3">
                        <div className="relative group">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                          <Input
                            placeholder="Filter headers..."
                            className="pl-10 h-10 w-[200px] md:w-[250px] bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                            value={filterText}
                            onChange={e => setFilterText(e.target.value)}
                          />
                        </div>
                        <Button
                          variant="secondary"
                          onClick={handleAutoMapColumns}
                          disabled={isAiMapping}
                          className="gap-2 bg-purple-100 text-purple-700 border-purple-200 hover:bg-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800 shadow-sm h-10 px-4 font-bold transition-all hover:scale-105 active:scale-95"
                        >
                          {isAiMapping ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                          <span className="hidden sm:inline">AI Auto-Map All</span>
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="max-h-[800px] overflow-y-auto p-8 space-y-6 custom-scrollbar bg-slate-50/50 dark:bg-slate-950/30">
                      {headers.filter(h => !isIdentity(h) && h.toLowerCase().includes(filterText.toLowerCase())).map(h => {
                        const config = columnConfigs[h] || { type: "IGNORE", unitId: "" };
                        const samples = getSamples(h);

                        return (
                          <Card key={h} className={`group transition-all duration-300 border-0 shadow-sm hover:shadow-md ring-1 ring-slate-200 dark:ring-slate-800 overflow-hidden ${config.type === "SCORE" ? "bg-gradient-to-r from-blue-50 to-white dark:from-blue-950/20 dark:to-slate-900" :
                            config.type === "TEXT" ? "bg-gradient-to-r from-green-50 to-white dark:from-green-950/20 dark:to-slate-900" :
                              config.type === "CATEGORY" ? "bg-gradient-to-r from-purple-50 to-white dark:from-purple-950/20 dark:to-slate-900" :
                                "bg-white dark:bg-slate-900/50 opacity-80"
                            }`}>
                            <div className={`h-full w-1 absolute left-0 top-0 transition-colors duration-500 ${config.type === "SCORE" ? "bg-blue-500" :
                              config.type === "TEXT" ? "bg-green-500" :
                                config.type === "CATEGORY" ? "bg-purple-500" :
                                  "bg-slate-300 dark:bg-slate-700"
                              }`} />

                            <CardContent className="p-6">
                              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                                {/* Column Name & Preview */}
                                <div className="lg:col-span-4 space-y-4">
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="space-y-1">
                                      <h4 className="font-bold text-slate-800 dark:text-slate-100 break-words line-clamp-2 leading-tight" title={h}>{h}</h4>
                                      <p className="text-[10px] text-slate-400 font-medium uppercase tracking-[0.1em]">Input Feature Column</p>
                                    </div>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => setPreviewHeader(h)}
                                      className="h-8 w-8 hover:bg-white dark:hover:bg-slate-800 text-slate-400 hover:text-blue-500 transition-colors"
                                    >
                                      <Eye className="w-4 h-4" />
                                    </Button>
                                  </div>
                                  <div className="flex flex-wrap gap-1.5 pt-2 border-t border-slate-100 dark:border-slate-800/50">
                                    {samples.map((s, idx) => (
                                      <Badge key={idx} variant="outline" className="text-[9px] font-medium bg-white/50 dark:bg-slate-950/50 border-slate-100 dark:border-slate-800 px-2 py-0.5 truncate max-w-[120px]">
                                        {s}
                                      </Badge>
                                    ))}
                                    {samples.length === 0 && <span className="text-[10px] italic text-slate-400">No data found</span>}
                                  </div>
                                </div>

                                {/* Controls */}
                                <div className="lg:col-span-8">
                                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                                    {/* Unit Selector */}
                                    <div className="space-y-2">
                                      <label className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 tracking-wider flex items-center gap-1.5">
                                        <Building2 className="w-3 h-3 text-blue-500" /> assigned unit
                                      </label>
                                      <Select value={config.unitId} onValueChange={(val) => updateConfig(h, 'unitId', val)}>
                                        <SelectTrigger className="h-10 bg-white dark:bg-slate-950 shadow-sm border-slate-200 dark:border-slate-800 rounded-lg font-semibold text-slate-700 dark:text-slate-300">
                                          <SelectValue placeholder="Target Dept..." />
                                        </SelectTrigger>
                                        <SelectContent className="max-h-[300px]">
                                          {units.map(u => <SelectItem key={u.id} value={u.id.toString()}>{u.name}</SelectItem>)}
                                        </SelectContent>
                                      </Select>
                                    </div>

                                    {/* Type Selector */}
                                    <div className="space-y-2">
                                      <label className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 tracking-wider flex items-center gap-1.5">
                                        <BarChart3 className="w-3 h-3 text-green-500" /> processing type
                                      </label>
                                      <Select value={config.type} onValueChange={(val) => updateConfig(h, 'type', val)}>
                                        <SelectTrigger className="h-10 bg-white dark:bg-slate-950 shadow-sm border-slate-200 dark:border-slate-800 rounded-lg font-semibold text-slate-700 dark:text-slate-300">
                                          <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="SCORE">Quantitative (Score)</SelectItem>
                                          <SelectItem value="TEXT">Qualitative (Text AI)</SelectItem>
                                          <SelectItem value="CATEGORY">Category (Filter)</SelectItem>
                                          <Separator className="my-1 opacity-50" />
                                          <SelectItem value="IGNORE">Ignore Column</SelectItem>
                                        </SelectContent>
                                      </Select>
                                    </div>

                                    {/* Rule / Transformation */}
                                    <div className="space-y-2">
                                      {config.type === "SCORE" ? (
                                        <>
                                          <label className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 tracking-wider flex items-center gap-1.5">
                                            <Tag className="w-3 h-3 text-purple-500" /> scoring rule
                                          </label>
                                          <Select value={config.rule || "NUMBER"} onValueChange={(val) => updateConfig(h, 'rule', val)}>
                                            <SelectTrigger className="h-10 bg-white dark:bg-slate-950 shadow-sm border-slate-200 dark:border-slate-800 rounded-lg font-black text-blue-600 dark:text-blue-400">
                                              <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                              <SelectItem value="LIKERT">Likert Scale (1-4)</SelectItem>
                                              <SelectItem value="BOOLEAN">Boolean (Yes/No)</SelectItem>
                                              <SelectItem value="NUMBER">Raw Numerical</SelectItem>
                                              <SelectItem value="TEXT_SCALE">Auto Text Scale</SelectItem>
                                              <SelectItem value="CUSTOM_MAPPING">Custom Advanced Mapping</SelectItem>
                                            </SelectContent>
                                          </Select>
                                        </>
                                      ) : config.type === "TEXT" ? (
                                        <div className="h-10 flex items-center gap-2 text-[10px] mt-6 font-black text-green-700 dark:text-green-400 bg-green-100/50 dark:bg-green-950/30 px-3 rounded-lg border border-green-200/50 dark:border-green-800/50 uppercase tracking-tighter">
                                          <Sparkles className="w-3.5 h-3.5 animate-pulse" /> Analysis Layer Active
                                        </div>
                                      ) : config.type === "CATEGORY" ? (
                                        <div className="h-10 flex items-center gap-2 text-[10px] mt-6 font-black text-purple-700 dark:text-purple-400 bg-purple-100/50 dark:bg-purple-950/30 px-3 rounded-lg border border-purple-200/50 dark:border-purple-800/50 uppercase tracking-tighter">
                                          <Tag className="w-3.5 h-3.5" /> Filtering Token
                                        </div>
                                      ) : (
                                        <div className="h-10 flex items-center gap-2 text-[10px] mt-6 font-black text-slate-400 bg-slate-100/50 dark:bg-slate-800/30 px-3 rounded-lg border border-slate-200 dark:border-slate-800/50 uppercase tracking-tighter">
                                          Skipped during import
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>

                              {/* Mapping Translation Section */}
                              {config.type === "SCORE" && (config.rule === "CUSTOM_MAPPING" || config.rule === "LIKERT" || config.rule === "BOOLEAN") && (
                                <motion.div
                                  initial={{ opacity: 0, y: 10 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-800"
                                >
                                  <div className="flex items-center justify-between mb-4">
                                    <div className="flex items-center gap-2">
                                      <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                                        <List className="w-4 h-4 text-blue-600" />
                                      </div>
                                      <div>
                                        <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100 tracking-tight transition-colors">Data Translation Layer</h4>
                                        <p className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">Verifying weighting for discovered answer levels</p>
                                      </div>
                                    </div>
                                    <Badge variant="secondary" className="bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 text-[10px] font-black uppercase tracking-widest px-2 py-1 border border-blue-200 dark:border-blue-800">
                                      {config.rule === "CUSTOM_MAPPING" ? "Advanced Config" : "Auto-Generated Mapping"}
                                    </Badge>
                                  </div>

                                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                    {getUniqueValuesForHeader(h)
                                      .sort((a, b) => {
                                        const scoreA = config.customMapping?.[a];
                                        const scoreB = config.customMapping?.[b];
                                        const getWeight = (s: number | null | undefined) => {
                                          if (s === null) return -1;
                                          if (s === undefined) return -2;
                                          return s;
                                        };
                                        return getWeight(scoreB) - getWeight(scoreA);
                                      })
                                      .map((val) => (
                                        <div key={val} className="group/item flex flex-col gap-1.5 p-3 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl hover:shadow-md transition-all duration-200">
                                          <span className="text-[11px] font-black text-slate-500 dark:text-slate-400 uppercase truncate px-1" title={val || "(empty)"}>
                                            {val || "(empty)"}
                                          </span>
                                          <Select
                                            value={config.customMapping?.[val] !== undefined ? (config.customMapping[val] === null ? "NA" : config.customMapping[val]?.toString()) : "NA"}
                                            onValueChange={selectedVal => handleUpdateCustomMapping(h, val, selectedVal === "NA" ? null : parseInt(selectedVal))}
                                          >
                                            <SelectTrigger className="h-9 bg-slate-50/50 dark:bg-slate-900 border-0 ring-1 ring-slate-200 dark:ring-slate-800 text-xs font-black text-blue-700 dark:text-blue-400 focus:ring-blue-500/50">
                                              <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                              <SelectItem value="4" className="text-sm font-bold border-l-4 border-l-blue-600">4</SelectItem>
                                              <SelectItem value="3" className="text-sm font-semibold border-l-4 border-l-blue-400">3</SelectItem>
                                              <SelectItem value="2" className="text-sm font-medium border-l-4 border-l-amber-400">2</SelectItem>
                                              <SelectItem value="1" className="text-sm border-l-4 border-l-red-400">1</SelectItem>
                                              <SelectItem value="0" className="text-sm border-l-4 border-l-slate-400">0</SelectItem>
                                              <Separator className="my-1" />
                                              <SelectItem value="NA" className="text-sm font-bold border-l-4 border-l-slate-300 dark:border-l-slate-700">NA</SelectItem>
                                            </SelectContent>
                                          </Select>
                                        </div>
                                      ))}
                                    {getUniqueValuesForHeader(h).length === 0 && (
                                      <p className="text-xs text-slate-400 italic py-4">Scanning CSV for answer levels...</p>
                                    )}
                                  </div>
                                </motion.div>
                              )}
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>

                    <div className="flex justify-between items-center p-8 border-t border-slate-100 dark:border-slate-800 bg-white/30 dark:bg-slate-900/30">
                      <Button variant="outline" size="lg" onClick={() => setStep(2)} className="px-8 border-slate-200 dark:border-slate-800 shadow-sm transition-all hover:bg-slate-50">
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        Revisit Identities
                      </Button>
                      <Button
                        size="lg"
                        onClick={() => setStep(4)}
                        className="px-10 bg-indigo-600 hover:bg-indigo-700 shadow-xl shadow-indigo-500/20 transition-all hover:scale-105 active:scale-95"
                      >
                        Proceed to Validation
                        <ArrowRight className="w-4 h-4 ml-2" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {/* SMART PREVIEW DIALOG (Redesigning for better clarity) */}
                <Dialog open={!!previewHeader} onOpenChange={() => setPreviewHeader(null)}>
                  <DialogContent className="max-w-4xl bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 p-0 overflow-hidden shadow-2xl">
                    <div className="h-2 bg-blue-600 w-full" />
                    <DialogHeader className="p-6 border-b border-slate-100 dark:border-slate-800">
                      <div className="flex items-center gap-3 mb-1">
                        <div className="p-2 bg-blue-500/10 rounded-lg">
                          <Eye className="w-5 h-5 text-blue-600" />
                        </div>
                        <DialogTitle className="text-xl font-bold tracking-tight">Dataset Deep Dive</DialogTitle>
                      </div>
                      <DialogDescription className="font-medium text-slate-500 truncate mr-8">
                        Scanning raw data for column: <span className="text-slate-900 dark:text-slate-100 font-bold">{previewHeader}</span>
                      </DialogDescription>
                    </DialogHeader>

                    <div className="p-8 space-y-8">
                      <div className="grid grid-cols-2 gap-6">
                        <div className="p-6 rounded-3xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 flex flex-col items-center justify-center text-center">
                          <span className="text-4xl font-black text-slate-800 dark:text-slate-100 tracking-tighter">{previewStats?.totalValid}</span>
                          <span className="text-[10px] uppercase font-black text-slate-400 tracking-widest mt-1">Valid Records Found</span>
                        </div>
                        <div className="p-6 rounded-3xl bg-blue-50/50 dark:bg-blue-900/20 border border-blue-100/50 dark:border-blue-900/50 flex flex-col items-center justify-center text-center ring-1 ring-blue-500/10">
                          <span className="text-4xl font-black text-blue-600 dark:text-blue-400 tracking-tighter">{previewStats?.uniqueCount}</span>
                          <span className="text-[10px] uppercase font-black text-blue-400 tracking-widest mt-1">Distinct Variations</span>
                        </div>
                      </div>

                      {previewStats?.isCategorical ? (
                        <div className="space-y-4">
                          <div className="flex items-center justify-between px-2">
                            <h5 className="text-sm font-black text-slate-700 dark:text-slate-300 uppercase tracking-wide">Discovered Levels</h5>
                            {previewHeader && columnConfigs[previewHeader]?.type === "SCORE" && columnConfigs[previewHeader]?.rule !== "CUSTOM_MAPPING" && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => updateConfig(previewHeader, 'rule', 'CUSTOM_MAPPING')}
                                className="h-7 text-xs font-bold text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                              >
                                <Sparkles className="w-3.5 h-3.5 mr-1" /> Enhance with Custom Mapping
                              </Button>
                            )}
                          </div>

                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 max-h-[450px] overflow-y-auto p-3 bg-slate-100/50 dark:bg-slate-950/50 rounded-2xl border border-slate-200 dark:border-slate-800 custom-scrollbar">
                            {previewStats?.uniqueValues.map((v, i) => (
                              <div key={i} className="flex items-center justify-center p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm text-xs font-bold text-slate-700 dark:text-slate-300 hover:border-blue-300 transition-colors">
                                {v || <span className="text-slate-400 italic">(Empty Entry)</span>}
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <h5 className="text-sm font-black text-slate-700 dark:text-slate-300 uppercase tracking-wide px-2">Data Sample (First 20 Unique Rows)</h5>
                          <div className="bg-slate-50 dark:bg-slate-800/50 p-6 rounded-2xl border border-slate-100 dark:border-slate-800 space-y-3 max-h-[500px] overflow-y-auto custom-scrollbar shadow-inner">
                            {previewStats?.samples.map((val, i) => (
                              <div key={i} className="relative pl-6 py-2 last:border-0 border-b border-slate-200 dark:border-slate-800/50">
                                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-slate-200 dark:bg-slate-700" />
                                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 leading-relaxed italic line-clamp-3">"{val}"</p>
                              </div>
                            ))}
                            {previewStats?.samples.length === 0 && <p className="text-slate-400 text-xs text-center py-10 italic">No samples available</p>}
                          </div>
                        </div>
                      )}

                      <div className="pt-2">
                        <Button onClick={() => setPreviewHeader(null)} className="w-full h-14 rounded-2xl bg-slate-900 dark:bg-slate-100 dark:text-slate-900 font-black tracking-[0.2em] uppercase text-xs shadow-xl shadow-slate-900/10">
                          Close Deep Dive
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            )}

            {/* STEP 4: VALIDATION */}
            {step === 4 && (
              <div className="space-y-8 animate-in zoom-in-95 duration-500">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <Card className="bg-blue-600 text-white shadow-xl shadow-blue-500/20 border-0 overflow-hidden relative">
                    <div className="absolute top-0 right-0 p-4 opacity-10"><FileSpreadsheet className="w-24 h-24" /></div>
                    <CardContent className="p-8 space-y-2 relative z-10">
                      <p className="text-blue-100 text-xs font-black uppercase tracking-widest">Total Records</p>
                      <h3 className="text-4xl font-black">{csvData.length} <span className="text-lg font-medium opacity-80 italic">Rows</span></h3>
                      <p className="text-sm text-blue-100/80 font-bold">across {headers.length} raw columns</p>
                    </CardContent>
                  </Card>

                  <Card className="bg-slate-900 text-white shadow-xl border-0 overflow-hidden relative">
                    <div className="absolute top-0 right-0 p-4 opacity-10"><Layers className="w-24 h-24 text-indigo-400" /></div>
                    <CardContent className="p-8 space-y-2 relative z-10">
                      <p className="text-slate-400 text-xs font-black uppercase tracking-widest">Processing Layer</p>
                      <h3 className="text-4xl font-black">{Object.values(columnConfigs).filter(c => c.type !== 'IGNORE').length} <span className="text-lg font-medium opacity-80 italic">Selected</span></h3>
                      <p className="text-sm text-slate-400 font-bold">mapped to telemetry types</p>
                    </CardContent>
                  </Card>

                  <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden relative">
                    <div className="absolute top-0 right-0 p-4 opacity-5"><Building2 className="w-24 h-24 text-slate-400" /></div>
                    <CardContent className="p-8 space-y-2 relative z-10">
                      <p className="text-slate-500 text-xs font-black uppercase tracking-widest">Organization Scope</p>
                      <h3 className="text-4xl font-black text-slate-900 dark:text-slate-100">
                        {new Set(Object.values(columnConfigs).filter(c => c.unitId).map(c => c.unitId)).size}
                        <span className="text-lg font-medium opacity-80 italic ml-2 text-slate-500">Units</span>
                      </h3>
                      <p className="text-sm text-slate-500 font-bold">receiving fresh data flow</p>
                    </CardContent>
                  </Card>
                </div>

                <Card className="border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm">
                  <div className="h-1.5 bg-gradient-to-r from-green-600 to-emerald-600" />
                  <CardHeader className="border-b border-slate-100 dark:border-slate-800 bg-white/30 dark:bg-slate-900/30">
                    <CardTitle className="text-2xl font-bold flex items-center gap-2">
                      <ShieldCheck className="w-6 h-6 text-green-600" />
                      Final Data Validation
                    </CardTitle>
                    <CardDescription>Review the department breakdown below before starting the import process.</CardDescription>
                  </CardHeader>
                  <CardContent className="p-8 space-y-8">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {units.map(u => {
                        const textCols = Object.entries(columnConfigs).filter(([h, c]) => c.unitId === u.id.toString() && c.type === "TEXT");
                        const scoreCols = Object.entries(columnConfigs).filter(([h, c]) => c.unitId === u.id.toString() && c.type === "SCORE");
                        const catCols = Object.entries(columnConfigs).filter(([h, c]) => c.unitId === u.id.toString() && c.type === "CATEGORY");

                        if (textCols.length === 0 && scoreCols.length === 0 && catCols.length === 0) return null;

                        return (
                          <div key={u.id} className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/40 dark:bg-slate-950/40 hover:bg-white dark:hover:bg-slate-950 transition-all group">
                            <h4 className="font-black text-slate-800 dark:text-slate-100 flex items-center justify-between mb-4 truncate pr-2">
                              {u.name}
                              <Building2 className="w-4 h-4 text-slate-300 group-hover:text-blue-500 transition-colors" />
                            </h4>
                            <div className="space-y-2">
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-blue-600 dark:text-blue-400 font-bold uppercase tracking-tighter flex items-center gap-1.5">
                                  <div className="w-1.5 h-1.5 bg-blue-500 rounded-full" /> {scoreCols.length} Scores
                                </span>
                                <span className="text-green-600 dark:text-green-400 font-bold uppercase tracking-tighter flex items-center gap-1.5">
                                  <div className="w-1.5 h-1.5 bg-green-500 rounded-full" /> {textCols.length} Comments
                                </span>
                              </div>
                              <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-100 dark:border-slate-800/50">
                                <span className="text-purple-600 dark:text-purple-400 font-bold uppercase tracking-tighter flex items-center gap-1.5">
                                  <div className="w-1.5 h-1.5 bg-purple-500 rounded-full" /> {catCols.length} Categories
                                </span>
                                {textCols.length === 0 && (
                                  <span className="text-amber-500 text-[9px] font-bold flex items-center gap-1">
                                    <AlertTriangle className="w-3 h-3" /> NO TEXT
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="bg-blue-50/50 dark:bg-blue-900/10 p-6 rounded-2xl border border-blue-100 dark:border-blue-900 flex items-start gap-4">
                      <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
                        <Info className="w-6 h-6 text-blue-600" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-bold text-blue-900 dark:text-blue-300 uppercase tracking-wide">Ready for Deployment</p>
                        <p className="text-sm text-blue-700 dark:text-blue-400">By finalizing, you will create a new survey "<span className="font-black italic">{surveyTitle}</span>" and ingest {csvData.length} response rows. This action correctly maps all student identity columns.</p>
                      </div>
                    </div>

                    {isProcessing ? (
                      <div className="py-10 space-y-6 border-t border-slate-100 dark:border-slate-800">
                        <div className="flex justify-between items-center px-2">
                          <div className="flex items-center gap-3">
                            <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
                            <span className="text-lg font-bold text-slate-800 dark:text-slate-100 tracking-tight">{statusMessage}</span>
                          </div>
                          <span className="text-sm font-black text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/40 px-3 py-1 rounded-full border border-blue-100 dark:border-blue-800">{progress}%</span>
                        </div>
                        <Progress value={progress} className="h-4 bg-slate-100 dark:bg-slate-800 overflow-hidden rounded-full ring-1 ring-slate-200 dark:ring-slate-800" />
                      </div>
                    ) : (
                      <div className="flex flex-col sm:flex-row justify-between items-center gap-6 pt-6 border-t border-slate-100 dark:border-slate-800">
                        <Button variant="outline" size="lg" onClick={() => setStep(3)} className="w-full sm:w-auto px-8 border-slate-300 dark:border-slate-700 font-bold">
                          <ArrowLeft className="w-4 h-4 mr-2" />
                          Back to Config
                        </Button>
                        <Button
                          size="lg"
                          onClick={handleStartImport}
                          className="w-full sm:w-auto px-16 py-8 text-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-2xl shadow-blue-500/40 group relative overflow-hidden h-auto"
                        >
                          <div className="absolute inset-0 bg-white/10 translate-y-full hover:translate-y-0 transition-transform duration-300" />
                          <span className="flex items-center gap-3">
                            <Save className="w-6 h-6 group-hover:scale-110 transition-transform" />
                            Verify & Finalize Import
                          </span>
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </PageShell>
  );
}