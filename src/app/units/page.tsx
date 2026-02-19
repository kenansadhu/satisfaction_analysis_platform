"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, Search, Building2, Loader2 } from "lucide-react";
import { PageShell, PageHeader } from "@/components/layout/PageShell";
import { ConfirmDialog } from "@/components/ConfirmDialog";

type Unit = {
    id: number;
    name: string;
    description: string;
    analysis_context: string | null;
    created_at?: string;
};

export default function ManageUnitsPage() {
    const [units, setUnits] = useState<Unit[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");

    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [editingUnit, setEditingUnit] = useState<Unit | null>(null);
    const [formData, setFormData] = useState({ name: "", description: "", analysis_context: "" });
    const [deleteTarget, setDeleteTarget] = useState<number | null>(null);

    useEffect(() => { fetchUnits(); }, []);

    async function fetchUnits() {
        setIsLoading(true);
        const { data } = await supabase.from('organization_units').select('*').order('name');
        if (data) setUnits(data);
        setIsLoading(false);
    }

    const handleOpenAdd = () => {
        setEditingUnit(null);
        setFormData({ name: "", description: "", analysis_context: "" });
        setIsDialogOpen(true);
    };

    const handleOpenEdit = (unit: Unit) => {
        setEditingUnit(unit);
        setFormData({
            name: unit.name,
            description: unit.description || "",
            analysis_context: unit.analysis_context || ""
        });
        setIsDialogOpen(true);
    };

    const handleSave = async () => {
        if (!formData.name) { toast.warning("Name is required"); return; }
        setIsSaving(true);
        try {
            if (editingUnit) {
                const { error } = await supabase
                    .from('organization_units')
                    .update({
                        name: formData.name,
                        description: formData.description,
                        analysis_context: formData.analysis_context
                    })
                    .eq('id', editingUnit.id);
                if (error) throw error;
            } else {
                const { error } = await supabase
                    .from('organization_units')
                    .insert({
                        name: formData.name,
                        description: formData.description,
                        analysis_context: formData.analysis_context
                    });
                if (error) throw error;
            }
            setIsDialogOpen(false);
            fetchUnits();
            toast.success(editingUnit ? "Unit updated!" : "Unit created!");
        } catch (e: any) {
            toast.error("Error saving unit: " + e.message);
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async (id: number) => {
        try {
            const { error } = await supabase.from('organization_units').delete().eq('id', id);
            if (error) throw error;
            fetchUnits();
            toast.success("Unit deleted");
        } catch (e: any) {
            toast.error("Could not delete. It likely has associated data. (Error: " + e.message + ")");
        }
        setDeleteTarget(null);
    };

    const filteredUnits = units.filter(u => u.name.toLowerCase().includes(searchTerm.toLowerCase()));

    return (
        <PageShell>
            <PageHeader
                title="Organization Units"
                description="Manage departments and their AI analysis rules."
                backHref="/"
                backLabel="Home"
                actions={
                    <Button onClick={handleOpenAdd} className="gap-2 bg-blue-600 hover:bg-blue-500 shadow-lg shadow-blue-600/25 border border-blue-500/50">
                        <Plus className="w-4 h-4" /> Add Unit
                    </Button>
                }
            />

            <div className="max-w-7xl mx-auto px-8 py-10">
                <Card className="overflow-hidden">
                    <div className="h-1 bg-gradient-to-r from-indigo-500 to-purple-500" />
                    <CardHeader className="flex flex-row items-center justify-between pb-4">
                        <div className="relative w-72">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                            <Input
                                placeholder="Search units..."
                                className="pl-9"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <Badge variant="outline" className="text-slate-500">{units.length} Units</Badge>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-[250px]">Unit Name</TableHead>
                                    <TableHead>Description</TableHead>
                                    <TableHead className="w-[200px]">AI Context Rules</TableHead>
                                    <TableHead className="text-right w-[100px]">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoading ? (
                                    [1, 2, 3].map(i => (
                                        <TableRow key={i}>
                                            <TableCell><div className="h-5 w-32 bg-slate-200 rounded animate-pulse" /></TableCell>
                                            <TableCell><div className="h-4 w-48 bg-slate-100 rounded animate-pulse" /></TableCell>
                                            <TableCell><div className="h-5 w-24 bg-slate-100 rounded-full animate-pulse" /></TableCell>
                                            <TableCell><div className="h-8 w-16 bg-slate-100 rounded animate-pulse ml-auto" /></TableCell>
                                        </TableRow>
                                    ))
                                ) : filteredUnits.length === 0 ? (
                                    <TableRow><TableCell colSpan={4} className="text-center py-10 text-slate-500">No units found.</TableCell></TableRow>
                                ) : (
                                    filteredUnits.map((unit) => (
                                        <TableRow key={unit.id} className="group">
                                            <TableCell className="font-semibold text-slate-800 flex items-center gap-2">
                                                <div className="p-2 bg-indigo-50 rounded-md group-hover:bg-indigo-100 transition-colors"><Building2 className="w-4 h-4 text-indigo-500" /></div>
                                                {unit.name}
                                            </TableCell>
                                            <TableCell className="text-slate-600 truncate max-w-xs" title={unit.description}>{unit.description || "-"}</TableCell>
                                            <TableCell>
                                                {unit.analysis_context ? (
                                                    <Badge variant="secondary" className="bg-purple-50 text-purple-700 border-purple-100">Custom Rules Set</Badge>
                                                ) : (
                                                    <span className="text-slate-400 text-xs italic">Default AI</span>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <Button variant="ghost" size="icon" onClick={() => handleOpenEdit(unit)}><Pencil className="w-4 h-4 text-blue-500" /></Button>
                                                    <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(unit.id)}><Trash2 className="w-4 h-4 text-red-400 hover:text-red-600" /></Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>

                {/* Add/Edit Dialog */}
                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                    <DialogContent className="max-w-lg">
                        <DialogHeader>
                            <DialogTitle>{editingUnit ? "Edit Unit" : "Create New Unit"}</DialogTitle>
                            <DialogDescription>Define the unit details and AI context.</DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Unit Name</label>
                                <Input value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="e.g. IT Department" />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Description</label>
                                <Textarea value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} placeholder="Briefly describe what this unit does..." />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium flex items-center gap-2">AI Context Instructions <Badge className="text-[10px] bg-purple-100 text-purple-700 hover:bg-purple-100">For AI Analysis</Badge></label>
                                <Textarea
                                    className="bg-purple-50/50 border-purple-200"
                                    rows={4}
                                    value={formData.analysis_context}
                                    onChange={e => setFormData({ ...formData, analysis_context: e.target.value })}
                                    placeholder="Tell the AI specific terms to watch for. E.g. 'M-Flex is our attendance system. Eduhub is the LMS.'"
                                />
                                <p className="text-xs text-slate-500">These instructions will be injected into the AI prompt whenever it analyzes comments for this unit.</p>
                            </div>
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                            <Button onClick={handleSave} disabled={isSaving} className="bg-blue-600 hover:bg-blue-700">
                                {isSaving && <Loader2 className="w-4 h-4 animate-spin mr-2" />} Save Changes
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
                <ConfirmDialog
                    open={deleteTarget !== null}
                    onOpenChange={(open) => !open && setDeleteTarget(null)}
                    title="Delete Unit?"
                    description="Are you sure? This might fail if there is survey data linked to this unit."
                    confirmLabel="Delete"
                    variant="destructive"
                    onConfirm={() => deleteTarget && handleDelete(deleteTarget)}
                />
            </div>
        </PageShell>
    );
}