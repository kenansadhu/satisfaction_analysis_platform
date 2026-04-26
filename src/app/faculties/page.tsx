"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth, canAccessAdminPages } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
    GraduationCap, Plus, Pencil, Trash2, Check, X, Loader2, AlertCircle, Users
} from "lucide-react";
import { toast } from "sonner";

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
            // Enrich with respondent counts
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

    if (authLoading || profileLoading || loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
            </div>
        );
    }

    if (!canAccessAdminPages(role)) return null;

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
            {/* Header */}
            <div className="bg-gradient-to-br from-slate-900 via-teal-950 to-cyan-950 px-8 py-10">
                <div className="max-w-4xl mx-auto">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 rounded-xl bg-teal-500/20 border border-teal-500/30">
                            <GraduationCap className="w-6 h-6 text-teal-400" />
                        </div>
                        <h1 className="text-2xl font-bold text-white">Faculty Management</h1>
                    </div>
                    <p className="text-slate-400 ml-14">
                        Manage the list of faculties used across surveys and insights.
                    </p>
                </div>
            </div>

            <div className="max-w-4xl mx-auto px-8 py-8 space-y-6">
                {/* Add New */}
                {!addingNew ? (
                    <Button
                        onClick={() => setAddingNew(true)}
                        className="gap-2 bg-teal-600 hover:bg-teal-500 text-white"
                    >
                        <Plus className="w-4 h-4" /> Add Faculty
                    </Button>
                ) : (
                    <Card className="border-teal-500/30 bg-teal-500/5 dark:bg-teal-900/10">
                        <CardHeader>
                            <CardTitle className="text-base text-teal-700 dark:text-teal-300">New Faculty</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <div className="grid grid-cols-2 gap-3">
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
                        </CardContent>
                    </Card>
                )}

                {/* Faculty List */}
                {faculties.length === 0 ? (
                    <div className="text-center py-20 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                        <GraduationCap className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                        <p className="text-slate-500">No faculties yet. Add your first one above.</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {faculties.map((faculty) => (
                            <Card key={faculty.id} className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
                                <CardContent className="p-5">
                                    {editingId === faculty.id ? (
                                        <div className="space-y-3">
                                            <div className="grid grid-cols-2 gap-3">
                                                <div>
                                                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1 block">Name *</label>
                                                    <Input
                                                        value={editState.name}
                                                        onChange={e => setEditState(s => ({ ...s, name: e.target.value }))}
                                                        autoFocus
                                                    />
                                                </div>
                                                <div>
                                                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1 block">Short Name</label>
                                                    <Input
                                                        value={editState.short_name}
                                                        onChange={e => setEditState(s => ({ ...s, short_name: e.target.value }))}
                                                    />
                                                </div>
                                            </div>
                                            <div>
                                                <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1 block">Description</label>
                                                <Input
                                                    value={editState.description}
                                                    onChange={e => setEditState(s => ({ ...s, description: e.target.value }))}
                                                />
                                            </div>
                                            <div className="flex gap-2 pt-1">
                                                <Button size="sm" onClick={() => handleUpdate(faculty.id)} disabled={saving || !editState.name.trim()} className="gap-1 bg-blue-600 hover:bg-blue-500 text-white">
                                                    {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Save
                                                </Button>
                                                <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                                                    <X className="w-3 h-3 mr-1" /> Cancel
                                                </Button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className="font-semibold text-slate-900 dark:text-slate-100">{faculty.name}</span>
                                                    {faculty.short_name && (
                                                        <Badge variant="secondary" className="text-xs">{faculty.short_name}</Badge>
                                                    )}
                                                </div>
                                                {faculty.description && (
                                                    <p className="text-sm text-slate-500 mt-1">{faculty.description}</p>
                                                )}
                                                <div className="flex items-center gap-1 mt-2 text-xs text-slate-400">
                                                    <Users className="w-3.5 h-3.5" />
                                                    {faculty.respondent_count?.toLocaleString()} respondents linked
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-1 shrink-0">
                                                <Button size="sm" variant="ghost" onClick={() => startEdit(faculty)} className="text-slate-400 hover:text-blue-500 h-8 w-8 p-0">
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
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
