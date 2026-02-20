# Student Voice Platform — Pending Tasks

> **Status:** Active
> **Last Updated:** February 19, 2026

This document lists all pending tasks consolidated from previous audits.

## 🚨 Phase 1: High Priority (Security & Reliability)

### 1.1 Authentication & Authorization
- [ ] **Implement Supabase Auth:** Protect all routes; currently the app is open.
- [ ] **Row Level Security (RLS):** Apply policies to `raw_feedback_inputs`, `organization_units`, etc. so users can only access permitted data.

### 1.2 Data Integrity & Stability
- [ ] **Atomic Taxonomy Save:** Use a Supabase RPC function for saving categories to prevent data loss if a step fails.
- [ ] **Zod Validation:**
    - [x] Validate API Request Bodies (prevent bad inputs).
    - [ ] Validate AI Responses (prevent crashes from hallucinations).

---

## ⚡ Phase 2: Performance & Scalability

### 2.1 Optimization
- [x] **Fix N+1 Query in Survey Detail:** `src/app/surveys/[id]/page.tsx` fetches unit stats individually. Consolidated into a single query.
- [ ] **Fix Analysis Memory Bottleneck:** `AnalysisEngine.tsx` loads all IDs into memory. Use `count()` or server-side pagination.
- [ ] **Refamtory:** Remove "Raw Data" JSONB blob from `unit_ai_reports` table (store blueprint only, fetch data on demand).

### 2.2 Background Processing
- [ ] **Server-Side Job Management:** Move long-running analysis to background jobs (Edge Functions) so users can close the tab.

---

## 🧪 Phase 3: Code Quality & Testing

### 3.1 Testing
- [ ] **Setup Vitest:** Configure test runner.
- [ ] **Unit Tests:** Add tests for `lib/ai.ts` (parsing logic) and API routes.

### 3.2 Maintainability
- [ ] **TypeScript Strictness:** Import and use the types defined in `src/types/index.ts`.
- [ ] **Database Documentation:** Generate an ERD or schema documentation.

---

## 🎨 Phase 4: UI/UX Polish (Small Fixes)

### 4.1 Interface Refinements
- [x] **Replace `confirm()` with `AlertDialog`:** Native alerts are jarring; use the `shadcn/ui` component.
- [ ] **Dark Mode:** specific components need `dark:` variants.
- [ ] **Accessibility:** Audit color contrast (especially red/rose badges).

---

## 🚀 Phase 5: Future Features

### 5.1 Advanced Analysis
- [ ] **Cross-Unit Network Graph:** Visualize dependencies between units.
- [ ] **Taxonomy "Dirty State":** Flag comments that need re-analysis when categories change.
- [ ] **Trend Alerting:** Email notifications for sentiment drops.

### 5.2 Enterprise
- [ ] **Audit Logs:** Track who changed what.
- [ ] **RBAC:** Roles for Rector vs. Dean vs. Student Rep.
