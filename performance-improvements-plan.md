# Performance Improvements Plan

## Problem
Changing a filter on the unit insights page (Insights tab) is slow. Every filter change triggers a full re-fetch pipeline in `src/app/api/unit-insights/agg-metrics/route.ts`.

### What happens on every filter click
1. Fetch ALL respondents for the survey (paginated, multiple queries)
2. For each chunk of respondents → fetch all their inputs (many parallel queries)
3. For each chunk of inputs → fetch all their segments (many more parallel queries)
4. Transfer all raw rows to the Node.js server and aggregate there

With thousands of respondents and tens of thousands of segments this is easily 20–50 database round trips per filter click, even with the existing pagination optimization.

---

## Fix 1 — PostgreSQL RPC function (highest impact)

Move the entire aggregation into a single Supabase RPC call. Instead of transferring 50,000 raw rows to Node and summing them there, ask the database once:

> "Give me sentiment counts by category and by faculty for these demographic + category + sentiment filters."

It returns ~20 aggregated rows. Single round trip, orders of magnitude faster.

**What to build:**
- A PostgreSQL function `get_unit_sentiment_agg(unit_id, survey_id, location_filter, faculty_filter, program_filter, sentiment_filter, category_filter)` that joins `respondents → raw_feedback_inputs → feedback_segments → analysis_categories` and returns grouped counts.
- Replace the bulk of `agg-metrics/route.ts` with a single `supabase.rpc('get_unit_sentiment_agg', params)` call.
- Keep quantitative score fetching as-is (it's a separate, smaller query).

**Effort:** Medium — requires writing a non-trivial PostgreSQL function and reworking the route.

---

## Fix 2 — Client-side sentiment/category filtering (quick win)

On first load (or when demographic filters change), fetch and cache the full unfiltered aggregation. When the user toggles sentiment or category pills, apply those filters **client-side** on the already-fetched data — instant response, zero extra network calls.

**Why it works:** Sentiment and category filters only narrow down which segments to count. If the full segment-level data is already in memory, the browser can re-aggregate it in milliseconds.

**Limitation:** Only works if the per-segment data volume is manageable in the browser (tens of thousands of rows is fine; hundreds of thousands may not be).

**Effort:** Low-medium — state management change in `ComprehensiveDashboard.tsx`, no backend changes.

---

## Fix 3 — Database indexes (prerequisite for any fix)

Check that the following indexes exist. Missing indexes make every query slower regardless of architecture.

```sql
-- Most critical for segment lookups
CREATE INDEX IF NOT EXISTS idx_feedback_segments_input_id
  ON feedback_segments(raw_input_id);

CREATE INDEX IF NOT EXISTS idx_feedback_segments_category_sentiment
  ON feedback_segments(category_id, sentiment);

-- For input lookups by respondent + unit
CREATE INDEX IF NOT EXISTS idx_raw_inputs_respondent_unit
  ON raw_feedback_inputs(respondent_id, target_unit_id);

-- For respondent lookups by survey + demographics
CREATE INDEX IF NOT EXISTS idx_respondents_survey_faculty
  ON respondents(survey_id, faculty_id);
```

**Effort:** Very low — run once in Supabase SQL editor. Safe, non-destructive.

---

## Recommended order

1. **Fix 3 first** — check/add indexes. Zero risk, immediate benefit.
2. **Fix 2 next** — client-side filtering for sentiment/category. Quick win for the most common interaction.
3. **Fix 1 last** — PostgreSQL RPC for demographic filter changes. Most impactful but most work.
