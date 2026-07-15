// lib/siteCrawler.ts
// Discovers and fetches multiple pages of a site (sitemap-first, link-following fallback)
// so the auditors can run across the whole site instead of a single URL.

import * as cheerio from "cheerio";
import { extractLinks } from "@/lib/link-analyzer";

const CRAWL_USER_AGENT = "SiteVitalsBot/1.0 (+https://example.com/bot)";
export const DEFAULT_MAX_PAGES = 15;
export const HARD_MAX_PAGES = Infinity; // Unlimited pages
const DEFAULT_MAX_DEPTH = 3;
const FETCH_TIMEOUT_MS = 9000;

/** Time-to-first-byte budget: how long we'll wait for the server to start
 *  responding (connect + TLS + headers) before giving up. Deliberately
 *  tighter than the old single 9s timeout — a server that hasn't sent
 *  headers within this window isn't going to, so failing fast here means
 *  the worker moves on to the next queued page sooner instead of burning
 *  its budget on a dead connection. */
const TTFB_TIMEOUT_MS = 6000;

/** Once headers arrive, the body gets its own *stall* budget: this resets
 *  on every chunk received, so a large-but-actively-streaming page keeps
 *  downloading as long as it keeps making progress, while a connection that
 *  goes silent mid-download is cut loose quickly. This closes a real gap:
 *  previously the only timeout wrapped the initial fetch() call, which
 *  resolves as soon as headers arrive — the actual body read via res.text()
 *  had NO timeout at all, so one hung download could stall a worker
 *  indefinitely regardless of concurrency. */
const STALL_TIMEOUT_MS = 5000;

/** Hard cap on bytes read per page. Typical HTML is a few hundred KB; this
 *  only ever kicks in on pathological/bloated pages, and protects the whole
 *  crawl's speed from a handful of outliers without needing more workers.
 *  We keep whatever was read up to the cap rather than discarding the page —
 *  cheerio parses truncated HTML fine, and a partial page still yields
 *  useful audit signal. */
const MAX_BODY_BYTES = 6 * 1024 * 1024; // 6MB

/** Browser-realistic request headers. Sites commonly 403/406 bare bot UAs
 *  that are missing Accept/Accept-Language even when the User-Agent itself
 *  is allowed — sending these cuts down on pages being wrongly skipped, and
 *  the explicit Accept-Encoding gets us compressed (smaller, faster) bodies
 *  from servers that only compress for clients that advertise support. */
const PAGE_REQUEST_HEADERS: Record<string, string> = {
	"User-Agent": CRAWL_USER_AGENT,
	"Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
	"Accept-Language": "en-US,en;q=0.9",
	"Accept-Encoding": "gzip, deflate, br",
};

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
	/** True if the body was cut off at MAX_BODY_BYTES or after a stall —
	 *  the page is still included with whatever was read, but audits reading
	 *  this should know the HTML may be incomplete. */
	truncated?: boolean;
}

export interface CrawlOptions {
	maxPages?: number;
	maxDepth?: number;
	/** How many pages to fetch in parallel. Defaults to DEFAULT_CONCURRENCY,
	 *  capped at MAX_CONCURRENCY. */
	concurrency?: number;
	/** Aborting this signal stops the crawl as soon as in-flight fetches settle. */
	signal?: AbortSignal;
	/** Polled between dispatches. When it returns true, the crawl stops handing
	 *  out new pages (already in-flight fetches are left to finish) and returns
	 *  normally with `stoppedEarly: true` — unlike `signal`, this doesn't throw
	 *  or tear the connection down, so the caller can still build a report from
	 *  whatever pages were collected so far. */
	shouldStop?: () => boolean;
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
	/** True when the crawl was wound down early via `shouldStop` rather than
	 *  aborted (connection torn down) or finishing naturally. */
	stoppedEarly: boolean;
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
	headers: Record<string, string> = { "User-Agent": CRAWL_USER_AGENT },
) {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	const onOuterAbort = () => controller.abort();
	if (outerSignal) {
		if (outerSignal.aborted) controller.abort();
		else outerSignal.addEventListener("abort", onOuterAbort);
	}
	try {
		// NOTE: this timer only bounds getting a response back (connect + TLS +
		// headers) — fetch() resolves as soon as headers arrive, before the body
		// is read. Body-level timing is handled separately by the caller via
		// readBodyWithLimits, which has its own stall timeout.
		return await fetch(url, {
			redirect: "follow",
			headers,
			signal: controller.signal,
			next: { revalidate: 3600 },
		});
	} finally {
		clearTimeout(timer);
		if (outerSignal) outerSignal.removeEventListener("abort", onOuterAbort);
	}
}

/**
 * Reads a response body as text with two protections that `res.text()` alone
 * doesn't give you:
 *  - a *stall* timeout that resets on every chunk, so slow-but-progressing
 *    downloads are allowed to finish while genuinely stuck ones are cut loose
 *  - a byte cap, so one bloated page can't dominate a worker's time budget
 * Falls back to plain res.text() if the runtime doesn't expose a streamable
 * body (e.g. some test/mock Response implementations).
 */
async function readBodyWithLimits(
	res: Response,
	maxBytes: number,
	stallTimeoutMs: number,
): Promise<{ text: string; truncated: boolean }> {
	if (!res.body) {
		return { text: await res.text(), truncated: false };
	}

	const reader = res.body.getReader();
	const decoder = new TextDecoder();
	let received = 0;
	let text = "";
	let truncated = false;

	try {
		while (true) {
			let timer!: ReturnType<typeof setTimeout>;
			const timedOut = new Promise<"timeout">((resolve) => {
				timer = setTimeout(() => resolve("timeout"), stallTimeoutMs);
			});

			const outcome = await Promise.race([reader.read(), timedOut]);
			clearTimeout(timer);

			if (outcome === "timeout") {
				truncated = true;
				break;
			}

			const { done, value } = outcome;
			if (done) break;

			received += value.byteLength;
			if (received > maxBytes) {
				const overflow = received - maxBytes;
				const keepLength = value.byteLength - overflow;
				if (keepLength > 0) {
					text += decoder.decode(value.subarray(0, keepLength), { stream: true });
				}
				truncated = true;
				break;
			}

			text += decoder.decode(value, { stream: true });
		}
	} finally {
		text += decoder.decode(); // flush any trailing multi-byte sequence
		try {
			await reader.cancel();
		} catch {
			// Already closed/errored — nothing to clean up.
		}
	}

	return { text, truncated };
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
	let stoppedEarly = false;

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
			const res = await fetchWithTimeout(item.url, TTFB_TIMEOUT_MS, signal, PAGE_REQUEST_HEADERS);
			const contentType = res.headers.get("content-type") || "";

			if (!res.ok) {
				skipped.push({ url: item.url, reason: `HTTP ${res.status}` });
				return;
			}
			if (contentType && !/text\/html/i.test(contentType)) {
				skipped.push({ url: item.url, reason: "Not an HTML page" });
				return;
			}

			const { text: html, truncated } = await readBodyWithLimits(
				res,
				MAX_BODY_BYTES,
				STALL_TIMEOUT_MS,
			);
			const elapsedMs = Date.now() - started;
			const page: CrawledPage = {
				url: res.url || item.url,
				html,
				response: res,
				elapsedMs,
				depth: item.depth,
				parentUrl: item.parentUrl,
				truncated,
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
			if (options.shouldStop?.()) {
				stoppedEarly = true;
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
		truncated: !aborted && (stoppedEarly || queue.length > 0),
		aborted,
		stoppedEarly,
	};
}
