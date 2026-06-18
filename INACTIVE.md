# Inactive / Deactivated Sections

During the final-polish pass (May 2026), one redundant section was deactivated rather than deleted, so it can be reviewed and either restored or permanently removed on the next pass.

Each entry below lists: **file → line range → what it was → why it's inactive → how to restore**.

---

## 1. Executive Insights — Suggestions tab — "Themes" subtab

- **File:** [src/components/executive/SuggestionHub.tsx](src/components/executive/SuggestionHub.tsx)
- **Flag:** `SHOW_THEMES_TAB` (set to `false` inside the component, ~line 71)
- **What it was:** A full subtab inside the Suggestions section showing all AI-detected suggestion themes with filters (unit, priority, search), a "Summarize Themes" AI button, and grouped theme rows.
- **Why deactivated:** User requested removal on 2026-05-28 during final-polish pass before a boss demo.
- **Restore:** Set `SHOW_THEMES_TAB = true` in `SuggestionHub.tsx` — the tab button and content block are both gated on this flag.
- **Permanent removal:** Delete the flag, the `if (!SHOW_THEMES_TAB && key === "themes") return null;` guard in the tab bar map, and the `{SHOW_THEMES_TAB && viewMode === "themes" ? (...) :` content block (replacing it with just the patterns ternary).

---

## Conventions

Future deactivations should follow the same pattern:

1. Add a typed boolean flag near the top of the file (e.g., `const SHOW_X: boolean = false;`).
2. Wrap the block with `{SHOW_X && ( ... )}`.
3. Add a banner comment above the block stating **what** it was and **why** it's inactive.
4. Append an entry to this file.

Avoid `{false && ( ... )}` directly — TypeScript narrowing can behave unexpectedly inside literal-false branches.
