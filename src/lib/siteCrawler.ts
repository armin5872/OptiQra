// lib/siteCrawler.ts
// Discovers and fetches multiple pages of a site (sitemap-first, link-following fallback)
// so the auditors can run across the whole site instead of a single URL.

import * as cheerio from "cheerio";
import { extractLinks } from "@/lib/link-analyzer";

const CRAWL_USER_AGENT = "SiteVitalsBot/1.0 (+https://example.com/bot)";
export const DEFAULT_MAX_PAGES = 30;
export const HARD_MAX_PAGES = 500;
const DEFAULT_MAX_DEPTH = 3;
const FETCH_TIMEOUT_MS = 9000;
const NON_HTML_EXTENSIONS =
	/\.(pdf|jpe?g|png|gif|svg|webp|ico|bmp|css|js|mjs|json|xml|zip|rar|7z|gz|mp4|mp3|wav|avi|mov|wmv|doc|docx|xls|xlsx|ppt|pptx|woff2?|ttf|eot|otf|csv|rss|atom)(\?.*)?$/i;

export interface CrawledPage {
	url: string;
	html: string;
	response: Response;
	elapsedMs: number;
	depth: number;
}

export interface CrawlOptions {
	maxPages?: number;
	maxDepth?: number;
}

export interface CrawlSummary {
	startUrl: string;
	pages: CrawledPage[];
	skipped: { url: string; reason: string }[];
	source: "sitemap" | "links" | "mixed";
	truncated: boolean;
}

function normalizeForDedup(rawUrl: string): string {
	try {
		const u = new URL(rawUrl);
		u.hash = "";
		[
			"utm_source",
			"utm_medium",
			"utm_campaign",
			"utm_term",
			"utm_content",
			"fbclid",
			"gclid",
		].forEach((p) => u.searchParams.delete(p));
		if (u.pathname.length > 1 && u.pathname.endsWith("/")) {
			u.pathname = u.pathname.slice(0, -1);
		}
		return u.toString();
	} catch {
		return rawUrl;
	}
}

function isCrawlableUrl(candidate: string, origin: string): boolean {
	try {
		const u = new URL(candidate);
		if (u.origin !== origin) return false;
		if (u.protocol !== "http:" && u.protocol !== "https:") return false;
		if (NON_HTML_EXTENSIONS.test(u.pathname)) return false;
		return true;
	} catch {
		return false;
	}
}

async function fetchWithTimeout(url: string, timeoutMs = FETCH_TIMEOUT_MS) {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	try {
		return await fetch(url, {
			redirect: "follow",
			headers: { "User-Agent": CRAWL_USER_AGENT },
			signal: controller.signal,
			next: { revalidate: 3600 },
		});
	} finally {
		clearTimeout(timer);
	}
}

/** Looks for a sitemap and pulls out page URLs from it (following one level of sitemap index). */
async function discoverUrlsFromSitemap(
	origin: string,
	limit: number,
): Promise<string[]> {
	const candidatePaths = ["/sitemap.xml", "/sitemap_index.xml"];

	for (const path of candidatePaths) {
		try {
			const res = await fetchWithTimeout(new URL(path, origin).toString());
			if (!res.ok) continue;
			const text = await res.text();
			const trimmed = text.trim();
			if (!trimmed.startsWith("<")) continue;

			const $ = cheerio.load(trimmed, { xmlMode: true });
			const directLocs: string[] = [];
			$("url > loc").each((_, el) => {
				directLocs.push($(el).text().trim());
			});

			if (directLocs.length > 0) {
				return directLocs
					.filter((u) => isCrawlableUrl(u, origin))
					.slice(0, limit);
			}

			// Might be a sitemap index — follow a couple of child sitemaps.
			const childSitemaps: string[] = [];
			$("sitemap > loc").each((_, el) => {
				childSitemaps.push($(el).text().trim());
			});

			const collected: string[] = [];
			for (const childUrl of childSitemaps.slice(0, 3)) {
				if (collected.length >= limit) break;
				try {
					const childRes = await fetchWithTimeout(childUrl);
					if (!childRes.ok) continue;
					const childText = await childRes.text();
					const $$ = cheerio.load(childText, { xmlMode: true });
					$$("url > loc").each((_, el) => {
						collected.push($$(el).text().trim());
					});
				} catch {
					// skip unreachable child sitemap
				}
			}
			if (collected.length > 0) {
				return collected
					.filter((u) => isCrawlableUrl(u, origin))
					.slice(0, limit);
			}
		} catch {
			// try next candidate path
		}
	}

	return [];
}

/**
 * Crawls a site starting from `startUrl`: seeds the queue from the XML sitemap when
 * available, then follows same-origin links breadth-first until it hits maxPages or
 * maxDepth. Returns fetched HTML + response metadata for every page so callers can run
 * the existing single-page auditors against each one.
 */
export async function crawlSite(
	startUrl: string,
	options: CrawlOptions = {},
): Promise<CrawlSummary> {
	const maxPages = Math.max(
		1,
		Math.min(options.maxPages ?? DEFAULT_MAX_PAGES, HARD_MAX_PAGES),
	);
	const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
	const origin = new URL(startUrl).origin;

	const pages: CrawledPage[] = [];
	const skipped: { url: string; reason: string }[] = [];
	const seen = new Set<string>([normalizeForDedup(startUrl)]);

	const sitemapUrls = await discoverUrlsFromSitemap(origin, maxPages * 2);
	const usedSitemap = sitemapUrls.length > 0;

	const queue: { url: string; depth: number }[] = [{ url: startUrl, depth: 0 }];
	for (const su of sitemapUrls) {
		const norm = normalizeForDedup(su);
		if (!seen.has(norm)) {
			seen.add(norm);
			queue.push({ url: su, depth: 1 });
		}
	}

	let discoveredExtraLinks = false;

	while (queue.length > 0 && pages.length < maxPages) {
		const next = queue.shift()!;
		try {
			const started = Date.now();
			const res = await fetchWithTimeout(next.url);
			const elapsedMs = Date.now() - started;
			const contentType = res.headers.get("content-type") || "";

			if (!res.ok) {
				skipped.push({ url: next.url, reason: `HTTP ${res.status}` });
				continue;
			}
			if (contentType && !/text\/html/i.test(contentType)) {
				skipped.push({ url: next.url, reason: "Not an HTML page" });
				continue;
			}

			const html = await res.text();
			pages.push({
				url: res.url || next.url,
				html,
				response: res,
				elapsedMs,
				depth: next.depth,
			});

			if (next.depth < maxDepth && pages.length < maxPages) {
				const links = extractLinks(html, next.url);
				for (const link of links) {
					if (!link.resolvedUrl || link.isExternal) continue;
					if (!isCrawlableUrl(link.resolvedUrl, origin)) continue;
					const norm = normalizeForDedup(link.resolvedUrl);
					if (seen.has(norm)) continue;
					seen.add(norm);
					discoveredExtraLinks = true;
					queue.push({ url: link.resolvedUrl, depth: next.depth + 1 });
				}
			}
		} catch (err: any) {
			skipped.push({
				url: next.url,
				reason:
					err?.name === "AbortError" ?
						"Timed out"
					:	(err?.message ?? "Fetch failed"),
			});
		}
	}

	return {
		startUrl,
		pages,
		skipped,
		source:
			usedSitemap ?
				discoveredExtraLinks ? "mixed"
				:	"sitemap"
			:	"links",
		truncated: queue.length > 0,
	};
}
