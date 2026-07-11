import type { AIProviderId } from "@/lib/aiFix";

interface StreamArgs {
	apiKey: string;
	model: string;
	system: string;
	user: string;
}

// Each function yields plain text deltas. Errors thrown here are caught by the route handler.

async function* streamOpenAI({ apiKey, model, system, user }: StreamArgs) {
	const res = await fetch("https://api.openai.com/v1/chat/completions", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${apiKey}`,
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
		throw new Error(`OpenAI error ${res.status}: ${await safeText(res)}`);
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
	const res = await fetch("https://api.anthropic.com/v1/messages", {
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
	const res = await fetch(
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
		case "openai":
			return streamOpenAI(args);
		case "anthropic":
			return streamAnthropic(args);
		case "google":
			return streamGoogle(args);
	}
}

// --- helpers ---

async function safeText(res: Response) {
	try {
		return await res.text();
	} catch {
		return "<no body>";
	}
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
