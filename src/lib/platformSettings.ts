/**
 * `platform_settings.value` is stored differently depending on the column type
 * (`text` vs `jsonb`) and the Supabase client may or may not auto-parse on read.
 * This helper accepts whatever shape we get back and returns a typed array,
 * never throwing on bad data — bad data just degrades to an empty list.
 */
export function parseSettingArray<T extends number | string = number>(raw: unknown): T[] {
    if (raw == null) return [];
    let parsed: unknown = raw;
    if (typeof raw === "string") {
        try {
            parsed = JSON.parse(raw);
        } catch {
            return [];
        }
    }
    return Array.isArray(parsed) ? (parsed as T[]) : [];
}

/** Fetch a numeric-id-array platform setting (e.g. nps_unit_ids, excluded_score_unit_ids). */
export async function fetchUnitIdSetting(
    supabase: { from: (table: string) => any },
    key: string,
): Promise<Set<number>> {
    const { data } = await supabase
        .from("platform_settings")
        .select("value")
        .eq("key", key)
        .maybeSingle();
    return new Set<number>(parseSettingArray<number>(data?.value));
}
