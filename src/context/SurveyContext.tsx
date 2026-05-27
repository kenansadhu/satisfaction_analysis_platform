"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";

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

function readLocalStorage(key: string): string | null {
    if (typeof window === "undefined") return null;
    try { return localStorage.getItem(key); } catch { return null; }
}
function writeLocalStorage(key: string, value: string) {
    if (typeof window === "undefined") return;
    try { localStorage.setItem(key, value); } catch { }
}

export function SurveyProvider({ children }: { children: ReactNode }) {
    const { user, loading: authLoading } = useAuth();
    const [surveys, setSurveys] = useState<SurveyInfo[]>([]);
    // Initialize synchronously from localStorage so pages don't wait for auth+fetch
    const [activeSurveyId, setActiveSurveyIdState] = useState<string>(
        () => readLocalStorage("activeSurveyId") ?? ""
    );
    const [loading, setLoading] = useState(true);

    const setActiveSurveyId = (id: string) => {
        setActiveSurveyIdState(id);
        writeLocalStorage("activeSurveyId", id);
    };

    useEffect(() => {
        if (authLoading) return;
        if (!user) {
            setSurveys([]);
            setLoading(false);
            return;
        }
        const load = async () => {
            const { data } = await supabase.rpc("get_surveys_list");

            if (!data || data.length === 0) {
                setLoading(false);
                return;
            }

            // Load hasData cache — only `true` values are cached (a survey that gains data stays true)
            let hasDataCache: Record<string, boolean> = {};
            try {
                const raw = readLocalStorage("surveyHasDataCache");
                if (raw) hasDataCache = JSON.parse(raw);
            } catch { }

            // Build initial survey list using cached hasData, default uncached to false
            const initialSurveys: SurveyInfo[] = data.map((s: { id: number; title: string; year?: number }) => ({
                ...s,
                hasData: hasDataCache[s.id] ?? false,
            }));
            setSurveys(initialSurveys);

            // Resolve active survey ID immediately
            const stored = readLocalStorage("activeSurveyId");
            const storedValid = stored && data.some((s: { id: number }) => s.id.toString() === stored);
            if (!storedValid) {
                const defaultId = data[0].id.toString();
                setActiveSurveyIdState(defaultId);
                writeLocalStorage("activeSurveyId", defaultId);
            }

            // ← Pages can render now; hasData checks run in the background
            setLoading(false);

            // Check hasData only for surveys not yet cached
            const uncached = data.filter((s: { id: number }) => !hasDataCache[s.id]);
            if (uncached.length === 0) return;

            const updates = await Promise.all(
                uncached.map(async (s: { id: number; title: string; year?: number }) => {
                    let respIds: number[] = [];
                    let rPage = 0;
                    while (true) {
                        const { data: rBat } = await supabase
                            .from("respondents")
                            .select("id")
                            .eq("survey_id", s.id)
                            .range(rPage * 1000, (rPage + 1) * 1000 - 1);
                        if (!rBat || rBat.length === 0) break;
                        respIds.push(...rBat.map((r: { id: number }) => r.id));
                        if (rBat.length < 1000) break;
                        rPage++;
                    }
                    if (respIds.length === 0) return { id: s.id, hasData: false };

                    let hasData = false;
                    const CHUNK = 400;
                    for (let i = 0; i < respIds.length; i += CHUNK) {
                        const { count } = await supabase
                            .from("raw_feedback_inputs")
                            .select("*", { count: "exact", head: true })
                            .in("respondent_id", respIds.slice(i, i + CHUNK))
                            .eq("requires_analysis", false);
                        if (count && count > 0) { hasData = true; break; }
                    }
                    return { id: s.id, hasData };
                })
            );

            // Cache only `true` values so we never re-check analyzed surveys
            const newCache = { ...hasDataCache };
            for (const { id, hasData } of updates) {
                if (hasData) newCache[id] = true;
            }
            writeLocalStorage("surveyHasDataCache", JSON.stringify(newCache));

            // Patch surveys with fresh hasData results
            setSurveys(prev =>
                prev.map(s => {
                    const u = updates.find(x => x.id === s.id);
                    return u ? { ...s, hasData: u.hasData } : s;
                })
            );
        };
        load();
    }, [user, authLoading]);

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
