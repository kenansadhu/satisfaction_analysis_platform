# AI Agents — Student Voice Platform

A reference guide to every AI agent in this platform, how they work, and how to manage them via the AI Control Panel.

---

## The AI Control Panel (`/ai-control`)

Accessible by **owner role only** via the sidebar ("AI Control Panel").

### Three tabs

| Tab | What it does |
|---|---|
| **Agents** | View every agent's purpose, system prompt summary, and configure per-function model overrides and prompt addendums |
| **Model & Pricing** | Set the global default Gemini model and view token pricing for cost estimation |
| **Usage** | Monitor call volume, token consumption, and estimated cost — filterable by time range, exportable as CSV |

### How configuration works

All runtime configuration lives in the `platform_settings` database table (key/value pairs). Changes take effect on the **next AI call** — no redeployment needed.

| Setting key | Purpose |
|---|---|
| `default_model` | Global Gemini model used by all agents unless overridden |
| `model_override_<agent-id>` | Per-function model override (e.g. `model_override_generate-report`) |
| `prompt_addendum_<agent-id>` | Extra instructions appended to that agent's base system prompt (e.g. `prompt_addendum_chat-analyst`) |

### Prompt Addendum

The addendum is appended to the end of the base system prompt exactly like this:

```
---
OWNER INSTRUCTIONS:
<your text here>
```

Use it to customize behavior without touching source code. Examples:
- `"Always respond in Bahasa Indonesia."`
- `"Prioritize concerns about staff attitude when writing reports."`
- `"When listing recommendations, always suggest a training program as the first action."`

---

## Agent Reference

### 1. Chat Analyst (`chat-analyst`)

**Source:** `src/app/api/ai/chat-analyst/route.ts`

**Trigger:** User sends a message in the AI Data Scientist chat panel (`/ai-scientist`).

**What it does:** Answers natural-language questions about the full cross-university dataset. Can generate live Recharts chart blueprints from user requests, analyze correlations between units, and break down results by faculty.

**Context provided:**
- Full pre-built global dataset (all units, scores, category breakdowns)
- Column dictionary (maps `likert_X` / `binary_X` keys → original survey questions → scale)
- Faculty breakdown data (pre-aggregated avg scores per faculty × unit)
- Survey metadata (respondent count, faculties, programs, locations)
- Full conversation history (multi-turn continuity)

**Output:** Formatted text with `<box title="">` sections + optional `<charts_config>` JSON block.

**Key prompt rules:**
- All chart keys must match exact keys from the dataset — no invented keys
- Wraps every thematic point in `<box title="...">` tags
- Cites specific metrics; never hallucinates data
- Faculty names bold, unit names italic, column names in `inline code`

---

### 2. Chat Unit (`chat-unit`)

**Source:** `src/app/api/ai/chat-unit/route.ts`

**Trigger:** User sends a message in the Unit Insights chat panel (unit detail page).

**What it does:** Answers questions about a specific unit using its qualitative feedback segments, quantitative satisfaction scores, and faculty demographic breakdowns. Can perform faculty crosstabulation on-the-fly.

**Context provided:**
- Unit name + description
- Up to 200 qualitative feedback segments (with faculty attribution per segment)
- Quantitative scores per question (avg, count, scale type)
- Executive report summary (if generated)
- Population context (respondents for this unit vs total survey population)
- Full conversation history

**Output:** Formatted text with `<box title="">` sections.

**Key prompt rules:**
- Filters segments by `faculty` key for demographic questions
- Distinguishes 1-4 Likert vs 0-1 Binary scales clearly
- Cites verbatim quotes from the segment data as evidence

---

### 3. Generate Report (`generate-report`)

**Source:** `src/app/api/ai/generate-report/route.ts`

**Trigger:** User clicks "Generate Executive Report" on a unit page.

**What it does:** Produces a structured JSON executive analysis report for a single unit. Saved to the `unit_ai_reports` table and displayed in the executive report UI.

**Context provided:**
- Unit name + description
- Utilization rate (unit respondents / total survey population)
- Quantitative metrics (avg scores per question, scale type)
- Up to 80 qualitative segments (sentiment, category, verbatim text)

**Output format:**
```json
{
  "executive_summary": "...",
  "overall_verdict": "Excellent | Good | Needs Improvement | Critical",
  "strengths": [{ "title": "...", "detail": "...", "evidence": "verbatim quote" }],
  "concerns": [{ "title": "...", "detail": "...", "severity": "High|Medium|Low", "evidence": "..." }],
  "recommendations": [{ "title": "...", "action": "...", "impact": "...", "priority": "Immediate|Short-term|Long-term" }],
  "closing_statement": "..."
}
```

**Key prompt rules:**
- Utilization weighting: low reach flagged separately from satisfaction scores
- Verbatim quotes required for every strength and concern
- Retries up to 2× if Gemini returns invalid JSON

---

### 4. Generate Dashboard (`generate-dashboard`)

**Source:** `src/app/api/ai/generate-dashboard/route.ts`

**Trigger:** User clicks "Generate AI Dashboard" in the executive view.

**What it does:** Analyzes the full pre-built dataset and produces exactly 4 chart blueprints highlighting the most interesting patterns, correlations, and outliers across all units.

**Context provided:**
- Full pre-aggregated dataset (all units)
- List of exact allowable chart keys

**Output:** 4 chart blueprint objects consumed by the Recharts dashboard renderer.

**Key prompt rules:**
- All `xKey` / `yKey` / `yKeys` must match exact dataset keys
- SCATTER only for correlating two different numeric metrics
- BAR with `yKeys` array for side-by-side positive/negative comparisons
- Descriptions must explain *why* units differ using `unit_description` context

---

### 5. Map Columns (`map-columns`)

**Source:** `src/app/api/ai/map-columns/route.ts`

**Trigger:** User uploads a CSV in the Import Wizard (column mapping step).

**What it does:** Classifies each CSV column into a data type (SCORE, CATEGORY, TEXT, IGNORE) and generates a score mapping for Likert/Boolean columns.

**Context provided:**
- Column headers + sample values from the uploaded CSV
- Target organization units (id + name)
- Survey description provided by the user

**Output:** JSON mapping per column — type, rule (LIKERT/BOOLEAN), and `customMapping` (value → score).

**Key behavior — Logical Relative Scaling:**
The AI looks at the collective set of sample values for each column to determine the logical hierarchy:
- Most positive term → 4
- Most negative term → 1
- Middle terms distributed as 3 and 2

Indonesian scale terms are handled automatically: "Sangat" = extreme, "Puas/Setuju" = positive, "Cukup/Kurang/Tidak" = neutral-to-negative.

---

### 6. Map Identity (`map-identity`)

**Source:** `src/app/api/ai/map-identity/route.ts`

**Trigger:** User uploads a CSV in the Import Wizard (identity mapping step).

**What it does:** Identifies which column headers represent respondent demographic data so they can be used for faculty/program/location crosstabulation.

**Context provided:** Column headers from the uploaded CSV.

**Output:** JSON with 4 groups: `location`, `faculty`, `major`, `year` — each an array of matching header strings.

---

### 7. Discover Categories (`discover-categories`)

**Source:** `src/app/api/ai/discover-categories/route.ts`

**Trigger:** User runs "Discover Categories" in the Unit Analysis setup.

**What it does:** Reads a batch of student comments and evolves the unit's category taxonomy — adding new categories for emerging topics, updating names where needed.

**Context provided:**
- Unit name + description
- Existing category list (name + description)
- Up to 100 new student comments
- Custom instructions from the owner

**Output:** Complete updated category list as JSON.

**Mandatory categories** — always preserved, never renamed or removed:
- "Staff Service & Attitude"
- "Service & Response Speed"
- "Others"

---

### 8. Suggest Taxonomy (`suggest-taxonomy`)

**Source:** `src/app/api/ai/suggest-taxonomy/route.ts`

**Trigger:** User clicks "Suggest Categories" or "Suggest Subcategories" in Unit setup.

**Modes:**
- `CATEGORIES` — generates 8–15 main categories from sample comments
- `SUBCATEGORIES` — generates 5–10 subcategories for a selected parent category

**Context provided:**
- Unit name + description
- Sample comments from existing feedback
- (SUBCATEGORIES mode) Parent category name

**Output:** JSON suggestions array with `name`, `description`, `keywords`.

**Globally standardized names** — enforced for cross-university consistency:
- "Response Speed & Timeliness"
- "Staff Professionalism & Attitude"
- "Clarity of Information"
- "Accessibility"

---

### 9. Process Queue (`process-queue`)

**Source:** `src/app/api/ai/process-queue/route.ts`

**Trigger:** User starts analysis for a unit. Runs continuously in 50-comment batches until all comments are processed.

**What it does:** The core feedback analysis engine. Segments each raw comment into distinct ideas, classifies each segment into a category, assigns sentiment, detects student suggestions, and cross-tags mentions of other university units.

**Context provided:**
- Unit name + description + custom analysis context
- Category taxonomy (name, description, keywords)
- All other university units (for cross-unit tagging)
- Custom owner instructions (from `unit_analysis_instructions` table)
- Batch of up to 50 raw comments (ID + text)

**Output:** JSON array — one entry per comment, each with a `segments` array.

**Segment fields:**
```json
{
  "raw_input_id": 123,
  "segments": [{
    "text": "Extracted segment",
    "category_name": "Must match exact category name",
    "sentiment": "Positive | Negative | Neutral",
    "is_suggestion": true,
    "related_unit_name": "Other Unit Name | null"
  }]
}
```

**Key rules:**
- Splits one comment into multiple segments if multiple distinct ideas exist
- Ignores pure noise: "-", "ok", "no comment", "n/a", "cukup", "tidak ada"
- Suggestion detection: Indonesian keywords — Semoga, Mohon, Harap, Sebaiknya, Agar, Tolong, Perlu
- Cross-unit tagging uses unit descriptions to make intelligent routing decisions

---

## Token Usage & Cost Estimation

Every AI call logs a row to the `ai_usage_logs` table (written server-side with the service role key — bypasses RLS). The log includes:

| Column | Description |
|---|---|
| `function_name` | Agent ID (e.g. `process-queue`) |
| `model_id` | Exact Gemini model used |
| `input_tokens` | Prompt token count from `usageMetadata.promptTokenCount` |
| `output_tokens` | Response token count from `usageMetadata.candidatesTokenCount` |
| `total_tokens` | Sum of input + output |
| `estimated_cost_usd` | Calculated from hardcoded pricing table in `src/lib/ai.ts` |

Cost estimation uses this formula:

```
cost = (inputTokens × inputRate + outputTokens × outputRate) / 1,000,000
```

Current rates (USD per 1M tokens):

| Model | Input | Output |
|---|---|---|
| Gemini 2.5 Flash Lite | $0.018 | $0.072 |
| Gemini 2.5 Flash | $0.075 | $0.30 |
| Gemini 2.5 Pro | $1.25 | $10.00 |

Logging is **fire-and-forget** — it never blocks or slows the user's AI response, even if the DB write fails.

---

## Adding a New Agent

1. Create `src/app/api/ai/<function-id>/route.ts`
2. Import `getAgentSettings` and `callGemini` from `@/lib/ai`
3. Call `getAgentSettings("<function-id>")` at the start of the handler to get `modelId` and `addendum`
4. Build your prompt, then: `prompt + (addendum ? \`\n\n---\nOWNER INSTRUCTIONS:\n${addendum}\` : "")`
5. Call `callGemini(finalPrompt, { model: modelId, functionId: "<function-id>", jsonMode: ... })`
6. Add an entry to the `AGENT_REGISTRY` array in `src/app/ai-control/page.tsx`
