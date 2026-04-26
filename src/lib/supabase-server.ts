import { createClient } from "@supabase/supabase-js";

// Service-role client for server-side API routes — bypasses RLS.
// NEVER import this in client components ("use client").
export const supabaseServer = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
);
