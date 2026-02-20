"use client";

import * as React from "react";
import { Sidebar } from "./Sidebar";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

export function AppShell({ children }: { children: React.ReactNode }) {
    // Persist sidebar state
    const [isCollapsed, setIsCollapsed] = React.useState(false);
    const [isMobile, setIsMobile] = React.useState(false);
    const [mobileOpen, setMobileOpen] = React.useState(false);

    // Handle Responsive
    React.useEffect(() => {
        const checkMobile = () => {
            setIsMobile(window.innerWidth < 1024); // lg breakpoint
            if (window.innerWidth < 1024) {
                setIsCollapsed(false); // Reset collapse on mobile
            }
        };

        // Initial check
        checkMobile();

        // Listen for resize
        window.addEventListener("resize", checkMobile);
        return () => window.removeEventListener("resize", checkMobile);
    }, []);

    // Load persisted state only on desktop
    React.useEffect(() => {
        if (!isMobile) {
            const saved = localStorage.getItem("sidebar-collapsed");
            if (saved !== null) {
                setIsCollapsed(saved === "true");
            }
        }
    }, [isMobile]);

    const toggleCollapse = () => {
        const newState = !isCollapsed;
        setIsCollapsed(newState);
        localStorage.setItem("sidebar-collapsed", String(newState));
    };

    return (
        <div className="flex h-screen bg-slate-50 dark:bg-slate-950 overflow-hidden print:overflow-visible transition-colors duration-300">
            {/* Desktop Sidebar */}
            {!isMobile && (
                <Sidebar
                    isCollapsed={isCollapsed}
                    toggleCollapse={toggleCollapse}
                />
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
                                toggleCollapse={() => { }}
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
                <div className="flex-1">
                    {children}
                </div>
                <footer className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/50 backdrop-blur-md shrink-0 transition-colors">
                    <div className="max-w-7xl mx-auto px-8 py-4 flex items-center justify-between text-xs text-slate-400 dark:text-slate-400">
                        <span>Student Voice Analytics</span>
                        <span>Next.js • Supabase • Gemini AI</span>
                    </div>
                </footer>
            </main>
        </div>
    );
}
