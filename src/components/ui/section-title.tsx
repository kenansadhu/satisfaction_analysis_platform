"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { InfoHint } from "@/components/ui/info-hint";

/**
 * Section title used across analytics pages.
 *
 * Visual contract (locked across pages):
 *   - h2 heading: text-sm, font-semibold
 *   - optional caption directly underneath: text-xs, slate-400
 *   - optional `?` info hint inline with the title
 *
 * Use this instead of rolling your own <h2> + <p> pair, so heading hierarchy stays consistent.
 */
export function SectionTitle({
    icon,
    children,
    caption,
    hint,
    actions,
    className,
}: {
    icon?: React.ReactNode;
    children: React.ReactNode;
    /** Optional one-line description shown directly underneath (replaces the old "ml-6" caption pattern). */
    caption?: React.ReactNode;
    /** Optional tooltip content. Renders a small `?` icon next to the title. */
    hint?: React.ReactNode;
    /** Optional right-aligned controls (sort toggles, etc.). */
    actions?: React.ReactNode;
    className?: string;
}) {
    return (
        <div className={cn("flex items-start justify-between gap-4 flex-wrap", className)}>
            <div className="min-w-0">
                <div className="flex items-center gap-2">
                    {icon && <span className="shrink-0 inline-flex items-center">{icon}</span>}
                    <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">{children}</h2>
                    {hint && <InfoHint>{hint}</InfoHint>}
                </div>
                {caption && (
                    <p className={cn("text-xs text-slate-400 mt-0.5", icon && "ml-6")}>
                        {caption}
                    </p>
                )}
            </div>
            {actions && <div className="shrink-0 flex items-center gap-2">{actions}</div>}
        </div>
    );
}

/**
 * Tiny caption — explain a single metric in one line.
 * Sits directly below a number/value, italicized to read as a "footnote".
 */
export function MetricCaption({
    children,
    className,
}: {
    children: React.ReactNode;
    className?: string;
}) {
    return (
        <p className={cn("text-[11px] text-slate-400 dark:text-slate-500 leading-snug", className)}>
            {children}
        </p>
    );
}
