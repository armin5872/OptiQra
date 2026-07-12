// lib/siteCrawler.ts
// Discovers and fetches multiple pages of a site (sitemap-first, link-following fallback)
// so the auditors can run across the whole site instead of a single URL.

import * as cheerio from "cheerio";
import { extractLinks } from "@/lib/link-analyzer";

const CRAWL_USER_AGENT = "SiteVitalsBot/1.0 (+https://example.com/bot)";
export const DEFAULT_MAX_PAGES = 15;
export const HARD_MAX_PAGES = 1000;
const DEFAULT_MAX_DEPTH = 3;
const FETCH_TIMEOUT_MS = 9000;
/** How many pages we fetch in parallel. Sequential crawling (1 request at a time)
 *  is by far the biggest speed bottleneck for multi-page scans, since most of the
 *  wall-clock time is spent waiting on network I/O for the target site. Running
 *  several requests concurrently lets us overlap that wait time. Kept modest by
 *  default to avoid hammering smaller sites / triggering rate limits. */
export const DEFAULT_CONCURRENCY = 6;
export const MAX_CONCURRENCY = 12;

/** Preset scan depths surfaced in the UI. "custom" lets the user pick any
 *  value between 1 and HARD_MAX_PAGES. */
export const SCAN_PRESETS = {
	quick: 15,
	standard: 50,
	full: 100,
	crawl: 250,
} as const;
export type ScanPreset = keyof typeof SCAN_PRESETS | "custom";
const NON_HTML_EXTENSIONS =
	/\.(pdf|jpe?g|png|gif|svg|webp|ico|bmp|css|js|mjs|json|xml|zip|rar|7z|gz|mp4|mp3|wav|avi|mov|wmv|doc|docx|xls|xlsx|ppt|pptx|woff2?|ttf|eot|otf|csv|rss|atom)(\?.*)?$/i;

export interface CrawledPage {
	url: string;
	html: string;
	response: Response;
	elapsedMs: number;
	depth: number;
	parentUrl?: string;
}

export interface CrawlOptions {
	maxPages?: number;
	maxDepth?: number;
	/** How many pages to fetch in parallel. Defaults to DEFAULT_CONCURRENCY,
	 *  capped at MAX_CONCURRENCY. */
	concurrency?: number;
	/** Aborting this signal stops the crawl as soon as in-flight fetches settle. */
	signal?: AbortSignal;
	/** Called right after each page is fetched, before its child links are queued.
	 *  With concurrency > 1 this fires in completion order, not queue order — use
	 *  `page.depth === 0` rather than `pagesSoFar === 1` if you need to identify
	 *  the seed page specifically. Lets the caller run per-page work (e.g. audits)
	 *  and report progress without waiting for the whole crawl to finish. */
	onPage?: (page: CrawledPage, pagesSoFar: number) => void | Promise<void>;
}

export interface CrawlSummary {
	startUrl: string;
	pages: CrawledPage[];
	skipped: { url: string; reason: string }[];
	source: "sitemap" | "links" | "mixed";
	truncated: boolean;
	aborted: boolean;
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

async function fetchWithTimeout(
	url: string,
	timeoutMs = FETCH_TIMEOUT_MS,
	outerSignal?: AbortSignal,
) {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	const onOuterAbort = () => controller.abort();
	if (outerSignal) {
		if (outerSignal.aborted) controller.abort();
		else outerSignal.addEventListener("abort", onOuterAbort);
	}
	try {
		return await fetch(url, {
			redirect: "follow",
			headers: { "User-Agent": CRAWL_USER_AGENT },
			signal: controller.signal,
			next: { revalidate: 3600 },
		});
	} finally {
		clearTimeout(timer);
		if (outerSignal) outerSignal.removeEventListener("abort", onOuterAbort);
	}
}

/** Looks for a sitemap and pulls out page URLs from it (following one level of sitemap index). */
async function discoverUrlsFromSitemap(
	origin: string,
	limit: number,
	signal?: AbortSignal,
): Promise<string[]> {
	const candidatePaths = ["/sitemap.xml", "/sitemap_index.xml"];

	for (const path of candidatePaths) {
		if (signal?.aborted) return [];
		try {
			const res = await fetchWithTimeout(
				new URL(path, origin).toString(),
				FETCH_TIMEOUT_MS,
				signal,
			);
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

			// Fetch the (at most 3) child sitemaps in parallel instead of one at a
			// time — sitemap indexes are often split across many files and doing
			// this sequentially adds seconds of pure waiting before the crawl
			// itself even starts.
			const collected: string[] = [];
			const childResults = await Promise.all(
				childSitemaps.slice(0, 3).map(async (childUrl) => {
					if (signal?.aborted) return [] as string[];
					try {
						const childRes = await fetchWithTimeout(
							childUrl,
							FETCH_TIMEOUT_MS,
							signal,
						);
						if (!childRes.ok) return [] as string[];
						const childText = await childRes.text();
						const $$ = cheerio.load(childText, { xmlMode: true });
						const locs: string[] = [];
						$$("url > loc").each((_, el) => {
							locs.push($$(el).text().trim());
						});
						return locs;
					} catch {
						return [] as string[];
					}
				}),
			);
			for (const locs of childResults) {
				collected.push(...locs);
			}
			if (collected.length > 0) {
				return collected.filter((u) => isCrawlableUrl(u, origin)).slice(0, limit);
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
	const concurrency = Math.max(
		1,
		Math.min(options.concurrency ?? DEFAULT_CONCURRENCY, MAX_CONCURRENCY),
	);
	const signal = options.signal;
	const origin = new URL(startUrl).origin;

	const pages: CrawledPage[] = [];
	const skipped: { url: string; reason: string }[] = [];
	const seen = new Set<string>([normalizeForDedup(startUrl)]);

	const sitemapUrls = await discoverUrlsFromSitemap(origin, maxPages * 2, signal);
	const usedSitemap = sitemapUrls.length > 0;

	type QueueItem = { url: string; depth: number; parentUrl?: string };
	const queue: QueueItem[] = [{ url: startUrl, depth: 0 }];
	for (const su of sitemapUrls) {
		const norm = normalizeForDedup(su);
		if (!seen.has(norm)) {
			seen.add(norm);
			queue.push({ url: su, depth: 1, parentUrl: startUrl });
		}
	}

	let discoveredExtraLinks = false;
	let aborted = false;

	// Fetches run concurrently (up to `concurrency` at a time) instead of one
	// request at a time — most of a crawl's wall-clock time is spent waiting on
	// the target site's network I/O, so overlapping requests is the single
	// biggest lever for crawl speed. BFS ordering and the maxPages/maxDepth
	// limits are still respected; only the *timing* of fetches changes.
	let activeWorkers = 0;
	let waiters: Array<() => void> = [];
	const wakeWaiters = () => {
		const toWake = waiters;
		waiters = [];
		for (const w of toWake) w();
	};
	const waitForWork = () => new Promise<void>((resolve) => waiters.push(resolve));

	async function processItem(item: QueueItem): Promise<void> {
		try {
			const started = Date.now();
			const res = await fetchWithTimeout(item.url, FETCH_TIMEOUT_MS, signal);
			const elapsedMs = Date.now() - started;
			const contentType = res.headers.get("content-type") || "";

			if (!res.ok) {
				skipped.push({ url: item.url, reason: `HTTP ${res.status}` });
				return;
			}
			if (contentType && !/text\/html/i.test(contentType)) {
				skipped.push({ url: item.url, reason: "Not an HTML page" });
				return;
			}

			const html = await res.text();
			const page: CrawledPage = {
				url: res.url || item.url,
				html,
				response: res,
				elapsedMs,
				depth: item.depth,
				parentUrl: item.parentUrl,
			};
			// Pushing to `pages` and reading its length happen synchronously (no
			// `await` between them), so `pages.length` here is a reliable,
			// monotonically increasing "completed so far" count even with
			// several processItem() calls interleaved concurrently.
			pages.push(page);

			if (options.onPage) {
				await options.onPage(page, pages.length);
			}

			if (item.depth < maxDepth && pages.length < maxPages) {
				const links = extractLinks(html, item.url);
				for (const link of links) {
					if (!link.resolvedUrl || link.isExternal) continue;
					if (!isCrawlableUrl(link.resolvedUrl, origin)) continue;
					const norm = normalizeForDedup(link.resolvedUrl);
					if (seen.has(norm)) continue;
					seen.add(norm);
					discoveredExtraLinks = true;
					queue.push({
						url: link.resolvedUrl,
						depth: item.depth + 1,
						parentUrl: page.url,
					});
				}
			}
		} catch (err: any) {
			if (signal?.aborted) {
				aborted = true;
				return;
			}
			skipped.push({
				url: item.url,
				reason: err?.name === "AbortError" ? "Timed out" : (err?.message ?? "Fetch failed"),
			});
		}
	}

	// Counts pages pulled off the queue for processing, whether or not their
	// fetch has completed yet. This — not `pages.length` — must be what's
	// compared against `maxPages` before dispatching more work: with several
	// concurrent workers, each can pass a `pages.length < maxPages` check
	// before any of their *own* in-flight fetches have pushed to `pages`,
	// letting up to `concurrency - 1` extra pages slip through and overshoot
	// the cap (e.g. "55 of 50 scanned"). Incrementing `dispatched` here is
	// race-free — JS runs each worker's synchronous code to completion before
	// another worker can run — so it keeps total dispatches capped exactly.
	let dispatched = 0;

	async function worker(): Promise<void> {
		while (true) {
			if (signal?.aborted) {
				aborted = true;
				return;
			}
			if (dispatched >= maxPages) return;

			const item = queue.shift();
			if (!item) {
				// No queued work right now. If nothing else is in flight, no more
				// work is coming — we're done. Otherwise, another worker's
				// in-flight fetch may still enqueue child links, so wait to be
				// woken rather than exiting early.
				if (activeWorkers === 0) return;
				await waitForWork();
				continue;
			}

			dispatched++;
			activeWorkers++;
			await processItem(item);
			activeWorkers--;
			wakeWaiters();
		}
	}

	await Promise.all(Array.from({ length: concurrency }, () => worker()));

	if (signal?.aborted) aborted = true;

	return {
		startUrl,
		pages,
		skipped,
		source: usedSitemap ? (discoveredExtraLinks ? "mixed" : "sitemap") : "links",
		truncated: !aborted && queue.length > 0,
		aborted,
	};
}
