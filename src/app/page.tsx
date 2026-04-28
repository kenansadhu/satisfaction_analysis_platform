"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { Card, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    ArrowRight, Database, Users, Building2, Sparkles,
    TrendingUp, Zap, PieChart, GraduationCap, Activity,
    LayoutDashboard, Upload, Loader2, BrainCircuit,
} from "lucide-react";

export default function HomePage() {
    const [surveys, setSurveys] = useState<any[]>([]);
    const [totalUnits, setTotalUnits] = useState(0);
    const [totalSegments, setTotalSegments] = useState(0);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const load = async () => {
            const [surveysRes, unitsRes, segmentsRes] = await Promise.all([
                supabase.from("surveys").select("*, respondents(count)").order("created_at", { ascending: false }),
                supabase.from("organization_units").select("*", { count: "exact", head: true }),
                supabase.from("feedback_segments").select("*", { count: "exact", head: true }),
            ]);
            setSurveys(surveysRes.data || []);
            setTotalUnits(unitsRes.count || 0);
            setTotalSegments(segmentsRes.count || 0);
            setLoading(false);
        };
        load();
    }, []);

    const totalRespondents = surveys.reduce((acc, s) => acc + (s.respondents?.[0]?.count || 0), 0);

    const quickActions = [
        {
            href: "/surveys",
            icon: LayoutDashboard,
            label: "Surveys",
            description: "Manage and analyze survey projects",
            color: "purple",
            iconBg: "bg-purple-50 dark:bg-purple-950/40",
            iconColor: "text-purple-600 dark:text-purple-400",
            hoverBorder: "hover:border-purple-300 dark:hover:border-purple-700",
            hoverArrow: "group-hover:text-purple-500",
        },
        {
            href: "/faculty-insights",
            icon: GraduationCap,
            label: "Faculty Insights",
            description: "Per-faculty participation and sentiment",
            color: "teal",
            iconBg: "bg-teal-50 dark:bg-teal-950/40",
            iconColor: "text-teal-600 dark:text-teal-400",
            hoverBorder: "hover:border-teal-300 dark:hover:border-teal-700",
            hoverArrow: "group-hover:text-teal-500",
        },
        {
            href: "/unit-insights",
            icon: PieChart,
            label: "Unit Insights",
            description: "Dashboard and AI analysis per unit",
            color: "indigo",
            iconBg: "bg-indigo-50 dark:bg-indigo-950/40",
            iconColor: "text-indigo-600 dark:text-indigo-400",
            hoverBorder: "hover:border-indigo-300 dark:hover:border-indigo-700",
            hoverArrow: "group-hover:text-indigo-500",
        },
        {
            href: "/executive",
            icon: Activity,
            label: "Executive Insights",
            description: "Reports, year comparison, and suggestions",
            color: "blue",
            iconBg: "bg-blue-50 dark:bg-blue-950/40",
            iconColor: "text-blue-600 dark:text-blue-400",
            hoverBorder: "hover:border-blue-300 dark:hover:border-blue-700",
            hoverArrow: "group-hover:text-blue-500",
        },
        {
            href: "/ai-scientist",
            icon: BrainCircuit,
            label: "AI Data Scientist",
            description: "Conversational AI analysis and saved charts",
            color: "violet",
            iconBg: "bg-violet-50 dark:bg-violet-950/40",
            iconColor: "text-violet-600 dark:text-violet-400",
            hoverBorder: "hover:border-violet-300 dark:hover:border-violet-700",
            hoverArrow: "group-hover:text-violet-500",
        },
    ];

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 font-sans transition-colors duration-300">

            {/* HERO */}
            <div className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-950">
                <div className="absolute inset-0 opacity-10" style={{
                    backgroundImage: "linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)",
                    backgroundSize: "60px 60px",
                }} />
                <div className="absolute top-0 right-1/4 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl" />
                <div className="absolute bottom-0 left-1/3 w-64 h-64 bg-indigo-500/15 rounded-full blur-3xl" />

                <div className="relative max-w-6xl mx-auto px-8 py-16">
                    <div className="space-y-3">
                        <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-400/20 rounded-full px-4 py-1.5 text-sm text-blue-300">
                            <Sparkles className="w-3.5 h-3.5" />
                            AI-Powered Analytics Platform
                        </div>
                        <h1 className="text-4xl font-bold text-white tracking-tight">
                            Student Voice Platform<br />
                            <span className="bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">
                                AI Analytics and Insights
                            </span>
                        </h1>
                        <p className="text-slate-400 text-lg max-w-md">
                            Transforming raw student feedback into actionable intelligence
                        </p>
                    </div>

                    {/* Stats */}
                    <div className="grid grid-cols-4 gap-4 mt-12">
                        {[
                            { label: "Active Surveys", value: loading ? "—" : surveys.length, icon: Database },
                            { label: "Respondents", value: loading ? "—" : totalRespondents.toLocaleString(), icon: Users },
                            { label: "Units Tracked", value: loading ? "—" : totalUnits, icon: Building2 },
                            { label: "AI Segments", value: loading ? "—" : totalSegments.toLocaleString(), icon: Zap },
                        ].map((stat, i) => (
                            <div key={i} className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-5 hover:bg-white/10 transition-all duration-300">
                                <stat.icon className="w-5 h-5 text-blue-400 mb-2" />
                                <div className="text-2xl font-bold text-white">{stat.value}</div>
                                <div className="text-sm text-slate-400">{stat.label}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* MAIN CONTENT */}
            <div className="max-w-6xl mx-auto px-8 py-12 space-y-10">

                {/* Quick Actions */}
                <div>
                    <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-4">Quick Access</h2>
                    <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                        {quickActions.map((action) => (
                            <Link key={action.href} href={action.href} className="group">
                                <div className={`flex flex-col h-full min-h-[156px] p-6 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 ${action.hoverBorder} hover:shadow-lg transition-all duration-200 group-hover:-translate-y-1`}>
                                    <div className={`p-3 ${action.iconBg} rounded-xl w-fit mb-4 transition-colors`}>
                                        <action.icon className={`w-6 h-6 ${action.iconColor}`} />
                                    </div>
                                    <div className="flex-1">
                                        <div className="font-bold text-slate-900 dark:text-slate-100 text-base mb-1">{action.label}</div>
                                        <div className="text-sm text-slate-500 dark:text-slate-400 leading-snug">{action.description}</div>
                                    </div>
                                    <div className="mt-4">
                                        <ArrowRight className={`w-4 h-4 text-slate-300 dark:text-slate-600 ${action.hoverArrow} group-hover:translate-x-1 transition-all duration-200`} />
                                    </div>
                                </div>
                            </Link>
                        ))}
                    </div>
                </div>

                {/* Survey Grid */}
                <div className="space-y-4">
                    <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                        <TrendingUp className="w-5 h-5 text-slate-400" /> Recent Survey Projects
                    </h2>

                    {loading ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {[1, 2, 3].map(i => (
                                <div key={i} className="h-40 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 animate-pulse" />
                            ))}
                        </div>
                    ) : surveys.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {surveys.map((survey) => (
                                <Link key={survey.id} href={`/surveys/${survey.id}`} className="group">
                                    <Card className="h-full bg-white dark:bg-slate-900 hover:shadow-lg transition-all duration-200 border-slate-200 dark:border-slate-800 hover:border-blue-300 dark:hover:border-blue-700 cursor-pointer group-hover:-translate-y-1 overflow-hidden">
                                        <div className="h-1 bg-gradient-to-r from-blue-500 to-indigo-500" />
                                        <CardHeader>
                                            <div className="flex justify-between items-start mb-2">
                                                <Badge variant="secondary" className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 group-hover:bg-blue-50 dark:group-hover:bg-blue-900/30 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                                                    {new Date(survey.created_at).toLocaleDateString()}
                                                </Badge>
                                            </div>
                                            <CardTitle className="text-lg text-slate-900 dark:text-slate-100 group-hover:text-blue-700 dark:group-hover:text-blue-400 transition-colors">
                                                {survey.title}
                                            </CardTitle>
                                            <CardDescription className="flex items-center gap-1.5 dark:text-slate-300">
                                                <Users className="w-3.5 h-3.5" />
                                                {survey.respondents?.[0]?.count || 0} Respondents
                                            </CardDescription>
                                        </CardHeader>
                                        <CardFooter className="pt-0">
                                            <div className="text-sm font-medium text-blue-600 dark:text-blue-400 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                Open Dashboard <ArrowRight className="w-4 h-4" />
                                            </div>
                                        </CardFooter>
                                    </Card>
                                </Link>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-20 bg-white dark:bg-slate-900 rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-800">
                            <div className="mx-auto w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-4">
                                <Upload className="w-8 h-8 text-slate-400" />
                            </div>
                            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">No surveys yet</h3>
                            <p className="text-slate-500 dark:text-slate-300 mb-6 max-w-md mx-auto">
                                Import your first CSV file to begin analyzing student feedback with AI.
                            </p>
                            <Link href="/import">
                                <Button className="bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 shadow-sm gap-2">
                                    <Upload className="w-4 h-4" /> Start Your First Import
                                </Button>
                            </Link>
                        </div>
                    )}
                </div>

            </div>
        </div>
    );
}
