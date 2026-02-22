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
    Activity,
    Sun,
    Moon
} from "lucide-react";
import { useTheme } from "next-themes";
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
    const { theme, setTheme } = useTheme();

    const NavItem = ({ href, icon: Icon, label, active = false, className, prominent = false }: any) => (
        <Link
            href={href}
            className={cn(
                "flex items-center gap-3 transition-all duration-300 group",
                prominent
                    ? "px-4 py-3 text-base font-bold rounded-xl mb-3"
                    : "px-3 py-2 text-sm font-medium rounded-md mb-1",
                active
                    ? (prominent
                        ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-900/40 ring-1 ring-white/10"
                        : "bg-slate-800 text-white shadow-md shadow-blue-900/10")
                    : (prominent
                        ? "text-slate-300 hover:text-white hover:bg-slate-800/80 border border-transparent hover:border-slate-700/50"
                        : "text-slate-400 hover:text-slate-100 hover:bg-slate-800/50"),
                className
            )}
            onClick={isMobile ? onCloseMobile : undefined}
            title={isCollapsed && !isMobile ? label : undefined}
        >
            <Icon className={cn(
                "min-w-[20px] transition-colors duration-200",
                prominent ? "w-6 h-6" : "w-5 h-5",
                active
                    ? (prominent ? "text-white drop-shadow-md" : "text-blue-400")
                    : (prominent ? "text-slate-400 group-hover:text-blue-300" : "text-slate-500 group-hover:text-slate-300")
            )} />
            {(!isCollapsed || isMobile) && (
                <span className="truncate tracking-wide">{label}</span>
            )}
        </Link>
    );

    return (
        <div className={cn(
            "flex flex-col h-full bg-slate-950 border-r border-slate-800 transition-all duration-300 relative group/sidebar print:hidden",
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
            <div className="h-20 flex items-center px-4 border-b border-slate-800/50 shrink-0">
                {!isCollapsed || isMobile ? (
                    <Link href="/" className="flex items-center gap-3 text-white font-extrabold tracking-tight hover:opacity-90 transition-opacity">
                        <div className="px-3 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-600/20">
                            <span className="text-xl">UPH</span>
                        </div>
                        <span className="bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent text-lg">UPH Survey Platform</span>
                    </Link>
                ) : (
                    <Link
                        href="/"
                        className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-600/20 mx-auto cursor-pointer hover:from-blue-400 hover:to-indigo-500 transition-colors"
                        title="Go to Home"
                    >
                        <span className="text-xl font-bold text-white">U</span>
                    </Link>
                )}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto py-6 flex flex-col gap-6 custom-scrollbar">

                {/* Main Prominent Nav */}
                <div className="px-3 space-y-2 mt-2">
                    {(!isCollapsed || isMobile) && (
                        <h3 className="text-xs font-bold text-blue-400 uppercase tracking-widest px-4 mb-4 opacity-80">Core Platform</h3>
                    )}
                    <NavItem href="/surveys" icon={LayoutDashboard} label="Surveys" active={pathname === "/surveys" || pathname.startsWith("/surveys/")} prominent={true} />
                    <NavItem href="/executive" icon={Activity} label="Executive View" active={pathname === "/executive"} prominent={true} />
                </div>

                {/* Settings / Footer -> Moved Building2 here */}
                <div className="px-3 mt-auto space-y-1 pt-6 border-t border-slate-800/50">
                    <NavItem href="/units" icon={Building2} label="Organization Units" active={pathname === "/units" || pathname.startsWith("/analysis/unit/")} />
                    <NavItem href="/settings" icon={Settings} label="Settings" active={pathname === "/settings"} />

                    {/* Theme Toggle */}
                    <button
                        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                        className={cn(
                            "w-full flex items-center gap-3 px-3 py-2 rounded-md transition-all duration-200 group text-sm font-medium text-slate-400 hover:text-slate-100 hover:bg-slate-800/50"
                        )}
                        title={isCollapsed && !isMobile ? "Toggle Theme" : undefined}
                    >
                        {theme === "dark" ? (
                            <Sun className="w-5 h-5 min-w-[20px] text-slate-500 group-hover:text-amber-300" />
                        ) : (
                            <Moon className="w-5 h-5 min-w-[20px] text-slate-500 group-hover:text-blue-300" />
                        )}
                        {(!isCollapsed || isMobile) && (
                            <span className="truncate">Theme</span>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
