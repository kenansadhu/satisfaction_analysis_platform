"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { supabase } from "@/lib/supabase";

export interface SurveyInfo {
    id: number;
    title: string;
    year?: number;
    hasData?: boolean;
}

interface SurveyContextType {
    surveys: SurveyInfo[];
    activeSurveyId: string;
    setActiveSurveyId: (id: string) => void;
    activeSurvey: SurveyInfo | null;
    loading: boolean;
}

const SurveyContext = createContext<SurveyContextType>({
    surveys: [],
    activeSurveyId: "",
    setActiveSurveyId: () => { },
    activeSurvey: null,
    loading: true,
});

export function SurveyProvider({ children }: { children: ReactNode }) {
    const [surveys, setSurveys] = useState<SurveyInfo[]>([]);
    const [activeSurveyId, setActiveSurveyIdState] = useState<string>("");
    const [loading, setLoading] = useState(true);

    const setActiveSurveyId = (id: string) => {
        setActiveSurveyIdState(id);
        if (typeof window !== "undefined") {
            localStorage.setItem("activeSurveyId", id);
        }
    };

    useEffect(() => {
        const load = async () => {
            const { data } = await supabase
                .from("surveys")
                .select("id, title, year")
                .order("created_at", { ascending: false });

            if (!data || data.length === 0) {
                setLoading(false);
                return;
            }

            // Check which surveys have analyzed data (avoid slow respondents!inner join)
            const checks = await Promise.all(
                data.map(async (s) => {
                    let respIds: number[] = [];
                    let rPage = 0;
                    while (true) {
                        const { data: rBat } = await supabase.from('respondents').select('id').eq('survey_id', s.id).range(rPage * 1000, (rPage + 1) * 1000 - 1);
                        if (!rBat || rBat.length === 0) break;
                        respIds.push(...rBat.map((r: any) => r.id));
                        if (rBat.length < 1000) break;
                        rPage++;
                    }
                    if (respIds.length === 0) return { ...s, hasData: false };

                    let hasData = false;
                    const CHUNK = 400;
                    for (let i = 0; i < respIds.length; i += CHUNK) {
                        const chunk = respIds.slice(i, i + CHUNK);
                        const { count } = await supabase
                            .from("raw_feedback_inputs")
                            .select("*", { count: "exact", head: true })
                            .in("respondent_id", chunk)
                            .eq("requires_analysis", false);
                        if (count && count > 0) {
                            hasData = true;
                            break;
                        }
                    }
                    return { ...s, hasData };
                })
            );

            setSurveys(checks);

            // Restore from localStorage or default to first survey with data
            const stored = typeof window !== "undefined" ? localStorage.getItem("activeSurveyId") : null;
            const storedValid = stored && checks.some(s => s.id.toString() === stored);

            if (storedValid) {
                setActiveSurveyIdState(stored);
            } else {
                const withData = checks.find(s => s.hasData);
                const defaultId = (withData || checks[0]).id.toString();
                setActiveSurveyIdState(defaultId);
                if (typeof window !== "undefined") localStorage.setItem("activeSurveyId", defaultId);
            }

            setLoading(false);
        };
        load();
    }, []);

    const activeSurvey = surveys.find(s => s.id.toString() === activeSurveyId) || null;

    return (
        <SurveyContext.Provider value={{ surveys, activeSurveyId, setActiveSurveyId, activeSurvey, loading }}>
            {children}
        </SurveyContext.Provider>
    );
}

export function useActiveSurvey() {
    return useContext(SurveyContext);
}
