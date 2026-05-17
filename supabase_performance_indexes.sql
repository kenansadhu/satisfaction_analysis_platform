-- Critical indexes for dashboard performance.
-- All `IF NOT EXISTS` — safe to re-run anytime, no-op if the index is already there.
--
-- Symptom these address: statement timeouts on /api/executive/report,
-- /api/executive/faculty-list, /api/executive/nps. The architecture doc
-- already flags `raw_feedback_inputs(respondent_id)` as mandatory; running this
-- ensures all the related indexes are in place.

-- The big one — used by every dashboard route via `.in('respondent_id', [...])`.
CREATE INDEX IF NOT EXISTS idx_raw_feedback_inputs_respondent_id
    ON raw_feedback_inputs(respondent_id);

-- Used when filtering quant rows by unit (faculty-detail, drill-down views).
CREATE INDEX IF NOT EXISTS idx_raw_feedback_inputs_target_unit_id
    ON raw_feedback_inputs(target_unit_id)
    WHERE target_unit_id IS NOT NULL;

-- Used to find all respondents for a survey (every dashboard load).
CREATE INDEX IF NOT EXISTS idx_respondents_survey_id
    ON respondents(survey_id);

-- Used to find a faculty's respondents (faculty-detail page).
CREATE INDEX IF NOT EXISTS idx_respondents_faculty_id
    ON respondents(faculty_id)
    WHERE faculty_id IS NOT NULL;

-- Used to join feedback_segments to their inputs in every analysis aggregate.
CREATE INDEX IF NOT EXISTS idx_feedback_segments_raw_input_id
    ON feedback_segments(raw_input_id);

-- Used by the cache-global-dataset NPS-row query and the score recalc paths.
-- Partial index: only stores quant rows, which keeps it small.
CREATE INDEX IF NOT EXISTS idx_raw_feedback_inputs_score_rule_quant
    ON raw_feedback_inputs(score_rule)
    WHERE is_quantitative = true;

-- Refresh planner statistics so the new indexes actually get used right away.
ANALYZE raw_feedback_inputs;
ANALYZE respondents;
ANALYZE feedback_segments;
