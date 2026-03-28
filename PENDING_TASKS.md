# Student Voice Platform — Pending Tasks

> **Status:** Active
> **Last Updated:** March 13, 2026

This document lists all pending tasks consolidated from previous audits.


---
### Phase 1: Main Functionality
- [ ] **Better Analysis:** In /executive, build a different views for study programs (being able to see the results from multiple units), faculties (see results from multiple units in the study programs in its faculty), and view for each unit (what does the students say about each unit, broken down by study programs). These pages should have AI which will be able to interpret the data and give insights. Maybe the '4. Comprehensive Analysis' from the survey page can be moved to this new page under /executive.
- [ ] **Ability to edit survey information:** In the import process, we have the ability to categorize the columns as belongings of different units or faculties. However, we can't edit this information after the survey is imported. make a survey management page where we can do this, put it on top of the organization unit in the sidebar.
- [ ] **Analyze data for Study Programs:** Establish a strict parent-child database architecture consisting of `faculties` mapped to `study_programs` (foreign key constraint). These should be manually managed in a master `/settings/organization` page. Update the CSV import flow to manually flag and map unrecognized study programs/faculties instead of auto-upserting them. With this data strictness in place, the dashboard can safely aggregate multi-unit analysis views exclusively filtered by Study Program.
- [ ] **Improved year on year comparison**: one of the most important things is to be able to compare the results from year to year. Add a feature to compare the results from year to year. In the survey information in the database, include the year of the survey. Give the ability for admin to edit survey name, information, and year. In the executive page, add a feature to compare the results from year to year. Ask developer about the things to compare.
- [ ] **Report Generation:** From these different views (faculty, study program, units), generate a report that can be downloaded. Ask user about what are the things usually are included in the yearly survey report, add database schema of the things that we don't have yet (on the top of my mind, it is the number of students in the university in each faculty, to see how many percent of students in each faculty responded to the survey).
- [ ] **Include Employee satisfaction Index (ESI) Questionnaire:** This is a long(er) term improvement. Currently, this platform is only for student satisfaction index (SSI). We should also include employee satisfaction index. The questionnaire is already available, we just need to add it to the database and the platform. Ask developer about the csv schema of the ESI, and see how things can be combined/compared. Ensure that each survey data is labeled correctly (SSI or ESI), so that we can filter and compare them correctly.
- [ ] **Improved AI Data Scientist:** In here, we have to think revolutionary stuff. In the 'Discover Connection' part, I want the AI to be able to have a back and forth conversation about the user in building each graph, in finding connections, etc. The data used must be able to be shown clearly to the user (highly verifiable), and all the data must be sourced from the data, none should be hardcoded in the code. I also want this feature for the AI Data Scientist: There should be a button that finds the correlation of all the qualitative and quantitative variables within each unit OR between all units, and then show it to the user. Then, there's another button for the AI to find meaningful connections, and suggest it to the user. Again, back and forth process, including when the graph is made, the user can also suggest an improvement to the graph and the AI will implement the changes and confirm it to the user. Then, we can save the chart we liked in the 'saved charts'. Again, the chart needs to be online so when there's a change in the data, it can automatically refresh.
- [ ] **Validity & Reliability Testing (Low Priority):** Since we import raw survey data, we can compute validity tests (Pearson correlation per question) and reliability tests (Cronbach's Alpha, Split-Half) directly from the data. Add a section in the report or manage page to auto-calculate and display these statistics.
---

### Phase 2: Maintainability & Code Quality
- [x] **Move Client-Side Aggregation to Database:** (Completed for Survey Detail dashboard) Implemented Hybrid Aggregation via RPC and sequential batching to handle 8.6k+ rows without timeouts.
- [ ] **Fix AnalysisContext Re-render Bloat:** Every log/progress update in `AnalysisContext.tsx` re-renders all subscribed components. Consider splitting into separate contexts (progress vs. controls) or using a more granular state manager like Zustand.
- [ ] **Fix AnalysisContext Re-render Bloat:** Every log/progress update in `AnalysisContext.tsx` re-renders all subscribed components. Consider splitting into separate contexts (progress vs. controls) or using a more granular state manager like Zustand.
- [ ] **TypeScript Strictness:** Import and use the types defined in `src/types/index.ts`. Replace all `any` types in component states, API responses, and Zod schemas (`z.any()`) with proper interfaces.
- [ ] **Migrate Analysis logic to Supabase Edge Functions:** Currently, the analysis process relies on the client (browser) to drive a "chatty" loop of 50-item batches, leading to 10+ DB calls per batch across the network. Move the `process-queue` logic to a standalone Supabase Edge Function to minimize latency, eliminate browser dependency, and improve overall system reliability.
- [ ] **Split `ComprehensiveDashboard.tsx`:** At 1,131 lines (83KB), this mega-component should be decomposed into 5+ focused sub-components (e.g., SentimentOverview, QuantitativeMetrics, QualitativeBreakdown, ExecutiveReport, DrillDownDialog).
- [ ] **Automated Testing:** Add unit tests for critical paths — API route validation, AI response parsing, data transformation logic, and component rendering.
- [ ] **Database Documentation:** Generate an ERD or schema documentation.

---

## 🎨 Phase 3: UI/UX Polish (Small Fixes)

### 4.1 Interface Refinements
- [x] **Replace `confirm()` with `AlertDialog`:** Native alerts are jarring; use the `shadcn/ui` component.
- [ ] **Dark Mode:** specific components need `dark:` variants.
- [ ] **Accessibility:** Audit color contrast (especially red/rose badges).

---

## 🚨 Phase 3: High Priority (Security & Reliability)

### 3.1 Authentication & Authorization
- [ ] **Implement Supabase Auth:** Protect all routes; currently the app is open.
- [ ] **Row Level Security (RLS):** Apply policies to `raw_feedback_inputs`, `organization_units`, etc. so users can only access permitted data.

### 3.2 Data Integrity & Stability
- [ ] **Atomic Taxonomy Save:** Use a Supabase RPC function for saving categories to prevent data loss if a step fails.
- [ ] **Zod Validation:**
    - [x] Validate API Request Bodies (prevent bad inputs).
    - [ ] Validate AI Responses (prevent crashes from hallucinations).

### 3.3 Enterprise
- [ ] **Audit Logs:** Track who changed what.
- [ ] **RBAC:** Roles for Rector vs. Dean vs. Student Rep.
    - *Critical:* Strictly restrict adding/removing Surveys and Organization Units to the Super Admin. Deletion cascades across the entire database, preventing regular admins from making irreversible destructive actions.

---

## 🐛 Bugs

### 1. Caching Instability & Network Errors
- **Description:** The "Build Cache" process frequently stalls or fails with `ERR_NAME_NOT_RESOLVED` and `net::ERR_CONNECTION_CLOSED` errors. 
- **Cause:** This is a DNS/Network connection issue to the Supabase domain (`axfeurjlxvqsrimpzeis.supabase.co`). While the project is active, the browser or local machine is intermittently losing the ability to resolve the host.
- **Workaround:** Ensure no VPN/Firewall is blocking Supabase. If it fails, refresh and try again.

### 2. Cache Build Lack of Resume
- **Description:** Clicking "Build Cache" always restarts from column 1/116.
- **Goal:** Modify `buildUniqueValuesCache` to check if a column is already cached in `survey_column_cache` and skip it, allowing for a "resume" behavior after network failures.
### 3. Qualitative Count Inflation & Data Cleanup (Survey 6)
- **Problem:** Some units (e.g., Layanan Keuangan) show inflated qualitative counts (77k+ items). 
- **Cause:** Quantitative rating columns in Survey 6 were imported with `requires_analysis = true`.
- **Solution:** 
    - [ ] **Refine Code Logic:** Update `page.tsx` and `route.ts` to filter by `requires_analysis = true AND is_quantitative = false`.
    - [ ] **Optimize RPC:** Update `get_respondent_group_counts` to use the same consolidated logic.
    - [ ] **Data Cleanup:** Run `cleanup_survey_6.js` (to be created) to set `requires_analysis = false` for all quantitative items in Survey 6.
