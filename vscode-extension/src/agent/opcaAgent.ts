// The agent loop: alternates between asking the model for a turn and, if it
// asked to call tools, running them and feeding results back — until it
// gives a final text answer or a safety cap is hit. This is what turns OPCA
// from "a chatbot that talks about your codebase" into something closer to
// an actual agent that inspects and acts on it, Copilot-Chat-agent-mode style.
import * as vscode from "vscode";
import type { AIProviderId } from "../../../src/lib/aiFix";
import { agentStep, type AgentMessage, type AgentToolCall } from "./agentTransport";
import { OPCA_TOOLS, runOpcaTool, type OpcaToolContext } from "./opcaTools";
import { getWikiContextSnippet } from "../wiki/wikiStore";

const MAX_TOOL_TURNS = 6;

export interface OpcaEvent {
	type: "activity" | "final" | "error";
	text: string;
}

const OPCA_AGENT_SYSTEM_PROMPT = `You are OPCA (OptiQra Coding Agent) — an agentic coding assistant specialized in SEO, GEO (generative-engine optimization), AEO (answer-engine optimization), accessibility, performance, security headers, and structured data, working directly inside the developer's codebase via a VS Code extension.

You are NOT a passive chatbot. You have tools to inspect the actual workspace — run a scan, list real issues, read real files, check the crawl graph, and propose or apply real fixes. Prefer using tools over guessing or giving generic advice:
- If asked about the state of the project, its score, or "what's wrong", call run_scan and/or list_issues rather than speaking in generalities.
- If asked to explain or fix something in a specific file, read_file it first so your answer is grounded in the actual code.
- If asked to fix something, use propose_fix to see what would change, then apply_fix if the user wants it applied. apply_fix always shows the user a diff to approve first (unless they've turned on auto-approve) — you never silently overwrite their code.
- Ground explanations of *why* something matters in OptiQra's own audit-rule wiki via search_wiki, citing the rule/category in your own words.
- Work across whatever stack the project actually is — Next.js, Vue, Angular, Svelte, Laravel/PHP, Python, or anything else; detect this from what you read rather than assuming.
- Be concise but concrete. Prefer taking the next useful action or showing a real code snippet over describing things abstractly.
- Never claim to have changed a file unless apply_fix actually reported success.`;

export interface OpcaHistoryItem {
	role: "user" | "assistant";
	content: string;
}

/** Runs the full agent loop for one user turn, invoking onEvent for each
 *  intermediate activity ("Reading file X…") and the final answer. Returns
 *  the final text so the caller can also persist it into history. */
export async function runOpcaAgent(opts: {
	extContext: vscode.ExtensionContext;
	provider: AIProviderId;
	apiKey: string;
	model: string;
	useWikiContext: boolean;
	history: OpcaHistoryItem[];
	activeFile?: { path: string; language: string; excerpt: string };
	onEvent: (event: OpcaEvent) => void;
}): Promise<string> {
	const { extContext, provider, apiKey, model, history, onEvent } = opts;

	let system = OPCA_AGENT_SYSTEM_PROMPT;
	if (opts.useWikiContext) {
		const lastUser = [...history].reverse().find((h) => h.role === "user")?.content ?? "";
		const wikiContext = await getWikiContextSnippet(extContext, lastUser);
		if (wikiContext) system += `\n\nRelevant OptiQra audit-rule reference (from the wiki), for grounding — verify against tools rather than assuming it's still accurate for this project:\n${wikiContext}`;
	}
	if (opts.activeFile) {
		system += `\n\nThe user currently has this file open (${opts.activeFile.path}, ${opts.activeFile.language}) — you can still call read_file on it for the full, current contents:\n\`\`\`${opts.activeFile.language}\n${opts.activeFile.excerpt}\n\`\`\``;
	}

	const messages: AgentMessage[] = history.map((h) => ({ role: h.role, content: h.content }) as AgentMessage);

	const toolCtx: OpcaToolContext = {
		context: extContext,
		onActivity: (label) => onEvent({ type: "activity", text: label }),
	};

	for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
		const result = await agentStep(provider, { apiKey, model, system, messages, tools: OPCA_TOOLS });

		if (result.kind === "text") {
			onEvent({ type: "final", text: result.text });
			return result.text;
		}

		// Model asked to call tools. Record its (possibly-empty) intermediate
		// text plus the calls, execute each, and append results before looping.
		messages.push({ role: "assistant", content: result.text ?? "", toolCalls: result.calls });

		for (const call of result.calls as AgentToolCall[]) {
			let output: string;
			try {
				output = await runOpcaTool(call.name, call.input, toolCtx);
			} catch (err: any) {
				output = `Error running ${call.name}: ${String(err?.message ?? err)}`;
			}
			messages.push({ role: "tool", toolCallId: call.id, toolName: call.name, content: output });
		}
	}

	const fallback = "I made several tool calls but didn't reach a final answer within this turn's limit — try narrowing the request (e.g. one file at a time), or ask me to continue.";
	onEvent({ type: "final", text: fallback });
	return fallback;
}
