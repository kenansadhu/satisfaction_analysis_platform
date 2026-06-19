"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { PageShell, PageHeader } from "@/components/layout/PageShell";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { InfoHint } from "@/components/ui/info-hint";
import {
    GraduationCap, ArrowRight, Search, BookOpen,
    Building2, CheckCircle2, AlertTriangle, XCircle, Target, TrendingUp, TrendingDown
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
    useEffect(() => { document.title = "Faculty Insights | Satisfaction Voice"; }, []);
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

    const overallRR = totalEnrolled > 0 ? Math.round((totalRespondents / totalEnrolled) * 100) : null;
    const strongFaculties = pqScores.filter(s => s >= 3.20).length;
    const fairFaculties = pqScores.filter(s => s >= 3.00 && s < 3.20).length;
    const poorFaculties = pqScores.filter(s => s < 3.00).length;
    const topFaculty = withData.length > 0
        ? [...withData].sort((a, b) => (b.data?.programQuality.avg_score ?? 0) - (a.data?.programQuality.avg_score ?? 0))[0]
        : null;
    const overallNps = faculties.reduce((acc, f) => {
        if (!f.nps) return acc;
        return { promoter: acc.promoter + f.nps.promoter, passive: acc.passive + f.nps.passive, detractor: acc.detractor + f.nps.detractor, total: acc.total + f.nps.total };
    }, { promoter: 0, passive: 0, detractor: 0, total: 0 });
    const overallNpsScore = overallNps.total > 0 ? computeNpsScore(overallNps) : null;

    const bottomFaculty = withData.length > 0
        ? [...withData].sort((a, b) => (a.data?.programQuality.avg_score ?? 0) - (b.data?.programQuality.avg_score ?? 0))[0]
        : null;
    const facultiesWithNps = faculties.filter((f): f is typeof f & { nps: NpsCounts } => !!(f.nps && f.nps.total > 0));
    const topNpsFaculty = facultiesWithNps.length > 0
        ? [...facultiesWithNps].sort((a, b) => computeNpsScore(b.nps) - computeNpsScore(a.nps))[0]
        : null;
    const bottomNpsFaculty = facultiesWithNps.length > 1
        ? [...facultiesWithNps].sort((a, b) => computeNpsScore(a.nps) - computeNpsScore(b.nps))[0]
        : null;

    const totalPQPos = withData.reduce((s, f) => s + (f.data?.programQuality.sentiment.positive || 0), 0);
    const totalPQNeg = withData.reduce((s, f) => s + (f.data?.programQuality.sentiment.negative || 0), 0);
    const totalPQTotal = withData.reduce((s, f) => s + (f.data?.programQuality.sentiment.total || 0), 0);
    const pqPosPct = totalPQTotal > 0 ? Math.round((totalPQPos / totalPQTotal) * 100) : 0;
    const pqNegPct = totalPQTotal > 0 ? Math.round((totalPQNeg / totalPQTotal) * 100) : 0;

    const totalCEPos = withData.reduce((s, f) => s + (f.data?.campusExperience.sentiment.positive || 0), 0);
    const totalCENeg = withData.reduce((s, f) => s + (f.data?.campusExperience.sentiment.negative || 0), 0);
    const totalCETotal = withData.reduce((s, f) => s + (f.data?.campusExperience.sentiment.total || 0), 0);
    const cePosPct = totalCETotal > 0 ? Math.round((totalCEPos / totalCETotal) * 100) : 0;
    const ceNegPct = totalCETotal > 0 ? Math.round((totalCENeg / totalCETotal) * 100) : 0;

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

                {/* Hero Card */}
                {!loading && withData.length > 0 && (
                    <div className="relative rounded-2xl overflow-hidden bg-gradient-to-br from-slate-900 via-teal-950 to-slate-900 border border-teal-900/50 shadow-2xl">
                        {/* Decorative blobs */}
                        <div className="absolute -top-20 -left-20 w-72 h-72 rounded-full bg-teal-600/20 blur-3xl pointer-events-none" />
                        <div className="absolute -bottom-16 -right-16 w-64 h-64 rounded-full bg-cyan-600/15 blur-3xl pointer-events-none" />
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-32 rounded-full bg-teal-500/5 blur-2xl pointer-events-none" />

                        {/* Main content */}
                        <div className="relative flex flex-col lg:flex-row gap-0 divide-y lg:divide-y-0 lg:divide-x divide-white/10">

                            {/* Left: Avg PQ Score */}
                            <div className="flex flex-col items-center justify-center px-10 py-8 lg:w-60 shrink-0 gap-1">
                                <div className="text-xs font-semibold uppercase tracking-widest text-teal-300/70 mb-1 flex items-center gap-1.5">
                                    <BookOpen className="w-3 h-3" /> Program Quality
                                    <InfoHint side="bottom" iconClassName="text-teal-300/60 hover:text-teal-100">
                                        <strong>Program Quality SSI (1–4)</strong> — how students rate their own study program (teaching, curriculum, advising). Average Likert score across each faculty's study-program questions.
                                        <br /><br />Benchmarks: ≥3.20 strong · 3.00–3.19 fair · &lt;3.00 needs attention.
                                    </InfoHint>
                                </div>
                                <div className={`text-5xl font-black tabular-nums leading-none ${
                                    avgPQ !== null && parseFloat(avgPQ) >= 3.20 ? "text-emerald-400" :
                                    avgPQ !== null && parseFloat(avgPQ) >= 3.00 ? "text-amber-400" : "text-red-400"
                                }`}>{avgPQ ?? "—"}</div>
                                <div className="text-sm text-teal-200/40 font-medium mt-1">out of 4.00</div>
                                <div className="mt-3 text-center">
                                    <div className="text-base font-semibold text-white/80">{withData.length} <span className="text-white/40 font-normal">of</span> {faculties.length}</div>
                                    <div className="text-xs text-teal-300/60 font-medium uppercase tracking-wide">faculties analyzed</div>
                                </div>
                            </div>

                            {/* Center-left: Avg CE Score */}
                            <div className="flex flex-col items-center justify-center px-10 py-8 lg:w-60 shrink-0 gap-1">
                                <div className="text-xs font-semibold uppercase tracking-widest text-teal-300/70 mb-1 flex items-center gap-1.5">
                                    <Building2 className="w-3 h-3" /> Campus Experience
                                    <InfoHint side="bottom" iconClassName="text-teal-300/60 hover:text-teal-100">
                                        <strong>Campus Experience SSI (1–4)</strong> — how students rate shared campus services (Library, IT, Student Affairs, Finance, Facilities, etc.). Average across each faculty's ratings of those service units.
                                        <br /><br />Same benchmarks as Program Quality.
                                    </InfoHint>
                                </div>
                                <div className={`text-5xl font-black tabular-nums leading-none ${
                                    avgCE !== null && parseFloat(avgCE) >= 3.20 ? "text-emerald-400" :
                                    avgCE !== null && parseFloat(avgCE) >= 3.00 ? "text-amber-400" : "text-red-400"
                                }`}>{avgCE ?? "—"}</div>
                                <div className="text-sm text-teal-200/40 font-medium mt-1">out of 4.00</div>
                                <div className="mt-3 text-center">
                                    <div className="text-base font-semibold text-white/80">
                                        {overallRR !== null ? <span className={overallRR >= 80 ? "text-emerald-400" : overallRR >= 50 ? "text-amber-400" : "text-red-400"}>{overallRR}%</span> : "—"}
                                    </div>
                                    <div className="text-xs text-teal-300/60 font-medium uppercase tracking-wide">response rate</div>
                                </div>
                            </div>

                            {/* Column 3: NPS */}
                            <div className="flex flex-col justify-center gap-5 px-8 py-8 lg:w-64 shrink-0">
                                <div className="text-xs font-semibold uppercase tracking-widest text-teal-300/70 flex items-center gap-1.5">
                                    <Target className="w-3 h-3" /> NPS Score
                                    <InfoHint side="bottom" iconClassName="text-teal-300/60 hover:text-teal-100">
                                        <strong>Net Promoter Score (−100 to +100)</strong> — % promoters (9–10) minus % detractors (0–6), aggregated across all NPS questions and faculties.<br /><br />Benchmarks: ≥50 excellent · 0–49 good · &lt;0 concern.
                                    </InfoHint>
                                </div>
                                <div className={`text-4xl font-black tabular-nums leading-none ${overallNpsScore === null ? "text-white/30" : overallNpsScore >= 50 ? "text-emerald-400" : overallNpsScore >= 0 ? "text-amber-400" : "text-red-400"}`}>
                                    {overallNpsScore !== null ? (overallNpsScore > 0 ? `+${overallNpsScore}` : overallNpsScore) : "—"}
                                </div>
                                {topNpsFaculty && (
                                    <div>
                                        <div className="text-[10px] font-semibold uppercase tracking-widest text-teal-300/50 mb-1 flex items-center gap-1">
                                            <TrendingUp className="w-3 h-3 text-emerald-400" /> Highest NPS
                                        </div>
                                        <div className="text-xs font-bold text-white/80 truncate">{topNpsFaculty.short_name || topNpsFaculty.name}</div>
                                        <div className={`text-base font-black tabular-nums leading-none mt-0.5 ${computeNpsScore(topNpsFaculty.nps!) >= 50 ? "text-emerald-400" : computeNpsScore(topNpsFaculty.nps!) >= 0 ? "text-amber-400" : "text-red-400"}`}>
                                            {(() => { const s = computeNpsScore(topNpsFaculty.nps!); return s > 0 ? `+${s}` : s; })()}
                                        </div>
                                    </div>
                                )}
                                {bottomNpsFaculty && (
                                    <div>
                                        <div className="text-[10px] font-semibold uppercase tracking-widest text-teal-300/50 mb-1 flex items-center gap-1">
                                            <TrendingDown className="w-3 h-3 text-red-400" /> Lowest NPS
                                        </div>
                                        <div className="text-xs font-bold text-white/80 truncate">{bottomNpsFaculty.short_name || bottomNpsFaculty.name}</div>
                                        <div className={`text-base font-black tabular-nums leading-none mt-0.5 ${computeNpsScore(bottomNpsFaculty.nps!) >= 50 ? "text-emerald-400" : computeNpsScore(bottomNpsFaculty.nps!) >= 0 ? "text-amber-400" : "text-red-400"}`}>
                                            {(() => { const s = computeNpsScore(bottomNpsFaculty.nps!); return s > 0 ? `+${s}` : s; })()}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Column 4: PQ Rankings */}
                            <div className="flex flex-col justify-center gap-5 px-8 py-8 flex-1 min-w-0">
                                <div className="text-xs font-semibold uppercase tracking-widest text-teal-300/70">
                                    PQ Rankings
                                </div>
                                {topFaculty && (
                                    <div>
                                        <div className="text-[10px] font-semibold uppercase tracking-widest text-teal-300/50 mb-1.5 flex items-center gap-1">
                                            <TrendingUp className="w-3 h-3 text-emerald-400" /> Top Faculty
                                        </div>
                                        <div className="flex items-start gap-2">
                                            <div className="p-1.5 bg-emerald-500/20 rounded-lg shrink-0 mt-0.5">
                                                <GraduationCap className="w-3.5 h-3.5 text-emerald-400" />
                                            </div>
                                            <div className="min-w-0">
                                                <div className="text-xs font-bold text-white/80 truncate">{topFaculty.short_name || topFaculty.name}</div>
                                                <div className={`text-lg font-black tabular-nums leading-none mt-0.5 ${scoreColor(topFaculty.data?.programQuality.avg_score ?? null)}`}>
                                                    {topFaculty.data?.programQuality.avg_score?.toFixed(2) ?? "—"}
                                                    <span className="text-xs font-medium text-white/30 ml-0.5">/4.00</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                                {bottomFaculty && bottomFaculty.id !== topFaculty?.id && (
                                    <div>
                                        <div className="text-[10px] font-semibold uppercase tracking-widest text-teal-300/50 mb-1.5 flex items-center gap-1">
                                            <TrendingDown className="w-3 h-3 text-red-400" /> Lowest Faculty
                                        </div>
                                        <div className="flex items-start gap-2">
                                            <div className="p-1.5 bg-red-500/20 rounded-lg shrink-0 mt-0.5">
                                                <GraduationCap className="w-3.5 h-3.5 text-red-400" />
                                            </div>
                                            <div className="min-w-0">
                                                <div className="text-xs font-bold text-white/80 truncate">{bottomFaculty.short_name || bottomFaculty.name}</div>
                                                <div className={`text-lg font-black tabular-nums leading-none mt-0.5 ${scoreColor(bottomFaculty.data?.programQuality.avg_score ?? null)}`}>
                                                    {bottomFaculty.data?.programQuality.avg_score?.toFixed(2) ?? "—"}
                                                    <span className="text-xs font-medium text-white/30 ml-0.5">/4.00</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Bottom strip: Faculty Distribution + Sentiment Bars */}
                        <div className="relative border-t border-white/10 px-8 py-5 flex flex-col lg:flex-row gap-6">
                            {/* Faculty tier distribution */}
                            {pqScores.length > 0 && (
                                <div className="lg:w-64 shrink-0 space-y-3">
                                    <div className="text-[10px] font-semibold uppercase tracking-widest text-teal-300/70">Faculty Score Distribution (PQ)</div>
                                    <div className="space-y-2">
                                        <div className="flex items-center gap-3">
                                            <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 shrink-0" />
                                            <div className="flex-1 min-w-0">
                                                <div className="flex justify-between items-baseline mb-1">
                                                    <span className="text-[11px] font-semibold text-emerald-300">Strong</span>
                                                    <span className="text-[10px] text-white/40 tabular-nums">{strongFaculties}</span>
                                                </div>
                                                <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                                                    <div className="h-full rounded-full bg-emerald-400 transition-all duration-700"
                                                        style={{ width: pqScores.length > 0 ? `${(strongFaculties / pqScores.length) * 100}%` : "0%" }} />
                                                </div>
                                            </div>
                                            <span className="text-[10px] text-white/30 w-10 text-right shrink-0">≥ 3.20</span>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <div className="w-2.5 h-2.5 rounded-full bg-amber-400 shrink-0" />
                                            <div className="flex-1 min-w-0">
                                                <div className="flex justify-between items-baseline mb-1">
                                                    <span className="text-[11px] font-semibold text-amber-300">Fair</span>
                                                    <span className="text-[10px] text-white/40 tabular-nums">{fairFaculties}</span>
                                                </div>
                                                <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                                                    <div className="h-full rounded-full bg-amber-400 transition-all duration-700"
                                                        style={{ width: pqScores.length > 0 ? `${(fairFaculties / pqScores.length) * 100}%` : "0%" }} />
                                                </div>
                                            </div>
                                            <span className="text-[10px] text-white/30 w-10 text-right shrink-0">3.00–</span>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <div className="w-2.5 h-2.5 rounded-full bg-red-400 shrink-0" />
                                            <div className="flex-1 min-w-0">
                                                <div className="flex justify-between items-baseline mb-1">
                                                    <span className="text-[11px] font-semibold text-red-300">Needs Attention</span>
                                                    <span className="text-[10px] text-white/40 tabular-nums">{poorFaculties}</span>
                                                </div>
                                                <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                                                    <div className="h-full rounded-full bg-red-400 transition-all duration-700"
                                                        style={{ width: pqScores.length > 0 ? `${(poorFaculties / pqScores.length) * 100}%` : "0%" }} />
                                                </div>
                                            </div>
                                            <span className="text-[10px] text-white/30 w-10 text-right shrink-0">&lt; 3.00</span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Sentiment bars */}
                            <div className="flex-1 flex flex-col gap-3 justify-center">
                                {totalPQTotal > 0 && (
                                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                                        <div className="text-xs font-semibold uppercase tracking-widest text-violet-300/70 shrink-0 w-40">Program Quality</div>
                                        <div className="flex-1 flex flex-col gap-1 min-w-0">
                                            <div className="flex h-2 rounded-full overflow-hidden bg-white/10">
                                                {pqPosPct > 0 && <div style={{ width: `${pqPosPct}%` }} className="bg-violet-400 transition-all duration-700" />}
                                                {(100 - pqPosPct - pqNegPct) > 0 && <div style={{ width: `${100 - pqPosPct - pqNegPct}%` }} className="bg-violet-300/30 transition-all duration-700" />}
                                                {pqNegPct > 0 && <div style={{ width: `${pqNegPct}%` }} className="bg-red-400 transition-all duration-700" />}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-4 shrink-0 text-xs font-semibold tabular-nums">
                                            <span className="text-violet-300">{pqPosPct}% pos</span>
                                            <span className="text-white/20">·</span>
                                            <span className="text-red-400">{pqNegPct}% neg</span>
                                        </div>
                                    </div>
                                )}
                                {totalCETotal > 0 && (
                                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                                        <div className="text-xs font-semibold uppercase tracking-widest text-cyan-300/70 shrink-0 w-40">Campus Experience</div>
                                        <div className="flex-1 flex flex-col gap-1 min-w-0">
                                            <div className="flex h-2 rounded-full overflow-hidden bg-white/10">
                                                {cePosPct > 0 && <div style={{ width: `${cePosPct}%` }} className="bg-cyan-400 transition-all duration-700" />}
                                                {(100 - cePosPct - ceNegPct) > 0 && <div style={{ width: `${100 - cePosPct - ceNegPct}%` }} className="bg-cyan-300/30 transition-all duration-700" />}
                                                {ceNegPct > 0 && <div style={{ width: `${ceNegPct}%` }} className="bg-red-400 transition-all duration-700" />}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-4 shrink-0 text-xs font-semibold tabular-nums">
                                            <span className="text-cyan-300">{cePosPct}% pos</span>
                                            <span className="text-white/20">·</span>
                                            <span className="text-red-400">{ceNegPct}% neg</span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* Search */}
                <div className="relative max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input placeholder="Search faculties..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
                </div>

                {/* Row list */}
                {loading ? (
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden divide-y divide-slate-100 dark:divide-slate-800">
                        {Array.from({ length: 6 }).map((_, i) => (
                            <div key={i} className="px-8 py-5 flex items-center gap-6">
                                <Skeleton className="w-6 h-6 rounded" />
                                <Skeleton className="w-10 h-10 rounded-xl shrink-0" />
                                <Skeleton className="h-5 flex-1 rounded" />
                                <Skeleton className="w-20 h-8 rounded-lg" />
                                <Skeleton className="w-20 h-8 rounded-lg" />
                                <Skeleton className="w-20 h-4 rounded" />
                                <Skeleton className="w-14 h-6 rounded" />
                            </div>
                        ))}
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="text-center py-20 text-slate-400">
                        <GraduationCap className="w-10 h-10 mx-auto mb-3 opacity-30" />
                        <p className="font-medium">{faculties.length === 0 ? "No faculties found." : "No faculties match your search."}</p>
                    </div>
                ) : (
                    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-slate-50 dark:bg-slate-950">
                        {/* Column header */}
                        <div className="hidden lg:flex items-center gap-6 px-6 py-3 bg-slate-50 dark:bg-slate-950 text-[10px] font-semibold uppercase tracking-widest text-slate-400 border-b border-slate-200 dark:border-slate-800">
                            <span className="w-6 shrink-0" />
                            <span className="w-10 shrink-0" />
                            <span className="flex-1">Faculty</span>
                            <span className="w-28 shrink-0 text-center">Prog. Quality</span>
                            <span className="w-28 shrink-0 text-center">Campus Exp.</span>
                            <span className="w-28 shrink-0">Response Rate</span>
                            <span className="w-20 shrink-0 text-right">NPS</span>
                            <span className="w-5 shrink-0" />
                        </div>

                        <div className="p-2 space-y-1">
                        {filtered.map((faculty, idx) => {
                            const d = faculty.data;
                            const pqScore = d?.programQuality.avg_score ?? null;
                            const ceScore = d?.campusExperience.avg_score ?? null;
                            const npsScore = faculty.nps && faculty.nps.total > 0 ? computeNpsScore(faculty.nps) : null;
                            const rr = d?.response_rate ?? null;

                            return (
                                <Link key={faculty.id} href={`/faculty-insights/${faculty.id}`} className="group block rounded-xl">
                                    <div className="relative flex items-center gap-6 px-5 py-4 rounded-xl overflow-hidden bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800/60 hover:border-teal-200 dark:hover:border-teal-800/60 hover:shadow-md dark:hover:shadow-teal-950/20 transition-all duration-200 cursor-pointer">
                                        {/* Left accent — subtle always, bright on hover */}
                                        <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-teal-200 dark:bg-teal-900 group-hover:bg-teal-500 transition-colors duration-200" />

                                        {/* Index */}
                                        <span className="text-2xl font-black text-slate-100 dark:text-slate-800 tabular-nums leading-none select-none w-6 shrink-0 text-right">
                                            {String(idx + 1).padStart(2, "0")}
                                        </span>

                                        {/* Icon */}
                                        <div className="p-2.5 bg-teal-50 dark:bg-teal-950/40 rounded-xl shrink-0 group-hover:bg-teal-100 dark:group-hover:bg-teal-900/60 transition-colors duration-200">
                                            <GraduationCap className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                                        </div>

                                        {/* Name */}
                                        <div className="flex-1 min-w-0">
                                            <p className="font-bold text-slate-900 dark:text-slate-100 text-base leading-snug group-hover:text-teal-700 dark:group-hover:text-teal-400 transition-colors truncate">
                                                {faculty.name}
                                            </p>
                                            {faculty.short_name && (
                                                <Badge variant="secondary" className="text-[10px] mt-0.5 font-medium">{faculty.short_name}</Badge>
                                            )}
                                        </div>

                                        {/* Program Quality */}
                                        <div className="hidden lg:flex w-28 shrink-0 flex-col items-center gap-1.5">
                                            {pqScore !== null ? (
                                                <>
                                                    <span className={`text-lg font-black tabular-nums leading-none ${scoreColor(pqScore)}`}>{pqScore}</span>
                                                    {d && d.programQuality.sentiment.total > 0 && (
                                                        <div className="w-full"><MiniSentimentBar s={d.programQuality.sentiment} /></div>
                                                    )}
                                                </>
                                            ) : (
                                                <span className="text-slate-300 dark:text-slate-600 text-sm font-bold">—</span>
                                            )}
                                        </div>

                                        {/* Campus Experience */}
                                        <div className="hidden lg:flex w-28 shrink-0 flex-col items-center gap-1.5">
                                            {ceScore !== null ? (
                                                <>
                                                    <span className={`text-lg font-black tabular-nums leading-none ${scoreColor(ceScore)}`}>{ceScore}</span>
                                                    {d && d.campusExperience.sentiment.total > 0 && (
                                                        <div className="w-full"><MiniSentimentBar s={d.campusExperience.sentiment} /></div>
                                                    )}
                                                </>
                                            ) : (
                                                <span className="text-slate-300 dark:text-slate-600 text-sm font-bold">—</span>
                                            )}
                                        </div>

                                        {/* Response rate */}
                                        <div className="hidden lg:block w-28 shrink-0">
                                            {rr !== null ? (
                                                <span className={`text-sm font-bold flex items-center gap-1.5 ${rr >= 80 ? "text-emerald-600 dark:text-emerald-400" : rr >= 50 ? "text-amber-500 dark:text-amber-400" : "text-red-500 dark:text-red-400"}`}>
                                                    <Target className="w-3.5 h-3.5 shrink-0" />
                                                    {rr}%
                                                </span>
                                            ) : (
                                                <span className="text-slate-300 dark:text-slate-600 text-sm">—</span>
                                            )}
                                        </div>

                                        {/* NPS */}
                                        <div className="hidden lg:block w-20 shrink-0 text-right">
                                            {npsScore !== null ? (
                                                <span className={`text-lg font-black tabular-nums ${npsBenchmarkColor(npsScore)}`}>
                                                    {npsScore > 0 ? `+${npsScore}` : npsScore}
                                                </span>
                                            ) : (
                                                <span className="text-slate-300 dark:text-slate-600 text-sm">—</span>
                                            )}
                                        </div>

                                        {/* Arrow — always visible, animates on hover */}
                                        <ArrowRight className="w-4 h-4 text-slate-300 dark:text-slate-600 group-hover:text-teal-500 group-hover:translate-x-1 transition-all duration-200 shrink-0" />
                                    </div>
                                </Link>
                            );
                        })}
                        </div>
                    </div>
                )}
            </div>
        </PageShell>
    );
}
