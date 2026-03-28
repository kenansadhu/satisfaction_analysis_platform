"use client";

/**
 * AnalysisProgressContext — volatile, high-frequency updates.
 *
 * Holds: logs[] and addLog().
 * Re-renders every time a log line is added (~every 1-2 seconds during analysis).
 *
 * Only AnalysisEngine.tsx should subscribe to this.
 * All other components should use useAnalysisControl() instead.
 */

import { createContext, useContext, useState, ReactNode } from "react";

type AnalysisProgressState = {
    logs: string[];
    addLog: (msg: string) => void;
    clearLogs: () => void;
};

const AnalysisProgressContext = createContext<AnalysisProgressState | undefined>(undefined);

export function AnalysisProgressProvider({ children }: { children: ReactNode }) {
    const [logs, setLogs] = useState<string[]>([]);

    const addLog = (msg: string) =>
        setLogs(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 50));

    const clearLogs = () => setLogs([]);

    return (
        <AnalysisProgressContext.Provider value={{ logs, addLog, clearLogs }}>
            {children}
        </AnalysisProgressContext.Provider>
    );
}

export const useAnalysisProgress = () => {
    const ctx = useContext(AnalysisProgressContext);
    if (!ctx) throw new Error("useAnalysisProgress must be used within AnalysisProgressProvider");
    return ctx;
};
