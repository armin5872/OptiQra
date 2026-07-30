// lib/projectAudit.ts
//
// A live URL scan (analyze/route.ts) doesn't just list fixes — it produces a
// scored, categorized report: SEO / Performance / Accessibility / Conversions,
// each 0-100, with an issues list and a passed-checks list, via
// scoreFromIssues() + aggregateCategory() in reportAggregate.ts. Project
// uploads, by contrast, only ever produced a flat "fixed/skipped/ai-needed"
// list per file — useful, but it never told you "your project's SEO health
// is 72/100" the way a URL scan does.
//
// This module closes that gap without duplicating any analysis: every check
// that already runs during a project scan (markupFixes.ts, jsxAutoFix.ts,
// autoFixEngine.ts for full HTML/Astro documents, projectFixEngine.ts for
// project-wide files like robots.txt/sitemap.xml/security headers) already
// tags its own result with a `category` and `severity` — this just rolls
// those results up into the same six-bucket, scored shape, the same way
// reportAggregate.ts rolls many pages' results into one category card.
//
// Two buckets here — Security and Best Practices — have no equivalent in
// the URL-scan report at all, because they cover things (hardcoded secrets,
// XSS-risk bindings, missing list keys, leftover console.log/debugger
// statements) that only exist in source code, never in rendered HTML a
// live crawl could see. Scoring them separately means they show up as their
// own card rather than silently dragging down an unrelated category.

import { issue, pass, scoreFromIssues, type Issue, type Severity } from "@/lib/auditUtils";
import type { AutoFixResult } from "@/lib/autoFixEngine";

export interface ProjectFileResultLike {
	path: string;
	results: AutoFixResult[];
}

export interface ProjectCategory {
	label: string;
	score: number;
	issues: Issue[];
	passed: Issue[];
	source: string;
	filesAnalyzed: number;
}

const CATEGORY_KEY: Record<string, string> = {
	SEO: "seo",
	Accessibility: "a11y",
	Performance: "speed",
	Conversions: "conversions",
	Security: "security",
	"Best Practices": "bestPractices",
};

const CATEGORY_LABEL: Record<string, string> = {
	seo: "SEO",
	a11y: "Accessibility",
	speed: "Performance",
	conversions: "Conversions",
	security: "Security",
	bestPractices: "Best Practices",
};

const CATEGORY_ORDER = ["seo", "speed", "a11y", "conversions", "security", "bestPractices"];

const SEVERITY_WEIGHT: Record<Severity, number> = {
	critical: 16,
	high: 10,
	medium: 6,
	low: 3,
	informational: 1,
	good: 0,
};

const GENERIC_FIX_HINT: Record<string, string> = {
	seo: "Update the file(s) listed to resolve this.",
	a11y: "Update the markup so assistive tech gets a clear, correct signal.",
	speed: "Apply the change directly in the file(s) listed.",
	conversions: "Adjust the form/CTA copy or fields as noted.",
	security: "Treat this as already exploitable until it's fixed — don't wait for a scheduled cleanup.",
	bestPractices: "Clean this up before it ships to production.",
};

function slugify(input: string): string {
	return input
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/(^-+|-+$)/g, "") || "issue";
}

/** Rolls every per-file (and project-wide) AutoFixResult produced while
 *  scanning an uploaded project into the same six-category, 0-100-scored
 *  report shape a live URL scan produces — so "how healthy is this project"
 *  means the same thing whether it came from crawling a URL or uploading
 *  source. `category`/`severity` on each result is decided once, at the
 *  point the underlying check runs; this function only aggregates, it
 *  never re-judges what bucket something belongs in.
 *
 *  Deterministically auto-fixable results ("fixed"/"duplicated") count as
 *  passed checks rather than open issues — consistent with how the rest of
 *  this product already treats a "fixed" result as a positive outcome
 *  regardless of whether the run was audit-only (a scratch copy) or a real
 *  auto-fix (persisted to the output zip): either way, it's something
 *  Optiqra already knows how to resolve safely with zero manual effort. */
export function buildProjectCategoryReport(
	perFileResults: ProjectFileResultLike[],
	projectWideResults: AutoFixResult[],
): Record<string, ProjectCategory> {
	const issueBuckets: Record<string, Map<string, Issue & { affectedFiles: Set<string> }>> = {};
	const passedBuckets: Record<string, Map<string, Issue>> = {};
	for (const key of CATEGORY_ORDER) {
		issueBuckets[key] = new Map();
		passedBuckets[key] = new Map();
	}

	const record = (filePath: string, r: AutoFixResult) => {
		const key = CATEGORY_KEY[r.category];
		if (!key) return; // an unrecognized category string shouldn't crash the whole report
		const id = slugify(r.title);
		const isResolved = r.status === "fixed" || r.status === "duplicated";
		if (isResolved) {
			if (!passedBuckets[key].has(id)) passedBuckets[key].set(id, pass(id, r.title));
			return;
		}
		const existing = issueBuckets[key].get(id);
		if (existing) {
			existing.affectedFiles.add(filePath);
			return;
		}
		const weight = SEVERITY_WEIGHT[r.severity] ?? 3;
		issueBuckets[key].set(id, {
			...issue(id, r.title, r.note, GENERIC_FIX_HINT[key], weight, r.severity),
			affectedFiles: new Set([filePath]),
		});
	};

	for (const f of perFileResults) {
		for (const r of f.results) record(f.path, r);
	}
	for (const r of projectWideResults) record("(project-wide)", r);

	const categories: Record<string, ProjectCategory> = {};
	for (const key of CATEGORY_ORDER) {
		const rawIssues = Array.from(issueBuckets[key].values())
			.sort((a, b) => b.weight - a.weight)
			.map(({ affectedFiles, ...iss }) => {
				const fileCount = affectedFiles.size;
				const first = Array.from(affectedFiles)[0];
				const suffix = fileCount > 1 ? ` (found in ${fileCount} files)` : first ? ` (${first})` : "";
				return { ...iss, detail: `${iss.detail}${suffix}` };
			});
		const passed = Array.from(passedBuckets[key].values());
		categories[key] = {
			label: CATEGORY_LABEL[key],
			score: scoreFromIssues(rawIssues),
			issues: rawIssues,
			passed,
			source: "project-upload-audit",
			filesAnalyzed: perFileResults.length,
		};
	}
	return categories;
}

/** Simple average across every category's score, matching how the URL-scan
 *  dashboard computes its own overall number (an unweighted mean) so the
 *  two "overall score" figures are directly comparable. */
export function overallScoreFromCategories(categories: Record<string, ProjectCategory>): number {
	const scores = Object.values(categories).map((c) => c.score);
	if (scores.length === 0) return 0;
	return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
}
