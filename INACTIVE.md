# Inactive / Deactivated Sections

During the final-polish pass (May 2026), one redundant section was deactivated rather than deleted, so it can be reviewed and either restored or permanently removed on the next pass.

Each entry below lists: **file → line range → what it was → why it's inactive → how to restore**.

---

## 1. Executive Insights — "Insights" tab hero strip

- **File:** [src/app/executive/page.tsx](src/app/executive/page.tsx)
- **Flag:** `SHOW_INSIGHTS_HERO_STRIP` (set to `false` near the top of the component, ~line 60)
- **Block location:** inside the `<TabsContent value="insights">` content, immediately after the `TabsList`.
- **What it was:** A dark gradient hero showing five tiles — Overall Sentiment Score (giant `text-8xl`), Feedback (comment count), Issues (negative count), Active Units, NPS.
- **Why deactivated:**
  - The Summary tab already shows the same headline numbers (SSI Score, Sentiment Score, NPS, Respondents) in a more polished hero strip with the same dark gradient.
  - Users who land on Executive Insights see the Summary tab first by default, so the second hero on the Insights tab was visual repetition without new information.
  - The `text-8xl` score size was also the only spot in the app reaching that scale, breaking typographic consistency.
- **What still renders on the Insights tab:** Category Intelligence (Praises/Issues radars), Action Priority Matrix, Sentiment-by-Unit heatmap, Shared Categories. None of those duplicate the Summary tab.
- **Restore:** Flip `SHOW_INSIGHTS_HERO_STRIP` to `true`, or delete the wrapping `{SHOW_INSIGHTS_HERO_STRIP && (...)}` to make the hero permanent.
- **Permanent removal:** Delete the entire `{SHOW_INSIGHTS_HERO_STRIP && (...)}` block (including the banner comment above it), plus the `SHOW_INSIGHTS_HERO_STRIP` constant declaration.

---

## Conventions

Future deactivations should follow the same pattern:

1. Add a typed boolean flag near the top of the file (e.g., `const SHOW_X: boolean = false;`).
2. Wrap the block with `{SHOW_X && ( ... )}`.
3. Add a banner comment above the block stating **what** it was and **why** it's inactive.
4. Append an entry to this file.

Avoid `{false && ( ... )}` directly — TypeScript narrowing can behave unexpectedly inside literal-false branches.
