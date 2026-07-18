import * as cheerio from "cheerio";
import type { CheerioAPI } from "cheerio";
import { issue, pass, scoreFromIssues, type Issue } from "@/lib/auditUtils";
import { analyzeCrawlFiles } from "@/lib/crawlAudit";
import { analyzeStructuredData } from "@/lib/structuredDataAudit";

export type { Issue } from "@/lib/auditUtils";
export { issue, pass, scoreFromIssues } from "@/lib/auditUtils";

const GENERIC_CTA_WORDS = [
	"submit",
	"click here",
	"here",
	"go",
	"learn more",
	"read more",
];
const TRUST_KEYWORDS = [
	"testimonial",
	"review",
	"trusted by",
	"as seen in",
	"guarantee",
	"rated",
	"customers",
	"star",
];

export async function fetchPage(targetUrl: string, options?: { signal?: AbortSignal }) {
	const started = Date.now();
	// Next.js specific: Cache this raw HTML fetch for 1 hour to prevent redundant external loads
	const response = await fetch(targetUrl, {
		redirect: "follow",
		headers: { "User-Agent": "OptiqraBot/1.0 (+https://optiqra.vercel.app/bot)" },
		next: { revalidate: 3600 },
		signal: options?.signal,
	});
	const elapsedMs = Date.now() - started;
	const html = await response.text();
	return { response, html, elapsedMs };
}

export async function analyzeSEO(
	$: CheerioAPI,
	html: string,
	targetUrl: string,
	options?: { includeCrawlFiles?: boolean },
) {
	const includeCrawlFiles = options?.includeCrawlFiles ?? true;
	const issues: Issue[] = [];
	const passed: Issue[] = [];

	const title = $("title").first().text().trim();
	if (!title) {
		issues.push(
			issue(
				"title",
				"Title tag is missing",
				"No <title> element was found in the page head, so search results fall back to a generic or unreadable title.",
				"Add a unique, descriptive <title> tag, ideally 50–60 characters.",
				14,
			),
		);
	} else if (title.length < 10 || title.length > 65) {
		issues.push(
			issue(
				"title-length",
				"Title tag length is off",
				`The title is ${title.length} characters ("${title.slice(0, 60)}${title.length > 60 ? "…" : ""}"). Search engines typically truncate titles outside the 50–60 character range.`,
				"Tighten the title to roughly 50–60 characters while keeping it descriptive.",
				6,
			),
		);
	} else {
		passed.push(pass("title", "Title tag is present and well-sized"));
	}

	const metaDesc = $('meta[name="description"]').attr("content") || "";
	if (!metaDesc.trim()) {
		issues.push(
			issue(
				"meta-desc",
				"No meta description",
				"Search engines are writing their own snippet because no meta description was found.",
				"Add a 140–160 character meta description summarizing the page.",
				9,
			),
		);
	} else if (metaDesc.length < 50 || metaDesc.length > 165) {
		issues.push(
			issue(
				"meta-desc-length",
				"Meta description length is off",
				`The description is ${metaDesc.length} characters, outside the ~140–160 range search engines display in full.`,
				"Adjust the meta description to roughly 140–160 characters.",
				5,
			),
		);
	} else {
		passed.push(
			pass("meta-desc", "Meta description is present and well-sized"),
		);
	}

	if (
		metaDesc.trim() &&
		title &&
		metaDesc.trim().toLowerCase() === title.trim().toLowerCase()
	) {
		issues.push(
			issue(
				"meta-desc-duplicates-title",
				"Meta description is identical to the title tag",
				"The meta description just repeats the title verbatim instead of adding new information, so the search snippet wastes the chance to give searchers an extra reason to click through.",
				"Write a meta description that summarizes the page's content rather than repeating the title.",
				3,
			),
		);
	}

	const canonical = $('link[rel="canonical"]').attr("href");
	if (!canonical) {
		issues.push(
			issue(
				"canonical",
				"Missing canonical tag",
				"Without a canonical tag, pages reachable through multiple URLs (tracking params, trailing slashes) risk being indexed as duplicates.",
				'Add a self-referencing <link rel="canonical"> tag to every indexable page.',
				8,
			),
		);
	} else if (!/^https?:\/\//i.test(canonical)) {
		issues.push(
			issue(
				"canonical-relative",
				"Canonical tag uses a relative URL",
				`The canonical href ("${canonical}") isn't a full absolute URL. Google's own guidance recommends absolute URLs for canonical tags to avoid ambiguity if the tag is copied elsewhere or the base URL changes.`,
				"Use a full absolute URL (https://...) in the canonical tag rather than a relative path.",
				3,
			),
		);
	} else {
		try {
			const canonicalOrigin = new URL(canonical).origin;
			const pageOrigin = new URL(targetUrl).origin;
			if (canonicalOrigin !== pageOrigin) {
				issues.push(
					issue(
						"canonical-cross-domain",
						"Canonical tag points to a different domain",
						`The canonical URL ("${canonical}") points to a different domain than the page being audited (${pageOrigin}). This is sometimes intentional (e.g. syndicated content), but if unintended it tells search engines to index the other domain's URL instead of this one.`,
						"Confirm this is intentional; otherwise point the canonical tag at this page's own domain.",
						4,
					),
				);
			} else {
				passed.push(pass("canonical", "Canonical tag is present and absolute"));
			}
		} catch {
			passed.push(pass("canonical", "Canonical tag is present"));
		}
	}

	const h1s = $("h1");
	if (h1s.length === 0) {
		issues.push(
			issue(
				"h1-missing",
				"No H1 heading found",
				"The page has no top-level H1, leaving both users and search engines without a clear statement of the page topic.",
				"Add exactly one H1 that describes the page's main topic.",
				10,
			),
		);
	} else if (h1s.length > 1) {
		issues.push(
			issue(
				"h1-multiple",
				`Multiple H1 headings found (${h1s.length})`,
				"Several H1 elements dilute the page's topical signal and can confuse heading-based navigation.",
				"Keep a single H1 per page and demote the rest to H2/H3.",
				6,
			),
		);
	} else {
		passed.push(pass("h1", "Exactly one H1 heading"));
	}

	const headingLevels: number[] = [];
	$("h1, h2, h3, h4, h5, h6").each((_, el) => {
		headingLevels.push(Number(el.tagName.slice(1)));
	});
	let skipped = false;
	for (let i = 1; i < headingLevels.length; i++) {
		if (headingLevels[i] - headingLevels[i - 1] > 1) skipped = true;
	}
	if (skipped) {
		issues.push(
			issue(
				"heading-order",
				"Heading levels skip a step",
				"Somewhere the page jumps, e.g. H2 straight to H4, which breaks the logical outline for screen readers and crawlers.",
				"Restructure headings so each level follows in order without skipping.",
				6,
			),
		);
	} else if (headingLevels.length > 1) {
		passed.push(pass("heading-order", "Heading hierarchy is in order"));
	}

	const imgs = $("img");
	const missingAlt = imgs.filter(
		(_, el) => !$(el).attr("alt") || !($(el).attr("alt") || "").trim(),
	).length;
	if (imgs.length > 0 && missingAlt > 0) {
		issues.push(
			issue(
				"alt-text",
				`${missingAlt} of ${imgs.length} images missing alt text`,
				"Images without descriptive alt attributes lose potential image-search traffic and provide no fallback content.",
				"Add descriptive alt text to every meaningful image.",
				missingAlt / Math.max(imgs.length, 1) > 0.5 ? 10 : 6,
			),
		);
	} else if (imgs.length > 0) {
		passed.push(pass("alt-text", "All images have alt text"));
	}

	const robotsMeta = $('meta[name="robots"]').attr("content") || "";
	if (/noindex/i.test(robotsMeta)) {
		issues.push(
			issue(
				"noindex",
				"Page is marked noindex",
				"A robots meta tag is telling search engines not to index this page.",
				"Remove the noindex directive if this page should appear in search results.",
				15,
			),
		);
	}

	if (includeCrawlFiles) {
		const crawlAudit = await analyzeCrawlFiles(targetUrl);
		issues.push(...crawlAudit.issues);
		passed.push(...crawlAudit.passed);
	}

	// --- Hreflang tags ---
	const hreflangLinks = $('link[rel="alternate"][hreflang]');
	if (hreflangLinks.length > 0) {
		let invalidCode = false;
		let hasXDefault = false;
		let hasSelfRef = false;
		const codes: string[] = [];

		hreflangLinks.each((_, el) => {
			const code = ($(el).attr("hreflang") || "").trim().toLowerCase();
			const href = $(el).attr("href") || "";
			codes.push(code);
			if (code === "x-default") {
				hasXDefault = true;
			} else if (!/^[a-z]{2,3}(-[a-z]{2}|-\d{3})?$/.test(code)) {
				invalidCode = true;
			}
			try {
				if (new URL(href, targetUrl).toString() === new URL(targetUrl).toString()) {
					hasSelfRef = true;
				}
			} catch {
				// unresolvable href is covered by invalidCode-adjacent issues elsewhere
			}
		});

		if (invalidCode) {
			issues.push(
				issue(
					"hreflang-invalid",
					"Invalid hreflang language code(s) found",
					`One or more hreflang values (${codes.join(", ")}) don't match a valid ISO 639-1 language code or language-region pair. Search engines ignore alternates with unrecognized codes entirely.`,
					'Use valid codes like "en", "en-us", or "x-default" for the international fallback.',
					5,
				),
			);
		} else {
			passed.push(pass("hreflang-valid", "hreflang codes are valid"));
		}

		if (hreflangLinks.length > 1 && !hasXDefault) {
			issues.push(
				issue(
					"hreflang-no-x-default",
					"No x-default hreflang fallback",
					"Multiple language/region alternates are declared but none is marked hreflang=\"x-default\", so visitors whose language doesn't match any listed variant get no explicit fallback page.",
					'Add <link rel="alternate" hreflang="x-default" href="..."> pointing at your default/international page.',
					3,
				),
			);
		}

		if (!hasSelfRef) {
			issues.push(
				issue(
					"hreflang-no-self-reference",
					"Page doesn't reference itself in its hreflang set",
					"Google's guidelines expect every page in a hreflang group to include a self-referencing alternate; without one, the whole annotation set can be disregarded.",
					"Add a hreflang alternate for this exact URL pointing back to itself.",
					4,
				),
			);
		}
	}

	// --- Charset declaration ---
	const hasCharset =
		$("meta[charset]").length > 0 ||
		/charset=/i.test($('meta[http-equiv="Content-Type"]').attr("content") || "");
	if (!hasCharset) {
		issues.push(
			issue(
				"meta-charset",
				"No charset declared",
				"Neither a <meta charset> tag nor a Content-Type meta tag with a charset was found in the page head. Without an explicit charset, browsers have to guess the encoding, which can occasionally garble non-ASCII text before it's indexed.",
				'Add <meta charset="UTF-8"> as the first element inside <head>.',
				3,
			),
		);
	} else {
		passed.push(pass("meta-charset", "Charset is declared"));
	}

	// --- Favicon ---
	const hasFavicon =
		$('link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]')
			.length > 0;
	if (!hasFavicon) {
		issues.push(
			issue(
				"favicon",
				"No favicon declared",
				'No <link rel="icon"> (or shortcut/apple-touch-icon) tag was found. Google displays a page\'s favicon next to its listing in both mobile and desktop search results, so a missing one leaves search results looking generic.',
				'Add <link rel="icon" href="/favicon.ico" sizes="any"> in <head> (plus an SVG/PNG variant for higher resolution).',
				3,
			),
		);
	} else {
		passed.push(pass("favicon", "Favicon is declared"));
	}

	// --- Thin content ---
	const bodyWordCount = $("body")
		.text()
		.replace(/\s+/g, " ")
		.trim()
		.split(" ")
		.filter(Boolean).length;
	if (bodyWordCount > 0 && bodyWordCount < 300) {
		issues.push(
			issue(
				"thin-content",
				`Page has very little text content (${bodyWordCount} words)`,
				"Pages with very little unique body text give search engines little to rank on and are more likely to be treated as thin content, especially if similar pages exist elsewhere on the site.",
				"Expand the page with substantive, unique content relevant to its topic, or noindex it if it's intentionally minimal (e.g. a redirect or utility page).",
				6,
			),
		);
	} else if (bodyWordCount >= 300) {
		passed.push(
			pass(
				"thin-content",
				`Page has substantive body content (${bodyWordCount.toLocaleString()} words)`,
			),
		);
	}

	// --- URL structure ---
	try {
		const urlObj = new URL(targetUrl);
		const path = urlObj.pathname;
		const urlProblems: string[] = [];
		if (/[A-Z]/.test(path)) urlProblems.push("contains uppercase letters");
		if (/_/.test(path)) urlProblems.push("uses underscores instead of hyphens");
		if (urlObj.search && urlObj.search.length > 30) {
			urlProblems.push("carries a long query string");
		}
		if (urlProblems.length > 0) {
			issues.push(
				issue(
					"url-structure",
					"URL structure could be cleaner",
					`This page's URL ${urlProblems.join(" and ")}. Google treats hyphens as word separators but not underscores, and mixed-case or heavily-parameterized URLs are more prone to being treated as duplicates of a cleaner canonical version.`,
					"Prefer lowercase, hyphen-separated paths and keep query parameters minimal on the canonical/indexable URL.",
					2,
				),
			);
		} else {
			passed.push(pass("url-structure", "URL structure follows SEO-friendly conventions"));
		}
	} catch {
		// invalid targetUrl would already have failed earlier in the pipeline
	}

	// --- Open Graph & Twitter Card ---
	const ogTitle = $('meta[property="og:title"]').attr("content")?.trim();
	const ogDesc = $('meta[property="og:description"]').attr("content")?.trim();
	const ogImage = $('meta[property="og:image"]').attr("content")?.trim();
	const ogUrl = $('meta[property="og:url"]').attr("content")?.trim();
	const ogType = $('meta[property="og:type"]').attr("content")?.trim();
	const ogSiteName = $('meta[property="og:site_name"]').attr("content")?.trim();

	const twitterCard = $('meta[name="twitter:card"]').attr("content")?.trim();
	const twitterTitle = $('meta[name="twitter:title"]').attr("content")?.trim();
	const twitterDesc = $('meta[name="twitter:description"]')
		.attr("content")
		?.trim();
	const twitterImage = $('meta[name="twitter:image"]').attr("content")?.trim();

	if (!ogTitle || !ogDesc) {
		const missing =
			!ogTitle && !ogDesc ? "og:title and og:description are"
			: !ogTitle ? "og:title is"
			: "og:description is";
		issues.push(
			issue(
				"og-basic",
				"Missing core Open Graph tags",
				`${missing} missing, so links shared on Facebook, LinkedIn, Slack, and similar platforms fall back to a blank or auto-generated title/snippet.`,
				"Add og:title and og:description meta tags with content written for social sharing.",
				5,
			),
		);
	} else {
		passed.push(pass("og-basic", "og:title and og:description are present"));
	}

	if (!ogImage) {
		issues.push(
			issue(
				"og-image",
				"Missing og:image",
				"Without an og:image tag, shared links render as a plain text card with no thumbnail, which measurably lowers click-through on social feeds.",
				'Add <meta property="og:image" content="https://.../preview.jpg"> pointing at a roughly 1200×630 image.',
				8,
			),
		);
	} else {
		passed.push(pass("og-image", "og:image is present"));
	}

	if (!ogUrl) {
		issues.push(
			issue(
				"og-url",
				"Missing og:url",
				"Without og:url, shares of the same page reached through different query strings or paths can be treated as separate URLs, splitting likes and shares across duplicates.",
				`Add <meta property="og:url" content="${targetUrl}"> using the canonical URL of the page.`,
				3,
			),
		);
	} else {
		passed.push(pass("og-url", "og:url is present"));
	}

	if (!ogType) {
		issues.push(
			issue(
				"og-type",
				"Missing og:type",
				'Open Graph silently defaults to "website" when og:type is absent, but declaring it explicitly (article, product, etc.) unlocks richer, type-specific card layouts on some platforms.',
				'Add <meta property="og:type" content="website"> (or "article", "product", etc. as appropriate).',
				2,
			),
		);
	} else {
		passed.push(pass("og-type", "og:type is present"));
	}

	if (!ogSiteName) {
		issues.push(
			issue(
				"og-site-name",
				"Missing og:site_name",
				"Without og:site_name, some platforms omit the brand label that normally appears above the title in a shared card.",
				'Add <meta property="og:site_name" content="Your Site Name">.',
				2,
			),
		);
	} else {
		passed.push(pass("og-site-name", "og:site_name is present"));
	}

	const VALID_TWITTER_CARDS = [
		"summary",
		"summary_large_image",
		"app",
		"player",
	];
	if (!twitterCard) {
		issues.push(
			issue(
				"twitter-card",
				"Missing twitter:card",
				"X/Twitter will not render a rich preview at all without a twitter:card tag, even when Open Graph tags are present.",
				'Add <meta name="twitter:card" content="summary_large_image"> (or "summary" for a smaller preview).',
				4,
			),
		);
	} else if (!VALID_TWITTER_CARDS.includes(twitterCard)) {
		issues.push(
			issue(
				"twitter-card-invalid",
				`Unrecognized twitter:card value ("${twitterCard}")`,
				'X/Twitter only recognizes "summary", "summary_large_image", "app", and "player" as twitter:card values — anything else causes the preview to silently fail.',
				'Set twitter:card to "summary_large_image" for most content pages.',
				4,
			),
		);
	} else {
		passed.push(pass("twitter-card", "twitter:card is present and valid"));
	}

	// twitter:title / twitter:description / twitter:image fall back to their
	// og: equivalents when omitted, so only flag a gap when neither is set.
	const effectiveTwitterTitle = twitterTitle || ogTitle;
	const effectiveTwitterDesc = twitterDesc || ogDesc;
	const effectiveTwitterImage = twitterImage || ogImage;
	if (
		twitterCard &&
		(!effectiveTwitterTitle || !effectiveTwitterDesc || !effectiveTwitterImage)
	) {
		const missingParts = [
			!effectiveTwitterTitle && "title",
			!effectiveTwitterDesc && "description",
			!effectiveTwitterImage && "image",
		]
			.filter(Boolean)
			.join(", ");
		issues.push(
			issue(
				"twitter-content",
				`Twitter card is missing ${missingParts}`,
				"twitter:title, twitter:description, and twitter:image fall back to their og: equivalents when absent, but neither the twitter:* nor the og: version is set here, so the card renders incomplete.",
				"Add the missing twitter:* tags directly, or add the matching og: tags so Twitter can fall back to them.",
				3,
			),
		);
	} else if (twitterCard) {
		passed.push(
			pass(
				"twitter-content",
				"Twitter card has title, description, and image (directly or via Open Graph fallback)",
			),
		);
	}

	const structuredDataResult = analyzeStructuredData($, html);
	issues.push(...structuredDataResult.issues);
	passed.push(...structuredDataResult.passed);

	return { issues, passed };
}

export function analyzeSpeed(
	$: CheerioAPI,
	html: string,
	response: Response,
	elapsedMs: number,
) {
	const issues: Issue[] = [];
	const passed: Issue[] = [];

	const sizeKb = Buffer.byteLength(html, "utf8") / 1024;
	if (sizeKb > 300) {
		issues.push(
			issue(
				"html-size",
				`HTML document is large (${Math.round(sizeKb)} KB)`,
				"A large initial HTML payload delays first paint, especially on slower connections.",
				"Trim unused markup and move large inline content out of the initial HTML.",
				sizeKb > 600 ? 12 : 7,
			),
		);
	} else {
		passed.push(pass("html-size", "Initial HTML payload is a reasonable size"));
	}

	if (elapsedMs > 800) {
		issues.push(
			issue(
				"ttfb",
				`Server response took ${elapsedMs}ms`,
				"A slow time-to-first-byte delays everything else on the page, since the browser can't start rendering until the response arrives.",
				"Investigate server/database response time, or add caching/CDN in front of the origin.",
				elapsedMs > 1800 ? 15 : 9,
			),
		);
	} else {
		passed.push(pass("ttfb", "Server responded quickly"));
	}

	const encoding = response.headers.get("content-encoding") || "";
	if (!/br|gzip|deflate/i.test(encoding)) {
		issues.push(
			issue(
				"compression",
				"Response is not compressed",
				"No gzip/Brotli content-encoding header was returned, so the page transfers larger than necessary.",
				"Enable gzip or Brotli compression on the server or CDN.",
				9,
			),
		);
	} else {
		passed.push(pass("compression", "Response is compressed"));
	}

	const cacheControl = response.headers.get("cache-control") || "";
	if (!cacheControl) {
		issues.push(
			issue(
				"cache",
				"No Cache-Control header",
				"Without caching headers, repeat visitors re-download the page unnecessarily.",
				"Set Cache-Control headers appropriate to how often the page changes.",
				6,
			),
		);
	} else {
		passed.push(pass("cache", "Cache-Control header is set"));
	}

	const blockingScripts = $("head script").filter(
		(_, el) =>
			!$(el).attr("async") &&
			!$(el).attr("defer") &&
			!$(el).attr("type")?.includes("module"),
	).length;
	if (blockingScripts > 0) {
		issues.push(
			issue(
				"render-blocking-js",
				`${blockingScripts} render-blocking script${blockingScripts === 1 ? "" : "s"} in <head>`,
				"Scripts in the head without async/defer stop the browser from parsing the rest of the page until they finish loading.",
				"Add defer (or async, if order doesn't matter) to head scripts, or move them before </body>.",
				blockingScripts > 2 ? 11 : 7,
			),
		);
	} else {
		passed.push(
			pass("render-blocking-js", "No render-blocking scripts in <head>"),
		);
	}

	const stylesheets = $('link[rel="stylesheet"]').length;
	if (stylesheets > 4) {
		issues.push(
			issue(
				"css-count",
				`${stylesheets} separate stylesheets loaded`,
				"Many separate CSS files each cost a network round trip before the page can be styled.",
				"Bundle stylesheets and load non-critical CSS asynchronously.",
				6,
			),
		);
	}

	const imgsNoSize = $("img").filter(
		(_, el) => !$(el).attr("width") || !$(el).attr("height"),
	).length;
	const totalImgs = $("img").length;
	if (totalImgs > 0 && imgsNoSize > 0) {
		issues.push(
			issue(
				"cls-images",
				`${imgsNoSize} of ${totalImgs} images missing width/height`,
				"Images without explicit dimensions cause layout shifts as they load, pushing content around the page.",
				"Add width and height attributes (or aspect-ratio in CSS) to every image.",
				imgsNoSize / totalImgs > 0.5 ? 10 : 6,
			),
		);
	} else if (totalImgs > 0) {
		passed.push(pass("cls-images", "Images have explicit dimensions"));
	}

	const lazyImgs = $('img[loading="lazy"]').length;
	if (totalImgs > 6 && lazyImgs === 0) {
		issues.push(
			issue(
				"lazy-loading",
				"No images use lazy loading",
				"Every image on a long page loads immediately, even ones far below the fold.",
				'Add loading="lazy" to images that appear below the initial viewport.',
				5,
			),
		);
	}

	return { issues, passed };
}

export function analyzeA11y($: CheerioAPI) {
	const issues: Issue[] = [];
	const passed: Issue[] = [];

	const htmlLang = $("html").attr("lang");
	if (!htmlLang) {
		issues.push(
			issue(
				"lang",
				"Missing lang attribute on <html>",
				"Screen readers use this attribute to choose the correct pronunciation and voice; without it they default to guessing.",
				'Add a lang attribute, e.g. <html lang="en">.',
				8,
			),
		);
	} else {
		passed.push(pass("lang", "Page declares a language"));
	}

	const inputs = $(
		'input:not([type="hidden"]):not([type="submit"]):not([type="button"])',
	);
	let unlabeled = 0;
	inputs.each((_, el) => {
		const id = $(el).attr("id");
		const hasLabel = id && $(`label[for="${id}"]`).length > 0;
		const hasAria = $(el).attr("aria-label") || $(el).attr("aria-labelledby");
		const wrappedInLabel = $(el).parents("label").length > 0;
		if (!hasLabel && !hasAria && !wrappedInLabel) unlabeled++;
	});
	if (inputs.length > 0 && unlabeled > 0) {
		issues.push(
			issue(
				"labels",
				`${unlabeled} of ${inputs.length} form fields have no associated label`,
				"Inputs relying on placeholder text alone lose their hint on focus and are often skipped by screen readers.",
				'Add a <label for="..."> element (or aria-label) tied to every input.',
				unlabeled > 2 ? 12 : 8,
			),
		);
	} else if (inputs.length > 0) {
		passed.push(pass("labels", "Form fields have associated labels"));
	}

	const iconButtons = $('button, a[role="button"]').filter((_, el) => {
		const text = $(el).text().trim();
		const hasAria =
			$(el).attr("aria-label") ||
			$(el).attr("aria-labelledby") ||
			$(el).attr("title");
		return !text && !hasAria;
	}).length;
	if (iconButtons > 0) {
		issues.push(
			issue(
				"button-names",
				`${iconButtons} button${iconButtons === 1 ? "" : "s"} with no accessible name`,
				'Buttons that show only an icon and expose no text or aria-label are announced as "button" with no purpose to screen reader users.',
				"Add an aria-label describing the action each icon-only button performs.",
				9,
			),
		);
	}

	const landmarks = ["main", "nav", "footer"].filter(
		(tag) =>
			$(tag).length > 0 ||
			$(
				`[role="${
					tag === "main" ? "main"
					: tag === "nav" ? "navigation"
					: "contentinfo"
				}"]`,
			).length > 0,
	);
	if (landmarks.length < 3) {
		const missing = ["main", "nav", "footer"].filter(
			(t) => !landmarks.includes(t),
		);
		issues.push(
			issue(
				"landmarks",
				`Missing landmark element${missing.length === 1 ? "" : "s"}: ${missing.join(", ")}`,
				"Landmark regions let screen reader users jump directly to the main content, navigation, or footer instead of tabbing through everything.",
				"Wrap key regions in <main>, <nav>, and <footer> elements.",
				7,
			),
		);
	} else {
		passed.push(pass("landmarks", "Page uses main/nav/footer landmarks"));
	}

	const decorativeCandidates = $(
		'img[src*="spacer"], img[src*="divider"], img[src*="decoration"]',
	);
	const badDecorative = decorativeCandidates.filter(
		(_, el) => !!($(el).attr("alt") || "").trim(),
	).length;
	if (badDecorative > 0) {
		issues.push(
			issue(
				"decorative-alt",
				"Likely decorative images have non-empty alt text",
				'Purely decorative images should have alt="" so screen readers skip them instead of reading a meaningless description.',
				'Set alt="" on purely decorative images.',
				4,
			),
		);
	}

	const viewport = $('meta[name="viewport"]').attr("content") || "";
	if (/user-scalable=no|maximum-scale=1(\.0)?\b/.test(viewport)) {
		issues.push(
			issue(
				"zoom-disabled",
				"Pinch-to-zoom is disabled",
				"The viewport meta tag blocks zooming, which many low-vision users rely on to read content.",
				"Remove user-scalable=no and maximum-scale restrictions from the viewport meta tag.",
				8,
			),
		);
	}

	return { issues, passed };
}

export function analyzeConversions($: CheerioAPI, html: string) {
	const issues: Issue[] = [];
	const passed: Issue[] = [];

	const bodyHtml = $("body").html() || "";
	const firstChunk = bodyHtml.slice(0, 4000).toLowerCase();
	const ctaPattern = /<(a|button)[^>]*>(.*?)<\/\1>/gi;
	let hasCtaEarly = false;
	let match;
	while ((match = ctaPattern.exec(firstChunk)) !== null) {
		const text = match[2].replace(/<[^>]+>/g, "").trim();
		if (text.length > 1 && text.length < 40) {
			hasCtaEarly = true;
			break;
		}
	}
	if (!hasCtaEarly) {
		issues.push(
			issue(
				"above-fold",
				"No clear call-to-action near the top of the page",
				"Visitors may need to scroll well past the first screen before finding anything to click.",
				"Place a primary action (button or prominent link) within the first section of the page.",
				12,
			),
		);
	} else {
		passed.push(
			pass("above-fold", "A call-to-action appears early in the page"),
		);
	}

	const allCtas = $("a, button")
		.map((_, el) => $(el).text().trim().toLowerCase())
		.get()
		.filter(Boolean);
	const genericCtas = allCtas.filter((t) => GENERIC_CTA_WORDS.includes(t));
	if (genericCtas.length > 0) {
		issues.push(
			issue(
				"cta-clarity",
				`Generic call-to-action text found ("${genericCtas[0]}")`,
				'Buttons labeled "Submit" or "Click here" don\'t tell visitors what happens next, which softens click-through.',
				'Rename buttons to describe the outcome, e.g. "Start free trial" instead of "Submit".',
				8,
			),
		);
	} else if (allCtas.length > 0) {
		passed.push(pass("cta-clarity", "Call-to-action text is descriptive"));
	}

	const firstForm = $("form").first();
	if (firstForm.length) {
		const fieldCount = firstForm.find(
			'input:not([type="hidden"]):not([type="submit"]):not([type="button"]), select, textarea',
		).length;
		if (fieldCount > 6) {
			issues.push(
				issue(
					"form-length",
					`Signup/contact form asks for ${fieldCount} fields`,
					"Long forms shown before a visitor has a reason to trust the site tend to suppress completion rates.",
					"Cut the form to essential fields only, and ask for the rest after signup.",
					9,
				),
			);
		} else {
			passed.push(pass("form-length", "Form length is reasonable"));
		}
	}

	const lowerHtml = html.toLowerCase();
	const hasTrustSignal = TRUST_KEYWORDS.some((k) => lowerHtml.includes(k));
	if (!hasTrustSignal) {
		issues.push(
			issue(
				"trust",
				"No obvious trust signals detected",
				"No testimonials, review mentions, or guarantee language were found, which can leave first-time visitors uncertain.",
				"Add a short trust signal near the primary action: a testimonial, rating, or guarantee.",
				7,
			),
		);
	} else {
		passed.push(pass("trust", "Trust signals are present on the page"));
	}

	const viewport = $('meta[name="viewport"]').attr("content");
	if (!viewport) {
		issues.push(
			issue(
				"mobile-viewport",
				"No responsive viewport meta tag",
				"Without a viewport meta tag, mobile browsers render a desktop layout and zoom out, making buttons and text hard to tap and read.",
				'Add <meta name="viewport" content="width=device-width, initial-scale=1">.',
				11,
			),
		);
	} else {
		passed.push(pass("mobile-viewport", "Responsive viewport meta tag is set"));
	}

	const hasContactPath = /tel:|mailto:|contact/i.test(html);
	if (!hasContactPath) {
		issues.push(
			issue(
				"contact-path",
				"No visible contact method found",
				"Visitors who hesitate before converting have no easy way to reach out with questions.",
				"Add a visible contact link, phone number, or chat option.",
				5,
			),
		);
	}

	return { issues, passed };
}
