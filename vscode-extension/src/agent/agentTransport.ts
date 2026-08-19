// OPCA's agent transport. This is deliberately separate from
// ../../../src/lib/aiProviders.ts (the shared core used by 7 Next.js API
// routes in the main app) rather than a modification of it — that file
// speaks a single system+user turn with no tool support, and changing its
// shape would ripple into the web/Tauri app's fix pipeline. This module
// re-implements just enough of each provider's HTTP shape, but *with*
// native tool/function-calling, so OPCA can actually act: list issues,
// read files, run a scan, propose or apply a fix — not just describe one.
//
// Every provider is normalized to a single loop shape:
//   send messages + tool defs -> either get a final text answer, or get
//   back one or more tool calls -> the caller executes them and this module
//   is invoked again with the tool results appended -> repeat until the
//   model stops calling tools or a turn cap is hit.
import type { AIProviderId } from "../../../src/lib/aiFix";

export interface AgentTool {
	name: string;
	description: string;
	/** JSON-schema for the tool's input, in the shape every provider expects for `parameters`/`input_schema`. */
	parameters: Record<string, unknown>;
}

export type AgentMessage =
	| { role: "user"; content: string }
	| { role: "assistant"; content: string; toolCalls?: AgentToolCall[] }
	| { role: "tool"; toolCallId: string; toolName: string; content: string };

export interface AgentToolCall {
	id: string;
	name: string;
	input: Record<string, unknown>;
}

export type AgentTurn =
	| { kind: "text"; text: string }
	| { kind: "tool_calls"; calls: AgentToolCall[]; text?: string };

interface AgentArgs {
	apiKey: string;
	model: string;
	system: string;
	messages: AgentMessage[];
	tools: AgentTool[];
}

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

async function safeText(res: Response) {
	try {
		return await res.text();
	} catch {
		return "<no body>";
	}
}

function summarize(res: Response, text: string): string {
	if (res.status === 401 || res.status === 403) return "Key rejected — check it's correct and active.";
	if (res.status === 404) return "Model not found for this account — try a different model.";
	if (res.status === 429) return "Rate limited — the key works, but is being throttled right now.";
	try {
		const json = JSON.parse(text);
		const msg = json?.error?.message || json?.message;
		if (msg) return String(msg).slice(0, 300);
	} catch {
		/* not JSON */
	}
	return `HTTP ${res.status}${text ? `: ${text.slice(0, 300)}` : ""}`;
}

// ---------------- Anthropic ----------------

async function stepAnthropic(args: AgentArgs): Promise<AgentTurn> {
	const messages = args.messages.map((m) => {
		if (m.role === "user") return { role: "user", content: m.content };
		if (m.role === "tool") {
			return {
				role: "user",
				content: [{ type: "tool_result", tool_use_id: m.toolCallId, content: m.content }],
			};
		}
		const blocks: any[] = [];
		if (m.content) blocks.push({ type: "text", text: m.content });
		for (const tc of m.toolCalls ?? []) blocks.push({ type: "tool_use", id: tc.id, name: tc.name, input: tc.input });
		return { role: "assistant", content: blocks };
	});

	const res = await fetchWithRetry("https://api.anthropic.com/v1/messages", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"x-api-key": args.apiKey,
			"anthropic-version": "2023-06-01",
		},
		body: JSON.stringify({
			model: args.model,
			max_tokens: 4096,
			system: args.system,
			messages,
			tools: args.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters })),
		}),
	});
	if (!res.ok) throw new Error(`Anthropic error: ${summarize(res, await safeText(res))}`);
	const json = await res.json();
	const content: any[] = json.content ?? [];
	const toolUses = content.filter((b) => b.type === "tool_use");
	const text = content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
	if (toolUses.length > 0) {
		return { kind: "tool_calls", text: text || undefined, calls: toolUses.map((b) => ({ id: b.id, name: b.name, input: b.input ?? {} })) };
	}
	return { kind: "text", text };
}

// ---------------- OpenAI-compatible (openai, groq, openrouter, mistral, deepseek, xai) ----------------

const OPENAI_COMPATIBLE_BASE_URL: Record<Exclude<AIProviderId, "anthropic" | "google">, string> = {
	openai: "https://api.openai.com/v1/chat/completions",
	groq: "https://api.groq.com/openai/v1/chat/completions",
	openrouter: "https://openrouter.ai/api/v1/chat/completions",
	mistral: "https://api.mistral.ai/v1/chat/completions",
	deepseek: "https://api.deepseek.com/chat/completions",
	xai: "https://api.x.ai/v1/chat/completions",
};

const EXTRA_HEADERS: Partial<Record<AIProviderId, Record<string, string>>> = {
	openrouter: { "HTTP-Referer": "https://optiqra.app", "X-Title": "OptiQra" },
};

async function stepOpenAICompatible(provider: AIProviderId, args: AgentArgs): Promise<AgentTurn> {
	const url = OPENAI_COMPATIBLE_BASE_URL[provider as Exclude<AIProviderId, "anthropic" | "google">];

	const messages: any[] = [{ role: "system", content: args.system }];
	for (const m of args.messages) {
		if (m.role === "user") messages.push({ role: "user", content: m.content });
		else if (m.role === "tool") messages.push({ role: "tool", tool_call_id: m.toolCallId, content: m.content });
		else {
			messages.push({
				role: "assistant",
				content: m.content || null,
				tool_calls: m.toolCalls?.map((tc) => ({
					id: tc.id,
					type: "function",
					function: { name: tc.name, arguments: JSON.stringify(tc.input) },
				})),
			});
		}
	}

	const res = await fetchWithRetry(url, {
		method: "POST",
		headers: { "Content-Type": "application/json", Authorization: `Bearer ${args.apiKey}`, ...EXTRA_HEADERS[provider] },
		body: JSON.stringify({
			model: args.model,
			messages,
			tools: args.tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.parameters } })),
		}),
	});
	if (!res.ok) throw new Error(`${provider} error: ${summarize(res, await safeText(res))}`);
	const json = await res.json();
	const msg = json?.choices?.[0]?.message;
	const toolCalls = msg?.tool_calls ?? [];
	if (toolCalls.length > 0) {
		return {
			kind: "tool_calls",
			text: msg?.content || undefined,
			calls: toolCalls.map((tc: any) => ({
				id: tc.id,
				name: tc.function.name,
				input: safeParseJson(tc.function.arguments),
			})),
		};
	}
	return { kind: "text", text: msg?.content ?? "" };
}

// ---------------- Google (Gemini) ----------------

async function stepGoogle(args: AgentArgs): Promise<AgentTurn> {
	const contents: any[] = [];
	for (const m of args.messages) {
		if (m.role === "user") contents.push({ role: "user", parts: [{ text: m.content }] });
		else if (m.role === "tool") {
			contents.push({
				role: "function",
				parts: [{ functionResponse: { name: m.toolName, response: { result: m.content } } }],
			});
		} else {
			const parts: any[] = [];
			if (m.content) parts.push({ text: m.content });
			for (const tc of m.toolCalls ?? []) parts.push({ functionCall: { name: tc.name, args: tc.input } });
			contents.push({ role: "model", parts });
		}
	}

	const res = await fetchWithRetry(
		`https://generativelanguage.googleapis.com/v1beta/models/${args.model}:generateContent?key=${args.apiKey}`,
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				systemInstruction: { parts: [{ text: args.system }] },
				contents,
				tools: [{ functionDeclarations: args.tools.map((t) => ({ name: t.name, description: t.description, parameters: t.parameters })) }],
			}),
		},
	);
	if (!res.ok) throw new Error(`Google error: ${summarize(res, await safeText(res))}`);
	const json = await res.json();
	const parts: any[] = json?.candidates?.[0]?.content?.parts ?? [];
	const calls = parts.filter((p) => p.functionCall).map((p, i) => ({ id: `${Date.now()}_${i}`, name: p.functionCall.name, input: p.functionCall.args ?? {} }));
	const text = parts.filter((p) => p.text).map((p) => p.text).join("\n");
	if (calls.length > 0) return { kind: "tool_calls", text: text || undefined, calls };
	return { kind: "text", text };
}

function safeParseJson(raw: string): Record<string, unknown> {
	try {
		return JSON.parse(raw);
	} catch {
		return {};
	}
}

/** One model turn: given the conversation so far, returns either final text
 *  or a batch of tool calls the caller must execute and feed back in. */
export async function agentStep(provider: AIProviderId, args: AgentArgs): Promise<AgentTurn> {
	switch (provider) {
		case "anthropic":
			return stepAnthropic(args);
		case "google":
			return stepGoogle(args);
		default:
			return stepOpenAICompatible(provider, args);
	}
}
