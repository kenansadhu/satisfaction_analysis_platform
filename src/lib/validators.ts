import { z } from "zod";

export const analyzeBatchSchema = z.object({
    comments: z.array(z.any()), // Can be strings or objects, depending on usage
    context: z.object({
        name: z.string(),
        description: z.string().optional(),
    }),
    taxonomy: z.object({
        categories: z.array(z.object({
            id: z.number().optional(),
            name: z.string(),
            description: z.string().optional(),
        })),
        subcategories: z.array(z.object({
            id: z.number().optional(),
            category_id: z.number().optional(),
            name: z.string(),
            description: z.string().optional(),
        })).optional().default([]),
    }),
});

export const discoverCategoriesSchema = z.object({
    comments: z.array(z.string()),
    currentCategories: z.array(z.any()).optional().default([]),
    instructions: z.array(z.string()).optional().default([]),
    unitName: z.string(),
});

export const generateDashboardSchema = z.object({
    unitId: z.union([z.string(), z.number()]),
    surveyId: z.union([z.string(), z.number()]).optional(),
});

export const generateReportSchema = z.object({
    unitName: z.string(),
    unitDescription: z.string().optional(),
    stats: z.any(), // Flexible
    segments: z.array(z.any()),
    categoryBreakdown: z.array(z.any()).optional(),
});

export const mapColumnsSchema = z.object({
    headers: z.array(z.string()),
    samples: z.record(z.string(), z.array(z.string())),
    units: z.array(z.object({
        id: z.number(),
        name: z.string(),
    })),
});

export const mapIdentitySchema = z.object({
    headers: z.array(z.string()),
});

export const runAnalysisSchema = z.object({
    comments: z.array(z.object({
        id: z.number(),
        raw_text: z.string(),
    })),
    taxonomy: z.array(z.object({
        name: z.string(),
        description: z.string().optional(),
    })),
    allUnits: z.array(z.object({
        name: z.string(),
    })),
    unitContext: z.object({
        name: z.string(),
        instructions: z.array(z.string()),
    }),
});

export const suggestTaxonomySchema = z.object({
    unitName: z.string(),
    unitDesc: z.string().optional(),
    sampleComments: z.array(z.string()),
    existingCategories: z.any().optional(),
    mode: z.enum(["CATEGORIES", "SUBCATEGORIES"]).optional(),
    additionalContext: z.string().optional(),
});
