-- Run this in your Supabase SQL Editor

DROP FUNCTION IF EXISTS get_global_dashboard_metrics(integer);
DROP FUNCTION IF EXISTS get_global_dashboard_metrics(bigint);

CREATE OR REPLACE FUNCTION get_global_dashboard_metrics(p_survey_id bigint DEFAULT NULL)
RETURNS TABLE (
    unit_id bigint,
    unit_name text,
    unit_short_name text,
    total_segments bigint,
    positive bigint,
    neutral bigint,
    negative bigint,
    score numeric,
    category_counts jsonb
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    WITH respondent_matches AS (
        SELECT r.id as respondent_id, r.faculty as unit_name, r.survey_id
        FROM respondents r
    ),
    segment_counts AS (
        SELECT 
            u.id as unit_id,
            u.name as unit_name,
            u.short_name as unit_short_name,
            COUNT(fs.id) as total_segments,
            COUNT(CASE WHEN fs.sentiment = 'Positive' THEN 1 END) as positive,
            COUNT(CASE WHEN fs.sentiment = 'Neutral' THEN 1 END) as neutral,
            COUNT(CASE WHEN fs.sentiment = 'Negative' THEN 1 END) as negative,
            CASE 
                WHEN COUNT(fs.id) > 0 
                THEN ROUND((COUNT(CASE WHEN fs.sentiment = 'Positive' THEN 1 END) * 100.0) / COUNT(fs.id), 1)
                ELSE 0 
            END as score
        FROM organization_units u
        LEFT JOIN respondent_matches rm ON rm.unit_name = u.name AND (p_survey_id IS NULL OR rm.survey_id = p_survey_id)
        LEFT JOIN raw_feedback_inputs rfi ON rfi.respondent_id = rm.respondent_id AND rfi.is_quantitative = false
        LEFT JOIN feedback_segments fs ON fs.raw_input_id = rfi.id AND fs.is_verified = true
        GROUP BY u.id, u.name, u.short_name
    ),
    category_agg AS (
        SELECT 
            u.id as unit_id,
            COALESCE(
                jsonb_agg(
                    jsonb_build_object(
                        'category_name', cat.category_name,
                        'total', cat.total,
                        'positive_count', cat.positive_count,
                        'negative_count', cat.negative_count
                    )
                ) FILTER (WHERE cat.category_name IS NOT NULL), 
                '[]'::jsonb
            ) as category_counts
        FROM organization_units u
        LEFT JOIN (
            SELECT 
                rm.unit_name,
                ac.name as category_name,
                COUNT(fs.id) as total,
                COUNT(CASE WHEN fs.sentiment = 'Positive' THEN 1 END) as positive_count,
                COUNT(CASE WHEN fs.sentiment = 'Negative' THEN 1 END) as negative_count
            FROM raw_feedback_inputs rfi
            JOIN respondent_matches rm ON rfi.respondent_id = rm.respondent_id
            JOIN feedback_segments fs ON fs.raw_input_id = rfi.id AND fs.is_verified = true
            JOIN analysis_categories ac ON fs.category_id = ac.id
            WHERE (p_survey_id IS NULL OR rm.survey_id = p_survey_id)
            AND rfi.is_quantitative = false
            GROUP BY rm.unit_name, ac.name
        ) cat ON cat.unit_name = u.name
        GROUP BY u.id
    )
    SELECT 
        sc.unit_id,
        sc.unit_name,
        sc.unit_short_name,
        sc.total_segments,
        sc.positive,
        sc.neutral,
        sc.negative,
        sc.score,
        ca.category_counts
    FROM segment_counts sc
    LEFT JOIN category_agg ca ON sc.unit_id = ca.unit_id;
END;
$$;
