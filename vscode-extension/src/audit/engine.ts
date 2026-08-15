// The orchestrator: given the project's files, runs every ported audit/fix
// module and produces both (a) a scored category report for the Dashboard
// and (b) a flat per-file issue list for Diagnostics/CodeActions. This is
// the offline equivalent of src/app/api/analyze/route.ts in the web app,
// except the "page" is a source file instead of a fetched URL.
import * as cheerio from "cheerio";
import { buildProjectCategoryReport, overallScoreFromCategories, type ProjectCategory } from "../../../src/lib/projectAudit";
import { detectProjectStack, runProjectFix, type ProjectFile, type ProjectStackKind } from "../../../src/lib/projectFixEngine";
import { isFixableSourceFile, runJsxAutoFix, type JsxFixOutcome } from "../../../src/lib/jsxAutoFix";
import { runAutoFix, type AutoFixResult } from "../../../src/lib/autoFixEngine";
import { analyzeSEO, analyzeSpeed, analyzeA11y, analyzeConversions } from "../../../src/lib/htmlAudit";
import { analyzeStructuredData } from "../../../src/lib/structuredDataAudit";
import { analyzeGEO } from "../../../src/lib/geoAudit";
import { analyzeAEO } from "../../../src/lib/aeoAudit";
import { analyzeDuplicateContent } from "../../../src/lib/duplicateContentAudit";
import { issue, pass, scoreFromIssues, type Issue } from "../../../src/lib/auditUtils";
import { getSettings } from "../settings";

export interface FileFixOutcome {
	path: string;
	outcome: JsxFixOutcome;
}

export interface AuditRun {
	categories: Record<string, ProjectCategory>;
	overallScore: number;
	stack: { kind: ProjectStackKind; summary: string; guidance: string };
	perFileResults: { path: string; results: AutoFixResult[] }[];
	perFileOutcomes: Map<string, JsxFixOutcome>; // path -> deterministic-fix outcome (content + AI targets)
	fullPageResults: Map<string, { $: cheerio.CheerioAPI; issues: Issue[]; passed: Issue[] }>;
	projectWideResults: AutoFixResult[];
	filesScanned: number;
	timestamp: number;
}

const FULL_HTML_RE = /\.(html?|astro)$/i;

function isFullHtmlDocument(path: string, content: string): boolean {
	return FULL_HTML_RE.test(path) && /<html[\s>]/i.test(content);
}

/** Runs the whole offline audit over every scanned file. Mirrors
 *  projectAudit.ts's doc comment: markupFixes/jsxAutoFix/autoFixEngine tag
 *  every result with category+severity already; this just aggregates. */
export async function runFullAudit(files: ProjectFile[], metaFiles: ProjectFile[]): Promise<AuditRun> {
	const settings = getSettings();
	const allFiles = [...files, ...metaFiles];
	const stack = detectProjectStack(allFiles);
	const perFileResults: { path: string; results: AutoFixResult[] }[] = [];
	const perFileOutcomes = new Map<string, JsxFixOutcome>();
	const fullPageResults = new Map<string, { $: cheerio.CheerioAPI; issues: Issue[]; passed: Issue[] }>();

	const fixableFiles = files.filter((f) => isFixableSourceFile(f.path, f.content));

	for (const f of fixableFiles) {
		if (isFullHtmlDocument(f.path, f.content)) {
			// Full HTML documents go through the Cheerio-based engine (same one
			// the live-URL scan path uses) instead of the text-level JSX engine.
			const $ = cheerio.load(f.content);
			const { results } = runAutoFix($, `file://${f.path}`);
			perFileResults.push({ path: f.path, results });

			const issues: Issue[] = [];
			const passed: Issue[] = [];
			try {
				const seo = await analyzeSEO($, f.content, `file://${f.path}`, { includeCrawlFiles: false });
				issues.push(...seo.issues);
				passed.push(...seo.passed);
			} catch {
				/* best-effort */
			}
			if (settings.categories.performance) {
				// No live HTTP response exists for a file on disk — a minimal
				// synthetic Response (no compression/caching headers set) lets
				// the same header-based checks run and correctly flag their
				// absence, same as an unoptimized live response would.
				const syntheticResponse = new Response(f.content, { status: 200, headers: { "content-type": "text/html" } });
				const r = analyzeSpeed($, f.content, syntheticResponse, 0);
				issues.push(...r.issues);
				passed.push(...r.passed);
			}
			if (settings.categories.accessibility) {
				const r = analyzeA11y($);
				issues.push(...r.issues);
				passed.push(...r.passed);
			}
			if (settings.categories.conversions) {
				const r = analyzeConversions($, f.content);
				issues.push(...r.issues);
				passed.push(...r.passed);
			}
			if (settings.categories.structuredData) {
				const r = analyzeStructuredData($, f.content);
				issues.push(...r.issues);
				passed.push(...r.passed);
			}
			if (settings.categories.geo) {
				const r = analyzeGEO($, f.content, `file://${f.path}`);
				issues.push(...r.issues);
				passed.push(...r.passed);
			}
			if (settings.categories.aeo) {
				const r = analyzeAEO($, f.content, `file://${f.path}`);
				issues.push(...r.issues);
				passed.push(...r.passed);
			}
			fullPageResults.set(f.path, { $, issues, passed });
		} else {
			const outcome = runJsxAutoFix(f, allFiles, `file://${f.path}`, stack.kind);
			perFileOutcomes.set(f.path, outcome);
			perFileResults.push({ path: f.path, results: outcome.results });
		}
	}

	// Duplicate-content detection across scanned full-HTML pages (byte-
	// identical / near-duplicate titles & bodies) — only meaningful with 2+
	// full HTML documents in the project, which most component-source
	// projects won't have; skipped when there's nothing to compare.
	if (settings.categories.duplicateContent && fullPageResults.size > 1) {
		const pages = Array.from(fullPageResults.keys()).map((path) => ({ url: `file://${path}`, html: files.find((f) => f.path === path)?.content ?? "" }));
		try {
			const dup = analyzeDuplicateContent(pages);
			for (const [path, r] of fullPageResults) {
				r.issues.push(...dup.issues.filter((i) => i.detail.includes(path)));
			}
		} catch {
			/* best-effort */
		}
	}

	// Project-wide fixes (robots.txt / sitemap.xml / security headers) run
	// against a *copy* so the audit never silently mutates real files.
	const scratch: ProjectFile[] = allFiles.map((f) => ({ ...f }));
	const routePaths = files.filter((f) => FULL_HTML_RE.test(f.path)).map((f) => f.path);
	const projectWideResults = runProjectFix(scratch, "", routePaths);

	const categories = buildProjectCategoryReport(perFileResults, projectWideResults);
	const overallScore = overallScoreFromCategories(categories);

	return {
		categories,
		overallScore,
		stack,
		perFileResults,
		perFileOutcomes,
		fullPageResults,
		projectWideResults,
		filesScanned: fixableFiles.length,
		timestamp: Date.now(),
	};
}

export { issue, pass, scoreFromIssues };
