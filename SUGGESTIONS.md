# Student Voice Platform: Improvement Roadmap

## 🚀 1. Immediate Feature Enhancements

### Drill-Down Interactivity
**Goal:** Allow users to click on charts to see the raw comments behind the data.
- **Action:** Add `onClick` handlers to Recharts (`<Bar />`, `<Pie />`) in `DynamicAnalytics.tsx`.
- **UI:** Open a side-sheet or modal displaying a filtered list of `raw_feedback_inputs` that match the clicked specialized data point (e.g., "Negative Sentiment" in "Facilities").

### Triage Desk for Suggestions
**Goal:** Operationalize the `is_suggestion: true` flag.
- **Action:** Create a new page/view (e.g., `/suggestions`) that queries only segments where `is_suggestion` is true.
- **UI:** Implement a Kanban board (To Do / In Progress / Done).
- **Logic:** allow assigning these suggestions to specific Units.

### Taxonomy "Dirty State"
**Goal:** Ensure analysis stays capable of handling changes in categories.
- **Action:** When `analysis_categories` are updated/saved in `CategorizationEngine`, flag related `raw_feedback_inputs` as "stale".
- **Logic:** Add a `needs_reanalysis` boolean to the `raw_feedback_inputs` table.

## 🛡️ 2. Architectural & Reliability Improvements

### Fix: Scalability Bottleneck in Analysis Engine
- **Problem:** `AnalysisEngine.tsx` loads ALL pending IDs into the browser memory to calculate progress. This will crash with large datasets (50k+).
- **Solution:** Use `supabase.count()` to get the total number of pending items instead of fetching the array of IDs. pagination should be handled server-side or via steady stream, not pre-loaded.

### Fix: Robust AI JSON Validation
- **Problem:** `run-analysis` and `generate-dashboard` blindly trust `JSON.parse()` from the AI response. If the AI hallucinates a key, the app crashes.
- **Solution:** Integrate **Zod** schema validation. Parse the AI response through a Zod schema. If it fails validation, catch the error and either retry the prompt or return a structured error to the UI.

### Fix: Atomic Transactions for Data Integrity
- **Problem:** saving `feedback_segments` and updating the `raw_feedback_input` status are separate operations. If one fails, data is out of sync.
- **Solution:** Use a Supabase **RPC function** (Postgres function) to perform the `INSERT` into segments and `UPDATE` of the raw input in a single atomic transaction.

### Fix: AI Prompt Injection Guardrails
- **Problem:** User instructions are inserted directly into the prompt. A malicious instruction could override system behavior.
- **Solution:** Sanitize user inputs. Wrap user instructions in strict delimiters (e.g., `<user_guidance>...</user_guidance>`) and instruct the System Prompt to treat that section purely as data/context, not as executable commands.

### Improvement: Server-Side Job Management
- **Problem:** Long-running analysis (10+ minutes) relies on the browser tab staying open.
- **Solution:** Move the analysis loop to a background job (e.g., Supabase Edge Functions with queues) or persist "Job State" in a database table (`analysis_jobs`). The frontend should simply poll this table for progress, allowing the user to close the tab and return later.

## 🔭 3. Strategic Vision & Reporting

### The "Cross-Unit" Report (Killer Feature)
**Goal:** Visualizing the inter-dependencies between units (e.g. Student Affairs complaints caused by Finance issues).
- **Action:** Build a Network Graph visualization.
- **Technical:** Aggregate `feedback_segments` where `related_unit_ids` is not null. Create a directed graph where nodes = Units and edges = volume of cross-referenced complaints.
- **Value:** Unique insight that standard tools cannot provide.

### The Global Dashboard (Executive View)
**Goal:** A high-level view for University Leadership (Rector/Deans).
- **Action:** Create a "Leaderboard" or "Heatmap" of all 20+ units side-by-side.
- **Technical:** Aggregated SQL query of sentiment scores across all units.
- **Value:** Essential for high-level decision making and comparing performance.

### Export to PDF/PPT
**Goal:** "Take-away" reports for offline presentations.
- **Action:** Implementation of a "Download Report" button.
- **Technical:** Use a library like `html2canvas` + `jspdf` to render the dashboard states into a static document.
- **Value:** Facilitates traditional meeting workflows.

## 🎨 4. UI/UX Vision (Polishing the Diamonds)

### Persistent Navigation (App Shell)
**Goal:** Seamless switching between Units, Dashboards, and Imports.
- **Problem:** Currently, navigation might feel disjointed or require clicking "Back" too often.
- **Solution:** Implementing a **Collapsible Sidebar Layout** (using `shadcn/ui` Sidebar component).
- **Structure:**
    - **Top:** Global Search ("Find a student comment...").
    - **Main:** "My Units" list (collapsible).
    - **Shortcuts:** "Quick Import", "Suggestions Inbox".
    - **Bottom:** User Profile & Settings.

### The "Empty State" Experience
**Goal:** Make the app friendly even when data is missing.
- **Current State:** Often shows a blank card or a simple spinner.
- **Vision:** Use "Skeleton Loaders" (simmering grey blocks) instead of spinners to reduce perceived wait time. When a list is empty, show a fun illustration (e.g., "All Quiet on Campus") with a clear Call-to-Action button to import data.

### Micro-Interactions & Feedback
**Goal:** Make the app feel "alive" and responsive.
- **Action:**
    - **Buttons:** Add `active:scale-95` to all buttons for a tactile "click" feel.
    - **Cards:** Add hover effects (`hover:shadow-lg`, `hover:border-blue-300`) to interactive cards.
    - **AI Status:** When Gemini is "Thinking", replace the spinner with a "Pulse" animation or a typewriter effect showing "Reading comments...", "Detecting sentiment...", "Finding patterns..." to keep the user engaged.

### Mobile Responsiveness
**Goal:** Allow Deans/Lecturers to check stats on their phone.
- **Action:** Ensure `grid-cols-1 md:grid-cols-2` is used everywhere. Convert large tables into "Card Views" on mobile screens. A table with 10 columns is unusable on an iPhone; a list of cards is beautiful.

### Color Theory & Accessibility
**Goal:** Professional and inclusive aesthetic.
- **Action:**
    - **Semantic Colors:** Ensure "Negative" isn't just Red, but a soft Rose color (`bg-rose-50 text-rose-700`) to be less alarming but still clear.
    - **Contrast:** Verify that text over colored badges has sufficient WCAG contrast.
    - **Dark Mode:** If not already robust, ensure all `bg-white` components have `dark:bg-slate-900` equivalents for night-time grading.

## 💰 5. Commercial Viability (Scale & Security)

### Enterprise SSO & RBAC (Role-Based Access)
**Goal:** Sell to large universities with strict IT policies.
- **Requirement:** Integrate with Microsoft Entra ID (Azure AD) or Google Workspace.
- **Feature:** Granular Permissions. A "Department Head" should ONLY see *their* unit. The "Rector" sees *everything*. The "Student Union Rep" sees *anonymized* data only.

### Audit Logs (Compliance)
**Goal:** "Who changed this category? Who deleted that comment?"
- **Requirement:** A tamper-proof log of every action.
- **Feature:** A `/admin/audit-logs` page showing `[User X] modified [Category Y] on [Date Z]`. This is mandatory for many government/education contracts.

### Whitelabeling / Multi-Tenancy
**Goal:** Sell the *Platform*, not just the Service.
- **Requirement:** Allow different Universities to use the same app instance but with their own Branding (Logo, Colors, Domain).
- **Feature:** A `universities` table in Supabase. The app checks the subdomain (`uph.studentvoice.com` vs `binus.studentvoice.com`) and loads the correct branding/data.

### "Trend Alerting" System
**Goal:** Passive value (The app works while you sleep).
- **Feature:** An email/Slack notification system.
- **Logic:** "Alert me if 'Safety' sentiment drops below 50% this week." or "Alert me if >10 students mention 'Fire Hazard'."
- **Value:** Turns the tool from a "Report Generator" into a "Crisis Prevention System."
