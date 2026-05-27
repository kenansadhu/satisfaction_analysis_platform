"use client";

import * as React from "react";
import { HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

/**
 * Small `?` icon that opens a tooltip on hover/focus.
 * Use anywhere a metric, score, or label benefits from a "what is this / how is it computed" hint.
 *
 * Example:
 *   <InfoHint>SSI = average Likert score (1–4) across all rated questions for this unit.</InfoHint>
 */
export function InfoHint({
    children,
    side = "top",
    align = "center",
    className,
    iconClassName,
    contentClassName,
}: {
    children: React.ReactNode;
    side?: "top" | "right" | "bottom" | "left";
    align?: "start" | "center" | "end";
    className?: string;
    iconClassName?: string;
    contentClassName?: string;
}) {
    return (
        <Tooltip>
            <TooltipTrigger
                type="button"
                className={cn(
                    "inline-flex items-center justify-center rounded-full text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-1 transition-colors align-middle",
                    className
                )}
                aria-label="What does this mean?"
            >
                <HelpCircle className={cn("w-3.5 h-3.5 opacity-60 hover:opacity-100 transition-opacity", iconClassName)} />
            </TooltipTrigger>
            <TooltipContent
                side={side}
                align={align}
                className={cn("max-w-xs text-xs leading-relaxed", contentClassName)}
            >
                {children}
            </TooltipContent>
        </Tooltip>
    );
}
