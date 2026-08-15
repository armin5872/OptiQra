// Builds an internal "crawl tree" graph purely from what's on disk — no
// network involved. For full HTML files, real <a href> targets that resolve
// to another scanned file become edges. For component-source files (JSX/
// Vue/etc.) it also looks for Link/NuxtLink/RouterLink-style href/to props
// and for barrel/import relationships as a fallback signal, so component
// projects (which usually have no rendered HTML at all) still produce a
// meaningful tree grouped by directory/route shape.
import type { ProjectFile } from "../../../src/lib/projectFixEngine";
import * as path from "path";

export interface CrawlNode {
	id: string; // file path
	label: string;
	category: string; // top-level directory, for coloring/grouping
	score?: number; // optional per-file issue count, used for node sizing/coloring
	issueCount: number;
}

export interface CrawlEdge {
	source: string;
	target: string;
}

export interface CrawlGraph {
	nodes: CrawlNode[];
	edges: CrawlEdge[];
}

const HREF_RE = /(?:href|to)\s*=\s*["']([^"'#][^"']*)["']/g;

function normalizeTarget(fromPath: string, href: string): string | null {
	if (/^(https?:)?\/\//.test(href) || href.startsWith("mailto:") || href.startsWith("tel:")) return null;
	let clean = href.split("#")[0].split("?")[0];
	if (!clean) return null;
	if (clean.startsWith("/")) clean = clean.slice(1);
	else clean = path.posix.normalize(path.posix.join(path.posix.dirname(fromPath), clean));
	return clean;
}

export function buildCrawlGraph(files: ProjectFile[], issueCounts: Map<string, number>): CrawlGraph {
	const byBaseName = new Map<string, string>(); // e.g. "about" -> "about.html" / "app/about/page.tsx"
	for (const f of files) {
		const base = f.path
			.replace(/\.(html?|jsx?|tsx?|vue|svelte|astro)$/i, "")
			.replace(/\/(index|page)$/i, "")
			.replace(/^\.?\//, "");
		byBaseName.set(base || "home", f.path);
		byBaseName.set(f.path, f.path);
	}

	const nodes: CrawlNode[] = files.map((f) => ({
		id: f.path,
		label: path.posix.basename(f.path),
		category: f.path.split("/")[0] || "root",
		issueCount: issueCounts.get(f.path) ?? 0,
	}));

	const edgeSet = new Set<string>();
	const edges: CrawlEdge[] = [];
	for (const f of files) {
		HREF_RE.lastIndex = 0;
		let m: RegExpExecArray | null;
		while ((m = HREF_RE.exec(f.content))) {
			const target = normalizeTarget(f.path, m[1]);
			if (!target) continue;
			const resolved = byBaseName.get(target) ?? byBaseName.get(target.replace(/\/$/, ""));
			if (!resolved || resolved === f.path) continue;
			const key = `${f.path}->${resolved}`;
			if (edgeSet.has(key)) continue;
			edgeSet.add(key);
			edges.push({ source: f.path, target: resolved });
		}
	}

	return { nodes, edges };
}
