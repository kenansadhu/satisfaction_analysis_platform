"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth, canAccessAdminPages } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { PageShell, PageHeader } from "@/components/layout/PageShell";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import {
    Building2, Plus, Pencil, Trash2, Check, X, Loader2, Layers, Search, AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { OrganizationUnit } from "@/types";

export default function UnitsPage() {
    const { role, loading: authLoading, profileLoading } = useAuth();
    const router = useRouter();

    const [units, setUnits] = useState<OrganizationUnit[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [addingNew, setAddingNew] = useState(false);
    const [newName, setNewName] = useState("");
    const [newShortName, setNewShortName] = useState("");
    const [creating, setCreating] = useState(false);

    const [editingUnit, setEditingUnit] = useState<OrganizationUnit | null>(null);
    const [editDescription, setEditDescription] = useState("");
    const [editShortName, setEditShortName] = useState("");
    const [editSubgroups, setEditSubgroups] = useState<string[]>([]);
    const [newSubgroupName, setNewSubgroupName] = useState("");
    const [saving, setSaving] = useState(false);

    const [unitToDelete, setUnitToDelete] = useState<OrganizationUnit | null>(null);
    const [deleting, setDeleting] = useState(false);

    useEffect(() => {
        if (!authLoading && !profileLoading && !canAccessAdminPages(role)) {
            router.replace("/");
        }
    }, [authLoading, profileLoading, role, router]);

    useEffect(() => {
        loadUnits();
    }, []);

    async function loadUnits() {
        setLoading(true);
        const { data } = await supabase
            .from("organization_units")
            .select("*")
            .order("name");
        if (data) setUnits(data);
        setLoading(false);
    }

    async function handleCreate() {
        if (!newName.trim()) return;
        setCreating(true);
        const { data, error } = await supabase
            .from("organization_units")
            .insert({ name: newName.trim(), short_name: newShortName.trim() || null })
            .select()
            .single();
        if (error) {
            toast.error("Failed to create unit: " + error.message);
        } else {
            toast.success("Unit created");
            setAddingNew(false);
            setNewName("");
            setNewShortName("");
            if (data) setUnits(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
        }
        setCreating(false);
    }

    function openEdit(unit: OrganizationUnit) {
        setEditingUnit(unit);
        setEditDescription(unit.description || "");
        setEditShortName(unit.short_name || "");
        setEditSubgroups(unit.score_subgroups || []);
        setNewSubgroupName("");
    }

    function handleAddSubgroup() {
        const name = newSubgroupName.trim();
        if (!name) return;
        if (editSubgroups.some(s => s.toLowerCase() === name.toLowerCase())) {
            toast.error(`Subgroup "${name}" already exists.`);
            return;
        }
        setEditSubgroups(prev => [...prev, name]);
        setNewSubgroupName("");
    }

    async function handleSaveEdit() {
        if (!editingUnit) return;
        setSaving(true);
        const cleaned: string[] = [];
        const seen = new Set<string>();
        for (const raw of editSubgroups) {
            const name = raw.trim();
            if (!name) continue;
            const key = name.toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            cleaned.push(name);
        }
        const { error } = await supabase
            .from("organization_units")
            .update({ description: editDescription, short_name: editShortName, score_subgroups: cleaned })
            .eq("id", editingUnit.id);
        if (error) {
            toast.error("Failed to save: " + error.message);
        } else {
            toast.success("Unit updated");
            setUnits(prev => prev.map(u =>
                u.id === editingUnit.id
                    ? { ...u, description: editDescription, short_name: editShortName, score_subgroups: cleaned }
                    : u
            ));
            setEditingUnit(null);
        }
        setSaving(false);
    }

    async function handleDelete() {
        if (!unitToDelete) return;
        setDeleting(true);
        const { error } = await supabase.from("organization_units").delete().eq("id", unitToDelete.id);
        if (error) {
            toast.error("Failed to delete: " + error.message);
        } else {
            toast.success(`${unitToDelete.name} deleted`);
            setUnits(prev => prev.filter(u => u.id !== unitToDelete.id));
            if (editingUnit?.id === unitToDelete.id) setEditingUnit(null);
            setUnitToDelete(null);
        }
        setDeleting(false);
    }

    if (authLoading || profileLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
            </div>
        );
    }

    if (!canAccessAdminPages(role)) return null;

    const filtered = units.filter(u =>
        u.name.toLowerCase().includes(search.toLowerCase()) ||
        (u.short_name || "").toLowerCase().includes(search.toLowerCase())
    );

    return (
        <PageShell>
            <PageHeader
                title={<span className="flex items-center gap-2"><Building2 className="w-6 h-6 text-blue-500" /> Organization Units</span>}
                description="Manage academic and administrative units, their analysis context, and score subgroups."
            />

            <div className="max-w-5xl mx-auto px-8 py-8 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">

                {/* Hero stats */}
                {!loading && (
                    <div className="relative rounded-2xl overflow-hidden bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 border border-blue-900/50 shadow-xl">
                        <div className="absolute -top-16 -right-16 w-56 h-56 rounded-full bg-blue-500/15 blur-3xl pointer-events-none" />
                        <div className="absolute -bottom-12 -left-12 w-48 h-48 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none" />
                        <div className="relative flex items-center gap-10 px-8 py-6">
                            <div className="text-center shrink-0">
                                <div className="text-5xl font-black text-white tabular-nums leading-none">{units.length}</div>
                                <div className="text-xs font-semibold uppercase tracking-widest text-blue-300/60 mt-1">Total Units</div>
                            </div>
                            <div className="w-px h-12 bg-white/10 shrink-0" />
                            <div className="text-center shrink-0">
                                <div className="text-3xl font-black text-blue-300 tabular-nums leading-none">
                                    {units.filter(u => u.description).length}
                                </div>
                                <div className="text-xs font-semibold uppercase tracking-widest text-blue-300/60 mt-1">With AI Context</div>
                            </div>
                            <div className="w-px h-12 bg-white/10 shrink-0" />
                            <div className="text-center shrink-0">
                                <div className="text-3xl font-black text-indigo-300 tabular-nums leading-none">
                                    {units.filter(u => (u.score_subgroups?.length ?? 0) > 0).length}
                                </div>
                                <div className="text-xs font-semibold uppercase tracking-widest text-blue-300/60 mt-1">With Subgroups</div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Toolbar */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 justify-between">
                    <div className="relative w-full max-w-xs">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <Input
                            placeholder="Search units..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="pl-9"
                        />
                    </div>
                    {!addingNew && (
                        <Button
                            onClick={() => setAddingNew(true)}
                            className="gap-2 bg-blue-600 hover:bg-blue-500 text-white shrink-0"
                        >
                            <Plus className="w-4 h-4" /> New Unit
                        </Button>
                    )}
                </div>

                {/* Inline add form */}
                {addingNew && (
                    <div className="bg-white dark:bg-slate-900 border border-blue-200 dark:border-blue-800/60 rounded-2xl p-5 shadow-sm space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
                        <div className="flex items-center gap-2 mb-1">
                            <div className="p-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/40">
                                <Building2 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                            </div>
                            <h3 className="text-sm font-semibold text-blue-700 dark:text-blue-300">New Unit</h3>
                            <span className="text-xs text-slate-400 ml-1">— add context and subgroups after creating</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                                <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1 block">Name *</label>
                                <Input
                                    placeholder="e.g. Faculty of Computer Science"
                                    value={newName}
                                    onChange={e => setNewName(e.target.value)}
                                    autoFocus
                                    onKeyDown={e => { if (e.key === "Enter") handleCreate(); }}
                                />
                            </div>
                            <div>
                                <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1 block">Short Name</label>
                                <Input
                                    placeholder="e.g. FIT"
                                    value={newShortName}
                                    onChange={e => setNewShortName(e.target.value)}
                                    onKeyDown={e => { if (e.key === "Enter") handleCreate(); }}
                                />
                            </div>
                        </div>
                        <div className="flex gap-2 pt-1">
                            <Button size="sm" onClick={handleCreate} disabled={creating || !newName.trim()} className="gap-1 bg-blue-600 hover:bg-blue-500 text-white">
                                {creating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Save
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => { setAddingNew(false); setNewName(""); setNewShortName(""); }}>
                                <X className="w-3 h-3 mr-1" /> Cancel
                            </Button>
                        </div>
                    </div>
                )}

                {/* Unit list */}
                {loading ? (
                    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-slate-50 dark:bg-slate-950">
                        {Array.from({ length: 5 }).map((_, i) => (
                            <div key={i} className="px-6 py-4 flex items-center gap-4 border-b border-slate-100 dark:border-slate-800 last:border-0">
                                <Skeleton className="w-9 h-9 rounded-xl shrink-0" />
                                <Skeleton className="h-4 flex-1" />
                                <Skeleton className="w-20 h-5 rounded-full" />
                                <Skeleton className="w-24 h-4" />
                                <Skeleton className="w-16 h-8 rounded-lg" />
                            </div>
                        ))}
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="text-center py-20 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
                        <Building2 className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
                        <p className="text-slate-500 dark:text-slate-400 font-medium">
                            {units.length === 0 ? "No units yet. Add your first one." : "No units match your search."}
                        </p>
                    </div>
                ) : (
                    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-slate-50 dark:bg-slate-950">
                        {/* Header */}
                        <div className="hidden lg:flex items-center gap-4 px-6 py-3 bg-slate-50 dark:bg-slate-950 text-[10px] font-semibold uppercase tracking-widest text-slate-400 border-b border-slate-200 dark:border-slate-800">
                            <span className="w-9 shrink-0" />
                            <span className="flex-1">Unit</span>
                            <span className="w-28 shrink-0 text-right">Subgroups</span>
                            <span className="w-20 shrink-0" />
                        </div>

                        <div className="p-2 space-y-1">
                            {filtered.map(unit => (
                                <div key={unit.id} className="flex items-center gap-4 px-5 py-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800/60">
                                    <div className="p-2 bg-blue-50 dark:bg-blue-950/40 rounded-xl shrink-0">
                                        <Building2 className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="font-semibold text-slate-900 dark:text-slate-100 text-sm">{unit.name}</span>
                                            {unit.short_name && (
                                                <Badge variant="secondary" className="text-[10px] font-medium">{unit.short_name}</Badge>
                                            )}
                                        </div>
                                        {unit.description && (
                                            <p className="text-xs text-slate-400 mt-0.5 truncate">{unit.description}</p>
                                        )}
                                    </div>
                                    <div className="hidden lg:flex items-center gap-1.5 w-28 justify-end shrink-0">
                                        {(unit.score_subgroups?.length ?? 0) > 0 ? (
                                            <span className="flex items-center gap-1 text-xs text-indigo-500 dark:text-indigo-400 font-medium">
                                                <Layers className="w-3.5 h-3.5" />
                                                {unit.score_subgroups!.length}
                                            </span>
                                        ) : (
                                            <span className="text-xs text-slate-300 dark:text-slate-600">—</span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => openEdit(unit)}
                                            className="text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 h-8 w-8 p-0"
                                        >
                                            <Pencil className="w-3.5 h-3.5" />
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => setUnitToDelete(unit)}
                                            className="text-slate-400 hover:text-red-500 h-8 w-8 p-0"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Edit Details Dialog */}
            <Dialog open={!!editingUnit} onOpenChange={(open) => !open && setEditingUnit(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Edit Unit Details</DialogTitle>
                        <DialogDescription>
                            Configure the short name for executive charts, AI analysis context, and optional score subgroups.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Short Name</label>
                            <Input
                                placeholder="e.g. IT, HR, Mktg"
                                value={editShortName}
                                onChange={e => setEditShortName(e.target.value)}
                            />
                            <p className="text-xs text-slate-500">Used as the label in Executive Dashboard charts to save space.</p>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Analysis Context</label>
                            <Textarea
                                placeholder="e.g. Manages M-Flex, online platforms..."
                                value={editDescription}
                                onChange={e => setEditDescription(e.target.value)}
                                className="min-h-[100px] resize-none"
                            />
                            <p className="text-xs text-slate-500">The AI uses this to accurately route feedback.</p>
                        </div>

                        <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                            <label className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                                <Layers className="w-4 h-4 text-slate-500" />
                                Score Subgroups
                            </label>
                            <p className="text-xs text-slate-500">
                                Define named subgroups when this unit&apos;s SSI should be a roll-up of sub-averages rather than a flat per-question average. Example: IT Department uses <strong>Mobile App</strong> and <strong>Wifi</strong> — final SSI = avg(mobile_app_avg, wifi_avg). Assign columns to subgroups in the survey&apos;s Column Mapping page.
                            </p>
                            {editSubgroups.length > 0 && (
                                <div className="flex flex-wrap gap-2 pt-1">
                                    {editSubgroups.map((name, idx) => (
                                        <Badge
                                            key={`${name}-${idx}`}
                                            variant="secondary"
                                            className="pl-2.5 pr-1 py-1 gap-1 bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition-colors dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800"
                                        >
                                            <span className="text-xs">{name}</span>
                                            <button
                                                type="button"
                                                onClick={() => setEditSubgroups(prev => prev.filter((_, i) => i !== idx))}
                                                className="hover:bg-blue-200 dark:hover:bg-blue-800 rounded p-0.5"
                                                aria-label={`Remove ${name}`}
                                            >
                                                <X className="w-3 h-3" />
                                            </button>
                                        </Badge>
                                    ))}
                                </div>
                            )}
                            <div className="flex gap-2 pt-1">
                                <Input
                                    placeholder="e.g. Mobile App"
                                    value={newSubgroupName}
                                    onChange={e => setNewSubgroupName(e.target.value)}
                                    onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleAddSubgroup(); } }}
                                    className="h-9 text-sm"
                                />
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={handleAddSubgroup}
                                    disabled={!newSubgroupName.trim()}
                                    className="shrink-0 h-9"
                                >
                                    <Plus className="w-3.5 h-3.5 mr-1" /> Add
                                </Button>
                            </div>
                        </div>
                    </div>
                    <DialogFooter className="flex items-center sm:justify-between w-full mt-4">
                        <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 mr-auto"
                            onClick={() => setUnitToDelete(editingUnit)}
                        >
                            <Trash2 className="w-4 h-4 mr-2" /> Delete Unit
                        </Button>
                        <div className="flex gap-2">
                            <Button variant="outline" onClick={() => setEditingUnit(null)} disabled={saving}>
                                Cancel
                            </Button>
                            <Button onClick={handleSaveEdit} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white">
                                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
                                {saving ? "Saving…" : "Save"}
                            </Button>
                        </div>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation */}
            <ConfirmDialog
                open={!!unitToDelete}
                onOpenChange={(open) => !open && setUnitToDelete(null)}
                title="Permanently delete this unit?"
                description={
                    <span className="flex flex-col gap-2 mt-2">
                        <span>Are you sure you want to delete <strong>{unitToDelete?.name}</strong>?</span>
                        <span className="flex items-start gap-2 text-red-600 bg-red-50 dark:bg-red-950/30 p-3 rounded-md border border-red-100 dark:border-red-900">
                            <AlertTriangle className="w-5 h-5 shrink-0" />
                            <span><strong>Warning:</strong> This will cascade and permanently destroy all analysis feedback, comments, categories, and analytics saved for this unit. This action cannot be undone.</span>
                        </span>
                    </span>
                }
                confirmLabel={deleting ? "Deleting…" : "Delete Unit Forever"}
                onConfirm={handleDelete}
                variant="destructive"
            />
        </PageShell>
    );
}
