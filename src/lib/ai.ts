import { GoogleGenerativeAI } from "@google/generative-ai";

// --- Constants ---
export const AI_MODEL = process.env.AI_MODEL || "gemini-2.5-flash";
const MAX_INPUT_LENGTH = 50000; // Characters

// --- Sanitization (Prompt Injection Guard) ---
function sanitizeUserInput(input: string): string {
    // Strip XML/HTML-like tags that could be used to escape delimiters
    return input.replace(/<\/?[^>]+(>|$)/g, "").trim();
}

export function wrapUserData(data: unknown): string {
    const serialized = typeof data === "string" ? data : JSON.stringify(data);
    const sanitized = sanitizeUserInput(serialized);
    // Truncate excessively long inputs
    const truncated = sanitized.length > MAX_INPUT_LENGTH
        ? sanitized.slice(0, MAX_INPUT_LENGTH) + "... [TRUNCATED]"
        : sanitized;
    return `<user_data>\n${truncated}\n</user_data>`;
}

// --- Core AI Call ---
export async function callGemini(
    prompt: string,
    options: {
        jsonMode?: boolean,
        model?: string
    } = {}
): Promise<unknown> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new AIError("GEMINI_API_KEY is not configured. Check your .env.local file.", 500);
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: options.model || AI_MODEL });

    const generationConfig: Record<string, unknown> = {};
    if (options.jsonMode !== false) {
        generationConfig.responseMimeType = "application/json";
    }

    const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig,
    });

    let text = result.response.text();

    // Strip markdown code fences if present
    text = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();

    // For JSON mode, parse and return the object
    if (options.jsonMode !== false) {
        try {
            return JSON.parse(text);
        } catch {
            throw new AIError(
                `AI returned invalid JSON. Raw response: ${text.slice(0, 200)}...`,
                502
            );
        }
    }

    // For non-JSON mode (e.g., Markdown reports), return the raw text
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
