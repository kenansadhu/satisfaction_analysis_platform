"use client";

import { useState, useRef, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent, CardFooter, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
    Loader2, Send, Sparkles, Bot, User,
    Download, Trash2, History, Lightbulb, CheckCircle2,
    AlertTriangle, Target, Quote,
    RefreshCcw, FileText, AlertCircle, LayoutDashboard, MessageSquare
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { BoxedMessageRenderer } from "./BoxedMessageRenderer";

type Message = { id: string; role: "user" | "assistant"; content: string };

type ReportData = {
    executive_summary: string;
    overall_verdict: "Excellent" | "Good" | "Needs Improvement" | "Critical";
    strengths: { title: string; detail: string; evidence: string }[];
    concerns: { title: string; detail: string; severity: "High" | "Medium" | "Low"; evidence: string }[];
    recommendations: { title: string; action: string; impact: string; priority: "Immediate" | "Short-term" | "Long-term" }[];
    closing_statement: string;
};


function SuggestionBadge({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            className="px-6 py-4 rounded-[1.5rem] border border-slate-200 dark:border-slate-800 text-[14px] font-bold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900/50 hover:bg-slate-950 hover:text-white dark:hover:bg-white dark:hover:text-slate-950 transition-all shadow-md active:scale-95 hover:-translate-y-1"
        >
            {children}
        </button>
    );
}

export default function FacultyInsightChat({
    facultyId,
    surveyId,
    facultyName,
    surveyTitle,
}: {
    facultyId: string;
    surveyId?: string;
    facultyName?: string;
    surveyTitle?: string;
}) {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [generatingReport, setGeneratingReport] = useState(false);
    const [report, setReport] = useState<ReportData | null>(null);
    const [customInstructions, setCustomInstructions] = useState("");
    const [lastSaved, setLastSaved] = useState<string | null>(null);
    const [reportError, setReportError] = useState<string | null>(null);
    const [userId, setUserId] = useState<string | null>(null);
    const chatContainerRef = useRef<HTMLDivElement>(null);

    // Load persisted data via server-side API
    useEffect(() => {
        if (!surveyId) return;
        supabase.auth.getUser().then(({ data: { user } }) => {
            const uid = user?.id ?? null;
            setUserId(uid);
            fetch(`/api/ai/faculty-specialist?facultyId=${facultyId}&surveyId=${surveyId}&userId=${uid ?? 'anon'}`)
                .then(r => r.json())
                .then(data => {
                    if (data.messages?.length) setMessages(data.messages);
                    if (data.report) {
                        setReport(data.report);
                        if (data.generatedAt) setLastSaved(new Date(data.generatedAt).toLocaleString());
                    }
                })
                .catch(() => {});
        });
    }, [facultyId, surveyId]);

    // Auto-scroll
    useEffect(() => {
        chatContainerRef.current?.scrollTo({ top: chatContainerRef.current.scrollHeight, behavior: "smooth" });
    }, [messages, isLoading]);

    const handleSend = async () => {
        if (!input.trim() || isLoading) return;
        const userMsg: Message = { id: Date.now().toString(), role: "user", content: input };
        const newMessages = [...messages, userMsg];
        setMessages(newMessages);
        setInput("");
        setIsLoading(true);

        try {
            const res = await fetch("/api/ai/chat-faculty", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ facultyId, surveyId, history: messages, prompt: userMsg.content }),
            });
            if (!res.ok) { const e = await res.json(); throw new Error(e.error || "Failed"); }

            const assistantId = (Date.now() + 1).toString();
            setMessages([...newMessages, { id: assistantId, role: "assistant", content: "" }]);
            setIsLoading(false);

            const reader = res.body!.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let streamedContent = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const parts = buffer.split('\n\n');
                buffer = parts.pop() ?? '';
                for (const part of parts) {
                    if (!part.startsWith('data: ')) continue;
                    const data = JSON.parse(part.slice(6));
                    if (data.error) throw new Error(data.error);
                    if (data.text) {
                        streamedContent += data.text;
                        setMessages(prev => {
                            const updated = [...prev];
                            updated[updated.length - 1] = { ...updated[updated.length - 1], content: streamedContent };
                            return updated;
                        });
                    }
                }
            }

            // Save chat history server-side
            if (surveyId) {
                const finalMessages = [...newMessages, { id: assistantId, role: "assistant" as const, content: streamedContent }];
                fetch("/api/ai/faculty-specialist", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ facultyId, surveyId, userId: userId ?? 'anon', messages: finalMessages }),
                }).catch(() => {});
            }
        } catch (error: any) {
            toast.error(error.message || "Failed to connect to AI");
        } finally {
            setIsLoading(false);
        }
    };

    const generateReport = async () => {
        setGeneratingReport(true);
        setReportError(null);
        try {
            const res = await fetch("/api/ai/generate-faculty-report", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ facultyId, surveyId, customInstructions: customInstructions.trim() || undefined }),
            });
            const data = await res.json();
            if (!data.report) throw new Error(data.error || "Generation failed");
            setReport(data.report);
            // Report is already saved server-side by the API route
            if (data.generatedAt) setLastSaved(new Date(data.generatedAt).toLocaleString());
            toast.success("Faculty Analysis Complete");
        } catch (e: any) {
            const msg = e.message || "Failed to generate report";
            toast.error(msg);
            setReportError(msg);
        } finally {
            setGeneratingReport(false);
        }
    };

    return (
        <Tabs defaultValue="strategy" className="w-full h-full flex flex-col animate-in fade-in duration-700">
            <div className="flex items-center justify-center mb-8 shrink-0">
                <TabsList className="grid w-full max-w-2xl grid-cols-2 bg-slate-200/50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 p-0 h-12 shadow-sm rounded-xl overflow-hidden">
                    <TabsTrigger value="strategy" className="h-full rounded-none gap-2 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-950 data-[state=active]:text-teal-700 data-[state=active]:shadow-sm">
                        <LayoutDashboard className="w-4 h-4 shrink-0" /> 1. Strategic Analysis
                    </TabsTrigger>
                    <TabsTrigger value="chat" className="h-full rounded-none gap-2 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-950 data-[state=active]:text-pink-600 data-[state=active]:shadow-sm">
                        <MessageSquare className="w-4 h-4 shrink-0" /> 2. Interactive AI Assistant
                    </TabsTrigger>
                </TabsList>
            </div>

            {/* ── TAB 1: STRATEGIC ANALYSIS ── */}
            <TabsContent value="strategy" className="flex-1 min-h-0 focus-visible:ring-0">
                <div className="flex gap-6 h-full">
                    {/* Sidebar */}
                    <div className="w-72 flex flex-col gap-4 shrink-0">
                        <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
                            <CardHeader className="py-4 px-6 bg-slate-50/50 dark:bg-slate-800/20 border-b border-slate-100 dark:border-slate-800">
                                <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 flex items-center gap-2">
                                    <Sparkles className="w-3 h-3 text-teal-500" /> Synthesis Controls
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-6 space-y-4">
                                <Button
                                    onClick={generateReport}
                                    disabled={generatingReport}
                                    className="w-full bg-teal-600 hover:bg-teal-700 text-white shadow-xl shadow-teal-100 dark:shadow-none gap-2 text-xs h-11 font-bold rounded-xl"
                                >
                                    {generatingReport ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCcw className="w-4 h-4" />}
                                    {report ? "Regenerate Synthesis" : "Generate Initial Synthesis"}
                                </Button>
                                {lastSaved && (
                                    <p className="text-[10px] text-center text-slate-400 font-medium">Last updated: {lastSaved}</p>
                                )}
                                <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-2">
                                    <label className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400 flex items-center gap-1.5">
                                        <FileText className="w-3 h-3" /> Analyst Context
                                    </label>
                                    <Textarea
                                        value={customInstructions}
                                        onChange={e => setCustomInstructions(e.target.value)}
                                        placeholder="Optional: guide the AI before generating. e.g. 'Focus on first-year students' academic transition experience.'"
                                        className="text-xs resize-none min-h-[90px] rounded-xl border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 placeholder:text-slate-300 dark:placeholder:text-slate-600 focus-visible:ring-teal-500"
                                        disabled={generatingReport}
                                    />
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Main content */}
                    <div className="flex-1 min-w-0">
                        {report ? (
                            <div className="relative h-full">
                                {generatingReport && (
                                    <div className="absolute inset-0 z-20 pointer-events-none">
                                        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-teal-400 via-cyan-400 to-emerald-400 animate-pulse" />
                                        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-white dark:bg-slate-900 border border-teal-200 dark:border-teal-900/50 rounded-full px-4 py-2 flex items-center gap-2 shadow-lg text-xs font-black text-teal-600 uppercase tracking-widest whitespace-nowrap">
                                            <Loader2 className="w-3 h-3 animate-spin" /> Regenerating...
                                        </div>
                                    </div>
                                )}
                                <Card className="h-full border-teal-200 dark:border-teal-900/50 bg-white dark:bg-slate-900 shadow-xl overflow-hidden flex flex-col">
                                    <div className="h-1 bg-gradient-to-r from-teal-500 via-cyan-500 to-emerald-500 shrink-0" />
                                    <CardHeader className="py-6 px-10 border-b border-slate-100 dark:border-slate-800 bg-teal-50/20 dark:bg-teal-950/20 shrink-0">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <CardTitle className="text-2xl font-black text-slate-800 dark:text-slate-100 tracking-tighter flex items-center gap-3">
                                                    <Lightbulb className="w-7 h-7 text-amber-500" /> Faculty Analysis Report
                                                </CardTitle>
                                                {(facultyName || surveyTitle) && (
                                                    <CardDescription className="text-xs font-medium text-slate-400 mt-1 uppercase tracking-widest">
                                                        {facultyName}{surveyTitle ? ` · ${surveyTitle}` : ""}
                                                    </CardDescription>
                                                )}
                                            </div>
                                            <Badge className={`px-5 py-2 text-xs font-black uppercase tracking-[0.2em] shadow-lg ${report.overall_verdict === "Excellent" ? "bg-emerald-500" : report.overall_verdict === "Good" ? "bg-teal-600" : report.overall_verdict === "Needs Improvement" ? "bg-amber-600" : "bg-red-600"}`}>
                                                {report.overall_verdict}
                                            </Badge>
                                        </div>
                                    </CardHeader>
                                    <CardContent className="p-0 overflow-y-auto">
                                        <div className="p-10 space-y-12 max-w-5xl mx-auto">
                                            {/* Summary */}
                                            <div className="bg-slate-50/50 dark:bg-slate-900/70 border border-slate-200/50 dark:border-slate-800 rounded-[2rem] p-10">
                                                <h4 className="text-xs font-black text-teal-500 uppercase tracking-[0.3em] mb-6 flex items-center gap-3">
                                                    <FileText className="w-5 h-5" /> Executive Summary
                                                </h4>
                                                <p className="text-lg text-slate-800 dark:text-slate-200 leading-relaxed italic border-l-4 border-teal-500/50 pl-8">
                                                    {report.executive_summary}
                                                </p>
                                            </div>

                                            {/* Strengths */}
                                            <div className="space-y-6">
                                                <h4 className="text-xs font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-[0.3em] flex items-center gap-3 ml-2">
                                                    <CheckCircle2 className="w-5 h-5" /> Key Competitive Advantages
                                                </h4>
                                                {report.strengths.map((s, i) => (
                                                    <div key={i} className="bg-emerald-50/30 dark:bg-emerald-950/20 p-8 rounded-[1.5rem] border border-emerald-100 dark:border-emerald-900/30 hover:border-emerald-400 transition-all group">
                                                        <div className="font-black text-emerald-900 dark:text-emerald-300 text-lg tracking-tight mb-4">0{i + 1}. {s.title}</div>
                                                        <p className="text-slate-600 dark:text-slate-400 leading-relaxed mb-6 font-medium">{s.detail}</p>
                                                        {s.evidence && (
                                                            <div className="text-sm text-emerald-700/80 dark:text-emerald-400/60 italic flex items-start gap-4 bg-white dark:bg-black/20 p-6 rounded-2xl border border-emerald-100/50 shadow-sm">
                                                                <Quote className="w-4 h-4 mt-1 shrink-0 text-emerald-300" />
                                                                <span>&ldquo;{s.evidence}&rdquo;</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>

                                            {/* Concerns */}
                                            <div className="space-y-6">
                                                <h4 className="text-xs font-black text-red-600 dark:text-red-400 uppercase tracking-[0.3em] flex items-center gap-3 ml-2">
                                                    <AlertTriangle className="w-5 h-5" /> Strategic Vulnerabilities
                                                </h4>
                                                {report.concerns.map((c, i) => (
                                                    <div key={i} className="bg-red-50/20 dark:bg-red-950/20 p-8 rounded-[1.5rem] border border-red-100/50 dark:border-red-900/30 hover:border-red-400 transition-all group">
                                                        <div className="flex items-center justify-between mb-4">
                                                            <div className="font-black text-red-900 dark:text-red-300 text-lg">{i + 1}. {c.title}</div>
                                                            <Badge variant="outline" className="text-[10px] font-black uppercase border-red-200 text-red-600 px-3 h-6 flex items-center gap-1.5">
                                                                <AlertCircle className="w-3 h-3" /> {c.severity} Severity
                                                            </Badge>
                                                        </div>
                                                        <p className="text-slate-600 dark:text-slate-400 leading-relaxed mb-6 font-medium">{c.detail}</p>
                                                        {c.evidence && (
                                                            <div className="text-sm text-red-700/80 dark:text-red-400/60 italic flex items-start gap-4 bg-white dark:bg-black/20 p-6 rounded-2xl border border-red-100/50 shadow-sm">
                                                                <Quote className="w-4 h-4 mt-1 shrink-0 text-red-300" />
                                                                <span>&ldquo;{c.evidence}&rdquo;</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>

                                            {/* Recommendations */}
                                            <div className="space-y-8 pt-6">
                                                <h4 className="text-xs font-black text-teal-600 dark:text-teal-400 uppercase tracking-[0.3em] flex items-center gap-3 ml-2">
                                                    <Target className="w-5 h-5" /> Actionable Roadmaps
                                                </h4>
                                                {report.recommendations.map((r, i) => (
                                                    <div key={i} className="bg-white dark:bg-slate-900 p-8 rounded-[2rem] border-2 border-teal-50 dark:border-teal-900/20 hover:border-teal-400 transition-all flex flex-col md:flex-row gap-8">
                                                        <div className="md:w-1/3 flex flex-col gap-3">
                                                            <Badge className="w-fit px-3 py-1 bg-teal-600 text-[10px] font-black uppercase tracking-widest">{r.priority} Impact</Badge>
                                                            <h5 className="text-xl font-black text-slate-800 dark:text-slate-100 tracking-tight">{r.title}</h5>
                                                        </div>
                                                        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-8 text-sm">
                                                            <div className="space-y-2">
                                                                <span className="text-[10px] font-black uppercase text-teal-400 tracking-widest">Strategic Action</span>
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
                            <Card className="h-full border-teal-200 dark:border-teal-900/50 bg-white dark:bg-slate-900 shadow-xl overflow-hidden flex flex-col">
                                <div className="h-1 bg-gradient-to-r from-teal-300 via-cyan-300 to-emerald-300 animate-pulse" />
                                <CardContent className="flex-1 flex items-center justify-center">
                                    <div className="text-center space-y-4">
                                        <Loader2 className="w-10 h-10 animate-spin text-teal-400 mx-auto" />
                                        <p className="text-sm font-black text-teal-400 uppercase tracking-widest">AI Specialist Processing Faculty Data...</p>
                                    </div>
                                </CardContent>
                            </Card>
                        ) : reportError ? (
                            <div className="h-full flex flex-col items-center justify-center text-center p-20 border-2 border-dashed border-red-200 dark:border-red-900/40 rounded-[3rem] bg-red-50/20 dark:bg-red-950/10 animate-in fade-in zoom-in duration-700">
                                <AlertCircle className="w-14 h-14 text-red-400 mb-4" />
                                <h3 className="text-xl font-black text-slate-800 dark:text-slate-100 mb-2">Synthesis Failed</h3>
                                <p className="text-sm text-slate-500 max-w-sm mb-6">{reportError}</p>
                                <Button onClick={generateReport} className="bg-red-600 hover:bg-red-700 text-white gap-2">
                                    <RefreshCcw className="w-4 h-4" /> Retry Generation
                                </Button>
                            </div>
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center text-center p-20 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-[3rem] bg-slate-50/30 dark:bg-slate-900/30 animate-in fade-in zoom-in duration-1000">
                                <div className="w-24 h-24 rounded-[2rem] bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center mb-6">
                                    <FileText className="w-10 h-10 text-teal-500 opacity-50" />
                                </div>
                                <h3 className="text-xl font-black text-slate-800 dark:text-slate-100 tracking-tight">System Ready for Synthesis</h3>
                                <p className="text-sm text-slate-500 max-w-sm mt-2 font-medium">Click "Generate Initial Synthesis" to produce an AI-powered strategic analysis for this faculty.</p>
                            </div>
                        )}
                    </div>
                </div>
            </TabsContent>

            {/* ── TAB 2: CHAT ── */}
            <TabsContent value="chat" className="flex-1 min-h-0 focus-visible:ring-0">
                <div className="flex gap-6 h-full">
                    {/* Chat sidebar */}
                    <div className="w-72 flex flex-col gap-4 shrink-0">
                        <Card className="flex-1 border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden flex flex-col shadow-sm">
                            <CardHeader className="py-4 px-6 bg-slate-50/50 dark:bg-slate-800/20 border-b border-slate-100 dark:border-slate-800">
                                <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 flex items-center gap-2">
                                    <History className="w-3 h-3" /> Discussion History
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-4 flex-1 overflow-y-auto">
                                <div className="p-4 rounded-2xl bg-teal-50 dark:bg-teal-900/20 border border-teal-100 dark:border-teal-900/30 text-xs font-bold text-teal-700 dark:text-teal-300 flex items-center justify-between">
                                    Current Session
                                    <div className="w-2 h-2 rounded-full bg-teal-500 animate-pulse" />
                                </div>
                            </CardContent>
                            <CardFooter className="p-4 border-t border-slate-100 dark:border-slate-800">
                                <Button
                                    variant="ghost" size="sm"
                                    className="w-full justify-center gap-2 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30 text-[10px] font-black uppercase tracking-widest h-10"
                                    onClick={async () => {
                                        if (!confirm("Permanently clear this discussion history?")) return;
                                        setMessages([]);
                                        if (surveyId) {
                                            fetch("/api/ai/faculty-specialist", {
                                                method: "POST",
                                                headers: { "Content-Type": "application/json" },
                                                body: JSON.stringify({ facultyId, surveyId, userId: userId ?? 'anon', messages: [] }),
                                            }).catch(() => {});
                                        }
                                        toast.success("Discussion cleared");
                                    }}
                                >
                                    <Trash2 className="w-4 h-4" /> Reset Conversation
                                </Button>
                            </CardFooter>
                        </Card>
                    </div>

                    {/* Chat main */}
                    <div className="flex-1 flex flex-col min-w-0">
                        <Card className="flex-1 flex flex-col border-teal-200 dark:border-teal-900/50 shadow-2xl bg-white dark:bg-slate-900 overflow-hidden rounded-[2rem]">
                            <CardHeader className="bg-teal-50/30 dark:bg-teal-950/30 border-b border-teal-100 dark:border-teal-900/50 py-4 px-8 shrink-0">
                                <CardTitle className="text-base font-black text-teal-950 dark:text-teal-300 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-xl bg-teal-600 flex items-center justify-center shadow-lg">
                                            <Bot className="w-5 h-5 text-white" />
                                        </div>
                                        Faculty AI Analyst
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-100/50 dark:bg-emerald-950/30 border border-emerald-200/50 dark:border-emerald-800/50">
                                            <span className="flex h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                            <span className="text-[10px] font-black text-emerald-700 dark:text-emerald-400 uppercase tracking-widest">Live</span>
                                        </div>
                                        <Button
                                            type="button"
                                            size="icon"
                                            variant="ghost"
                                            disabled={messages.length === 0 || isLoading}
                                            title="Clear conversation"
                                            className="h-8 w-8 rounded-xl text-slate-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-all disabled:opacity-30"
                                            onClick={async () => {
                                                if (!confirm("Permanently clear this discussion history?")) return;
                                                setMessages([]);
                                                if (surveyId) {
                                                    fetch("/api/ai/faculty-specialist", {
                                                        method: "POST",
                                                        headers: { "Content-Type": "application/json" },
                                                        body: JSON.stringify({ facultyId, surveyId, userId: userId ?? 'anon', messages: [] }),
                                                    }).catch(() => {});
                                                }
                                                toast.success("Discussion cleared");
                                            }}
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    </div>
                                </CardTitle>
                            </CardHeader>

                            <CardContent className="flex-1 p-0 flex flex-col min-h-0">
                                <div ref={chatContainerRef} className="flex-1 overflow-y-auto p-10 scroll-smooth">
                                    {messages.length === 0 ? (
                                        <div className="h-full flex flex-col items-center justify-center text-center space-y-10 mt-16 max-w-xl mx-auto animate-in fade-in zoom-in duration-700">
                                            <div className="w-28 h-28 rounded-[2.5rem] bg-gradient-to-br from-teal-500 via-cyan-600 to-emerald-500 flex items-center justify-center shadow-2xl rotate-6 hover:rotate-0 transition-transform cursor-default">
                                                <Sparkles className="w-14 h-14 text-white animate-pulse" />
                                            </div>
                                            <div className="space-y-4">
                                                <h3 className="text-3xl font-black text-slate-900 dark:text-slate-100 tracking-tighter">Faculty AI Analyst</h3>
                                                <p className="text-base text-slate-500 font-medium leading-relaxed italic">
                                                    "I have all feedback data for this faculty loaded. Ask me about student experience across study programs, service satisfaction, or compare performance across units."
                                                </p>
                                            </div>
                                            <div className="flex flex-wrap gap-3 justify-center pt-4">
                                                <SuggestionBadge onClick={() => setInput("What are the biggest concerns for students in this faculty?")}>Key Concerns</SuggestionBadge>
                                                <SuggestionBadge onClick={() => setInput("Which service units score highest and lowest for this faculty's students?")}>Unit Performance</SuggestionBadge>
                                                <SuggestionBadge onClick={() => setInput("How does student sentiment vary across study programs?")}>Program Comparison</SuggestionBadge>
                                                <SuggestionBadge onClick={() => setInput("What improvements do students most frequently suggest?")}>Student Suggestions</SuggestionBadge>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="space-y-12 pb-10">
                                            {messages.map(msg => (
                                                <div key={msg.id} className={`flex gap-6 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                                                    {msg.role === "assistant" && (
                                                        <div className="w-12 h-12 rounded-[1.2rem] bg-teal-600 flex items-center justify-center shrink-0 shadow-xl border-2 border-white dark:border-slate-800 mt-1">
                                                            <Bot className="w-8 h-8 text-white" />
                                                        </div>
                                                    )}
                                                    <div className={`max-w-[85%] rounded-[2rem] px-8 py-7 text-[16px] shadow-sm transition-all ${msg.role === "user"
                                                        ? "bg-slate-900 text-white dark:bg-slate-50 dark:text-slate-900 rounded-tr-none border-b-[4px] border-teal-500"
                                                        : "bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 text-slate-800 dark:text-slate-200 rounded-tl-none font-medium leading-relaxed"
                                                    }`}>
                                                        {msg.role === "assistant"
                                                            ? <BoxedMessageRenderer content={msg.content} />
                                                            : msg.content
                                                        }
                                                    </div>
                                                    {msg.role === "user" && (
                                                        <div className="w-12 h-12 rounded-[1.2rem] bg-slate-100 dark:bg-slate-700 flex items-center justify-center shrink-0 border border-slate-200 dark:border-slate-600 shadow-md self-end mb-1">
                                                            <User className="w-8 h-8 text-slate-600 dark:text-slate-300" />
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                            {isLoading && (
                                                <div className="flex gap-6 justify-start">
                                                    <div className="w-12 h-12 rounded-[1.2rem] bg-teal-600 flex items-center justify-center shrink-0 animate-pulse">
                                                        <Bot className="w-8 h-8 text-white" />
                                                    </div>
                                                    <div className="bg-white dark:bg-slate-800 border border-teal-100 dark:border-teal-900/50 rounded-[2rem] rounded-tl-none px-10 py-7 text-sm flex items-center gap-6 shadow-2xl">
                                                        <div className="flex gap-2">
                                                            <span className="w-2.5 h-2.5 bg-teal-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
                                                            <span className="w-2.5 h-2.5 bg-teal-500 rounded-full animate-bounce [animation-delay:-0.15s]" />
                                                            <span className="w-2.5 h-2.5 bg-teal-600 rounded-full animate-bounce" />
                                                        </div>
                                                        <span className="text-teal-600 dark:text-teal-400 font-black tracking-widest uppercase text-[11px]">Analysing faculty data...</span>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </CardContent>

                            {/* Quick questions strip */}
                            <div className="px-8 py-3 border-t border-slate-100 dark:border-slate-800/60 bg-slate-50/40 dark:bg-slate-950/40 shrink-0">
                                <div className="flex items-center gap-2 overflow-x-auto max-w-6xl mx-auto">
                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest shrink-0 flex items-center gap-1.5 pr-3 border-r border-slate-200 dark:border-slate-700 mr-1">
                                        <Lightbulb className="w-3 h-3 text-amber-400" /> Quick
                                    </span>
                                    {[
                                        { label: "Key Concerns", prompt: "What are the biggest concerns for students in this faculty?" },
                                        { label: "Unit Performance", prompt: "Which service units score highest and lowest for this faculty's students?" },
                                        { label: "Program Comparison", prompt: "How does student sentiment vary across study programs?" },
                                        { label: "Suggestions", prompt: "What improvements do students most frequently suggest?" },
                                    ].map(s => (
                                        <button
                                            key={s.label}
                                            onClick={() => setInput(s.prompt)}
                                            disabled={isLoading}
                                            className="shrink-0 px-3 py-1.5 rounded-full border border-slate-200 dark:border-slate-700 text-[11px] font-bold text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-900 hover:border-teal-300 hover:text-teal-600 transition-all disabled:opacity-40 whitespace-nowrap"
                                        >
                                            {s.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <CardFooter className="p-8 bg-slate-50/50 dark:bg-slate-950/50 border-t border-slate-200 dark:border-slate-800 shrink-0">
                                <form
                                    onSubmit={e => { e.preventDefault(); handleSend(); }}
                                    className="flex w-full items-end gap-5 max-w-6xl mx-auto"
                                >
                                    <div className="flex-1 relative group">
                                        <Input
                                            placeholder="Ask about study programs, service satisfaction, student demographics, or specific concerns..."
                                            value={input}
                                            onChange={e => setInput(e.target.value)}
                                            className="w-full border-2 border-slate-200 dark:border-slate-800 focus-visible:ring-teal-500 focus-visible:border-teal-500 bg-white dark:bg-slate-900 pl-8 pr-16 py-10 text-lg rounded-[2.5rem] shadow-inner font-medium"
                                            disabled={isLoading}
                                        />
                                    </div>
                                    <Button
                                        type="submit"
                                        size="icon"
                                        disabled={!input.trim() || isLoading}
                                        className="h-[80px] w-[80px] shrink-0 bg-teal-600 hover:bg-teal-700 shadow-2xl shadow-teal-300 dark:shadow-none transition-all active:scale-95 rounded-[2.5rem] group"
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
