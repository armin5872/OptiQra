import { NextRequest } from "next/server";
import * as cheerio from "cheerio";
import { assertSafeUrl, safeFetch, UnsafeUrlError } from "@/lib/urlSafety";
import { fetchPage, analyzeSEO, analyzeA11y, analyzeSpeed } from "@/lib/htmlAudit";
import { analyzeAEO } from "@/lib/aeoAudit";
import { analyzeGEO } from "@/lib/geoAudit";
import { analyzeSecurityHeaders } from "@/lib/securityHeadersAudit";
import { analyzeStructuredData } from "@/lib/structuredDataAudit";
import { analyzeLinks, buildLinkIssues } from "@/lib/link-analyzer";
import { analyzeImages } from "@/lib/image-analyzer";
import { detectStack, toPromptContext } from "@/lib/stackDetector";
import { analyzeDuplicateContent, type CrawledPageInput } from "@/lib/duplicateContentAudit";
import { issue, pass, scoreFromIssues, type Issue } from "@/lib/auditUtils";
import { getErrorMessage } from "@/lib/errorUtils";
import type { AuditSource } from "@/lib/toolsRegistry";

export const runtime = "nodejs";
export const maxDuration = 45;

interface AuditRequestBody {
	source: AuditSource;
	url?: string;
	urls?: string[];
	idPrefixes?: string[];
}

function filterByPrefixes(issues: Issue[], passed: Issue[], prefixes?: string[]) {
	if (!prefixes || prefixes.length === 0) return { issues, passed };
	const matches = (id: string) => prefixes.some((p) => id.startsWith(p) || id === p);
	return {
		issues: issues.filter((i) => matches(i.id)),
		passed: passed.filter((i) => matches(i.id)),
	};
}

// Cheap word-count + top-keyword-density pass, used only by content-seo-checker.
// Deliberately not a new lib module — a few lines of text-frequency counting
// isn't worth its own file, and it only ever runs alongside analyzeSEO.
const STOPWORDS = new Set(
	"a an and are as at be by for from has have if in into is it its of on or that the this to was were will with you your".split(" "),
);
function contentStats(html: string) {
	const $ = cheerio.load(html);
	$("script, style, noscript").remove();
	const text = $("body").text().replace(/\s+/g, " ").trim();
	const words = text.toLowerCase().match(/[a-z0-9']{3,}/g) || [];
	const freq = new Map<string, number>();
	for (const w of words) {
		if (STOPWORDS.has(w)) continue;
		freq.set(w, (freq.get(w) || 0) + 1);
	}
	const top = [...freq.entries()]
		.sort((a, b) => b[1] - a[1])
		.slice(0, 8)
		.map(([word, count]) => ({ word, count, density: words.length ? +((count / words.length) * 100).toFixed(2) : 0 }));
	return { wordCount: words.length, topKeywords: top };
}

async function runRobotsCheck(targetUrl: string) {
	const base = new URL(targetUrl);
	const robotsUrl = `${base.protocol}//${base.host}/robots.txt`;
	const issues: Issue[] = [];
	const passed: Issue[] = [];
	let body = "";
	let status = 0;
	try {
		const res = await safeFetch(robotsUrl, { headers: { "User-Agent": "OptiqraBot/1.0" } });
		status = res.status;
		body = await res.text();
	} catch (err) {
		issues.push(issue("robots-fetch-error", "Couldn't fetch robots.txt", getErrorMessage(err), `Make sure ${robotsUrl} is reachable.`, 10));
		return { issues, passed, extra: { robotsUrl, status, body: "" } };
	}
	if (status === 404) {
		issues.push(issue("robots-missing", "No robots.txt found", `${robotsUrl} returned 404.`, "robots.txt is optional, but adding one gives you explicit control over crawler access.", 3, "low"));
		return { issues, passed, extra: { robotsUrl, status, body: "" } };
	}
	if (status >= 400) {
		issues.push(issue("robots-error-status", `robots.txt returned HTTP ${status}`, `Fetching ${robotsUrl} failed.`, "Ensure robots.txt returns a 200 status.", 6));
	} else {
		passed.push(pass("robots-reachable", "robots.txt is reachable"));
	}

	const lines = body.split(/\r?\n/);
	const groups: { agent: string; disallow: string[] }[] = [];
	let current: { agent: string; disallow: string[] } | null = null;
	let hasSitemap = false;
	for (const raw of lines) {
		const line = raw.trim();
		if (!line || line.startsWith("#")) continue;
		const [keyRaw, ...rest] = line.split(":");
		const key = keyRaw.trim().toLowerCase();
		const value = rest.join(":").trim();
		if (key === "user-agent") {
			current = { agent: value, disallow: [] };
			groups.push(current);
		} else if (key === "disallow" && current) {
			current.disallow.push(value);
		} else if (key === "sitemap") {
			hasSitemap = true;
		}
	}

	if (hasSitemap) passed.push(pass("robots-sitemap-ref", "robots.txt references a sitemap"));
	else issues.push(issue("robots-no-sitemap", "No Sitemap: line in robots.txt", "Adding a Sitemap: line helps crawlers discover your sitemap without guessing its URL.", "Add `Sitemap: https://yoursite.com/sitemap.xml` to robots.txt.", 2, "low"));

	const AI_BOTS = ["GPTBot", "ClaudeBot", "PerplexityBot", "Google-Extended", "CCBot", "anthropic-ai", "OAI-SearchBot"];
	const wildcard = groups.find((g) => g.agent === "*");
	const wildcardBlocksAll = !!wildcard && wildcard.disallow.some((d) => d.trim() === "/");

	const botStatus = AI_BOTS.map((bot) => {
		const group = groups.find((g) => g.agent.toLowerCase() === bot.toLowerCase());
		let blocked = false;
		if (group) blocked = group.disallow.some((d) => d.trim() === "/");
		else if (wildcardBlocksAll) blocked = true;
		return { bot, blocked, explicit: !!group };
	});

	for (const b of botStatus) {
		if (b.blocked) {
			issues.push(issue(`ai-bot-blocked-${b.bot.toLowerCase()}`, `${b.bot} is blocked`, `robots.txt ${b.explicit ? "explicitly disallows" : "blocks via a wildcard rule that disallows"} ${b.bot} from the entire site.`, `Remove or narrow the Disallow rule for ${b.bot} if you want this crawler to index/cite your content.`, 4, "medium"));
		} else {
			passed.push(pass(`ai-bot-allowed-${b.bot.toLowerCase()}`, `${b.bot} is allowed`));
		}
	}

	return { issues, passed, extra: { robotsUrl, status, body, groups, botStatus } };
}

async function runSitemapCheck(targetUrl: string) {
	const issues: Issue[] = [];
	const passed: Issue[] = [];
	let body = "";
	let status = 0;
	try {
		const res = await safeFetch(targetUrl, { headers: { "User-Agent": "OptiqraBot/1.0" } });
		status = res.status;
		body = await res.text();
	} catch (err) {
		issues.push(issue("sitemap-fetch-error", "Couldn't fetch the sitemap", getErrorMessage(err), "Double check the sitemap URL is correct and publicly reachable.", 12));
		return { issues, passed, extra: { status, urlCount: 0 } };
	}
	if (status >= 400) {
		issues.push(issue("sitemap-error-status", `Sitemap returned HTTP ${status}`, "The sitemap URL did not return a successful response.", "Ensure the sitemap URL returns a 200 status with an XML body.", 12));
		return { issues, passed, extra: { status, urlCount: 0 } };
	}

	const isIndex = /<sitemapindex/i.test(body);
	const urlMatches = body.match(/<loc>([^<]+)<\/loc>/gi) || [];
	const urls = urlMatches.map((m) => m.replace(/<\/?loc>/gi, "").trim());
	const lastmodCount = (body.match(/<lastmod>/gi) || []).length;

	if (!/<urlset|<sitemapindex/i.test(body)) {
		issues.push(issue("sitemap-not-xml", "Doesn't look like a valid sitemap", "No <urlset> or <sitemapindex> root element was found.", "Make sure this URL serves valid XML sitemap markup.", 12));
	} else {
		passed.push(pass("sitemap-valid-xml", isIndex ? "Valid sitemap index" : "Valid XML sitemap"));
	}

	if (urls.length === 0 && !isIndex) {
		issues.push(issue("sitemap-empty", "Sitemap has no URLs", "No <loc> entries were found.", "Add at least one <url><loc>...</loc></url> entry.", 8));
	} else if (urls.length > 0) {
		passed.push(pass("sitemap-url-count", `Contains ${urls.length} ${isIndex ? "child sitemap" : "URL"} entries`));
	}

	if (!isIndex && urls.length > 0 && lastmodCount === 0) {
		issues.push(issue("sitemap-no-lastmod", "No <lastmod> dates", "None of the URL entries include a <lastmod> date, which helps crawlers prioritize re-crawling changed pages.", "Add <lastmod> to each <url> entry with the page's last-modified date.", 2, "low"));
	} else if (lastmodCount > 0) {
		passed.push(pass("sitemap-has-lastmod", "Includes <lastmod> dates"));
	}

	if (urls.length > 50000) {
		issues.push(issue("sitemap-too-large", "Sitemap exceeds 50,000 URLs", `Found ${urls.length} entries — the sitemap protocol caps a single file at 50,000 URLs / 50MB.`, "Split into multiple sitemaps referenced from a sitemap index.", 6));
	}

	return { issues, passed, extra: { status, isIndex, urlCount: urls.length, sampleUrls: urls.slice(0, 25) } };
}

async function runRedirectCheck(urls: string[]) {
	const issues: Issue[] = [];
	const passed: Issue[] = [];
	const results: { url: string; chain: { url: string; status: number }[]; finalStatus: number; error?: string }[] = [];

	for (const rawUrl of urls.slice(0, 15)) {
		const chain: { url: string; status: number }[] = [];
		let current = rawUrl;
		let finalStatus = 0;
		let error: string | undefined;
		try {
			for (let hop = 0; hop < 8; hop++) {
				const safe = await assertSafeUrl(current);
				const res = await fetch(safe, { redirect: "manual", headers: { "User-Agent": "OptiqraBot/1.0" } });
				chain.push({ url: current, status: res.status });
				finalStatus = res.status;
				if (res.status >= 300 && res.status < 400) {
					const loc = res.headers.get("location");
					if (!loc) break;
					current = new URL(loc, current).toString();
					if (chain.some((c) => c.url === current)) {
						issues.push(issue(`redirect-loop-${rawUrl}`, "Redirect loop detected", `${rawUrl} eventually redirects back to a URL already in its own chain.`, "Fix the redirect rule creating the loop.", 10));
						break;
					}
				} else break;
			}
		} catch (err) {
			error = getErrorMessage(err);
		}

		if (error) {
			issues.push(issue(`redirect-error-${rawUrl}`, `Couldn't check ${rawUrl}`, error, "Confirm the URL is correct and publicly reachable.", 4));
		} else if (chain.length > 3) {
			issues.push(issue(`redirect-chain-long-${rawUrl}`, `Long redirect chain (${chain.length} hops)`, `${rawUrl} redirects through ${chain.length} hops before reaching ${finalStatus}.`, "Point the original link directly at the final destination.", 6, "medium"));
		} else if (finalStatus >= 400) {
			issues.push(issue(`redirect-status-${rawUrl}`, `${rawUrl} returns HTTP ${finalStatus}`, "This URL does not resolve successfully.", "Fix or remove links to this URL.", 10));
		} else if (chain.length > 1) {
			passed.push(pass(`redirect-ok-${rawUrl}`, `${rawUrl} redirects cleanly (${chain.length} hop) to ${finalStatus}`));
		} else {
			passed.push(pass(`redirect-ok-${rawUrl}`, `${rawUrl} resolves directly with ${finalStatus}`));
		}

		results.push({ url: rawUrl, chain, finalStatus, error });
	}

	return { issues, passed, extra: { results } };
}

async function runDuplicateCheck(urls: string[]) {
	const fetchIssues: Issue[] = [];
	const pages: CrawledPageInput[] = [];

	for (const url of urls.slice(0, 10)) {
		try {
			const safe = await assertSafeUrl(url);
			const { html } = await fetchPage(safe);
			pages.push({ url, html });
		} catch (err) {
			fetchIssues.push(issue(`duplicate-fetch-error-${url}`, `Couldn't fetch ${url}`, getErrorMessage(err), "Confirm the URL is correct and publicly reachable.", 4));
		}
	}

	if (pages.length < 2) {
		fetchIssues.push(issue("duplicate-not-enough-pages", "Need at least 2 reachable URLs", "Paste two or more URLs (one per line) to compare.", "Add another URL.", 0, "informational"));
		return { issues: fetchIssues, passed: [], extra: {} };
	}

	const report = analyzeDuplicateContent(pages);
	return {
		issues: [...fetchIssues, ...report.issues],
		passed: report.passed,
		extra: {
			duplicateTitles: report.duplicateTitles,
			duplicateMetaDescriptions: report.duplicateMetaDescriptions,
			duplicateBodyContent: report.duplicateBodyContent,
			nearDuplicatePages: report.nearDuplicatePages,
		},
	};
}

async function runFaviconCheck($: ReturnType<typeof cheerio.load>, targetUrl: string) {
	const issues: Issue[] = [];
	const passed: Issue[] = [];
	const base = new URL(targetUrl);

	const faviconLink = $('link[rel~="icon"]').first();
	if (faviconLink.length === 0) {
		issues.push(issue("favicon-missing-link", "No favicon <link> tag", "No <link rel=\"icon\"> was found in the page head.", "Add a <link rel=\"icon\" href=\"/favicon.ico\"> (or PNG/SVG equivalent).", 3, "low"));
	} else {
		passed.push(pass("favicon-link-present", "Favicon link tag present"));
	}

	const manifestLink = $('link[rel="manifest"]').first();
	if (manifestLink.length === 0) {
		issues.push(issue("manifest-missing", "No web app manifest linked", "No <link rel=\"manifest\"> was found — the site can't be installed as a PWA.", "Add a manifest.json and link it with <link rel=\"manifest\" href=\"/manifest.json\">.", 2, "low"));
		return { issues, passed, extra: {} };
	}
	passed.push(pass("manifest-linked", "Web app manifest is linked"));

	try {
		const manifestUrl = new URL(manifestLink.attr("href") || "", base).toString();
		const safe = await assertSafeUrl(manifestUrl);
		const res = await safeFetch(safe);
		const json = await res.json();
		const required = ["name", "icons", "start_url", "display"];
		const missing = required.filter((k) => !json[k]);
		if (missing.length > 0) {
			issues.push(issue("manifest-missing-fields", `Manifest missing: ${missing.join(", ")}`, "These fields are commonly required for a manifest to be considered installable.", `Add ${missing.join(", ")} to manifest.json.`, 3, "low"));
		} else {
			passed.push(pass("manifest-valid", "Manifest includes the core required fields"));
		}
	} catch (err) {
		issues.push(issue("manifest-fetch-error", "Couldn't fetch/parse the manifest", getErrorMessage(err), "Ensure manifest.json is valid JSON and publicly reachable.", 3, "low"));
	}

	return { issues, passed, extra: {} };
}

export async function POST(req: NextRequest) {
	let body: AuditRequestBody;
	try {
		body = await req.json();
	} catch {
		return Response.json({ ok: false, message: "Invalid JSON body" }, { status: 400 });
	}

	const { source, idPrefixes } = body;
	const singleUrlSources: AuditSource[] = ["seo", "aeo", "geo", "security", "structured", "images", "links", "stack", "a11y", "speed", "robots", "sitemap", "favicon"];

	try {
		if (source === "redirect") {
			const urls = (body.urls || []).filter(Boolean);
			if (urls.length === 0) return Response.json({ ok: false, message: "Provide at least one URL" }, { status: 400 });
			const { issues, passed, extra } = await runRedirectCheck(urls);
			return Response.json({ ok: true, score: scoreFromIssues(issues), issues, passed, extra });
		}

		if (source === "duplicate") {
			const urls = (body.urls || []).filter(Boolean);
			const { issues, passed, extra } = await runDuplicateCheck(urls);
			return Response.json({ ok: true, score: scoreFromIssues(issues), issues, passed, extra });
		}

		if (!singleUrlSources.includes(source)) {
			return Response.json({ ok: false, message: "Unsupported check" }, { status: 400 });
		}

		if (!body.url) return Response.json({ ok: false, message: "Provide a URL" }, { status: 400 });

		let safeUrl: string;
		try {
			safeUrl = await assertSafeUrl(body.url);
		} catch (err) {
			if (err instanceof UnsafeUrlError) return Response.json({ ok: false, message: err.message }, { status: 400 });
			return Response.json({ ok: false, message: "Invalid URL" }, { status: 400 });
		}

		if (source === "robots") {
			const { issues, passed, extra } = await runRobotsCheck(safeUrl);
			return Response.json({ ok: true, score: scoreFromIssues(issues), issues, passed, extra });
		}
		if (source === "sitemap") {
			const { issues, passed, extra } = await runSitemapCheck(safeUrl);
			return Response.json({ ok: true, score: scoreFromIssues(issues), issues, passed, extra });
		}

		const { response, html, elapsedMs } = await fetchPage(safeUrl);
		const $ = cheerio.load(html);

		let issues: Issue[] = [];
		let passed: Issue[] = [];
		let extra: Record<string, unknown> = {};

		switch (source) {
			case "seo": {
				const r = await analyzeSEO($, html, safeUrl, { includeCrawlFiles: false });
				issues = r.issues;
				passed = r.passed;
				if (idPrefixes?.includes("thin-content")) extra = { content: contentStats(html) };
				break;
			}
			case "a11y": {
				const r = analyzeA11y($);
				issues = r.issues;
				passed = r.passed;
				break;
			}
			case "speed": {
				const r = analyzeSpeed($, html, response, elapsedMs);
				issues = r.issues;
				passed = r.passed;
				extra = { elapsedMs };
				break;
			}
			case "aeo": {
				const r = analyzeAEO($, html, safeUrl);
				issues = r.issues;
				passed = r.passed;
				break;
			}
			case "geo": {
				const r = analyzeGEO($, html, safeUrl);
				issues = r.issues;
				passed = r.passed;
				break;
			}
			case "security": {
				const r = await analyzeSecurityHeaders(safeUrl);
				issues = r.issues;
				passed = r.passed;
				extra = { headers: r.headers, https: safeUrl.startsWith("https://") };
				if (!safeUrl.startsWith("https://")) {
					issues.push(issue("not-https", "Page is not served over HTTPS", "The URL uses plain HTTP.", "Serve the site over HTTPS with a valid TLS certificate.", 12));
				} else {
					passed.push(pass("is-https", "Served over HTTPS"));
				}
				break;
			}
			case "structured": {
				const r = analyzeStructuredData($, html);
				issues = r.issues;
				passed = r.passed;
				break;
			}
			case "images": {
				const r = await analyzeImages(safeUrl);
				// analyzeImages returns raw findings rather than Issue[] (it's a data
				// source shared by the full scan's own aggregation step) — this is a
				// thin presentation adapter, not a re-implementation of the checks.
				if (r.oversizedImages.length > 0) {
					issues.push(issue("images-oversized", `${r.oversizedImages.length} oversized image(s)`, `These images are served larger than needed: ${r.oversizedImages.slice(0, 5).map((i) => i.src).join(", ")}${r.oversizedImages.length > 5 ? "…" : ""}`, "Resize or compress these images to their actual display size.", 6, "medium"));
				} else passed.push(pass("images-sized-ok", "No oversized images found"));
				if (r.missingAltImages.length > 0) {
					issues.push(issue("images-missing-alt", `${r.missingAltImages.length} image(s) missing alt text`, "These <img> tags have no alt attribute.", "Add descriptive alt text to every meaningful image.", 5, "medium"));
				} else passed.push(pass("images-alt-ok", "All images have alt text"));
				if (r.nonModernFormatImages.length > 0) {
					issues.push(issue("images-legacy-format", `${r.nonModernFormatImages.length} image(s) in a legacy format`, "These images aren't served as WebP or AVIF, which are smaller for the same quality.", "Convert to WebP or AVIF where possible.", 2, "low"));
				} else passed.push(pass("images-modern-format", "Images use modern formats"));
				if (r.missingLazyLoading.length > 0) {
					issues.push(issue("images-no-lazy-load", `${r.missingLazyLoading.length} image(s) not lazy-loaded`, "Below-the-fold images without loading=\"lazy\" can slow initial page load.", "Add loading=\"lazy\" to offscreen images.", 2, "low"));
				} else passed.push(pass("images-lazy-ok", "Offscreen images are lazy-loaded"));
				if (r.brokenImages.length > 0) {
					issues.push(issue("images-broken", `${r.brokenImages.length} broken image(s)`, `These images failed to load: ${r.brokenImages.slice(0, 5).map((i) => i.resolvedUrl).join(", ")}`, "Fix or remove broken image references.", 8, "high"));
				}
				extra = { totalImages: r.allImages.length, oversized: r.oversizedImages.slice(0, 10), broken: r.brokenImages.slice(0, 10) };
				break;
			}
			case "links": {
				const r = await analyzeLinks(safeUrl);
				const built = buildLinkIssues(r);
				issues = built.issues;
				passed = built.passed;
				extra = {
					totalLinks: r.totalCheckableLinks,
					internal: r.internalLinkCount,
					external: r.externalLinkCount,
					broken: r.brokenLinks.slice(0, 25),
				};
				break;
			}
			case "stack": {
				const stack = detectStack(html, response.headers, safeUrl);
				extra = { stack, promptContext: toPromptContext(stack) };
				passed = stack.signals.length > 0 ? [pass("stack-detected", `Detected ${stack.signals.length} technology signal(s)`)] : [];
				issues = stack.signals.length === 0 ? [issue("stack-unknown", "Couldn't confidently detect the stack", "No strong CMS/framework/library fingerprints were found.", "This is common for heavily customized or server-rendered-only sites.", 0, "informational")] : [];
				break;
			}
			case "favicon": {
				const r = await runFaviconCheck($, safeUrl);
				issues = r.issues;
				passed = r.passed;
				break;
			}
		}

		const filtered = filterByPrefixes(issues, passed, idPrefixes);
		return Response.json({
			ok: true,
			score: scoreFromIssues(filtered.issues),
			issues: filtered.issues,
			passed: filtered.passed,
			extra,
		});
	} catch (err) {
		return Response.json({ ok: false, message: getErrorMessage(err, "Something went wrong running this check") }, { status: 502 });
	}
}
