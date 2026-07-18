// lib/jsxAutoFix.ts
//
// autoFixEngine.ts only ever sees a rendered HTML document (via Cheerio).
// That's fine for a live-URL crawl or a static site export, but most
// "drop your project in" uploads are framework SOURCE — Next.js .tsx pages,
// a Vite/CRA .jsx app — which may contain zero .html files anywhere in the
// tree. auto-fix-project used to hard-require at least one .html file and
// silently skip everything else, so dropping a real Next.js project either
// errored outright or, at best, "fixed" a stray static file in /public and
// left the actual app untouched.
//
// This engine covers the same fix categories (rel=noopener, missing alt
// text, missing lang, generic CTA copy, missing SEO metadata) directly on
// JSX/TSX source text. It's deliberately more conservative than the Cheerio
// engine: we don't run this through a full TS/Babel parse+print (that risks
// reformatting code we don't fully understand, or mishandling a shape we
// didn't anticipate), so every fix here only fires on a narrow, unambiguous
// textual pattern. Anything shaped differently than expected is left alone
// and reported "skipped" with a reason — never guessed at.

import type { AutoFixResult, AITarget, AITargetKind } from "@/lib/autoFixEngine";
import type { Severity } from "@/lib/auditUtils";
import type { ProjectFile } from "@/lib/projectFixEngine";

const GENERIC_CTA_WORDS = new Set(["submit", "click here", "here", "go", "learn more", "read more"]);

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

export function isFixableSourceFile(path: string): boolean {
	return /\.(tsx|jsx)$/.test(path) && !/\.(test|spec|stories)\.(tsx|jsx)$/.test(path);
}

function isPageOrLayoutFile(path: string): boolean {
	return /(^|\/)(page|layout)\.(tsx|jsx)$/.test(path);
}

function isDocumentFile(path: string): boolean {
	return /(^|\/)_document\.(tsx|jsx)$/.test(path);
}

function slugToWords(slug: string): string {
	return slug
		.replace(/\.[a-z0-9]+$/i, "")
		.replace(/[-_]+/g, " ")
		.replace(/%20/g, " ")
		.trim();
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

/** A tag-matching regex like `<img\b[^>]*>` will stop at the FIRST literal
 *  `>` it sees — which, if the tag has a JSX arrow-function attribute
 *  (`onLoad={() => ...}`), is the `>` inside `=>`, not the tag's real end.
 *  That gives a truncated, mid-attribute "tag" string that would corrupt
 *  the file if we inserted into it. Bail out on that shape instead. */
function looksTruncatedByArrow(tag: string): boolean {
	return /=>\s*$/.test(tag);
}

function insertAttrBeforeClose(tag: string, attr: string): string {
	// Self-closing (`... />`) or a plain opener (`...>`) — insert right before
	// whichever closer is present, keeping a single space before the new attr.
	if (/\/>\s*$/.test(tag)) return tag.replace(/\/>\s*$/, ` ${attr} />`);
	return tag.replace(/>\s*$/, ` ${attr}>`);
}

/**
 * Runs every deterministic + AI-collectable fix on one JSX/TSX source file.
 * Mirrors autoFixEngine.runAutoFix's split: safe mechanical edits happen
 * immediately, anything needing authored content (a title, alt text, a CTA
 * label) comes back as an AITarget the caller resolves the same way it
 * already does for HTML — a single batched AI call, or the duplicate bank.
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

	// ======================= target=_blank without rel=noopener =======================
	{
		let count = 0;
		let dynamicSkipped = 0;
		source = source.replace(/<a\b[^>]*>/g, (tag) => {
			if (looksTruncatedByArrow(tag)) return tag; // e.g. onClick={() => ...} inside the tag — bail, don't risk corrupting it
			if (!/target=(["'])_blank\1/.test(tag)) return tag;
			if (/\brel=\{/.test(tag)) {
				dynamicSkipped++;
				return tag; // rel is a dynamic expression — don't guess what it resolves to
			}
			const relMatch = tag.match(/\brel=(["'])([^"']*)\1/);
			if (relMatch) {
				const relVal = relMatch[2].toLowerCase();
				if (relVal.includes("noopener") && relVal.includes("noreferrer")) return tag;
				const parts = new Set(relMatch[2].split(/\s+/).filter(Boolean));
				parts.add("noopener");
				parts.add("noreferrer");
				count++;
				return tag.slice(0, relMatch.index!) + `rel=${relMatch[1]}${Array.from(parts).join(" ")}${relMatch[1]}` + tag.slice(relMatch.index! + relMatch[0].length);
			}
			count++;
			return insertAttrBeforeClose(tag, 'rel="noopener noreferrer"');
		});
		if (count > 0) {
			fixed(
				"target=_blank links missing rel=noopener",
				"Conversions",
				"medium",
				`Added rel="noopener noreferrer" to ${count} new-tab link${count === 1 ? "" : "s"} to close the tabnabbing gap.`,
			);
		}
		if (dynamicSkipped > 0) {
			skipped(
				"target=_blank links with a dynamic rel",
				"Conversions",
				"medium",
				`${dynamicSkipped} link${dynamicSkipped === 1 ? " has" : "s have"} rel={...} as an expression — check by hand that it includes noopener/noreferrer.`,
			);
		}
	}

	// ======================= <img>/<Image> missing alt text =======================
	{
		let deterministic = 0;
		source = source.replace(/<(img|Image)\b[^>]*\/?>/g, (tag, tagName) => {
			if (looksTruncatedByArrow(tag)) return tag; // e.g. onLoad={() => ...} inside the tag — bail, don't risk corrupting it
			if (/\balt=/.test(tag)) return tag; // already has one, static or dynamic — leave it
			const srcMatch = tag.match(/\bsrc=(["'])([^"']*)\1/);
			const staticSrc = srcMatch?.[2];
			if (staticSrc && !/^https?:\/\//.test(staticSrc)) {
				const guess = slugToWords(staticSrc.split("/").filter(Boolean).pop() || "");
				if (guess.length > 2 && guess.length < 60 && !/^[0-9a-f]{6,}$/i.test(guess.replace(/\s/g, ""))) {
					const capitalized = guess.replace(/\b\w/g, (c) => c.toUpperCase());
					deterministic++;
					return insertAttrBeforeClose(tag, `alt="${escapeForJsxAttr(capitalized)}"`);
				}
			}
			// Dynamic src, a hash-looking filename, or no src at all — needs a
			// human/AI description of what's actually in the image.
			needsAI(
				"alt-text",
				"Image missing alt text",
				"Accessibility",
				"high",
				`<${tagName}> tag in ${file.path}. src="${staticSrc || "(dynamic)"}"`,
				(src) => src.replace(tag, insertAttrBeforeClose(tag, `alt="__PLACEHOLDER__"`)),
			);
			return tag;
		});
		if (deterministic > 0) {
			fixed(
				"Image missing alt text",
				"Accessibility",
				"high",
				`Filled in alt text for ${deterministic} image${deterministic === 1 ? "" : "s"} based on its filename — reword any that read awkwardly.`,
			);
		}
	}

	// ======================= Generic CTA text =======================
	{
		let deterministic = 0;
		source = source.replace(/<(a|button)\b([^>]*)>\s*([A-Za-z][A-Za-z ]{1,20})\s*<\/\1>/g, (whole, el, attrs, text) => {
			const norm = text.trim().toLowerCase();
			if (!GENERIC_CTA_WORDS.has(norm)) return whole;
			const hrefMatch = attrs.match(/\bhref=(["'])([^"']*)\1/);
			const href = hrefMatch?.[2] || "";
			const guess = slugToWords(href.split("/").filter(Boolean).pop() || "");
			if (guess.length > 2 && guess.length < 40) {
				const capitalized = guess.replace(/\b\w/g, (c) => c.toUpperCase());
				deterministic++;
				return `<${el}${attrs}>${capitalized}</${el}>`;
			}
			needsAI(
				"cta-text",
				"Generic call-to-action text",
				"Conversions",
				"low",
				`Current text: "${text.trim()}". Href (if any): "${href}". File: ${file.path}`,
				(src) => src.replace(whole, `<${el}${attrs}>__PLACEHOLDER__</${el}>`),
			);
			return whole;
		});
		if (deterministic > 0) {
			fixed(
				"Generic call-to-action text",
				"Conversions",
				"low",
				`Renamed ${deterministic} generic link${deterministic === 1 ? "" : "s"} based on its href.`,
			);
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
 *  autoFixEngine.applyAITargetValues but for raw text instead of a DOM. */
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
			.replace("__PLACEHOLDER__", escapeForJsxAttr(value))
			.replace("__TITLE_PLACEHOLDER__", escapeForJsxAttr(value))
			.replace("__DESC_PLACEHOLDER__", escapeForJsxAttr(value));

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

function escapeForJsxAttr(s: string): string {
	// The placeholders this replaces always sit inside a double-quoted JS/TSX
	// string literal (a JSX attribute value or an object property), so this
	// needs JS string escaping — not HTML entities, which would show up as
	// literal "&quot;" text in the rendered page.
	return s
		.replace(/\\/g, "\\\\")
		.replace(/"/g, '\\"')
		.replace(/\n/g, " ")
		.trim();
}

function truncate(s: string, n: number): string {
	return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
