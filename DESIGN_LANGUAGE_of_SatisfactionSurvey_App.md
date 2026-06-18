# Design Language & Dashboard UI Export

This document contains a complete export of the design language and homepage/dashboard layout files from the **Satisfaction Voice** platform. Use this as a reference or handout when sharing the design system and styling approach.

---

## 1. Global Tailwind & Theme Configuration
### File: `src/app/globals.css`
This file contains the Tailwind CSS v4 setup, variables, system definitions (including OKLCH dark/light theme values), custom base styling, animations (like the hover-paused marquee), and print-specific media queries.

```css
@import "tailwindcss";
@import "tw-animate-css";

@custom-variant dark (&:is(.dark *));

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
  --color-sidebar-ring: var(--sidebar-ring);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar: var(--sidebar);
  --color-chart-5: var(--chart-5);
  --color-chart-4: var(--chart-4);
  --color-chart-3: var(--chart-3);
  --color-chart-2: var(--chart-2);
  --color-chart-1: var(--chart-1);
  --color-ring: var(--ring);
  --color-input: var(--input);
  --color-border: var(--border);
  --color-destructive: var(--destructive);
  --color-accent-foreground: var(--accent-foreground);
  --color-accent: var(--accent);
  --color-muted-foreground: var(--muted-foreground);
  --color-muted: var(--muted);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-secondary: var(--secondary);
  --color-primary-foreground: var(--primary-foreground);
  --color-primary: var(--primary);
  --color-popover-foreground: var(--popover-foreground);
  --color-popover: var(--popover);
  --color-card-foreground: var(--card-foreground);
  --color-card: var(--card);
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
  --radius-2xl: calc(var(--radius) + 8px);
  --radius-3xl: calc(var(--radius) + 12px);
  --radius-4xl: calc(var(--radius) + 16px);
}

:root {
  --radius: 0.625rem;
  --background: oklch(1 0 0);
  --foreground: oklch(0.141 0.005 285.823);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.141 0.005 285.823);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.141 0.005 285.823);
  --primary: oklch(0.21 0.006 285.885);
  --primary-foreground: oklch(0.985 0 0);
  --secondary: oklch(0.967 0.001 286.375);
  --secondary-foreground: oklch(0.21 0.006 285.885);
  --muted: oklch(0.967 0.001 286.375);
  --muted-foreground: oklch(0.552 0.016 285.938);
  --accent: oklch(0.967 0.001 286.375);
  --accent-foreground: oklch(0.21 0.006 285.885);
  --destructive: oklch(0.577 0.245 27.325);
  --border: oklch(0.92 0.004 286.32);
  --input: oklch(0.92 0.004 286.32);
  --ring: oklch(0.705 0.015 286.067);
  --chart-1: oklch(0.646 0.222 41.116);
  --chart-2: oklch(0.6 0.118 184.704);
  --chart-3: oklch(0.398 0.07 227.392);
  --chart-4: oklch(0.828 0.189 84.429);
  --chart-5: oklch(0.769 0.188 70.08);
  --sidebar: oklch(0.985 0 0);
  --sidebar-foreground: oklch(0.141 0.005 285.823);
  --sidebar-primary: oklch(0.21 0.006 285.885);
  --sidebar-primary-foreground: oklch(0.985 0 0);
  --sidebar-accent: oklch(0.967 0.001 286.375);
  --sidebar-accent-foreground: oklch(0.21 0.006 285.885);
  --sidebar-border: oklch(0.92 0.004 286.32);
  --sidebar-ring: oklch(0.705 0.015 286.067);
}

.dark {
  --background: oklch(0.141 0.005 285.823);
  --foreground: oklch(0.985 0 0);
  --card: oklch(0.21 0.006 285.885);
  --card-foreground: oklch(0.985 0 0);
  --popover: oklch(0.21 0.006 285.885);
  --popover-foreground: oklch(0.985 0 0);
  --primary: oklch(0.92 0.004 286.32);
  --primary-foreground: oklch(0.21 0.006 285.885);
  --secondary: oklch(0.274 0.006 286.033);
  --secondary-foreground: oklch(0.985 0 0);
  --muted: oklch(0.274 0.006 286.033);
  --muted-foreground: oklch(0.705 0.015 286.067);
  --accent: oklch(0.274 0.006 286.033);
  --accent-foreground: oklch(0.985 0 0);
  --destructive: oklch(0.704 0.191 22.216);
  --border: oklch(1 0 0 / 10%);
  --input: oklch(1 0 0 / 15%);
  --ring: oklch(0.552 0.016 285.938);
  --chart-1: oklch(0.488 0.243 264.376);
  --chart-2: oklch(0.696 0.17 162.48);
  --chart-3: oklch(0.769 0.188 70.08);
  --chart-4: oklch(0.627 0.265 303.9);
  --chart-5: oklch(0.645 0.246 16.439);
  --sidebar: oklch(0.21 0.006 285.885);
  --sidebar-foreground: oklch(0.985 0 0);
  --sidebar-primary: oklch(0.488 0.243 264.376);
  --sidebar-primary-foreground: oklch(0.985 0 0);
  --sidebar-accent: oklch(0.274 0.006 286.033);
  --sidebar-accent-foreground: oklch(0.985 0 0);
  --sidebar-border: oklch(1 0 0 / 10%);
  --sidebar-ring: oklch(0.552 0.016 285.938);
}

@layer base {
  * {
    @apply border-border outline-ring/50;
  }

  body {
    @apply bg-background text-foreground;
  }
}

@layer utilities {
  @keyframes marquee {
    0% {
      transform: translateX(0);
    }

    100% {
      transform: translateX(-50%);
    }
  }

  .animate-marquee {
    animation: marquee 40s linear infinite;
    display: flex;
    min-width: 100%;
  }

  .animate-marquee:hover {
    animation-play-state: paused;
  }
}

@media print {

  /* Hide unnecessary UI elements */
  header,
  nav,
  aside,
  button,
  [data-sonner-toaster],
  .sonner-toast {
    display: none !important;
  }

  /* Reset margins for printing */
  body,
  main {
    background: white !important;
    padding: 0 !important;
    margin: 0 !important;
  }

  /* Force background colors and charts to render */
  * {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }

  /* Avoid cutting cards in half */
  .card,
  .recharts-wrapper,
  .pie-chart,
  .bar-chart {
    page-break-inside: avoid;
    break-inside: avoid;
  }

  /* Ensure text is dark and legible */
  .text-white {
    color: #1e293b !important;
  }
}
```

---

## 2. Root Layout Shell
### File: `src/app/layout.tsx`
Configures base fonts (Geist Sans & Geist Mono), handles client hydration config, setups state providers, and integrates the master application frame (`AppShell`).

```tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Satisfaction Voice",
  description: "Transforming raw student feedback into actionable intelligence.",
};

import { AnalysisProvider } from "@/context/AnalysisControlContext";
import { AnalysisProgressProvider } from "@/context/AnalysisProgressContext";
import { SurveyProvider } from "@/context/SurveyContext";
import { AuthProvider } from "@/context/AuthContext";

import { ThemeProvider } from "@/components/ThemeProvider";
import { TooltipProvider } from "@/components/ui/tooltip";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        suppressHydrationWarning
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <TooltipProvider delayDuration={150}>
            <AuthProvider>
              <SurveyProvider>
                <AnalysisProgressProvider>
                  <AnalysisProvider>
                    <AppShell>
                      {children}
                    </AppShell>
                  </AnalysisProvider>
                </AnalysisProgressProvider>
              </SurveyProvider>
            </AuthProvider>
          </TooltipProvider>
        </ThemeProvider>
        <Toaster richColors position="top-right" closeButton toastOptions={{ className: 'print:hidden' }} />
      </body>
    </html>
  );
}
```

---

## 3. Responsive App Wrapper
### File: `src/components/layout/AppShell.tsx`
Houses the layout logic, sidebar states, mobile viewport handling, theme context controls (Sun/Moon switch), user menu, and default headers/footers.

```tsx
"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { Menu, Loader2, Sun, Moon, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "next-themes";

const PAGE_TITLES: Record<string, string> = {
    "/": "Home",
    "/executive": "Executive Insights",
    "/unit-insights": "Unit Insights",
    "/faculty-insights": "Faculty Insights",
    "/ai-scientist": "AI Data Scientist",
    "/surveys": "Surveys",
    "/settings": "Settings",
    "/units": "Organization Units",
    "/faculties": "Faculty Management",
    "/users": "User Management",
};

function getPageTitle(pathname: string): string {
    if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname];
    if (pathname.startsWith("/unit-insights/")) return "Unit Insights";
    if (pathname.startsWith("/faculty-insights/")) return "Faculty Insights";
    if (pathname.startsWith("/surveys/")) return "Survey Detail";
    return "Satisfaction Voice";
}

export function AppShell({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const router = useRouter();
    const { user, loading, profile, signOut } = useAuth();
    const { theme, setTheme } = useTheme();

    const [isCollapsed, setIsCollapsed] = React.useState(false);
    const [isMobile, setIsMobile] = React.useState(false);
    const [mobileOpen, setMobileOpen] = React.useState(false);

    React.useEffect(() => {
        const checkMobile = () => {
            setIsMobile(window.innerWidth < 1024);
            if (window.innerWidth < 1024) setIsCollapsed(false);
        };
        checkMobile();
        window.addEventListener("resize", checkMobile);
        return () => window.removeEventListener("resize", checkMobile);
    }, []);

    React.useEffect(() => {
        if (!isMobile) {
            const saved = localStorage.getItem("sidebar-collapsed");
            if (saved !== null) setIsCollapsed(saved === "true");
        }
    }, [isMobile]);

    React.useEffect(() => {
        if (!loading && !user && pathname !== "/login") {
            router.replace("/login");
        }
    }, [loading, user, pathname, router]);

    const toggleCollapse = () => {
        const newState = !isCollapsed;
        setIsCollapsed(newState);
        localStorage.setItem("sidebar-collapsed", String(newState));
    };

    const handleSignOut = async () => {
        await signOut();
        router.replace("/login");
    };

    if (pathname === "/login") {
        return <>{children}</>;
    }

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-950">
                <div className="flex flex-col items-center gap-4">
                    <img src="/logo-icon.svg" alt="Satisfaction Voice" className="w-10 h-10 rounded-xl" />
                    <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
                </div>
            </div>
        );
    }

    if (!user) return null;

    return (
        <div className="flex h-screen bg-slate-50 dark:bg-slate-950 overflow-hidden print:overflow-visible transition-colors duration-300">
            {/* Desktop Sidebar */}
            {!isMobile && (
                <Sidebar isCollapsed={isCollapsed} toggleCollapse={toggleCollapse} />
            )}

            {/* Right column: top bar + scrollable content */}
            <div className="flex-1 flex flex-col overflow-hidden min-w-0">

                {/* Top Bar */}
                <header className="h-14 shrink-0 flex items-center justify-between px-5 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 print:hidden">
                    <div className="flex items-center gap-2">
                        {isMobile && (
                            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
                                <SheetTrigger asChild>
                                    <Button variant="ghost" size="icon" className="text-slate-500 hover:text-slate-900 dark:hover:white -ml-1 mr-1">
                                        <Menu className="w-5 h-5" />
                                    </Button>
                                </SheetTrigger>
                                <SheetContent side="left" className="p-0 border-r-slate-800 w-72 bg-slate-900 text-white">
                                    <Sidebar
                                        isCollapsed={false}
                                        toggleCollapse={() => {}}
                                        isMobile={true}
                                        onCloseMobile={() => setMobileOpen(false)}
                                        className="w-full border-none"
                                    />
                                </SheetContent>
                            </Sheet>
                        )}
                        <span className="text-sm font-semibold text-slate-700 dark:text-slate-200 tracking-wide">
                            {getPageTitle(pathname)}
                        </span>
                    </div>

                    <div className="flex items-center gap-0.5">
                        <button
                            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                            className="w-8 h-8 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                            title="Toggle theme"
                        >
                            {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                        </button>

                        <div
                            className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center mx-1.5 shrink-0"
                            title={profile?.full_name || profile?.email || "User"}
                        >
                            <span className="text-xs font-bold text-white">
                                {profile?.email?.[0]?.toUpperCase() ?? "?"}
                            </span>
                        </div>

                        <button
                            onClick={handleSignOut}
                            title="Sign out"
                            className="w-8 h-8 flex items-center justify-center rounded-md text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors"
                        >
                            <LogOut className="w-4 h-4" />
                        </button>
                    </div>
                </header>

                {/* Scrollable page content */}
                <main className="flex-1 overflow-auto print:overflow-visible flex flex-col">
                    <div className="flex-1">{children}</div>
                    <footer className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/50 backdrop-blur-md shrink-0 transition-colors print:hidden">
                        <div className="max-w-7xl mx-auto px-8 py-4 flex items-center justify-between text-xs text-slate-400">
                            <span>© 2026 Kenan Sadhu</span>
                            <span>Satisfaction Voice</span>
                        </div>
                    </footer>
                </main>
            </div>
        </div>
    );
}
```

---

## 4. Main Navigation Drawer
### File: `src/components/layout/Sidebar.tsx`
Generates the vertical menu sidebar. Implements smooth transition widths (collapsed vs. expanded state), menu categorization, permission controls, and gradient effects on text/borders.

```tsx
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
    Bot,
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
                    <Link href="/" className="flex items-center gap-2.5 hover:opacity-90 transition-opacity min-w-0">
                        <img src="/logo-icon.svg" alt="" className="w-8 h-8 rounded-lg shrink-0" />
                        <span className="text-sm font-semibold bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent truncate">
                            Satisfaction Voice
                        </span>
                    </Link>
                ) : (
                    <Link href="/" className="w-8 h-8 rounded-lg overflow-hidden mx-auto hover:opacity-90 transition-opacity shrink-0 block" title="Home">
                        <img src="/logo-icon.svg" alt="Satisfaction Voice" className="w-full h-full" />
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
                            <>
                                <NavItem href="/users" icon={UserCog} label="User Management" active={pathname === "/users"} />
                                <NavItem href="/ai-control" icon={Bot} label="AI Control Panel" active={pathname === "/ai-control"} />
                            </>
                        )}
                    </div>
                ) : null}
            </div>
        </div>
    );
}
```

---

## 5. Homepage (Main Dashboard) View
### File: `src/app/page.tsx`
Renders the high-fidelity home screen. Contains custom CSS grid patterns, backdrop-blur metric cards, module indices, and an interface showcasing different analytics paths.

```tsx
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useAuth, canAccessAdminPages } from "@/context/AuthContext";
import { Card, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    ArrowRight, Database, Users, Building2,
    TrendingUp, Zap, PieChart, GraduationCap, Activity,
    LayoutDashboard, Upload, BrainCircuit, GitBranch,
    BarChart3, MessageSquareText, Network, Star,
    LineChart, ShieldCheck, Cpu, Target,
} from "lucide-react";

const MODULES = [
    {
        href: "/executive",
        icon: Activity,
        label: "Executive Insights",
        tagline: "Institution-wide intelligence",
        description: "The complete picture: SSI satisfaction index, sentiment heatmaps, NPS scores, cross-unit dependency maps, and an AI-generated executive summary.",
        features: ["AI Executive Summary", "Cross-unit dependency map", "NPS scoring & trends", "Year-over-year comparison", "Action priority matrix"],
        gradient: "from-blue-600 to-indigo-600",
        lightBg: "bg-blue-50 dark:bg-blue-950/30",
        iconColor: "text-blue-600 dark:text-blue-400",
        hoverBorder: "hover:border-blue-300 dark:hover:border-blue-700",
        accent: "bg-blue-600",
        badgeColor: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
    },
    {
        href: "/unit-insights",
        icon: PieChart,
        label: "Unit Insights",
        tagline: "Deep-dive per service unit",
        description: "Drill into any unit's qualitative feedback: sentiment trends, top praised and criticised topics, student voice verbatims, and an AI analyst on demand.",
        features: ["AI-powered unit analysis", "Sentiment breakdown by topic", "Ranked student comments", "Staff & service categories", "Trend over time"],
        gradient: "from-indigo-600 to-violet-600",
        lightBg: "bg-indigo-50 dark:bg-indigo-950/30",
        iconColor: "text-indigo-600 dark:text-indigo-400",
        hoverBorder: "hover:border-indigo-300 dark:hover:border-indigo-700",
        accent: "bg-indigo-600",
        badgeColor: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300",
    },
    {
        href: "/faculty-insights",
        icon: GraduationCap,
        label: "Faculty Insights",
        tagline: "Response patterns by faculty",
        description: "Understand which faculties are most engaged, compare satisfaction across programmes, and identify under-represented student groups.",
        features: ["Faculty participation rates", "Programme-level breakdown", "Campus comparison", "Response rate tracking", "Subgroup analysis"],
        gradient: "from-teal-600 to-emerald-600",
        lightBg: "bg-teal-50 dark:bg-teal-950/30",
        iconColor: "text-teal-600 dark:text-teal-400",
        hoverBorder: "hover:border-teal-300 dark:hover:border-teal-700",
        accent: "bg-teal-600",
        badgeColor: "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300",
    },
    {
        href: "/ai-scientist",
        icon: BrainCircuit,
        label: "AI Data Scientist",
        tagline: "Conversational data analysis",
        description: "Ask any question about your survey data in plain English. The AI generates live charts, performs statistical analysis, and saves insights to a persistent gallery.",
        features: ["Natural language queries", "Auto-generated charts", "Statistical breakdowns", "Saved insight gallery", "Cross-survey analysis"],
        gradient: "from-violet-600 to-purple-600",
        lightBg: "bg-violet-50 dark:bg-violet-950/30",
        iconColor: "text-violet-600 dark:text-violet-400",
        hoverBorder: "hover:border-violet-300 dark:hover:border-violet-700",
        accent: "bg-violet-600",
        badgeColor: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
    },
];

const ADMIN_MODULE = {
    href: "/surveys",
    icon: LayoutDashboard,
    label: "Survey Management",
    tagline: "Import, configure & manage",
    description: "Import CSV exports, configure units and campuses, manage NPS settings, and run the AI pipeline that powers all analytics.",
    features: ["CSV import & mapping", "Unit & campus config", "AI pipeline control", "Platform settings", "Cache management"],
    gradient: "from-slate-600 to-slate-700",
    lightBg: "bg-slate-50 dark:bg-slate-800/50",
    iconColor: "text-slate-600 dark:text-slate-400",
    hoverBorder: "hover:border-slate-400 dark:hover:border-slate-600",
    accent: "bg-slate-600",
    badgeColor: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
};

const PLATFORM_CAPABILITIES = [
    { icon: Cpu, label: "AI Segmentation", desc: "Every open comment is auto-segmented, categorised, and sentiment-scored by AI" },
    { icon: Network, label: "Cross-Unit Analysis", desc: "Detect when students mention one unit while responding for another" },
    { icon: Star, label: "NPS Measurement", desc: "Net Promoter Score calculated per campus with full score distribution" },
    { icon: LineChart, label: "Year-over-Year", desc: "Compare satisfaction trends across survey cycles side by side" },
    { icon: Target, label: "Action Priority", desc: "Matrix of urgency vs. impact to focus improvement efforts" },
    { icon: ShieldCheck, label: "Role-based Access", desc: "Granular permissions — admins, faculty heads, and viewers" },
];

export default function HomePage() {
    useEffect(() => { document.title = "Home | Satisfaction Voice"; }, []);
    const { role, loading: authLoading, profileLoading } = useAuth();
    const isAdmin = canAccessAdminPages(role);
    const [surveys, setSurveys] = useState<any[]>([]);
    const [stats, setStats] = useState({ survey_count: 0, respondent_count: 0, unit_count: 0, segment_count: 0 });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (authLoading || profileLoading) return;
        const load = async () => {
            const [statsRes, surveysRes] = await Promise.all([
                supabase.rpc("get_platform_stats"),
                isAdmin ? supabase.from("surveys").select("*, respondents(count)").order("created_at", { ascending: false }).limit(6) : Promise.resolve({ data: [] }),
            ]);
            const s = statsRes.data?.[0];
            if (s) setStats({ survey_count: Number(s.survey_count) || 0, respondent_count: Number(s.respondent_count) || 0, unit_count: Number(s.unit_count) || 0, segment_count: Number(s.segment_count) || 0 });
            if (isAdmin) setSurveys((surveysRes as any)?.data || []);
            setLoading(false);
        };
        load();
    }, [authLoading, profileLoading, isAdmin]);

    const visibleModules = isAdmin ? [ADMIN_MODULE, ...MODULES] : MODULES;

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 font-sans">

            {/* ── HERO ─────────────────────────────────────────────────────────── */}
            <div className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-950">
                {/* Grid texture */}
                <div className="absolute inset-0 opacity-[0.07]" style={{
                    backgroundImage: "linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)",
                    backgroundSize: "48px 48px",
                }} />
                {/* Glow orbs */}
                <div className="absolute -top-24 right-1/4 w-[500px] h-[500px] bg-blue-500/20 rounded-full blur-3xl pointer-events-none" />
                <div className="absolute bottom-0 left-1/4 w-[400px] h-[400px] bg-indigo-600/15 rounded-full blur-3xl pointer-events-none" />
                <div className="absolute top-1/2 right-0 w-64 h-64 bg-violet-500/10 rounded-full blur-2xl pointer-events-none" />

                <div className="relative max-w-6xl mx-auto px-8 pt-16 pb-14">
                    {/* Hero: two columns */}
                    <div className="flex flex-col lg:flex-row gap-10 items-start mb-14">

                        {/* Left: headline + CTA */}
                        <div className="flex-1 min-w-0">
                            <h1 className="text-5xl font-extrabold text-white tracking-tight leading-none mb-3">
                                Satisfaction Voice
                            </h1>
                            <p className="text-2xl font-semibold tracking-tight mb-10 bg-gradient-to-r from-blue-400 via-indigo-300 to-violet-400 bg-clip-text text-transparent">
                                Agentic AI for institutional intelligence
                            </p>
                            <Link href="/executive">
                                <Button className="bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/50 gap-2.5 text-base px-7 py-3 h-auto font-semibold rounded-xl">
                                    Open Executive Dashboard <ArrowRight className="w-5 h-5" />
                                </Button>
                            </Link>
                        </div>

                        {/* Right: AI Scientist card */}
                        <div className="lg:w-[380px] w-full shrink-0">
                            <div className="relative rounded-2xl overflow-hidden bg-white/[0.04] border border-white/10 p-6">
                                <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-violet-500/20 blur-2xl pointer-events-none" />
                                <div className="absolute bottom-0 left-0 w-32 h-32 rounded-full bg-indigo-600/15 blur-2xl pointer-events-none" />
                                <div className="relative">
                                    <div className="flex items-center gap-2 mb-4">
                                        <div className="p-1.5 bg-violet-500/20 rounded-lg">
                                            <BrainCircuit className="w-4 h-4 text-violet-400" />
                                        </div>
                                        <span className="text-[10px] font-bold uppercase tracking-widest text-violet-300/70">AI Data Scientist</span>
                                        <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-400/80 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-2 py-0.5">New</span>
                                    </div>
                                    <p className="text-2xl font-bold text-white leading-snug mb-5">
                                        Ask anything<br />
                                        <span className="text-violet-300 font-semibold">about your data.</span>
                                    </p>
                                    <div className="space-y-2 mb-6">
                                        {[
                                            "Which units have the most negative feedback?",
                                            "Top 5 complaints from the Library, ranked",
                                            "What are students saying about the IT department?",
                                        ].map((q, i) => (
                                            <div key={i} className="text-xs text-slate-300/80 bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 italic">
                                                &ldquo;{q}&rdquo;
                                            </div>
                                        ))}
                                    </div>
                                    <Link href="/ai-scientist">
                                        <Button className="w-full bg-violet-600 hover:bg-violet-500 text-white gap-2 rounded-xl font-semibold">
                                            Open AI Scientist <ArrowRight className="w-4 h-4" />
                                        </Button>
                                    </Link>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Stats row */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {[
                            { label: "Survey Cycles", value: loading ? "—" : stats.survey_count, icon: Database, suffix: "" },
                            { label: "Student Respondents", value: loading ? "—" : stats.respondent_count.toLocaleString(), icon: Users, suffix: "" },
                            { label: "Service Units", value: loading ? "—" : stats.unit_count, icon: Building2, suffix: "" },
                            { label: "AI-Analysed Segments", value: loading ? "—" : stats.segment_count.toLocaleString(), icon: Zap, suffix: "" },
                        ].map((stat, i) => (
                            <div key={i} className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-5 hover:bg-white/[0.08] transition-all duration-300 group">
                                <div className="flex items-start justify-between mb-3">
                                    <stat.icon className="w-5 h-5 text-blue-400 mt-0.5" />
                                    <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{stat.label}</span>
                                </div>
                                <div className="text-3xl font-black text-white tabular-nums leading-none">{stat.value}{stat.suffix}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* ── PLATFORM CAPABILITIES STRIP ──────────────────────────────────── */}
            <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
                <div className="max-w-6xl mx-auto px-8 py-8">
                    <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-6">Platform Capabilities</p>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                        {PLATFORM_CAPABILITIES.map((cap, i) => (
                            <div key={i} className="flex flex-col gap-2 p-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors">
                                <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg w-fit">
                                    <cap.icon className="w-4 h-4 text-slate-600 dark:text-slate-300" />
                                </div>
                                <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">{cap.label}</p>
                                <p className="text-[11px] text-slate-400 dark:text-slate-500 leading-snug">{cap.desc}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* ── MAIN CONTENT ─────────────────────────────────────────────────── */}
            <div className="max-w-6xl mx-auto px-8 py-12 space-y-14">

                {/* Module Showcase */}
                <div>
                    <div className="flex items-center gap-3 mb-6">
                        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Analytics Modules</h2>
                        <span className="text-sm text-slate-400">— choose where to go</span>
                    </div>

                    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden divide-y divide-slate-100 dark:divide-slate-800">
                        {visibleModules.map((mod, idx) => (
                            <Link key={mod.href} href={mod.href} className="group block">
                                <div className="relative flex items-start gap-6 px-8 py-7 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors duration-150">

                                    {/* Colored left accent bar */}
                                    <div className={`absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b ${mod.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-200`} />

                                    {/* Index number */}
                                    <span className="text-4xl font-black text-slate-100 dark:text-slate-800 tabular-nums leading-none pt-1 select-none w-8 shrink-0 text-right">
                                        {String(idx + 1).padStart(2, "0")}
                                    </span>

                                    {/* Icon */}
                                    <div className={`p-3 ${mod.lightBg} rounded-2xl shrink-0 mt-0.5 group-hover:scale-105 transition-transform duration-200`}>
                                        <mod.icon className={`w-6 h-6 ${mod.iconColor}`} />
                                    </div>

                                    {/* Title + tagline + description */}
                                    <div className="flex-1 min-w-0 space-y-1.5">
                                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">{mod.tagline}</p>
                                        <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 leading-snug group-hover:text-slate-700 dark:group-hover:text-white transition-colors">
                                            {mod.label}
                                        </h3>
                                        <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed max-w-2xl">
                                            {mod.description}
                                        </p>

                                        {/* Feature chips — below description */}
                                        <div className="flex flex-wrap gap-1.5 pt-2">
                                            {mod.features.map((f, fi) => (
                                                <span key={fi} className={`text-[11px] font-medium px-2.5 py-1 rounded-full ${mod.badgeColor}`}>
                                                    {f}
                                                </span>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Arrow CTA */}
                                    <div className="shrink-0 flex items-center self-center pl-4">
                                        <div className={`flex items-center gap-1.5 text-sm font-semibold ${mod.iconColor} opacity-0 group-hover:opacity-100 transition-all duration-200 group-hover:translate-x-0 -translate-x-2`}>
                                            Open <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                                        </div>
                                    </div>

                                </div>
                            </Link>
                        ))}
                    </div>
                </div>

                {/* Recent Surveys — admin only */}
                {isAdmin && (
                    <div className="space-y-5">
                        <div className="flex items-center justify-between">
                            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2.5">
                                <TrendingUp className="w-5 h-5 text-slate-400" />
                                Recent Survey Projects
                            </h2>
                            <Link href="/surveys">
                                <Button variant="ghost" size="sm" className="text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 gap-1.5 text-sm">
                                    View all <ArrowRight className="w-3.5 h-3.5" />
                                </Button>
                            </Link>
                        </div>

                        {loading ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                                {[1, 2, 3].map(i => (
                                    <div key={i} className="h-40 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 animate-pulse" />
                                ))}
                            </div>
                        ) : surveys.length > 0 ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                                {surveys.map((survey) => (
                                    <Link key={survey.id} href={`/surveys/${survey.id}`} className="group">
                                        <Card className="h-full bg-white dark:bg-slate-900 hover:shadow-lg transition-all duration-200 border-slate-200 dark:border-slate-800 hover:border-blue-300 dark:hover:border-blue-700 group-hover:-translate-y-1 overflow-hidden">
                                            <div className="h-1 bg-gradient-to-r from-blue-500 to-indigo-500" />
                                            <CardHeader className="pb-3">
                                                <div className="flex justify-between items-start mb-2">
                                                    <Badge variant="secondary" className="bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-[11px] group-hover:bg-blue-50 group-hover:text-blue-600 dark:group-hover:bg-blue-900/30 dark:group-hover:text-blue-400 transition-colors">
                                                        {new Date(survey.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                                                    </Badge>
                                                    <MessageSquareText className="w-4 h-4 text-slate-300 dark:text-slate-600 group-hover:text-blue-400 transition-colors" />
                                                </div>
                                                <CardTitle className="text-base font-bold text-slate-900 dark:text-slate-100 group-hover:text-blue-700 dark:group-hover:text-blue-400 transition-colors leading-snug">
                                                    {survey.title}
                                                </CardTitle>
                                                <CardDescription className="flex items-center gap-1.5 text-slate-400 dark:text-slate-500 text-sm">
                                                    <Users className="w-3.5 h-3.5" />
                                                    {(survey.respondents?.[0]?.count || 0).toLocaleString()} respondents
                                                </CardDescription>
                                            </CardHeader>
                                            <CardFooter className="pt-0">
                                                <div className="text-sm font-semibold text-blue-600 dark:text-blue-400 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    Open Dashboard <ArrowRight className="w-4 h-4" />
                                                </div>
                                            </CardFooter>
                                        </Card>
                                    </Link>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-20 bg-white dark:bg-slate-900 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-800">
                                <div className="mx-auto w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-4">
                                    <Upload className="w-8 h-8 text-slate-400" />
                                </div>
                                <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-2">No surveys yet</h3>
                                <p className="text-slate-500 dark:text-slate-400 mb-6 max-w-xs mx-auto text-sm">
                                    Import your first CSV file to start analysing student feedback with AI.
                                </p>
                                <Link href="/import">
                                    <Button className="bg-blue-600 hover:bg-blue-700 shadow-sm gap-2">
                                        <Upload className="w-4 h-4" /> Start Your First Import
                                    </Button>
                                </Link>
                            </div>
                        )}
                    </div>
                )}

                {/* Footer strip */}
                <div className="flex items-center justify-between pt-4 border-t border-slate-200 dark:border-slate-800">
                    <div className="flex items-center gap-2 text-sm text-slate-400">
                        <GitBranch className="w-4 h-4" />
                        Satisfaction Voice · AI Analytics Engine
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-slate-400">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse inline-block" />
                        System operational
                    </div>
                </div>

            </div>
        </div>
    );
}
```

---

## 6. Layout Style Utility
### File: `src/lib/utils.ts`
This utility maps class name lists with Tailwind CSS rules to resolve potential collisions, which is critical for compiling dynamic component classes.

```ts
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
```
