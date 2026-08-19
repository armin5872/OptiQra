import type { AIProviderId } from "../../../src/lib/aiFix";

// Models chosen for reasonably strong native tool-calling support, since
// OPCA's chat now runs an agent loop rather than one-shot completions.
export const AGENT_DEFAULT_MODEL: Record<AIProviderId, string> = {
	openai: "gpt-4.1-mini",
	anthropic: "claude-sonnet-4-5",
	google: "gemini-2.5-flash",
	groq: "llama-3.3-70b-versatile",
	openrouter: "openai/gpt-4.1-mini",
	mistral: "mistral-large-latest",
	deepseek: "deepseek-chat",
	xai: "grok-2-latest",
};
