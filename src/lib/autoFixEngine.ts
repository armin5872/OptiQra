// lib/autoFixEngine.ts
//
// Turns the issues htmlAudit.ts / annotateDom() already find into an actual
// fixed page instead of just a list of findings:
//
//  1. Mechanical issues (wrong/missing tag, bad attribute value, mirrorable
//     content that already exists elsewhere on the page) are fixed directly
//     with Cheerio — no AI involved, 100% deterministic.
//  2. Issues that need *authored content* (a title, a meta description,
//     alt text, a form label, a CTA rewrite) are collected as `AITarget`s
//     instead. The caller (the API route) resolves those with a single
//     batched AI call when a key is configured, or with a "duplicate bank"
//     of previously AI-generated values when it isn't.
//  3. Anything that's genuinely unsafe to change blind (e.g. a noindex tag
//     that might be intentional on a staging site, or a structural landmark
//     that depends on knowing the page's real layout) is left alone and
//     reported as "skipped" with a reason, never silently overwritten.
//
// Coverage is intentionally aligned with the issue ids in htmlAudit.ts and
// structuredDataAudit.ts so results line up with what the report/clone
// viewer already shows the user. Server-level issues (compression, cache
// headers, HSTS/CSP, x-powered-by) can't be fixed by editing a single HTML
// document — those are handled separately in project-folder mode, where
// there's an actual server config file to patch.

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

function safeHostname(pageUrl: string): string {
	try {
		return new URL(pageUrl).hostname.replace(/^www\./, "");
	} catch {
		return "";
	}
}

function resolveUrl(href: string, base: string): string {
	try {
		return new URL(href, base).toString();
	} catch {
		return href;
	}
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
	const head = () => ($("head").length ? $("head").get(0)! : $("html").get(0)!);

	const needsAI = (el: Element, target: Omit<AITarget, "id">) => {
		const id = nextId();
		$(el).attr(FIX_TARGET_ATTR, id);
		aiTargets.push({ id, ...target });
	};

	const fixed = (title: string, category: string, severity: Severity, note: string) => {
		results.push({ id: nextId(), title, category, severity, status: "fixed", note });
	};

	const skipped = (title: string, category: string, severity: Severity, note: string) => {
		results.push({ id: nextId(), title, category, severity, status: "skipped", note });
	};

	// Pull these once up front — several fixes below (OG mirroring, schema,
	// rewrite targets) all need to know what the page's title/description
	// currently are.
	const title = $("title").first().text().trim();
	const metaDesc = $('meta[name="description"]').attr("content")?.trim() || "";
	const h1s = $("h1");
	const h1Text = h1s.first().text().trim();

	// ============================= SEO =============================

	// --- Title tag missing or badly sized: needs real authored content. ---
	if (!title) {
		needsAI(head(), {
			kind: "title",
			title: "Title tag is missing",
			category: "SEO",
			severity: "critical",
			context: h1Text ? `Page's H1 is: "${h1Text}". URL: ${pageUrl}` : `URL: ${pageUrl}`,
		});
	} else if (title.length < 10 || title.length > 65) {
		needsAI(head(), {
			kind: "title",
			title: "Title tag length is off",
			category: "SEO",
			severity: "medium",
			context: `Current title ("${title.length} chars"): "${title}". Rewrite to 50-60 characters, keeping the same topic. URL: ${pageUrl}`,
		});
	}

	// --- Meta description missing, too short/long, or duplicates the title. ---
	if (!metaDesc) {
		const bodyText = $("body").text().replace(/\s+/g, " ").trim().slice(0, 300);
		needsAI(head(), {
			kind: "meta-description",
			title: "No meta description",
			category: "SEO",
			severity: "high",
			context: `Page title: "${title}". First page text: "${bodyText}"`,
		});
	} else if (metaDesc.length < 50 || metaDesc.length > 165) {
		needsAI(head(), {
			kind: "meta-description",
			title: "Meta description length is off",
			category: "SEO",
			severity: "medium",
			context: `Current description ("${metaDesc.length} chars"): "${metaDesc}". Rewrite to 140-160 characters, same topic. Page title: "${title}"`,
		});
	} else if (title && metaDesc.toLowerCase() === title.toLowerCase()) {
		needsAI(head(), {
			kind: "meta-description",
			title: "Meta description duplicates the title",
			category: "SEO",
			severity: "medium",
			context: `The description currently just repeats the title ("${title}"). Write a distinct description that adds detail instead of restating it.`,
		});
	}

	// --- No H1: needs to know the page's actual topic. ---
	if (h1s.length === 0) {
		needsAI(head(), {
			kind: "h1-text",
			title: "No H1 heading found",
			category: "SEO",
			severity: "high",
			context: `Page title: "${title}". URL: ${pageUrl}`,
		});
	} else if (h1s.length > 1) {
		// --- Extra H1s: deterministic — demote every H1 after the first to H2. ---
		h1s.each((i, el) => {
			if (i === 0) return;
			const $el = $(el);
			const h2 = $("<h2></h2>");
			h2.html($el.html() || "");
			for (const [name, value] of Object.entries((el as Element).attribs || {})) {
				h2.attr(name, value);
			}
			$el.replaceWith(h2);
		});
		fixed(
			"Extra H1 heading",
			"SEO",
			"medium",
			`Demoted ${h1s.length - 1} extra H1${h1s.length - 1 === 1 ? "" : "s"} to H2.`,
		);
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
			fixed(
				"Heading level skips a step",
				"SEO",
				"medium",
				`Renumbered ${fixedCount} heading${fixedCount === 1 ? "" : "s"} so levels no longer skip.`,
			);
		}
	}

	// --- Missing canonical: deterministic — self-reference the scanned URL. ---
	const canonicalHref = $('link[rel="canonical"]').attr("href");
	if (!canonicalHref) {
		$("head").append(`<link rel="canonical" href="${pageUrl}">`);
		fixed("Missing canonical tag", "SEO", "medium", `Added a self-referencing canonical tag pointing at ${pageUrl}.`);
	} else {
		// --- Relative canonical: deterministic — resolve to an absolute URL. ---
		try {
			new URL(canonicalHref);
		} catch {
			const absolute = resolveUrl(canonicalHref, pageUrl);
			$('link[rel="canonical"]').attr("href", absolute);
			fixed(
				"Canonical URL is relative",
				"SEO",
				"medium",
				`Resolved the canonical href to an absolute URL: ${absolute}.`,
			);
		}
	}

	// --- Cross-domain canonical: could be an intentional syndication setup — skip. ---
	if (canonicalHref) {
		try {
			const canonicalHost = new URL(canonicalHref, pageUrl).hostname;
			if (canonicalHost && canonicalHost !== new URL(pageUrl).hostname) {
				skipped(
					"Canonical points to a different domain",
					"SEO",
					"medium",
					`The canonical tag points at ${canonicalHost}, not this domain — left as-is since that's sometimes intentional (syndicated content). Confirm by hand.`,
				);
			}
		} catch {
			// malformed URL already handled above
		}
	}

	// --- Missing meta charset: deterministic, standard UTF-8 declaration. ---
	if ($("meta[charset]").length === 0 && !/charset\s*=/i.test($('meta[http-equiv="Content-Type"]').attr("content") || "")) {
		$("head").prepend('<meta charset="utf-8">');
		fixed("Missing charset declaration", "SEO", "medium", 'Added <meta charset="utf-8"> as the first tag in <head>.');
	}

	// --- Missing favicon: deterministic — point at the conventional default path. ---
	if ($('link[rel="icon"], link[rel="shortcut icon"]').length === 0) {
		$("head").append('<link rel="icon" href="/favicon.ico">');
		fixed(
			"Missing favicon",
			"SEO",
			"low",
			'Added <link rel="icon" href="/favicon.ico"> — make sure a favicon.ico actually exists at that path.',
		);
	}

	// --- Render-blocking scripts: deterministic — defer script tags in <head>. ---
	{
		let deferCount = 0;
		$("head script[src]").each((_, el) => {
			const $el = $(el);
			if ($el.attr("async") !== undefined || $el.attr("defer") !== undefined) return;
			if (($el.attr("type") || "").includes("module")) return; // modules are deferred by default
			$el.attr("defer", "");
			deferCount++;
		});
		if (deferCount > 0) {
			fixed(
				"Render-blocking JavaScript",
				"SEO",
				"high",
				`Added defer to ${deferCount} blocking script${deferCount === 1 ? "" : "s"} in <head> so they no longer block first paint.`,
			);
		}
	}

	// ========================= Open Graph / Twitter =========================

	const hasOgTitle = !!$('meta[property="og:title"]').attr("content");
	const hasOgDesc = !!$('meta[property="og:description"]').attr("content");
	if (!hasOgTitle && title) {
		$("head").append(`<meta property="og:title" content="${escapeAttr(title)}">`);
		fixed("og:title missing", "SEO", "medium", "Mirrored the existing <title> into an og:title tag.");
	}
	if (!hasOgDesc && metaDesc) {
		$("head").append(`<meta property="og:description" content="${escapeAttr(metaDesc)}">`);
		fixed("og:description missing", "SEO", "medium", "Mirrored the existing meta description into og:description.");
	}
	if (!$('meta[property="og:url"]').attr("content")) {
		$("head").append(`<meta property="og:url" content="${pageUrl}">`);
		fixed("og:url missing", "SEO", "low", `Added og:url pointing at ${pageUrl}.`);
	}
	if (!$('meta[property="og:type"]').attr("content")) {
		$("head").append('<meta property="og:type" content="website">');
		fixed("og:type missing", "SEO", "low", 'Added og:type set to "website" (the safe default).');
	}
	const hostname = safeHostname(pageUrl);
	if (!$('meta[property="og:site_name"]').attr("content") && hostname) {
		$("head").append(`<meta property="og:site_name" content="${escapeAttr(hostname)}">`);
		fixed("og:site_name missing", "SEO", "low", `Added og:site_name derived from the domain (${hostname}).`);
	}

	// og:image can't be authored (AI can't generate an image asset here) —
	// best-effort deterministic fix: reuse the first substantial <img> on the
	// page if there is one; otherwise this is genuinely left unfixed.
	let ogImageHref = $('meta[property="og:image"]').attr("content") || "";
	if (!ogImageHref) {
		const candidateSrc = $("img[src]")
			.filter((_, el) => {
				const src = $(el).attr("src") || "";
				return !!src && !/spacer|divider|decoration|icon|logo/i.test(src);
			})
			.first()
			.attr("src");
		if (candidateSrc) {
			ogImageHref = resolveUrl(candidateSrc, pageUrl);
			$("head").append(`<meta property="og:image" content="${escapeAttr(ogImageHref)}">`);
			fixed(
				"og:image missing",
				"SEO",
				"medium",
				`Used the first on-page image as a best-effort og:image (${ogImageHref}) — swap for a dedicated share image if you have one.`,
			);
		} else {
			skipped(
				"og:image missing",
				"SEO",
				"medium",
				"No suitable on-page image found to reuse, and AI can't generate an image asset — add a dedicated share image (1200×630px) by hand.",
			);
		}
	}

	// --- Twitter card: mirror from Open Graph, fix invalid values deterministically. ---
	const twitterCard = $('meta[name="twitter:card"]').attr("content") || "";
	const validCards = new Set(["summary", "summary_large_image", "app", "player"]);
	if (!twitterCard) {
		if (ogImageHref || hasOgTitle || title) {
			$("head").append('<meta name="twitter:card" content="summary_large_image">');
			if (title) $("head").append(`<meta name="twitter:title" content="${escapeAttr(title)}">`);
			if (metaDesc) $("head").append(`<meta name="twitter:description" content="${escapeAttr(metaDesc)}">`);
			if (ogImageHref) $("head").append(`<meta name="twitter:image" content="${escapeAttr(ogImageHref)}">`);
			fixed("Twitter card missing", "SEO", "low", "Added Twitter card tags mirrored from the page's Open Graph data.");
		} else {
			skipped(
				"Twitter card missing",
				"SEO",
				"low",
				"Nothing to mirror it from yet (no title/OG data) — will resolve once the title/description issues above are fixed.",
			);
		}
	} else if (!validCards.has(twitterCard)) {
		$('meta[name="twitter:card"]').attr("content", "summary_large_image");
		fixed(
			"Twitter card type is invalid",
			"SEO",
			"low",
			`Changed twitter:card from an invalid value ("${twitterCard}") to "summary_large_image".`,
		);
	}

	// --- hreflang correctness: needs knowledge of every locale URL — too risky to guess blind. ---
	if ($('link[rel="alternate"][hreflang]').length > 0) {
		const hasXDefault = $('link[rel="alternate"][hreflang="x-default"]').length > 0;
		const selfRef = $(`link[rel="alternate"][hreflang][href="${pageUrl}"]`).length > 0;
		if (!hasXDefault) {
			skipped(
				"No x-default hreflang",
				"SEO",
				"low",
				"Adding x-default correctly requires knowing which locale should be the fallback — set this by hand.",
			);
		}
		if (!selfRef) {
			skipped(
				"Page doesn't self-reference in hreflang",
				"SEO",
				"medium",
				"Each localized page should list itself in its own hreflang set — verify and add the missing self-reference by hand.",
			);
		}
	}

	// --- Structured data entirely missing: add a minimal, safe WebSite schema. ---
	const hasJsonLd = $('script[type="application/ld+json"]').length > 0;
	const hasMicrodata = $("[itemscope]").length > 0;
	if (!hasJsonLd && !hasMicrodata) {
		const schema: Record<string, unknown> = {
			"@context": "https://schema.org",
			"@type": "WebSite",
			url: pageUrl,
		};
		if (title) schema.name = title;
		$("head").append(`<script type="application/ld+json">${JSON.stringify(schema)}</script>`);
		fixed(
			"No structured data found",
			"SEO",
			"medium",
			"Added a minimal WebSite JSON-LD block. For richer results (Product, LocalBusiness, FAQ, etc.) add a type-specific schema by hand — that needs real business facts AI can't invent safely.",
		);
	}

	// ============================= Accessibility =============================

	// --- Images missing alt text: filename gives a weak clue, AI does the rest. ---
	$("img").each((_, el) => {
		const alt = $(el).attr("alt");
		if (alt !== undefined && alt.trim()) return;
		if (alt !== undefined && alt === "" && /spacer|divider|decoration|icon-|-icon/i.test($(el).attr("src") || "")) return;
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
		fixed(
			"Decorative image has alt text",
			"Accessibility",
			"low",
			'Cleared alt text to alt="" so screen readers skip this decorative image.',
		);
	});

	// --- Lazy-loading: deterministic — add loading="lazy" to offscreen images
	// (skip the first couple, which are likely above the fold / the LCP image). ---
	{
		let lazyCount = 0;
		$("img").each((i, el) => {
			if (i < 2) return;
			const $el = $(el);
			if ($el.attr("loading")) return;
			$el.attr("loading", "lazy");
			lazyCount++;
		});
		if (lazyCount > 0) {
			fixed(
				"Images not lazy-loaded",
				"Performance",
				"medium",
				`Added loading="lazy" to ${lazyCount} below-the-fold image${lazyCount === 1 ? "" : "s"}.`,
			);
		}
	}

	// --- Missing width/height on images (causes layout shift): needs real
	// dimensions, which this pass doesn't fetch — flag rather than guess wrong. ---
	{
		const missingDims = $("img").filter((_, el) => !$(el).attr("width") || !$(el).attr("height")).length;
		if (missingDims > 0) {
			skipped(
				"Images missing width/height",
				"Performance",
				"medium",
				`${missingDims} image${missingDims === 1 ? "" : "s"} missing explicit width/height, which causes layout shift. Add the real pixel dimensions by hand (or re-run the Image Analyzer, which probes actual file dimensions).`,
			);
		}
	}

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

	// --- Missing lang attribute: deterministic default to "en". ---
	const htmlLang = $("html").attr("lang");
	if (!htmlLang) {
		$("html").attr("lang", "en");
		fixed(
			"Missing lang attribute",
			"Accessibility",
			"high",
			'Set lang="en" — change this if the page isn\'t actually in English.',
		);
	}

	// --- Viewport meta tag: deterministic, standard responsive tag. ---
	const viewport = $('meta[name="viewport"]').attr("content") || "";
	if (!viewport) {
		$("head").append('<meta name="viewport" content="width=device-width, initial-scale=1">');
		fixed("No responsive viewport meta tag", "Conversions", "high", "Added a standard responsive viewport meta tag.");
	} else if (/user-scalable=no|maximum-scale=1(\.0)?\b/.test(viewport)) {
		const fixedViewport = viewport
			.replace(/,?\s*user-scalable=no/gi, "")
			.replace(/,?\s*maximum-scale=1(\.0)?\b/gi, "")
			.replace(/^,\s*/, "");
		$('meta[name="viewport"]').attr("content", fixedViewport || "width=device-width, initial-scale=1");
		fixed(
			"Pinch-to-zoom is disabled",
			"Accessibility",
			"medium",
			"Removed user-scalable=no / maximum-scale=1 from the viewport tag.",
		);
	}

	// --- Missing landmark elements: too structural to guess blind — skip. ---
	const landmarks = ["main", "nav", "footer"].filter((t) => $(t).length > 0);
	if (landmarks.length < 3) {
		const missing = ["main", "nav", "footer"].filter((t) => !landmarks.includes(t));
		skipped(
			`Missing landmark element${missing.length === 1 ? "" : "s"}: ${missing.join(", ")}`,
			"Accessibility",
			"low",
			`Wrapping the right content in <${missing.join(">, <")}> needs knowing the page's actual layout — do this one by hand.`,
		);
	}

	// ============================= Conversions =============================

	// --- Generic CTA text: try a deterministic guess from the href, else AI. ---
	$("a, button").each((_, el) => {
		const text = $(el).text().trim().toLowerCase();
		if (!text || !GENERIC_CTA_WORDS.has(text)) return;
		const href = $(el).attr("href") || "";
		const slugGuess = slugToWords(href.split("/").filter(Boolean).pop() || "");
		if (slugGuess && slugGuess.length > 2 && slugGuess.length < 40) {
			const capitalized = slugGuess.replace(/\b\w/g, (c) => c.toUpperCase());
			$(el).text(capitalized);
			fixed(
				"Generic call-to-action text",
				"Conversions",
				"low",
				`Renamed "${text}" to "${capitalized}" based on its link target.`,
			);
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

	// --- External links opening a new tab without rel=noopener/noreferrer. ---
	{
		let relCount = 0;
		$('a[target="_blank"]').each((_, el) => {
			const rel = ($(el).attr("rel") || "").toLowerCase();
			const needsNoopener = !rel.includes("noopener");
			const needsNoreferrer = !rel.includes("noreferrer");
			if (!needsNoopener && !needsNoreferrer) return;
			const parts = new Set(rel.split(/\s+/).filter(Boolean));
			parts.add("noopener");
			parts.add("noreferrer");
			$(el).attr("rel", Array.from(parts).join(" "));
			relCount++;
		});
		if (relCount > 0) {
			fixed(
				"target=_blank links missing rel=noopener",
				"Conversions",
				"medium",
				`Added rel="noopener noreferrer" to ${relCount} new-tab link${relCount === 1 ? "" : "s"} to close the tabnabbing security gap and stop the new tab sharing your window object.`,
			);
		}
	}

	// --- Long forms: a product decision (which fields are actually required),
	// not something to trim automatically. ---
	const formFieldCount = $("form").first().find("input, select, textarea").length;
	if ($("form").length > 0 && formFieldCount > 6) {
		skipped(
			"Form has many fields",
			"Conversions",
			"low",
			`This form has ${formFieldCount} fields — cutting it down is a product decision (which fields are actually required), not something to trim automatically.`,
		);
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
