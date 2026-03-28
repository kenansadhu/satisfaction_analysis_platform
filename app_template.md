# App Template: AI-Powered Data Analysis Platform

> **How to use this document**: This is a reusable architectural template derived from the Student Voice Platform (SSI). When building a new app with the same stack and pattern, use this as your starting blueprint. Replace domain-specific terms (e.g., "surveys", "units", "feedback") with your own domain concepts while keeping the architecture, patterns, and conventions intact.

---

## 1. Platform Overview

| Field | Value |
|---|---|
| **App Type** | Multi-page admin dashboard + AI analysis platform |
| **Deployment** | Vercel (Next.js serverless) |
| **Database** | Supabase (managed PostgreSQL) |
| **AI Provider** | Google Gemini API |
| **Auth** | Currently none (open admin app) — add Supabase Auth + RLS for production |

**Core purpose pattern**: Import structured data (CSV) → AI analyzes it → Generate dashboards, reports, and conversational insights.

---

## 2. Tech Stack

### Frontend
| Package | Version | Purpose |
|---|---|---|
| `next` | 16.x | App Router, API Routes, SSR/SSG |
| `react` | 19.x | UI rendering |
| `typescript` | 5.x | Type safety |
| `tailwindcss` | 4.x | Utility-first styling |
| `framer-motion` | 12.x | Page/element animations |
| `lucide-react` | 0.563.x | Icon library |
| `next-themes` | 0.4.x | Dark/light mode provider |

### UI Components
| Package | Version | Purpose |
|---|---|---|
| `radix-ui` | 1.x | Headless primitives (dialogs, tabs, selects, etc.) |
| `class-variance-authority` | 0.7.x | Variant-based component styling |
| `clsx` + `tailwind-merge` | latest | Conditional class merging utility (`cn()`) |
| `sonner` | 2.x | Toast notifications |

### Data & Charts
| Package | Version | Purpose |
|---|---|---|
| `recharts` | 3.x | Bar, pie, line, scatter, area charts |
| `react-force-graph-2d` | 1.x | Force-directed network graphs |
| `papaparse` | 5.x | Client-side CSV parsing |
| `date-fns` | 4.x | Date manipulation utilities |

### AI & Backend
| Package | Version | Purpose |
|---|---|---|
| `@google/generative-ai` | 0.24.x | Gemini API SDK |
| `@supabase/supabase-js` | 2.x | Supabase client (auth, db, storage) |
| `zod` | 4.x | Runtime request body validation |

### Export
| Package | Version | Purpose |
|---|---|---|
| `jspdf` | 4.x | PDF generation |
| `html2canvas` | 1.x | DOM-to-canvas for PDF embedding |
| `react-markdown` | 10.x | Render AI-generated markdown content |

---

## 3. Project Directory Structure

```
project-root/
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── layout.tsx                # Root: ThemeProvider → DataProvider → AnalysisProvider → AppShell
│   │   ├── page.tsx                  # Home / dashboard summary
│   │   ├── globals.css               # Global styles + Tailwind directives
│   │   ├── [entity]/                 # List + CRUD pages per major entity
│   │   │   └── [id]/                 # Detail page for a single entity
│   │   ├── import/
│   │   │   └── page.tsx              # Multi-step CSV import wizard
│   │   ├── executive/
│   │   │   └── page.tsx              # High-level aggregate view
│   │   ├── ai-scientist/
│   │   │   └── page.tsx              # Conversational AI + chart generation
│   │   ├── settings/
│   │   │   └── page.tsx              # App configuration
│   │   └── api/
│   │       ├── ai/                   # AI-powered Next.js Route Handlers
│   │       │   ├── analyze-batch/    # Core: analyze text comments → segments
│   │       │   ├── process-queue/    # Background worker: fetch → analyze → save
│   │       │   ├── chat-analyst/     # Conversational AI on aggregated data
│   │       │   ├── chat-unit/        # Conversational AI scoped to one entity
│   │       │   ├── discover-categories/ # AI discovers taxonomy from samples
│   │       │   ├── suggest-taxonomy/ # AI suggests categories/subcategories
│   │       │   ├── map-columns/      # AI maps CSV columns to entities + types
│   │       │   ├── map-identity/     # AI identifies metadata/identity columns
│   │       │   ├── generate-report/  # AI generates a markdown report per entity
│   │       │   ├── generate-dashboard/ # AI generates chart blueprints
│   │       │   └── generate-custom-chart/ # AI generates a chart from user prompt
│   │       └── executive/            # Aggregate data API endpoints
│   │           ├── metrics/          # Sentiment/score metrics per entity
│   │           ├── compare/          # Year-over-year comparison data
│   │           ├── report/           # Full institution-wide report data
│   │           ├── suggestions/      # Aggregated suggestions
│   │           └── macro-metrics/    # Global statistics
│   ├── components/
│   │   ├── layout/
│   │   │   ├── AppShell.tsx          # Main layout: sidebar + content
│   │   │   ├── Sidebar.tsx           # Navigation + theme toggle
│   │   │   └── PageShell.tsx         # Reusable page wrapper + header
│   │   ├── analysis/                 # Entity analysis components
│   │   │   ├── ComprehensiveDashboard.tsx  # Main analysis dashboard (mega-component)
│   │   │   ├── AnalysisEngine.tsx    # Start/stop/reset analysis controls
│   │   │   ├── CategorizationEngine.tsx    # Taxonomy management
│   │   │   ├── DataBrowser.tsx       # Raw data table with filters
│   │   │   ├── QualitativeDashboard.tsx    # Qualitative visualizations
│   │   │   ├── QuantitativeView.tsx  # Numeric score display
│   │   │   ├── DynamicAnalytics.tsx  # AI chart dashboard
│   │   │   └── AIAnalystChat.tsx     # Chat UI for data exploration
│   │   ├── executive/
│   │   │   ├── SSIReport.tsx         # Full report + PDF export
│   │   │   ├── SuggestionHub.tsx     # Aggregated suggestions view
│   │   │   └── YearComparison.tsx    # YoY comparison charts
│   │   ├── analytics/
│   │   │   ├── ExecutiveStats.tsx    # MetricCard component
│   │   │   ├── SentimentHeatmap.tsx  # Cross-entity sentiment heatmap
│   │   │   ├── IssuesRadar.tsx       # Radar chart — top complaints
│   │   │   ├── PraisesRadar.tsx      # Radar chart — top praises
│   │   │   ├── HistoricalTrend.tsx   # Trend line chart over time
│   │   │   └── DependencyGraph.tsx   # Force-directed relationship graph
│   │   └── ui/                       # Shadcn/Radix UI primitives
│   │       └── [alert, badge, button, card, dialog, input, select,
│   │            table, tabs, textarea, tooltip, progress, skeleton, ...]
│   ├── context/
│   │   ├── AnalysisContext.tsx        # Global batch analysis lifecycle state
│   │   └── SurveyContext.tsx          # Active dataset selection (persisted localStorage)
│   ├── lib/
│   │   ├── ai.ts                      # Gemini wrapper: callGemini(), wrapUserData(), AIError
│   │   ├── supabase.ts                # Supabase singleton client
│   │   ├── constants.ts               # CORE_CATEGORIES, MANDATORY_CATEGORIES
│   │   ├── validators.ts              # Zod request body schemas for every API route
│   │   ├── env.ts                     # Environment variable validation on startup
│   │   └── utils.ts                   # cn() utility (clsx + tailwind-merge)
│   └── types/
│       └── index.ts                   # All shared TypeScript interfaces + enums
├── supabase/                          # Supabase migrations + RPC SQL files
├── .env.local                         # Local secrets (never commit)
├── .env.example                       # Template for required env vars
├── next.config.ts
├── tailwind.config.ts (if applicable)
├── tsconfig.json
└── ARCHITECTURE.md                    # Living architecture doc for AI agents
```

---

## 4. Database Schema (Supabase / PostgreSQL)

> All primary keys are `bigint generated by default as identity`. All foreign keys use `bigint`. Cascade deletes flow from `surveys → respondents → raw_feedback_inputs → feedback_segments`.

### 4.1 Core Tables

```sql
-- Top-level dataset container
surveys (
  id bigint PK,
  title text NOT NULL,
  year integer,
  description text,
  created_at timestamptz DEFAULT now(),
  ai_dataset_cache jsonb DEFAULT '[]',   -- cached AI dataset for the scientist page
  ai_dataset_updated_at timestamptz
)

-- Respondents tied to a survey (one row per survey response)
respondents (
  id bigint PK,
  survey_id bigint FK → surveys (CASCADE DELETE),
  student_hash text,          -- anonymized respondent identifier
  faculty text,
  study_program text,
  entry_year text,
  location text
)

-- The organizational units / departments being evaluated
organization_units (
  id bigint PK,
  name text UNIQUE NOT NULL,
  short_name text,
  description text,
  analysis_context text,       -- freeform context given to the AI during analysis
  analysis_status text DEFAULT 'NOT_STARTED',  -- 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED'
  needs_reanalysis boolean DEFAULT false
)

-- Every individual data cell from the CSV, stored as one row
-- Links respondent → unit columns
raw_feedback_inputs (
  id bigint PK,
  respondent_id bigint FK → respondents (CASCADE DELETE),
  target_unit_id bigint FK → organization_units,
  raw_text text NOT NULL,
  source_column text,               -- original CSV column header
  is_quantitative boolean DEFAULT false,
  requires_analysis boolean DEFAULT false,   -- true = text that AI should analyze
  numerical_score numeric,          -- populated for score columns
  score_rule text DEFAULT 'NUMBER', -- 'NUMBER' | 'LIKERT' | 'BOOLEAN' | 'TEXT_SCALE' | 'CUSTOM_MAPPING'
  custom_mapping jsonb DEFAULT '{}'  -- explicit text→score overrides (e.g. "Puas" → 3)
)

-- AI-generated analysis output (one input → multiple segments)
feedback_segments (
  id bigint PK,
  raw_input_id bigint FK → raw_feedback_inputs (CASCADE DELETE),
  segment_text text NOT NULL,
  sentiment text,                   -- 'Positive' | 'Negative' | 'Neutral'
  category text,                    -- category name (denormalized)
  sub_category text,
  category_id bigint FK → analysis_categories,
  subcategory_id bigint FK → analysis_subcategories,
  is_suggestion boolean DEFAULT false,
  is_verified boolean DEFAULT false,  -- used for QA/audit workflow
  related_unit_ids bigint[]           -- cross-unit mentions
)
```

### 4.2 Taxonomy Tables

```sql
-- Each unit has its own category set
analysis_categories (
  id bigint PK,
  unit_id bigint FK → organization_units (CASCADE DELETE),
  name text NOT NULL,
  description text,
  keywords text[],
  created_at timestamptz DEFAULT now()
)

analysis_subcategories (
  id bigint PK,
  category_id bigint FK → analysis_categories,
  name text NOT NULL,
  description text
)
```

### 4.3 Supporting Tables

```sql
-- Faculty and study program catalogs (for demographic filtering)
faculties (id bigint PK, name text UNIQUE, short_name text)
study_programs (id bigint PK, faculty_id bigint FK → faculties, name text UNIQUE, short_name text)
faculty_enrollments (id bigint PK, unit_id FK, survey_id FK, student_count integer)

-- Per-unit custom AI instructions (appended to prompts)
unit_analysis_instructions (
  id bigint PK,
  unit_id bigint FK → organization_units,
  instruction text,
  created_at timestamptz
)

-- Batch job tracking
analysis_jobs (
  id bigint PK,
  unit_id bigint,
  survey_id bigint,
  status text,            -- 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'STOPPED' | 'CANCELLED'
  processed_items integer,
  total_items integer,
  created_at timestamptz
)

-- Cached AI-generated markdown/JSON reports per unit
unit_ai_reports (
  id bigint PK,
  unit_id bigint,
  report_type text,       -- e.g. 'executive'
  content jsonb,
  created_at timestamptz,
  UNIQUE(unit_id, report_type)
)

-- User-saved charts from the AI Data Scientist page
saved_ai_charts (
  id bigint PK,
  title text,
  description text,
  config jsonb,           -- ChartBlueprint JSON
  survey_id bigint
)

-- Column value cache for the Manage Survey page
survey_column_cache (
  id bigint PK,
  survey_id bigint,
  column_name text,
  sample_values jsonb     -- up to 20 unique values per column
)

-- Precomputed satisfaction scores for the report page
survey_quant_cache (
  id bigint PK,
  survey_id bigint,
  unit_id bigint,
  data jsonb,
  computed_at timestamptz
)
```

### 4.4 Key RPC Functions

```sql
-- Aggregates comment counts + analysis status for a batch of respondent IDs
-- Used to avoid N+1 queries on large datasets (handles 8,600+ respondents)
get_respondent_group_counts(p_respondent_ids BIGINT[])
  → RETURNS: { respondent_id, total_items, qualitative_items, analyzed_count }

-- Returns per-unit qualitative summary for a given survey
-- Used by the AI Data Scientist cache builder
get_qual_summary_by_unit(p_survey_id BIGINT)
  → RETURNS: { unit_id, unit_name, total_segments, positive, negative, neutral, suggestions, top_categories }
```

---

## 5. Data Flows

### 5.1 CSV Import Flow (4-step wizard)

```
Step 1 — Upload:
  User uploads CSV file → PapaParse parses it client-side

Step 2 — Identity Mapping:
  POST /api/ai/map-identity  { headers[] }
  → AI identifies which columns are identity fields (location, faculty, major, year)
  → User reviews/adjusts

Step 3 — Column Mapping:
  POST /api/ai/map-columns  { headers[], samples{}, units[] }
  → AI maps remaining columns to organization units + column types:
      SCORE   → is_quantitative=true, stores numerical_score
      TEXT    → requires_analysis=true, queued for AI analysis
      CATEGORY → stored as-is, no analysis
      IGNORE  → skipped entirely
  → Score rules: NUMBER, LIKERT, BOOLEAN, TEXT_SCALE, CUSTOM_MAPPING
  → User reviews/adjusts; can set explicit text→score mappings (custom_mapping)

Step 4 — Execute:
  handleStartImport():
    1. INSERT survey record
    2. For each CSV row: INSERT respondent
    3. For each cell: INSERT raw_feedback_input (with type flags)
    → All in chunked batches to avoid request size limits
```

### 5.2 AI Analysis Flow (Batch Processing Loop)

```
Trigger: user clicks "Start Analysis" for a unit

AnalysisContext.startAnalysis(unitId, surveyId):
  1. UPDATE organization_units SET analysis_status = 'IN_PROGRESS'
  2. INSERT analysis_jobs (status='PENDING') → get jobId
  3. Pre-fetch all respondent IDs for the survey (paginated, 1000/page)
  4. Count total pending items (requires_analysis=true, is_quantitative=false)

  Client-driven batch loop:
    WHILE hasMore AND !stopSignal:
      POST /api/ai/process-queue { jobId, unitId, surveyId, skipIds }

      process-queue route:
        a. Fetch next batch of unanalyzed TEXT inputs (requires_analysis=true, is_quantitative=false)
        b. Load unit's taxonomy (categories + subcategories)
        c. Load unit's custom instructions
        d. Build prompt → callGemini() → returns segments[]
        e. Map category/subcategory names → database IDs
        f. INSERT feedback_segments into DB
        g. UPDATE raw_feedback_inputs SET requires_analysis=false
        h. UPDATE analysis_jobs (processed_items, total_items)

      Client polls hasMore → sleeps 1s → continues

  On completion:
    UPDATE organization_units SET analysis_status = 'COMPLETED'
    UPDATE analysis_jobs SET status = 'COMPLETED'

Stop:
  stopRef.current = true → UPDATE analysis_jobs SET status = 'STOPPED'

Reset:
  DELETE feedback_segments (by input IDs, in batches)
  UPDATE raw_feedback_inputs SET requires_analysis = true
  DELETE analysis_jobs for unit
  UPDATE organization_units SET analysis_status = 'NOT_STARTED'
```

### 5.3 Dashboard Data Flow

```
ComprehensiveDashboard loads (unitId + surveyId):

  1. Fetch all respondent IDs for survey (paginated, 1000/page)

  2. Controlled Parallel Aggregation:
     - Split IDs into batches of 250
     - Call get_respondent_group_counts() 5 batches at a time (concurrency=5)
     - Prevents DB connection pool exhaustion on large datasets

  3. Client-side computation:
     - Sentiment distribution → PieChart
     - Category breakdown → BarChart (sorted by count)
     - Quantitative metrics → grouped by source_column, averaged
     - Suggestions → extracted from feedback_segments

  4. "Generate Report" tab:
     POST /api/ai/generate-report → cached in unit_ai_reports
     Returns markdown rendered via react-markdown

  5. "Ask AI" tab:
     POST /api/ai/chat-analyst → streaming markdown + optional ChartBlueprints
```

### 5.4 Executive / Aggregate View Flow

```
/executive page:
  1. Fetch all units
  2. For each unit: aggregate metrics (reusing same chunked respondent pattern)
  3. Render: SentimentHeatmap, IssuesRadar, PraisesRadar, ExecutiveStats
  4. Tabs:
     - YearComparison: POST /api/executive/compare → side-by-side charts
     - SSIReport: POST /api/executive/report → full AI-generated report + PDF
     - SuggestionHub: POST /api/executive/suggestions → aggregated action items
```

### 5.5 AI Data Scientist Flow

```
/ai-scientist page:
  1. Load cached dataset from surveys.ai_dataset_cache
  2. "Rebuild Cache" button:
     POST /api/ai/cache-global-dataset
     → calls get_qual_summary_by_unit() (3-attempt retry for cold starts)
     → saves results to surveys.ai_dataset_cache

  3. Chat: POST /api/ai/chat-analyst { dataset, message, history }
     → Returns: markdown + ChartBlueprint[] objects
     → ChartBlueprints rendered via Recharts with scale="band" for categorical alignment

  4. Save chart: INSERT saved_ai_charts
     → Non-destructive background refresh of saved list (preserves chat state)
```

---

## 6. AI Integration

### 6.1 Core Wrapper — `src/lib/ai.ts`

All AI calls in the entire app flow through this single file:

```typescript
// Main function — used by ALL API routes
callGemini(prompt: string, options: { jsonMode?: boolean, model?: string }): Promise<unknown>
  - Reads GEMINI_API_KEY from environment
  - Defaults to model: process.env.AI_MODEL || "gemini-2.5-flash"
  - jsonMode: true (default) → sets responseMimeType = "application/json"
  - jsonMode: false → returns raw text (for markdown reports)
  - Retry logic: 3 attempts with exponential backoff (1s → 2s → 4s)
  - Retries on: HTTP 429, 5xx, "fetch failed", "429" message
  - Strips markdown code fences (```json) from response before parsing
  - Throws AIError on failure

// Prompt injection guard
wrapUserData(data: unknown): string
  - Serializes data to JSON string
  - Strips all XML/HTML tags (prevents tag-injection attacks)
  - Truncates at 50,000 characters (prevents prompt flooding)
  - Wraps in <user_data>...</user_data> delimiter tags

// Error classes
AIError(message: string, status: number)  // extends Error with HTTP status code
handleAIError(error: unknown): Response   // converts AIError to JSON Response
```

### 6.2 AI API Routes — Responsibilities

| Route | Input | Output |
|---|---|---|
| `POST /api/ai/map-identity` | CSV headers[] | `{ location[], faculty[], major[], year[] }` |
| `POST /api/ai/map-columns` | headers[], samples, units[] | `{ [column]: { unit_id, type, rule } }` |
| `POST /api/ai/process-queue` | jobId, unitId, surveyId, skipIds | `{ hasMore, processedCount, processedIds }` |
| `POST /api/ai/analyze-batch` | comments[], context, taxonomy | `{ results: AnalysisResult[] }` |
| `POST /api/ai/discover-categories` | comments[], unitName, currentCategories | `{ categories: DiscoveredCategory[] }` |
| `POST /api/ai/suggest-taxonomy` | unitName, sampleComments, mode | `{ categories[] }` or `{ subcategories[] }` |
| `POST /api/ai/generate-report` | unitId, surveyId, stats, segments | Markdown string (cached) |
| `POST /api/ai/generate-dashboard` | unitId, surveyId | `{ charts: ChartBlueprint[] }` |
| `POST /api/ai/generate-custom-chart` | prompt, dataset | `{ chart: ChartBlueprint }` |
| `POST /api/ai/chat-analyst` | message, history, dataset | Markdown + optional ChartBlueprints |
| `POST /api/ai/chat-unit` | message, history, unitId | Markdown response |
| `POST /api/ai/cache-global-dataset` | surveyId | `{ success, rowCount }` |

### 6.3 Taxonomy System

- Every entity (unit) has its own independent set of **categories** and **subcategories**.
- `MANDATORY_CATEGORIES` (from `constants.ts`) are always seeded before AI discovery — they cannot be deleted:
  - "Staff Service & Attitude"
  - "Service & Response Speed"
  - "Others"
- AI discovers additional categories via `/api/ai/discover-categories` using a sample of real comments.
- After AI analysis, **category names in AI responses are mapped back to database IDs** (since the AI returns names, not IDs).
- `CORE_CATEGORIES` (also in `constants.ts`) are suggested across all units for cross-entity correlation.

### 6.4 AI Prompt Security Pattern

```
RULE: Never embed raw user data directly in a prompt string.
PATTERN:
  const safeData = wrapUserData(userInputtedData);
  const prompt = `
    You are an analyst. Analyze the following data:
    ${safeData}
    Return JSON: { ... }
  `;
  const result = await callGemini(prompt);  // jsonMode=true by default
```

---

## 7. State Management

No global state library (no Redux, Zustand, Jotai). Uses React Context + local state only.

### 7.1 `SurveyContext` — `src/context/SurveyContext.tsx`
- Stores the currently active survey ID.
- Persisted in `localStorage` so selection survives page navigation.
- Consumed by every page that needs to scope data to a survey.

### 7.2 `AnalysisContext` — `src/context/AnalysisContext.tsx`
Controls the entire batch AI analysis lifecycle:

```typescript
interface AnalysisState {
  isAnalyzing: boolean;
  currentUnitId: string | null;
  currentSurveyId: string | null;
  progress: { processed: number; total: number; percentage: number };
  logs: string[];            // Real-time processing log (latest 50 entries)
  startAnalysis(unitId, surveyId?): Promise<void>;
  stopAnalysis(): void;
  resetAnalysis(unitId, surveyId?): Promise<void>;
}
```

- Uses a `stopRef` (useRef) to signal the async loop to halt cleanly without stale closure issues.
- Writes DB status (`IN_PROGRESS`, `COMPLETED`, `NOT_STARTED`) directly from context.
- `AnalysisEngine.tsx` has a **self-healing routine**: if 0 pending items exist but segments exist → silently backfills `COMPLETED`.

### 7.3 Component Layout Hierarchy
```
layout.tsx
  └── ThemeProvider (next-themes)
       └── SurveyProvider
            └── AnalysisProvider
                 └── AppShell
                      ├── Sidebar
                      └── <main>
                           └── [Page]
                                └── PageShell > PageHeader > [content]
```

---

## 8. Design System & Styling

### 8.1 TailwindCSS 4 Setup
- `globals.css` contains all `@theme` tokens, base resets, and component classes.
- `dark:` variants for full dark mode support.
- `tw-animate-css` for pre-built animation utilities.

### 8.2 Color Palette & Theme
| Element | Light | Dark |
|---|---|---|
| Sidebar background | `slate-950` | `slate-950` |
| Page background | `slate-50` / `white` | `slate-900` |
| Card background | `white` | `slate-800` |
| Accent/Primary | Customizable per project | — |
| Borders | `slate-200` | `slate-700` |

### 8.3 Typography
- Use a Google Font (e.g., `Inter`, `Outfit`, `Geist`) loaded via `<link>` in `layout.tsx`.
- Base font size: 14–16px for body, 12–13px for table cells / meta.

### 8.4 Component Library Pattern (Shadcn/Radix)
- All primitives live in `src/components/ui/`.
- Each is a thin wrapper over Radix UI with Tailwind classes applied.
- Standard components: `Button`, `Card`, `Badge`, `Dialog`, `Sheet`, `Select`, `Tabs`, `Table`, `Tooltip`, `Progress`, `Skeleton`, `ScrollArea`, `Textarea`, `Input`, `Label`, `Separator`, `Alert`, `AlertDialog`, `EmptyState`.
- Use `cn()` utility for all conditional class merging.

### 8.5 Animation Guidelines
- `framer-motion`: staggered list entries (`staggerChildren`), page-level `AnimatePresence`.
- Hover effects on all interactive cards: `hover:shadow-md`, `hover:border-blue-200`.
- Progress bars: CSS transitions (`transition-all duration-300`).
- Skeleton loaders on every data-fetching component.

### 8.6 Reusable Layout Components
- **`PageShell`**: wraps page content with consistent max-width, padding.
- **`PageHeader`**: title + subtitle + optional action buttons (right-aligned).
- **`AppShell`**: sidebar (fixed left, collapsible on mobile) + scrollable main content.
- **`EmptyState`**: icon + heading + description + optional action button, used when lists are empty.

---

## 9. API Architecture Rules

### 9.1 Every API Route Must:
1. Parse request body with `await req.json()`.
2. Validate with a Zod schema from `src/lib/validators.ts` → return `400` on failure.
3. Wrap all AI calls in `try/catch` using `handleAIError()`.
4. Return `Response.json(data)` (never use `NextResponse` unless strictly necessary).
5. Log errors server-side with `console.error("[Route Name] ...", error)`.

### 9.2 API Route Template
```typescript
// src/app/api/ai/my-route/route.ts
import { callGemini, wrapUserData, handleAIError } from "@/lib/ai";
import { myRouteSchema } from "@/lib/validators";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = myRouteSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
    }

    const { data } = parsed;
    const prompt = `
      You are an AI assistant. Given this data:
      ${wrapUserData(data.someField)}
      Return JSON: { result: string }
    `;
    const result = await callGemini(prompt);
    return Response.json(result);
  } catch (error) {
    return handleAIError(error);
  }
}
```

---

## 10. Database Access Patterns (Critical)

These patterns exist to prevent timeouts and bugs with large datasets:

### 10.1 Survey-Scoped Queries
```
// ALWAYS go through respondents — raw_feedback_inputs has no direct survey_id
survey → respondents → raw_feedback_inputs

// NEVER do this (causes timeouts with !inner joins):
supabase.from('raw_feedback_inputs').select('*, respondents!inner(survey_id)').eq(...)

// DO this instead:
const { data: respondents } = await supabase.from('respondents').select('id').eq('survey_id', surveyId)
const respIds = respondents.map(r => r.id)
// then chunk respIds and filter raw_feedback_inputs by `in('respondent_id', chunk)`
```

### 10.2 Chunked `IN` Queries
```
// Supabase URL limit: ~2000 chars. Use 400 IDs per IN clause for respondents, 200 for inputs.
const CHUNK_SIZE = 400;
for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
  const chunk = ids.slice(i, i + CHUNK_SIZE);
  await supabase.from('table').select('*').in('column', chunk);
}
```

### 10.3 Controlled Parallel Aggregation
```
// For large datasets: 5 parallel batches of 250 IDs each
const BATCH_SIZE = 250;
const CONCURRENCY = 5;
const batches = chunkArray(allIds, BATCH_SIZE);

for (let i = 0; i < batches.length; i += CONCURRENCY) {
  const parallelBatches = batches.slice(i, i + CONCURRENCY);
  const results = await Promise.all(parallelBatches.map(batch => rpc('get_respondent_group_counts', { p_respondent_ids: batch })));
  // accumulate results
}
```

### 10.4 Paginated Fetches
```
// Always paginate when fetching unbounded lists
let page = 0;
while (true) {
  const { data } = await supabase.from('table').select('id').range(page * 1000, (page + 1) * 1000 - 1);
  if (!data || data.length === 0) break;
  allIds.push(...data.map(r => r.id));
  if (data.length < 1000) break;
  page++;
}
```

### 10.5 Required Index
```sql
-- MANDATORY for dashboard performance — without this, queries timeout
CREATE INDEX idx_raw_feedback_inputs_respondent_id ON raw_feedback_inputs(respondent_id);
CREATE INDEX idx_raw_feedback_inputs_unit_id ON raw_feedback_inputs(target_unit_id);
CREATE INDEX idx_feedback_segments_raw_input_id ON feedback_segments(raw_input_id);
```

---

## 11. Environment Variables

```env
# Required
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
GEMINI_API_KEY=AIza...

# Optional
AI_MODEL=gemini-2.5-flash          # Defaults to gemini-2.5-flash
INSTITUTION_NAME=My Organization    # Used in report prompts
```

> **Security**: `GEMINI_API_KEY` must be a **server-only** variable (no `NEXT_PUBLIC_` prefix). It is only read server-side in API routes. Store in Vercel Environment Variables for production.

---

## 12. Security Notes

| Risk | Current Mitigation | Recommended for Production |
|---|---|---|
| Prompt injection | `wrapUserData()` strips XML/HTML tags + truncates at 50k chars | Keep this pattern |
| API key exposure | `GEMINI_API_KEY` is server-only (no NEXT_PUBLIC prefix) | ✅ Already correct |
| Authentication | **None currently** — open admin app | Add Supabase Auth + RLS policies |
| Row-Level Security | **Not enabled** | Enable RLS on all tables, scope by `auth.uid()` |
| Request validation | Zod validation on all API routes | Keep + tighten `z.any()` usages |
| CORS | Next.js default (same-origin only for API routes) | Fine for admin apps |
| DoS / rate limiting | Retry backoff in AI wrapper, 50k input truncation | Add Vercel rate limiting or middleware |

---

## 13. Performance Patterns

| Pattern | Where Used | Why |
|---|---|---|
| **Controlled parallel aggregation** | Dashboard data load | 5 concurrent RPC batches instead of sequential — 20x speedup |
| **Lazy caching** | Executive report, quant scores | Compute on first request, serve from cache after (~2min → 6s) |
| **Client-driven batch loop** | Analysis processing | Avoids serverless 10s timeout by splitting work into 1s-gapped calls |
| **Dataset cache column** | `surveys.ai_dataset_cache` | AI scientist loads instantly instead of re-querying |
| **survey_quant_cache table** | Report score computation | Precomputed satisfaction averages, populated on first run |
| **Chunked deletes** | Reset flow | Deletes in batches of 1000 to avoid RPC timeout |
| **Query index** | `respondent_id` btree index | Makes survey-scoped queries instant on large datasets |
| **Skeleton loaders** | All async components | Prevents layout shift, better perceived performance |

---

## 14. Key Reusable Patterns Summary

When starting a new app with the same stack:

1. **Copy `src/lib/ai.ts` unchanged** — it is the AI safety and retry layer.
2. **Copy `src/lib/utils.ts`** — `cn()` is used everywhere.
3. **Copy `src/components/ui/`** — full Radix/Shadcn component library.
4. **Copy `src/components/layout/`** — `AppShell`, `Sidebar`, `PageShell` give you the full layout immediately.
5. **Use `AnalysisContext` as a template** for any long-running async job with start/stop/reset + progress tracking.
6. **Use `SurveyContext` as a template** for any "active selection" that needs to persist across page navigations.
7. **Always validate API request bodies with Zod** in `validators.ts` before touching any data.
8. **Always use `wrapUserData()`** before embedding user input in AI prompts.
9. **Always chunk large ID arrays** before passing to Supabase `.in()` queries.
10. **Always paginate** Supabase queries that could return unbounded rows.
