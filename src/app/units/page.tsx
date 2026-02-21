"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/layout/PageShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import Link from "next/link";
import { ArrowRight, Building2, Search, School, Edit2, Plus, Trash2, AlertTriangle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { OrganizationUnit } from "@/types";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

export default function UnitsPage() {
    const [units, setUnits] = useState<OrganizationUnit[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [editingUnit, setEditingUnit] = useState<OrganizationUnit | null>(null);
    const [editDescription, setEditDescription] = useState("");
    const [editShortName, setEditShortName] = useState("");
    const [saving, setSaving] = useState(false);

    // Create & Delete State
    const [showCreateDialog, setShowCreateDialog] = useState(false);
    const [newUnitName, setNewUnitName] = useState("");
    const [newUnitShortName, setNewUnitShortName] = useState("");
    const [creating, setCreating] = useState(false);

    const [unitToDelete, setUnitToDelete] = useState<OrganizationUnit | null>(null);
    const [deleting, setDeleting] = useState(false);

    useEffect(() => {
        const fetchUnits = async () => {
            const { data } = await supabase
                .from('organization_units')
                .select('*')
                .order('name');

            if (data) setUnits(data);
            setLoading(false);
        };
        fetchUnits();
    }, []);

    const filteredUnits = units.filter(u =>
        u.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const getStatusColor = (status: string | undefined) => {
        switch (status) {
            case "COMPLETED": return "bg-green-100 text-green-700 border-green-200";
            case "ANALYZING": return "bg-blue-100 text-blue-700 border-blue-200";
            default: return "bg-slate-100 text-slate-700 border-slate-200";
        }
    };

    const handleSaveDescription = async () => {
        if (!editingUnit) return;
        setSaving(true);
        try {
            const { error } = await supabase
                .from('organization_units')
                .update({
                    description: editDescription,
                    short_name: editShortName
                })
                .eq('id', editingUnit.id);

            if (error) throw error;

            setUnits(units.map(u => u.id === editingUnit.id ? { ...u, description: editDescription, short_name: editShortName } : u));
            toast.success("Unit details updated!");
            setEditingUnit(null);
        } catch (error: any) {
            toast.error("Failed to update description: " + error.message);
        } finally {
            setSaving(false);
        }
    };

    const handleCreateUnit = async () => {
        if (!newUnitName.trim()) {
            toast.error("Unit Name is required.");
            return;
        }
        setCreating(true);
        try {
            const { data, error } = await supabase
                .from('organization_units')
                .insert({
                    name: newUnitName.trim(),
                    short_name: newUnitShortName.trim() || null
                })
                .select()
                .single();

            if (error) throw error;
            if (data) {
                setUnits([...units, data].sort((a, b) => a.name.localeCompare(b.name)));
                toast.success("Organization Unit created successfully!");
                setShowCreateDialog(false);
                setNewUnitName("");
                setNewUnitShortName("");
            }
        } catch (error: any) {
            toast.error("Failed to create unit: " + error.message);
        } finally {
            setCreating(false);
        }
    };

    const handleDeleteUnit = async () => {
        if (!unitToDelete) return;
        setDeleting(true);
        try {
            const { error } = await supabase
                .from('organization_units')
                .delete()
                .eq('id', unitToDelete.id);

            if (error) throw error;

            setUnits(units.filter(u => u.id !== unitToDelete.id));
            toast.success(`${unitToDelete.name} has been permanently deleted.`);
            setUnitToDelete(null);

            // If the user deleted the unit they were currently editing, close the edit modal
            if (editingUnit?.id === unitToDelete.id) {
                setEditingUnit(null);
            }
        } catch (error: any) {
            toast.error("Failed to delete unit: " + error.message);
        } finally {
            setDeleting(false);
        }
    };

    return (
        <div className="min-h-full bg-slate-50 pb-20">
            <PageHeader
                title="Organization Units"
                description="Manage and view all registered academic and administrative units."
            />

            <div className="max-w-6xl mx-auto px-8 py-8">
                {/* Search & Toolbar */}
                <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between mb-8">
                    <div className="relative w-full max-w-md">
                        <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                        <Input
                            placeholder="Search units..."
                            className="pl-9 bg-white"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                    <Button onClick={() => setShowCreateDialog(true)} className="bg-blue-600 hover:bg-blue-700 w-full sm:w-auto shadow-sm">
                        <Plus className="w-4 h-4 mr-2" />
                        New Unit
                    </Button>
                </div>

                {/* Grid */}
                {loading ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {[1, 2, 3, 4, 5, 6].map(i => (
                            <Skeleton key={i} className="h-40 w-full rounded-xl" />
                        ))}
                    </div>
                ) : filteredUnits.length === 0 ? (
                    <EmptyState
                        title="No units found"
                        description={searchQuery ? `No units match "${searchQuery}"` : "No organization units have been created yet."}
                        icon={School}
                    />
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {filteredUnits.map(unit => (
                            <div key={unit.id} className="group relative block h-full">
                                <Card className="h-full hover:shadow-md transition-all duration-200 border-slate-200 hover:border-blue-300 flex flex-col">
                                    <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
                                        <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                                            <Building2 className="w-5 h-5" />
                                        </div>
                                        <Badge variant="outline" className={getStatusColor(unit.analysis_status)}>
                                            {(unit.analysis_status || "NOT_STARTED").replace(/_/g, " ")}
                                        </Badge>
                                    </CardHeader>
                                    <CardContent className="flex flex-col flex-grow">
                                        <CardTitle className="text-lg mb-1 group-hover:text-blue-700 transition-colors line-clamp-1 flex items-center gap-2">
                                            {unit.name}
                                            {unit.short_name && (
                                                <Badge variant="secondary" className="text-xs font-normal">
                                                    {unit.short_name}
                                                </Badge>
                                            )}
                                        </CardTitle>
                                        <p className="text-sm text-slate-500 mb-4 line-clamp-2 flex-grow">
                                            {unit.description || "No context provided. AI will rely only on the unit name."}
                                        </p>
                                        <div className="flex items-center justify-end mt-auto pt-4 border-t border-slate-100">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-8 px-2 text-slate-400 hover:text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity"
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    setEditingUnit(unit);
                                                    setEditDescription(unit.description || "");
                                                    setEditShortName(unit.short_name || "");
                                                }}
                                            >
                                                <Edit2 className="w-4 h-4 mr-1" />
                                                Edit Context
                                            </Button>
                                        </div>
                                    </CardContent>
                                </Card>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Edit Details Dialog */}
            <Dialog open={!!editingUnit} onOpenChange={(open) => !open && setEditingUnit(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Edit Unit Details</DialogTitle>
                        <DialogDescription>
                            Configure the short name for executive charts and descriptive context for the AI pipeline.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-700">Short Name</label>
                            <Input
                                placeholder="e.g. IT, HR, Mktg"
                                value={editShortName}
                                onChange={(e) => setEditShortName(e.target.value)}
                            />
                            <p className="text-xs text-slate-500">Used as the label in Executive Dashboard charts to save space.</p>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-700">Analysis Context (Optional)</label>
                            <Textarea
                                placeholder="e.g. Manages M-Flex, online platforms..."
                                value={editDescription}
                                onChange={(e) => setEditDescription(e.target.value)}
                                className="min-h-[100px] resize-none"
                            />
                            <p className="text-xs text-slate-500">The AI uses this to accurate route feedback.</p>
                        </div>
                    </div>
                    <DialogFooter className="flex items-center sm:justify-between w-full mt-4">
                        <Button
                            variant="destructive"
                            size="sm"
                            className="bg-red-50 text-red-600 hover:bg-red-100 border-none justify-self-start mr-auto"
                            onClick={() => setUnitToDelete(editingUnit)}
                        >
                            <Trash2 className="w-4 h-4 mr-2" /> Delete Unit
                        </Button>
                        <div className="flex gap-2">
                            <Button variant="outline" onClick={() => setEditingUnit(null)} disabled={saving}>
                                Cancel
                            </Button>
                            <Button onClick={handleSaveDescription} disabled={saving} className="bg-blue-600 hover:bg-blue-700">
                                {saving ? "Saving..." : "Save Context"}
                            </Button>
                        </div>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Create Unit Dialog */}
            <Dialog open={showCreateDialog} onOpenChange={(open) => !open && setShowCreateDialog(false)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Add New Organization Unit</DialogTitle>
                        <DialogDescription>
                            Create a new academic faculty, department, or administrative office.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-700">Unit Name <span className="text-red-500">*</span></label>
                            <Input
                                placeholder="e.g. Faculty of Computer Science"
                                value={newUnitName}
                                onChange={(e) => setNewUnitName(e.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-700">Short Name (Optional)</label>
                            <Input
                                placeholder="e.g. FIT"
                                value={newUnitShortName}
                                onChange={(e) => setNewUnitShortName(e.target.value)}
                            />
                            <p className="text-xs text-slate-500">Acronym for executive dashboards.</p>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowCreateDialog(false)} disabled={creating}>
                            Cancel
                        </Button>
                        <Button onClick={handleCreateUnit} disabled={creating} className="bg-blue-600 hover:bg-blue-700">
                            {creating ? "Creating..." : "Create Unit"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation Dialog */}
            <ConfirmDialog
                open={!!unitToDelete}
                onOpenChange={(open) => !open && setUnitToDelete(null)}
                title="Permanently delete this unit?"
                description={
                    <span className="flex flex-col gap-2 mt-2">
                        <span>Are you sure you want to delete <strong>{unitToDelete?.name}</strong>?</span>
                        <span className="flex items-start gap-2 text-red-600 bg-red-50 p-3 rounded-md border border-red-100">
                            <AlertTriangle className="w-5 h-5 shrink-0" />
                            <span><strong>Warning:</strong> This will cascade and permanently destroy all analysis feedback, comments, categories, and analytics saved for this unit. This action cannot be undone.</span>
                        </span>
                    </span>
                }
                confirmLabel={deleting ? "Deleting..." : "Delete Unit Forever"}
                onConfirm={handleDeleteUnit}
                variant="destructive"
            />
        </div>
    );
}