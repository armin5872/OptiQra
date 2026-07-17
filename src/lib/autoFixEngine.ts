// lib/autoFixEngine.ts
//
// Turns the issues annotateDom()/siteClone already finds into an actual
// fixed page instead of just a list of findings:
//
//  1. Mechanical issues (wrong/missing tag, bad attribute value) are fixed
//     directly with Cheerio — no AI involved, 100% deterministic.
//  2. Issues that need *authored content* (a title, a meta description,
//     alt text, a form label, a CTA rewrite) are collected as `AITarget`s
//     instead. The caller (the API route) resolves those with a single
//     batched AI call when a key is configured, or with a "duplicate bank"
//     of previously AI-generated values when it isn't.
//  3. Anything that's genuinely unsafe to change blind (e.g. a noindex tag
//     that might be intentional on a staging site) is left alone and
//     reported as "skipped" with a reason, never silently overwritten.
//
// This mirrors annotateDom()'s issue set 1:1 so results line up with what
// the report/clone viewer already shows the user.

import type { CheerioAPI } from "cheerio";
import type { Element } from "domhandler";
import type { Severity } from "@/lib/auditUtils";

export type AutoFixStatus = "fixed" | "ai-needed" | "duplicated" | "skipped";

export interface AutoFixResult {
	id: string;
	title: string;
	category: string;
	severity: Severity;
	status: AutoFixStatus;
	/** Human-readable note: what was changed, why it needs AI, or why it was skipped. */
	note: string;
}

/** What the AI needs to fill in for one issue — kept generic across issue kinds. */
export type AITargetKind =
	| "title"
	| "meta-description"
	| "h1-text"
	| "alt-text"
	| "label-text"
	| "aria-label"
	| "cta-text";

export interface AITarget {
	id: string;
	kind: AITargetKind;
	title: string;
	category: string;
	severity: Severity;
	/** Short context clue for the prompt — filename, href, nearby text, current (bad) text. */
	context: string;
}

const FIX_TARGET_ATTR = "data-optiqra-fix-target";
const GENERIC_CTA_WORDS = new Set(["submit", "click here", "here", "go", "learn more", "read more"]);

function slugToWords(slug: string): string {
	return slug
		.replace(/\.[a-z0-9]+$/i, "")
		.replace(/[-_]+/g, " ")
		.replace(/%20/g, " ")
		.trim();
}

/**
 * Runs every deterministic fix in place on `$`, and collects everything else
 * as an `AITarget` tagged with a temporary `data-optiqra-fix-target` id so the
 * caller can splice AI output back into the exact element later in the same
 * request (element references don't survive JSON, but they survive as long
 * as `$` stays in memory).
 */
export function runAutoFix($: CheerioAPI, pageUrl: string): { results: AutoFixResult[]; aiTargets: AITarget[] } {
	const results: AutoFixResult[] = [];
	const aiTargets: AITarget[] = [];
	let counter = 0;
	const nextId = () => `af-${counter++}`;

	const needsAI = (el: Element, target: Omit<AITarget, "id">) => {
		const id = nextId();
		$(el).attr(FIX_TARGET_ATTR, id);
		aiTargets.push({ id, ...target });
	};

	// --- Images missing alt text: try a filename-derived guess first (free,
	// deterministic-ish), but flag it as AI-improvable rather than "fixed"
	// since a filename is a weak substitute for actually looking at the image. ---
	$("img").each((_, el) => {
		const alt = $(el).attr("alt");
		if (alt && alt.trim()) return;
		const src = $(el).attr("src") || "";
		const filename = src.split("/").pop() || "";
		const guess = slugToWords(filename);
		needsAI(el, {
			kind: "alt-text",
			title: "Missing alt text",
			category: "Accessibility",
			severity: "high",
			context: guess && guess.length > 2 ? `Image filename suggests: "${guess}". Src: ${src}` : `Image src: ${src || "(no src)"}`,
		});
	});

	// --- Decorative images with alt text set: safe to clear deterministically. ---
	$('img[src*="spacer"], img[src*="divider"], img[src*="decoration"]').each((_, el) => {
		const alt = ($(el).attr("alt") || "").trim();
		if (!alt) return;
		$(el).attr("alt", "");
		results.push({
			id: nextId(),
			title: "Decorative image has alt text",
			category: "Accessibility",
			severity: "low",
			status: "fixed",
			note: 'Cleared alt text to alt="" so screen readers skip this decorative image.',
		});
	});

	// --- Form fields without a label: needs to know the field's purpose. ---
	$('input:not([type="hidden"]):not([type="submit"]):not([type="button"]), select, textarea').each((_, el) => {
		const id = $(el).attr("id");
		const hasLabel = !!id && $(`label[for="${id}"]`).length > 0;
		const hasAria = $(el).attr("aria-label") || $(el).attr("aria-labelledby");
		const wrappedInLabel = $(el).parents("label").length > 0;
		if (hasLabel || hasAria || wrappedInLabel) return;
		const placeholder = $(el).attr("placeholder") || "";
		const name = $(el).attr("name") || "";
		needsAI(el, {
			kind: "label-text",
			title: "No associated label",
			category: "Accessibility",
			severity: "high",
			context: `Field name="${name}", placeholder="${placeholder}", type="${$(el).attr("type") || el.tagName}"`,
		});
	});

	// --- Icon-only buttons/links with no accessible name. ---
	$('button, a[role="button"]').each((_, el) => {
		const text = $(el).text().trim();
		const hasAria = $(el).attr("aria-label") || $(el).attr("aria-labelledby") || $(el).attr("title");
		if (text || hasAria) return;
		const iconClass = $(el).find("[class]").first().attr("class") || $(el).attr("class") || "";
		const href = $(el).attr("href") || "";
		needsAI(el, {
			kind: "aria-label",
			title: "No accessible name",
			category: "Accessibility",
			severity: "medium",
			context: `Icon class hint: "${iconClass}". Href (if any): "${href}".`,
		});
	});

	// --- Extra H1s: deterministic — demote every H1 after the first to H2. ---
	const h1s = $("h1");
	if (h1s.length > 1) {
		h1s.each((i, el) => {
			if (i === 0) return;
			const $el = $(el);
			const h2 = $("<h2></h2>");
			// Move children + attributes over rather than just wrapping, so we
			// actually change the heading level instead of nesting tags.
			h2.html($el.html() || "");
			for (const [name, value] of Object.entries((el as Element).attribs || {})) {
				h2.attr(name, value);
			}
			$el.replaceWith(h2);
		});
		results.push({
			id: nextId(),
			title: "Extra H1 heading",
			category: "SEO",
			severity: "medium",
			status: "fixed",
			note: `Demoted ${h1s.length - 1} extra H1${h1s.length - 1 === 1 ? "" : "s"} to H2.`,
		});
	}

	// --- Heading levels that skip a step: deterministic — clamp each jump to +1. ---
	{
		let prevLevel = 0;
		let fixedCount = 0;
		$("h1, h2, h3, h4, h5, h6").each((_, el) => {
			const level = Number(el.tagName.slice(1));
			if (prevLevel && level - prevLevel > 1) {
				const newLevel = prevLevel + 1;
				const $el = $(el);
				const replacement = $(`<h${newLevel}></h${newLevel}>`);
				replacement.html($el.html() || "");
				for (const [name, value] of Object.entries((el as Element).attribs || {})) {
					replacement.attr(name, value);
				}
				$el.replaceWith(replacement);
				prevLevel = newLevel;
				fixedCount++;
				return;
			}
			prevLevel = level;
		});
		if (fixedCount > 0) {
			results.push({
				id: nextId(),
				title: "Heading level skips a step",
				category: "SEO",
				severity: "medium",
				status: "fixed",
				note: `Renumbered ${fixedCount} heading${fixedCount === 1 ? "" : "s"} so levels no longer skip.`,
			});
		}
	}

	// --- Generic CTA text: try a deterministic guess from the href, else AI. ---
	$("a, button").each((_, el) => {
		const text = $(el).text().trim().toLowerCase();
		if (!text || !GENERIC_CTA_WORDS.has(text)) return;
		const href = $(el).attr("href") || "";
		const slugGuess = slugToWords(href.split("/").filter(Boolean).pop() || "");
		if (slugGuess && slugGuess.length > 2 && slugGuess.length < 40) {
			// Deterministic-ish: safe enough for a low-severity cosmetic issue,
			// still surfaced as "fixed" but the note says exactly what/why.
			const capitalized = slugGuess.replace(/\b\w/g, (c) => c.toUpperCase());
			$(el).text(capitalized);
			results.push({
				id: nextId(),
				title: "Generic call-to-action text",
				category: "Conversions",
				severity: "low",
				status: "fixed",
				note: `Renamed "${text}" to "${capitalized}" based on its link target.`,
			});
		} else {
			needsAI(el, {
				kind: "cta-text",
				title: "Generic call-to-action text",
				category: "Conversions",
				severity: "low",
				context: `Current text: "${text}". Href: "${href}".`,
			});
		}
	});

	// --- Page-level: title tag — needs real content, so AI (or duplicate bank). ---
	const title = $("title").first().text().trim();
	if (!title) {
		const h1Text = $("h1").first().text().trim();
		const head = $("head").length ? $("head").get(0)! : $("html").get(0)!;
		needsAI(head, {
			kind: "title",
			title: "Title tag is missing",
			category: "SEO",
			severity: "critical",
			context: h1Text ? `Page's H1 is: "${h1Text}". URL: ${pageUrl}` : `URL: ${pageUrl}`,
		});
	}

	// --- Meta description — same, needs authored content. ---
	const metaDesc = $('meta[name="description"]').attr("content") || "";
	if (!metaDesc.trim()) {
		const bodyText = $("body").text().replace(/\s+/g, " ").trim().slice(0, 300);
		const head = $("head").length ? $("head").get(0)! : $("html").get(0)!;
		needsAI(head, {
			kind: "meta-description",
			title: "No meta description",
			category: "SEO",
			severity: "high",
			context: `Page title: "${title}". First page text: "${bodyText}"`,
		});
	}

	// --- Missing canonical: deterministic — self-reference the scanned URL. ---
	const canonical = $('link[rel="canonical"]').attr("href");
	if (!canonical) {
		$("head").append(`<link rel="canonical" href="${pageUrl}">`);
		results.push({
			id: nextId(),
			title: "Missing canonical tag",
			category: "SEO",
			severity: "medium",
			status: "fixed",
			note: `Added a self-referencing canonical tag pointing at ${pageUrl}.`,
		});
	}

	// --- No H1: needs to know the page's actual topic. ---
	if (h1s.length === 0) {
		const head = $("head").length ? $("head").get(0)! : $("html").get(0)!;
		needsAI(head, {
			kind: "h1-text",
			title: "No H1 heading found",
			category: "SEO",
			severity: "high",
			context: `Page title: "${title}". URL: ${pageUrl}`,
		});
	}

	// --- Missing lang attribute: deterministic default to "en". ---
	const htmlLang = $("html").attr("lang");
	if (!htmlLang) {
		$("html").attr("lang", "en");
		results.push({
			id: nextId(),
			title: "Missing lang attribute",
			category: "Accessibility",
			severity: "high",
			status: "fixed",
			note: 'Set lang="en" — change this if the page isn\'t actually in English.',
		});
	}

	// --- Viewport meta tag: deterministic, standard responsive tag. ---
	const viewport = $('meta[name="viewport"]').attr("content") || "";
	if (!viewport) {
		$("head").append('<meta name="viewport" content="width=device-width, initial-scale=1">');
		results.push({
			id: nextId(),
			title: "No responsive viewport meta tag",
			category: "Conversions",
			severity: "high",
			status: "fixed",
			note: "Added a standard responsive viewport meta tag.",
		});
	} else if (/user-scalable=no|maximum-scale=1(\.0)?\b/.test(viewport)) {
		const fixed = viewport
			.replace(/,?\s*user-scalable=no/gi, "")
			.replace(/,?\s*maximum-scale=1(\.0)?\b/gi, "")
			.replace(/^,\s*/, "");
		$('meta[name="viewport"]').attr("content", fixed || "width=device-width, initial-scale=1");
		results.push({
			id: nextId(),
			title: "Pinch-to-zoom is disabled",
			category: "Accessibility",
			severity: "medium",
			status: "fixed",
			note: "Removed user-scalable=no / maximum-scale=1 from the viewport tag.",
		});
	}

	// --- Missing landmark elements: too structural to guess blind — skip. ---
	const landmarks = ["main", "nav", "footer"].filter((t) => $(t).length > 0);
	if (landmarks.length < 3) {
		const missing = ["main", "nav", "footer"].filter((t) => !landmarks.includes(t));
		results.push({
			id: nextId(),
			title: `Missing landmark element${missing.length === 1 ? "" : "s"}: ${missing.join(", ")}`,
			category: "Accessibility",
			severity: "low",
			status: "skipped",
			note: `Wrapping the right content in <${missing.join(">, <")}> needs knowing the page's actual layout — do this one by hand.`,
		});
	}

	// --- noindex: never touch this automatically — could be intentional. ---
	const robotsMeta = $('meta[name="robots"]').attr("content") || "";
	if (/noindex/i.test(robotsMeta)) {
		results.push({
			id: nextId(),
			title: "Page is marked noindex",
			category: "SEO",
			severity: "critical",
			status: "skipped",
			note: "Left as-is — removing noindex automatically risks indexing a staging/private page that was meant to be hidden. Confirm this by hand.",
		});
	}

	return { results, aiTargets };
}

/** Applies AI (or duplicate-bank) generated values back into `$` using the
 *  temporary `data-optiqra-fix-target` ids `runAutoFix` left behind, then
 *  strips those temp attributes so they don't leak into the output HTML. */
export function applyAITargetValues(
	$: CheerioAPI,
	targets: AITarget[],
	values: Record<string, string>,
	source: "ai" | "duplicate",
): AutoFixResult[] {
	const results: AutoFixResult[] = [];

	for (const target of targets) {
		const value = values[target.id];
		const el = $(`[${FIX_TARGET_ATTR}="${target.id}"]`).first();
		if (!value || el.length === 0) {
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

		switch (target.kind) {
			case "title": {
				if ($("head title").length) $("head title").first().text(value);
				else $("head").append(`<title>${escapeHtml(value)}</title>`);
				break;
			}
			case "meta-description": {
				if ($('meta[name="description"]').length) $('meta[name="description"]').attr("content", value);
				else $("head").append(`<meta name="description" content="${escapeAttr(value)}">`);
				break;
			}
			case "h1-text": {
				$("body").prepend(`<h1>${escapeHtml(value)}</h1>`);
				break;
			}
			case "alt-text":
				el.attr("alt", value);
				break;
			case "label-text": {
				// Wrap in an aria-label rather than injecting a visible <label>
				// element, which could disturb the page's existing layout/CSS.
				el.attr("aria-label", value);
				break;
			}
			case "aria-label":
				el.attr("aria-label", value);
				break;
			case "cta-text":
				el.text(value);
				break;
		}

		el.removeAttr(FIX_TARGET_ATTR);
		results.push({
			id: target.id,
			title: target.title,
			category: target.category,
			severity: target.severity,
			status: source === "ai" ? "fixed" : "duplicated",
			note:
				source === "ai"
					? `AI-generated: "${truncate(value, 80)}"`
					: `Reused a similar fix generated earlier this session: "${truncate(value, 80)}"`,
		});
	}

	return results;
}

/** Builds a stable cache key so a fix generated for one "no meta description"
 *  page can be judged reusable for another — deliberately coarse (kind +
 *  category), the caller decides whether reuse is appropriate. */
export function duplicateBankKey(kind: AITargetKind, category: string): string {
	return `${kind}:${category}`;
}

function truncate(s: string, n: number): string {
	return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

function escapeHtml(s: string): string {
	return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c] as string);
}

function escapeAttr(s: string): string {
	return escapeHtml(s).replace(/"/g, "&quot;");
}
