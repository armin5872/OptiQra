// The tools OPCA can call. Every tool here is either read-only (safe to run
// without asking) or funnels through the existing approval-gated fix
// pipeline (fixController.ts) — OPCA never bypasses the diff/approval flow
// that a human using "Fix Current File" would go through; it just gets to
// trigger it as part of a conversation instead of the person doing it by hand.
import * as vscode from "vscode";
import type { AgentTool } from "./agentTransport";
import { runFullAudit } from "../audit/engine";
import { scanWorkspaceFiles, scanProjectMetaFiles } from "../scanner/projectScanner";
import { computeFixedContent, fixDocument } from "../fix/fixController";
import { searchWiki } from "../wiki/wikiStore";
import { buildCrawlGraph } from "../scanner/crawlGraph";

export const OPCA_TOOLS: AgentTool[] = [
	{
		name: "run_scan",
		description:
			"Run a full OptiQra audit across the whole open workspace (SEO, GEO, AEO, accessibility, security, performance, conversions, structured data, duplicate content). Returns the overall score and a per-category breakdown. Use this first if you don't already know the current state of the project, or after fixes have been applied to see the new score.",
		parameters: { type: "object", properties: {}, required: [] },
	},
	{
		name: "list_issues",
		description:
			"List concrete issues found in the workspace, optionally filtered by category or file path. Use this to find specific things to fix, rather than guessing. Each issue has an id, title, severity, category, and file path.",
		parameters: {
			type: "object",
			properties: {
				category: {
					type: "string",
					description: "Optional filter: seo, speed, a11y, security, conversions, bestPractices, geo, aeo, structuredData, duplicateContent.",
				},
				path: { type: "string", description: "Optional filter: only issues in this file path (relative to workspace root)." },
				limit: { type: "number", description: "Max issues to return, default 30." },
			},
			required: [],
		},
	},
	{
		name: "read_file",
		description: "Read the full text content of a file in the workspace, given a path relative to the workspace root.",
		parameters: {
			type: "object",
			properties: { path: { type: "string", description: "Path relative to the workspace root, e.g. 'src/app/page.tsx'." } },
			required: ["path"],
		},
	},
	{
		name: "list_files",
		description: "List files in the workspace that OptiQra scans (matching the configured include/exclude globs), optionally filtered by a substring of the path.",
		parameters: {
			type: "object",
			properties: { filter: { type: "string", description: "Optional substring to filter paths by." } },
			required: [],
		},
	},
	{
		name: "propose_fix",
		description:
			"Compute what OptiQra's fix engine would change in a given file, WITHOUT applying it. Returns a summary of whether there are changes and whether AI authorship was used. Use this to check what a fix would do before calling apply_fix, or when the user just wants to see a preview.",
		parameters: {
			type: "object",
			properties: { path: { type: "string", description: "Path relative to the workspace root." } },
			required: ["path"],
		},
	},
	{
		name: "apply_fix",
		description:
			"Run OptiQra's fix pipeline on a file and apply the result. This opens the file, shows the user a diff to approve (unless they've turned on auto-approve in settings), and writes the change on approval. This is the same action as the 'Fix Current File' command — use it when the user asks you to fix, resolve, or clean up a specific file.",
		parameters: {
			type: "object",
			properties: { path: { type: "string", description: "Path relative to the workspace root." } },
			required: ["path"],
		},
	},
	{
		name: "get_crawl_graph_summary",
		description:
			"Get a summary of the project's internal link/route graph (the same data behind the Crawl Tree view) — total pages, total links, and the files with the most unresolved issues. Useful for questions about site structure, orphan pages, or where to focus effort first.",
		parameters: { type: "object", properties: {}, required: [] },
	},
	{
		name: "search_wiki",
		description: "Search OptiQra's bundled audit-rules wiki for reference material on a topic (e.g. 'canonical tags', 'llms.txt', 'core web vitals').",
		parameters: {
			type: "object",
			properties: { query: { type: "string" } },
			required: ["query"],
		},
	},
];

function workspaceRoot(): vscode.Uri {
	const folder = vscode.workspace.workspaceFolders?.[0];
	if (!folder) throw new Error("No workspace folder is open.");
	return folder.uri;
}

let cachedRun: Awaited<ReturnType<typeof runFullAudit>> | undefined;
let cachedFiles: Awaited<ReturnType<typeof scanWorkspaceFiles>> | undefined;

export function invalidateOpcaToolCache() {
	cachedRun = undefined;
	cachedFiles = undefined;
}

async function ensureFiles() {
	if (!cachedFiles) cachedFiles = await scanWorkspaceFiles();
	return cachedFiles;
}

async function ensureRun() {
	if (!cachedRun) {
		const files = await ensureFiles();
		const meta = await scanProjectMetaFiles();
		cachedRun = await runFullAudit(files, meta);
	}
	return cachedRun;
}

export interface OpcaToolContext {
	context: vscode.ExtensionContext;
	/** Called whenever OPCA runs a tool, so the chat UI can render an "activity" line. */
	onActivity?: (label: string) => void;
}

export async function runOpcaTool(name: string, input: Record<string, unknown>, ctx: OpcaToolContext): Promise<string> {
	ctx.onActivity?.(activityLabel(name, input));
	switch (name) {
		case "run_scan": {
			invalidateOpcaToolCache();
			const run = await ensureRun();
			const cats = Object.entries(run.categories)
				.map(([key, c]: [string, any]) => `${key}: ${c.score}/100 (${c.issues.length} issue(s))`)
				.join("\n");
			return `Overall score: ${run.overallScore}/100\nFiles scanned: ${run.filesScanned}\nStack: ${run.stack.summary}\n\nPer category:\n${cats}`;
		}
		case "list_issues": {
			const run = await ensureRun();
			const category = input.category as string | undefined;
			const path = input.path as string | undefined;
			const limit = Math.min(Number(input.limit) || 30, 60);
			const rows: { title: string; severity: string; category: string; path?: string }[] = [];

			// Per-file results carry a real path; these are the most useful for
			// "what's wrong with file X" or "show me issues to go fix" style asks.
			for (const fileResult of run.perFileResults) {
				if (path && fileResult.path !== path) continue;
				for (const r of fileResult.results) {
					if (r.status === "fixed") continue;
					if (category && r.category !== category) continue;
					rows.push({ title: r.title, severity: r.severity, category: r.category, path: fileResult.path });
				}
			}
			// Project-wide / whole-category issues (e.g. GEO, AEO, structured
			// data, duplicate content) aren't tied to one file — only include
			// these when the caller isn't filtering by path.
			if (!path) {
				for (const [key, c] of Object.entries(run.categories) as [string, any][]) {
					if (category && key !== category) continue;
					for (const issue of c.issues) {
						rows.push({ title: issue.title, severity: issue.severity, category: key });
					}
				}
			}

			if (rows.length === 0) return "No matching issues found.";
			const shown = rows.slice(0, limit);
			const text = shown.map((r) => `- [${r.severity}] (${r.category}) ${r.title}${r.path ? ` — ${r.path}` : ""}`).join("\n");
			return `${shown.length} of ${rows.length} issue(s):\n${text}`;
		}
		case "read_file": {
			const rel = String(input.path ?? "");
			const uri = vscode.Uri.joinPath(workspaceRoot(), rel);
			const bytes = await vscode.workspace.fs.readFile(uri);
			const text = Buffer.from(bytes).toString("utf8");
			return text.length > 8000 ? text.slice(0, 8000) + "\n…(truncated)" : text;
		}
		case "list_files": {
			const files = await ensureFiles();
			const filter = (input.filter as string | undefined)?.toLowerCase();
			const paths = files.map((f) => f.path).filter((p) => !filter || p.toLowerCase().includes(filter));
			return paths.length ? paths.slice(0, 200).join("\n") : "No files matched.";
		}
		case "propose_fix": {
			const rel = String(input.path ?? "");
			const uri = vscode.Uri.joinPath(workspaceRoot(), rel);
			const doc = await vscode.workspace.openTextDocument(uri);
			const result = await computeFixedContent(ctx.context, rel, doc.getText());
			if (!result) return `No changes needed for ${rel} — nothing OptiQra's fix engine could improve was found.`;
			return `Fix available for ${rel}: ${result.content.length - doc.getText().length >= 0 ? "adds" : "removes"} content, uses AI authorship: ${result.usedAI}${result.skipped ? `, ${result.skipped} item(s) would still need manual review` : ""}. Call apply_fix to apply it (the user will be shown a diff to approve).`;
		}
		case "apply_fix": {
			const rel = String(input.path ?? "");
			const uri = vscode.Uri.joinPath(workspaceRoot(), rel);
			const doc = await vscode.workspace.openTextDocument(uri);
			await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside, true);
			const outcome = await fixDocument(ctx.context, doc);
			if (outcome.changed) invalidateOpcaToolCache();
			return outcome.summary;
		}
		case "get_crawl_graph_summary": {
			const files = await ensureFiles();
			const run = await ensureRun();
			const issueCounts = new Map<string, number>();
			for (const r of run.perFileResults) issueCounts.set(r.path, r.results.filter((x) => x.status !== "fixed").length);
			const graph = buildCrawlGraph(files, issueCounts);
			const worst = [...graph.nodes].sort((a, b) => b.issueCount - a.issueCount).slice(0, 8);
			const worstText = worst.map((n) => `- ${n.id}: ${n.issueCount} issue(s)`).join("\n");
			return `Pages/files: ${graph.nodes.length}\nInternal links: ${graph.edges.length}\n\nMost-issue files:\n${worstText}`;
		}
		case "search_wiki": {
			const results = await searchWiki(ctx.context, String(input.query ?? ""), 3);
			if (results.length === 0) return "No wiki matches found.";
			return results.map((r) => `### ${r.title}\n${r.snippet.trim()}`).join("\n\n---\n\n");
		}
		default:
			return `Unknown tool: ${name}`;
	}
}

function activityLabel(name: string, input: Record<string, unknown>): string {
	switch (name) {
		case "run_scan":
			return "Running full workspace scan…";
		case "list_issues":
			return `Listing issues${input.category ? ` in ${input.category}` : ""}${input.path ? ` (${input.path})` : ""}…`;
		case "read_file":
			return `Reading ${input.path}…`;
		case "list_files":
			return "Listing workspace files…";
		case "propose_fix":
			return `Previewing fix for ${input.path}…`;
		case "apply_fix":
			return `Applying fix to ${input.path}…`;
		case "get_crawl_graph_summary":
			return "Analyzing crawl graph…";
		case "search_wiki":
			return `Searching wiki for "${input.query}"…`;
		default:
			return `Running ${name}…`;
	}
}
