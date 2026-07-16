import type { AIProviderId } from "@/lib/aiFix";
import { getErrorMessage } from "@/lib/errorUtils";

interface StreamArgs {
	apiKey: string;
	model: string;
	system: string;
	user: string;
}

// Base URLs for every provider that speaks the OpenAI chat/completions dialect.
// Anthropic and Google have their own shapes and are handled separately below.
const OPENAI_COMPATIBLE_BASE_URL: Record<
	Exclude<AIProviderId, "anthropic" | "google">,
	string
> = {
	openai: "https://api.openai.com/v1/chat/completions",
	groq: "https://api.groq.com/openai/v1/chat/completions",
	openrouter: "https://openrouter.ai/api/v1/chat/completions",
	mistral: "https://api.mistral.ai/v1/chat/completions",
	deepseek: "https://api.deepseek.com/chat/completions",
	xai: "https://api.x.ai/v1/chat/completions",
};

// OpenRouter asks callers to identify their app — optional, but it's free
// attribution and doesn't touch the user's key or data.
const EXTRA_HEADERS: Partial<Record<AIProviderId, Record<string, string>>> = {
	openrouter: {
		"HTTP-Referer": "https://optiqra.app",
		"X-Title": "OptiQra",
	},
};

// A transient upstream hiccup (rate limit / momentary 5xx) shouldn't sink the
// whole fix generation — retry once after a short backoff before giving up.
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

async function fetchWithRetry(url: string, init: RequestInit, attempts = 2): Promise<Response> {
	let lastErr: unknown;
	for (let i = 0; i < attempts; i++) {
		try {
			const res = await fetch(url, init);
			if (res.ok || !RETRYABLE_STATUS.has(res.status) || i === attempts - 1) return res;
			lastErr = new Error(`HTTP ${res.status}`);
		} catch (err) {
			lastErr = err;
			if (i === attempts - 1) throw err;
		}
		await new Promise((r) => setTimeout(r, 500 * (i + 1)));
	}
	throw lastErr;
}

async function* streamOpenAICompatible(provider: AIProviderId, { apiKey, model, system, user }: StreamArgs) {
	const url = OPENAI_COMPATIBLE_BASE_URL[provider as Exclude<AIProviderId, "anthropic" | "google">];

	const res = await fetchWithRetry(url, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${apiKey}`,
			...EXTRA_HEADERS[provider],
		},
		body: JSON.stringify({
			model,
			stream: true,
			messages: [
				{ role: "system", content: system },
				{ role: "user", content: user },
			],
		}),
	});

	if (!res.ok || !res.body) {
		throw new Error(`${AI_PROVIDER_LABEL[provider]} error ${res.status}: ${await safeText(res)}`);
	}

	for await (const line of readSSE(res.body)) {
		if (line === "[DONE]") continue;
		try {
			const json = JSON.parse(line);
			const delta = json?.choices?.[0]?.delta?.content;
			if (delta) yield delta as string;
		} catch {
			// ignore malformed keep-alive lines
		}
	}
}

async function* streamAnthropic({ apiKey, model, system, user }: StreamArgs) {
	const res = await fetchWithRetry("https://api.anthropic.com/v1/messages", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"x-api-key": apiKey,
			"anthropic-version": "2023-06-01",
		},
		body: JSON.stringify({
			model,
			max_tokens: 1024,
			stream: true,
			system,
			messages: [{ role: "user", content: user }],
		}),
	});

	if (!res.ok || !res.body) {
		throw new Error(`Anthropic error ${res.status}: ${await safeText(res)}`);
	}

	for await (const line of readSSE(res.body)) {
		try {
			const json = JSON.parse(line);
			if (json.type === "content_block_delta" && json.delta?.text) {
				yield json.delta.text as string;
			}
		} catch {
			// ignore malformed keep-alive lines
		}
	}
}

async function* streamGoogle({ apiKey, model, system, user }: StreamArgs) {
	const res = await fetchWithRetry(
		`https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`,
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				systemInstruction: { parts: [{ text: system }] },
				contents: [{ role: "user", parts: [{ text: user }] }],
			}),
		},
	);

	if (!res.ok || !res.body) {
		throw new Error(`Google error ${res.status}: ${await safeText(res)}`);
	}

	for await (const line of readSSE(res.body)) {
		try {
			const json = JSON.parse(line);
			const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
			if (text) yield text as string;
		} catch {
			// ignore malformed keep-alive lines
		}
	}
}

export function streamFix(provider: AIProviderId, args: StreamArgs) {
	switch (provider) {
		case "anthropic":
			return streamAnthropic(args);
		case "google":
			return streamGoogle(args);
		case "openai":
		case "groq":
		case "openrouter":
		case "mistral":
		case "deepseek":
		case "xai":
			return streamOpenAICompatible(provider, args);
	}
}

/** Fires a minimal, cheap request against the provider to confirm the key/model
 *  actually work, without generating a real fix. Used by the "Test" button in
 *  AIProviderSetup so bad keys are caught before the person starts auditing. */
export async function testProviderKey(
	provider: AIProviderId,
	apiKey: string,
	model: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
	try {
		if (provider === "anthropic") {
			const res = await fetch("https://api.anthropic.com/v1/messages", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"x-api-key": apiKey,
					"anthropic-version": "2023-06-01",
				},
				body: JSON.stringify({ model, max_tokens: 1, messages: [{ role: "user", content: "ping" }] }),
			});
			if (!res.ok) return { ok: false, message: await summarizeError(res) };
			return { ok: true };
		}

		if (provider === "google") {
			const res = await fetch(
				`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						contents: [{ role: "user", parts: [{ text: "ping" }] }],
						generationConfig: { maxOutputTokens: 1 },
					}),
				},
			);
			if (!res.ok) return { ok: false, message: await summarizeError(res) };
			return { ok: true };
		}

		const url = OPENAI_COMPATIBLE_BASE_URL[provider as Exclude<AIProviderId, "anthropic" | "google">];
		const res = await fetch(url, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${apiKey}`,
				...EXTRA_HEADERS[provider],
			},
			body: JSON.stringify({ model, max_tokens: 1, messages: [{ role: "user", content: "ping" }] }),
		});
		if (!res.ok) return { ok: false, message: await summarizeError(res) };
		return { ok: true };
	} catch (err: unknown) {
		return { ok: false, message: getErrorMessage(err, "Network error reaching provider") };
	}
}

// --- helpers ---

const AI_PROVIDER_LABEL: Record<AIProviderId, string> = {
	openai: "OpenAI",
	anthropic: "Anthropic",
	google: "Google",
	groq: "Groq",
	openrouter: "OpenRouter",
	mistral: "Mistral",
	deepseek: "DeepSeek",
	xai: "xAI",
};

async function safeText(res: Response) {
	try {
		return await res.text();
	} catch {
		return "<no body>";
	}
}

async function summarizeError(res: Response): Promise<string> {
	const text = await safeText(res);
	if (res.status === 401 || res.status === 403) return "Key rejected — check it's correct and active.";
	if (res.status === 404) return "Model not found for this account — try a different model.";
	if (res.status === 429) return "Rate limited — the key works, but is being throttled right now.";
	try {
		const json = JSON.parse(text);
		const msg = json?.error?.message || json?.message;
		if (msg) return String(msg).slice(0, 200);
	} catch {
		// not JSON — fall through to raw text
	}
	return `HTTP ${res.status}${text ? `: ${text.slice(0, 200)}` : ""}`;
}

// Parses `data: {...}` SSE lines out of a ReadableStream<Uint8Array>, yielding the raw JSON payload string.
async function* readSSE(body: ReadableStream<Uint8Array>) {
	const reader = body.getReader();
	const decoder = new TextDecoder();
	let buffer = "";

	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		buffer += decoder.decode(value, { stream: true });

		const parts = buffer.split("\n\n");
		buffer = parts.pop() ?? "";

		for (const part of parts) {
			const line = part.split("\n").find((l) => l.startsWith("data:"));
			if (!line) continue;
			const payload = line.slice(5).trim();
			if (payload) yield payload;
		}
	}
}
