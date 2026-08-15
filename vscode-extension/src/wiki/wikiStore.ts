// Local reference copy of the OptiQra wiki (audit-rules documentation),
// bundled with the extension so it works fully offline, plus an optional
// "Sync Wiki" command that re-fetches the latest version from GitHub. OPCA
// uses a lightweight keyword-relevance search over this to ground its
// answers without needing network access or a vector DB.
import * as vscode from "vscode";
import * as path from "path";

let cachedPages: { title: string; file: string; text: string }[] | null = null;

function bundledWikiDir(context: vscode.ExtensionContext): string {
	return path.join(context.extensionPath, "wiki-cache");
}

export async function loadWikiPages(context: vscode.ExtensionContext): Promise<{ title: string; file: string; text: string }[]> {
	if (cachedPages) return cachedPages;
	const dir = vscode.Uri.file(bundledWikiDir(context));
	let entries: [string, vscode.FileType][] = [];
	try {
		entries = await vscode.workspace.fs.readDirectory(dir);
	} catch {
		cachedPages = [];
		return cachedPages;
	}
	const pages: { title: string; file: string; text: string }[] = [];
	for (const [name, type] of entries) {
		if (type !== vscode.FileType.File || !name.endsWith(".md")) continue;
		try {
			const bytes = await vscode.workspace.fs.readFile(vscode.Uri.joinPath(dir, name));
			const text = Buffer.from(bytes).toString("utf8");
			const title = name.replace(/\.md$/, "").replace(/[-‐]/g, " ");
			pages.push({ title, file: name, text });
		} catch {
			/* skip unreadable page */
		}
	}
	cachedPages = pages;
	return pages;
}

/** Very small keyword-overlap ranker — good enough for grounding a chat
 *  prompt without pulling in an embeddings dependency for an offline tool. */
export async function searchWiki(context: vscode.ExtensionContext, query: string, limit = 3): Promise<{ title: string; snippet: string }[]> {
	const pages = await loadWikiPages(context);
	const terms = query
		.toLowerCase()
		.split(/[^a-z0-9]+/)
		.filter((t) => t.length > 3);
	if (terms.length === 0 || pages.length === 0) return [];

	const scored = pages.map((p) => {
		const lower = p.text.toLowerCase();
		let score = 0;
		for (const t of terms) {
			const count = lower.split(t).length - 1;
			score += count;
		}
		return { page: p, score };
	});
	scored.sort((a, b) => b.score - a.score);
	const top = scored.filter((s) => s.score > 0).slice(0, limit);
	return top.map(({ page, score }) => {
		// Grab the highest-density ~800-char window around the first matched term.
		const lower = page.text.toLowerCase();
		let bestIdx = 0;
		for (const t of terms) {
			const idx = lower.indexOf(t);
			if (idx >= 0) {
				bestIdx = idx;
				break;
			}
		}
		const start = Math.max(0, bestIdx - 200);
		const snippet = page.text.slice(start, start + 900);
		void score;
		return { title: page.title, snippet };
	});
}

export async function getWikiContextSnippet(context: vscode.ExtensionContext, query: string): Promise<string> {
	const results = await searchWiki(context, query, 2);
	if (results.length === 0) return "";
	return results.map((r) => `### ${r.title}\n${r.snippet.trim()}`).join("\n\n---\n\n");
}
