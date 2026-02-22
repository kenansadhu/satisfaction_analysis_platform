# Student Voice Platform — Pending Tasks

> **Status:** Active
> **Last Updated:** February 19, 2026

This document lists all pending tasks consolidated from previous audits.


---
### Phase 1: Functionality
- [ ] **Better Analysis:** In /executive, build a different views for study programs (being able to see the results from multiple units), faculties (see results from multiple units in the study programs in its faculty), and view for each unit (what does the students say about each unit, broken down by study programs). These pages should have AI which will be able to interpret the data and give insights. Maybe the '4. Comprehensive Analysis' from the survey page can be moved to this new page under /executive.
- [ ] **Improved year on year comparison**: one of the most important things is to be able to compare the results from year to year. Add a feature to compare the results from year to year. In the survey information in the database, include the year of the survey. Give the ability for admin to edit survey name, information, and year. In the executive page, add a feature to compare the results from year to year. Ask developer about the things to compare.
- [ ] **Report Generation:** From these different views (faculty, study program, units), generate a report that can be downloaded. Ask user about what are the things usually are included in the yearly survey report, add database schema of the things that we don't have yet (on the top of my mind, it is the number of students in the university in each faculty, to see how many percent of students in each faculty responded to the survey).
- [ ] **Include Employee satisfaction Index (ESI) Questionnaire:** This is a long(er) term improvement. Currently, this platform is only for student satisfaction index (SSI). We should also include employee satisfaction index. The questionnaire is already available, we just need to add it to the database and the platform. Ask developer about the csv schema of the ESI, and see how things can be combined/compared. Ensure that each survey data is labeled correctly (SSI or ESI), so that we can filter and compare them correctly.
---

### Phase 2: Maintainability
- [ ] **TypeScript Strictness:** Import and use the types defined in `src/types/index.ts`.
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
