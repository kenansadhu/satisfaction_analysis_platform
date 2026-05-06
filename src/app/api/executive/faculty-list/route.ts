import { NextRequest, NextResponse } from "next/server";
import { supabaseServer as supabase } from "@/lib/supabase-server";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
    const surveyId = parseInt(req.nextUrl.searchParams.get("surveyId") || "");
    if (!surveyId) return NextResponse.json({ error: "surveyId required" }, { status: 400 });

    const [summaryResult, enrollResult] = await Promise.all([
        supabase.rpc("get_faculty_list_summary", { p_survey_id: surveyId }),
        supabase.from("prodi_enrollment").select("study_program, faculty, student_count").eq("survey_id", surveyId),
    ]);

    if (summaryResult.error) {
        console.error("get_faculty_list_summary error:", summaryResult.error);
        return NextResponse.json({ error: "Failed to load faculty summary" }, { status: 500 });
    }

    // Enrollment: sum per faculty
    const facEnrollMap = new Map<string, number>();
    for (const e of (enrollResult.data || [])) {
        const fac = e.faculty || "Unknown";
        facEnrollMap.set(fac, (facEnrollMap.get(fac) || 0) + (e.student_count || 0));
    }

    const faculties = (summaryResult.data || []).map((row: any) => {
        const respondents = Number(row.respondent_count) || 0;
        const enrolled = facEnrollMap.get(row.faculty_name) || 0;
        return {
            faculty: row.faculty_name,
            respondents,
            enrolled,
            response_rate: enrolled > 0 ? parseFloat((respondents / enrolled * 100).toFixed(1)) : null,
            programQuality: {
                avg_score: row.pq_avg_score != null ? parseFloat(Number(row.pq_avg_score).toFixed(2)) : null,
                sentiment: {
                    positive: Number(row.pq_positive) || 0,
                    negative: Number(row.pq_negative) || 0,
                    neutral: Number(row.pq_neutral) || 0,
                    total: Number(row.pq_total) || 0,
                    positive_pct: row.pq_total > 0 ? parseFloat((Number(row.pq_positive) / Number(row.pq_total) * 100).toFixed(1)) : 0,
                    negative_pct: row.pq_total > 0 ? parseFloat((Number(row.pq_negative) / Number(row.pq_total) * 100).toFixed(1)) : 0,
                },
            },
            campusExperience: {
                avg_score: row.ce_avg_score != null ? parseFloat(Number(row.ce_avg_score).toFixed(2)) : null,
                sentiment: {
                    positive: Number(row.ce_positive) || 0,
                    negative: Number(row.ce_negative) || 0,
                    neutral: Number(row.ce_neutral) || 0,
                    total: Number(row.ce_total) || 0,
                    positive_pct: row.ce_total > 0 ? parseFloat((Number(row.ce_positive) / Number(row.ce_total) * 100).toFixed(1)) : 0,
                    negative_pct: row.ce_total > 0 ? parseFloat((Number(row.ce_negative) / Number(row.ce_total) * 100).toFixed(1)) : 0,
                },
            },
        };
    });

    return NextResponse.json({ faculties });
}
