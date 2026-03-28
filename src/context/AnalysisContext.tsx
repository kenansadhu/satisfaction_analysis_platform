/**
 * AnalysisContext — backwards-compatibility re-export shim.
 *
 * All existing imports of `useAnalysis` and `AnalysisProvider` from this file
 * continue to work without any changes to the callsites.
 *
 * New code should import directly from:
 *   - "@/context/AnalysisControlContext" — for session state & actions
 *   - "@/context/AnalysisProgressContext" — for logs (AnalysisEngine only)
 */

export { AnalysisProvider, useAnalysis, useAnalysisControl } from "@/context/AnalysisControlContext";
export { AnalysisProgressProvider, useAnalysisProgress } from "@/context/AnalysisProgressContext";
