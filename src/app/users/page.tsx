"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth, isOwner, UserRole } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
    UserCog, Loader2, Shield, ShieldCheck, Crown,
    Trash2, Check, X, Search, RefreshCw
} from "lucide-react";
import { toast } from "sonner";

interface Profile {
    id: string;
    email: string | null;
    full_name: string | null;
    role: UserRole;
    created_at: string;
}

const ROLE_META: Record<UserRole, { label: string; color: string; icon: React.ElementType }> = {
    owner: { label: "Owner", color: "bg-amber-500/10 text-amber-500 border-amber-500/20", icon: Crown },
    admin: { label: "Admin", color: "bg-blue-500/10 text-blue-500 border-blue-500/20", icon: ShieldCheck },
    user:  { label: "User",  color: "bg-slate-500/10 text-slate-400 border-slate-500/20", icon: Shield },
};

export default function UsersPage() {
    const { role: myRole, profile: myProfile, loading: authLoading, profileLoading } = useAuth();
    const router = useRouter();

    const [profiles, setProfiles] = useState<Profile[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [updatingId, setUpdatingId] = useState<string | null>(null);
    const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

    useEffect(() => {
        if (!authLoading && !profileLoading && !isOwner(myRole)) {
            router.replace("/");
        }
    }, [authLoading, profileLoading, myRole, router]);

    useEffect(() => {
        if (!authLoading && !profileLoading && isOwner(myRole)) loadProfiles();
    }, [authLoading, profileLoading, myRole]);

    async function loadProfiles() {
        setLoading(true);
        const { data } = await supabase
            .from("profiles")
            .select("id, email, full_name, role, created_at")
            .order("created_at", { ascending: false });
        if (data) setProfiles(data as Profile[]);
        setLoading(false);
    }

    async function handleRoleChange(profileId: string, newRole: UserRole) {
        if (newRole === "owner") return; // safety: never assign owner via UI
        setUpdatingId(profileId);
        const { error } = await supabase
            .from("profiles")
            .update({ role: newRole })
            .eq("id", profileId);
        if (error) {
            toast.error("Failed to update role: " + error.message);
        } else {
            toast.success(`Role updated to ${newRole}`);
            setProfiles(prev => prev.map(p => p.id === profileId ? { ...p, role: newRole } : p));
        }
        setUpdatingId(null);
    }

    async function handleDelete(profileId: string) {
        setUpdatingId(profileId);
        const { error } = await supabase.from("profiles").delete().eq("id", profileId);
        if (error) {
            toast.error("Failed to remove user: " + error.message);
        } else {
            toast.success("User profile removed");
            setProfiles(prev => prev.filter(p => p.id !== profileId));
            setDeleteConfirm(null);
        }
        setUpdatingId(null);
    }

    const filtered = profiles.filter(p => {
        const q = search.toLowerCase();
        return (
            p.email?.toLowerCase().includes(q) ||
            p.full_name?.toLowerCase().includes(q) ||
            p.role.includes(q)
        );
    });

    if (authLoading || profileLoading || loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
            </div>
        );
    }

    if (!isOwner(myRole)) return null;

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
            {/* Header */}
            <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-blue-950 px-8 py-10">
                <div className="max-w-4xl mx-auto">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 rounded-xl bg-indigo-500/20 border border-indigo-500/30">
                            <UserCog className="w-6 h-6 text-indigo-400" />
                        </div>
                        <h1 className="text-2xl font-bold text-white">User Management</h1>
                    </div>
                    <p className="text-slate-400 ml-14">
                        Manage user access. Promote users to Admin for full platform access.
                    </p>
                </div>
            </div>

            <div className="max-w-4xl mx-auto px-8 py-8 space-y-6">
                {/* Role Legend */}
                <div className="flex flex-wrap gap-3 text-sm">
                    {(["owner", "admin", "user"] as UserRole[]).map(r => {
                        const meta = ROLE_META[r];
                        const Icon = meta.icon;
                        return (
                            <div key={r} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium ${meta.color}`}>
                                <Icon className="w-3.5 h-3.5" />
                                {meta.label}
                                <span className="opacity-60">—</span>
                                <span className="opacity-70">
                                    {r === "owner" ? "Full access + user management" :
                                     r === "admin" ? "Surveys + all insights" :
                                     "Faculty, Unit, Executive Insights"}
                                </span>
                            </div>
                        );
                    })}
                </div>

                {/* Toolbar */}
                <div className="flex items-center gap-3">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <Input
                            placeholder="Search by email, name, or role..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="pl-9"
                        />
                    </div>
                    <Button variant="outline" size="icon" onClick={loadProfiles} title="Refresh">
                        <RefreshCw className="w-4 h-4" />
                    </Button>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-4">
                    {(["owner", "admin", "user"] as UserRole[]).map(r => {
                        const count = profiles.filter(p => p.role === r).length;
                        const meta = ROLE_META[r];
                        const Icon = meta.icon;
                        return (
                            <div key={r} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 flex items-center gap-3">
                                <div className={`p-2 rounded-lg border ${meta.color}`}>
                                    <Icon className="w-4 h-4" />
                                </div>
                                <div>
                                    <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">{count}</div>
                                    <div className="text-xs text-slate-500">{meta.label}{count !== 1 ? "s" : ""}</div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* User List */}
                {filtered.length === 0 ? (
                    <div className="text-center py-16 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                        <UserCog className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                        <p className="text-slate-500">{search ? "No users match your search." : "No users found."}</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {filtered.map((profile) => {
                            const meta = ROLE_META[profile.role];
                            const Icon = meta.icon;
                            const isMe = profile.id === myProfile?.id;
                            const isOwnerProfile = profile.role === "owner";
                            const isUpdating = updatingId === profile.id;

                            return (
                                <Card key={profile.id} className={`bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 ${isMe ? "ring-1 ring-blue-500/30" : ""}`}>
                                    <CardContent className="p-5">
                                        <div className="flex items-center justify-between gap-4">
                                            <div className="flex items-center gap-3 min-w-0">
                                                {/* Avatar */}
                                                <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 border ${meta.color}`}>
                                                    <Icon className="w-4 h-4" />
                                                </div>
                                                {/* Info */}
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                                                            {profile.full_name || profile.email || "Unknown"}
                                                        </span>
                                                        {isMe && (
                                                            <Badge variant="outline" className="text-[10px] border-blue-500/40 text-blue-400">You</Badge>
                                                        )}
                                                        <Badge className={`text-xs border ${meta.color} bg-transparent`}>
                                                            {meta.label}
                                                        </Badge>
                                                    </div>
                                                    <p className="text-sm text-slate-500 truncate">{profile.email}</p>
                                                    <p className="text-xs text-slate-400 mt-0.5">
                                                        Joined {new Date(profile.created_at).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}
                                                    </p>
                                                </div>
                                            </div>

                                            {/* Actions */}
                                            {!isOwnerProfile && !isMe && (
                                                <div className="flex items-center gap-2 shrink-0">
                                                    {deleteConfirm === profile.id ? (
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="text-xs text-red-500 font-medium">Remove access?</span>
                                                            <Button
                                                                size="sm"
                                                                variant="ghost"
                                                                onClick={() => handleDelete(profile.id)}
                                                                disabled={isUpdating}
                                                                className="text-red-500 hover:text-red-600 h-7 w-7 p-0"
                                                            >
                                                                {isUpdating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                                                            </Button>
                                                            <Button size="sm" variant="ghost" onClick={() => setDeleteConfirm(null)} className="h-7 w-7 p-0">
                                                                <X className="w-3 h-3" />
                                                            </Button>
                                                        </div>
                                                    ) : (
                                                        <>
                                                            {/* Role Toggle */}
                                                            {profile.role === "user" ? (
                                                                <Button
                                                                    size="sm"
                                                                    onClick={() => handleRoleChange(profile.id, "admin")}
                                                                    disabled={isUpdating}
                                                                    className="gap-1.5 h-8 bg-blue-600 hover:bg-blue-500 text-white text-xs"
                                                                >
                                                                    {isUpdating ? <Loader2 className="w-3 h-3 animate-spin" /> : <ShieldCheck className="w-3 h-3" />}
                                                                    Make Admin
                                                                </Button>
                                                            ) : (
                                                                <Button
                                                                    size="sm"
                                                                    variant="outline"
                                                                    onClick={() => handleRoleChange(profile.id, "user")}
                                                                    disabled={isUpdating}
                                                                    className="gap-1.5 h-8 text-xs"
                                                                >
                                                                    {isUpdating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Shield className="w-3 h-3" />}
                                                                    Demote to User
                                                                </Button>
                                                            )}
                                                            <Button
                                                                size="sm"
                                                                variant="ghost"
                                                                onClick={() => setDeleteConfirm(profile.id)}
                                                                className="text-slate-400 hover:text-red-500 h-8 w-8 p-0"
                                                                title="Remove user access"
                                                            >
                                                                <Trash2 className="w-3.5 h-3.5" />
                                                            </Button>
                                                        </>
                                                    )}
                                                </div>
                                            )}
                                            {isOwnerProfile && (
                                                <Badge className="border border-amber-500/30 bg-amber-500/10 text-amber-500 text-xs">
                                                    Protected
                                                </Badge>
                                            )}
                                        </div>
                                    </CardContent>
                                </Card>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
