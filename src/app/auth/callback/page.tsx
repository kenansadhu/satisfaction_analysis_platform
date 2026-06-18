"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { CheckCircle2, XCircle, Loader2, GitBranch } from "lucide-react";

function CallbackHandler() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [status, setStatus] = useState<"processing" | "success" | "error">("processing");
    const [errorMsg, setErrorMsg] = useState("This link may have expired or has already been used.");

    useEffect(() => {
        const tokenHash = searchParams.get("token_hash");
        const type = searchParams.get("type") as "signup" | "recovery" | null;
        const errorParam = searchParams.get("error");
        const errorDescription = searchParams.get("error_description");

        if (errorParam) {
            setErrorMsg(errorDescription?.replace(/\+/g, " ") || "This confirmation link is invalid or has expired.");
            setStatus("error");
            return;
        }

        if (tokenHash && type) {
            supabase.auth.verifyOtp({ token_hash: tokenHash, type }).then(async ({ error }) => {
                if (error) {
                    setErrorMsg(error.message || "This link may have expired. Please request a new one from the sign-in page.");
                    setStatus("error");
                } else {
                    setStatus("success");
                    await supabase.auth.signOut();
                    setTimeout(() => router.replace("/login?confirmed=true"), 1600);
                }
            });
            return;
        }

        // Fallback: hash-based token auto-processed by Supabase JS
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            if (event === "SIGNED_IN" && session) {
                setStatus("success");
                await supabase.auth.signOut();
                setTimeout(() => router.replace("/login?confirmed=true"), 1600);
            }
        });

        const timeout = setTimeout(() => router.replace("/login"), 3000);
        return () => {
            subscription.unsubscribe();
            clearTimeout(timeout);
        };
    }, [router, searchParams]);

    return (
        <div className="w-full max-w-sm text-center">
            {/* Branding */}
            <div className="mb-8">
                <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Satisfaction Voice</h1>
                <p className="text-sm text-slate-500 mt-1">Student Analytics Platform</p>
            </div>

            {/* Status card */}
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                <div className={`h-1 ${status === "success" ? "bg-gradient-to-r from-emerald-400 to-teal-500" : status === "error" ? "bg-gradient-to-r from-red-400 to-rose-500" : "bg-gradient-to-r from-blue-500 to-indigo-500"}`} />
                <div className="p-10">
                    {status === "processing" && (
                        <div className="space-y-4">
                            <div className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center mx-auto">
                                <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
                            </div>
                            <p className="text-base font-bold text-slate-900">Confirming your email…</p>
                            <p className="text-slate-400 text-sm">Just a moment, please don't close this tab.</p>
                        </div>
                    )}

                    {status === "success" && (
                        <div className="space-y-4">
                            <div className="w-12 h-12 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center mx-auto">
                                <CheckCircle2 className="w-6 h-6 text-emerald-600" />
                            </div>
                            <p className="text-base font-bold text-slate-900">Email confirmed</p>
                            <p className="text-slate-400 text-sm">Redirecting you to sign in…</p>
                        </div>
                    )}

                    {status === "error" && (
                        <div className="space-y-4">
                            <div className="w-12 h-12 rounded-xl bg-red-50 border border-red-100 flex items-center justify-center mx-auto">
                                <XCircle className="w-6 h-6 text-red-500" />
                            </div>
                            <p className="text-base font-bold text-slate-900">Confirmation failed</p>
                            <p className="text-slate-500 text-sm leading-relaxed">{errorMsg}</p>
                            <button
                                onClick={() => router.replace("/login")}
                                className="mt-2 px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm transition-colors"
                            >
                                Back to sign in
                            </button>
                        </div>
                    )}
                </div>
            </div>

            <div className="mt-8 flex items-center gap-2 text-xs text-slate-400 justify-center">
                <GitBranch className="w-3.5 h-3.5" />
                Satisfaction Voice · Universitas Pelita Harapan
            </div>
        </div>
    );
}

export default function AuthCallbackPage() {
    useEffect(() => { document.title = "Confirming… | Satisfaction Voice"; }, []);
    return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
            <Suspense>
                <CallbackHandler />
            </Suspense>
        </div>
    );
}
