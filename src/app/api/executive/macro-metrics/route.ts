import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const surveyId = searchParams.get("surveyId");

        // 1. Fetch all units
        const { data: unitsData, error: unitsError } = await supabase
            .from('organization_units')
            .select('id, name, short_name, description');

        if (unitsError || !unitsData) throw new Error("Failed to load units.");

        const globalDataset: any[] = [];

        // 2. Gather macro-level metrics per unit using the RPC function
        for (const unit of unitsData) {
            const { data: metrics } = await supabase.rpc('get_dashboard_metrics', {
                p_unit_id: unit.id,
                p_survey_id: surveyId ? parseInt(surveyId, 10) : null
            });

            if (metrics && (metrics as any).total_segments > 0) {
                const categories = (metrics as any).category_counts || [];
                const flatCategories: any = {};

                if (Array.isArray(categories)) {
                    categories.forEach(c => {
                        const name = c.category_name;
                        if (name) {
                            const cleanKey = `category_${name.replace(/[^a-zA-Z0-9]/g, '_')}`;
                            flatCategories[cleanKey] = c.total || 0;
                            flatCategories[`${cleanKey}_pos`] = c.positive_count || 0;
                            flatCategories[`${cleanKey}_neg`] = c.negative_count || 0;
                        }
                    });
                }

                globalDataset.push({
                    unit_id: unit.id,
                    unit_name: unit.name,
                    unit_short_name: unit.short_name,
                    unit_description: unit.description || "No specific context provided.",
                    ...metrics,
                    ...flatCategories
                });
            }
        }

        if (globalDataset.length === 0) {
            return NextResponse.json({ data: [] });
        }

        return NextResponse.json({ data: globalDataset });

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
