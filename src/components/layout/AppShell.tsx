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
    return "Student Voice Platform";
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
                    <div className="px-3 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-600/20">
                        <span className="text-xl font-bold text-white">SVP</span>
                    </div>
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
                                    <Button variant="ghost" size="icon" className="text-slate-500 hover:text-slate-900 dark:hover:text-white -ml-1 mr-1">
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
                            <span>Student Voice Platform</span>
                        </div>
                    </footer>
                </main>
            </div>
        </div>
    );
}
