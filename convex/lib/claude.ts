const CLAUDE_API_URL = "https://api.anthropic.com/v1/messages";
const CLAUDE_MODEL = "claude-sonnet-4-20250514";

const MAX_RETRIES = 3;
const RETRY_DELAYS = [5000, 10000, 20000]; // Exponential backoff for 429s

async function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function callClaude(prompt: string, options?: { maxTokens?: number; temperature?: number }): Promise<{ text: string; model: string }> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not defined in environment variables.");

    const maxTokens = options?.maxTokens ?? 4096;
    const temperature = options?.temperature ?? 0.3;

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        const response = await fetch(CLAUDE_API_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-api-key": apiKey,
                "anthropic-version": "2023-06-01",
            },
            body: JSON.stringify({
                model: CLAUDE_MODEL,
                max_tokens: maxTokens,
                temperature,
                messages: [{ role: "user", content: prompt }],
            }),
        });

        if (response.ok) {
            const data = await response.json();
            const text = data.content?.[0]?.text;
            if (!text) throw new Error("Claude returned no content.");
            return { text, model: CLAUDE_MODEL };
        }

        const errorText = await response.text();
        lastError = new Error(`Claude API error: ${response.status} ${errorText}`);

        // Retry on rate limit (429) or server error (500+)
        if ((response.status === 429 || response.status >= 500) && attempt < MAX_RETRIES) {
            const delay = response.status === 429
                ? RETRY_DELAYS[attempt] ?? 20000
                : 3000; // Short retry for 500s
            console.warn(`[callClaude] ${response.status} on attempt ${attempt + 1}, retrying in ${delay}ms...`);
            await sleep(delay);
            continue;
        }

        throw lastError;
    }

    throw lastError ?? new Error("Claude API call failed after retries.");
}
