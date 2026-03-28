# Student Voice Platform — Pending Tasks

> **Status:** Active
> **Last Updated:** March 28, 2026

---

## 🔐 Phase 0: Authentication (Hybrid Approach)

### 0.1 Admin Auth (Supabase Email Auth)
- [ ] **Install Supabase Auth client** and configure session management in `layout.tsx`
- [ ] **Create login page** (`/login`) with email + password form
- [ ] **Protect admin routes** — redirect to `/login` if no session: `/import`, `/units`, `/surveys/[id]` (analysis tab), `/settings`
- [ ] **Define 3 roles in DB:** `super_admin` (owner), `admin` (QA team), `viewer` (faculties)
- [ ] **Implement RBAC middleware** — check role on protected routes
- [ ] **Row Level Security (RLS):** Apply read-only policies for viewer role; full policies for admin/super_admin

### 0.2 Faculty Viewer (Token-Based Public Links)
- [ ] **Add `faculty_tokens` table** — `id, faculty_name, token (uuid), created_at, expires_at`
- [ ] **Create `/faculty/[token]` route** — read-only faculty view (no auth required)
  - Shows filtered executive data for that faculty
  - Includes AI chat (`chat-analyst`) scoped to their faculty
  - Cannot trigger analysis, import, or modify any data
- [ ] **Token management UI** in settings — generate/revoke faculty links
- [ ] **Faculty Analysis Page** (`/faculty/[token]`) features:
  - All units' results filtered by this faculty's respondents
  - Cross-unit sentiment summary
  - AI summary and chat interface
  - Filterable by study program
  - Response rate breakdown

### 0.3 Per-User Saved Charts
- [ ] **Add `user_id` column** to `saved_charts` table (or equivalent)
- [ ] **Charts default to private** — visible only to creating user
- [ ] **Add "Share to org" toggle** — flips `is_shared = true`, makes chart visible as "Featured" to all viewers
- [ ] **Microsoft SSO (Future)** — Add Supabase Azure AD provider once IT team approves app registration

---

## 🏗️ Phase 1: Main Functionality

- [ ] **Faculty Analysis Page** (`/executive/faculty` or `/faculty/[token]`): aggregated view across all units filtered by faculty/study program, with AI summary. Move Comprehensive Analysis here from unit pages.
- [ ] **Survey Management Page:** Edit survey name, year, and column-to-unit mappings after import. Add to sidebar above Organization Units.
- [ ] **Study Program / Faculty Hierarchy:** Establish strict parent-child DB architecture (`faculties` → `study_programs`). Manage in `/settings/organization`. Update import flow to flag unrecognized programs instead of auto-upserting.
- [ ] **Year-on-Year Comparison improvements:** Admin can set `year` field on surveys. Compare view already exists — improve with percentage-change arrows and trend lines.
- [ ] **Report Generation:** Downloadable PDF/DOCX from faculty, study program, and unit views.
- [ ] **Employee Satisfaction Index (ESI):** Long-term. Label surveys as SSI or ESI. Add ESI questionnaire schema. Allow filtering and comparison between types.
- [ ] **Improved AI Data Scientist:** Back-and-forth chart building, correlation discovery button, save refined charts to per-user saved charts.
- [ ] **Validity & Reliability Testing (Low Priority):** Pearson correlation per question, Cronbach's Alpha, Split-Half — show in report or manage page.

---

## 🛠️ Phase 2: Maintainability & Code Quality

- [x] **Split AnalysisContext into Control + Progress:** Done — `AnalysisControlContext` + `AnalysisProgressContext`
- [ ] **Split `ComprehensiveDashboard.tsx`:** 1,100+ line mega-component — decompose into SentimentOverview, QuantitativeMetrics, QualitativeBreakdown, ExecutiveReport, DrillDownDialog.
- [ ] **Extract respondent→input→segment traversal helper** to `lib/queryHelpers.ts` — currently copy-pasted in 5+ places with slightly different behavior.
- [ ] **TypeScript Strictness:** Replace `any` types with proper interfaces from `src/types/index.ts`.
- [ ] **Migrate analysis loop to Supabase Edge Function:** Eliminate browser-driven chatty batch loop.
- [ ] **Automated Testing:** Unit tests for API route validation, AI response parsing, and data transformation.
- [ ] **Database ERD:** Generate and maintain schema documentation.

---

## 🎨 Phase 3: UI/UX Polish

- [ ] **Dark Mode:** Audit remaining components for missing `dark:` variants.
- [ ] **Accessibility:** Audit color contrast on badges and alerts.

---

## 🐛 Known Bugs

### 1. Cache Build Network Instability
- **Symptom:** "Build Cache" fails with `ERR_NAME_NOT_RESOLVED` or `net::ERR_CONNECTION_CLOSED`
- **Cause:** Intermittent DNS/network loss to Supabase host
- **Workaround:** Check VPN/firewall, refresh and retry

### 2. Cache Build Has No Resume
- **Goal:** `buildUniqueValuesCache` should skip already-cached columns, allowing resume after failures

### 3. Validate AI Responses with Zod
- **Goal:** Add Zod validation on AI response shapes to prevent crashes from hallucinated output formats
