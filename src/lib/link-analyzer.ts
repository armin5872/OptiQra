// lib/link-analyzer.ts
// Place at: lib/link-analyzer.ts
// npm install cheerio

import * as cheerio from "cheerio";
import { issue, pass, type Issue } from "@/lib/auditUtils";

export interface RawLink {
  href: string;           // original attribute value, unresolved
  resolvedUrl: string | null; // absolute URL, or null if unresolvable (js:, mailto:, empty, etc.)
  text: string;
  rel: string;
  target: string | null;
  isExternal: boolean;
  isEmpty: boolean;
  isJavascript: boolean;
  isAnchorOnly: boolean;  // "#" or "#section" same-page anchors
  isMailtoOrTel: boolean;
  isMalformed: boolean;   // href couldn't be parsed as a URL at all
  hasNoText: boolean;
  missingNoopener: boolean; // target=_blank present, rel noopener/noreferrer missing
}

export interface LinkStatusResult {
  href: string;
  resolvedUrl: string;
  ok: boolean;
  statusCode: number | null;
  error: string | null;
  redirectChain: string[]; // list of URLs visited before final response
  finalUrl: string;
}

export interface LinkAnalysisReport {
  scannedUrl: string;
  totalAnchorTags: number;
  totalCheckableLinks: number;
  externalLinkCount: number;
  internalLinkCount: number;
  tooManyExternalLinks: boolean;
  externalLinkThreshold: number;

  emptyHrefs: RawLink[];
  javascriptLinks: RawLink[];
  malformedLinks: RawLink[];
  linksWithoutText: RawLink[];
  missingRelNoopener: RawLink[];
  duplicateLinks: { resolvedUrl: string; count: number; sampleText: string[] }[];

  brokenLinks: LinkStatusResult[];
  redirectChains: { href: string; chain: string[]; finalUrl: string }[];

  allChecked: LinkStatusResult[];
}

export interface AnalyzeOptions {
  externalLinkThreshold?: number; // default 50
  maxRedirects?: number;          // default 5
  concurrency?: number;           // default 8
  checkLinkStatuses?: boolean;    // default true — set false to skip network checks (fast mode)
  fetchTimeoutMs?: number;        // default 8000
  userAgent?: string;
}

const DEFAULTS: Required<AnalyzeOptions> = {
  externalLinkThreshold: 50,
  maxRedirects: 5,
  concurrency: 24,
  checkLinkStatuses: true,
  fetchTimeoutMs: 6000,
  userAgent: "Mozilla/5.0 (compatible; LinkAnalyzerBot/1.0)",
};

/** Status codes where a HEAD (or even GET) request is commonly rejected by
 *  WAFs/anti-bot rules for non-browser-looking traffic even though the page
 *  is genuinely reachable in a real browser. Worth a fallback attempt with
 *  more browser-like request headers before trusting the status. */
const HEAD_FALLBACK_STATUSES = new Set([403, 405, 406, 429, 501, 999]);

/** Status codes that usually reflect a transient or self-inflicted condition
 *  (rate limiting from our own concurrent checks, momentary overload) rather
 *  than a genuinely broken link — worth one retry with backoff. */
const TRANSIENT_RETRY_STATUSES = new Set([429, 503]);

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Headers that look like a real browser request rather than a bare bot UA.
 *  Some sites 403 requests that are missing Accept/Accept-Language even when
 *  the User-Agent itself is otherwise accepted — sending them cuts down on
 *  links being misreported as broken when they're actually fine. */
function requestHeaders(userAgent: string): Record<string, string> {
  return {
    "User-Agent": userAgent,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
  };
}

/** Simple concurrency-limited map, no external deps. */
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const idx = cursor++;
      results[idx] = await fn(items[idx], idx);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, worker);
  await Promise.all(workers);
  return results;
}

function classifyHref(href: string, baseUrl: string): {
  resolvedUrl: string | null;
  isExternal: boolean;
  isEmpty: boolean;
  isJavascript: boolean;
  isAnchorOnly: boolean;
  isMailtoOrTel: boolean;
  isMalformed: boolean;
} {
  const trimmed = (href || "").trim();

  if (trimmed === "") {
    return { resolvedUrl: null, isExternal: false, isEmpty: true, isJavascript: false, isAnchorOnly: false, isMailtoOrTel: false, isMalformed: false };
  }
  if (/^javascript:/i.test(trimmed)) {
    return { resolvedUrl: null, isExternal: false, isEmpty: false, isJavascript: true, isAnchorOnly: false, isMailtoOrTel: false, isMalformed: false };
  }
  if (/^(mailto:|tel:|sms:)/i.test(trimmed)) {
    return { resolvedUrl: null, isExternal: false, isEmpty: false, isJavascript: false, isAnchorOnly: false, isMailtoOrTel: true, isMalformed: false };
  }
  if (trimmed.startsWith("#")) {
    return { resolvedUrl: null, isExternal: false, isEmpty: false, isJavascript: false, isAnchorOnly: true, isMailtoOrTel: false, isMalformed: false };
  }

  try {
    const base = new URL(baseUrl);
    const resolved = new URL(trimmed, base);
    const isExternal = resolved.hostname !== base.hostname;
    return { resolvedUrl: resolved.toString(), isExternal, isEmpty: false, isJavascript: false, isAnchorOnly: false, isMailtoOrTel: false, isMalformed: false };
  } catch {
    // Genuinely unparsable href (e.g. "htt p://broken url"). Previously this
    // fell through with every flag false and a null resolvedUrl, which meant
    // it wasn't checkable (no resolvedUrl) AND didn't show up in emptyHrefs,
    // javascriptLinks, or any other bucket — it just vanished from the
    // report, silently under-counting real markup problems. Flag it
    // explicitly so it's surfaced instead of dropped.
    return { resolvedUrl: null, isExternal: false, isEmpty: false, isJavascript: false, isAnchorOnly: false, isMailtoOrTel: false, isMalformed: true };
  }
}

/** Parses HTML and extracts classified <a> tag info. Does not hit the network for link status. */
export function extractLinks(html: string, baseUrl: string): RawLink[] {
  const $ = cheerio.load(html);
  const links: RawLink[] = [];

  $("a").each((_, el) => {
    const $el = $(el);
    const href = $el.attr("href") ?? "";
    const text = $el.text().trim();
    const rel = ($el.attr("rel") ?? "").toLowerCase();
    const target = $el.attr("target") ?? null;
    const ariaLabel = $el.attr("aria-label")?.trim();
    const title = $el.attr("title")?.trim();

    const classified = classifyHref(href, baseUrl);
    const relTokens = rel.split(/\s+/).filter(Boolean);
    const hasNoopener = relTokens.includes("noopener") || relTokens.includes("noreferrer");
    const missingNoopener = target === "_blank" && !hasNoopener && classified.isExternal !== false; // check regardless, external OR internal (best practice either way)

    // "No text" only counts if there's also no accessible name via aria-label/title/img-alt
    const imgAlt = $el.find("img[alt]").first().attr("alt")?.trim();
    const accessibleName = text || ariaLabel || title || imgAlt || "";

    links.push({
      href,
      resolvedUrl: classified.resolvedUrl,
      text,
      rel,
      target,
      isExternal: classified.isExternal,
      isEmpty: classified.isEmpty,
      isJavascript: classified.isJavascript,
      isAnchorOnly: classified.isAnchorOnly,
      isMailtoOrTel: classified.isMailtoOrTel,
      isMalformed: classified.isMalformed,
      hasNoText: accessibleName.length === 0,
      missingNoopener: target === "_blank" && !hasNoopener,
    });
  });

  return links;
}

/** Fast path: single fetch that follows redirects natively (no per-hop chain). */
async function checkFast(resolvedUrl: string, timeoutMs: number, userAgent: string): Promise<LinkStatusResult> {
  try {
    const res = await fetch(resolvedUrl, {
      method: "HEAD",
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
      headers: requestHeaders(userAgent),
    }).then(async (r) => {
      // Some servers reject/misbehave on HEAD (405/501) or block it outright
      // as bot traffic (403/406/429/999) — retry once with GET, since a real
      // browser opening the link would get GET treatment and often succeed.
      if (HEAD_FALLBACK_STATUSES.has(r.status)) {
        return fetch(resolvedUrl, {
          method: "GET",
          redirect: "follow",
          signal: AbortSignal.timeout(timeoutMs),
          headers: requestHeaders(userAgent),
        });
      }
      return r;
    });

    const ok = res.status >= 200 && res.status < 400;
    return {
      href: resolvedUrl,
      resolvedUrl,
      ok,
      statusCode: res.status,
      error: ok ? null : `HTTP ${res.status}`,
      redirectChain: [],
      finalUrl: res.url || resolvedUrl,
    };
  } catch (err: any) {
    // Retry once for transient network errors
    if ((err?.message?.includes("ECONNRESET") || err?.message?.includes("ETIMEDOUT") || err?.name === "TypeError") && timeoutMs < 15000) {
      await delay(Math.random() * 500 + 200); // Random backoff 200-700ms
      try {
        const res = await fetch(resolvedUrl, {
          method: "GET",
          redirect: "follow",
          signal: AbortSignal.timeout(Math.min(timeoutMs * 1.5, 15000)),
          headers: requestHeaders(userAgent),
        });
        const ok = res.status >= 200 && res.status < 400;
        return {
          href: resolvedUrl,
          resolvedUrl,
          ok,
          statusCode: res.status,
          error: ok ? null : `HTTP ${res.status}`,
          redirectChain: [],
          finalUrl: res.url || resolvedUrl,
        };
      } catch {
        // Retry failed, fall through to error handling below
      }
    }
    const msg = err?.name === "AbortError" || err?.name === "TimeoutError" ? "Timed out" : (err?.message ?? "Network error");
    return { href: resolvedUrl, resolvedUrl, ok: false, statusCode: null, error: msg, redirectChain: [], finalUrl: resolvedUrl };
  }
}

/** Follows redirects manually (up to maxRedirects) to build a chain and get final status. */
async function checkWithChain(resolvedUrl: string, maxRedirects: number, timeoutMs: number, userAgent: string): Promise<LinkStatusResult> {
  const chain: string[] = [];
  let currentUrl = resolvedUrl;
  let hops = 0;

  try {
    while (hops <= maxRedirects) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      let res: Response;
      try {
        res = await fetch(currentUrl, {
          method: "HEAD",
          redirect: "manual",
          signal: controller.signal,
          headers: requestHeaders(userAgent),
        });
      } finally {
        clearTimeout(timeout);
      }

      // Some servers reject/block HEAD outright — retry with GET for this hop.
      if (HEAD_FALLBACK_STATUSES.has(res.status)) {
        const controller2 = new AbortController();
        const timeout2 = setTimeout(() => controller2.abort(), timeoutMs);
        try {
          res = await fetch(currentUrl, {
            method: "GET",
            redirect: "manual",
            signal: controller2.signal,
            headers: requestHeaders(userAgent),
          });
        } finally {
          clearTimeout(timeout2);
        }
      }

      const isRedirect = res.status >= 300 && res.status < 400;
      if (isRedirect) {
        const location = res.headers.get("location");
        if (!location) {
          return { href: resolvedUrl, resolvedUrl, ok: false, statusCode: res.status, error: "Redirect with no Location header", redirectChain: chain, finalUrl: currentUrl };
        }
        chain.push(currentUrl);
        currentUrl = new URL(location, currentUrl).toString();
        hops++;
        continue;
      }

      const ok = res.status >= 200 && res.status < 400;
      return { href: resolvedUrl, resolvedUrl, ok, statusCode: res.status, error: ok ? null : `HTTP ${res.status}`, redirectChain: chain, finalUrl: currentUrl };
    }

    return { href: resolvedUrl, resolvedUrl, ok: false, statusCode: null, error: `Too many redirects (>${maxRedirects})`, redirectChain: chain, finalUrl: currentUrl };
  } catch (err: any) {
    // Retry once for transient network errors
    if ((err?.message?.includes("ECONNRESET") || err?.message?.includes("ETIMEDOUT") || err?.name === "TypeError") && chain.length < 2) {
      await delay(Math.random() * 500 + 200); // Random backoff 200-700ms
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), Math.min(timeoutMs * 1.5, 15000));
        try {
          const res = await fetch(resolvedUrl, {
            method: "GET",
            redirect: "follow",
            signal: controller.signal,
            headers: requestHeaders(userAgent),
          });
          const ok = res.status >= 200 && res.status < 400;
          return { href: resolvedUrl, resolvedUrl, ok, statusCode: res.status, error: ok ? null : `HTTP ${res.status}`, redirectChain: chain, finalUrl: res.url || resolvedUrl };
        } finally {
          clearTimeout(timeout);
        }
      } catch {
        // Retry failed, fall through to error handling below
      }
    }
    const msg = err?.name === "AbortError" || err?.name === "TimeoutError" ? "Timed out" : (err?.message ?? "Network error");
    return { href: resolvedUrl, resolvedUrl, ok: false, statusCode: null, error: msg, redirectChain: chain, finalUrl: currentUrl };
  }
}

/**
 * Checks a single link's status, retrying once (with backoff) when the first
 * attempt fails for a *transient* reason — a timeout, a network blip, or a
 * 429/503 that's plausibly our own concurrent checks tripping rate limits
 * rather than the link actually being dead. This is the main defense against
 * false "broken link" reports: without it, a page that briefly hiccups under
 * load gets permanently reported as broken even though it works fine on a
 * normal, unhurried visit.
 */
export async function checkLinkStatus(
  resolvedUrl: string,
  maxRedirects: number,
  timeoutMs: number,
  userAgent: string,
  trackChain: boolean = true,
): Promise<LinkStatusResult> {
  const MAX_ATTEMPTS = 2;
  let result: LinkStatusResult;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    result = trackChain
      ? await checkWithChain(resolvedUrl, maxRedirects, timeoutMs, userAgent)
      : await checkFast(resolvedUrl, timeoutMs, userAgent);

    if (result.ok) return result;

    const isTransient =
      (result.statusCode !== null && TRANSIENT_RETRY_STATUSES.has(result.statusCode)) ||
      result.error === "Timed out" ||
      result.error === "Network error";

    if (attempt < MAX_ATTEMPTS && isTransient) {
      await delay(400 * attempt);
      continue;
    }
    return result;
  }

  return result!;
}

/** Full pipeline: fetch page, extract links, optionally check statuses, build report. */
export async function analyzeLinks(scannedUrl: string, opts: AnalyzeOptions = {}): Promise<LinkAnalysisReport> {
  const options = { ...DEFAULTS, ...opts };

  const pageRes = await fetch(scannedUrl, { headers: { "User-Agent": options.userAgent } });
  if (!pageRes.ok) {
    throw new Error(`Failed to fetch page to analyze: HTTP ${pageRes.status}`);
  }
  const html = await pageRes.text();
  const links = extractLinks(html, scannedUrl);

  const checkable = links.filter(
    (l) => l.resolvedUrl && !l.isAnchorOnly && !l.isMailtoOrTel && !l.isJavascript
  );

  // Dedup by resolved URL for network checks (don't hit the same URL 10x)
  const uniqueUrls = Array.from(new Set(checkable.map((l) => l.resolvedUrl!)));

  let statusResults: LinkStatusResult[] = [];
  if (options.checkLinkStatuses) {
    statusResults = await mapLimit(uniqueUrls, options.concurrency, (url) =>
      checkLinkStatus(url, options.maxRedirects, options.fetchTimeoutMs, options.userAgent)
    );
  }
  const statusByUrl = new Map(statusResults.map((r) => [r.resolvedUrl, r]));

  // Duplicates: group all checkable links by resolved URL
  const groups = new Map<string, RawLink[]>();
  for (const l of checkable) {
    const key = l.resolvedUrl!;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(l);
  }
  const duplicateLinks = Array.from(groups.entries())
    .filter(([, arr]) => arr.length > 1)
    .map(([resolvedUrl, arr]) => ({
      resolvedUrl,
      count: arr.length,
      sampleText: arr.slice(0, 3).map((l) => l.text || "(no text)"),
    }));

  const externalLinkCount = links.filter((l) => l.isExternal).length;
  const internalLinkCount = checkable.length - externalLinkCount;

  const brokenLinks = statusResults.filter((r) => !r.ok);
  const redirectChains = statusResults
    .filter((r) => r.redirectChain.length > 0)
    .map((r) => ({ href: r.href, chain: [...r.redirectChain, r.finalUrl], finalUrl: r.finalUrl }));

  return {
    scannedUrl,
    totalAnchorTags: links.length,
    totalCheckableLinks: checkable.length,
    externalLinkCount,
    internalLinkCount,
    tooManyExternalLinks: externalLinkCount > options.externalLinkThreshold,
    externalLinkThreshold: options.externalLinkThreshold,

    emptyHrefs: links.filter((l) => l.isEmpty),
    javascriptLinks: links.filter((l) => l.isJavascript),
    malformedLinks: links.filter((l) => l.isMalformed),
    linksWithoutText: links.filter((l) => l.hasNoText),
    missingRelNoopener: links.filter((l) => l.missingNoopener),
    duplicateLinks,

    brokenLinks,
    redirectChains,

    allChecked: statusResults,
  };
}

/** Converts a single-page LinkAnalysisReport into the standard Issue/passed shape
 *  used by every other auditor, so link results can sit alongside SEO/A11y/etc. */
export function buildLinkIssues(report: LinkAnalysisReport): { issues: Issue[]; passed: Issue[] } {
  const issues: Issue[] = [];
  const passed: Issue[] = [];

  if (report.brokenLinks.length > 0) {
    const first = report.brokenLinks[0];
    issues.push(issue(
      "broken-links",
      `${report.brokenLinks.length} broken link${report.brokenLinks.length === 1 ? "" : "s"} found`,
      `${report.brokenLinks.length} link${report.brokenLinks.length === 1 ? "" : "s"} on this page returned an error (e.g. "${first.resolvedUrl}" → ${first.error ?? first.statusCode}).`,
      "Fix or remove broken links, or update them to point at the correct destination.",
      12,
    ));
  } else if (report.allChecked.length > 0) {
    passed.push(pass("broken-links", "All checked links resolve successfully"));
  }

  if (report.duplicateLinks.length > 0) {
    const first = report.duplicateLinks[0];
    issues.push(issue(
      "duplicate-links",
      `${report.duplicateLinks.length} URL${report.duplicateLinks.length === 1 ? "" : "s"} linked to multiple times on this page`,
      `For example, "${first.resolvedUrl}" appears ${first.count} times. Not necessarily an error, but excessive repetition can dilute link equity and clutter navigation.`,
      "Consolidate repeated links where possible, keeping only the most meaningful instance.",
      2,
    ));
  }

  if (report.emptyHrefs.length > 0) {
    issues.push(issue(
      "empty-hrefs",
      `${report.emptyHrefs.length} link${report.emptyHrefs.length === 1 ? "" : "s"} with empty or missing href`,
      "Anchor tags without a valid href are not real links to crawlers or assistive tech, and often indicate leftover placeholder markup.",
      "Add a valid href, or use a <button> element if it isn't meant to navigate.",
      3,
    ));
  }

  if (report.javascriptLinks.length > 0) {
    issues.push(issue(
      "javascript-links",
      `${report.javascriptLinks.length} link${report.javascriptLinks.length === 1 ? "" : "s"} use javascript: hrefs`,
      "javascript: URLs aren't crawlable and often break middle-click/open-in-new-tab behavior.",
      "Use a real href and attach behavior via an event listener instead.",
      4,
    ));
  }

  if (report.malformedLinks.length > 0) {
    issues.push(issue(
      "malformed-hrefs",
      `${report.malformedLinks.length} link${report.malformedLinks.length === 1 ? "" : "s"} with an unparsable href`,
      "These href values (e.g. containing stray spaces or invalid characters) can't be resolved into a valid URL at all, so browsers, crawlers, and assistive tech may fail to follow them.",
      "Fix the href so it forms a valid, properly encoded URL.",
      3,
    ));
  }

  if (report.linksWithoutText.length > 0) {
    issues.push(issue(
      "links-without-text",
      `${report.linksWithoutText.length} link${report.linksWithoutText.length === 1 ? "" : "s"} have no accessible text`,
      "Links with no text, aria-label, title, or alt text on a contained image are announced as just \"link\" by screen readers and provide no context to search engines.",
      "Add descriptive link text, an aria-label, or alt text on the linked image.",
      5,
    ));
  }

  if (report.missingRelNoopener.length > 0) {
    issues.push(issue(
      "missing-rel-noopener",
      `${report.missingRelNoopener.length} target="_blank" link${report.missingRelNoopener.length === 1 ? "" : "s"} missing rel="noopener"`,
      "Links that open in a new tab without rel=\"noopener noreferrer\" let the destination page access window.opener, a known tabnabbing risk.",
      'Add rel="noopener noreferrer" to every target="_blank" link.',
      4,
    ));
  }

  if (report.tooManyExternalLinks) {
    issues.push(issue(
      "too-many-external-links",
      `Page has ${report.externalLinkCount} external links (over the ${report.externalLinkThreshold} threshold)`,
      "A very high number of external links can dilute page authority and, in extreme cases, resemble a link farm to search engines.",
      "Review external links and keep only those that add genuine value for readers.",
      3,
    ));
  }

  if (issues.length === 0) {
    passed.push(pass("link-hygiene", "No broken, empty, or malformed links found"));
  }

  return { issues, passed };
}

export interface SiteLinkAnalysisOptions {
  concurrency?: number;      // default 8
  maxRedirects?: number;     // default 5
  fetchTimeoutMs?: number;   // default 8000
  userAgent?: string;
  checkExternal?: boolean;   // default true — set false to only verify internal links
}

export interface BrokenSiteLink {
  resolvedUrl: string;
  statusCode: number | null;
  error: string | null;
  isExternal: boolean;
  foundOnPages: string[]; // pages that link to this URL (capped)
  sampleText: string[];
}

export interface SiteLinkAnalysisReport {
  totalUniqueLinks: number;
  totalInternal: number;
  totalExternal: number;
  brokenLinks: BrokenSiteLink[];
  issues: Issue[];
  passed: Issue[];
}

/**
 * Checks broken links across an entire crawled site instead of one page at a time.
 * Every checkable link from every crawled page is deduped by resolved URL first, so
 * a link that appears in a shared header/footer on 200 pages is only fetched once.
 */
export async function findBrokenLinksAcrossSite(
  pages: { url: string; html: string }[],
  opts: SiteLinkAnalysisOptions = {},
): Promise<SiteLinkAnalysisReport> {
  const options = {
    concurrency: opts.concurrency ?? 8, // Reduced from 30 to avoid overwhelming servers/triggering rate limits
    maxRedirects: opts.maxRedirects ?? 5,
    fetchTimeoutMs: opts.fetchTimeoutMs ?? 12000, // Increased from 6000ms to 12000ms to allow more time for responses
    userAgent: opts.userAgent ?? DEFAULTS.userAgent,
    checkExternal: opts.checkExternal ?? true,
  };

  const linkInfo = new Map<
    string,
    { isExternal: boolean; foundOnPages: Set<string>; sampleText: string[] }
  >();

  for (const page of pages) {
    let links: RawLink[];
    try {
      links = extractLinks(page.html, page.url);
    } catch {
      continue;
    }
    for (const link of links) {
      if (!link.resolvedUrl || link.isAnchorOnly || link.isMailtoOrTel || link.isJavascript) continue;
      if (link.isExternal && !options.checkExternal) continue;

      const key = link.resolvedUrl;
      if (!linkInfo.has(key)) {
        linkInfo.set(key, { isExternal: link.isExternal, foundOnPages: new Set(), sampleText: [] });
      }
      const entry = linkInfo.get(key)!;
      entry.foundOnPages.add(page.url);
      if (entry.sampleText.length < 3 && link.text) entry.sampleText.push(link.text);
    }
  }

  const uniqueUrls = Array.from(linkInfo.keys());
  const statusResults = await mapLimit(uniqueUrls, options.concurrency, (url) =>
    checkLinkStatus(url, options.maxRedirects, options.fetchTimeoutMs, options.userAgent, false),
  );

  const brokenLinks: BrokenSiteLink[] = [];
  for (const result of statusResults) {
    if (result.ok) continue;
    const info = linkInfo.get(result.resolvedUrl);
    if (!info) continue;
    brokenLinks.push({
      resolvedUrl: result.resolvedUrl,
      statusCode: result.statusCode,
      error: result.error,
      isExternal: info.isExternal,
      foundOnPages: Array.from(info.foundOnPages).slice(0, 25),
      sampleText: info.sampleText,
    });
  }
  brokenLinks.sort((a, b) => b.foundOnPages.length - a.foundOnPages.length);

  const internalBroken = brokenLinks.filter((l) => !l.isExternal);
  const externalBroken = brokenLinks.filter((l) => l.isExternal);
  const hasInternal = uniqueUrls.some((u) => !linkInfo.get(u)!.isExternal);
  const hasExternal = uniqueUrls.some((u) => linkInfo.get(u)!.isExternal);

  const issues: Issue[] = [];
  const passed: Issue[] = [];

  if (internalBroken.length > 0) {
    const totalRefs = internalBroken.reduce((s, l) => s + l.foundOnPages.length, 0);
    const first = internalBroken[0];
    issues.push(issue(
      "broken-internal-links",
      `${internalBroken.length} broken internal link${internalBroken.length === 1 ? "" : "s"} found across the site`,
      `${internalBroken.length} unique internal URL${internalBroken.length === 1 ? "" : "s"} returned an error (e.g. "${first.resolvedUrl}" → ${first.error ?? first.statusCode}), referenced from ${totalRefs} link instance${totalRefs === 1 ? "" : "s"} across the crawled pages.`,
      "Fix or remove broken internal links, or add redirects for moved pages.",
      12,
    ));
  } else if (hasInternal) {
    passed.push(pass("broken-internal-links", "No broken internal links found across scanned pages"));
  }

  if (options.checkExternal && externalBroken.length > 0) {
    const first = externalBroken[0];
    issues.push(issue(
      "broken-external-links",
      `${externalBroken.length} broken external link${externalBroken.length === 1 ? "" : "s"} found across the site`,
      `${externalBroken.length} external URL${externalBroken.length === 1 ? "" : "s"} referenced from your pages returned an error or timed out (e.g. "${first.resolvedUrl}" → ${first.error ?? first.statusCode}).`,
      "Update or remove links to external sites that no longer resolve.",
      4,
    ));
  } else if (options.checkExternal && hasExternal) {
    passed.push(pass("broken-external-links", "No broken external links found across scanned pages"));
  }

  return {
    totalUniqueLinks: uniqueUrls.length,
    totalInternal: uniqueUrls.filter((u) => !linkInfo.get(u)!.isExternal).length,
    totalExternal: uniqueUrls.filter((u) => linkInfo.get(u)!.isExternal).length,
    brokenLinks,
    issues,
    passed,
  };
}
