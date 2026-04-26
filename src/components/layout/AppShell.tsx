"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { Menu, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useAuth } from "@/context/AuthContext";

export function AppShell({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const router = useRouter();
    const { user, loading } = useAuth();

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

    // Login page: render standalone without shell
    if (pathname === "/login") {
        return <>{children}</>;
    }

    // Auth loading state
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

    // Not authenticated — render nothing while redirect fires
    if (!user) {
        return null;
    }

    return (
        <div className="flex h-screen bg-slate-50 dark:bg-slate-950 overflow-hidden print:overflow-visible transition-colors duration-300">
            {/* Desktop Sidebar */}
            {!isMobile && (
                <Sidebar isCollapsed={isCollapsed} toggleCollapse={toggleCollapse} />
            )}

            {/* Mobile Sidebar (Drawer) */}
            {isMobile && (
                <div className="fixed top-4 left-4 z-50">
                    <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
                        <SheetTrigger asChild>
                            <Button variant="outline" size="icon" className="bg-slate-900 border-slate-700 text-white hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700">
                                <Menu className="w-5 h-5" />
                            </Button>
                        </SheetTrigger>
                        <SheetContent side="left" className="p-0 border-r-slate-800 w-72 bg-slate-950 text-white">
                            <Sidebar
                                isCollapsed={false}
                                toggleCollapse={() => {}}
                                isMobile={true}
                                onCloseMobile={() => setMobileOpen(false)}
                                className="w-full border-none"
                            />
                        </SheetContent>
                    </Sheet>
                </div>
            )}

            {/* Main Content Area */}
            <main className="flex-1 overflow-auto print:overflow-visible relative w-full h-full flex flex-col">
                <div className="flex-1">{children}</div>
                <footer className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/50 backdrop-blur-md shrink-0 transition-colors">
                    <div className="max-w-7xl mx-auto px-8 py-4 flex items-center justify-between text-xs text-slate-400 dark:text-slate-400">
                        <span>© 2026 Kenan Sadhu</span>
                        <span>Student Voice Platform</span>
                    </div>
                </footer>
            </main>
        </div>
    );
}
