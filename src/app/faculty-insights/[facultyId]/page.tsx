"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { PageShell, PageHeader } from "@/components/layout/PageShell";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import FacultyRollup from "@/components/executive/FacultyRollup";
import { useActiveSurvey } from "@/context/SurveyContext";
import { GraduationCap } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function FacultyInsightsDetailPage() {
    const params = useParams();
    const facultyId = params.facultyId as string;
    const { activeSurveyId, activeSurvey } = useActiveSurvey();

    const [facultyName, setFacultyName] = useState("Loading...");
    const [facultyShortName, setFacultyShortName] = useState<string | null>(null);

    useEffect(() => {
        supabase
            .from('faculties')
            .select('name, short_name')
            .eq('id', facultyId)
            .single()
            .then(({ data }) => {
                if (data) {
                    setFacultyName(data.name);
                    setFacultyShortName(data.short_name);
                }
            });
    }, [facultyId]);

    const surveyId = activeSurveyId && activeSurveyId !== "all" ? activeSurveyId : undefined;

    return (
        <PageShell>
            <PageHeader
                title={
                    <span className="flex items-center gap-2">
                        <GraduationCap className="w-6 h-6 text-teal-500" />
                        {facultyName}
                    </span>
                }
                description={activeSurvey ? `Faculty Insights • ${activeSurvey.title}` : "Faculty Insights"}
                backHref="/faculty-insights"
                backLabel="All Faculties"
                actions={
                    facultyShortName ? (
                        <Badge variant="outline" className="bg-teal-50/50 text-teal-700 border-teal-200 px-3 py-1">
                            {facultyShortName}
                        </Badge>
                    ) : null
                }
            />

            <div className="max-w-7xl mx-auto px-8 py-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <ErrorBoundary fallbackTitle="Faculty Insights crashed">
                    {surveyId ? (
                        <FacultyRollup surveyId={surveyId} facultyFilter={facultyName !== "Loading..." ? facultyName : undefined} />
                    ) : (
                        <div className="text-center py-16 text-slate-400">
                            <GraduationCap className="w-10 h-10 mx-auto mb-3 opacity-30" />
                            <p className="font-medium">Select a survey to view faculty insights</p>
                        </div>
                    )}
                </ErrorBoundary>
            </div>
        </PageShell>
    );
}
