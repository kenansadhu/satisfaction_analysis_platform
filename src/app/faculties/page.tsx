"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth, canAccessAdminPages } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
    GraduationCap, Plus, Pencil, Trash2, Check, X, Loader2, Users, Search,
} from "lucide-react";
import { toast } from "sonner";
import { PageShell, PageHeader } from "@/components/layout/PageShell";

interface Faculty {
    id: number;
    name: string;
    short_name: string | null;
    description: string | null;
    respondent_count?: number;
}

interface EditState {
    name: string;
    short_name: string;
    description: string;
}

export default function FacultiesPage() {
    const { role, loading: authLoading, profileLoading } = useAuth();
    const router = useRouter();

    const [faculties, setFaculties] = useState<Faculty[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [editingId, setEditingId] = useState<number | null>(null);
    const [editState, setEditState] = useState<EditState>({ name: "", short_name: "", description: "" });
    const [addingNew, setAddingNew] = useState(false);
    const [newFaculty, setNewFaculty] = useState<EditState>({ name: "", short_name: "", description: "" });
    const [saving, setSaving] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

    useEffect(() => {
        if (!authLoading && !profileLoading && !canAccessAdminPages(role)) {
            router.replace("/");
        }
    }, [authLoading, profileLoading, role, router]);

    useEffect(() => {
        loadFaculties();
    }, []);

    async function loadFaculties() {
        setLoading(true);
        const { data } = await supabase
            .from("faculties")
            .select("id, name, short_name, description")
            .order("name");

        if (data) {
            const enriched = await Promise.all(data.map(async (f) => {
                const { count } = await supabase
                    .from("respondents")
                    .select("*", { count: "exact", head: true })
                    .eq("faculty_id", f.id);
                return { ...f, respondent_count: count ?? 0 };
            }));
            setFaculties(enriched);
        }
        setLoading(false);
    }

    async function handleCreate() {
        if (!newFaculty.name.trim()) return;
        setSaving(true);
        const { error } = await supabase.from("faculties").insert({
            name: newFaculty.name.trim(),
            short_name: newFaculty.short_name.trim() || null,
            description: newFaculty.description.trim() || null,
        });
        if (error) {
            toast.error("Failed to create faculty: " + error.message);
        } else {
            toast.success("Faculty created");
            setAddingNew(false);
            setNewFaculty({ name: "", short_name: "", description: "" });
            await loadFaculties();
        }
        setSaving(false);
    }

    function startEdit(faculty: Faculty) {
        setEditingId(faculty.id);
        setEditState({
            name: faculty.name,
            short_name: faculty.short_name ?? "",
            description: faculty.description ?? "",
        });
    }

    async function handleUpdate(id: number) {
        if (!editState.name.trim()) return;
        setSaving(true);
        const { error } = await supabase.from("faculties").update({
            name: editState.name.trim(),
            short_name: editState.short_name.trim() || null,
            description: editState.description.trim() || null,
        }).eq("id", id);
        if (error) {
            toast.error("Failed to update: " + error.message);
        } else {
            toast.success("Faculty updated");
            setEditingId(null);
            await loadFaculties();
        }
        setSaving(false);
    }

    async function handleDelete(id: number) {
        setSaving(true);
        const { error } = await supabase.from("faculties").delete().eq("id", id);
        if (error) {
            toast.error("Failed to delete: " + error.message);
        } else {
            toast.success("Faculty deleted");
            setDeleteConfirm(null);
            await loadFaculties();
        }
        setSaving(false);
    }

    if (authLoading || profileLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-teal-400" />
            </div>
        );
    }

    if (!canAccessAdminPages(role)) return null;

    const filtered = faculties.filter(f =>
        f.name.toLowerCase().includes(search.toLowerCase()) ||
        (f.short_name || "").toLowerCase().includes(search.toLowerCase())
    );

    return (
        <PageShell>
            <PageHeader
                title={<span className="flex items-center gap-2"><GraduationCap className="w-6 h-6 text-teal-500" /> Faculty Management</span>}
                description="Manage the list of faculties used across surveys and insights."
            />

            <div className="max-w-5xl mx-auto px-8 py-8 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">

                {/* Hero stats */}
                {!loading && (
                    <div className="relative rounded-2xl overflow-hidden bg-gradient-to-br from-slate-900 via-teal-950 to-slate-900 border border-teal-900/50 shadow-xl">
                        <div className="absolute -top-16 -right-16 w-56 h-56 rounded-full bg-teal-500/15 blur-3xl pointer-events-none" />
                        <div className="absolute -bottom-12 -left-12 w-48 h-48 rounded-full bg-cyan-500/10 blur-3xl pointer-events-none" />
                        <div className="relative flex items-center gap-10 px-8 py-6">
                            <div className="text-center shrink-0">
                                <div className="text-5xl font-black text-white tabular-nums leading-none">{faculties.length}</div>
                                <div className="text-xs font-semibold uppercase tracking-widest text-teal-300/60 mt-1">Total Faculties</div>
                            </div>
                            <div className="w-px h-12 bg-white/10 shrink-0" />
                            <div className="text-center shrink-0">
                                <div className="text-3xl font-black text-teal-300 tabular-nums leading-none">
                                    {faculties.reduce((s, f) => s + (f.respondent_count || 0), 0).toLocaleString()}
                                </div>
                                <div className="text-xs font-semibold uppercase tracking-widest text-teal-300/60 mt-1">Total Respondents</div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Toolbar */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 justify-between">
                    <div className="relative w-full max-w-xs">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <Input
                            placeholder="Search faculties..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="pl-9"
                        />
                    </div>
                    {!addingNew && (
                        <Button
                            onClick={() => setAddingNew(true)}
                            className="gap-2 bg-teal-600 hover:bg-teal-500 text-white shrink-0"
                        >
                            <Plus className="w-4 h-4" /> Add Faculty
                        </Button>
                    )}
                </div>

                {/* Add new form */}
                {addingNew && (
                    <div className="bg-white dark:bg-slate-900 border border-teal-200 dark:border-teal-800/60 rounded-2xl p-5 shadow-sm space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
                        <div className="flex items-center gap-2 mb-1">
                            <div className="p-1.5 rounded-lg bg-teal-50 dark:bg-teal-950/40">
                                <GraduationCap className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                            </div>
                            <h3 className="text-sm font-semibold text-teal-700 dark:text-teal-300">New Faculty</h3>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                                <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1 block">Name *</label>
                                <Input
                                    placeholder="e.g. Faculty of Engineering"
                                    value={newFaculty.name}
                                    onChange={e => setNewFaculty(f => ({ ...f, name: e.target.value }))}
                                    autoFocus
                                />
                            </div>
                            <div>
                                <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1 block">Short Name</label>
                                <Input
                                    placeholder="e.g. Engineering"
                                    value={newFaculty.short_name}
                                    onChange={e => setNewFaculty(f => ({ ...f, short_name: e.target.value }))}
                                />
                            </div>
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1 block">Description</label>
                            <Input
                                placeholder="Optional description"
                                value={newFaculty.description}
                                onChange={e => setNewFaculty(f => ({ ...f, description: e.target.value }))}
                            />
                        </div>
                        <div className="flex gap-2 pt-1">
                            <Button size="sm" onClick={handleCreate} disabled={saving || !newFaculty.name.trim()} className="gap-1 bg-teal-600 hover:bg-teal-500 text-white">
                                {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Save
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => { setAddingNew(false); setNewFaculty({ name: "", short_name: "", description: "" }); }}>
                                <X className="w-3 h-3 mr-1" /> Cancel
                            </Button>
                        </div>
                    </div>
                )}

                {/* Faculty list */}
                {loading ? (
                    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-slate-50 dark:bg-slate-950">
                        {Array.from({ length: 5 }).map((_, i) => (
                            <div key={i} className="px-6 py-4 flex items-center gap-4 border-b border-slate-100 dark:border-slate-800 last:border-0">
                                <Skeleton className="w-9 h-9 rounded-xl shrink-0" />
                                <Skeleton className="h-4 flex-1" />
                                <Skeleton className="w-20 h-5 rounded-full" />
                                <Skeleton className="w-16 h-4" />
                                <Skeleton className="w-16 h-8 rounded-lg" />
                            </div>
                        ))}
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="text-center py-20 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
                        <GraduationCap className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
                        <p className="text-slate-500 dark:text-slate-400 font-medium">
                            {faculties.length === 0 ? "No faculties yet. Add your first one." : "No faculties match your search."}
                        </p>
                    </div>
                ) : (
                    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-slate-50 dark:bg-slate-950">
                        {/* Header */}
                        <div className="hidden lg:flex items-center gap-4 px-6 py-3 bg-slate-50 dark:bg-slate-950 text-[10px] font-semibold uppercase tracking-widest text-slate-400 border-b border-slate-200 dark:border-slate-800">
                            <span className="w-9 shrink-0" />
                            <span className="flex-1">Faculty</span>
                            <span className="w-28 shrink-0 text-right">Respondents</span>
                            <span className="w-24 shrink-0" />
                        </div>

                        <div className="p-2 space-y-1">
                            {filtered.map((faculty) => (
                                <div key={faculty.id} className="rounded-xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800/60 overflow-hidden">
                                    {editingId === faculty.id ? (
                                        <div className="p-4 space-y-3">
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                <div>
                                                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1 block">Name *</label>
                                                    <Input value={editState.name} onChange={e => setEditState(s => ({ ...s, name: e.target.value }))} autoFocus />
                                                </div>
                                                <div>
                                                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1 block">Short Name</label>
                                                    <Input value={editState.short_name} onChange={e => setEditState(s => ({ ...s, short_name: e.target.value }))} />
                                                </div>
                                            </div>
                                            <div>
                                                <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1 block">Description</label>
                                                <Input value={editState.description} onChange={e => setEditState(s => ({ ...s, description: e.target.value }))} />
                                            </div>
                                            <div className="flex gap-2 pt-1">
                                                <Button size="sm" onClick={() => handleUpdate(faculty.id)} disabled={saving || !editState.name.trim()} className="gap-1 bg-teal-600 hover:bg-teal-500 text-white">
                                                    {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Save
                                                </Button>
                                                <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                                                    <X className="w-3 h-3 mr-1" /> Cancel
                                                </Button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-4 px-5 py-3.5">
                                            <div className="p-2 bg-teal-50 dark:bg-teal-950/40 rounded-xl shrink-0">
                                                <GraduationCap className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className="font-semibold text-slate-900 dark:text-slate-100 text-sm">{faculty.name}</span>
                                                    {faculty.short_name && (
                                                        <Badge variant="secondary" className="text-[10px] font-medium">{faculty.short_name}</Badge>
                                                    )}
                                                </div>
                                                {faculty.description && (
                                                    <p className="text-xs text-slate-400 mt-0.5 truncate">{faculty.description}</p>
                                                )}
                                            </div>
                                            <div className="hidden lg:flex items-center gap-1.5 w-28 justify-end shrink-0">
                                                <Users className="w-3.5 h-3.5 text-slate-400" />
                                                <span className="text-xs text-slate-400 tabular-nums">{(faculty.respondent_count ?? 0).toLocaleString()}</span>
                                            </div>
                                            <div className="flex items-center gap-1 shrink-0">
                                                <Button size="sm" variant="ghost" onClick={() => startEdit(faculty)} className="text-slate-400 hover:text-teal-600 dark:hover:text-teal-400 h-8 w-8 p-0">
                                                    <Pencil className="w-3.5 h-3.5" />
                                                </Button>
                                                {deleteConfirm === faculty.id ? (
                                                    <div className="flex items-center gap-1">
                                                        <span className="text-xs text-red-500 mr-1">Delete?</span>
                                                        <Button size="sm" variant="ghost" onClick={() => handleDelete(faculty.id)} disabled={saving} className="text-red-500 hover:text-red-600 h-8 w-8 p-0">
                                                            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                                                        </Button>
                                                        <Button size="sm" variant="ghost" onClick={() => setDeleteConfirm(null)} className="h-8 w-8 p-0">
                                                            <X className="w-3 h-3" />
                                                        </Button>
                                                    </div>
                                                ) : (
                                                    <Button size="sm" variant="ghost" onClick={() => setDeleteConfirm(faculty.id)} className="text-slate-400 hover:text-red-500 h-8 w-8 p-0">
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </Button>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </PageShell>
    );
}
