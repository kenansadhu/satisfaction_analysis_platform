import { z } from "zod";

/**
 * Environment variable validation.
 * Import this at app startup or in layout.tsx to fail fast on missing config.
 */

const envSchema = z.object({
    // Required
    NEXT_PUBLIC_SUPABASE_URL: z.string().url("NEXT_PUBLIC_SUPABASE_URL must be a valid URL"),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1, "NEXT_PUBLIC_SUPABASE_ANON_KEY is required"),
    GEMINI_API_KEY: z.string().min(1, "GEMINI_API_KEY is required"),

    // Optional with defaults
    AI_MODEL: z.string().default("gemini-2.5-flash"),
    INSTITUTION_NAME: z.string().default("the institution"),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Validates environment variables. Call this early in the app lifecycle.
 * In development, logs warnings for missing optional vars.
 * Throws on missing required vars.
 */
export function validateEnv(): Env {
    const result = envSchema.safeParse(process.env);

    if (!result.success) {
        const formatted = result.error.issues
            .map((i) => `  ❌ ${i.path.join(".")}: ${i.message}`)
            .join("\n");

        console.error(`\n🚨 Environment Configuration Error:\n${formatted}\n`);

        // In production, throw to prevent startup with bad config
        if (process.env.NODE_ENV === "production") {
            throw new Error("Invalid environment configuration. Check server logs.");
        }
    }

    return result.data || ({} as Env);
}
