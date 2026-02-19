"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
    LayoutDashboard,
    Building2,
    Upload,
    Lightbulb,
    Settings,
    ChevronLeft,
    ChevronRight,
    Menu,
    Activity
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface SidebarProps {
    className?: string;
    isCollapsed: boolean;
    toggleCollapse: () => void;
    isMobile?: boolean;
    onCloseMobile?: () => void;
}

export function Sidebar({
    className,
    isCollapsed,
    toggleCollapse,
    isMobile,
    onCloseMobile
}: SidebarProps) {
    const pathname = usePathname();

    const NavItem = ({ href, icon: Icon, label, active = false, className }: any) => (
        <Link
            href={href}
            className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md transition-all duration-200 group text-sm font-medium",
                active
                    ? "bg-slate-800 text-white shadow-md shadow-blue-900/10"
                    : "text-slate-400 hover:text-slate-100 hover:bg-slate-800/50",
                className
            )}
            onClick={isMobile ? onCloseMobile : undefined}
            title={isCollapsed && !isMobile ? label : undefined}
        >
            <Icon className={cn("w-5 h-5 min-w-[20px]", active ? "text-blue-400" : "text-slate-500 group-hover:text-slate-300")} />
            {(!isCollapsed || isMobile) && (
                <span className="truncate">{label}</span>
            )}
        </Link>
    );

    return (
        <div className={cn(
            "flex flex-col h-full bg-slate-950 border-r border-slate-800 transition-all duration-300 relative group/sidebar",
            isCollapsed && !isMobile ? "w-[70px]" : "w-64",
            className
        )}>
            {/* Floating Toggle Button */}
            {!isMobile && (
                <button
                    onClick={toggleCollapse}
                    className="absolute -right-3 top-6 bg-slate-800 border border-slate-600 text-slate-400 hover:text-white rounded-full p-1 shadow-md hover:bg-slate-700 transition-colors z-50 opacity-0 group-hover/sidebar:opacity-100 focus:opacity-100"
                    title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
                >
                    {isCollapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
                </button>
            )}

            {/* Header */}
            <div className="h-16 flex items-center px-4 border-b border-slate-800/50 shrink-0">
                {!isCollapsed || isMobile ? (
                    <Link href="/" className="flex items-center gap-2 text-white font-bold tracking-tight hover:opacity-90 transition-opacity">
                        <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-600/20">
                            <span className="text-lg">S</span>
                        </div>
                        <span className="bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">SSI UPH</span>
                    </Link>
                ) : (
                    <Link
                        href="/"
                        className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-600/20 mx-auto cursor-pointer hover:bg-blue-500 transition-colors"
                        title="Go to Home"
                    >
                        <span className="text-lg font-bold text-white">S</span>
                    </Link>
                )}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto py-4 flex flex-col gap-6 custom-scrollbar">

                {/* Main Nav */}
                <div className="px-3 space-y-1">
                    {(!isCollapsed || isMobile) && (
                        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-3 mb-2">Platform</h3>
                    )}
                    <NavItem href="/surveys" icon={LayoutDashboard} label="Surveys" active={pathname === "/surveys" || pathname.startsWith("/surveys/")} />
                    <NavItem href="/executive" icon={Activity} label="Executive View" active={pathname === "/executive"} />
                    <NavItem href="/units" icon={Building2} label="Organization Units" active={pathname === "/units" || pathname.startsWith("/analysis/unit/")} />

                    <NavItem href="/suggestions" icon={Lightbulb} label="Suggestions Box" active={pathname === "/suggestions"} />
                </div>

                {/* Settings / Footer */}
                <div className="px-3 mt-auto">
                    <NavItem href="/settings" icon={Settings} label="Settings" active={pathname === "/settings"} />
                </div>
            </div>
        </div>
    );
}
