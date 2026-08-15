// The approval-gated "Fix" pipeline. This is the heart of the "make it FIX,
// not just suggest" requirement: runs the deterministic engine first, then
// (if an AI key is configured) resolves anything that needs authored
// content via OPCA, then — unless auto-approve is on — shows the user a
// diff and asks before writing anything to disk.
import * as vscode from "vscode";
import * as cheerio from "cheerio";
import { runJsxAutoFix, applyJsxAITargetValues, isFixableSourceFile } from "../../../src/lib/jsxAutoFix";
import { runAutoFix, applyAITargetValues } from "../../../src/lib/autoFixEngine";
import { detectProjectStack } from "../../../src/lib/projectFixEngine";
import { buildAutoFixBatchPrompt, parseAutoFixResponse } from "../../../src/lib/autoFixPrompt";
import { checkTextIntegrity } from "../../../src/lib/fixIntegrityGuard";
import { completeFix } from "../../../src/lib/aiProviders";
import type { AIProviderId } from "../../../src/lib/aiFix";
import { getApiKey, getSettings } from "../settings";
import { scanWorkspaceFiles } from "../scanner/projectScanner";

export interface FixOutcome {
	changed: boolean;
	usedAI: boolean;
	summary: string;
	skippedCount: number;
}

const FULL_HTML_RE = /\.(html?|astro)$/i;

function isFullHtmlDocument(path: string, content: string): boolean {
	return FULL_HTML_RE.test(path) && /<html[\s>]/i.test(content);
}

async function resolveAiValues(
	context: vscode.ExtensionContext,
	targets: { id: string; kind: string; title: string; category: string; severity: string; context: string }[],
	pageUrl: string,
	stackSummary?: { summary: string; guidance: string },
): Promise<{ values: Record<string, string>; confidence: Record<string, "low"> } | null> {
	const settings = getSettings();
	if (settings.ai.provider === "none") return null;
	const apiKey = await getApiKey(context);
	if (!apiKey) return null;

	const provider = settings.ai.provider as AIProviderId;
	const model = settings.ai.model || defaultModelFor(provider);
	const { system, user } = buildAutoFixBatchPrompt(targets as any, pageUrl, stackSummary as any);
	const raw = await completeFix(provider, { apiKey, model, system, user });
	const parsed = parseAutoFixResponse(raw);
	return parsed;
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

/** Runs the fix pipeline for a single open document and returns the final
 *  proposed content (or null if there was nothing to change). Never writes
 *  to disk itself — see applyFixToDocument for the approval + write step. */
export async function computeFixedContent(
	context: vscode.ExtensionContext,
	relPath: string,
	original: string,
): Promise<{ content: string; usedAI: boolean; skipped: number } | null> {
	const allFiles = await scanWorkspaceFiles();
	const stack = detectProjectStack(allFiles as any);

	if (isFullHtmlDocument(relPath, original)) {
		const $ = cheerio.load(original);
		const { aiTargets } = runAutoFix($, `file://${relPath}`);
		let usedAI = false;
		let skipped = 0;
		if (aiTargets.length > 0) {
			const resolved = await resolveAiValues(
				context,
				aiTargets as any,
				`file://${relPath}`,
				{ summary: stack.summary, guidance: stack.guidance },
			);
			if (resolved) {
				usedAI = true;
				const results = applyAITargetValues($, aiTargets, resolved.values, "ai", resolved.confidence);
				skipped = results.filter((r) => r.status === "skipped").length;
			} else {
				skipped = aiTargets.length;
			}
		}
		const content = $.html();
		if (content === original) return null;
		return { content, usedAI, skipped };
	}

	const file = { path: relPath, content: original };
	const outcome = runJsxAutoFix(file, allFiles, `file://${relPath}`, stack.kind);
	let finalContent = outcome.content;
	let usedAI = false;
	let skipped = 0;

	if (outcome.aiTargets.length > 0) {
		const resolved = await resolveAiValues(
			context,
			outcome.aiTargets as any,
			`file://${relPath}`,
			{ summary: stack.summary, guidance: stack.guidance },
		);
		if (resolved) {
			usedAI = true;
			const applied = applyJsxAITargetValues(finalContent, outcome.aiTargets, resolved.values, "ai", resolved.confidence);
			finalContent = applied.content;
			skipped = applied.results.filter((r) => r.status === "skipped").length;
		} else {
			skipped = outcome.aiTargets.length;
		}
	}

	if (finalContent === original) return null;

	const integrity = checkTextIntegrity(original, finalContent, relPath);
	if (!integrity.ok) {
		throw new Error(`OptiQra: fix for ${relPath} failed an integrity check (${integrity.reason}) — nothing was written.`);
	}

	return { content: finalContent, usedAI, skipped };
}

/** Full user-facing flow for one document: compute the fix, show a diff
 *  (unless auto-approve is on), and write it on approval. */
export async function fixDocument(context: vscode.ExtensionContext, document: vscode.TextDocument): Promise<FixOutcome> {
	const relPath = vscode.workspace.asRelativePath(document.uri, false);
	const original = document.getText();

	if (!isFixableSourceFile(relPath, original) && !isFullHtmlDocument(relPath, original)) {
		return { changed: false, usedAI: false, summary: "No fixable SEO/accessibility patterns recognized in this file type.", skippedCount: 0 };
	}

	const result = await computeFixedContent(context, relPath, original);
	if (!result) {
		return { changed: false, usedAI: false, summary: "No changes needed — nothing OptiQra could fix was found.", skippedCount: 0 };
	}

	const settings = getSettings();
	const approved = settings.fix.autoApprove || (await confirmViaDiff(document, result.content));
	if (!approved) {
		return { changed: false, usedAI: result.usedAI, summary: "Fix cancelled — no changes were applied.", skippedCount: 0 };
	}

	const edit = new vscode.WorkspaceEdit();
	const fullRange = new vscode.Range(document.positionAt(0), document.positionAt(original.length));
	edit.replace(document.uri, fullRange, result.content);
	await vscode.workspace.applyEdit(edit);
	await document.save();

	return {
		changed: true,
		usedAI: result.usedAI,
		summary: result.usedAI
			? `Fixed with OPCA (AI)${result.skipped ? ` — ${result.skipped} item(s) left for manual review` : ""}.`
			: `Fixed automatically (no AI configured — deterministic fixes only)${result.skipped ? `, ${result.skipped} item(s) need an AI key to resolve` : ""}.`,
		skippedCount: result.skipped,
	};
}

async function confirmViaDiff(document: vscode.TextDocument, newContent: string): Promise<boolean> {
	const original = document.uri;
	const proposedUri = original.with({ scheme: "optiqra-fix-preview", path: original.path + ".optiqra-fix" });
	proposedContentStore.set(proposedUri.toString(), newContent);

	await vscode.commands.executeCommand(
		"vscode.diff",
		original,
		proposedUri,
		`OptiQra Fix Preview: ${vscode.workspace.asRelativePath(original, false)}`,
	);

	const choice = await vscode.window.showInformationMessage(
		`Apply OptiQra's proposed fix to ${vscode.workspace.asRelativePath(original, false)}?`,
		{ modal: true },
		"Apply Fix",
		"Discard",
	);
	return choice === "Apply Fix";
}

export const proposedContentStore = new Map<string, string>();

export class FixPreviewContentProvider implements vscode.TextDocumentContentProvider {
	provideTextDocumentContent(uri: vscode.Uri): string {
		return proposedContentStore.get(uri.toString()) ?? "";
	}
}
