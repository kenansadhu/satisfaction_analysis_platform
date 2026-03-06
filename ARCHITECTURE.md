# Student Voice Platform — Architecture Guide

> **⚠️ AI AGENTS: Read this file FIRST before making ANY changes.**
> This is the single source of truth for the project's structure, data flow, and component relationships.
> After every change, you **MUST** update the relevant section of this document.

**Last Updated:** 2026-03-05
**Tech Stack:** Next.js 16 • React 19 • TypeScript • Supabase (PostgreSQL) • Google Gemini AI • TailwindCSS 4 • Radix UI • Recharts • Framer Motion

---

## 1. Purpose

A platform for **Universitas Pelita Harapan (UPH)** to transform raw student satisfaction survey data (SSI) into actionable intelligence. Admins import CSV survey results, the AI analyzes and categorizes every student comment, and then dashboards, reports, and an AI Data Scientist provide insights at unit, faculty, and institutional levels.

---

## 2. Database Schema (Supabase / PostgreSQL)

```
surveys
  ├─ id (PK)
  ├─ title, year, description, created_at

respondents
  ├─ id (PK)
  ├─ survey_id (FK → surveys)
  ├─ location, faculty, study_program, year_of_study

organization_units
  ├─ id (PK)
  ├─ name, short_name, description
  ├─ analysis_context (AI instructions for this unit)
  ├─ analysis_status ("NOT_STARTED" | "IN_PROGRESS" | "COMPLETED")

faculty_enrollments
  ├─ id (PK)
  ├─ unit_id (FK → organization_units), survey_id (FK → surveys)
  ├─ student_count

analysis_categories  ← (code references this as 'analysis_categories', NOT 'categories')
  ├─ id (PK)
  ├─ name, description, keywords[]
  ├─ unit_id (FK → organization_units)

subcategories  ← (may not exist yet — code only uses analysis_categories)
  ├─ id (PK)
  ├─ name, description
  ├─ category_id (FK → analysis_categories)

raw_feedback_inputs
  ├─ id (PK)
  ├─ raw_text, source_column
  ├─ target_unit_id (FK → organization_units)
  ├─ respondent_id (FK → respondents)
  ├─ is_quantitative (bool), requires_analysis (bool)
  ├─ numerical_score (nullable float)
  ├─ score_rule (text)  ← "NUMBER", "LIKERT", "BOOLEAN", "TEXT_SCALE", or "CUSTOM_MAPPING"
  ├─ custom_mapping (jsonb)  ← stores key-value pairs for explicit Likert overrides

feedback_segments  ← AI-generated analysis results
  ├─ id (PK)
  ├─ raw_input_id (FK → raw_feedback_inputs)
  ├─ segment_text, sentiment ("Positive"|"Negative"|"Neutral")
  ├─ category_id (FK → analysis_categories), subcategory_id (FK → subcategories)
  ├─ is_suggestion (bool)
  ├─ is_verified (bool, default false)  ← used in Audit Results tab for QA
  ├─ related_unit_ids (int[])

### 2.1 RPC Functions
`get_respondent_group_counts(p_respondent_ids BIGINT[])`
- **Purpose**: Aggregates total counts, comment counts, and analyzed counts for a batch of respondents. 
- **Benefit**: Shifts heavy `raw_feedback_inputs` scans from the browser to the database. Essential for handling 8.6k+ surveys within Supabase's 10s timeout.

analysis_jobs  ← tracks batch processing state
  ├─ id (PK)
  ├─ unit_id, survey_id, status, processed_items, total_items, created_at

unit_ai_reports  ← cached AI-generated reports (code uses 'unit_ai_reports', NOT 'executive_reports')
  ├─ id (PK)
  ├─ unit_id, report_type (e.g. 'executive'), content (JSONB), created_at
  ├─ UNIQUE(unit_id, report_type)

unit_analysis_instructions  ← custom rules per unit for AI analysis
  ├─ id (PK)
  ├─ unit_id (FK → organization_units)
  ├─ instruction (text)
  ├─ created_at

saved_charts  ← user-saved AI Data Scientist charts
  ├─ id (PK)
  ├─ title, description, config (JSONB), survey_id
```

### Key Relationships
- Each **survey** has many **respondents**, each respondent has many **raw_feedback_inputs**
- Each **organization_unit** has its own **analysis_categories** (taxonomy)
- Each **raw_feedback_input** is split into multiple **feedback_segments** by AI
- Each unit can have **unit_analysis_instructions** (custom AI rules)
- `requires_analysis = true` means a text comment not yet analyzed; set to `false` after AI processes it

---

## 3. Directory Structure

```
student-voice-platform/
├── src/
│   ├── app/                          # Next.js App Router (pages + API)
│   │   ├── layout.tsx                # Root layout: ThemeProvider → SurveyProvider → AnalysisProvider → AppShell
│   │   ├── page.tsx                  # Home dashboard with summary stats
│   │   ├── globals.css               # Global styles + TailwindCSS
│   │   ├── surveys/
│   │   │   ├── page.tsx              # Survey list page (CRUD)
│   │   │   └── [id]/
│   │   │       ├── page.tsx          # Survey detail: unit cards + Run Global Analysis
│   │   │       ├── unit/[unitId]/    # Unit-specific analysis view
│   │   │       └── manage/           # Survey management page
│   │   ├── executive/
│   │   │   └── page.tsx              # Executive dashboard: sentiment overview + YearComparison + SSIReport
│   │   ├── ai-scientist/
│   │   │   └── page.tsx              # AI Data Scientist: chart generation, discovery, saved charts
│   │   ├── import/
│   │   │   └── page.tsx              # CSV import wizard (4-step: upload → identity map → column map → execute)
│   │   ├── units/
│   │   │   └── page.tsx              # Organization units management
│   │   ├── settings/
│   │   │   └── page.tsx              # App settings
│   │   └── api/                      # API Routes (Next.js Route Handlers)
│   │       ├── ai/                   # AI-powered endpoints
│   │       │   ├── analyze-batch/    # Analyze a batch of comments → feedback_segments
│   │       │   ├── process-queue/    # Background worker: fetches pending comments, calls analyze-batch, saves results
│   │       │   ├── chat-analyst/     # Comprehensive Insights "Ask AI" chat
│   │       │   ├── chat-unit/        # Unit-specific insight chat
│   │       │   ├── discover-categories/ # AI discovers taxonomy categories from sample comments
│   │       │   ├── suggest-taxonomy/ # AI suggests categories/subcategories for a unit
│   │       │   ├── map-columns/      # AI maps CSV columns to units + types (SCORE/TEXT/CATEGORY/IGNORE)
│   │       │   ├── map-identity/     # AI identifies respondent identity columns
│   │       │   ├── generate-dashboard/ # AI generates chart blueprints
│   │       │   ├── generate-report/  # AI generates executive markdown report for a unit
│   │       │   └── generate-custom-chart/ # AI generates custom chart config from user prompt
│   │       └── executive/            # Executive data endpoints
│   │           ├── metrics/          # Aggregated sentiment metrics per unit
│   │           ├── compare/          # Year-over-year comparison data
│   │           ├── report/           # Full SSI report data
│   │           ├── suggestions/      # Aggregated suggestions across units
│   │           └── macro-metrics/    # Institution-wide macro statistics
│   ├── components/
│   │   ├── layout/
│   │   │   ├── AppShell.tsx          # Main layout: sidebar + content area (responsive)
│   │   │   ├── Sidebar.tsx           # Navigation sidebar with theme toggle
│   │   │   └── PageShell.tsx         # Reusable page wrapper + PageHeader
│   │   ├── analysis/                 # Core analysis components
│   │   │   ├── ComprehensiveDashboard.tsx  # MEGA COMPONENT (1175 lines) — sentiment, quant metrics, qual breakdown, report, drill-down
│   │   │   ├── AnalysisEngine.tsx    # Analysis control panel (start/stop/reset)
│   │   │   ├── CategorizationEngine.tsx  # Taxonomy management (discover/edit categories + subcategories)
│   │   │   ├── DataBrowser.tsx       # Raw data table browser with filters
│   │   │   ├── QualitativeDashboard.tsx  # Qualitative data visualization
│   │   │   ├── QuantitativeView.tsx  # Quantitative metrics display
│   │   │   ├── DynamicAnalytics.tsx  # AI-generated chart dashboard
│   │   │   ├── GlobalDataScientist.tsx  # AI chat for data exploration
│   │   │   ├── AIAnalystChat.tsx     # Chat interface for comprehensive insights
│   │   │   └── UnitInsightChat.tsx   # Unit-specific AI chat
│   │   ├── analytics/                # Cross-unit analytics visualizations
│   │   │   ├── DependencyGraph.tsx   # Force-directed graph of unit relationships
│   │   │   ├── ExecutiveStats.tsx    # MetricCard component
│   │   │   ├── HistoricalTrend.tsx   # Historical trend line chart
│   │   │   ├── IssuesRadar.tsx       # Radar chart of top issues
│   │   │   ├── PraisesRadar.tsx      # Radar chart of top praises
│   │   │   └── SentimentHeatmap.tsx  # Heatmap of sentiment across units
│   │   ├── executive/                # Executive view components
│   │   │   ├── SSIReport.tsx         # Full SSI report generator + PDF export
│   │   │   ├── SuggestionHub.tsx     # Aggregated suggestions view
│   │   │   └── YearComparison.tsx    # Year-over-year comparison charts
│   │   └── ui/                       # Shadcn/Radix UI primitives (19 components)
│   │       ├── alert-dialog, alert, badge, button, card, dialog,
│   │       │   empty-state, input, label, progress, scroll-area,
│   │       │   select, separator, sheet, skeleton, table, tabs,
│   │       │   textarea, tooltip
│   ├── context/
│   │   ├── AnalysisContext.tsx        # Global analysis state: start/stop/reset/progress for batch AI processing
│   │   └── SurveyContext.tsx          # Active survey selection, persisted in localStorage
│   ├── lib/
│   │   ├── ai.ts                     # Gemini API wrapper: callGemini(), wrapUserData(), AIError, handleAIError()
│   │   ├── supabase.ts               # Supabase client singleton
│   │   ├── constants.ts              # CORE_CATEGORIES, MANDATORY_CATEGORIES
│   │   ├── validators.ts             # Zod schemas for all API request validation
│   │   ├── env.ts                    # Environment variable validation
│   │   └── utils.ts                  # cn() utility (clsx + tailwind-merge)
│   └── types/
│       └── index.ts                  # All shared TypeScript interfaces
```

---

## 4. Core Data Flows

### 4.1 CSV Import Flow
```
User uploads CSV → /import page
  1. PapaParse parses the CSV client-side
  2. POST /api/ai/map-identity → AI identifies identity columns (location, faculty, major, year)
  3. POST /api/ai/map-columns → AI maps remaining columns to units + types (SCORE/TEXT/CATEGORY)
  4. User reviews/adjusts mappings
  5. handleStartImport() → creates survey + respondents + raw_feedback_inputs in Supabase
     - TEXT columns: requires_analysis = true, is_quantitative = false
     - SCORE columns: requires_analysis = false, is_quantitative = true, numerical_score = parsed value
     - CUSTOM_MAPPING: AI suggests or user explicitly maps text variants (e.g. "Puas" → 3) which are stored in `custom_mapping` and applied to `numerical_score`
```

### 4.2 AI Analysis Flow (Comment → Segments)
```
SurveyDetailPage or AnalysisEngine triggers startAnalysis(unitId, surveyId)
  → AnalysisContext creates an analysis_job in DB
  → Client-driven batch processing loop:
      1. POST /api/ai/process-queue { jobId, unitId, surveyId }
      2. process-queue route:
         a. Fetches next batch of unanalyzed comments (requires_analysis = true)
         b. Fetches the unit's taxonomy (categories + subcategories)
         c. Calls callGemini() with comment batch + taxonomy
         d. AI returns segments with sentiment, category, subcategory, is_suggestion
         e. Maps category/subcategory names → database IDs
         f. Inserts feedback_segments into DB
         g. Sets requires_analysis = false on processed inputs
         h. Updates analysis_job progress
      3. Client polls for hasMore, continues or stops
  → Each raw_feedback_input gets split into 1+ feedback_segments
```

### 4.3 Dashboard Data Flow
```
ComprehensiveDashboard loads for a specific unit + optional survey:
  1. Fetches all respondent IDs for the survey (paginated in chunks of 1,000 to bypass API limits).
  2. **Controlled Parallel Aggregation**: Uses `get_respondent_group_counts` to crunch data in batches of 250 IDs. 
     - **Concurrency Control**: Fetches 5 batches in parallel at a time. This balances speed (parallelism) with stability (prevents DB connection pool exhaustion/500 errors).
  3. Computes:
     - Sentiment distribution (pie chart)
     - Category breakdown (bar chart, sorted)
     - Quantitative metrics grouped by source_column
     - Suggestion extraction
  4. "Generate Report" → POST /api/ai/generate-report → cached in executive_reports
  5. "Ask AI" → AIAnalystChat → POST /api/ai/chat-analyst
```

### 4.4 Executive View Flow
```
/executive page:
  1. Fetches all units' sentiment counts via respondent-chunked aggregation
  2. Displays: SentimentHeatmap, IssuesRadar, PraisesRadar, ExecutiveStats
  3. Tabs for: YearComparison, SSIReport, SuggestionHub
  4. SSIReport → POST /api/executive/report → AI-generated full report + PDF export
```

---

## 5. Key Architecture Rules

> **Every AI agent MUST follow these rules when modifying code:**

### 5.1 Data Access Pattern
- **ALWAYS** filter by `respondent_id` when querying by survey (surveys don't directly link to raw_feedback_inputs)
- **Indexing**: A btree index on `raw_feedback_inputs(respondent_id)` is **MANDATORY** for dashboard performance.
- Use **chunked queries** (400 IDs per chunk) for `IN` clauses to avoid Supabase URL limits.
- **Aggregation**: Prefer database-side aggregation (RPC) over client-side loops for counts.
- Never use `!inner` joins with respondents — they cause timeouts on large datasets

### 5.2 Component Hierarchy
```
layout.tsx → ThemeProvider → SurveyProvider → AnalysisProvider → AppShell
  AppShell → Sidebar + <main>{children}</main>
    Pages use <PageShell> + <PageHeader> for consistent layout
```

### 5.3 AI Integration Pattern
- All AI calls go through `src/lib/ai.ts` → `callGemini()`
- AI responses MUST be JSON (jsonMode defaults to true)
- Input data wrapped in `<user_data>` tags via `wrapUserData()` for prompt injection protection
- Request bodies validated with Zod schemas in `src/lib/validators.ts`
- Error handling via `handleAIError()` which wraps `AIError` class

### 5.4 State Management
- **SurveyContext**: Active survey selection across all pages, persisted in localStorage
- **AnalysisContext**: Controls the batch analysis lifecycle (start/stop/reset/progress)
- **No global state library** — contexts + local component state only

### 5.5 Taxonomy System
- Each unit has its OWN set of categories and subcategories
- `MANDATORY_CATEGORIES` (from `constants.ts`) are always seeded: "Staff Service & Attitude", "Service & Response Speed", "Others"
- AI discovers additional categories via `/api/ai/discover-categories`
- Category names in AI responses are mapped back to database IDs after analysis

### 5.6 Styling
- TailwindCSS 4 with `dark:` variants
- Dark sidebar (slate-950), light content area (slate-50 / white)
- Shadcn/Radix UI primitives in `src/components/ui/`
- Toast notifications via `sonner`

---

## 6. Known Issues & Technical Debt

- [ ] `ComprehensiveDashboard.tsx` is 1175 lines — needs decomposition into sub-components
- [ ] `AnalysisContext` re-renders all subscribers on every log/progress update
- [ ] Many `any` types remain in validators and components (`z.any()`, etc.)
- [ ] Client-side aggregation used in dashboards — should move to DB views/RPCs
- [ ] No authentication or RLS — app is currently open
- [ ] No automated tests
- [ ] Some components fetch overlapping data independently

---

## 7. Environment Variables

```env
NEXT_PUBLIC_SUPABASE_URL=     # Required: Supabase project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY= # Required: Supabase anon key
GEMINI_API_KEY=                # Required: Google Gemini API key
AI_MODEL=gemini-2.5-flash     # Optional: defaults to gemini-2.5-flash
INSTITUTION_NAME=              # Optional: defaults to "the institution"
```

---

## 8. Changelog

> **Update this section every time you make changes. Newest entries first.**

| Date | What Changed | Files Modified |
|------|-------------|----------------|
| 2026-03-06 | **Final Dashboard Optimization**: Removed Data Hygiene logic (preventing timeouts). Implemented **Controlled Parallel Aggregation**: 5x parallel batches of 250 respondent IDs via `get_respondent_group_counts`. Aligned RPC to `BIGINT[]`. Reduced load time from ∞ → ~5s for 8.6k dataset. | `surveys/[id]/page.tsx`, `get_respondent_group_counts` [NEW RPC] |
| 2026-03-05 | **Column Mapping UX overhaul**: Replaced table layout with expandable card rows. Full column names (no truncation), inline Unit/Type/Transform selectors, inline custom mapping controls. Added `survey_column_cache` table: user-triggered "Build Cache" button persists unique values (max 20/col) for instant loading on subsequent visits. | `manage/page.tsx`, `survey_column_cache` [NEW TABLE] |
| 2026-03-04 | Added **Custom Likert Mapping** system. Users can map distinct text values to scores (1-4, 0, NA). Persisted via new `score_rule` and `custom_mapping` columns in `raw_feedback_inputs`. Integrated into both **Import Wizard** (with AI auto-suggestions) and **Manage Survey** page. Added `0` mapping support for binary data. | `import/page.tsx`, `manage/page.tsx`, `api/ai/map-columns/route.ts`, `raw_feedback_inputs` [SCHEMA UPDATE] |
| 2026-03-04 | Added `survey_quant_cache` table for precomputed satisfaction scores. Report API uses lazy cache: instant on cache hit, computes + stores on miss. Load time: ~2min → 6s. Added cache management endpoint | `api/executive/report/route.ts`, `api/executive/cache-scores/route.ts` [NEW], `survey_quant_cache` [NEW TABLE] |
| 2026-03-04 | Fixed Report tab N/A ratings (RPC timeout) and wrong score calculation. Matched ComprehensiveDashboard logic: group by `source_column`, exclude binary columns. Added retry logic for intermittent metrics 500 | `api/executive/report/route.ts`, `api/executive/metrics/route.ts` |
| 2026-03-03 | Fixed verification stats showing 0: merged stats into loadData, fixed race condition with wasAnalyzingRef, removed broken loadVerificationStats | `DataBrowser.tsx` |
| 2026-03-03 | Round 2: removed pending text from Tab 1, fixed progress > total, wait overlays for Tabs 3&4, fixed reset truncating at 500 respondents | `CategorizationEngine.tsx`, `AnalysisContext.tsx`, `DataBrowser.tsx`, `ComprehensiveDashboard.tsx` |
| 2026-03-03 | Fixed 11 bugs across unit analysis flow: mandatory cat duplication, comment count mismatch, skipIds infinite loop, audit auto-refresh, division by zero, fetch chunk size, report survey scoping, verified icons, dead code, mandatory name protection | `CategorizationEngine.tsx`, `AnalysisEngine.tsx`, `DataBrowser.tsx`, `ComprehensiveDashboard.tsx`, `process-queue/route.ts` |
| 2026-03-03 | Fixed schema discrepancies: table names (`analysis_categories`, `unit_ai_reports`, `unit_analysis_instructions`), added `is_verified` column, `study_program` column | `ARCHITECTURE.md` |
| 2026-03-03 | Created ARCHITECTURE.md | `ARCHITECTURE.md` |

---

## ⚠️ Instructions for AI Agents

1. **Read this file completely** before starting any work
2. **After EVERY change**, update the relevant sections above AND add a row to the Changelog
3. **Do NOT create duplicate functions** — search this doc and the codebase for existing implementations first
4. **Follow the data access patterns** in Section 5.1 — breaking these causes bugs
5. **Test that your changes don't break** the existing data flows in Section 4
6. **If you add a new file**, add it to the Directory Structure in Section 3
7. **If you modify the database schema**, update Section 2
8. **If you fix a Known Issue**, check it off in Section 6
