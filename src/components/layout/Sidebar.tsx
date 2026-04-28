"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
    LayoutDashboard,
    Building2,
    GraduationCap,
    Settings,
    ChevronLeft,
    ChevronRight,
    Activity,
    PieChart,
    UserCog,
    BrainCircuit,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth, canAccessAdminPages, isOwner } from "@/context/AuthContext";

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
    const { role } = useAuth();

    const NavItem = ({ href, icon: Icon, label, active = false }: {
        href: string;
        icon: React.ElementType;
        label: string;
        active?: boolean;
    }) => (
        <Link
            href={href}
            className={cn(
                "flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg mb-0.5 transition-all duration-200 group",
                active
                    ? "bg-white/10 text-white"
                    : "text-slate-400 hover:text-white hover:bg-white/5"
            )}
            onClick={isMobile ? onCloseMobile : undefined}
            title={isCollapsed && !isMobile ? label : undefined}
        >
            <Icon className={cn(
                "w-5 h-5 min-w-[20px] shrink-0 transition-colors",
                active ? "text-blue-400" : "text-slate-500 group-hover:text-slate-300"
            )} />
            {(!isCollapsed || isMobile) && (
                <span className="truncate">{label}</span>
            )}
        </Link>
    );

    return (
        <div className={cn(
            "flex flex-col h-full bg-slate-900 border-r border-slate-800/60 transition-all duration-300 relative group/sidebar print:hidden",
            isCollapsed && !isMobile ? "w-[70px]" : "w-64",
            className
        )}>
            {/* Floating Toggle Button */}
            {!isMobile && (
                <button
                    onClick={toggleCollapse}
                    className="absolute -right-3 top-5 bg-slate-800 border border-slate-700 text-slate-400 hover:text-white rounded-full p-1 shadow-md hover:bg-slate-700 transition-colors z-50 opacity-0 group-hover/sidebar:opacity-100 focus:opacity-100"
                    title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
                >
                    {isCollapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
                </button>
            )}

            {/* Logo — matches top bar height */}
            <div className="h-14 flex items-center px-4 border-b border-slate-800/60 shrink-0">
                {!isCollapsed || isMobile ? (
                    <Link href="/" className="flex items-center gap-2.5 hover:opacity-90 transition-opacity">
                        <div className="px-2.5 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-md shadow-blue-900/30">
                            <span className="text-sm font-bold text-white">SVP</span>
                        </div>
                        <span className="text-sm font-semibold bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent">
                            Student Voice
                        </span>
                    </Link>
                ) : (
                    <Link
                        href="/"
                        className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-md shadow-blue-900/30 mx-auto hover:from-blue-400 hover:to-indigo-500 transition-colors"
                        title="Home"
                    >
                        <span className="text-sm font-bold text-white">S</span>
                    </Link>
                )}
            </div>

            {/* Nav content */}
            <div className="flex-1 overflow-y-auto py-4 flex flex-col custom-scrollbar">

                {/* Core Platform */}
                <div className="px-3 flex-1">
                    {(!isCollapsed || isMobile) && (
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-3 mb-2">Platform</p>
                    )}
                    {canAccessAdminPages(role) && (
                        <NavItem
                            href="/surveys"
                            icon={LayoutDashboard}
                            label="Surveys"
                            active={pathname === "/surveys" || pathname.startsWith("/surveys/")}
                        />
                    )}
                    <NavItem href="/executive" icon={Activity} label="Executive Insights" active={pathname === "/executive"} />
                    <NavItem
                        href="/unit-insights"
                        icon={PieChart}
                        label="Unit Insights"
                        active={pathname === "/unit-insights" || pathname.startsWith("/unit-insights/")}
                    />
                    <NavItem
                        href="/faculty-insights"
                        icon={GraduationCap}
                        label="Faculty Insights"
                        active={pathname === "/faculty-insights" || pathname.startsWith("/faculty-insights/")}
                    />
                    <NavItem href="/ai-scientist" icon={BrainCircuit} label="AI Data Scientist" active={pathname === "/ai-scientist"} />
                </div>

                {/* Management */}
                {canAccessAdminPages(role) || isOwner(role) ? (
                    <div className="px-3 pt-4 mt-4 border-t border-slate-800/50">
                        {(!isCollapsed || isMobile) && (
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-3 mb-2">Management</p>
                        )}
                        {canAccessAdminPages(role) && (
                            <>
                                <NavItem href="/faculties" icon={GraduationCap} label="Faculty Management" active={pathname === "/faculties"} />
                                <NavItem href="/units" icon={Building2} label="Organization Units" active={pathname === "/units"} />
                                <NavItem href="/settings" icon={Settings} label="Settings" active={pathname === "/settings"} />
                            </>
                        )}
                        {isOwner(role) && (
                            <NavItem href="/users" icon={UserCog} label="User Management" active={pathname === "/users"} />
                        )}
                    </div>
                ) : null}
            </div>
        </div>
    );
}
