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
	if (/\.(vue|svelte|astro)$/.test(path)) return true;
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

/** Astro files fence optional frontmatter (component script) at the very top
 *  between a pair of `---` lines. Everything from the second fence onward is
 *  the actual HTML-like template — the only region safe to run tag-level
 *  fixes and head-tag insertions against. Returns the template's start
 *  offset (0 if there's no frontmatter at all, which is valid Astro). */
function astroTemplateStart(source: string): number {
	const m = source.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
	return m ? m[0].length : 0;
}

/** Whether this .astro file renders a full document shell (has its own
 *  <html>/<head>) — Astro layout components typically do; leaf/island
 *  components that get slotted into a layout typically don't. Only document
 *  shells are safe targets for the head-tag fixes below (lang/meta/title/
 *  canonical/OG); the shared tag-level fixes (alt/noopener/CTA/labels) still
 *  run on every .astro file via the common markupFixes pass regardless. */
function isAstroDocumentFile(path: string, source: string): boolean {
	if (!/\.astro$/.test(path)) return false;
	return /<html\b[^>]*>/i.test(source.slice(astroTemplateStart(source)));
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

	// ======================= Astro document shell (<html>/<head> in a .astro layout) =======================
	// Astro files fence an optional JS "frontmatter" component script at the
	// top with a pair of `---` lines; only the part after that fence is the
	// actual template. Cheerio isn't used here at all — parsing an .astro
	// file as HTML would treat the frontmatter as stray text and could
	// relocate or mangle it, since it isn't valid HTML. Every fix below is a
	// narrow, anchored text edit confined to the substring after the fence
	// (and, for anything landing in <head>, further confined to the first
	// <head>...</head> span — head never nests another head, so the first
	// closing tag found is always the right one).
	if (isAstroDocumentFile(file.path, source)) {
		const templateStart = astroTemplateStart(source);

		const htmlTagMatch = source.slice(templateStart).match(/<html\b[^>]*>/i);
		if (htmlTagMatch && !/\blang\s*=/i.test(htmlTagMatch[0])) {
			const newTag = insertAttrBeforeClose(htmlTagMatch[0], 'lang="en"');
			source = source.slice(0, templateStart) + source.slice(templateStart).replace(htmlTagMatch[0], newTag);
			fixed("Missing lang attribute", "Accessibility", "high", 'Set lang="en" on the root <html> tag — change this if the site isn\'t in English.');
		}

		// Every helper below re-derives <head>'s open/close position from the
		// CURRENT `source` on every call, rather than caching an offset —
		// caching would go stale the moment any earlier insertion shifts the
		// text, and a stale offset here means splicing into the wrong spot
		// (mid-tag, or past </head> into <body>). Recomputing is cheap at
		// this file count and is the only way to keep every insertion
		// anchored correctly regardless of how many fixes already landed.
		const headBounds = (): { openEnd: number; closeStart: number } | null => {
			const afterTemplate = source.slice(templateStart);
			const openMatch = afterTemplate.match(/<head\b[^>]*>/i);
			if (!openMatch) return null;
			const openEnd = templateStart + afterTemplate.indexOf(openMatch[0]) + openMatch[0].length;
			const closeStart = source.indexOf("</head>", openEnd);
			if (closeStart < 0) return null;
			return { openEnd, closeStart };
		};
		const headBlock = (): string => {
			const b = headBounds();
			return b ? source.slice(b.openEnd, b.closeStart) : "";
		};
		/** Inserts immediately before </head> — the safe default spot for any
		 *  new tag, since it never has to reason about what else is already
		 *  in <head> or in what order. */
		const insertBeforeHeadClose = (snippet: string) => {
			const b = headBounds();
			if (!b) return;
			source = source.slice(0, b.closeStart) + snippet + source.slice(b.closeStart);
		};
		/** Only charset needs to land right after <head>, not just "somewhere
		 *  in it" — the HTML spec requires it within the first 1024 bytes,
		 *  and convention is first child of <head>. */
		const insertAfterHeadOpen = (snippet: string) => {
			const b = headBounds();
			if (!b) return;
			source = source.slice(0, b.openEnd) + snippet + source.slice(b.openEnd);
		};

		if (headBounds()) {
			if (!/<meta\s+charset=/i.test(headBlock())) {
				insertAfterHeadOpen(`\n\t\t<meta charset="utf-8">`);
				fixed("Missing charset declaration", "SEO", "medium", 'Added <meta charset="utf-8"> as the first tag in <head>.');
			}

			const viewportMatch = headBlock().match(/<meta\s+name=(["'])viewport\1\s+content=(["'])([^"']*)\2\s*\/?>/i);
			if (!viewportMatch) {
				insertBeforeHeadClose(`\n\t\t<meta name="viewport" content="width=device-width, initial-scale=1">`);
				fixed("No responsive viewport meta tag", "Conversions", "high", "Added a standard responsive viewport meta tag.");
			} else if (/user-scalable=no|maximum-scale=1(\.0)?\b/i.test(viewportMatch[3])) {
				const cleaned = viewportMatch[3]
					.replace(/,?\s*user-scalable=no/gi, "")
					.replace(/,?\s*maximum-scale=1(\.0)?\b/gi, "")
					.replace(/^,\s*/, "");
				source = source.replace(viewportMatch[0], `<meta name=${viewportMatch[1]}viewport${viewportMatch[1]} content=${viewportMatch[2]}${cleaned || "width=device-width, initial-scale=1"}${viewportMatch[2]} />`);
				fixed("Pinch-to-zoom is disabled", "Accessibility", "medium", "Removed user-scalable=no / maximum-scale=1 from the viewport tag.");
			}

			if (!/<link\s+rel=(["'])(?:shortcut )?icon\1/i.test(headBlock())) {
				insertBeforeHeadClose(`\n\t\t<link rel="icon" href="/favicon.ico">`);
				fixed("Missing favicon", "SEO", "low", 'Added <link rel="icon" href="/favicon.ico"> — make sure a favicon.ico actually exists at that path.');
			}

			if (!/<link\s+rel=(["'])canonical\1\s+href=/i.test(headBlock())) {
				insertBeforeHeadClose(`\n\t\t<link rel="canonical" href="${pageUrl}">`);
				fixed("Missing canonical tag", "SEO", "medium", `Added a self-referencing canonical tag pointing at ${pageUrl}.`);
			}

			// Title/description: only handled when they're static text — a
			// dynamic Astro expression (`<title>{frontmatterVar}</title>`)
			// could be anything at runtime, and guessing past a `{…}`
			// interpolation risks writing content that fights whatever the
			// frontmatter script actually computes. Static-only, same
			// conservative bar as everywhere else in this file.
			const titleMatch = headBlock().match(/<title>([^<{}]*)<\/title>/i);
			const hasDynamicTitle = /<title>[\s\S]*?\{[\s\S]*?<\/title>/i.test(headBlock());
			const titleText = titleMatch?.[1]?.trim() || "";
			if (!titleMatch && !hasDynamicTitle) {
				needsAI(
					"title",
					"Title tag is missing",
					"SEO",
					"critical",
					`File: ${file.path}. URL: ${pageUrl}.`,
					(s) => {
						const closeIdx = s.indexOf("</head>");
						if (closeIdx < 0) return s;
						return s.slice(0, closeIdx) + `\t\t<title>__TEXT_PLACEHOLDER__</title>\n` + s.slice(closeIdx);
					},
				);
			} else if (titleMatch && (titleText.length < 10 || titleText.length > 65)) {
				skipped(
					"Title tag length is off",
					"SEO",
					"medium",
					`Current title ("${titleText.length} chars"): "${titleText}" — rewrite to 50-60 characters by hand.`,
				);
			}

			const descMatch = headBlock().match(/<meta\s+name=(["'])description\1\s+content=(["'])([^"']*)\2/i);
			const hasDynamicDesc = /<meta\s+name=(["'])description\1\s+content=(["'])[^"']*\{[^"']*\2/i.test(headBlock());
			if (!descMatch && !hasDynamicDesc) {
				needsAI(
					"meta-description",
					"No meta description",
					"SEO",
					"high",
					`Page title: "${titleText}". File: ${file.path}. URL: ${pageUrl}.`,
					(s) => {
						const closeIdx = s.indexOf("</head>");
						if (closeIdx < 0) return s;
						return s.slice(0, closeIdx) + `\t\t<meta name="description" content="__ATTR_PLACEHOLDER__">\n` + s.slice(closeIdx);
					},
				);
			}

			// og:title/og:description: only a safe deterministic mirror when
			// this file's own title/description are static (resolved above)
			// — never invent a value here, and never mirror a dynamic
			// expression as if it were the literal string.
			if (titleMatch && !/property=(["'])og:title\1/i.test(headBlock())) {
				insertBeforeHeadClose(`\n\t\t<meta property="og:title" content="${titleText.replace(/"/g, "&quot;")}">`);
				fixed("og:title missing", "SEO", "medium", "Mirrored the existing <title> into an og:title tag.");
			}
			if (descMatch && !/property=(["'])og:description\1/i.test(headBlock())) {
				insertBeforeHeadClose(`\n\t\t<meta property="og:description" content="${descMatch[3].replace(/"/g, "&quot;")}">`);
				fixed("og:description missing", "SEO", "medium", "Mirrored the existing meta description into og:description.");
			}
		}
	}

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
	confidence: Record<string, "high" | "low"> = {},
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

		const lowConfidence = sourceLabel === "ai" && confidence[target.id] === "low";
		results.push({
			id: target.id,
			title: target.title,
			category: target.category,
			severity: target.severity,
			status: sourceLabel === "ai" ? (lowConfidence ? "needs-review" : "fixed") : "duplicated",
			note:
				sourceLabel === "ai"
					? lowConfidence
						? `AI flagged this as a low-confidence guess: "${truncate(value, 80)}" — the context wasn't specific enough to be sure; double-check before trusting it.`
						: `AI-generated: "${truncate(value, 80)}"`
					: `Reused a similar fix generated earlier this session: "${truncate(value, 80)}"`,
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
