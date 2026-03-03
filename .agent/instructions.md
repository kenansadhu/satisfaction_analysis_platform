---
description: Onboarding instructions for any AI agent working on this codebase
---

# AI Agent Instructions — Student Voice Platform

## 🚨 MANDATORY First Step

Before making ANY code changes, you MUST read the following file completely:

**📄 `ARCHITECTURE.md`** (in the project root)

This file contains:
- Complete database schema
- Full directory structure with descriptions
- Core data flows (CSV import → AI analysis → dashboards)
- Architecture rules you MUST follow
- Known issues and technical debt

## Key Rules

1. **Always update `ARCHITECTURE.md`** after making changes (update relevant sections + add changelog entry)
2. **Search before creating** — check ARCHITECTURE.md and existing code before making new functions
3. **Follow the data access pattern** — always filter by `respondent_id` for survey-scoped queries, use chunked `IN` clauses (max 400 IDs)
4. **Don't break existing flows** — the 4 data flows in ARCHITECTURE.md Section 4 are critical
5. **Check `PENDING_TASKS.md`** for the current roadmap and priorities

## Quick Reference

- **AI calls**: Always go through `src/lib/ai.ts` → `callGemini()`
- **Validation**: Zod schemas in `src/lib/validators.ts`
- **Types**: `src/types/index.ts`
- **State**: `SurveyContext` (active survey) + `AnalysisContext` (batch analysis lifecycle)
- **UI primitives**: `src/components/ui/` (Shadcn/Radix)
