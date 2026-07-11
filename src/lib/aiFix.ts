import type { Severity } from "@/lib/auditUtils";

export type AIProviderId = "openai" | "anthropic" | "google";

export interface AIProviderConfig {
	id: AIProviderId;
	label: string;
	keyPrefix: string;
	defaultModel: string;
	models: string[];
}

// Model names drift fast — verify against each provider's docs before shipping.
export const AI_PROVIDERS: Record<AIProviderId, AIProviderConfig> = {
	openai: {
		id: "openai",
		label: "OpenAI",
		keyPrefix: "sk-",
		defaultModel: "gpt-4.1-mini",
		models: ["gpt-4.1-mini", "gpt-4.1", "gpt-4o-mini"],
	},
	anthropic: {
		id: "anthropic",
		label: "Anthropic",
		keyPrefix: "sk-ant-",
		defaultModel: "claude-sonnet-4-5",
		models: ["claude-sonnet-4-5", "claude-haiku-4-5"],
	},
	google: {
		id: "google",
		label: "Google",
		keyPrefix: "AI",
		defaultModel: "gemini-2.5-flash",
		models: ["gemini-2.5-flash", "gemini-2.5-pro"],
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
}

export type FixStreamEvent =
	| { type: "delta"; text: string }
	| { type: "done" }
	| { type: "error"; message: string };
