"use client";

import { useState, useEffect, useMemo } from "react";
import Papa from "papaparse";
import { Upload, CheckCircle, Search, ArrowRight, MapPin, Building2, GraduationCap, Filter, Loader2, Save, CalendarDays, Eye, AlertTriangle, ArrowLeft, Sparkles, User, Info, BarChart3, List, Tag } from "lucide-react";
import { toast } from "sonner";
import { PageShell, PageHeader } from "@/components/layout/PageShell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/lib/supabase";
import { Badge } from "@/components/ui/badge";

type Unit = { id: number; name: string; description?: string };
type ColumnConfig = {
  unitId: string;
  type: "TEXT" | "SCORE" | "CATEGORY" | "IGNORE"; // New Types
  rule?: "LIKERT" | "BOOLEAN" | "NUMBER" | "TEXT_SCALE";
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
    <div className="space-y-4 animate-in fade-in">
      <div className="flex items-center gap-2 mb-2">
        <div className="p-2 bg-blue-50 rounded-md"><Icon className="w-5 h-5 text-blue-600" /></div>
        <div><h3 className="font-semibold text-slate-800">{title}</h3><p className="text-sm text-slate-500">{description}</p></div>
      </div>
      <div className="flex gap-2">
        <div className="relative flex-1"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><Input placeholder={`Search columns...`} className="pl-9" value={localSearch} onChange={(e) => setLocalSearch(e.target.value)} /></div>
        <Button variant={showSelectedOnly ? "default" : "outline"} onClick={() => setShowSelectedOnly(!showSelectedOnly)} className="gap-2"><Filter className="w-4 h-4" /> {showSelectedOnly ? "Show All" : "Selected Only"}</Button>
      </div>
      <div className="h-[300px] overflow-y-auto border rounded-md p-3 bg-slate-50 grid grid-cols-2 gap-2 content-start">
        {filteredHeaders.map(h => (
          <div key={h} onClick={() => toggleItem(h)} className={`cursor-pointer p-2 rounded border text-sm flex items-center gap-2 select-none transition-all h-fit ${selected.includes(h) ? "bg-blue-50 border-blue-500 ring-1 ring-blue-500 shadow-sm" : "bg-white hover:border-blue-300"}`}>
            <div className={`shrink-0 w-4 h-4 rounded border flex items-center justify-center ${selected.includes(h) ? "bg-blue-500 border-blue-500" : "border-slate-300 bg-white"}`}>{selected.includes(h) && <CheckCircle className="w-3 h-3 text-white" />}</div>
            <span className="truncate text-slate-700 font-medium" title={h}>{h}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ImportPage() {
  const [step, setStep] = useState(1);
  const [headers, setHeaders] = useState<string[]>([]);
  const [csvData, setCsvData] = useState<any[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [surveyTitle, setSurveyTitle] = useState("");

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
        samples[h] = csvData.map(row => row[h]).filter(v => v).slice(0, 4);
      });

      const response = await fetch('/api/ai/map-columns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ headers: headersToMap, samples, units })
      });

      const data = await response.json();
      if (data.mappings) {
        const newConfigs = { ...columnConfigs };
        Object.entries(data.mappings).forEach(([header, config]: [string, any]) => {
          newConfigs[header] = {
            unitId: config.unit_id,
            type: config.type, // SCORE, TEXT, CATEGORY
            rule: config.rule
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

  // --- 4. IMPORT EXECUTION (UPDATED) ---
  const handleStartImport = async () => {
    setIsProcessing(true);
    try {
      const { data: survey, error: surveyError } = await supabase.from('surveys').insert({ title: surveyTitle }).select().single();
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
              numerical_score: null
            };

            // --- TRANSFORMATIONS ---
            if (config.type === "SCORE") {
              if (config.rule === "LIKERT") {
                // Extract "4" from "4 = Puas"
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
                // Custom Scale for Frequency/Agreement
                // 4-point text scale mapping
                const lower = rawValue.toLowerCase();
                if (lower.includes("tidak pernah") || lower.includes("sangat tidak") || lower.includes("never")) payload.numerical_score = 1;
                else if (lower.includes("jarang") || lower.includes("tidak setuju") || lower.includes("kurang") || lower.includes("rarely")) payload.numerical_score = 2;
                else if (lower.includes("sering") || lower.includes("setuju") || lower.includes("puas") || lower.includes("often") || lower.includes("kadang") || lower.includes("netral") || lower.includes("cukup") || lower.includes("ragu")) payload.numerical_score = 3;
                else if (lower.includes("selalu") || lower.includes("sangat") || lower.includes("lebih dari") || lower.includes("always")) payload.numerical_score = 4;
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
      setTimeout(() => window.location.href = "/dashboard", 1000);
    } catch (e: any) { toast.error(e.message); setIsProcessing(false); }
  };

  const isIdentity = (h: string) => locationCols.includes(h) || facultyCols.includes(h) || majorCols.includes(h) || yearCols.includes(h);

  return (
    <PageShell>
      <PageHeader
        title="Import Wizard"
        description={`Step ${step}: ${step === 1 ? "Upload" : step === 2 ? "Identity" : step === 3 ? "Column Studio" : "Validation"}`}
        backHref="/dashboard"
        backLabel="Dashboard"
        actions={
          <div className="flex gap-2">{[1, 2, 3, 4].map(s => <div key={s} className={`w-3 h-3 rounded-full transition-colors ${step >= s ? "bg-blue-400 shadow-sm shadow-blue-400/50" : "bg-white/20"}`} />)}</div>
        }
      />

      <div className="max-w-7xl mx-auto px-8 py-10 space-y-8">

        {/* STEP 1: UPLOAD */}
        {step === 1 && (
          <Card>
            <CardHeader><CardTitle>Survey Details</CardTitle><CardDescription>Name your survey and upload the raw CSV.</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              <Input value={surveyTitle} onChange={e => setSurveyTitle(e.target.value)} placeholder="e.g. Survey Kepuasan 2025" className="text-lg py-6" />
              <Card className="border-dashed border-2 bg-slate-50/50"><CardContent className="flex flex-col items-center justify-center py-20 space-y-6">{csvData.length > 0 ? (<div className="text-center space-y-4"><div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center"><CheckCircle className="w-8 h-8 text-green-600" /></div><div><h3 className="text-xl font-bold">CSV Ready!</h3><p className="text-slate-500">{csvData.length} rows found.</p></div></div>) : (<><Upload className="w-12 h-12 text-slate-300" /><div className="text-center space-y-2"><h3 className="text-xl font-semibold">Upload Survey CSV</h3><input type="file" accept=".csv" onChange={handleFileUpload} className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 cursor-pointer max-w-xs mx-auto" /></div></>)}</CardContent></Card>
              <div className="flex justify-end"><Button size="lg" disabled={!surveyTitle || csvData.length === 0} onClick={() => setStep(2)}>Next: Define Identity <ArrowRight className="w-4 h-4 ml-2" /></Button></div>
            </CardContent>
          </Card>
        )}

        {/* STEP 2: IDENTITY */}
        {step === 2 && (
          <Card>
            <CardHeader><div className="flex justify-between items-center"><div><CardTitle>Define Student Identity</CardTitle><CardDescription>Identify the columns for Location, Faculty, Major, and Entry Year.</CardDescription></div><Button variant="secondary" className="gap-2 bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100" onClick={handleAutoIdentityMap} disabled={isAiMapping}>{isAiMapping ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} AI Auto-Detect</Button></div></CardHeader>
            <CardContent>
              <Tabs defaultValue="location" className="w-full">
                <TabsList className="grid w-full grid-cols-4 mb-6"><TabsTrigger value="location">Location {locationCols.length > 0 && `(${locationCols.length})`}</TabsTrigger><TabsTrigger value="faculty">Faculty {facultyCols.length > 0 && `(${facultyCols.length})`}</TabsTrigger><TabsTrigger value="major">Major {majorCols.length > 0 && `(${majorCols.length})`}</TabsTrigger><TabsTrigger value="year">Entry Year {yearCols.length > 0 && `(${yearCols.length})`}</TabsTrigger></TabsList>
                <TabsContent value="location"><ColumnSelector allHeaders={headers} title="Location Columns" description="Select columns indicating Campus." icon={MapPin} selected={locationCols} setSelected={setLocationCols} /></TabsContent>
                <TabsContent value="faculty"><ColumnSelector allHeaders={headers} title="Faculty Columns" description="Select columns indicating Faculty Name." icon={Building2} selected={facultyCols} setSelected={setFacultyCols} /></TabsContent>
                <TabsContent value="major"><ColumnSelector allHeaders={headers} title="Study Program Columns" description="Select columns indicating Major/Prodi." icon={GraduationCap} selected={majorCols} setSelected={setMajorCols} /></TabsContent>
                <TabsContent value="year"><ColumnSelector allHeaders={headers} title="Entry Year Columns" description="Select columns indicating Tahun Masuk/Batch." icon={CalendarDays} selected={yearCols} setSelected={setYearCols} /></TabsContent>
              </Tabs>
              <div className="flex justify-between mt-6 border-t pt-4"><Button variant="outline" onClick={() => setStep(1)}><ArrowLeft className="w-4 h-4 mr-2" /> Back</Button><Button onClick={() => setStep(3)} className="bg-blue-600 hover:bg-blue-700">Next: Column Studio <ArrowRight className="w-4 h-4 ml-2" /></Button></div>
            </CardContent>
          </Card>
        )}

        {/* STEP 3: COLUMN STUDIO */}
        {step === 3 && (
          <div className="space-y-4">
            <Card className="bg-slate-50 border-slate-200"><CardHeader className="pb-2"><CardTitle className="text-sm font-bold text-slate-500 uppercase tracking-wide flex items-center gap-2"><User className="w-4 h-4" /> Student Identity Columns (Mapped)</CardTitle></CardHeader><CardContent className="flex flex-wrap gap-2">{headers.filter(isIdentity).map(h => (<Badge key={h} variant="secondary" className="text-slate-600 bg-white border-slate-300">{h}</Badge>))}</CardContent></Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between"><div><CardTitle>Column Studio</CardTitle><CardDescription>Assign types: <b>Text</b> (Open Comments), <b>Score</b> (Quantitative), or <b>Category</b> (Filters).</CardDescription></div><div className="flex gap-2"><Button variant="secondary" onClick={handleAutoMapColumns} disabled={isAiMapping} className="gap-2 bg-purple-100 text-purple-700 hover:bg-purple-200">{isAiMapping ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} AI Auto-Detect</Button></div></CardHeader>
              <CardContent>
                <div className="flex gap-2 mb-4"><Search className="w-4 h-4 text-slate-400 mt-3 absolute ml-3" /><Input placeholder="Filter headers..." className="pl-9" value={filterText} onChange={e => setFilterText(e.target.value)} /></div>
                <div className="border rounded-md overflow-hidden bg-white shadow-sm h-[600px] overflow-y-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-slate-100 text-slate-600 font-semibold border-b sticky top-0 z-10 shadow-sm">
                      <tr><th className="p-3 w-10">View</th><th className="p-3">CSV Header</th><th className="p-3 w-64">Assigned Unit</th><th className="p-3 w-40">Data Type</th><th className="p-3 w-48">Transformation</th></tr>
                    </thead>
                    <tbody className="divide-y">
                      {headers.filter(h => !isIdentity(h) && h.toLowerCase().includes(filterText.toLowerCase())).map(h => {
                        const config = columnConfigs[h] || { type: "IGNORE", unitId: "" };
                        return (
                          <tr key={h} className={`hover:bg-slate-50 transition-colors ${config.type === "IGNORE" ? "opacity-60 bg-slate-50/50" : "bg-white"}`}>
                            <td className="p-3 text-center"><Button variant="ghost" size="icon" onClick={() => setPreviewHeader(h)} title="Click to see entries"><Eye className="w-4 h-4 text-blue-500" /></Button></td>
                            <td className="p-3 font-medium text-slate-700 max-w-md cursor-pointer hover:text-blue-600" onClick={() => setPreviewHeader(h)}><div className="line-clamp-2" title={h}>{h}</div></td>
                            <td className="p-3"><Select value={config.unitId} onValueChange={(val) => updateConfig(h, 'unitId', val)}><SelectTrigger className="h-9 bg-white"><SelectValue placeholder="Select Unit" /></SelectTrigger><SelectContent>{units.map(u => <SelectItem key={u.id} value={u.id.toString()}>{u.name}</SelectItem>)}</SelectContent></Select></td>
                            <td className="p-3"><Select value={config.type} onValueChange={(val) => updateConfig(h, 'type', val)}><SelectTrigger className={`h-9 ${config.type === "SCORE" ? "text-blue-700 bg-blue-50" : config.type === "TEXT" ? "text-green-700 bg-green-50" : config.type === "CATEGORY" ? "text-purple-700 bg-purple-50" : "bg-white"}`}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="TEXT">Text (Analyze)</SelectItem><SelectItem value="SCORE">Score (Number)</SelectItem><SelectItem value="CATEGORY">Category (Filter)</SelectItem><SelectItem value="IGNORE">Ignore</SelectItem></SelectContent></Select></td>
                            <td className="p-3">{config.type === "SCORE" && (<Select value={config.rule || "NUMBER"} onValueChange={(val) => updateConfig(h, 'rule', val)}><SelectTrigger className="h-9 bg-white"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="LIKERT">Likert (4=Puas)</SelectItem><SelectItem value="BOOLEAN">Yes/No (1/0)</SelectItem><SelectItem value="TEXT_SCALE">Scale (Sering=4)</SelectItem><SelectItem value="NUMBER">Raw Number</SelectItem></SelectContent></Select>)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="flex justify-between mt-6 border-t pt-4"><Button variant="outline" onClick={() => setStep(2)}><ArrowLeft className="w-4 h-4 mr-2" /> Back</Button><Button onClick={() => setStep(4)} className="bg-blue-600 hover:bg-blue-700">Next: Validate <ArrowRight className="w-4 h-4 ml-2" /></Button></div>
              </CardContent>
            </Card>

            {/* SMART PREVIEW DIALOG */}
            <Dialog open={!!previewHeader} onOpenChange={() => setPreviewHeader(null)}>
              <DialogContent className="max-w-xl">
                <DialogHeader><DialogTitle>Data Preview: {previewStats?.isCategorical ? "Categorical Data" : "Text Data"}</DialogTitle><DialogDescription>Column: <span className="font-semibold text-slate-800">{previewHeader}</span></DialogDescription></DialogHeader>
                <div className="space-y-4">
                  <div className="flex gap-4 text-sm"><div className="bg-slate-100 px-3 py-2 rounded">Total Valid Rows: <b>{previewStats?.totalValid}</b></div><div className="bg-blue-50 text-blue-700 px-3 py-2 rounded">Unique Values: <b>{previewStats?.uniqueCount}</b></div></div>
                  {previewStats?.isCategorical ? (
                    <div className="space-y-2">
                      <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Found Distinct Levels:</div>
                      <div className="flex flex-wrap gap-2">{previewStats?.uniqueValues.map(v => <Badge key={v} variant="outline" className="text-sm py-1 px-3 bg-white">{v}</Badge>)}</div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Sample Entries:</div>
                      <div className="bg-slate-50 p-4 rounded-md space-y-2 text-sm text-slate-700 max-h-[300px] overflow-y-auto">{previewStats?.samples.map((val, i) => <div key={i} className="border-b border-slate-200 pb-2 last:border-0">{val}</div>)}</div>
                    </div>
                  )}
                </div>
              </DialogContent>
            </Dialog>
          </div>
        )}

        {/* STEP 4: VALIDATION */}
        {step === 4 && (
          <Card>
            <CardHeader><CardTitle>Final Validation</CardTitle><CardDescription>Review column assignments by Department before importing.</CardDescription></CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {units.map(u => {
                  const textCols = Object.entries(columnConfigs).filter(([h, c]) => c.unitId === u.id.toString() && c.type === "TEXT");
                  const scoreCols = Object.entries(columnConfigs).filter(([h, c]) => c.unitId === u.id.toString() && c.type === "SCORE");
                  const catCols = Object.entries(columnConfigs).filter(([h, c]) => c.unitId === u.id.toString() && c.type === "CATEGORY");

                  if (textCols.length === 0 && scoreCols.length === 0 && catCols.length === 0) return null;

                  return (
                    <div key={u.id} className="border rounded-md p-4 bg-white shadow-sm">
                      <div className="font-bold text-slate-800 mb-2 border-b pb-2">{u.name}</div>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between items-center text-green-700"><span>Open Text (AI)</span><Badge variant="outline" className="bg-green-50 text-green-700">{textCols.length}</Badge></div>
                        <div className="flex justify-between items-center text-blue-700"><span>Scores (Stats)</span><Badge variant="outline" className="bg-blue-50 text-blue-700">{scoreCols.length}</Badge></div>
                        <div className="flex justify-between items-center text-purple-700"><span>Categories (Filter)</span><Badge variant="outline" className="bg-purple-50 text-purple-700">{catCols.length}</Badge></div>
                        {textCols.length === 0 && <div className="text-xs text-amber-500 flex items-center gap-1 mt-2 bg-amber-50 p-1 rounded"><AlertTriangle className="w-3 h-3" /> Warning: No text comments mapped.</div>}
                      </div>
                    </div>
                  )
                })}
              </div>
              {isProcessing ? (<div className="py-8 flex flex-col items-center justify-center space-y-4 border-t mt-4"><div className="flex justify-between w-full max-w-md text-sm font-medium"><span>{statusMessage}</span><span>{progress}%</span></div><Progress value={progress} className="w-full max-w-md h-3" /></div>) : (<div className="flex justify-between mt-8 border-t pt-4"><Button variant="outline" onClick={() => setStep(3)}><ArrowLeft className="w-4 h-4 mr-2" /> Back to Config</Button><Button size="lg" className="bg-green-600 hover:bg-green-700 shadow-lg" onClick={handleStartImport}><Save className="w-4 h-4 mr-2" /> Confirm & Import Data</Button></div>)}
            </CardContent>
          </Card>
        )}
      </div>
    </PageShell>
  );
}