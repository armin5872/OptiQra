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

/** Grabs a small window of text immediately around a match and collapses it
 *  to one line, for folding into an AI target's `context` string. The model
 *  only ever sees the isolated tag + a couple of attributes today, which is
 *  often not enough to ground a good guess (a bare `<img src="/a1b2.jpg">`
 *  tells you nothing; the sentence right before it in the markup often
 *  does). This doesn't change what gets matched or edited — purely additive
 *  grounding for the AI prompt, so a low-signal tag gets a real shot at a
 *  correct answer instead of the model inventing something plausible-but-
 *  wrong from the filename alone. */
function surroundingSnippet(source: string, matchIndex: number, matchLength: number, radius = 100): string {
	const before = source.slice(Math.max(0, matchIndex - radius), matchIndex);
	const after = source.slice(matchIndex + matchLength, matchIndex + matchLength + radius);
	const collapse = (s: string) =>
		s
			.replace(/\s+/g, " ")
			.replace(/<[^>]*>/g, " ")
			.trim();
	const beforeText = collapse(before);
	const afterText = collapse(after);
	if (!beforeText && !afterText) return "";
	return ` Nearby text: "...${beforeText}" / "${afterText}..."`;
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
	const next = source.replace(tagRe, (tag, offset: number) => {
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
			`Tag in ${ctx.filePath}. src="${staticSrc || "(dynamic)"}".${surroundingSnippet(source, offset, tag.length)}`,
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
	const next = source.replace(tagRe, (whole, el, attrs, text, offset: number) => {
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
			`Current text: "${text.trim()}". Href/to (if any): "${href}". File: ${ctx.filePath}.${surroundingSnippet(source, offset, whole.length)}`,
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
			`Field in ${ctx.filePath}: name="${name}", placeholder="${placeholder}", type="${type || m[1]}".${surroundingSnippet(source, m.index!, tag.length)}`,
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

// ============================================================================
// The checks below bring the source-file engine up to the same depth of
// coverage autoFixEngine.ts already has for full rendered HTML documents
// (image dimensions/lazy-loading, icon-only buttons, landmarks, long forms),
// plus a handful of checks that ONLY make sense against real source code and
// that a live-URL/rendered-HTML crawl could never see at all (hardcoded
// secrets, dangerouslySetInnerHTML-style XSS-risk bindings, missing list
// keys) -- the project-upload analyzer's actual edge over crawling a URL.
// ============================================================================

/** Images missing loading="lazy" get it added, mirroring autoFixEngine's
 *  rule for full HTML documents: the first couple of images in the file are
 *  left alone (most likely the hero/LCP image, where lazy loading actively
 *  hurts), everything after gets lazy-loaded. */
export function fixImageLazyLoading(source: string, ctx: MarkupFixContext): string {
	let index = 0;
	let count = 0;
	const tagRe = new RegExp(`<(?:${IMAGE_TAGS})\\b[^>]*\\/?>`, "g");
	const next = source.replace(tagRe, (tag) => {
		const i = index++;
		if (looksTruncatedByArrow(tag)) return tag;
		if (i < 2) return tag; // likely above-the-fold / LCP -- don't lazy-load
		if (hasAttr(tag, "loading") || hasAttr(tag, "priority")) return tag; // next/image `priority` implies eager
		count++;
		return insertAttrBeforeClose(tag, 'loading="lazy"');
	});
	if (count > 0) {
		ctx.fixed(
			"Images not lazy-loaded",
			"Performance",
			"medium",
			`Added loading="lazy" to ${count} below-the-fold image${count === 1 ? "" : "s"} in ${ctx.filePath}.`,
		);
	}
	return next;
}

/** Images with no width/height (in any dialect's binding syntax) cause
 *  layout shift as they load in -- flagged rather than guessed, since real
 *  pixel dimensions need the actual file, which this text-only pass doesn't
 *  have (the Image Analyzer, run separately, does probe real files). */
export function checkImageDimensions(source: string, ctx: MarkupFixContext): void {
	let total = 0;
	let missing = 0;
	const tagRe = new RegExp(`<(?:${IMAGE_TAGS})\\b[^>]*\\/?>`, "g");
	for (const m of source.matchAll(tagRe)) {
		const tag = m[0];
		if (looksTruncatedByArrow(tag)) continue;
		total++;
		if ((!hasAttr(tag, "width") || !hasAttr(tag, "height")) && !hasAttr(tag, "fill")) missing++;
	}
	if (total > 0 && missing > 0) {
		ctx.skipped(
			"Images missing width/height",
			"Performance",
			missing / total > 0.5 ? "high" : "medium",
			`${missing} of ${total} image${total === 1 ? "" : "s"} in ${ctx.filePath} have no explicit width/height, which causes layout shift as they load. Add the real pixel dimensions by hand.`,
		);
	}
}

/** srcset without a matching sizes attribute forces the browser to guess the
 *  display width -- needs knowledge of actual CSS layout to set correctly,
 *  so this only flags rather than invents a value. */
export function checkSrcsetSizes(source: string, ctx: MarkupFixContext): void {
	let count = 0;
	const tagRe = new RegExp(`<(?:${IMAGE_TAGS})\\b[^>]*\\/?>`, "g");
	for (const m of source.matchAll(tagRe)) {
		const tag = m[0];
		if (looksTruncatedByArrow(tag)) continue;
		if (!hasAttr(tag, "srcset") && !hasAttr(tag, "srcSet")) continue;
		if (hasAttr(tag, "sizes")) continue;
		count++;
	}
	if (count > 0) {
		ctx.skipped(
			`Image${count === 1 ? "" : "s"} with srcset but no sizes attribute`,
			"Performance",
			"low",
			`${count} image${count === 1 ? "" : "s"} in ${ctx.filePath} set srcset without a sizes attribute. Add a sizes value matching your actual CSS layout by hand.`,
		);
	}
}

/** Buttons/links that render no visible text (icon-only) and expose no
 *  aria-label/aria-labelledby/title are announced as just "button" to
 *  screen readers, with no indication of what they do.
 *
 *  Note: same limitation as fixClickableDivRole — a handler written as an
 *  inline arrow function (`onClick={() => doThing()}`, very common in
 *  React) truncates the naive `[^>]*` attribute match at the arrow's `>`,
 *  so `looksTruncatedByArrow` bails on those rather than risk a garbled
 *  match. This check mostly lands on Vue/Angular/Svelte bare method
 *  references and on React buttons with a named handler (onClick={handleX}). */
export function checkIconOnlyButtons(source: string, ctx: MarkupFixContext): void {
	const tagRe = new RegExp(`<(${CTA_TAGS})\\b([^>]*)>([\\s\\S]*?)<\\/\\1>`, "g");
	for (const m of source.matchAll(tagRe)) {
		const whole = m[0];
		const attrs = m[2];
		const inner = m[3];
		if (looksTruncatedByArrow(`<x ${attrs}>`)) continue;
		if (hasAttr(`<x ${attrs}>`, "aria-label") || hasAttr(`<x ${attrs}>`, "aria-labelledby") || hasAttr(`<x ${attrs}>`, "title")) continue;
		const textOnly = inner.replace(/<[^>]*>/g, "").replace(/\{[^}]*\}/g, "").replace(/\s+/g, "").trim();
		if (textOnly) continue;
		if (/\balt\s*=\s*["'][^"']+["']/.test(inner) || /aria-label\s*=/.test(inner)) continue;
		ctx.needsAI(
			"aria-label",
			"Button/link has no accessible name",
			"Accessibility",
			"medium",
			`Icon-only element in ${ctx.filePath}.${surroundingSnippet(source, m.index!, whole.length)}`,
			(s) => s.replace(whole, whole.replace(/^<[a-zA-Z][\w.-]*/, (tag) => `${tag} aria-label="__ATTR_PLACEHOLDER__"`)),
		);
	}
}

/** Landmark regions (<main>/<nav>/<footer>, or their ARIA-role equivalents)
 *  let screen reader users jump straight to a section instead of tabbing
 *  through everything -- only meaningful to check on a file that renders a
 *  whole page, so the caller only invokes this for page/layout-level files. */
export function checkLandmarks(source: string, ctx: MarkupFixContext): void {
	const has = (tag: string, role: string) =>
		new RegExp(`<${tag}\\b[^>]*>`, "i").test(source) || new RegExp(`role\\s*=\\s*["']${role}["']`, "i").test(source);
	const landmarks: [string, string][] = [
		["main", "main"],
		["nav", "navigation"],
		["footer", "contentinfo"],
	];
	const missing = landmarks.filter(([tag, role]) => !has(tag, role)).map(([tag]) => tag);
	if (missing.length > 0) {
		ctx.skipped(
			`Missing landmark element${missing.length === 1 ? "" : "s"}: ${missing.join(", ")}`,
			"Accessibility",
			"low",
			`${ctx.filePath} (or the components it renders) doesn't appear to use <${missing.join(">, <")}>. Wrapping the right content in these landmarks needs knowing the page's actual layout -- do this one by hand.`,
		);
	}
}

/** A <table> with no <th> anywhere gives screen readers no way to announce
 *  which column/row a cell belongs to. */
export function checkTableHeaders(source: string, ctx: MarkupFixContext): void {
	let count = 0;
	for (const m of source.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)) {
		if (!/<th\b/i.test(m[1])) count++;
	}
	if (count > 0) {
		ctx.skipped(
			`Data table${count === 1 ? "" : "s"} missing header cells`,
			"Accessibility",
			"medium",
			`${count} <table> in ${ctx.filePath} has no <th> cells -- screen readers can't announce column/row headers. Use <th scope="col"> / <th scope="row"> for header cells.`,
		);
	}
}

/** A form with many fields is a product decision, not something to trim
 *  automatically -- flagged like autoFixEngine does for full documents. */
export function checkFormFieldCount(source: string, ctx: MarkupFixContext): void {
	const formMatch = source.match(/<form\b[^>]*>([\s\S]*?)<\/form>/i);
	if (!formMatch) return;
	const fieldCount = (formMatch[1].match(/<(input|select|textarea)\b/gi) || []).length;
	if (fieldCount > 6) {
		ctx.skipped(
			"Form has many fields",
			"Conversions",
			"low",
			`The form in ${ctx.filePath} has ${fieldCount} fields -- cutting it down is a product decision, not something to trim automatically.`,
		);
	}
}

/** <video autoplay> without muted will simply be blocked from autoplaying by
 *  every modern browser, so muted is both a safety fix and a functional one. */
export function fixAutoplayMedia(source: string, ctx: MarkupFixContext): string {
	let mutedCount = 0;
	let noControlsCount = 0;
	const tagRe = /<(video|audio)\b[^>]*>/g;
	const next = source.replace(tagRe, (tag) => {
		if (looksTruncatedByArrow(tag)) return tag;
		if (!hasAttr(tag, "autoplay")) return tag;
		let result = tag;
		if (!hasAttr(tag, "muted")) {
			result = insertAttrBeforeClose(result, "muted");
			mutedCount++;
		}
		if (!hasAttr(tag, "controls")) noControlsCount++;
		return result;
	});
	if (mutedCount > 0) {
		ctx.fixed(
			"Autoplaying media without muted",
			"Accessibility",
			"medium",
			`Added muted to ${mutedCount} autoplaying <video>/<audio> element${mutedCount === 1 ? "" : "s"} in ${ctx.filePath} -- unmuted autoplay is blocked by most browsers anyway, and unmuted autoplaying audio is jarring/disorienting for users.`,
		);
	}
	if (noControlsCount > 0) {
		ctx.skipped(
			"Autoplaying media has no visible controls",
			"Accessibility",
			"low",
			`${noControlsCount} autoplaying element${noControlsCount === 1 ? "" : "s"} in ${ctx.filePath} have no controls, so users can't pause/stop it. Add controls by hand -- whether to keep autoplay at all is a product decision.`,
		);
	}
	return next;
}

// --- Checks below have no equivalent in the URL-crawl engine at all -- they
// need the actual source text, which a live crawl of rendered HTML never
// has access to. This is the project-upload analyzer's real edge over
// crawling a URL, not just parity with it. ---

const SECRET_PATTERNS: { name: string; re: RegExp }[] = [
	{ name: "AWS access key", re: /\bAKIA[0-9A-Z]{16}\b/ },
	{ name: "Google API key", re: /\bAIza[0-9A-Za-z\-_]{35}\b/ },
	{ name: "Stripe live secret key", re: /\bsk_live_[0-9a-zA-Z]{20,}\b/ },
	{ name: "OpenAI API key", re: /\bsk-[A-Za-z0-9]{20,}\b/ },
	{ name: "Slack token", re: /\bxox[baprs]-[0-9A-Za-z-]{10,}\b/ },
	{ name: "GitHub token", re: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/ },
	{ name: "Private key block", re: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
	{ name: "generic hardcoded secret", re: /\b(?:api[_-]?key|secret|token|password)\s*[:=]\s*["'][A-Za-z0-9_\-./+]{16,}["']/i },
];

/** Flags likely hardcoded credentials committed straight into source --
 *  something a live-URL crawl structurally cannot see. Env-var references
 *  are excluded explicitly to avoid the obvious false positive. */
export function checkHardcodedSecrets(source: string, ctx: MarkupFixContext): void {
	const seen = new Set<string>();
	for (const { name, re } of SECRET_PATTERNS) {
		const re2 = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
		for (const m of source.matchAll(re2)) {
			if (/process\.env|import\.meta\.env|\$\{|__[A-Z_]+_PLACEHOLDER__/.test(source.slice(Math.max(0, m.index! - 40), m.index!))) continue;
			if (seen.has(name)) continue;
			seen.add(name);
			const match = m[0];
			const redacted = match.length > 12 ? `${match.slice(0, 6)}...${match.slice(-4)}` : "(redacted)";
			ctx.skipped(
				`Possible hardcoded ${name}`,
				"Security",
				"critical",
				`${ctx.filePath} appears to contain a hardcoded ${name} (${redacted}). Move it to an environment variable and rotate the credential -- anything committed to source control (or shipped in a client bundle) should be treated as already leaked.`,
			);
		}
	}
}

const XSS_RISK_PATTERNS: { name: string; re: RegExp }[] = [
	{ name: "dangerouslySetInnerHTML", re: /dangerouslySetInnerHTML\s*=\s*\{/ },
	{ name: "v-html", re: /\bv-html\s*=/ },
	{ name: "[innerHTML] binding", re: /\[innerHTML\]\s*=/ },
	{ name: "{@html ...}", re: /\{@html\b/ },
	{ name: "set:html", re: /\bset:html\s*=/ },
];

/** Every framework this tool understands has some way to inject raw HTML
 *  bypassing the framework's normal escaping -- a real XSS vector unless
 *  the content is fully trusted/sanitized. */
export function checkXssRiskyBindings(source: string, ctx: MarkupFixContext): void {
	for (const { name, re } of XSS_RISK_PATTERNS) {
		const count = (source.match(new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g")) || []).length;
		if (count === 0) continue;
		ctx.skipped(
			`Raw HTML injection via ${name}`,
			"Security",
			"high",
			`${ctx.filePath} uses ${name} ${count} time${count === 1 ? "" : "s"} to render raw HTML, bypassing the framework's normal escaping. This is a cross-site-scripting risk unless the content is fully trusted or run through a sanitizer (e.g. DOMPurify) first -- verify by hand.`,
		);
	}
}

/** A hardcoded http:// resource URL on an otherwise-https site either fails
 *  outright or silently degrades to a "not fully secure" page. */
export function checkMixedContent(source: string, ctx: MarkupFixContext): void {
	const re = /\b(?:src|href)\s*=\s*(['"])http:\/\/(?!localhost|127\.0\.0\.1)([^'"]*)\1/gi;
	const count = (source.match(re) || []).length;
	if (count > 0) {
		ctx.skipped(
			`Hardcoded http:// resource reference${count === 1 ? "" : "s"}`,
			"Security",
			"medium",
			`${ctx.filePath} references ${count} resource${count === 1 ? "" : "s"} over plain http:// -- browsers block or warn on this as mixed content when the page itself is served over https. Switch to https:// (or a protocol-relative/relative URL).`,
		);
	}
}

/** Leftover console.log/debugger statements ship extra bytes and noisy
 *  output to production, and debugger; can freeze a page open in devtools. */
export function checkConsoleDebugger(source: string, ctx: MarkupFixContext): void {
	const consoleCount = (source.match(/console\.(log|debug|trace)\s*\(/g) || []).length;
	const debuggerCount = (source.match(/(?:^|[^.\w])debugger\s*;/g) || []).length;
	if (consoleCount > 0) {
		ctx.skipped(
			`Leftover console log/debug statement${consoleCount === 1 ? "" : "s"}`,
			"Best Practices",
			"low",
			`${consoleCount} console.log/debug/trace call${consoleCount === 1 ? "" : "s"} left in ${ctx.filePath} -- strip these (or gate them behind a dev-only flag) before shipping to production.`,
		);
	}
	if (debuggerCount > 0) {
		ctx.skipped(
			"Leftover debugger statement",
			"Best Practices",
			"medium",
			`${debuggerCount} debugger; statement${debuggerCount === 1 ? "" : "s"} left in ${ctx.filePath} -- this pauses execution (and can hang the page) whenever devtools is open.`,
		);
	}
}

/** Rendering a list without a stable `key` makes the framework fall back to
 *  index-based reconciliation -- purely heuristic, so this only flags. */
export function checkMissingListKeys(source: string, ctx: MarkupFixContext): void {
	let reactIssues = 0;
	for (const m of source.matchAll(/\.map\(\s*(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>[\s\S]{0,40}?<([A-Za-z][\w.]*)\b([^>]*)>/g)) {
		const attrs = m[2];
		if (/\bkey\s*=/.test(attrs)) continue;
		reactIssues++;
	}
	if (reactIssues > 0) {
		ctx.skipped(
			"List rendered without a key prop",
			"Best Practices",
			"medium",
			`${reactIssues} .map() call${reactIssues === 1 ? "" : "s"} in ${ctx.filePath} render JSX without a key prop -- add a stable, unique key (not the array index) to each item.`,
		);
	}

	let vueIssues = 0;
	for (const m of source.matchAll(/<[A-Za-z][\w-]*\b([^>]*\bv-for\s*=[^>]*)>/g)) {
		if (/:key\s*=|v-bind:key\s*=/.test(m[1])) continue;
		vueIssues++;
	}
	if (vueIssues > 0) {
		ctx.skipped(
			"v-for without a :key binding",
			"Best Practices",
			"medium",
			`${vueIssues} v-for element${vueIssues === 1 ? "" : "s"} in ${ctx.filePath} have no :key binding -- add a stable, unique key so Vue can track items correctly across re-renders.`,
		);
	}

	let ngIssues = 0;
	for (const m of source.matchAll(/<[A-Za-z][\w-]*\b([^>]*\*ngFor\s*=[^>]*)>/g)) {
		if (/trackBy/.test(m[1])) continue;
		ngIssues++;
	}
	if (ngIssues > 0) {
		ctx.skipped(
			"*ngFor without trackBy",
			"Best Practices",
			"low",
			`${ngIssues} *ngFor loop${ngIssues === 1 ? "" : "s"} in ${ctx.filePath} don't specify trackBy -- without it Angular re-renders every item in the list on any change.`,
		);
	}
}

/** Suggests framework-native replacements for plain <img>/<a> tags where a
 *  clearly better-optimized primitive exists -- only fires for the stack it
 *  actually applies to. */
export function checkFrameworkNativeComponents(source: string, ctx: MarkupFixContext, stackKind?: string): void {
	if (stackKind === "next") {
		const usesNextImage = /from\s+["']next\/image["']/.test(source);
		const plainImgCount = (source.match(/<img\b/g) || []).length;
		if (!usesNextImage && plainImgCount > 0) {
			ctx.skipped(
				"Plain <img> instead of next/image",
				"Performance",
				"low",
				`${plainImgCount} <img> tag${plainImgCount === 1 ? "" : "s"} in ${ctx.filePath} could use next/image instead -- it gives automatic resizing, format conversion (WebP/AVIF), and lazy-loading without any extra config.`,
			);
		}
		const usesNextLink = /from\s+["']next\/link["']/.test(source);
		const internalAnchors = (source.match(/<a\b[^>]*\bhref\s*=\s*["']\/(?!\/)[^"']*["']/g) || []).length;
		if (!usesNextLink && internalAnchors > 0) {
			ctx.skipped(
				"Plain <a> for internal navigation instead of next/link",
				"Performance",
				"low",
				`${internalAnchors} internal link${internalAnchors === 1 ? "" : "s"} in ${ctx.filePath} use a plain <a> -- next/link's <Link> prefetches the destination and avoids a full page reload for internal routes.`,
			);
		}
	}
}

/** Path-based heuristic for "this file renders a whole page/route", as
 *  opposed to a reusable component -- landmark-region and long-form checks
 *  only make sense at that level. */
export function isLikelyPageLevelFile(path: string): boolean {
	return (
		/(^|\/)(page|layout|index|app|_app|_document)\.(tsx|jsx|vue|svelte)$/i.test(path) ||
		/(^|\/)\+page(\.server)?\.(svelte|ts|js)$/i.test(path) ||
		/(^|\/)(pages|views|routes|screens)\/[^/]+\.(tsx|jsx|vue|svelte)$/i.test(path) ||
		/\.html?$/i.test(path)
	);
}
