"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Plus, Pencil, Trash2, Search, Building2, Save, Loader2, AlertTriangle } from "lucide-react";
import Link from "next/link";

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

    // Dialog State
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [editingUnit, setEditingUnit] = useState<Unit | null>(null);

    // Form State
    const [formData, setFormData] = useState({ name: "", description: "", analysis_context: "" });

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
        if (!formData.name) return alert("Name is required");
        setIsSaving(true);
        try {
            if (editingUnit) {
                // Update
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
                // Create
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
        } catch (e: any) {
            alert("Error saving unit: " + e.message);
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async (id: number) => {
        if (!confirm("Are you sure? This might fail if there is survey data linked to this unit.")) return;
        try {
            const { error } = await supabase.from('organization_units').delete().eq('id', id);
            if (error) throw error;
            fetchUnits();
        } catch (e: any) {
            alert("Could not delete. It likely has associated data. (Error: " + e.message + ")");
        }
    };

    // Filter units
    const filteredUnits = units.filter(u => u.name.toLowerCase().includes(searchTerm.toLowerCase()));

    return (
        <div className="min-h-screen bg-slate-50 p-8 font-sans">
            <div className="max-w-6xl mx-auto space-y-8">

                {/* Header */}
                <div className="flex justify-between items-center">
                    <div className="flex items-center gap-4">
                        <Link href="/"><Button variant="ghost" size="icon"><ArrowLeft className="w-5 h-5" /></Button></Link>
                        <div>
                            <h1 className="text-3xl font-bold text-slate-900">Organization Units</h1>
                            <p className="text-slate-500">Manage departments and their AI analysis rules.</p>
                        </div>
                    </div>
                    <Button onClick={handleOpenAdd} className="bg-blue-600 hover:bg-blue-700 gap-2 shadow-sm">
                        <Plus className="w-4 h-4" /> Add Unit
                    </Button>
                </div>

                {/* Content */}
                <Card>
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
                        <Badge variant="outline" className="text-slate-500">{units.length} Units Found</Badge>
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
                                    <TableRow><TableCell colSpan={4} className="text-center py-10 text-slate-500">Loading units...</TableCell></TableRow>
                                ) : filteredUnits.length === 0 ? (
                                    <TableRow><TableCell colSpan={4} className="text-center py-10 text-slate-500">No units found.</TableCell></TableRow>
                                ) : (
                                    filteredUnits.map((unit) => (
                                        <TableRow key={unit.id} className="group">
                                            <TableCell className="font-semibold text-slate-800 flex items-center gap-2">
                                                <div className="p-2 bg-slate-100 rounded-md"><Building2 className="w-4 h-4 text-slate-500" /></div>
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
                                                    <Button variant="ghost" size="icon" onClick={() => handleDelete(unit.id)}><Trash2 className="w-4 h-4 text-red-400 hover:text-red-600" /></Button>
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

            </div>
        </div>
    );
}