"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { computeSentimentScore } from "@/lib/utils";
import { PageShell, PageHeader } from "@/components/layout/PageShell";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
    GraduationCap, ArrowRight, Search, Users, BookOpen,
    Building2, CheckCircle2, AlertTriangle, XCircle, Target
} from "lucide-react";
import Link from "next/link";
import { useActiveSurvey } from "@/context/SurveyContext";
import { NpsBucketBar } from "@/components/nps/NpsBucketBar";
import { computeNpsScore, npsBenchmarkColor, NpsCounts, emptyNpsCounts } from "@/lib/nps";

// ── Types ────────────────────────────────────────────────────────────────────

interface SentimentData {
    positive: number; negative: number; neutral: number; total: number;
    positive_pct: number; negative_pct: number;
}

interface FacultyListEntry {
    faculty: string;
    respondents: number;
    enrolled: number;
    response_rate: number | null;
    programQuality: { avg_score: number | null; sentiment: SentimentData };
    campusExperience: { avg_score: number | null; sentiment: SentimentData };
}

interface FacultyRow {
    id: number;
    name: string;
    short_name: string | null;
    description: string | null;
    data?: FacultyListEntry;
    nps?: NpsCounts;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function scoreColor(score: number | null) {
    if (score === null) return "text-slate-400 dark:text-slate-600";
    if (score >= 3.20) return "text-emerald-600 dark:text-emerald-400";
    if (score >= 3.00) return "text-amber-600 dark:text-amber-400";
    return "text-red-600 dark:text-red-400";
}

function scoreBorderBg(score: number | null) {
    if (score === null) return "border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50";
    if (score >= 3.20) return "border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30";
    if (score >= 3.00) return "border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30";
    return "border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30";
}

function sentimentColor(s: number) {
    if (s >= 70) return "text-emerald-600 dark:text-emerald-400";
    if (s >= 50) return "text-amber-500 dark:text-amber-400";
    return "text-red-500 dark:text-red-400";
}

function SentimentIcon({ score }: { score: number }) {
    if (score >= 70) return <CheckCircle2 className="w-3 h-3" />;
    if (score >= 50) return <AlertTriangle className="w-3 h-3" />;
    return <XCircle className="w-3 h-3" />;
}

function MiniSentimentBar({ s }: { s: SentimentData }) {
    if (s.total === 0) return <div className="h-1 rounded-full bg-slate-100 dark:bg-slate-800" />;
    return (
        <div className="flex h-1 rounded-full overflow-hidden bg-slate-100 dark:bg-slate-800">
            {s.positive > 0 && <div style={{ width: `${s.positive_pct}%` }} className="bg-emerald-500" />}
            {s.neutral > 0 && <div style={{ width: `${100 - s.positive_pct - s.negative_pct}%` }} className="bg-amber-400" />}
            {s.negative > 0 && <div style={{ width: `${s.negative_pct}%` }} className="bg-red-400" />}
        </div>
    );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function FacultyInsightsPage() {
    const { activeSurveyId, activeSurvey } = useActiveSurvey();
    const [faculties, setFaculties] = useState<FacultyRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");

    useEffect(() => {
        setLoading(true);
        setFaculties([]);
        loadFaculties();
    }, [activeSurveyId]);

    async function loadFaculties() {
        try {
            const { data: rows } = await supabase
                .from("faculties")
                .select("id, name, short_name, description")
                .order("name");
            if (!rows) { setFaculties([]); return; }

            if (!activeSurveyId || activeSurveyId === "all") {
                setFaculties(rows.map(r => ({ ...r })));
                return;
            }

            const [facultyRes, npsRes] = await Promise.all([
                fetch(`/api/executive/faculty-list?surveyId=${activeSurveyId}`).then(r => r.ok ? r.json() : { faculties: [] }),
                fetch(`/api/executive/nps?surveyId=${activeSurveyId}`).then(r => r.ok ? r.json() : { faculties: [] }),
            ]);
            const dataMap = new Map<string, FacultyListEntry>(
                (facultyRes.faculties || []).map((f: FacultyListEntry) => [f.faculty, f])
            );
            // Sum NPS across all NPS units per faculty — handles the multi-NPS-column case.
            const npsByFaculty = new Map<string, NpsCounts>();
            for (const r of (npsRes.faculties || []) as Array<{ faculty: string; detractors: number; passives: number; promoters: number; total: number }>) {
                const cur = npsByFaculty.get(r.faculty) || emptyNpsCounts();
                cur.detractor += r.detractors;
                cur.passive += r.passives;
                cur.promoter += r.promoters;
                cur.total += r.total;
                npsByFaculty.set(r.faculty, cur);
            }

            setFaculties(rows.map(r => ({ ...r, data: dataMap.get(r.name), nps: npsByFaculty.get(r.name) })));
        } finally {
            setLoading(false);
        }
    }

    const filtered = faculties.filter(f =>
        f.name.toLowerCase().includes(search.toLowerCase()) ||
        (f.short_name || "").toLowerCase().includes(search.toLowerCase())
    );

    const withData = faculties.filter(f => f.data);
    const totalRespondents = withData.reduce((s, f) => s + (f.data?.respondents || 0), 0);
    const totalEnrolled = withData.reduce((s, f) => s + (f.data?.enrolled || 0), 0);
    const pqScores = withData.map(f => f.data?.programQuality.avg_score).filter((s): s is number => s !== null);
    const ceScores = withData.map(f => f.data?.campusExperience.avg_score).filter((s): s is number => s !== null);
    const avgPQ = pqScores.length > 0 ? (pqScores.reduce((a, b) => a + b, 0) / pqScores.length).toFixed(2) : null;
    const avgCE = ceScores.length > 0 ? (ceScores.reduce((a, b) => a + b, 0) / ceScores.length).toFixed(2) : null;

    return (
        <PageShell>
            <PageHeader
                title={<span className="flex items-center gap-2"><GraduationCap className="w-6 h-6 text-teal-500" /> Faculty Insights</span>}
                description="Program Quality and Campus Experience scores per faculty."
                actions={
                    activeSurvey ? (
                        <Badge variant="outline" className="bg-teal-50/50 text-teal-700 border-teal-200 dark:bg-teal-950/20 dark:text-teal-300 dark:border-teal-800 gap-1.5 px-3 py-1">
                            <GraduationCap className="w-3.5 h-3.5" /> {activeSurvey.title}
                        </Badge>
                    ) : null
                }
            />

            <div className="max-w-7xl mx-auto px-8 py-8 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">

                {/* Hero banner */}
                {!loading && withData.length > 0 && (
                    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-teal-600 to-cyan-600 p-6 text-white shadow-lg">
                        <div className="absolute -top-8 -right-8 w-36 h-36 bg-white/10 rounded-full pointer-events-none" />
                        <div className="absolute top-3 right-12 w-16 h-16 bg-white/5 rounded-full pointer-events-none" />
                        <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div>
                                <h2 className="text-lg font-black mb-1">Faculty Performance Overview</h2>
                                <p className="text-teal-100 text-sm">
                                    {totalRespondents.toLocaleString()} respondents across {withData.length} faculties
                                    {totalEnrolled > 0 && ` · ${((totalRespondents / totalEnrolled) * 100).toFixed(1)}% response rate`}
                                </p>
                            </div>
                            <div className="flex items-center gap-5 shrink-0">
                                <div className="text-center">
                                    <div className="text-3xl font-black tabular-nums">{avgPQ ?? "—"}</div>
                                    <div className="flex items-center gap-1 justify-center mt-0.5">
                                        <BookOpen className="w-3 h-3 text-teal-200" />
                                        <span className="text-xs text-teal-100">Avg Program Quality</span>
                                    </div>
                                </div>
                                <div className="w-px h-10 bg-white/25 shrink-0" />
                                <div className="text-center">
                                    <div className="text-3xl font-black tabular-nums">{avgCE ?? "—"}</div>
                                    <div className="flex items-center gap-1 justify-center mt-0.5">
                                        <Building2 className="w-3 h-3 text-teal-200" />
                                        <span className="text-xs text-teal-100">Avg Campus Experience</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Stat cards — Faculties + Respondents */}
                {!loading && faculties.length > 0 && (
                    <div className="grid grid-cols-2 gap-3">
                        {[
                            { label: "Faculties", value: faculties.length, icon: GraduationCap, color: "text-teal-600", bg: "bg-teal-50 dark:bg-teal-950/40" },
                            { label: "Respondents", value: totalRespondents > 0 ? totalRespondents.toLocaleString() : "—", icon: Users, color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-950/40" },
                        ].map(stat => (
                            <div key={stat.label} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-5 py-4 flex items-center gap-3">
                                <div className={`p-2 rounded-lg ${stat.bg} shrink-0`}>
                                    <stat.icon className={`w-4 h-4 ${stat.color}`} />
                                </div>
                                <div className="min-w-0">
                                    <div className="text-xl font-black text-slate-900 dark:text-slate-100 tabular-nums leading-tight">{stat.value}</div>
                                    <div className="text-xs text-slate-500 font-medium">{stat.label}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Legend */}
                {!loading && withData.length > 0 && (
                    <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
                        <div className="flex items-center gap-1.5">
                            <div className="w-3 h-3 rounded bg-violet-500 opacity-70" />
                            <span>Program Quality — what students say about their study program's academic services</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <div className="w-3 h-3 rounded bg-cyan-500 opacity-70" />
                            <span>Campus Experience — how satisfied students in this faculty are with campus services</span>
                        </div>
                    </div>
                )}

                {/* Search */}
                <div className="relative max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input placeholder="Search faculties..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
                </div>

                {/* Grid */}
                {loading ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-64 rounded-2xl" />)}
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="text-center py-20 text-slate-400">
                        <GraduationCap className="w-10 h-10 mx-auto mb-3 opacity-30" />
                        <p className="font-medium">{faculties.length === 0 ? "No faculties found. Add faculties in the management page first." : "No faculties match your search."}</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {filtered.map(faculty => {
                            const d = faculty.data;
                            const pqScore = d?.programQuality.avg_score ?? null;
                            const ceScore = d?.campusExperience.avg_score ?? null;
                            const pqSent = d ? computeSentimentScore(d.programQuality.sentiment.positive, d.programQuality.sentiment.neutral, d.programQuality.sentiment.negative) : null;
                            const ceSent = d ? computeSentimentScore(d.campusExperience.sentiment.positive, d.campusExperience.sentiment.neutral, d.campusExperience.sentiment.negative) : null;

                            return (
                                <Link key={faculty.id} href={`/faculty-insights/${faculty.id}`} className="group">
                                    <div className="h-full bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 hover:border-teal-300 dark:hover:border-teal-700 hover:shadow-xl dark:hover:shadow-teal-950/20 transition-all duration-200 group-hover:-translate-y-1 overflow-hidden flex flex-col">

                                        <div className="p-5 flex-1 space-y-4">
                                            {/* Faculty name row */}
                                            <div className="flex items-start gap-3">
                                                <div className="p-2.5 bg-teal-50 dark:bg-teal-950/40 rounded-xl shrink-0 mt-0.5">
                                                    <GraduationCap className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                                                </div>
                                                <div className="min-w-0">
                                                    <h3 className="font-bold text-slate-900 dark:text-slate-100 text-base leading-snug group-hover:text-teal-700 dark:group-hover:text-teal-400 transition-colors">
                                                        {faculty.name}
                                                    </h3>
                                                    {faculty.short_name && (
                                                        <Badge variant="secondary" className="text-[10px] mt-1 font-medium">{faculty.short_name}</Badge>
                                                    )}
                                                </div>
                                            </div>

                                            {d ? (
                                                <>
                                                    {/* Two score blocks side by side */}
                                                    <div className="grid grid-cols-2 gap-2">
                                                        {/* Program Quality */}
                                                        <div className={`rounded-xl border p-3 ${scoreBorderBg(pqScore)}`}>
                                                            <div className="flex items-center gap-1 mb-1.5">
                                                                <BookOpen className="w-3 h-3 text-violet-500 dark:text-violet-400 shrink-0" />
                                                                <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Program Quality</span>
                                                            </div>
                                                            <div className="flex items-end gap-2">
                                                                {pqScore !== null ? (
                                                                    <span className={`text-2xl font-black tabular-nums leading-none ${scoreColor(pqScore)}`}>{pqScore}</span>
                                                                ) : (
                                                                    <span className="text-base font-bold text-slate-300">—</span>
                                                                )}
                                                            </div>
                                                            {d.programQuality.sentiment.total > 0 && (
                                                                <MiniSentimentBar s={d.programQuality.sentiment} />
                                                            )}
                                                        </div>

                                                        {/* Campus Experience */}
                                                        <div className={`rounded-xl border p-3 ${scoreBorderBg(ceScore)}`}>
                                                            <div className="flex items-center gap-1 mb-1.5">
                                                                <Building2 className="w-3 h-3 text-cyan-500 dark:text-cyan-400 shrink-0" />
                                                                <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Campus Exp.</span>
                                                            </div>
                                                            <div className="flex items-end gap-2">
                                                                {ceScore !== null ? (
                                                                    <span className={`text-2xl font-black tabular-nums leading-none ${scoreColor(ceScore)}`}>{ceScore}</span>
                                                                ) : (
                                                                    <span className="text-base font-bold text-slate-300">—</span>
                                                                )}
                                                            </div>
                                                            {d.campusExperience.sentiment.total > 0 && (
                                                                <MiniSentimentBar s={d.campusExperience.sentiment} />
                                                            )}
                                                        </div>
                                                    </div>

                                                    {/* Participation row */}
                                                    {d.response_rate !== null && (
                                                        <div className="flex items-center gap-3 text-xs text-slate-400">
                                                            <span className={`flex items-center gap-1 font-semibold ${d.response_rate >= 80 ? "text-emerald-600" : d.response_rate >= 50 ? "text-amber-500" : "text-red-500"}`}>
                                                                <Target className="w-3 h-3" />
                                                                {d.response_rate}% response rate
                                                            </span>
                                                        </div>
                                                    )}

                                                    {/* NPS strip — only when this faculty has NPS responses */}
                                                    {faculty.nps && faculty.nps.total > 0 && (() => {
                                                        const nps = computeNpsScore(faculty.nps);
                                                        return (
                                                            <div className="rounded-lg border border-blue-100 dark:border-blue-900/40 bg-blue-50/40 dark:bg-blue-950/20 px-3 py-2">
                                                                <div className="flex items-center justify-between gap-2 mb-1.5">
                                                                    <span className="text-[10px] font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400 flex items-center gap-1">
                                                                        <Target className="w-3 h-3" /> NPS
                                                                    </span>
                                                                    <span className={`text-base font-black tabular-nums ${npsBenchmarkColor(nps)}`}>
                                                                        {nps === null ? "—" : nps > 0 ? `+${nps}` : nps}
                                                                    </span>
                                                                </div>
                                                                <NpsBucketBar counts={faculty.nps} variant="mini" showLabels={false} />
                                                                <p className="text-[10px] text-slate-400 mt-1.5">n = {faculty.nps.total.toLocaleString()}</p>
                                                            </div>
                                                        );
                                                    })()}
                                                </>
                                            ) : (
                                                <div className="text-xs text-slate-400 flex items-center gap-1.5">
                                                    <Users className="w-3.5 h-3.5" />
                                                    {activeSurveyId && activeSurveyId !== "all"
                                                        ? "No data for this survey"
                                                        : "Select a survey to see scores"}
                                                </div>
                                            )}

                                            {faculty.description && (
                                                <p className="text-xs text-slate-400 dark:text-slate-500 line-clamp-2 leading-relaxed">
                                                    {faculty.description}
                                                </p>
                                            )}
                                        </div>

                                        {/* Footer */}
                                        <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
                                            <span className="text-xs font-semibold text-slate-400 group-hover:text-teal-600 dark:group-hover:text-teal-400 flex items-center gap-1 transition-colors">
                                                View Details
                                                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                                            </span>
                                        </div>
                                    </div>
                                </Link>
                            );
                        })}
                    </div>
                )}
            </div>
        </PageShell>
    );
}
