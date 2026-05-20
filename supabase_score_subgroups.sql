-- Per-unit score subgroups: lets units like IT Department roll up scores via
-- (mobile_app_avg + wifi_avg) / 2 instead of a flat 5-question average.
--
-- Data model:
--   organization_units.score_subgroups: ordered list of subgroup names for the unit
--     e.g. ["Mobile App", "Wifi"] for IT Department.
--   survey_column_cache.subgroup_name: which subgroup a given (survey, column)
--     belongs to. NULL = treat the column as its own single-column subgroup, which
--     reproduces today's flat per-respondent macro for units that don't define any.
--
-- Calculation (per respondent in a unit × campus):
--   1. Group their answered columns by subgroup_name (NULL → key by source_column,
--      so each unassigned column is its own group).
--   2. Average within each group → one score per subgroup.
--   3. Respondent's unit score = average of those subgroup averages.
-- Unit×campus SSI = average of respondents' unit scores.

ALTER TABLE organization_units
    ADD COLUMN IF NOT EXISTS score_subgroups jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE survey_column_cache
    ADD COLUMN IF NOT EXISTS subgroup_name text;

-- Quick lookup for the report cache rebuild
CREATE INDEX IF NOT EXISTS idx_survey_column_cache_subgroup
    ON survey_column_cache(survey_id, source_column)
    WHERE subgroup_name IS NOT NULL;
