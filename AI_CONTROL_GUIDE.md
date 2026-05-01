# AI Agents Management & Pricing — How It Works

A practical guide to replicating the AI Control panel pattern in any Supabase + React app.

---

## The Big Picture

The system has three layers that talk to each other:

```
┌─────────────────────────────────────────────────────────┐
│  Frontend (React)                                        │
│  AIControlView — reads/writes platform_settings         │
│  Tabs: Agents | Model & Pricing | Usage                  │
└───────────────────┬─────────────────────────────────────┘
                    │ Supabase client
┌───────────────────▼─────────────────────────────────────┐
│  Supabase Database (PostgreSQL)                          │
│  platform_settings  — key/value config (model, pricing, │
│                        system prompt addendums)          │
│  ai_usage_logs      — one row per AI call               │
└───────────────────┬─────────────────────────────────────┘
                    │ service role (SUPABASE_SERVICE_ROLE_KEY)
┌───────────────────▼─────────────────────────────────────┐
│  Edge Functions (Deno TypeScript)                        │
│  Each function reads platform_settings on every call    │
│  Calls the AI provider, extracts token counts,          │
│  writes one row to ai_usage_logs (fire-and-forget)      │
└─────────────────────────────────────────────────────────┘
```

---

## Step 1 — Database Tables

### `platform_settings` — the config store

A simple key/value table. All runtime configuration lives here so you can change it without redeploying.

```sql
CREATE TABLE platform_settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- RLS: only the owner can read/write
ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_all" ON platform_settings
  FOR ALL USING (get_my_role() = 'owner');
```

Keys used in this system:

| Key | Value type | Purpose |
|---|---|---|
| `default_model` | string | Model ID used by all AI functions e.g. `"gemini-2.5-flash"` |
| `token_pricing` | JSON string | Per-model pricing rates (overrides hardcoded defaults) |
| `prompt_addendum_<function-id>` | string | Extra instructions appended to a specific function's system prompt |

### `ai_usage_logs` — one row per AI call

```sql
CREATE TABLE ai_usage_logs (
  id                 BIGSERIAL PRIMARY KEY,
  institution_id     UUID,
  user_id            UUID,
  function_name      TEXT NOT NULL,
  model_id           TEXT NOT NULL,
  provider           TEXT NOT NULL,       -- 'gemini' | 'openai' | 'anthropic'
  input_tokens       INT  DEFAULT 0,
  output_tokens      INT  DEFAULT 0,
  total_tokens       INT  DEFAULT 0,
  estimated_cost_usd NUMERIC(12, 8) DEFAULT 0,
  created_at         TIMESTAMPTZ DEFAULT now()
);

-- Indexes for fast dashboard queries
CREATE INDEX ON ai_usage_logs (institution_id);
CREATE INDEX ON ai_usage_logs (created_at DESC);
CREATE INDEX ON ai_usage_logs (function_name);

-- RLS: owner can read all, edge functions bypass via service role
ALTER TABLE ai_usage_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_read" ON ai_usage_logs
  FOR SELECT USING (get_my_role() = 'owner');
-- INSERT is done by edge functions using service role key, which bypasses RLS
```

---

## Step 2 — Edge Function Pattern

Every AI edge function follows the same pattern. Here's the full template:

### 2a. Detect provider from model ID

The model ID string encodes which provider to call. No separate config needed.

```typescript
function detectProvider(modelId: string): "gemini" | "openai" | "anthropic" {
  if (modelId.startsWith("gemini-"))                        return "gemini";
  if (modelId.startsWith("claude-"))                        return "anthropic";
  if (modelId.startsWith("gpt-") || modelId.startsWith("o")) return "openai";
  return "gemini"; // fallback
}
```

### 2b. Read `default_model` and `prompt_addendum` from DB at call time

This is the key insight: **never hardcode the model ID**. Read it fresh on every call so the owner can switch models from the UI without redeploying.

```typescript
const { data: psRows } = await supabaseAdmin
  .from("platform_settings")
  .select("key, value")
  .in("key", ["default_model", "prompt_addendum_my-function-name"]);

const psMap = Object.fromEntries((psRows ?? []).map((r: any) => [r.key, r.value]));
const model_id = psMap["default_model"] ?? "gemini-2.5-flash";
const addendum  = (psMap["prompt_addendum_my-function-name"] ?? "").trim();
```

Then append the addendum to the system prompt if present:

```typescript
const systemPrompt = BASE_SYSTEM_PROMPT + (addendum ? `\n\n${addendum}` : "");
```

### 2c. Token pricing table (hardcoded in each function as fallback)

```typescript
const TOKEN_PRICING: Record<string, { input: number; output: number }> = {
  "gemini-2.5-flash":          { input: 0.075,  output: 0.30   },
  "gemini-2.5-flash-lite":     { input: 0.018,  output: 0.072  },
  "gemini-2.5-pro":            { input: 1.25,   output: 10.00  },
  "gpt-4o":                    { input: 2.50,   output: 10.00  },
  "claude-opus-4-7":           { input: 15.00,  output: 75.00  },
  "claude-sonnet-4-6":         { input: 3.00,   output: 15.00  },
  "claude-haiku-4-5-20251001": { input: 0.80,   output: 4.00   },
  // All prices in USD per 1 million tokens
};

function estimateCost(modelId: string, inputTokens: number, outputTokens: number): number {
  const rates = TOKEN_PRICING[modelId] ?? { input: 0, output: 0 };
  return (inputTokens * rates.input + outputTokens * rates.output) / 1_000_000;
}
```

> **Note:** The owner-editable pricing in `platform_settings.token_pricing` is read by the frontend dashboard for display. The edge functions use the hardcoded table for cost estimation at call time. You could also read from DB if you want the two to stay perfectly in sync, but it's an extra query on every call.

### 2d. Extract token counts (each provider uses different field names)

```typescript
function extractTokensFromUsage(
  provider: string,
  usage: any
): { inputTokens: number; outputTokens: number } {
  if (!usage) return { inputTokens: 0, outputTokens: 0 };

  if (provider === "gemini")    return {
    inputTokens:  usage.promptTokenCount     ?? 0,
    outputTokens: usage.candidatesTokenCount ?? 0,
  };
  if (provider === "openai")    return {
    inputTokens:  usage.prompt_tokens        ?? 0,
    outputTokens: usage.completion_tokens    ?? 0,
  };
  if (provider === "anthropic") return {
    inputTokens:  usage.input_tokens         ?? 0,
    outputTokens: usage.output_tokens        ?? 0,
  };

  return { inputTokens: 0, outputTokens: 0 };
}
```

Where does `usage` come from?

- **Gemini**: `response.usageMetadata` from the Gemini REST API response
- **OpenAI**: `response.usage` from the chat completions response
- **Anthropic**: `response.usage` from the messages response

### 2e. `logUsage` — fire and forget

Call this after the AI response comes back. It must **not** block the response to the user.

```typescript
function logUsage(
  client: any,   // supabaseAdmin
  params: {
    institution_id: string | null;
    user_id:        string | null;
    function_name:  string;
    model_id:       string;
    provider:       string;
    input_tokens:   number;
    output_tokens:  number;
  }
): void {
  const total = params.input_tokens + params.output_tokens;
  const cost  = estimateCost(params.model_id, params.input_tokens, params.output_tokens);

  client
    .from("ai_usage_logs")
    .insert({
      institution_id:     params.institution_id,
      user_id:            params.user_id,
      function_name:      params.function_name,
      model_id:           params.model_id,
      provider:           params.provider,
      input_tokens:       params.input_tokens,
      output_tokens:      params.output_tokens,
      total_tokens:       total,
      estimated_cost_usd: cost,
    })
    .then(() => {})
    .catch((e: any) => console.error("logUsage error:", e));
  // .then().catch() makes it non-blocking — the function returns without waiting
}
```

### 2f. Putting it together in the main handler

```typescript
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();

    // 1. Read config from DB
    const { data: psRows } = await supabaseAdmin
      .from("platform_settings")
      .select("key, value")
      .in("key", ["default_model", "prompt_addendum_my-function"]);
    const psMap    = Object.fromEntries((psRows ?? []).map((r: any) => [r.key, r.value]));
    const model_id = psMap["default_model"] ?? "gemini-2.5-flash";
    const addendum = (psMap["prompt_addendum_my-function"] ?? "").trim();
    const provider = detectProvider(model_id);

    // 2. Build prompt
    const systemPrompt = BASE_PROMPT + (addendum ? `\n\n${addendum}` : "");

    // 3. Call AI (your existing call logic here)
    const { result, usage } = await callAI(provider, model_id, systemPrompt, body.userInput);

    // 4. Log usage — fire and forget, do NOT await
    const { inputTokens, outputTokens } = extractTokensFromUsage(provider, usage);
    logUsage(supabaseAdmin, {
      institution_id: body.institution_id ?? null,
      user_id:        body.user_id ?? null,
      function_name:  "my-function",
      model_id, provider, input_tokens: inputTokens, output_tokens: outputTokens,
    });

    // 5. Return result immediately
    return new Response(JSON.stringify({ result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
```

---

## Step 3 — Frontend Management Page

### Structure: three tabs

```
AIControlView
├── AgentsTab      — registry of all functions, system prompts, addendum editors
├── ModelPricingTab — global model picker + editable pricing table
└── UsageTab       — charts and tables from ai_usage_logs
```

### Tab 1: Agents

The agent registry is just a JavaScript array defined at the top of the component. Each entry describes one edge function:

```jsx
const AGENT_REGISTRY = [
  {
    id:              "grade-essay",
    name:            "Essay Grader",
    type:            "ai",             // "ai" | "infra"
    provider:        "multi",          // "multi" | "gemini-only" | "none"
    trigger:         "Teacher clicks 'Grade' on a submission",
    purpose:         "Grades student essays against a rubric using AI",
    supportsAddendum: true,            // whether this function reads prompt_addendum_<id>
    sourceFile:      "supabase/functions/grade-essay/index.ts",
    systemPrompt:    `You are an expert grader...`,  // the base system prompt
  },
  // ...one entry per function
];
```

The addendum editor saves to `platform_settings` immediately on blur:

```jsx
// Save addendum to DB
const { error } = await supabase
  .from("platform_settings")
  .upsert({ key: `prompt_addendum_${agentId}`, value: text }, { onConflict: "key" });
```

The edge function picks it up on the very next call — no redeploy needed.

### Tab 2: Model & Pricing

**Model picker** — reads and writes `platform_settings.default_model`:

```jsx
// Load
const { data } = await supabase
  .from("platform_settings")
  .select("value")
  .eq("key", "default_model")
  .maybeSingle();
const model = data?.value ?? "gemini-2.5-flash";

// Save
await supabase
  .from("platform_settings")
  .upsert({ key: "default_model", value: selectedModel }, { onConflict: "key" });
```

Since edge functions read `platform_settings` on every call, this takes effect immediately for all subsequent AI calls — no redeploy.

**Pricing table** — reads and writes `platform_settings.token_pricing` as a JSON string:

```jsx
// Load
const raw  = psMap["token_pricing"];
const saved = raw ? JSON.parse(raw) : {};
// Merge saved values over hardcoded defaults so new models auto-appear
const pricing = { ...DEFAULT_PRICING, ...saved };

// Save
await supabase
  .from("platform_settings")
  .upsert(
    { key: "token_pricing", value: JSON.stringify(pricing) },
    { onConflict: "key" }
  );
```

The pricing table is displayed as an editable grid — one row per model, two number inputs (input rate, output rate). The owner can update it when providers change their prices.

### Tab 3: Usage Dashboard

Reads from `ai_usage_logs` filtered by time range. No real-time subscription — fetches fresh on every tab open (the component unmounts when you switch tabs, so `useEffect` runs from scratch each time):

```jsx
function UsageTab() {
  const [logs, setLogs]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState({ label: "30 days", days: 30 });

  useEffect(() => {
    setLoading(true);
    let query = supabase
      .from("ai_usage_logs")
      .select("id, function_name, model_id, provider, input_tokens, output_tokens, total_tokens, estimated_cost_usd, created_at")
      .order("created_at", { ascending: false })
      .limit(5000);

    if (timeRange.days !== null) {
      const since = new Date(Date.now() - timeRange.days * 86400_000).toISOString();
      query = query.gte("created_at", since);
    }

    query.then(({ data }) => { setLogs(data ?? []); setLoading(false); });
  }, [timeRange]);

  // Aggregate client-side — no extra DB queries
  const totalCost = logs.reduce((s, r) => s + (r.estimated_cost_usd ?? 0), 0);
  const byFunction = Object.values(
    logs.reduce((acc, r) => {
      acc[r.function_name] ??= { name: r.function_name, calls: 0, cost: 0 };
      acc[r.function_name].calls++;
      acc[r.function_name].cost += r.estimated_cost_usd ?? 0;
      return acc;
    }, {})
  );

  // Render summary cards + bar chart + tables...
}
```

---

## Step 4 — Adapting to a New App (Checklist)

1. **Create the two tables** — `platform_settings` and `ai_usage_logs` with the SQL above. Add RLS.

2. **Add the three helper functions to each edge function:**
   - `detectProvider(modelId)`
   - `extractTokensFromUsage(provider, usage)`
   - `estimateCost(modelId, input, output)`
   - `logUsage(client, params)` — call after every AI response, no await

3. **Replace hardcoded model IDs** — everywhere you wrote `"gemini-2.5-flash"`, replace with a `platform_settings` read at the top of the handler.

4. **Add addendum support** — read `prompt_addendum_<your-function-id>` from `platform_settings` alongside `default_model`. Append to system prompt if non-empty.

5. **Build the registry array** — one object per edge function describing its purpose, trigger, system prompt, and whether it supports addendums. This is just a JS array in the frontend component; nothing in the DB.

6. **Build the three-tab frontend page** — AgentsTab reads the registry array and renders cards with the addendum editor. ModelPricingTab reads/writes `platform_settings`. UsageTab queries `ai_usage_logs`.

7. **Gate the page to owner-only** — via a route guard (RLS on `platform_settings` handles the DB side; the route guard handles the UI side).

---

## Why This Design Works Well

| Decision | Why |
|---|---|
| `platform_settings` as a key/value table | Zero-migration config changes. Add a new setting by just inserting a new row. |
| Edge functions read model at call time | Model switches take effect instantly with no redeploy. |
| `logUsage` is fire-and-forget | Never slows down the user's AI response, even if the DB write fails. |
| Token pricing hardcoded in edge functions | Cost estimation works even if `platform_settings.token_pricing` hasn't been set. |
| Registry is a frontend array, not a DB table | No schema needed for agent metadata. Easy to add new agents without migrations. |
| Component unmounts on tab switch | Usage tab always fetches fresh data when opened — free refresh with no polling cost. |

---

## What This Doesn't Do (Yet)

- **Budget enforcement** — logs are written but no edge function checks a budget limit before running. You'd add a check like: `if (monthlySpend > budget) throw new Error("Budget exceeded")`.
- **Per-user or per-institution token limits** — currently all usage is global. Add `institution_id` filtering to enforce per-institution budgets.
- **Real-time usage** — the Usage tab is a snapshot, not a live stream. For real-time you'd need Supabase Realtime subscriptions on `ai_usage_logs`.
- **Per-function model overrides** — currently one global model for all functions. You could add `model_override_<function-id>` keys to `platform_settings` to support per-function model selection.
