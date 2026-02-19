import { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
    title: string;
    description: string;
    icon?: LucideIcon;
    actionLabel?: string;
    onAction?: () => void;
    className?: string;
}

export function EmptyState({
    title,
    description,
    icon: Icon,
    actionLabel,
    onAction,
    className
}: EmptyStateProps) {
    return (
        <div className={cn("flex flex-col items-center justify-center p-8 text-center border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/50", className)}>
            {Icon && (
                <div className="flex items-center justify-center w-16 h-16 mb-4 rounded-full bg-slate-100">
                    <Icon className="w-8 h-8 text-slate-400" />
                </div>
            )}
            <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
            <p className="max-w-sm mt-2 text-sm text-slate-500">{description}</p>
            {actionLabel && onAction && (
                <Button onClick={onAction} className="mt-6" variant="outline">
                    {actionLabel}
                </Button>
            )}
        </div>
    );
}
