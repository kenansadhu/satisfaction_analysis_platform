"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/layout/PageShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import Link from "next/link";
import { ArrowRight, Building2, Search, School } from "lucide-react";
import { Input } from "@/components/ui/input";
import { OrganizationUnit } from "@/types";

export default function UnitsPage() {
    const [units, setUnits] = useState<OrganizationUnit[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");

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

    return (
        <div className="min-h-full bg-slate-50 pb-20">
            <PageHeader
                title="Organization Units"
                description="Manage and view all registered academic and administrative units."
            />

            <div className="max-w-6xl mx-auto px-8 py-8">
                {/* Search & Toolbar */}
                <div className="flex items-center justify-between mb-8">
                    <div className="relative w-full max-w-md">
                        <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                        <Input
                            placeholder="Search units..."
                            className="pl-9 bg-white"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
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
                            <Link key={unit.id} href={`/analysis/unit/${unit.id}`} className="group">
                                <Card className="h-full hover:shadow-md transition-all duration-200 border-slate-200 hover:border-blue-300">
                                    <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
                                        <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                                            <Building2 className="w-5 h-5" />
                                        </div>
                                        <Badge variant="outline" className={getStatusColor(unit.analysis_status)}>
                                            {(unit.analysis_status || "NOT_STARTED").replace(/_/g, " ")}
                                        </Badge>
                                    </CardHeader>
                                    <CardContent>
                                        <CardTitle className="text-lg mb-2 group-hover:text-blue-700 transition-colors line-clamp-2">
                                            {unit.name}
                                        </CardTitle>
                                        <div className="text-xs text-slate-400 flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                                            View Analysis <ArrowRight className="w-3 h-3" />
                                        </div>
                                    </CardContent>
                                </Card>
                            </Link>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}