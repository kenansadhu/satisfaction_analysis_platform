import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

interface PageHeaderProps {
    title: string;
    description: string;
    backHref?: string;
    backLabel?: string;
    actions?: React.ReactNode;
}

export function PageHeader({ title, description, backHref, backLabel, actions }: PageHeaderProps) {
    return (
        <div className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-950">
            {/* Subtle Grid */}
            <div className="absolute inset-0 opacity-10" style={{
                backgroundImage: 'linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)',
                backgroundSize: '60px 60px'
            }} />
            <div className="absolute top-0 right-1/4 w-72 h-72 bg-blue-500/15 rounded-full blur-3xl" />

            <div className="relative max-w-7xl mx-auto px-8 py-8">
                {backHref && (
                    <Link href={backHref}>
                        <Button variant="ghost" size="sm" className="text-slate-400 hover:text-white hover:bg-white/10 -ml-2 mb-3 gap-1.5">
                            <ArrowLeft className="w-4 h-4" />
                            {backLabel || "Back"}
                        </Button>
                    </Link>
                )}
                <div className="flex items-center justify-between">
                    <div className="space-y-1">
                        <h1 className="text-2xl font-bold text-white tracking-tight">{title}</h1>
                        <p className="text-slate-400 text-sm">{description}</p>
                    </div>
                    {actions && <div className="flex gap-3">{actions}</div>}
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
