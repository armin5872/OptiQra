// OPCA — OptiQra's coding agent. Thin wrapper around the ported BYOK
// multi-provider client (core/aiProviders.ts) that adds: the wiki as
// grounding context, a chat-style system prompt, and a JSON-mode helper for
// batch fixes (core/autoFixPrompt.ts's contract).
import * as vscode from "vscode";
import { completeFix } from "../../../src/lib/aiProviders";
import type { AIProviderId } from "../../../src/lib/aiFix";
import { getApiKey, getSettings } from "../settings";
import { getWikiContextSnippet } from "../wiki/wikiStore";

export interface OpcaChatMessage {
	role: "user" | "assistant";
	content: string;
}

export async function isAiConfigured(context: vscode.ExtensionContext): Promise<boolean> {
	const settings = getSettings();
	if (settings.ai.provider === "none") return false;
	const key = await getApiKey(context);
	return !!key;
}

const OPCA_SYSTEM_PROMPT = `You are OPCA (OptiQra Coding Agent) — a coding agent specialized in SEO, GEO (generative-engine optimization), AEO (answer-engine optimization), accessibility, performance, security headers, and structured data, working directly inside the developer's codebase via a VS Code extension.

Rules:
- You are grounded in OptiQra's own audit-rules wiki (excerpts provided below when relevant) — cite the specific rule/category when explaining *why* something matters, in your own words.
- You can discuss and explain issues from any OptiQra audit category, propose concrete code changes (in the project's actual framework/language — Next.js, Vue, Angular, Svelte, Laravel/PHP, Python, or anything else the user is working in), and answer general SEO/GEO/AEO strategy questions.
- When proposing a code change, show it as a fenced diff or full replacement snippet the user can review — you never apply changes directly; the extension always shows the user a diff and asks for approval before writing to disk (unless the user has explicitly turned on auto-approve in Settings).
- Be concise but concrete. Prefer showing the fix over describing it abstractly.`;

export async function chatWithOpca(
	context: vscode.ExtensionContext,
	history: OpcaChatMessage[],
	activeFileContext?: { path: string; language: string; excerpt: string },
): Promise<string> {
	const settings = getSettings();
	if (settings.ai.provider === "none") {
		throw new Error("No AI provider configured. Set optiqra.ai.provider and an API key in OptiQra: Settings.");
	}
	const apiKey = await getApiKey(context);
	if (!apiKey) {
		throw new Error("No API key stored. Run 'OptiQra: Set AI API Key' first.");
	}

	const wikiContext = settings.opca.useWikiContext
		? await getWikiContextSnippet(context, history[history.length - 1]?.content ?? "")
		: "";

	let system = OPCA_SYSTEM_PROMPT;
	if (wikiContext) system += `\n\nRelevant OptiQra audit-rule reference (from the wiki):\n${wikiContext}`;
	if (activeFileContext) {
		system += `\n\nThe user currently has this file open (${activeFileContext.path}, ${activeFileContext.language}):\n\`\`\`${activeFileContext.language}\n${activeFileContext.excerpt}\n\`\`\``;
	}

	// The ported completeFix() speaks a single system+user turn per call
	// (matching the web app's request shape) rather than a full multi-turn
	// message array, so prior turns are folded into the user prompt here.
	const conversation = history
		.map((m) => `${m.role === "user" ? "User" : "OPCA"}: ${m.content}`)
		.join("\n\n");

	const model = settings.ai.model || undefined;
	const provider = settings.ai.provider as AIProviderId;

	return completeFix(provider, {
		apiKey,
		model: model || defaultModelFor(provider),
		system,
		user: conversation,
	});
}

function defaultModelFor(provider: AIProviderId): string {
	const defaults: Record<AIProviderId, string> = {
		openai: "gpt-4.1-mini",
		anthropic: "claude-sonnet-4-5",
		google: "gemini-2.5-flash",
		groq: "llama-3.3-70b-versatile",
		openrouter: "openai/gpt-4.1-mini",
		mistral: "mistral-large-latest",
		deepseek: "deepseek-chat",
		xai: "grok-2-latest",
	};
	return defaults[provider];
}
