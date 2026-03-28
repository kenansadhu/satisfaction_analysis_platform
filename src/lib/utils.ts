import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Canonical sentiment score formula — used across all routes.
 * Returns a 0–100 weighted positivity score:
 *   Positive = 100%, Neutral = 50%, Negative = 0%
 * Returns 0 if no segments.
 */
export function computeSentimentScore(positive: number, neutral: number, negative: number): number {
  const total = positive + neutral + negative;
  if (total === 0) return 0;
  return Math.round(((positive * 1.0 + neutral * 0.5) / total) * 100);
}
