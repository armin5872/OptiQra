// lib/jsxAutoFix.ts
//
// autoFixEngine.ts only ever sees a rendered, *complete* HTML document (via
// Cheerio) — <html>, <head>, the works. That's fine for a live-URL crawl or a
// static site export, but most "drop your project in" uploads are framework
// SOURCE: Next.js .tsx pages, a Vite/CRA .jsx app, a Vue .vue SFC, an Angular
// component with an inline or external template, a Svelte .svelte file, or a
// fragment .html file (an Angular templateUrl, an include, a partial) that
// has no <head> of its own. None of those parse as a full document, and most
// of them contain zero .html files anywhere in the tree — auto-fix-project
// used to hard-require at least one .html file and silently skip everything
// else, so dropping a real framework project either errored outright or, at
// best, "fixed" a stray static file in /public and left the actual app
// untouched.
//
// This engine covers the same fix categories (rel=noopener, missing alt
// text, generic CTA copy, unlabeled form fields, un-keyboard-accessible
// clickable elements, missing SEO metadata where a framework has an obvious
// per-page spot for it) directly on source text, for any of the dialects
// above. The tag-level fixes themselves (rel/alt/CTA/clickable-div/labels)
// live in markupFixes.ts, written once to understand every framework's
// attribute-binding syntax (`alt=`, `:alt=`, `[alt]=`, `alt={}` all mean the
// same thing) rather than five separate implementations.
//
// Deliberately conservative throughout: no full TS/Vue/Angular/Svelte
// parse+print (that risks reformatting code we don't fully understand, or
// mishandling a shape we didn't anticipate), so every fix only fires on a
// narrow, unambiguous textual pattern. Anything shaped differently than
// expected is left alone and reported "skipped" with a reason — never
// guessed at.

import type { AutoFixResult, AITarget, AITargetKind } from "@/lib/autoFixEngine";
import type { Severity } from "@/lib/auditUtils";
import type { ProjectFile } from "@/lib/projectFixEngine";
import {
	fixNoopener,
	fixMissingAlt,
	fixGenericCtaText,
	fixClickableDivRole,
	fixMissingFieldLabel,
	checkHashOnlyLinks,
	insertAttrBeforeClose,
	type MarkupFixContext,
} from "@/lib/markupFixes";

/** Same shape as autoFixEngine's AITarget, plus a closure that knows how to
 *  splice the AI-resolved value back into this specific file's source —
 *  there's no persistent DOM to point at like there is with Cheerio, so the
 *  "where does this go" logic has to travel with the target itself. */
export interface JsxAITarget extends AITarget {
	apply: (source: string) => string;
}

export interface JsxFixOutcome {
	content: string;
	results: AutoFixResult[];
	aiTargets: JsxAITarget[];
}

const TEST_FILE_RE = /\.(test|spec|stories)\.[jt]sx?$/;

/** Which source files this engine will look at. Extension alone is enough
 *  for the templating dialects that are unambiguously markup-bearing
 *  (.tsx/.jsx/.vue/.svelte). Plain .js/.mjs/.cjs and .ts are only worth a
 *  pass when their *content* actually looks like it renders markup or sets
 *  up an Angular component template — otherwise this would burn the
 *  per-project file-count budget on ordinary utility/logic files that have
 *  nothing for these fixers to find. */
export function isFixableSourceFile(path: string, content = ""): boolean {
	if (/\.d\.ts$/.test(path)) return false;
	if (TEST_FILE_RE.test(path)) return false;
	if (/\.(tsx|jsx)$/.test(path)) return true;
	if (/\.(vue|svelte)$/.test(path)) return true;
	if (/\.(js|mjs|cjs)$/.test(path)) {
		return /<[A-Za-z][\w.-]*[\s/>]/.test(content) || /target\s*=\s*["']_blank["']/.test(content);
	}
	if (/\.ts$/.test(path)) {
		// Angular component with an INLINE template. A templateUrl points at a
		// separate .html file, which gets picked up on its own as a fragment.
		return /@Component\s*\(/.test(content) && /template\s*:\s*`/.test(content);
	}
	return false;
}

function isPageOrLayoutFile(path: string): boolean {
	return /(^|\/)(page|layout)\.(tsx|jsx)$/.test(path);
}

function isDocumentFile(path: string): boolean {
	return /(^|\/)_document\.(tsx|jsx)$/.test(path);
}

/** Finds the index of the `}` that matches the `{` at `openIdx`, tolerating
 *  nested braces and braces inside string literals. Returns -1 if unbalanced
 *  (shouldn't happen in valid source, but we bail out rather than guess). */
function findMatchingBrace(source: string, openIdx: number): number {
	let depth = 0;
	let inString: string | null = null;
	for (let i = openIdx; i < source.length; i++) {
		const ch = source[i];
		if (inString) {
			if (ch === "\\") i++;
			else if (ch === inString) inString = null;
			continue;
		}
		if (ch === '"' || ch === "'" || ch === "`") {
			inString = ch;
			continue;
		}
		if (ch === "{") depth++;
		else if (ch === "}") {
			depth--;
			if (depth === 0) return i;
		}
	}
	return -1;
}

/** Does this file (or the nearest layout above it in the tree) already
 *  export Next.js metadata? Used so we don't flag every leaf page.tsx for
 *  "missing metadata" when the root layout already covers it. */
function ancestorHasMetadata(files: ProjectFile[], filePath: string): boolean {
	const hasMeta = (content: string) => /export\s+(const\s+metadata\b|(async\s+)?function\s+generateMetadata\b)/.test(content);
	const parts = filePath.split("/").slice(0, -1); // directory segments, no filename
	for (let depth = parts.length; depth >= 0; depth--) {
		const dir = parts.slice(0, depth);
		for (const ext of ["tsx", "jsx"]) {
			const candidate = [...dir, `layout.${ext}`].join("/");
			const f = files.find((x) => x.path === candidate);
			if (f && hasMeta(f.content)) return true;
		}
	}
	return false;
}

/**
 * Runs every deterministic + AI-collectable fix on one source file, whatever
 * dialect it's written in (React/Next JSX/TSX, Vue SFC, Angular component or
 * template, Svelte, plain JS, or a markup fragment .html file). Mirrors
 * autoFixEngine.runAutoFix's split: safe mechanical edits happen
 * immediately, anything needing authored content (a title, alt text, a CTA
 * label, an aria-label) comes back as an AITarget the caller resolves the
 * same way it already does for full HTML documents — a single batched AI
 * call, or the duplicate bank.
 */
export function runJsxAutoFix(file: ProjectFile, allFiles: ProjectFile[], pageUrl: string): JsxFixOutcome {
	let source = file.content;
	const results: AutoFixResult[] = [];
	const aiTargets: JsxAITarget[] = [];
	let counter = 0;
	const nextId = () => `jsx-${counter++}`;

	const fixed = (title: string, category: string, severity: Severity, note: string) => {
		results.push({ id: nextId(), title, category, severity, status: "fixed", note });
	};
	const skipped = (title: string, category: string, severity: Severity, note: string) => {
		results.push({ id: nextId(), title, category, severity, status: "skipped", note });
	};
	const needsAI = (
		kind: AITargetKind,
		title: string,
		category: string,
		severity: Severity,
		context: string,
		apply: (s: string) => string,
	) => {
		aiTargets.push({ id: nextId(), kind, title, category, severity, context, apply });
	};

	// ======================= Shared cross-framework fixes =======================
	// These operate directly on the raw file text: for .tsx/.jsx/.vue/.svelte
	// the markup IS the file; for an Angular component .ts file the markup
	// only lives inside its `template: \`...\`` literal, but since ordinary
	// TS logic essentially never contains literal `<img `/`<a `/`<div `
	// substrings, running the same tag-shaped regexes across the whole file
	// is safe in practice and avoids a bespoke template-literal extractor.
	const ctx: MarkupFixContext = { filePath: file.path, fixed, skipped, needsAI };
	source = fixNoopener(source, ctx);
	source = fixMissingAlt(source, ctx);
	source = fixGenericCtaText(source, ctx);
	source = fixClickableDivRole(source, ctx);
	source = fixMissingFieldLabel(source, ctx);
	checkHashOnlyLinks(source, ctx);

	// ======================= <html lang="..."> — App Router root layout =======================
	if (/(^|\/)app\/layout\.(tsx|jsx)$/.test(file.path)) {
		// Only the outermost layout.tsx (directly under an app/ dir, not a
		// nested route's layout) renders the <html> tag at all.
		const htmlTagMatch = source.match(/<html\b[^>]*>/);
		if (htmlTagMatch) {
			const tag = htmlTagMatch[0];
			if (!/\blang=/.test(tag)) {
				source = source.replace(tag, insertAttrBeforeClose(tag, 'lang="en"'));
				fixed("Missing lang attribute", "Accessibility", "high", 'Set lang="en" on the root <html> tag in layout.tsx — change this if the site isn\'t in English.');
			}
		}
	}

	// ======================= <Html lang="..."> — Pages Router _document.tsx =======================
	if (isDocumentFile(file.path)) {
		const htmlTagMatch = source.match(/<Html\b[^>]*>/);
		if (htmlTagMatch) {
			const tag = htmlTagMatch[0];
			if (!/\blang=/.test(tag)) {
				source = source.replace(tag, insertAttrBeforeClose(tag, 'lang="en"'));
				fixed("Missing lang attribute", "Accessibility", "high", 'Set lang="en" on <Html> in _document.tsx — change this if the site isn\'t in English.');
			}
		}
		// Viewport tag, if this file sets one explicitly, shouldn't disable
		// pinch-to-zoom. (If there's no explicit tag at all, Next.js already
		// injects a sensible default — nothing to add here.)
		const viewportMatch = source.match(/<meta\s+name=(["'])viewport\1\s+content=(["'])([^"']*)\2\s*\/?>/);
		if (viewportMatch && /user-scalable=no|maximum-scale=1(\.0)?\b/.test(viewportMatch[3])) {
			const cleaned = viewportMatch[3]
				.replace(/,?\s*user-scalable=no/gi, "")
				.replace(/,?\s*maximum-scale=1(\.0)?\b/gi, "")
				.replace(/^,\s*/, "");
			source = source.replace(viewportMatch[0], `<meta name=${viewportMatch[1]}viewport${viewportMatch[1]} content=${viewportMatch[2]}${cleaned || "width=device-width, initial-scale=1"}${viewportMatch[2]} />`);
			fixed("Pinch-to-zoom is disabled", "Accessibility", "medium", "Removed user-scalable=no / maximum-scale=1 from the viewport tag in _document.tsx.");
		}
	}

	// ======================= App Router metadata (title/description) =======================
	// Title and description are always split into independent AITargets —
	// each carries its own apply() that re-locates (or creates) the metadata
	// object at apply time, so either one resolving without the other
	// (AI call partially fails, only one has a duplicate-bank match, etc.)
	// still lands correctly instead of the two fighting over one insertion.
	//
	// This block is Next.js-specific by design. Vue/Svelte/Angular/CRA apps
	// don't have a per-file convention this safe to pattern-match against —
	// their <title>/<meta description> live in the single index.html entry
	// point instead, which the full-document Cheerio pass already covers.
	if (isPageOrLayoutFile(file.path)) {
		const metaMatch = source.match(/export\s+const\s+metadata(?:\s*:\s*Metadata)?\s*=\s*/);
		const hasGenerateMetadata = /export\s+(async\s+)?function\s+generateMetadata\b/.test(source);

		const patchField = (field: "title" | "description", placeholder: string) => (src: string): string => {
			const m = src.match(/export\s+const\s+metadata(?:\s*:\s*Metadata)?\s*=\s*/);
			if (m) {
				const braceIdx = src.indexOf("{", m.index! + m[0].length - 1);
				const closeIdx = braceIdx >= 0 ? findMatchingBrace(src, braceIdx) : -1;
				if (braceIdx >= 0 && closeIdx > braceIdx) {
					const block = src.slice(braceIdx, closeIdx + 1);
					if (new RegExp(`\\b${field}\\s*:`).test(block)) return src; // already there
					return src.slice(0, braceIdx + 1) + `\n  ${field}: "${placeholder}",` + src.slice(braceIdx + 1);
				}
			}
			// No metadata export yet (or couldn't locate its braces safely) —
			// create a fresh one after the last import, so a sibling target
			// that hasn't applied yet still finds an object to patch into.
			const importLine = /^(?:import[^\n]*\n)+/m;
			const insertion = `export const metadata = {\n  ${field}: "${placeholder}",\n};\n\n`;
			const im = src.match(importLine);
			if (im) return src.slice(0, im[0].length) + insertion + src.slice(im[0].length);
			return insertion + src;
		};

		if (hasGenerateMetadata) {
			skipped(
				"SEO metadata",
				"SEO",
				"medium",
				"This file computes metadata dynamically with generateMetadata() — review its title/description by hand rather than risk breaking the function.",
			);
		} else {
			const braceIdx = metaMatch ? source.indexOf("{", metaMatch.index! + metaMatch[0].length - 1) : -1;
			const closeIdx = braceIdx >= 0 ? findMatchingBrace(source, braceIdx) : -1;
			const block = braceIdx >= 0 && closeIdx > braceIdx ? source.slice(braceIdx, closeIdx + 1) : "";
			const hasTitle = metaMatch ? /\btitle\s*:/.test(block) : false;
			const hasDescription = metaMatch ? /\bdescription\s*:/.test(block) : false;
			const brokenBlock = !!metaMatch && closeIdx <= braceIdx;
			const coveredByAncestor = !metaMatch && ancestorHasMetadata(allFiles, file.path);

			if (brokenBlock) {
				skipped("SEO metadata", "SEO", "medium", "Found a `metadata` export but couldn't safely locate its closing brace — check title/description by hand.");
			} else if ((metaMatch && hasTitle && hasDescription) || coveredByAncestor) {
				// Already has both fields (or a parent layout already provides
				// metadata and this file doesn't override it) — judging whether
				// existing copy is any good needs the same care the HTML engine
				// gives it, which a blind string patch can't safely do here.
			} else {
				if (!hasTitle) {
					needsAI(
						"title",
						metaMatch ? "Missing title in page metadata" : "No metadata export found",
						"SEO",
						"critical",
						`File: ${file.path}. URL: ${pageUrl}.${block ? ` Existing metadata object: ${block.slice(0, 300)}` : ""}`,
						patchField("title", "__TITLE_PLACEHOLDER__"),
					);
				}
				if (!hasDescription) {
					needsAI(
						"meta-description",
						metaMatch ? "Missing description in page metadata" : "No metadata export found",
						"SEO",
						"high",
						`File: ${file.path}. URL: ${pageUrl}.${block ? ` Existing metadata object: ${block.slice(0, 300)}` : ""}`,
						patchField("description", "__DESC_PLACEHOLDER__"),
					);
				}
			}
		}
	}

	return { content: source, results, aiTargets };
}

/** Splices AI (or duplicate-bank) resolved values into `source` using the
 *  `apply` closures `runJsxAutoFix` attached to each target, replacing the
 *  placeholder tokens those closures leave behind. Mirrors
 *  autoFixEngine.applyAITargetValues but for raw text instead of a DOM.
 *
 *  Different placeholder tokens get different escaping because they land in
 *  different syntactic contexts: __TITLE_PLACEHOLDER__/__DESC_PLACEHOLDER__
 *  sit inside a real JS string literal (Next's `metadata` object), so they
 *  need JS-string escaping; __ATTR_PLACEHOLDER__ sits inside a double-quoted
 *  HTML/JSX/Vue/Angular tag attribute, so it needs HTML-attribute escaping;
 *  __TEXT_PLACEHOLDER__ sits as element text content, so it needs HTML-text
 *  escaping. Using JS-string escaping for all three (as an earlier version
 *  of this file did) would leave a literal backslash in front of any quote
 *  inside alt text or CTA copy, since backslash isn't an escape character in
 *  HTML/JSX attribute or text position. */
export function applyJsxAITargetValues(
	source: string,
	targets: JsxAITarget[],
	values: Record<string, string>,
	sourceLabel: "ai" | "duplicate",
): { content: string; results: AutoFixResult[] } {
	const results: AutoFixResult[] = [];
	let content = source;

	for (const target of targets) {
		const value = values[target.id];
		if (!value) {
			results.push({
				id: target.id,
				title: target.title,
				category: target.category,
				severity: target.severity,
				status: "skipped",
				note: "No AI provider configured and no matching fix on file to reuse — left unfixed.",
			});
			continue;
		}
		const before = content;
		content = target.apply(content);
		if (content === before) {
			// The anchor text the apply() closure was looking for wasn't there
			// (an earlier fix in this same pass already touched that region) —
			// fail safe instead of silently doing nothing.
			results.push({
				id: target.id,
				title: target.title,
				category: target.category,
				severity: target.severity,
				status: "skipped",
				note: "Couldn't safely locate the exact spot to insert this fix after other edits — left unfixed.",
			});
			continue;
		}
		content = content
			.replace("__ATTR_PLACEHOLDER__", escapeForTagAttr(value))
			.replace("__TEXT_PLACEHOLDER__", escapeForTagText(value))
			.replace("__TITLE_PLACEHOLDER__", escapeForJsStringLiteral(value))
			.replace("__DESC_PLACEHOLDER__", escapeForJsStringLiteral(value));

		results.push({
			id: target.id,
			title: target.title,
			category: target.category,
			severity: target.severity,
			status: sourceLabel === "ai" ? "fixed" : "duplicated",
			note: sourceLabel === "ai" ? `AI-generated: "${truncate(value, 80)}"` : `Reused a similar fix generated earlier this session: "${truncate(value, 80)}"`,
		});
	}

	return { content, results };
}

/** Used for values placed inside a real JS string literal (Next's `metadata`
 *  object: `title: "..."`) — needs JS string escaping. */
function escapeForJsStringLiteral(s: string): string {
	return s
		.replace(/\\/g, "\\\\")
		.replace(/"/g, '\\"')
		.replace(/\n/g, " ")
		.trim();
}

/** Used for values placed inside a double-quoted tag attribute
 *  (alt="...", aria-label="...") in any of the frameworks this engine
 *  touches — HTML entity escaping, since backslash has no special meaning
 *  there. */
function escapeForTagAttr(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/"/g, "&quot;")
		.replace(/\n/g, " ")
		.trim();
}

/** Used for values placed as element text content (CTA label text). */
function escapeForTagText(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/\n/g, " ")
		.trim();
}

function truncate(s: string, n: number): string {
	return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
