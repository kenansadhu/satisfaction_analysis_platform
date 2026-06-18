"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Loader2, Mail, Lock, CheckCircle2, AlertCircle,
    ArrowLeft, RefreshCw, GitBranch,
} from "lucide-react";

function LoginInner() {
    const router = useRouter();
    const searchParams = useSearchParams();

    const [email, setEmail]       = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading]   = useState(false);
    const [error, setError]       = useState<string | null>(null);
    const [mode, setMode]         = useState<"login" | "signup" | "pending">("login");
    const [pendingEmail, setPendingEmail] = useState("");
    const [resendCooldown, setResendCooldown] = useState(0);
    const [resending, setResending] = useState(false);

    const confirmed = searchParams.get("confirmed") === "true";

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session) router.replace("/");
        });
    }, [router]);

    useEffect(() => {
        if (resendCooldown <= 0) return;
        const t = setTimeout(() => setResendCooldown(c => c - 1), 1000);
        return () => clearTimeout(t);
    }, [resendCooldown]);

    const handleResend = async () => {
        setResending(true);
        await supabase.auth.resend({ type: "signup", email: pendingEmail });
        setResending(false);
        setResendCooldown(60);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        try {
            if (mode === "login") {
                const { error } = await supabase.auth.signInWithPassword({ email, password });
                if (error) throw error;
                router.replace("/");
            } else {
                if (!email.toLowerCase().endsWith("@uph.edu")) {
                    throw new Error("Only @uph.edu email addresses are allowed to sign up.");
                }
                const { error } = await supabase.auth.signUp({
                    email,
                    password,
                    options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
                });
                if (error) throw error;
                setPendingEmail(email);
                setResendCooldown(60);
                setMode("pending");
            }
        } catch (err: any) {
            setError(err.message || "Something went wrong. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    // ── Shared page shell ────────────────────────────────────────────────────
    const Shell = ({ children }: { children: React.ReactNode }) => (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
            <div className="w-full max-w-sm">
                {children}
            </div>
            <div className="mt-8 flex items-center gap-2 text-xs text-slate-400">
                <GitBranch className="w-3.5 h-3.5" />
                Satisfaction Voice · Universitas Pelita Harapan
            </div>
        </div>
    );

    // ── Pending — awaiting email confirmation ────────────────────────────────
    if (mode === "pending") {
        return (
            <Shell>
                <div className="text-center mb-7">
                    <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Satisfaction Voice</h1>
                    <p className="text-sm text-slate-500 mt-1">Student Analytics Platform</p>
                </div>

                <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                    <div className="h-1 bg-gradient-to-r from-blue-500 to-indigo-500" />
                    <div className="p-8 text-center">
                        <div className="w-11 h-11 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center mx-auto mb-5">
                            <Mail className="w-5 h-5 text-blue-600" />
                        </div>
                        <h2 className="text-base font-bold text-slate-900 mb-1">Check your inbox</h2>
                        <p className="text-slate-500 text-sm mb-1">Confirmation link sent to</p>
                        <p className="text-blue-600 font-semibold text-sm mb-4 break-all">{pendingEmail}</p>
                        <p className="text-slate-400 text-xs leading-relaxed mb-6">
                            Click the link in that email, then return here to sign in with your password.
                        </p>

                        <div className="space-y-2.5">
                            <Button
                                onClick={handleResend}
                                disabled={resendCooldown > 0 || resending}
                                variant="outline"
                                className="w-full h-10 border-slate-200 text-slate-600 hover:bg-slate-50 text-sm"
                            >
                                {resending ? (
                                    <><Loader2 className="w-3.5 h-3.5 animate-spin mr-2" />Sending…</>
                                ) : resendCooldown > 0 ? (
                                    <><RefreshCw className="w-3.5 h-3.5 mr-2" />Resend in {resendCooldown}s</>
                                ) : (
                                    <><RefreshCw className="w-3.5 h-3.5 mr-2" />Resend confirmation email</>
                                )}
                            </Button>
                            <button
                                onClick={() => { setMode("login"); setError(null); setEmail(""); setPassword(""); }}
                                className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 transition-colors mx-auto"
                            >
                                <ArrowLeft className="w-3 h-3" /> Back to sign in
                            </button>
                        </div>
                    </div>
                </div>
            </Shell>
        );
    }

    // ── Login / Signup ───────────────────────────────────────────────────────
    return (
        <Shell>
            <div className="text-center mb-7">
                <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Satisfaction Voice</h1>
                <p className="text-sm text-slate-500 mt-1">
                    {mode === "login" ? "Sign in to your analytics dashboard" : "Create a new account"}
                </p>
            </div>

            {/* Email confirmed banner */}
            {confirmed && (
                <div className="flex items-center gap-2.5 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm mb-4">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>Email confirmed — sign in below to get started.</span>
                </div>
            )}

            {/* Form card */}
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                <div className="h-1 bg-gradient-to-r from-blue-500 to-indigo-500" />
                <div className="p-8">
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-1.5">
                            <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Email</label>
                            <div className="relative">
                                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                                <Input
                                    type="email"
                                    placeholder="you@uph.edu"
                                    value={email}
                                    onChange={e => setEmail(e.target.value)}
                                    required
                                    className="pl-9 h-10 border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:border-blue-400 transition-colors text-sm"
                                />
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Password</label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                                <Input
                                    type="password"
                                    placeholder="••••••••"
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    required
                                    minLength={mode === "signup" ? 8 : undefined}
                                    className="pl-9 h-10 border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:border-blue-400 transition-colors text-sm"
                                />
                            </div>
                            {mode === "signup" && (
                                <p className="text-[11px] text-slate-400">Minimum 8 characters.</p>
                            )}
                        </div>

                        {error && (
                            <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
                                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                                <span>{error}</span>
                            </div>
                        )}

                        <Button
                            type="submit"
                            disabled={loading}
                            className="w-full h-10 bg-blue-600 hover:bg-blue-500 text-white font-semibold shadow-sm text-sm mt-1"
                        >
                            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : mode === "login" ? "Sign In" : "Create Account"}
                        </Button>
                    </form>

                    <div className="mt-5 pt-5 border-t border-slate-100 text-center">
                        <button
                            type="button"
                            onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(null); }}
                            className="text-sm text-slate-400 hover:text-slate-700 transition-colors"
                        >
                            {mode === "login" ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
                        </button>
                    </div>
                </div>
            </div>
        </Shell>
    );
}

export default function LoginPage() {
    useEffect(() => { document.title = "Sign In | Satisfaction Voice"; }, []);
    return (
        <Suspense>
            <LoginInner />
        </Suspense>
    );
}
