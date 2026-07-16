import { load, type CheerioAPI, type Element } from "cheerio";
import type { Severity } from "@/lib/auditUtils";

/**
 * Builds a "highlighted clone" of a scanned page: the same markup the audits
 * already look at, tagged element-by-element with the issues found on it,
 * so the UI can render it in an iframe with boxes/labels pointing at the
 * exact offending elements (missing alt text, unlabeled inputs, etc.)
 * instead of only listing counts in a report card.
 */

export const CLONE_ISSUE_ATTR = "data-optiqra-issue";

export interface CloneAnnotation {
	id: string;
	title: string;
	detail: string;
	fix?: string;
	severity: Severity;
	category: string;
}

const GENERIC_CTA_WORDS = new Set([
	"submit",
	"click here",
	"here",
	"go",
	"learn more",
	"read more",
]);

/**
 * Walks the DOM looking for the same class of issues htmlAudit.ts/analyzeA11y
 * report in aggregate, but tags each *individual* offending element with a
 * `data-optiqra-issue` id instead of just counting them. Issues that can't be
 * pinned to one element (missing <title>, no canonical, etc.) go in
 * `pageIssues` instead.
 *
 * Mutates `$` in place (adds attributes) and returns the annotations.
 */
export function annotateDom($: CheerioAPI): {
	elementIssues: CloneAnnotation[];
	pageIssues: CloneAnnotation[];
} {
	const elementIssues: CloneAnnotation[] = [];
	const pageIssues: CloneAnnotation[] = [];
	let counter = 0;
	const nextId = () => `iss-${counter++}`;

	const tag = (el: Element, ann: CloneAnnotation) => {
		const existing = $(el).attr(CLONE_ISSUE_ATTR);
		const ids = existing ? `${existing} ${ann.id}` : ann.id;
		$(el).attr(CLONE_ISSUE_ATTR, ids);
		elementIssues.push(ann);
	};

	// --- Images missing alt text ---
	$("img").each((_, el) => {
		const alt = $(el).attr("alt");
		if (!alt || !alt.trim()) {
			tag(el, {
				id: nextId(),
				title: "Missing alt text",
				detail:
					"This image has no alt attribute, so screen readers announce nothing for it and it can't surface in image search.",
				fix: 'Add a descriptive alt attribute, e.g. alt="a golden retriever running on a beach".',
				severity: "high",
				category: "Accessibility",
			});
		}
	});

	// --- Likely-decorative images with non-empty alt text ---
	$('img[src*="spacer"], img[src*="divider"], img[src*="decoration"]').each(
		(_, el) => {
			const alt = ($(el).attr("alt") || "").trim();
			if (alt) {
				tag(el, {
					id: nextId(),
					title: "Decorative image has alt text",
					detail:
						"This looks like a purely decorative image, but it has non-empty alt text that screen readers will read aloud for no reason.",
					fix: 'Set alt="" on purely decorative images so screen readers skip them.',
					severity: "low",
					category: "Accessibility",
				});
			}
		},
	);

	// --- Form fields without an associated label ---
	$(
		'input:not([type="hidden"]):not([type="submit"]):not([type="button"]), select, textarea',
	).each((_, el) => {
		const id = $(el).attr("id");
		const hasLabel = !!id && $(`label[for="${id}"]`).length > 0;
		const hasAria = $(el).attr("aria-label") || $(el).attr("aria-labelledby");
		const wrappedInLabel = $(el).parents("label").length > 0;
		if (!hasLabel && !hasAria && !wrappedInLabel) {
			tag(el, {
				id: nextId(),
				title: "No associated label",
				detail:
					"This form field has no <label>, aria-label, or aria-labelledby, so screen reader users hear nothing describing it when it's focused.",
				fix: 'Add a <label for="..."> element (or an aria-label) tied to this field.',
				severity: "high",
				category: "Accessibility",
			});
		}
	});

	// --- Icon-only buttons/links with no accessible name ---
	$('button, a[role="button"]').each((_, el) => {
		const text = $(el).text().trim();
		const hasAria =
			$(el).attr("aria-label") ||
			$(el).attr("aria-labelledby") ||
			$(el).attr("title");
		if (!text && !hasAria) {
			tag(el, {
				id: nextId(),
				title: "No accessible name",
				detail:
					'This button/link shows only an icon and exposes no text, aria-label, or title, so screen readers just announce "button".',
				fix: "Add an aria-label describing the action this control performs.",
				severity: "medium",
				category: "Accessibility",
			});
		}
	});

	// --- Extra H1s (first one is fine, the rest dilute the topic signal) ---
	const h1s = $("h1");
	if (h1s.length > 1) {
		h1s.each((i, el) => {
			if (i === 0) return;
			tag(el, {
				id: nextId(),
				title: "Extra H1 heading",
				detail: `This page has ${h1s.length} H1 elements. Extra H1s dilute the page's topical signal for search engines and can confuse heading-based navigation.`,
				fix: "Keep a single H1 per page and demote the rest to H2/H3.",
				severity: "medium",
				category: "SEO",
			});
		});
	}

	// --- Heading levels that skip a step (H2 straight to H4, etc.) ---
	let prevLevel = 0;
	$("h1, h2, h3, h4, h5, h6").each((_, el) => {
		const level = Number(el.tagName.slice(1));
		if (prevLevel && level - prevLevel > 1) {
			tag(el, {
				id: nextId(),
				title: "Heading level skips a step",
				detail: `This heading jumps from H${prevLevel} to H${level}, breaking the logical outline for screen readers and crawlers.`,
				fix: "Restructure headings so each level follows in order without skipping.",
				severity: "medium",
				category: "SEO",
			});
		}
		prevLevel = level;
	});

	// --- Generic call-to-action text ---
	$("a, button").each((_, el) => {
		const text = $(el).text().trim().toLowerCase();
		if (text && GENERIC_CTA_WORDS.has(text)) {
			tag(el, {
				id: nextId(),
				title: "Generic call-to-action text",
				detail: `This button/link just says "${text}", which doesn't tell visitors what happens next.`,
				fix: 'Rename it to describe the outcome, e.g. "Start free trial" instead of "Submit".',
				severity: "low",
				category: "Conversions",
			});
		}
	});

	// --- Page-level issues (no single element to point at) ---
	const title = $("title").first().text().trim();
	if (!title) {
		pageIssues.push({
			id: nextId(),
			title: "Title tag is missing",
			detail:
				"No <title> element was found in the page head, so search results fall back to a generic or unreadable title.",
			fix: "Add a unique, descriptive <title> tag, ideally 50–60 characters.",
			severity: "critical",
			category: "SEO",
		});
	}

	const metaDesc = $('meta[name="description"]').attr("content") || "";
	if (!metaDesc.trim()) {
		pageIssues.push({
			id: nextId(),
			title: "No meta description",
			detail:
				"Search engines are writing their own snippet because no meta description was found.",
			fix: "Add a 140–160 character meta description summarizing the page.",
			severity: "high",
			category: "SEO",
		});
	}

	const canonical = $('link[rel="canonical"]').attr("href");
	if (!canonical) {
		pageIssues.push({
			id: nextId(),
			title: "Missing canonical tag",
			detail:
				"Without a canonical tag, pages reachable through multiple URLs (tracking params, trailing slashes) risk being indexed as duplicates.",
			fix: 'Add a self-referencing <link rel="canonical"> tag.',
			severity: "medium",
			category: "SEO",
		});
	}

	if (h1s.length === 0) {
		pageIssues.push({
			id: nextId(),
			title: "No H1 heading found",
			detail:
				"The page has no top-level H1, leaving both users and search engines without a clear statement of the page topic.",
			fix: "Add exactly one H1 that describes the page's main topic.",
			severity: "high",
			category: "SEO",
		});
	}

	const htmlLang = $("html").attr("lang");
	if (!htmlLang) {
		pageIssues.push({
			id: nextId(),
			title: "Missing lang attribute",
			detail:
				"Screen readers use this attribute to choose the correct pronunciation and voice; without it they default to guessing.",
			fix: 'Add a lang attribute, e.g. <html lang="en">.',
			severity: "high",
			category: "Accessibility",
		});
	}

	const viewport = $('meta[name="viewport"]').attr("content") || "";
	if (!viewport) {
		pageIssues.push({
			id: nextId(),
			title: "No responsive viewport meta tag",
			detail:
				"Without a viewport meta tag, mobile browsers render a desktop layout and zoom out, making buttons and text hard to tap and read.",
			fix: 'Add <meta name="viewport" content="width=device-width, initial-scale=1">.',
			severity: "high",
			category: "Conversions",
		});
	} else if (/user-scalable=no|maximum-scale=1(\.0)?\b/.test(viewport)) {
		pageIssues.push({
			id: nextId(),
			title: "Pinch-to-zoom is disabled",
			detail:
				"The viewport meta tag blocks zooming, which many low-vision users rely on to read content.",
			fix: "Remove user-scalable=no and maximum-scale restrictions from the viewport meta tag.",
			severity: "medium",
			category: "Accessibility",
		});
	}

	const landmarks = ["main", "nav", "footer"].filter((t) => $(t).length > 0);
	if (landmarks.length < 3) {
		const missing = ["main", "nav", "footer"].filter(
			(t) => !landmarks.includes(t),
		);
		pageIssues.push({
			id: nextId(),
			title: `Missing landmark element${missing.length === 1 ? "" : "s"}: ${missing.join(", ")}`,
			detail:
				"Landmark regions let screen reader users jump directly to the main content, navigation, or footer instead of tabbing through everything.",
			fix: "Wrap key regions in <main>, <nav>, and <footer> elements.",
			severity: "low",
			category: "Accessibility",
		});
	}

	const robotsMeta = $('meta[name="robots"]').attr("content") || "";
	if (/noindex/i.test(robotsMeta)) {
		pageIssues.push({
			id: nextId(),
			title: "Page is marked noindex",
			detail:
				"A robots meta tag is telling search engines not to index this page.",
			fix: "Remove the noindex directive if this page should appear in search results.",
			severity: "critical",
			category: "SEO",
		});
	}

	return { elementIssues, pageIssues };
}

/**
 * Takes the raw (or JS-rendered) HTML for a page and returns a sanitized,
 * annotated copy safe to embed in a sandboxed iframe via `srcDoc`:
 *  - a <base> tag is added so the page's relative asset/link URLs resolve
 *    against the real site instead of our app's origin
 *  - <script> tags, inline event handlers, javascript: URLs, meta-refresh,
 *    and any CSP meta tag are stripped, since we only want to *display* the
 *    already-rendered snapshot, not let the original page's JS run again
 *    inside our UI (the overlay script the client injects afterward is the
 *    only script that should execute there)
 *  - every element with a detectable issue is tagged with
 *    `data-optiqra-issue="<id> <id> ..."` so the client can draw a box/label
 *    over the exact element without needing fragile CSS selectors
 */
export function buildAnnotatedClone(rawHtml: string, baseUrl: string) {
	const $ = load(rawHtml);

	// The snapshot we render is either the raw fetch or an already-executed
	// jsdom render — either way we don't want the page's own scripts running
	// a second time inside the viewer's iframe.
	$("script").remove();
	$("meta[http-equiv]")
		.filter((_, el) => {
			const value = ($(el).attr("http-equiv") || "").toLowerCase();
			return value === "content-security-policy" || value === "refresh";
		})
		.remove();

	$("*").each((_, el) => {
		const attribs = el.attribs;
		if (!attribs) return;
		for (const name of Object.keys(attribs)) {
			if (/^on/i.test(name)) $(el).removeAttr(name);
		}
		const href = $(el).attr("href");
		if (href && /^\s*javascript:/i.test(href)) $(el).attr("href", "#");
	});

	const { elementIssues, pageIssues } = annotateDom($);

	if ($("head base").length === 0) {
		$("head").prepend(`<base href="${baseUrl}">`);
	}

	return { html: $.html(), elementIssues, pageIssues };
}
