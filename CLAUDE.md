# Satisfaction Voice — Developer Notes for Claude

## Project
Next.js 14 app (Turbopack, TypeScript, Tailwind). Supabase backend.
Live at **satisfactionvoice.com**. Auth via Supabase email/password, UPH (@uph.edu) emails only.

---

## Critical: Supabase 1000-row limit

**Supabase silently truncates query results to 1000 rows.** This causes undercounting in any aggregate that fetches segments, inputs, or respondents without pagination.

### Rule
Every Supabase query that could return more than 1000 rows **must** paginate with `.range(from, to)`.

### Correct pattern for fetching inside a `batchIn` chunk

```ts
async chunk => {
    const all: MyType[] = [];
    let from = 0;
    while (true) {
        const { data } = await supabase
            .from("some_table")
            .select("col_a, col_b")
            .in("foreign_id", chunk)
            .range(from, from + PAGE - 1); // PAGE = 1000
        if (!data?.length) break;
        all.push(...(data as MyType[]));
        if (data.length < PAGE) break;
        from += PAGE;
    }
    return all;
}
```

### Where this has already been applied
- `src/app/api/faculty-insights/categories/route.ts` — segments fetch
- `src/app/api/faculty-insights/comments/route.ts` — inputs fetch + segments fetch
- `src/components/analysis/ComprehensiveDashboard.tsx` — respondents fetch (uses `fetchByRespondentChunks` which paginates internally)

### Where to check first if counts look wrong
If any count, category aggregate, or comment total looks lower than expected, look for a Supabase query that:
- Uses `.in("id", largeArray)` without `.range()`
- Is inside a `batchIn()` fetcher without a pagination loop

---

## Design language
- **Light mode always.** Page bg: `bg-slate-50`. Cards: `bg-white border border-slate-200 rounded-2xl shadow-sm` with a `h-1 bg-gradient-to-r from-blue-500 to-indigo-500` top accent stripe.
- Buttons: solid `bg-blue-600 hover:bg-blue-500` — no gradient buttons.
- Labels: `text-[11px] font-semibold text-slate-400 uppercase tracking-widest`.
- No dark full-screen hero gradients, glass/backdrop-blur cards, or playful styles for in-app pages.
- Match the homepage (`src/app/page.tsx`) as the style reference.

---

## Auth flow
- Signup → Supabase sends confirmation email → user clicks link → `/auth/callback` verifies OTP, signs user out, redirects to `/login?confirmed=true`.
- Supabase redirect URL allowlist must include `https://satisfactionvoice.com/**`.
- `emailRedirectTo` uses `window.location.origin` so it works on both localhost and production.

---

## Sentiment score formula
`pos% × 1 + neu% × 0.5 + neg% × 0` → 0–100 score.
Benchmarks (unit page): ≥70 excellent · 40–69 moderate · <40 needs focus.
Benchmarks (executive): ≥60 healthy · 40–59 mixed · <40 critical.

## NPS formula
% promoters (9–10) minus % detractors (0–6), range −100 to +100.
Benchmarks: ≥50 excellent · 0–49 good · <0 concern.
