-- ============================================================
-- FIX v3: Use subquery for respondent filtering (index-friendly)
-- The JOIN approach times out on 600k rows.
-- Subquery lets Postgres use the survey_id index on respondents first.
-- ============================================================
DROP FUNCTION IF EXISTS get_quant_scores_by_unit_campus(bigint);
DROP FUNCTION IF EXISTS get_quant_scores_by_unit_campus(int);
DROP FUNCTION IF EXISTS get_qual_summary_by_unit(bigint);
DROP FUNCTION IF EXISTS get_qual_summary_by_unit(int);

-- ============================================================
-- Quantitative Score Aggregation (subquery approach)
-- ============================================================
CREATE OR REPLACE FUNCTION get_quant_scores_by_unit_campus(p_survey_id bigint)
RETURNS TABLE(
    target_unit_id bigint,
    campus text,
    avg_score double precision,
    score_count bigint
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        rfi.target_unit_id,
        COALESCE(r.location, 'Unknown')::text AS campus,
        AVG(rfi.numerical_score)::double precision AS avg_score,
        COUNT(*)::bigint AS score_count
    FROM raw_feedback_inputs rfi
    JOIN respondents r ON rfi.respondent_id = r.id
    WHERE rfi.respondent_id IN (
        SELECT id FROM respondents WHERE survey_id = p_survey_id
    )
      AND rfi.is_quantitative = true
      AND rfi.numerical_score IS NOT NULL
      AND rfi.raw_text ~ '^\d+ = '
    GROUP BY rfi.target_unit_id, r.location;
END;
$$ LANGUAGE plpgsql STABLE
SET statement_timeout = '30s';

-- ============================================================
-- Qualitative Sentiment Summary (already works, keeping same)
-- ============================================================
CREATE OR REPLACE FUNCTION get_qual_summary_by_unit(p_survey_id bigint)
RETURNS TABLE(
    target_unit_id bigint,
    category_id bigint,
    sentiment text,
    is_suggestion boolean,
    cnt bigint
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        rfi.target_unit_id,
        fs.category_id,
        fs.sentiment::text,
        fs.is_suggestion,
        COUNT(*)::bigint AS cnt
    FROM feedback_segments fs
    JOIN raw_feedback_inputs rfi ON fs.raw_input_id = rfi.id
    WHERE rfi.respondent_id IN (
        SELECT id FROM respondents WHERE survey_id = p_survey_id
    )
    GROUP BY rfi.target_unit_id, fs.category_id, fs.sentiment, fs.is_suggestion;
END;
$$ LANGUAGE plpgsql STABLE
SET statement_timeout = '30s';

-- ============================================================
-- Performance indexes (create if not exist)
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_respondents_survey_id ON respondents(survey_id);
CREATE INDEX IF NOT EXISTS idx_rfi_respondent_id ON raw_feedback_inputs(respondent_id);
CREATE INDEX IF NOT EXISTS idx_rfi_is_quant ON raw_feedback_inputs(is_quantitative) WHERE is_quantitative = true;
CREATE INDEX IF NOT EXISTS idx_fs_raw_input_id ON feedback_segments(raw_input_id);

-- ============================================================
-- Survey Detail Counts — TRUE single scan using conditional aggregation
-- One GROUP BY with SUM(CASE WHEN) computes everything in one pass
-- ============================================================
DROP FUNCTION IF EXISTS get_survey_detail_counts(bigint);
DROP FUNCTION IF EXISTS get_survey_detail_counts_v2(bigint);

CREATE OR REPLACE FUNCTION get_survey_detail_counts_v2(p_survey_id bigint)
RETURNS TABLE(
    out_unit_id bigint,
    total_count bigint,
    invalid_count bigint,
    scorelike_count bigint,
    comment_count bigint,
    analyzed_count bigint
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        agg.uid,
        agg.total_count,
        agg.invalid_count,
        agg.scorelike_count,
        agg.comment_count,
        COALESCE(seg.analyzed_count, 0::bigint)
    FROM (
        -- Single scan of raw_feedback_inputs
        SELECT
            rfi.target_unit_id AS uid,
            COUNT(*)::bigint AS total_count,
            SUM(CASE WHEN rfi.raw_text IN ('-','N/A','nan','Nilai') OR rfi.raw_text IS NULL
                THEN 1 ELSE 0 END)::bigint AS invalid_count,
            SUM(CASE WHEN rfi.is_quantitative = false
                AND (rfi.raw_text ~ '^\d+ = ' OR rfi.raw_text LIKE 'NA = %'
                     OR rfi.raw_text = 'Ya' OR rfi.raw_text = 'Tidak')
                THEN 1 ELSE 0 END)::bigint AS scorelike_count,
            SUM(CASE WHEN rfi.requires_analysis = true
                THEN 1 ELSE 0 END)::bigint AS comment_count
        FROM raw_feedback_inputs rfi
        WHERE rfi.respondent_id IN (SELECT id FROM respondents WHERE survey_id = p_survey_id)
        GROUP BY rfi.target_unit_id
    ) agg
    LEFT JOIN (
        -- Separate scan of the smaller feedback_segments table
        SELECT
            rfi2.target_unit_id AS uid,
            COUNT(DISTINCT fs.raw_input_id)::bigint AS analyzed_count
        FROM feedback_segments fs
        JOIN raw_feedback_inputs rfi2 ON fs.raw_input_id = rfi2.id
        WHERE rfi2.respondent_id IN (SELECT id FROM respondents WHERE survey_id = p_survey_id)
          AND rfi2.requires_analysis = true
        GROUP BY rfi2.target_unit_id
    ) seg ON seg.uid = agg.uid;
END;
$$ LANGUAGE plpgsql STABLE
SET statement_timeout = '30s';

-- ============================================================
-- Indexes recommended by Supabase slow query advisor
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_rfi_respondent_id ON raw_feedback_inputs(respondent_id);
CREATE INDEX IF NOT EXISTS idx_rfi_requires_analysis ON raw_feedback_inputs(requires_analysis) WHERE requires_analysis = true;
CREATE INDEX IF NOT EXISTS idx_rfi_is_quant ON raw_feedback_inputs(is_quantitative) WHERE is_quantitative = true;
CREATE INDEX IF NOT EXISTS idx_rfi_raw_text ON raw_feedback_inputs(raw_text);
CREATE INDEX IF NOT EXISTS idx_rfi_target_unit ON raw_feedback_inputs(target_unit_id);
CREATE INDEX IF NOT EXISTS idx_respondents_survey_id ON respondents(survey_id);
CREATE INDEX IF NOT EXISTS idx_fs_raw_input_id ON feedback_segments(raw_input_id);
CREATE INDEX IF NOT EXISTS idx_rfi_respondent_unit_analysis
    ON raw_feedback_inputs(respondent_id, target_unit_id, requires_analysis);
