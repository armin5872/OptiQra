import type { Severity } from "@/lib/auditUtils";
import type { StackPromptContext } from "@/lib/stackDetector";

export type AIProviderId =
	| "openai"
	| "anthropic"
	| "google"
	| "groq"
	| "openrouter"
	| "mistral"
	| "deepseek"
	| "xai";

export interface AIProviderConfig {
	id: AIProviderId;
	label: string;
	keyPrefix: string;
	defaultModel: string;
	models: string[];
	/** Short note shown under the model picker — pricing/speed tradeoffs, etc. */
	hint?: string;
	/** Where to grab an API key for this provider. */
	keyUrl: string;
	/** Providers with huge/rotating catalogs (OpenRouter) also accept a free-typed model id. */
	allowCustomModel?: boolean;
}

// Model names drift fast — verify against each provider's docs before shipping.
export const AI_PROVIDERS: Record<AIProviderId, AIProviderConfig> = {
	openai: {
		id: "openai",
		label: "OpenAI",
		keyPrefix: "sk-",
		defaultModel: "gpt-4.1-mini",
		models: ["gpt-4.1-mini", "gpt-4.1", "gpt-4o-mini"],
		keyUrl: "https://platform.openai.com/api-keys",
	},
	anthropic: {
		id: "anthropic",
		label: "Anthropic",
		keyPrefix: "sk-ant-",
		defaultModel: "claude-sonnet-4-5",
		models: ["claude-sonnet-4-5", "claude-haiku-4-5"],
		keyUrl: "https://console.anthropic.com/settings/keys",
	},
	google: {
		id: "google",
		label: "Google",
		keyPrefix: "AI",
		defaultModel: "gemini-2.5-flash",
		models: ["gemini-2.5-flash", "gemini-2.5-pro"],
		keyUrl: "https://aistudio.google.com/apikey",
	},
	groq: {
		id: "groq",
		label: "Groq",
		keyPrefix: "gsk_",
		defaultModel: "openai/gpt-oss-120b",
		models: ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3.6-27b", "moonshotai/kimi-k2-instruct-0905"],
		hint: "Free tier available. LPU inference — usually the fastest option here.",
		keyUrl: "https://console.groq.com/keys",
	},
	openrouter: {
		id: "openrouter",
		label: "OpenRouter",
		keyPrefix: "sk-or-",
		defaultModel: "openai/gpt-4.1-mini",
		models: [
			"openai/gpt-4.1-mini",
			"anthropic/claude-sonnet-4.5",
			"google/gemini-2.5-flash",
			"deepseek/deepseek-v4-flash",
			"x-ai/grok-4.5",
			"meta-llama/llama-3.3-70b-instruct",
		],
		hint: "One key, hundreds of models — pick a preset or type any OpenRouter model id.",
		keyUrl: "https://openrouter.ai/keys",
		allowCustomModel: true,
	},
	mistral: {
		id: "mistral",
		label: "Mistral",
		keyPrefix: "",
		defaultModel: "mistral-large-latest",
		models: ["mistral-large-latest", "mistral-medium-latest", "mistral-small-latest", "codestral-latest"],
		hint: "EU-hosted. Codestral is tuned specifically for code fixes.",
		keyUrl: "https://console.mistral.ai/api-keys",
	},
	deepseek: {
		id: "deepseek",
		label: "DeepSeek",
		keyPrefix: "sk-",
		defaultModel: "deepseek-v4-flash",
		models: ["deepseek-v4-flash", "deepseek-v4-pro"],
		hint: "Very low cost. Pro trades latency for stronger reasoning.",
		keyUrl: "https://platform.deepseek.com/api_keys",
	},
	xai: {
		id: "xai",
		label: "xAI (Grok)",
		keyPrefix: "xai-",
		defaultModel: "grok-4.5",
		models: ["grok-4.5"],
		keyUrl: "https://console.x.ai",
	},
};

/** Minimal slice of an Issue needed to build a targeted prompt — avoids
 *  coupling this module to the full Issue shape (resolved/weight aren't
 *  relevant to the fix itself). */
export interface FixableIssue {
	title: string;
	detail: string;
	fix?: string;
	severity: Severity;
}

export interface GenerateFixRequest {
	provider: AIProviderId;
	apiKey: string;
	model?: string;
	issue: FixableIssue;
	pageUrl: string;
	category: string; // e.g. "SEO", "Speed", "Accessibility", "Conversions"
	/** Detected tech stack of the scanned site, if known — lets the fix be
	 *  written in the site's actual stack (Liquid, PHP/WP hooks, Next.js
	 *  App Router, builder-panel steps, etc.) instead of generic HTML. */
	stack?: StackPromptContext;
}

export type FixStreamEvent =
	| { type: "delta"; text: string }
	| { type: "done" }
	| { type: "error"; message: string };
