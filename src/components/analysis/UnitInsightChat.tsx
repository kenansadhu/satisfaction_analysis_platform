"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { Card, CardHeader, CardTitle, CardContent, CardFooter, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Loader2, Send, Sparkles, Bot, User, CornerDownRight,
    Download, Trash2, History, Lightbulb, CheckCircle2,
    AlertTriangle, Target, Quote, ChevronDown, ChevronUp,
    RefreshCcw, FileText, AlertCircle, LayoutDashboard, MessageSquare
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { BoxedMessageRenderer } from "./BoxedMessageRenderer";

type Message = {
    id: string;
    role: "user" | "assistant";
    content: string;
};

type ExecutiveReportData = {
    executive_summary: string;
    overall_verdict: "Excellent" | "Good" | "Needs Improvement" | "Critical";
    strengths: { title: string; detail: string; evidence: string }[];
    concerns: { title: string; detail: string; severity: "High" | "Medium" | "Low"; evidence: string }[];
    recommendations: { title: string; action: string; impact: string; priority: "Immediate" | "Short-term" | "Long-term" }[];
    closing_statement: string;
};

export default function UnitInsightChat({ unitId, surveyId, fullPage = false }: { unitId: string; surveyId?: string; fullPage?: boolean }) {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [generatingReport, setGeneratingReport] = useState(false);
    const [report, setReport] = useState<ExecutiveReportData | null>(null);
    const [lastSaved, setLastSaved] = useState<string | null>(null);
    const [reportError, setReportError] = useState<string | null>(null);
    const chatContainerRef = useRef<HTMLDivElement>(null);

    // 1. Fetch persistent history and report on mount
    useEffect(() => {
        const fetchData = async () => {
            const chatReportType = surveyId ? `chat_history_${surveyId}` : 'chat_history';
            const execReportType = surveyId ? `executive_${surveyId}` : 'executive';

            // Fetch Chat History
            const { data: chatData } = await supabase
                .from('unit_ai_reports')
                .select('content')
                .eq('unit_id', unitId)
                .eq('report_type', chatReportType)
                .maybeSingle();

            if (chatData?.content?.messages) {
                setMessages(chatData.content.messages);
            }

            // Fetch Executive Report
            const { data: reportData } = await supabase
                .from('unit_ai_reports')
                .select('content, created_at')
                .eq('unit_id', unitId)
                .eq('report_type', execReportType)
                .maybeSingle();

            if (reportData?.content?.report) {
                setReport(reportData.content.report);
                setLastSaved(new Date(reportData.created_at).toLocaleString());
            }
        };
        fetchData();
    }, [unitId, surveyId]);

    // 2. Auto-scroll to bottom
    useEffect(() => {
        if (chatContainerRef.current) {
            chatContainerRef.current.scrollTo({
                top: chatContainerRef.current.scrollHeight,
                behavior: "smooth"
            });
        }
    }, [messages, isLoading]);

    const handleSend = async () => {
        if (!input.trim()) return;

        const userMsg: Message = { id: Date.now().toString(), role: "user", content: input };
        const newMessages = [...messages, userMsg];
        setMessages(newMessages);
        setInput("");
        setIsLoading(true);

        try {
            const res = await fetch("/api/ai/chat-unit", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    unitId,
                    surveyId,
                    history: messages,
                    prompt: userMsg.content
                }),
            });

            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.error || "Failed to fetch response");
            }

            const data = await res.json();
            const assistantMsg: Message = {
                id: (Date.now() + 1).toString(),
                role: "assistant",
                content: data.reply
            };

            const finalMessages = [...newMessages, assistantMsg];
            setMessages(finalMessages);

            // Save History to DB
            const chatReportType = surveyId ? `chat_history_${surveyId}` : 'chat_history';
            await supabase.from('unit_ai_reports').upsert({
                unit_id: unitId,
                report_type: chatReportType,
                content: { messages: finalMessages, survey_id: surveyId }
            }, { onConflict: 'unit_id,report_type' });

        } catch (error: any) {
            toast.error(error.message || "Failed to connect to AI");
        } finally {
            setIsLoading(false);
        }
    };

    const generateExecutiveReport = async () => {
        setGeneratingReport(true);
        setReportError(null);
        try {
            const res = await fetch('/api/ai/generate-report', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ unitId, surveyId })
            });

            const data = await res.json();
            if (data.report) {
                setReport(data.report as ExecutiveReportData);
                const execReportType = surveyId ? `executive_${surveyId}` : 'executive';
                await supabase.from('unit_ai_reports').upsert(
                    { unit_id: unitId, report_type: execReportType, content: { report: data.report, survey_id: surveyId } },
                    { onConflict: 'unit_id,report_type' }
                );
                setLastSaved(new Date().toLocaleString());
                toast.success("Strategic Synthesis Complete");
            } else {
                throw new Error(data.error || "Generation failed");
            }
        } catch (e: any) {
            const errMsg = e.message || "Failed to generate report";
            toast.error(errMsg);
            setReportError(errMsg);
        } finally {
            setGeneratingReport(false);
        }
    };

    return (
        <Tabs defaultValue="strategy" className="w-full h-full flex flex-col animate-in fade-in duration-700">
            {/* Sub-tab Navigation (Matching Main Page Style) */}
            <div className="flex items-center justify-center mb-8 shrink-0">
                <TabsList className="grid w-full max-w-2xl grid-cols-2 bg-slate-200/50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 p-0 h-12 shadow-sm rounded-xl overflow-hidden print:hidden">
                    <TabsTrigger value="strategy" className="h-full rounded-none gap-2 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-950 data-[state=active]:text-indigo-700 data-[state=active]:shadow-sm">
                        <LayoutDashboard className="w-4 h-4 flex-shrink-0" /> 1. Strategic Analysis
                    </TabsTrigger>
                    <TabsTrigger value="chat" className="h-full rounded-none gap-2 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-950 data-[state=active]:text-pink-600 data-[state=active]:shadow-sm">
                        <MessageSquare className="w-4 h-4 flex-shrink-0" /> 2. Interactive AI Assistant
                    </TabsTrigger>
                </TabsList>
            </div>

            {/* TAB 1: STRATEGIC ANALYSIS (FULL PAGE) */}
            <TabsContent value="strategy" className="flex-1 min-h-0 focus-visible:ring-0">
                <div className="flex gap-6 h-full">
                    {/* Strategy Sidebar */}
                    <div className="w-72 flex flex-col gap-4 shrink-0 print:hidden">
                        <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
                            <CardHeader className="py-4 px-6 bg-slate-50/50 dark:bg-slate-800/20 border-b border-slate-100 dark:border-slate-800">
                                <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 flex items-center gap-2">
                                    <Sparkles className="w-3 h-3 text-indigo-500" /> Synthesis controls
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-6 space-y-4">
                                <Button
                                    onClick={generateExecutiveReport}
                                    disabled={generatingReport}
                                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white shadow-xl shadow-indigo-100 dark:shadow-none gap-2 text-xs h-11 font-bold rounded-xl"
                                >
                                    {generatingReport ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCcw className="w-4 h-4" />}
                                    {report ? "Regenerate Synthesis" : "Generate Initial Synthesis"}
                                </Button>

                                {lastSaved && (
                                    <div className="text-[10px] text-center text-slate-400 font-medium">
                                        Last updated: {lastSaved}
                                    </div>
                                )}

                                <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
                                    <p className="text-[10px] text-slate-400 leading-relaxed italic">
                                        Our AI Specialist will process all qualitative feedback and quantitative metrics to build a comprehensive strategic overview.
                                    </p>
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Strategy Main Content */}
                    <div className="flex-1 min-w-0">
                        {report ? (
                            <div className="relative h-full">
                                {generatingReport && (
                                    <div className="absolute inset-0 z-20 pointer-events-none">
                                        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 animate-pulse" />
                                        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-900/50 rounded-full px-4 py-2 flex items-center gap-2 shadow-lg text-xs font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest whitespace-nowrap">
                                            <Loader2 className="w-3 h-3 animate-spin" /> Regenerating synthesis...
                                        </div>
                                    </div>
                                )}
                                <Card className="h-full border-indigo-200 dark:border-indigo-900/50 bg-white dark:bg-slate-900 shadow-xl overflow-hidden flex flex-col">
                                <div className="h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 shrink-0" />
                                <CardHeader className="py-6 px-10 border-b border-slate-100 dark:border-slate-800 bg-indigo-50/20 dark:bg-indigo-950/20 shrink-0">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <CardTitle className="text-2xl font-black text-slate-800 dark:text-slate-100 tracking-tighter flex items-center gap-3">
                                                <Lightbulb className="w-7 h-7 text-amber-500" /> Executive Analysis Report
                                            </CardTitle>
                                            <CardDescription className="text-xs font-medium text-slate-400 mt-1 uppercase tracking-widest">AI-Generated Insights Summary</CardDescription>
                                        </div>
                                        <Badge className={`px-5 py-2 text-xs font-black uppercase tracking-[0.2em] shadow-lg ${report.overall_verdict === 'Excellent' ? 'bg-emerald-500' : report.overall_verdict === 'Good' ? 'bg-indigo-600' : report.overall_verdict === 'Needs Improvement' ? 'bg-amber-600' : 'bg-red-600'}`}>
                                            Verdict: {report.overall_verdict}
                                        </Badge>
                                    </div>
                                </CardHeader>

                                <CardContent className="p-0 overflow-y-auto">
                                    <div className="p-10 space-y-12 max-w-5xl mx-auto">
                                        {/* Summary Section */}
                                        <div className="bg-slate-50/50 dark:bg-slate-900/70 border border-slate-200/50 dark:border-slate-800 rounded-[2rem] p-10 relative overflow-hidden group hover:shadow-2xl hover:shadow-indigo-500/5 transition-all duration-500">
                                            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full -mr-16 -mt-16 group-hover:scale-150 transition-transform duration-700" />
                                            <h4 className="text-xs font-black text-indigo-500 uppercase tracking-[0.3em] mb-6 flex items-center gap-3">
                                                <FileText className="w-5 h-5" /> Executive summary
                                            </h4>
                                            <p className="text-lg text-slate-800 dark:text-slate-200 leading-relaxed italic border-l-4 border-indigo-500/50 pl-8 transition-colors">
                                                {report.executive_summary}
                                            </p>
                                        </div>

                                        {/* Strengths */}
                                        <div className="space-y-6">
                                            <h4 className="text-xs font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-[0.3em] flex items-center gap-3 ml-2">
                                                <CheckCircle2 className="w-5 h-5" /> Key competitive advantages
                                            </h4>
                                            <div className="grid grid-cols-1 gap-6">
                                                {report.strengths.map((s, i) => (
                                                    <div key={i} className="bg-emerald-50/30 dark:bg-emerald-950/20 p-8 rounded-[1.5rem] border border-emerald-100 dark:border-emerald-900/30 hover:border-emerald-400 hover:shadow-xl hover:shadow-emerald-500/5 transition-all duration-500 group">
                                                        <div className="flex items-start justify-between mb-4">
                                                            <div className="font-black text-emerald-900 dark:text-emerald-300 text-lg tracking-tight group-hover:text-emerald-600 transition-colors">0{i + 1}. {s.title}</div>
                                                            <Sparkles className="w-5 h-5 text-emerald-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                                                        </div>
                                                        <p className="text-slate-600 dark:text-slate-400 leading-relaxed mb-6 font-medium">{s.detail}</p>
                                                        {s.evidence && (
                                                            <div className="text-sm text-emerald-700/80 dark:text-emerald-400/60 italic flex items-start gap-4 bg-white dark:bg-black/20 p-6 rounded-2xl border border-emerald-100/50 dark:border-emerald-900/50 shadow-sm">
                                                                <Quote className="w-4 h-4 mt-1 shrink-0 text-emerald-300" />
                                                                <span className="leading-relaxed">&ldquo;{s.evidence}&rdquo;</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Concerns */}
                                        <div className="space-y-6">
                                            <h4 className="text-xs font-black text-red-600 dark:text-red-400 uppercase tracking-[0.3em] flex items-center gap-3 ml-2">
                                                <AlertTriangle className="w-5 h-5" /> Strategic vulnerabilities
                                            </h4>
                                            <div className="grid grid-cols-1 gap-6">
                                                {report.concerns.map((c, i) => (
                                                    <div key={i} className="bg-red-50/20 dark:bg-red-950/20 p-8 rounded-[1.5rem] border border-red-100/50 dark:border-red-900/30 hover:border-red-400 hover:shadow-xl hover:shadow-red-500/5 transition-all duration-500 group">
                                                        <div className="flex items-center justify-between mb-4">
                                                            <div className="font-black text-red-900 dark:text-red-300 text-lg tracking-tight group-hover:text-red-600 transition-colors">0{i + 1}. {c.title}</div>
                                                            <Badge variant="outline" className="text-[10px] font-black uppercase border-red-200 text-red-600 px-3 h-6 flex items-center gap-1.5">
                                                                <AlertCircle className="w-3 h-3" /> {c.severity} Severity
                                                            </Badge>
                                                        </div>
                                                        <p className="text-slate-600 dark:text-slate-400 leading-relaxed mb-6 font-medium">{c.detail}</p>
                                                        {c.evidence && (
                                                            <div className="text-sm text-red-700/80 dark:text-red-400/60 italic flex items-start gap-4 bg-white dark:bg-black/20 p-6 rounded-2xl border border-red-100/50 dark:border-red-900/50 shadow-sm">
                                                                <Quote className="w-4 h-4 mt-1 shrink-0 text-red-300" />
                                                                <span className="leading-relaxed">&ldquo;{c.evidence}&rdquo;</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Recommendations */}
                                        <div className="space-y-8 pt-6">
                                            <h4 className="text-xs font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-[0.3em] flex items-center gap-3 ml-2">
                                                <Target className="w-5 h-5" /> Actionable roadmaps
                                            </h4>
                                            <div className="space-y-6">
                                                {report.recommendations.map((r, i) => (
                                                    <div key={i} className="bg-white dark:bg-slate-900 p-8 rounded-[2rem] border-2 border-indigo-50 dark:border-indigo-900/20 hover:border-indigo-400 transition-all duration-500 flex flex-col md:flex-row gap-8">
                                                        <div className="md:w-1/3 flex flex-col gap-3">
                                                            <Badge className="w-fit px-3 py-1 bg-indigo-600 text-[10px] font-black uppercase tracking-widest">{r.priority} Impact</Badge>
                                                            <h5 className="text-xl font-black text-slate-800 dark:text-slate-100 tracking-tight leading-tight">{r.title}</h5>
                                                        </div>
                                                        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-8 text-sm">
                                                            <div className="space-y-2">
                                                                <span className="text-[10px] font-black uppercase text-indigo-400 tracking-widest">Strategic Action</span>
                                                                <p className="text-slate-700 dark:text-slate-300 font-bold leading-relaxed">{r.action}</p>
                                                            </div>
                                                            <div className="space-y-2">
                                                                <span className="text-[10px] font-black uppercase text-pink-400 tracking-widest">Expected Outcome</span>
                                                                <p className="text-slate-600 dark:text-slate-400 leading-relaxed italic">{r.impact}</p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="pt-12 text-center pb-8 border-t border-slate-100 dark:border-slate-800">
                                            <p className="text-lg text-slate-500 italic max-w-2xl mx-auto leading-relaxed opacity-70">
                                                &ldquo;{report.closing_statement}&rdquo;
                                            </p>
                                        </div>
                                    </div>
                                </CardContent>
                                </Card>
                            </div>
                        ) : generatingReport ? (
                            <Card className="h-full border-indigo-200 dark:border-indigo-900/50 bg-white dark:bg-slate-900 shadow-xl overflow-hidden flex flex-col">
                                <div className="h-1 bg-gradient-to-r from-indigo-300 via-purple-300 to-pink-300 animate-pulse" />
                                <CardHeader className="py-6 px-10 border-b border-slate-100 dark:border-slate-800 bg-indigo-50/20 dark:bg-indigo-950/20 shrink-0">
                                    <div className="flex items-center justify-between">
                                        <div className="space-y-2">
                                            <div className="flex items-center gap-3">
                                                <div className="w-7 h-7 rounded-full bg-amber-200 dark:bg-amber-900/40 animate-pulse" />
                                                <div className="h-7 w-56 bg-slate-200 dark:bg-slate-700 rounded-lg animate-pulse" />
                                            </div>
                                            <div className="h-3 w-40 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
                                        </div>
                                        <div className="h-9 w-32 bg-slate-200 dark:bg-slate-700 rounded-full animate-pulse" />
                                    </div>
                                </CardHeader>
                                <CardContent className="p-0 overflow-y-auto">
                                    <div className="p-10 space-y-10 max-w-5xl mx-auto">
                                        <div className="flex items-center justify-center gap-3 py-6">
                                            <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
                                            <span className="text-sm font-black text-indigo-400 uppercase tracking-widest">AI Specialist Processing...</span>
                                        </div>
                                        {/* Summary skeleton */}
                                        <div className="bg-slate-50 dark:bg-slate-800/20 border border-slate-200/50 dark:border-slate-800 rounded-[2rem] p-10 space-y-4 animate-pulse">
                                            <div className="h-3 w-36 bg-indigo-200 dark:bg-indigo-900/40 rounded" />
                                            <div className="border-l-4 border-indigo-200 dark:border-indigo-900/40 pl-8 space-y-3">
                                                <div className="h-5 w-full bg-slate-200 dark:bg-slate-700 rounded-lg" />
                                                <div className="h-5 w-5/6 bg-slate-200 dark:bg-slate-700 rounded-lg" />
                                                <div className="h-5 w-4/5 bg-slate-200 dark:bg-slate-700 rounded-lg" />
                                            </div>
                                        </div>
                                        {/* Strengths skeleton */}
                                        <div className="space-y-4">
                                            <div className="h-3 w-52 bg-emerald-200 dark:bg-emerald-900/30 rounded ml-2 animate-pulse" />
                                            {[0, 1, 2].map(i => (
                                                <div key={i} className="bg-emerald-50/30 dark:bg-emerald-950/20 p-8 rounded-[1.5rem] border border-emerald-100 dark:border-emerald-900/30 space-y-3 animate-pulse">
                                                    <div className="h-5 w-48 bg-emerald-200 dark:bg-emerald-900/40 rounded" />
                                                    <div className="h-4 w-full bg-slate-200 dark:bg-slate-700 rounded" />
                                                    <div className="h-4 w-2/3 bg-slate-200 dark:bg-slate-700 rounded" />
                                                </div>
                                            ))}
                                        </div>
                                        {/* Concerns skeleton */}
                                        <div className="space-y-4">
                                            <div className="h-3 w-52 bg-red-200 dark:bg-red-900/30 rounded ml-2 animate-pulse" />
                                            {[0, 1, 2].map(i => (
                                                <div key={i} className="bg-red-50/20 dark:bg-red-950/20 p-8 rounded-[1.5rem] border border-red-100/50 dark:border-red-900/30 space-y-3 animate-pulse">
                                                    <div className="h-5 w-48 bg-red-200 dark:bg-red-900/40 rounded" />
                                                    <div className="h-4 w-full bg-slate-200 dark:bg-slate-700 rounded" />
                                                    <div className="h-4 w-2/3 bg-slate-200 dark:bg-slate-700 rounded" />
                                                </div>
                                            ))}
                                        </div>
                                        {/* Recommendations skeleton */}
                                        <div className="space-y-4">
                                            <div className="h-3 w-52 bg-indigo-200 dark:bg-indigo-900/30 rounded ml-2 animate-pulse" />
                                            {[0, 1, 2].map(i => (
                                                <div key={i} className="bg-white dark:bg-slate-900 p-8 rounded-[2rem] border-2 border-indigo-50 dark:border-indigo-900/20 flex gap-8 animate-pulse">
                                                    <div className="w-1/3 space-y-3">
                                                        <div className="h-6 w-20 bg-indigo-200 dark:bg-indigo-900/40 rounded-full" />
                                                        <div className="h-6 w-36 bg-slate-200 dark:bg-slate-700 rounded" />
                                                    </div>
                                                    <div className="flex-1 grid grid-cols-2 gap-8">
                                                        <div className="space-y-2">
                                                            <div className="h-3 w-24 bg-indigo-100 dark:bg-indigo-900/30 rounded" />
                                                            <div className="h-4 w-full bg-slate-200 dark:bg-slate-700 rounded" />
                                                            <div className="h-4 w-4/5 bg-slate-200 dark:bg-slate-700 rounded" />
                                                        </div>
                                                        <div className="space-y-2">
                                                            <div className="h-3 w-24 bg-pink-100 dark:bg-pink-900/30 rounded" />
                                                            <div className="h-4 w-full bg-slate-200 dark:bg-slate-700 rounded" />
                                                            <div className="h-4 w-3/4 bg-slate-200 dark:bg-slate-700 rounded" />
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        ) : reportError ? (
                            <div className="h-full flex flex-col items-center justify-center text-center p-20 border-2 border-dashed border-red-200 dark:border-red-900/40 rounded-[3rem] bg-red-50/20 dark:bg-red-950/10 animate-in fade-in zoom-in duration-700">
                                <div className="w-20 h-20 rounded-[1.5rem] bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-6">
                                    <AlertCircle className="w-10 h-10 text-red-400" />
                                </div>
                                <h3 className="text-xl font-black text-slate-800 dark:text-slate-100 tracking-tight mb-2">Synthesis Failed</h3>
                                <p className="text-sm text-slate-500 max-w-sm mb-6 font-medium">{reportError}</p>
                                <Button onClick={generateExecutiveReport} className="bg-red-600 hover:bg-red-700 text-white gap-2">
                                    <RefreshCcw className="w-4 h-4" /> Retry Generation
                                </Button>
                            </div>
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center text-center p-20 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-[3rem] bg-slate-50/30 dark:bg-slate-900/30 animate-in fade-in zoom-in duration-1000">
                                <div className="w-24 h-24 rounded-[2rem] bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center mb-6">
                                    <FileText className="w-10 h-10 text-indigo-500 opacity-50" />
                                </div>
                                <h3 className="text-xl font-black text-slate-800 dark:text-slate-100 tracking-tight">System Ready for Synthesis</h3>
                                <p className="text-sm text-slate-500 max-w-sm mt-2 font-medium">Click "Generate Initial Synthesis" to allow our AI Specialist to process all available unit feedback into a strategic report.</p>
                            </div>
                        )}
                    </div>
                </div>
            </TabsContent>

            {/* TAB 2: INTERACTIVE AI ASSISTANT (FULL PAGE) */}
            <TabsContent value="chat" className="flex-1 min-h-0 focus-visible:ring-0">
                <div className="flex gap-6 h-full">
                    {/* Chat Sidebar */}
                    <div className="w-72 flex flex-col gap-4 shrink-0 print:hidden">
                        <Card className="flex-1 border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden flex flex-col shadow-sm">
                            <CardHeader className="py-4 px-6 bg-slate-50/50 dark:bg-slate-800/20 border-b border-slate-100 dark:border-slate-800">
                                <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 flex items-center gap-2">
                                    <History className="w-3 h-3 text-slate-400" /> Discussion history
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-4 flex-1 overflow-y-auto">
                                <div className="space-y-4">
                                    <div className="p-4 rounded-2xl bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-900/30 text-xs font-bold text-indigo-700 dark:text-indigo-300 flex items-center justify-between">
                                        Current Session
                                        <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse shadow-[0_0_8px_rgba(99,102,241,0.5)]" />
                                    </div>
                                    <div className="p-10 text-[11px] text-slate-400 font-medium italic text-center leading-relaxed">
                                        Previous conversations are archived and indexed automatically for cross-reference.
                                    </div>
                                </div>
                            </CardContent>
                            <CardFooter className="p-4 border-t border-slate-100 dark:border-slate-800">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="w-full justify-center gap-2 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30 text-[10px] font-black uppercase tracking-widest transition-colors h-10"
                                    onClick={async () => {
                                        if (confirm("Permanently clear this discussion history?")) {
                                            const chatReportType = surveyId ? `chat_history_${surveyId}` : 'chat_history';
                                            setMessages([]);
                                            await supabase.from('unit_ai_reports').delete().eq('unit_id', unitId).eq('report_type', chatReportType);
                                            toast.success("Discussion cleared");
                                        }
                                    }}
                                >
                                    <Trash2 className="w-4 h-4" /> Reset Conversation
                                </Button>
                            </CardFooter>
                        </Card>

                        <Button
                            variant="outline"
                            className="w-full gap-3 text-xs h-12 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 font-bold rounded-2xl shadow-sm hover:shadow-md transition-all"
                            onClick={() => window.print()}
                        >
                            <Download className="w-4 h-4 text-slate-400" /> Export Discussion Report
                        </Button>
                    </div>

                    {/* Chat Main Content */}
                    <div className="flex-1 flex flex-col min-w-0">
                        <Card className="flex-1 flex flex-col border-indigo-200 dark:border-indigo-900/50 shadow-2xl bg-white dark:bg-slate-900 overflow-hidden relative rounded-[2rem]">
                            <div className="absolute inset-0 opacity-[0.03] pointer-events-none bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] dark:invert" />

                            <CardHeader className="bg-indigo-50/30 dark:bg-indigo-950/30 border-b border-indigo-100 dark:border-indigo-900/50 py-4 px-8 relative z-10 shrink-0">
                                <CardTitle className="text-base font-black text-indigo-950 dark:text-indigo-300 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-200 dark:shadow-none">
                                            <Bot className="w-5 h-5 text-white" />
                                        </div>
                                        AI Analysis Assistant
                                    </div>
                                    <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-100/50 dark:bg-emerald-950/30 border border-emerald-200/50 dark:border-emerald-800/50">
                                        <span className="flex h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                        <span className="text-[10px] font-black text-emerald-700 dark:text-emerald-400 uppercase tracking-widest">Live System</span>
                                    </div>
                                </CardTitle>
                            </CardHeader>

                            <CardContent className="flex-1 p-0 flex flex-col min-h-0 relative z-10">
                                <div
                                    ref={chatContainerRef}
                                    className="flex-1 overflow-y-auto p-10 scroll-smooth"
                                >
                                    {messages.length === 0 ? (
                                        <div className="h-full flex flex-col items-center justify-center text-center text-slate-500 space-y-10 mt-16 max-w-xl mx-auto animate-in fade-in zoom-in duration-700">
                                            <div className="w-28 h-28 rounded-[2.5rem] bg-gradient-to-br from-indigo-500 via-purple-600 to-pink-500 flex items-center justify-center shadow-2xl rotate-6 hover:rotate-0 transition-transform cursor-default relative group">
                                                <div className="absolute inset-0 bg-white opacity-0 group-hover:opacity-20 rounded-[2.5rem] transition-opacity" />
                                                <Sparkles className="w-14 h-14 text-white animate-pulse" />
                                            </div>
                                            <div className="space-y-4">
                                                <h3 className="text-3xl font-black text-slate-900 dark:text-slate-100 tracking-tighter leading-tight">AI Analyst Workspace</h3>
                                                <p className="text-base text-slate-500 font-medium leading-relaxed italic">
                                                    "I have synthesized all metric streams for this unit. We can now deep-dive into specific sentiment pockets, performance outliers, or student recommendation clusters."
                                                </p>
                                            </div>
                                            <div className="flex flex-wrap gap-3 justify-center pt-4">
                                                <SuggestionBadge onClick={() => setInput("What are the most critical student pain points right now?")}>Critical Pain Points</SuggestionBadge>
                                                <SuggestionBadge onClick={() => setInput("Summarize student suggestions for infrastructure improvement")}>Infrastructure Proposals</SuggestionBadge>
                                                <SuggestionBadge onClick={() => setInput("How does student sentiment compare across different survey years?")}>Historical Trends</SuggestionBadge>
                                                <SuggestionBadge onClick={() => setInput("Extract key success drivers for the unit report")}>Performance Highlights</SuggestionBadge>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="space-y-12 pb-10">
                                            {messages.map((msg) => (
                                                <div key={msg.id} className={`flex gap-6 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                                    {msg.role === 'assistant' && (
                                                        <div className="w-12 h-12 rounded-[1.2rem] bg-indigo-600 flex items-center justify-center shrink-0 shadow-xl border-2 border-white dark:border-slate-800 mt-1">
                                                            <Bot className="w-8 h-8 text-white" />
                                                        </div>
                                                    )}
                                                    <div className={`max-w-[85%] rounded-[2rem] px-8 py-7 text-[16px] shadow-sm transition-all relative ${msg.role === 'user'
                                                        ? 'bg-slate-900 text-white dark:bg-slate-50 dark:text-slate-900 rounded-tr-none border-b-[4px] border-indigo-500'
                                                        : 'bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 text-slate-800 dark:text-slate-200 rounded-tl-none font-medium leading-relaxed hover:border-indigo-200 dark:hover:border-indigo-900 transition-colors'
                                                        }`}>
                                                        {msg.role === 'assistant' ? (
                                                            <BoxedMessageRenderer content={msg.content} />
                                                        ) : (
                                                            msg.content
                                                        )}
                                                    </div>
                                                    {msg.role === 'user' && (
                                                        <div className="w-12 h-12 rounded-[1.2rem] bg-slate-100 dark:bg-slate-700 flex items-center justify-center shrink-0 border border-slate-200 dark:border-slate-600 shadow-md self-end mb-1">
                                                            <User className="w-8 h-8 text-slate-600 dark:text-slate-300" />
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                            {isLoading && (
                                                <div className="flex gap-6 justify-start">
                                                    <div className="w-12 h-12 rounded-[1.2rem] bg-indigo-600 flex items-center justify-center shrink-0 animate-pulse">
                                                        <Bot className="w-8 h-8 text-white" />
                                                    </div>
                                                    <div className="bg-white dark:bg-slate-800 border border-indigo-100 dark:border-indigo-900/50 rounded-[2rem] rounded-tl-none px-10 py-7 text-sm flex items-center gap-6 shadow-2xl">
                                                        <div className="flex gap-2">
                                                            <span className="w-2.5 h-2.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
                                                            <span className="w-2.5 h-2.5 bg-indigo-500 rounded-full animate-bounce [animation-delay:-0.15s]" />
                                                            <span className="w-2.5 h-2.5 bg-indigo-600 rounded-full animate-bounce" />
                                                        </div>
                                                        <span className="text-indigo-600 dark:text-indigo-400 font-black tracking-widest uppercase text-[11px]">Analysing feedback data...</span>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </CardContent>

                            {/* Persistent Quick Questions strip */}
                            <div className="px-8 py-3 border-t border-slate-100 dark:border-slate-800/60 bg-slate-50/40 dark:bg-slate-950/40 shrink-0 relative z-10">
                                <div className="flex items-center gap-2 overflow-x-auto max-w-6xl mx-auto">
                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest shrink-0 flex items-center gap-1.5 pr-3 border-r border-slate-200 dark:border-slate-700 mr-1">
                                        <Lightbulb className="w-3 h-3 text-amber-400" /> Quick Questions
                                    </span>
                                    {[
                                        { label: "Critical Pain Points", prompt: "What are the most critical student pain points right now?" },
                                        { label: "Infrastructure Proposals", prompt: "Summarize student suggestions for infrastructure improvement" },
                                        { label: "Historical Trends", prompt: "How does student sentiment compare across different survey years?" },
                                        { label: "Performance Highlights", prompt: "Extract key success drivers for the unit report" },
                                    ].map(s => (
                                        <button
                                            key={s.label}
                                            onClick={() => setInput(s.prompt)}
                                            disabled={isLoading}
                                            className="shrink-0 px-3 py-1.5 rounded-full border border-slate-200 dark:border-slate-700 text-[11px] font-bold text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-900 hover:border-indigo-300 hover:text-indigo-600 dark:hover:border-indigo-700 dark:hover:text-indigo-400 transition-all disabled:opacity-40 whitespace-nowrap"
                                        >
                                            {s.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <CardFooter className="p-8 bg-slate-50/50 dark:bg-slate-950/50 border-t border-slate-200 dark:border-slate-800 shrink-0 relative z-10">
                                <form
                                    onSubmit={(e) => { e.preventDefault(); handleSend(); }}
                                    className="flex w-full items-end gap-5 max-w-6xl mx-auto"
                                >
                                    <div className="flex-1 relative group">
                                        <Input
                                            placeholder="Ask for comparisons, tactical recommendations, or deep-dives into sentiment buckets..."
                                            value={input}
                                            onChange={(e) => setInput(e.target.value)}
                                            className="w-full border-2 border-slate-200 dark:border-slate-800 focus-visible:ring-indigo-500 focus-visible:border-indigo-500 bg-white dark:bg-slate-900 pl-8 pr-16 py-10 text-lg rounded-[2.5rem] shadow-inner transition-all group-hover:border-indigo-300 dark:group-hover:border-indigo-700 font-medium"
                                            disabled={isLoading}
                                        />
                                        <div className="absolute right-6 top-1/2 -translate-y-1/2 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[10px] font-black text-slate-400 uppercase tracking-widest opacity-70 group-hover:text-indigo-500 transition-colors">
                                            Return
                                        </div>
                                    </div>
                                    <Button
                                        type="submit"
                                        size="icon"
                                        disabled={!input.trim() || isLoading}
                                        className="h-[80px] w-[80px] shrink-0 bg-indigo-600 hover:bg-indigo-700 shadow-2xl shadow-indigo-300 dark:shadow-none transition-all active:scale-95 rounded-[2.5rem] group"
                                    >
                                        <Send className="w-8 h-8 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
                                    </Button>
                                </form>
                            </CardFooter>
                        </Card>
                    </div>
                </div>
            </TabsContent>
        </Tabs>
    );
}

function SuggestionBadge({ children, onClick }: { children: React.ReactNode, onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            className="px-6 py-4 rounded-[1.5rem] border border-slate-200 dark:border-slate-800 text-[14px] font-bold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900/50 hover:bg-slate-950 hover:text-white dark:hover:bg-white dark:hover:text-slate-950 transition-all shadow-md active:scale-95 hover:-translate-y-1"
        >
            {children}
        </button>
    );
}
