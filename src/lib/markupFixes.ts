// lib/markupFixes.ts
//
// Dialect-agnostic, text-level markup fixes shared by every non-full-HTML-
// document source file the project auto-fixer touches: React/Next JSX & TSX,
// Vue SFCs, Angular templates (inline in a @Component decorator, or an
// external .html templateUrl file), Svelte components, and plain JS/TS files
// that assemble markup via template literals.
//
// All of these render tags with the same *names* (img, a, button, div…) even
// though the attribute-binding syntax differs — :alt="x" (Vue), [alt]="x"
// (Angular), alt={x} (React/Svelte) all mean "alt is already set, don't touch
// it". That's the insight this module leans on: rather than writing five
// separate parsers, every fixer here works off tag-name + attribute-shape
// regexes that already understand all four binding syntaxes, and is applied
// directly to the file's raw text regardless of which framework it's from.
//
// Same conservative rule as everywhere else in auto-fix: every fixer only
// acts on a narrow, unambiguous textual pattern, and bails out (silently, or
// reported "skipped") on anything shaped differently — never a guess.

import type { Severity } from "@/lib/auditUtils";
import type { AITargetKind } from "@/lib/autoFixEngine";

export type FixedFn = (title: string, category: string, severity: Severity, note: string) => void;
export type SkippedFn = (title: string, category: string, severity: Severity, note: string) => void;
export type NeedsAIFn = (
	kind: AITargetKind,
	title: string,
	category: string,
	severity: Severity,
	context: string,
	apply: (s: string) => string,
) => void;

export interface MarkupFixContext {
	filePath: string;
	fixed: FixedFn;
	skipped: SkippedFn;
	needsAI: NeedsAIFn;
}

// Tag names that render as a real anchor/button at runtime across the
// frameworks this tool understands, and therefore matter for
// target=_blank/rel and generic-CTA-text checks.
const ANCHOR_TAGS = "a|Link|NuxtLink|nuxt-link|router-link|RouterLink";
const CTA_TAGS = `${ANCHOR_TAGS}|button`;
const IMAGE_TAGS = "img|Image|NuxtImg|nuxt-img|Img";
const GENERIC_CTA_WORDS = new Set(["submit", "click here", "here", "go", "learn more", "read more"]);
const CLICK_ATTR_RE = /(?:^|\s)(?:onClick|onclick|@click(?:\.\w+)*|v-on:click|\(click\)|on:click)\s*=/;

export function slugToWords(slug: string): string {
	return slug
		.replace(/\.[a-z0-9]+$/i, "")
		.replace(/[-_]+/g, " ")
		.replace(/%20/g, " ")
		.trim();
}

/** A tag-matching regex like `<img\b[^>]*>` stops at the FIRST literal `>` it
 *  sees — which, if the tag has an arrow-function attribute/binding
 *  (`onLoad={() => ...}`, `onClick={() => ...}`), is the `>` inside `=>`, not
 *  the tag's real end. That gives a truncated, mid-attribute "tag" string
 *  that would corrupt the file if we inserted into it. Bail out on that
 *  shape instead of guessing where the tag actually ends. */
export function looksTruncatedByArrow(tag: string): boolean {
	return /=>\s*$/.test(tag);
}

export function insertAttrBeforeClose(tag: string, attr: string): string {
	if (/\/>\s*$/.test(tag)) return tag.replace(/\/>\s*$/, ` ${attr} />`);
	return tag.replace(/>\s*$/, ` ${attr}>`);
}

/** True if `tag` already sets `name` in ANY dialect's binding syntax: static
 *  (name="x"), React/Svelte dynamic (name={x}), Svelte shorthand ({name}),
 *  Vue (:name="x" / v-bind:name="x"), or Angular ([name]="x"). */
export function hasAttr(tag: string, name: string): boolean {
	const bound = new RegExp(`(?:^|\\s)(?:${name}|:${name}|v-bind:${name}|\\[${name}\\])\\s*=`, "i");
	const shorthand = new RegExp(`\\{\\s*${name}\\s*\\}`);
	return bound.test(tag) || shorthand.test(tag);
}

/** True if `tag` sets `name` to a dynamic/expression value (any framework's
 *  binding syntax) rather than a plain string literal — used so fixes never
 *  guess what a binding resolves to. */
export function hasDynamicAttr(tag: string, name: string): boolean {
	return (
		new RegExp(`\\b${name}\\s*=\\s*\\{`).test(tag) ||
		new RegExp(`(?:^|\\s):${name}\\s*=`).test(tag) ||
		new RegExp(`(?:^|\\s)v-bind:${name}\\s*=`).test(tag) ||
		new RegExp(`(?:^|\\s)\\[${name}\\]\\s*=`).test(tag)
	);
}

function isInsideLabel(source: string, idx: number): boolean {
	const before = source.slice(Math.max(0, idx - 400), idx);
	const opens = (before.match(/<label\b/g) || []).length;
	const closes = (before.match(/<\/label>/g) || []).length;
	return opens > closes;
}

/** target=_blank without rel=noopener/noreferrer — <a> tags and any Link-like
 *  component (Next's Link, Nuxt's NuxtLink, Vue Router's router-link, …)
 *  that passes target/rel straight through to a rendered <a>. */
export function fixNoopener(source: string, ctx: MarkupFixContext): string {
	let count = 0;
	let dynamicSkipped = 0;
	const tagRe = new RegExp(`<(?:${ANCHOR_TAGS})\\b[^>]*>`, "g");
	const next = source.replace(tagRe, (tag) => {
		if (looksTruncatedByArrow(tag)) return tag;
		if (!/target\s*=\s*(["'])_blank\1/.test(tag)) return tag;
		if (hasDynamicAttr(tag, "rel")) {
			dynamicSkipped++;
			return tag;
		}
		const relMatch = tag.match(/\brel\s*=\s*(["'])([^"']*)\1/);
		if (relMatch) {
			const relVal = relMatch[2].toLowerCase();
			if (relVal.includes("noopener") && relVal.includes("noreferrer")) return tag;
			const parts = new Set(relMatch[2].split(/\s+/).filter(Boolean));
			parts.add("noopener");
			parts.add("noreferrer");
			count++;
			return (
				tag.slice(0, relMatch.index!) +
				`rel=${relMatch[1]}${Array.from(parts).join(" ")}${relMatch[1]}` +
				tag.slice(relMatch.index! + relMatch[0].length)
			);
		}
		count++;
		return insertAttrBeforeClose(tag, 'rel="noopener noreferrer"');
	});
	if (count > 0) {
		ctx.fixed(
			"target=_blank links missing rel=noopener",
			"Conversions",
			"medium",
			`Added rel="noopener noreferrer" to ${count} new-tab link${count === 1 ? "" : "s"} to close the tabnabbing gap.`,
		);
	}
	if (dynamicSkipped > 0) {
		ctx.skipped(
			"target=_blank links with a dynamic rel",
			"Conversions",
			"medium",
			`${dynamicSkipped} link${dynamicSkipped === 1 ? " has" : "s have"} a dynamic rel binding — check by hand that it includes noopener/noreferrer.`,
		);
	}
	return next;
}

/** Images with no alt text: a static filename gives a weak but usable clue;
 *  anything dynamic or hash-named goes to the AI (or duplicate bank). */
export function fixMissingAlt(source: string, ctx: MarkupFixContext): string {
	let deterministic = 0;
	const tagRe = new RegExp(`<(?:${IMAGE_TAGS})\\b[^>]*\\/?>`, "g");
	const next = source.replace(tagRe, (tag) => {
		if (looksTruncatedByArrow(tag)) return tag;
		if (hasAttr(tag, "alt")) return tag;
		const srcMatch = tag.match(/\bsrc\s*=\s*(["'])([^"']*)\1/);
		const staticSrc = srcMatch?.[2];
		if (staticSrc && !/^https?:\/\//.test(staticSrc)) {
			const guess = slugToWords(staticSrc.split("/").filter(Boolean).pop() || "");
			if (guess.length > 2 && guess.length < 60 && !/^[0-9a-f]{6,}$/i.test(guess.replace(/\s/g, ""))) {
				const capitalized = guess.replace(/\b\w/g, (c) => c.toUpperCase());
				deterministic++;
				return insertAttrBeforeClose(tag, `alt="${capitalized}"`);
			}
		}
		ctx.needsAI(
			"alt-text",
			"Image missing alt text",
			"Accessibility",
			"high",
			`Tag in ${ctx.filePath}. src="${staticSrc || "(dynamic)"}"`,
			(s) => s.replace(tag, insertAttrBeforeClose(tag, `alt="__ATTR_PLACEHOLDER__"`)),
		);
		return tag;
	});
	if (deterministic > 0) {
		ctx.fixed(
			"Image missing alt text",
			"Accessibility",
			"high",
			`Filled in alt text for ${deterministic} image${deterministic === 1 ? "" : "s"} based on its filename — reword any that read awkwardly.`,
		);
	}
	return next;
}

/** Generic, non-descriptive link/button text ("Click here", "Submit", …): a
 *  static href/to gives a usable guess; anything else goes to the AI. */
export function fixGenericCtaText(source: string, ctx: MarkupFixContext): string {
	let deterministic = 0;
	const tagRe = new RegExp(`<(${CTA_TAGS})\\b([^>]*)>\\s*([A-Za-z][A-Za-z ]{1,20})\\s*<\\/\\1>`, "g");
	const next = source.replace(tagRe, (whole, el, attrs, text) => {
		const norm = text.trim().toLowerCase();
		if (!GENERIC_CTA_WORDS.has(norm)) return whole;
		const hrefMatch = attrs.match(/\b(?:href|to)\s*=\s*(["'])([^"']*)\1/);
		const href = hrefMatch?.[2] || "";
		const guess = slugToWords(href.split("/").filter(Boolean).pop() || "");
		if (guess.length > 2 && guess.length < 40) {
			const capitalized = guess.replace(/\b\w/g, (c) => c.toUpperCase());
			deterministic++;
			return `<${el}${attrs}>${capitalized}</${el}>`;
		}
		ctx.needsAI(
			"cta-text",
			"Generic call-to-action text",
			"Conversions",
			"low",
			`Current text: "${text.trim()}". Href/to (if any): "${href}". File: ${ctx.filePath}`,
			(s) => s.replace(whole, `<${el}${attrs}>__TEXT_PLACEHOLDER__</${el}>`),
		);
		return whole;
	});
	if (deterministic > 0) {
		ctx.fixed(
			"Generic call-to-action text",
			"Conversions",
			"low",
			`Renamed ${deterministic} generic link${deterministic === 1 ? "" : "s"} based on its href/route.`,
		);
	}
	return next;
}

/** <div>/<span> elements wired up with a click handler (onClick, @click,
 *  (click), on:click) but no role/tabindex are invisible to keyboard and
 *  screen-reader users. Adding role="button" tabindex="0" is safe and
 *  reversible; wiring up an actual keydown handler for Enter/Space is a
 *  follow-up the note calls out rather than guesses at.
 *
 *  Note: handlers written as inline arrow functions (very common in React —
 *  `onClick={() => doThing()}`) truncate the naive tag regex at the arrow's
 *  `>`, so `looksTruncatedByArrow` bails on those rather than risk corrupting
 *  the file. This fixer mostly lands on Vue/Angular/Svelte, where click
 *  bindings are far more often a bare method reference. */
export function fixClickableDivRole(source: string, ctx: MarkupFixContext): string {
	let count = 0;
	const tagRe = /<(div|span)\b[^>]*>/g;
	const next = source.replace(tagRe, (tag) => {
		if (looksTruncatedByArrow(tag)) return tag;
		if (!CLICK_ATTR_RE.test(tag)) return tag;
		if (hasAttr(tag, "role") || hasAttr(tag, "tabindex") || hasAttr(tag, "tabIndex")) return tag;
		count++;
		return insertAttrBeforeClose(tag, 'role="button" tabindex="0"');
	});
	if (count > 0) {
		ctx.fixed(
			"Clickable element isn't keyboard accessible",
			"Accessibility",
			"high",
			`Added role="button" tabindex="0" to ${count} clickable <div>/<span> element${count === 1 ? "" : "s"} so keyboard and screen-reader users can reach ${
				count === 1 ? "it" : "them"
			} — add a keydown handler for Enter/Space too if one isn't already there, since role/tabindex alone doesn't make Enter trigger the click.`,
		);
	}
	return next;
}

/** Form fields with no accessible name at all — no aria-label/aria-labelledby,
 *  and not textually wrapped in a <label>. (A `for`/`id` pairing that lives in
 *  a separate part of the file isn't something a text-level pass can verify
 *  safely, so this only catches the fully-unlabeled case, same conservative
 *  bar as everywhere else here.) */
export function fixMissingFieldLabel(source: string, ctx: MarkupFixContext): string {
	const tagRe = /<(input|select|textarea)\b[^>]*>/g;
	for (const m of source.matchAll(tagRe)) {
		const tag = m[0];
		if (looksTruncatedByArrow(tag)) continue;
		const typeMatch = tag.match(/\btype\s*=\s*(["'])([^"']*)\1/i);
		const type = typeMatch?.[2]?.toLowerCase();
		if (type && ["hidden", "submit", "button", "reset", "image"].includes(type)) continue;
		if (hasAttr(tag, "aria-label") || hasAttr(tag, "aria-labelledby")) continue;
		if (isInsideLabel(source, m.index!)) continue;
		const placeholder = tag.match(/\bplaceholder\s*=\s*(["'])([^"']*)\1/)?.[2] || "";
		const name = tag.match(/\bname\s*=\s*(["'])([^"']*)\1/)?.[2] || "";
		ctx.needsAI(
			"aria-label",
			"Form field has no accessible label",
			"Accessibility",
			"high",
			`Field in ${ctx.filePath}: name="${name}", placeholder="${placeholder}", type="${type || m[1]}"`,
			(s) => s.replace(tag, insertAttrBeforeClose(tag, `aria-label="__ATTR_PLACEHOLDER__"`)),
		);
	}
	return source;
}

/** href="#" used purely as a click-handler anchor breaks screen readers and
 *  "open in new tab" alike. Nothing safe to rewrite it to automatically
 *  (depends on what the handler actually does) — flagged for a by-hand swap
 *  to a <button> or a real route/URL. */
export function checkHashOnlyLinks(source: string, ctx: MarkupFixContext): void {
	let count = 0;
	const tagRe = new RegExp(`<(?:${ANCHOR_TAGS})\\b[^>]*>`, "g");
	for (const m of source.matchAll(tagRe)) {
		const tag = m[0];
		if (looksTruncatedByArrow(tag)) continue;
		if (!/href\s*=\s*(["'])#\1/.test(tag)) continue;
		if (!CLICK_ATTR_RE.test(tag)) continue;
		count++;
	}
	if (count > 0) {
		ctx.skipped(
			`Link${count === 1 ? "" : "s"} using href="#" as a click handler`,
			"Accessibility",
			"low",
			`${count} link${count === 1 ? " uses" : "s use"} href="#" purely to attach a click handler in ${ctx.filePath} — screen readers and "open in new tab" both break on these. Swap to a <button> (or a real route/URL) by hand.`,
		);
	}
}
