import { GoogleGenerativeAI } from "@google/generative-ai";
import { supabaseServer } from "@/lib/supabase-server";

// --- Constants ---
export const AI_MODEL = process.env.AI_MODEL || "gemini-2.5-flash";
const MAX_INPUT_LENGTH = 50000;

export const GEMINI_MODELS = [
    { id: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite", description: "Fastest & cheapest — for simple classification tasks", inputRate: 0.018, outputRate: 0.072, tier: "fast" },
    { id: "gemini-2.5-flash",      label: "Gemini 2.5 Flash",      description: "Fast & balanced — recommended for most analysis",       inputRate: 0.075, outputRate: 0.30,  tier: "balanced" },
    { id: "gemini-2.5-pro",        label: "Gemini 2.5 Pro",        description: "Highest quality reasoning — complex reports & analysis", inputRate: 1.25,  outputRate: 10.00, tier: "pro" },
];

const TOKEN_PRICING: Record<string, { input: number; output: number }> = {
    "gemini-2.5-flash-lite": { input: 0.018, output: 0.072 },
    "gemini-2.5-flash":      { input: 0.075, output: 0.30  },
    "gemini-2.5-pro":        { input: 1.25,  output: 10.00 },
};

// --- Sanitization (Prompt Injection Guard) ---
function sanitizeUserInput(input: string): string {
    return input.replace(/<\/?[^>]+(>|$)/g, "").trim();
}

export function wrapUserData(data: unknown): string {
    const serialized = typeof data === "string" ? data : JSON.stringify(data);
    const sanitized = sanitizeUserInput(serialized);
    const truncated = sanitized.length > MAX_INPUT_LENGTH
        ? sanitized.slice(0, MAX_INPUT_LENGTH) + "... [TRUNCATED]"
        : sanitized;
    return `<user_data>\n${truncated}\n</user_data>`;
}

// --- Platform Settings ---
// Reads default_model, model_override_<id>, and prompt_addendum_<id> from DB.
// Falls back to AI_MODEL constant if the table doesn't exist yet.
export async function getAgentSettings(functionId: string): Promise<{ modelId: string; addendum: string }> {
    try {
        const { data } = await supabaseServer
            .from("platform_settings")
            .select("key, value")
            .in("key", ["default_model", `model_override_${functionId}`, `prompt_addendum_${functionId}`]);
        const map = Object.fromEntries((data ?? []).map((r: any) => [r.key, r.value]));
        return {
            modelId: map[`model_override_${functionId}`] || map["default_model"] || AI_MODEL,
            addendum: (map[`prompt_addendum_${functionId}`] ?? "").trim(),
        };
    } catch {
        return { modelId: AI_MODEL, addendum: "" };
    }
}

// --- Usage Logging ---
function estimateCost(modelId: string, inputTokens: number, outputTokens: number): number {
    const rates = TOKEN_PRICING[modelId] ?? { input: 0, output: 0 };
    return (inputTokens * rates.input + outputTokens * rates.output) / 1_000_000;
}

function logUsage(params: { functionName: string; modelId: string; inputTokens: number; outputTokens: number }): void {
    const cost = estimateCost(params.modelId, params.inputTokens, params.outputTokens);
    // Fire-and-forget: never blocks the response to the user
    supabaseServer
        .from("ai_usage_logs")
        .insert({
            function_name: params.functionName,
            model_id:       params.modelId,
            input_tokens:   params.inputTokens,
            output_tokens:  params.outputTokens,
            total_tokens:   params.inputTokens + params.outputTokens,
            estimated_cost_usd: cost,
        })
        .then(() => {})
        .catch((e: any) => console.error("[logUsage] error:", e));
}

// --- Core AI Call ---
export async function callGemini(
    prompt: string,
    options: {
        jsonMode?: boolean;
        model?: string;
        functionId?: string; // if set, logs token usage to ai_usage_logs
    } = {}
): Promise<unknown> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new AIError("GEMINI_API_KEY is not configured. Check your .env.local file.", 500);
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const modelId = options.model || AI_MODEL;
    const model = genAI.getGenerativeModel({ model: modelId });

    const generationConfig: Record<string, unknown> = {};
    if (options.jsonMode !== false) {
        generationConfig.responseMimeType = "application/json";
    }

    const maxRetries = 3;
    let attempt = 0;
    let delay = 1000;
    let result: any;

    while (attempt < maxRetries) {
        try {
            result = await model.generateContent({
                contents: [{ role: "user", parts: [{ text: prompt }] }],
                generationConfig,
            });
            break;
        } catch (error: any) {
            attempt++;
            const isRetryable = error?.status === 429 || error?.status >= 500 || error?.message?.includes("fetch failed") || error?.message?.includes("429");
            if (isRetryable && attempt < maxRetries) {
                console.warn(`[Gemini API] Retrying attempt ${attempt}... waiting ${delay}ms`);
                await new Promise(res => setTimeout(res, delay));
                delay *= 2;
            } else {
                console.error(`[Gemini API] Failed after ${attempt} attempts:`, error);
                throw new AIError(`Gemini Generation Failed: ${error.message || 'Unknown error'}`, error?.status || 500);
            }
        }
    }

    if (!result) throw new AIError("Failed to get generation result after retries.", 500);

    // Log usage fire-and-forget
    if (options.functionId) {
        const usage = result.response.usageMetadata;
        logUsage({
            functionName: options.functionId,
            modelId,
            inputTokens:  usage?.promptTokenCount     ?? 0,
            outputTokens: usage?.candidatesTokenCount ?? 0,
        });
    }

    let text = result.response.text();
    text = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();

    if (options.jsonMode !== false) {
        try {
            return JSON.parse(text);
        } catch {
            throw new AIError(`AI returned invalid JSON. Raw response: ${text.slice(0, 200)}...`, 502);
        }
    }
    return text;
}

// --- Custom Error Class ---
export class AIError extends Error {
    status: number;
    constructor(message: string, status: number = 500) {
        super(message);
        this.name = "AIError";
        this.status = status;
    }
}

// --- Route Error Handler ---
export function handleAIError(error: unknown): Response {
    console.error("🤖 AI Route Error:", error);
    if (error instanceof AIError) {
        return Response.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Unknown AI error";
    return Response.json({ error: message }, { status: 500 });
}
