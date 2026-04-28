import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

interface PageHeaderProps {
    title: React.ReactNode;
    description: string;
    backHref?: string;
    backLabel?: string;
    actions?: React.ReactNode;
}

export function PageHeader({ title, description, backHref, backLabel, actions }: PageHeaderProps) {
    return (
        <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
            <div className="max-w-7xl mx-auto px-8 py-5">
                {backHref && (
                    <Link href={backHref}>
                        <Button variant="ghost" size="sm" className="text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white -ml-2 mb-3 gap-1.5">
                            <ArrowLeft className="w-4 h-4" />
                            {backLabel || "Back"}
                        </Button>
                    </Link>
                )}
                <div className="flex items-center justify-between gap-4">
                    <div className="space-y-0.5 min-w-0">
                        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight truncate">{title}</h1>
                        <p className="text-sm text-slate-500 dark:text-slate-400">{description}</p>
                    </div>
                    {actions && <div className="flex gap-3 shrink-0">{actions}</div>}
                </div>
            </div>
        </div>
    );
}

export function PageShell({ children }: { children: React.ReactNode }) {
    return (
        <>
            {children}
        </>
    );
}
