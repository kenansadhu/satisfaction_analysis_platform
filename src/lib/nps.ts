/**
 * NPS (Net Promoter Score) helpers.
 *
 * NPS questions ask "How likely are you to recommend X?" on a 0–10 scale.
 * Responses are bucketed:
 *   - Detractors:  0–6
 *   - Passives:    7–8
 *   - Promoters:   9–10
 *
 * NPS = %promoters − %detractors  (range: −100 to +100).
 *
 * Benchmark interpretation (industry-agnostic, conservative):
 *   - ≥ 50 : Excellent
 *   - 0–49 : Good
 *   - < 0  : Concern
 */

export type NpsBucket = "detractor" | "passive" | "promoter";

export interface NpsCounts {
    detractor: number;
    passive: number;
    promoter: number;
    total: number;
}

export function emptyNpsCounts(): NpsCounts {
    return { detractor: 0, passive: 0, promoter: 0, total: 0 };
}

export function bucketScore(score: number): NpsBucket {
    if (score <= 6) return "detractor";
    if (score <= 8) return "passive";
    return "promoter";
}

export function addToCounts(counts: NpsCounts, score: number): void {
    const bucket = bucketScore(score);
    counts[bucket]++;
    counts.total++;
}

/** NPS score in the conventional −100..+100 range, or null if no responses. */
export function computeNpsScore(counts: NpsCounts): number | null {
    if (counts.total === 0) return null;
    const pPct = (counts.promoter / counts.total) * 100;
    const dPct = (counts.detractor / counts.total) * 100;
    return Math.round(pPct - dPct);
}

/** Average rating on the 0–10 scale (a less common but sometimes-requested companion metric). */
export function computeAvgRating(scores: number[]): number | null {
    if (scores.length === 0) return null;
    return parseFloat((scores.reduce((s, n) => s + n, 0) / scores.length).toFixed(2));
}

export interface NpsPercentages {
    detractorPct: number;
    passivePct: number;
    promoterPct: number;
}

/** Percentages that always sum to 100 (largest bucket absorbs rounding remainder). */
export function computePercentages(counts: NpsCounts): NpsPercentages {
    if (counts.total === 0) return { detractorPct: 0, passivePct: 0, promoterPct: 0 };
    const dRaw = (counts.detractor / counts.total) * 100;
    const pasRaw = (counts.passive / counts.total) * 100;
    const proRaw = (counts.promoter / counts.total) * 100;
    let d = Math.round(dRaw);
    let pas = Math.round(pasRaw);
    let pro = Math.round(proRaw);
    const sum = d + pas + pro;
    if (sum !== 100) {
        const diff = 100 - sum;
        // Add the rounding remainder to the largest bucket
        const largest = Math.max(d, pas, pro);
        if (largest === pro) pro += diff;
        else if (largest === pas) pas += diff;
        else d += diff;
    }
    return { detractorPct: d, passivePct: pas, promoterPct: pro };
}

export function npsBenchmark(score: number | null): "excellent" | "good" | "concern" | "no-data" {
    if (score === null) return "no-data";
    if (score >= 50) return "excellent";
    if (score >= 0) return "good";
    return "concern";
}

export function npsBenchmarkColor(score: number | null): string {
    const b = npsBenchmark(score);
    if (b === "excellent") return "text-emerald-600 dark:text-emerald-400";
    if (b === "good") return "text-amber-600 dark:text-amber-400";
    if (b === "concern") return "text-red-600 dark:text-red-400";
    return "text-slate-400 dark:text-slate-600";
}
