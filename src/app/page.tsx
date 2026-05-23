"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useAuth, canAccessAdminPages } from "@/context/AuthContext";
import { Card, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    ArrowRight, Database, Users, Building2, Sparkles,
    TrendingUp, Zap, PieChart, GraduationCap, Activity,
    LayoutDashboard, Upload, BrainCircuit, GitBranch,
    BarChart3, MessageSquareText, Network, Star,
    LineChart, ShieldCheck, Cpu, Target,
} from "lucide-react";

const MODULES = [
    {
        href: "/executive",
        icon: Activity,
        label: "Executive Insights",
        tagline: "Institution-wide intelligence",
        description: "The complete picture: SSI satisfaction index, sentiment heatmaps, NPS scores, cross-unit dependency maps, and an AI-generated executive summary.",
        features: ["AI Executive Summary", "Cross-unit dependency map", "NPS scoring & trends", "Year-over-year comparison", "Action priority matrix"],
        gradient: "from-blue-600 to-indigo-600",
        lightBg: "bg-blue-50 dark:bg-blue-950/30",
        iconColor: "text-blue-600 dark:text-blue-400",
        hoverBorder: "hover:border-blue-300 dark:hover:border-blue-700",
        accent: "bg-blue-600",
        badgeColor: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
    },
    {
        href: "/unit-insights",
        icon: PieChart,
        label: "Unit Insights",
        tagline: "Deep-dive per service unit",
        description: "Drill into any unit's qualitative feedback: sentiment trends, top praised and criticised topics, student voice verbatims, and an AI analyst on demand.",
        features: ["AI-powered unit analysis", "Sentiment breakdown by topic", "Ranked student comments", "Staff & service categories", "Trend over time"],
        gradient: "from-indigo-600 to-violet-600",
        lightBg: "bg-indigo-50 dark:bg-indigo-950/30",
        iconColor: "text-indigo-600 dark:text-indigo-400",
        hoverBorder: "hover:border-indigo-300 dark:hover:border-indigo-700",
        accent: "bg-indigo-600",
        badgeColor: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300",
    },
    {
        href: "/faculty-insights",
        icon: GraduationCap,
        label: "Faculty Insights",
        tagline: "Response patterns by faculty",
        description: "Understand which faculties are most engaged, compare satisfaction across programmes, and identify under-represented student groups.",
        features: ["Faculty participation rates", "Programme-level breakdown", "Campus comparison", "Response rate tracking", "Subgroup analysis"],
        gradient: "from-teal-600 to-emerald-600",
        lightBg: "bg-teal-50 dark:bg-teal-950/30",
        iconColor: "text-teal-600 dark:text-teal-400",
        hoverBorder: "hover:border-teal-300 dark:hover:border-teal-700",
        accent: "bg-teal-600",
        badgeColor: "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300",
    },
    {
        href: "/ai-scientist",
        icon: BrainCircuit,
        label: "AI Data Scientist",
        tagline: "Conversational data analysis",
        description: "Ask any question about your survey data in plain English. The AI generates live charts, performs statistical analysis, and saves insights to a persistent gallery.",
        features: ["Natural language queries", "Auto-generated charts", "Statistical breakdowns", "Saved insight gallery", "Cross-survey analysis"],
        gradient: "from-violet-600 to-purple-600",
        lightBg: "bg-violet-50 dark:bg-violet-950/30",
        iconColor: "text-violet-600 dark:text-violet-400",
        hoverBorder: "hover:border-violet-300 dark:hover:border-violet-700",
        accent: "bg-violet-600",
        badgeColor: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
    },
];

const ADMIN_MODULE = {
    href: "/surveys",
    icon: LayoutDashboard,
    label: "Survey Management",
    tagline: "Import, configure & manage",
    description: "Import CSV exports, configure units and campuses, manage NPS settings, and run the AI pipeline that powers all analytics.",
    features: ["CSV import & mapping", "Unit & campus config", "AI pipeline control", "Platform settings", "Cache management"],
    gradient: "from-slate-600 to-slate-700",
    lightBg: "bg-slate-50 dark:bg-slate-800/50",
    iconColor: "text-slate-600 dark:text-slate-400",
    hoverBorder: "hover:border-slate-400 dark:hover:border-slate-600",
    accent: "bg-slate-600",
    badgeColor: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
};

const PLATFORM_CAPABILITIES = [
    { icon: Cpu, label: "AI Segmentation", desc: "Every open comment is auto-segmented, categorised, and sentiment-scored by AI" },
    { icon: Network, label: "Cross-Unit Analysis", desc: "Detect when students mention one unit while responding for another" },
    { icon: Star, label: "NPS Measurement", desc: "Net Promoter Score calculated per campus with full score distribution" },
    { icon: LineChart, label: "Year-over-Year", desc: "Compare satisfaction trends across survey cycles side by side" },
    { icon: Target, label: "Action Priority", desc: "Matrix of urgency vs. impact to focus improvement efforts" },
    { icon: ShieldCheck, label: "Role-based Access", desc: "Granular permissions — admins, faculty heads, and viewers" },
];

export default function HomePage() {
    const { role, loading: authLoading, profileLoading } = useAuth();
    const isAdmin = canAccessAdminPages(role);
    const [surveys, setSurveys] = useState<any[]>([]);
    const [stats, setStats] = useState({ survey_count: 0, respondent_count: 0, unit_count: 0, segment_count: 0 });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (authLoading || profileLoading) return;
        const load = async () => {
            const [statsRes, surveysRes] = await Promise.all([
                supabase.rpc("get_platform_stats"),
                isAdmin ? supabase.from("surveys").select("*, respondents(count)").order("created_at", { ascending: false }).limit(6) : Promise.resolve({ data: [] }),
            ]);
            const s = statsRes.data?.[0];
            if (s) setStats({ survey_count: Number(s.survey_count) || 0, respondent_count: Number(s.respondent_count) || 0, unit_count: Number(s.unit_count) || 0, segment_count: Number(s.segment_count) || 0 });
            if (isAdmin) setSurveys((surveysRes as any)?.data || []);
            setLoading(false);
        };
        load();
    }, [authLoading, profileLoading, isAdmin]);

    const visibleModules = isAdmin ? [ADMIN_MODULE, ...MODULES] : MODULES;

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 font-sans">

            {/* ── HERO ─────────────────────────────────────────────────────────── */}
            <div className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-950">
                {/* Grid texture */}
                <div className="absolute inset-0 opacity-[0.07]" style={{
                    backgroundImage: "linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)",
                    backgroundSize: "48px 48px",
                }} />
                {/* Glow orbs */}
                <div className="absolute -top-24 right-1/4 w-[500px] h-[500px] bg-blue-500/20 rounded-full blur-3xl pointer-events-none" />
                <div className="absolute bottom-0 left-1/4 w-[400px] h-[400px] bg-indigo-600/15 rounded-full blur-3xl pointer-events-none" />
                <div className="absolute top-1/2 right-0 w-64 h-64 bg-violet-500/10 rounded-full blur-2xl pointer-events-none" />

                <div className="relative max-w-6xl mx-auto px-8 pt-16 pb-14">
                    {/* Badge */}
                    <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-400/20 rounded-full px-4 py-1.5 text-sm text-blue-300 mb-6">
                        <Sparkles className="w-3.5 h-3.5" />
                        AI-Powered Student Analytics
                    </div>

                    {/* Headline */}
                    <h1 className="text-5xl font-extrabold text-white tracking-tight leading-tight mb-4">
                        Student Voice Platform
                        <br />
                        <span className="bg-gradient-to-r from-blue-400 via-indigo-300 to-violet-400 bg-clip-text text-transparent">
                            Intelligence at Every Level
                        </span>
                    </h1>
                    <p className="text-slate-400 text-xl max-w-2xl mb-10 leading-relaxed">
                        From raw survey CSV to AI-generated executive summaries — complete institutional analytics in one platform.
                    </p>

                    {/* CTA row */}
                    <div className="flex items-center gap-4 mb-14">
                        <Link href="/executive">
                            <Button className="bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/50 gap-2.5 text-base px-7 py-3 h-auto font-semibold rounded-xl">
                                Open Executive Dashboard <ArrowRight className="w-5 h-5" />
                            </Button>
                        </Link>
                    </div>

                    {/* Stats row */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {[
                            { label: "Survey Cycles", value: loading ? "—" : stats.survey_count, icon: Database, suffix: "" },
                            { label: "Student Respondents", value: loading ? "—" : stats.respondent_count.toLocaleString(), icon: Users, suffix: "" },
                            { label: "Service Units", value: loading ? "—" : stats.unit_count, icon: Building2, suffix: "" },
                            { label: "AI-Analysed Segments", value: loading ? "—" : stats.segment_count.toLocaleString(), icon: Zap, suffix: "" },
                        ].map((stat, i) => (
                            <div key={i} className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-5 hover:bg-white/[0.08] transition-all duration-300 group">
                                <div className="flex items-start justify-between mb-3">
                                    <stat.icon className="w-5 h-5 text-blue-400 mt-0.5" />
                                    <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{stat.label}</span>
                                </div>
                                <div className="text-3xl font-black text-white tabular-nums leading-none">{stat.value}{stat.suffix}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* ── PLATFORM CAPABILITIES STRIP ──────────────────────────────────── */}
            <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
                <div className="max-w-6xl mx-auto px-8 py-8">
                    <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-6">Platform Capabilities</p>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                        {PLATFORM_CAPABILITIES.map((cap, i) => (
                            <div key={i} className="flex flex-col gap-2 p-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors">
                                <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg w-fit">
                                    <cap.icon className="w-4 h-4 text-slate-600 dark:text-slate-300" />
                                </div>
                                <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">{cap.label}</p>
                                <p className="text-[11px] text-slate-400 dark:text-slate-500 leading-snug">{cap.desc}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* ── MAIN CONTENT ─────────────────────────────────────────────────── */}
            <div className="max-w-6xl mx-auto px-8 py-12 space-y-14">

                {/* Module Showcase */}
                <div>
                    <div className="flex items-center gap-3 mb-6">
                        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Analytics Modules</h2>
                        <span className="text-sm text-slate-400">— choose where to go</span>
                    </div>

                    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden divide-y divide-slate-100 dark:divide-slate-800">
                        {visibleModules.map((mod, idx) => (
                            <Link key={mod.href} href={mod.href} className="group block">
                                <div className="relative flex items-start gap-6 px-8 py-7 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors duration-150">

                                    {/* Colored left accent bar */}
                                    <div className={`absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b ${mod.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-200`} />

                                    {/* Index number */}
                                    <span className="text-4xl font-black text-slate-100 dark:text-slate-800 tabular-nums leading-none pt-1 select-none w-8 shrink-0 text-right">
                                        {String(idx + 1).padStart(2, "0")}
                                    </span>

                                    {/* Icon */}
                                    <div className={`p-3 ${mod.lightBg} rounded-2xl shrink-0 mt-0.5 group-hover:scale-105 transition-transform duration-200`}>
                                        <mod.icon className={`w-6 h-6 ${mod.iconColor}`} />
                                    </div>

                                    {/* Title + tagline + description */}
                                    <div className="flex-1 min-w-0 space-y-1.5">
                                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">{mod.tagline}</p>
                                        <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 leading-snug group-hover:text-slate-700 dark:group-hover:text-white transition-colors">
                                            {mod.label}
                                        </h3>
                                        <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed max-w-2xl">
                                            {mod.description}
                                        </p>

                                        {/* Feature chips — below description */}
                                        <div className="flex flex-wrap gap-1.5 pt-2">
                                            {mod.features.map((f, fi) => (
                                                <span key={fi} className={`text-[11px] font-medium px-2.5 py-1 rounded-full ${mod.badgeColor}`}>
                                                    {f}
                                                </span>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Arrow CTA */}
                                    <div className="shrink-0 flex items-center self-center pl-4">
                                        <div className={`flex items-center gap-1.5 text-sm font-semibold ${mod.iconColor} opacity-0 group-hover:opacity-100 transition-all duration-200 group-hover:translate-x-0 -translate-x-2`}>
                                            Open <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                                        </div>
                                    </div>

                                </div>
                            </Link>
                        ))}
                    </div>
                </div>

                {/* Recent Surveys — admin only */}
                {isAdmin && (
                    <div className="space-y-5">
                        <div className="flex items-center justify-between">
                            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2.5">
                                <TrendingUp className="w-5 h-5 text-slate-400" />
                                Recent Survey Projects
                            </h2>
                            <Link href="/surveys">
                                <Button variant="ghost" size="sm" className="text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 gap-1.5 text-sm">
                                    View all <ArrowRight className="w-3.5 h-3.5" />
                                </Button>
                            </Link>
                        </div>

                        {loading ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                                {[1, 2, 3].map(i => (
                                    <div key={i} className="h-40 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 animate-pulse" />
                                ))}
                            </div>
                        ) : surveys.length > 0 ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                                {surveys.map((survey) => (
                                    <Link key={survey.id} href={`/surveys/${survey.id}`} className="group">
                                        <Card className="h-full bg-white dark:bg-slate-900 hover:shadow-lg transition-all duration-200 border-slate-200 dark:border-slate-800 hover:border-blue-300 dark:hover:border-blue-700 group-hover:-translate-y-1 overflow-hidden">
                                            <div className="h-1 bg-gradient-to-r from-blue-500 to-indigo-500" />
                                            <CardHeader className="pb-3">
                                                <div className="flex justify-between items-start mb-2">
                                                    <Badge variant="secondary" className="bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-[11px] group-hover:bg-blue-50 group-hover:text-blue-600 dark:group-hover:bg-blue-900/30 dark:group-hover:text-blue-400 transition-colors">
                                                        {new Date(survey.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                                                    </Badge>
                                                    <MessageSquareText className="w-4 h-4 text-slate-300 dark:text-slate-600 group-hover:text-blue-400 transition-colors" />
                                                </div>
                                                <CardTitle className="text-base font-bold text-slate-900 dark:text-slate-100 group-hover:text-blue-700 dark:group-hover:text-blue-400 transition-colors leading-snug">
                                                    {survey.title}
                                                </CardTitle>
                                                <CardDescription className="flex items-center gap-1.5 text-slate-400 dark:text-slate-500 text-sm">
                                                    <Users className="w-3.5 h-3.5" />
                                                    {(survey.respondents?.[0]?.count || 0).toLocaleString()} respondents
                                                </CardDescription>
                                            </CardHeader>
                                            <CardFooter className="pt-0">
                                                <div className="text-sm font-semibold text-blue-600 dark:text-blue-400 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    Open Dashboard <ArrowRight className="w-4 h-4" />
                                                </div>
                                            </CardFooter>
                                        </Card>
                                    </Link>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-20 bg-white dark:bg-slate-900 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-800">
                                <div className="mx-auto w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-4">
                                    <Upload className="w-8 h-8 text-slate-400" />
                                </div>
                                <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-2">No surveys yet</h3>
                                <p className="text-slate-500 dark:text-slate-400 mb-6 max-w-xs mx-auto text-sm">
                                    Import your first CSV file to start analysing student feedback with AI.
                                </p>
                                <Link href="/import">
                                    <Button className="bg-blue-600 hover:bg-blue-700 shadow-sm gap-2">
                                        <Upload className="w-4 h-4" /> Start Your First Import
                                    </Button>
                                </Link>
                            </div>
                        )}
                    </div>
                )}

                {/* Footer strip */}
                <div className="flex items-center justify-between pt-4 border-t border-slate-200 dark:border-slate-800">
                    <div className="flex items-center gap-2 text-sm text-slate-400">
                        <GitBranch className="w-4 h-4" />
                        Student Voice Platform · AI Analytics Engine
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-slate-400">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse inline-block" />
                        System operational
                    </div>
                </div>

            </div>
        </div>
    );
}
