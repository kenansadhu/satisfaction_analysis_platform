-- NPS Support — RPC update
-- Run this in the Supabase SQL Editor AFTER deploying the application code.
--
-- ⚠️ If you already ran an earlier version of this file, you may now have TWO
-- copies of get_quant_summary_by_unit_campus (one taking integer, one taking bigint),
-- which makes Postgres reject calls with "Could not choose the best candidate function".
-- The DROP statements below clean both possible signatures before re-creating the function.
--
-- Why this is needed: get_quant_summary_by_unit_campus is the fast-path RPC used
-- by /api/executive/report. The client-side fallback already excludes
-- score_rule = 'NPS_0_10' from the Likert satisfaction index, but the RPC was
-- written before NPS existed. Until this update runs, NPS columns will leak
-- into cached score aggregates (the cached survey_quant_cache rows can be
-- cleared by re-saving any column mapping on the manage page, or by deleting
-- rows from survey_quant_cache directly).
--
-- The new definition adds AND rfi.score_rule IS DISTINCT FROM 'NPS_0_10'
-- so NPS values are never averaged into the Likert satisfaction index.

DROP FUNCTION IF EXISTS public.get_quant_summary_by_unit_campus(integer);
DROP FUNCTION IF EXISTS public.get_quant_summary_by_unit_campus(bigint);

CREATE OR REPLACE FUNCTION get_quant_summary_by_unit_campus(p_survey_id bigint)
RETURNS TABLE (
    unit_id bigint,
    campus text,
    avg_score numeric,
    cnt bigint,
    max_score numeric
)
LANGUAGE sql
STABLE
AS $$
    SELECT
        rfi.target_unit_id AS unit_id,
        COALESCE(r.location, 'Unknown') AS campus,
        AVG(rfi.numerical_score)::numeric AS avg_score,
        COUNT(*)::bigint AS cnt,
        MAX(rfi.numerical_score)::numeric AS max_score
    FROM raw_feedback_inputs rfi
    JOIN respondents r ON r.id = rfi.respondent_id
    WHERE r.survey_id = p_survey_id
      AND rfi.is_quantitative = true
      AND rfi.numerical_score IS NOT NULL
      AND rfi.target_unit_id IS NOT NULL
      AND rfi.score_rule IS DISTINCT FROM 'NPS_0_10'
    GROUP BY rfi.target_unit_id, r.location, rfi.source_column;
$$;

-- One-time invalidation of stale cache rows that may already contain NPS-polluted averages.
-- This is safe to run repeatedly; the cache will be rebuilt on next request.
DELETE FROM survey_quant_cache WHERE survey_id IN (
    SELECT DISTINCT r.survey_id
    FROM raw_feedback_inputs rfi
    JOIN respondents r ON r.id = rfi.respondent_id
    WHERE rfi.score_rule = 'NPS_0_10'
);

DELETE FROM survey_faculty_score_cache WHERE survey_id IN (
    SELECT DISTINCT r.survey_id
    FROM raw_feedback_inputs rfi
    JOIN respondents r ON r.id = rfi.respondent_id
    WHERE rfi.score_rule = 'NPS_0_10'
);
