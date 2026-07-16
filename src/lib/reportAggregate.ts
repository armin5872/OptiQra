// lib/reportAggregate.ts
// Pure, environment-agnostic (safe to import from both the API route and the
// browser) logic for merging many pages' worth of a single category (e.g.
// "SEO") into one summary card. Kept as its own module — rather than living
// only inside the API route — specifically so the client can build the exact
// same shape of report from whatever pages it already has, without an extra
// server round trip. That's what makes "Create report now" instant and
// "Resume" able to pick up cleanly after a pause.

import type { Issue } from "@/lib/htmlAudit";
import type { StackPromptContext } from "@/lib/stackDetector";

export type { Issue };

export type Category = {
	label: string;
	score: number;
	issues: Issue[];
	passed: Issue[];
	source: string;
	pagesAnalyzed?: number;
};

export type PageCategoryResult = {
	url: string;
	score: number;
	issues: Issue[];
	passed: Issue[];
};

export type PageNode = {
	url: string;
	parentUrl?: string;
	depth: number;
	score: number;
	categories: Record<
		string,
		{ label: string; score: number; issues: Issue[]; passed: Issue[] }
	>;
	/** Detected tech stack for this page — only ever populated on the seed
	 *  (depth 0) page; other pages on the same site are assumed to share it. */
	stack?: StackPromptContext;
};

/** Picks the site-wide detected stack out of a list of crawled pages: the
 *  seed page's (depth 0) detection if present, otherwise the first page
 *  that has one. Used both server-side (final report) and client-side
 *  ("Create report now" / resumed scans), so both paths agree. */
export function pickSiteStack(pageNodes: PageNode[]): StackPromptContext | undefined {
	return pageNodes.find((n) => n.depth === 0 && n.stack)?.stack ?? pageNodes.find((n) => n.stack)?.stack;
}

/** Merges the same category (e.g. "SEO") computed across many pages into one card:
 *  score is the average across pages, issues are grouped by id with the list of
 *  pages each one showed up on, and passed checks are deduped. */
export function aggregateCategory(
	label: string,
	source: string,
	perPage: PageCategoryResult[],
): Category {
	if (perPage.length === 0) {
		return {
			label,
			score: 50,
			issues: [],
			passed: [],
			source,
			pagesAnalyzed: 0,
		};
	}

	const avgScore = Math.round(
		perPage.reduce((sum, p) => sum + p.score, 0) / perPage.length,
	);

	const issueGroups = new Map<string, Issue & { affectedPages: string[] }>();
	for (const p of perPage) {
		for (const iss of p.issues) {
			const existing = issueGroups.get(iss.id);
			if (existing) {
				existing.affectedPages.push(p.url);
			} else {
				issueGroups.set(iss.id, { ...iss, affectedPages: [p.url] });
			}
		}
	}

	const passed: Issue[] = [];
	const passedSeen = new Set<string>();
	for (const p of perPage) {
		for (const ps of p.passed) {
			if (issueGroups.has(ps.id) || passedSeen.has(ps.id)) continue;
			passedSeen.add(ps.id);
			passed.push(ps);
		}
	}

	const issues = Array.from(issueGroups.values())
		.sort((a, b) => b.weight - a.weight)
		.map((iss) => {
			const pageCount = iss.affectedPages.length;
			const suffix =
				pageCount > 1 ?
					` (found on ${pageCount} of ${perPage.length} pages scanned)`
				:	"";
			return { ...iss, detail: `${iss.detail}${suffix}` };
		});

	return {
		label,
		score: Math.max(20, Math.min(100, avgScore)),
		issues,
		passed,
		source,
		pagesAnalyzed: perPage.length,
	};
}

/** Turns the running list of already-crawled `PageNode`s (which the client
 *  accumulates as "progress" events arrive) into the six report categories,
 *  by regrouping each page's per-category result and running it back through
 *  `aggregateCategory` — exactly what the server does at the end of a normal
 *  scan, just runnable client-side against a partial page set. */
export function aggregateCategoriesFromPageNodes(
	pageNodes: PageNode[],
): Record<string, Category> {
	const keys = ["seo", "aeo", "geo", "speed", "a11y", "conversions"] as const;
	const labels: Record<(typeof keys)[number], string> = {
		seo: "SEO",
		aeo: "AEO",
		geo: "GEO",
		speed: "Performance",
		a11y: "Accessibility",
		conversions: "Conversions",
	};

	const categories: Record<string, Category> = {};
	for (const key of keys) {
		const perPage: PageCategoryResult[] = pageNodes
			.filter((n) => n.categories[key])
			.map((n) => ({
				url: n.url,
				score: n.categories[key].score,
				issues: n.categories[key].issues,
				passed: n.categories[key].passed,
			}));
		categories[key] = aggregateCategory(labels[key], "html-audit", perPage);
	}
	return categories;
}
