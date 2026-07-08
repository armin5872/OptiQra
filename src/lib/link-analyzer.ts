// lib/link-analyzer.ts
// Place at: lib/link-analyzer.ts
// npm install cheerio

import * as cheerio from "cheerio";

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
  concurrency: 8,
  checkLinkStatuses: true,
  fetchTimeoutMs: 8000,
  userAgent: "Mozilla/5.0 (compatible; LinkAnalyzerBot/1.0)",
};

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
} {
  const trimmed = (href || "").trim();

  if (trimmed === "") {
    return { resolvedUrl: null, isExternal: false, isEmpty: true, isJavascript: false, isAnchorOnly: false, isMailtoOrTel: false };
  }
  if (/^javascript:/i.test(trimmed)) {
    return { resolvedUrl: null, isExternal: false, isEmpty: false, isJavascript: true, isAnchorOnly: false, isMailtoOrTel: false };
  }
  if (/^(mailto:|tel:|sms:)/i.test(trimmed)) {
    return { resolvedUrl: null, isExternal: false, isEmpty: false, isJavascript: false, isAnchorOnly: false, isMailtoOrTel: true };
  }
  if (trimmed.startsWith("#")) {
    return { resolvedUrl: null, isExternal: false, isEmpty: false, isJavascript: false, isAnchorOnly: true, isMailtoOrTel: false };
  }

  try {
    const base = new URL(baseUrl);
    const resolved = new URL(trimmed, base);
    const isExternal = resolved.hostname !== base.hostname;
    return { resolvedUrl: resolved.toString(), isExternal, isEmpty: false, isJavascript: false, isAnchorOnly: false, isMailtoOrTel: false };
  } catch {
    // Unresolvable (e.g. malformed URL) — treat as broken-candidate, not "empty"
    return { resolvedUrl: null, isExternal: false, isEmpty: false, isJavascript: false, isAnchorOnly: false, isMailtoOrTel: false };
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
      hasNoText: accessibleName.length === 0,
      missingNoopener: target === "_blank" && !hasNoopener,
    });
  });

  return links;
}

/** Follows redirects manually (up to maxRedirects) to build a chain and get final status. */
async function checkLinkStatus(
  resolvedUrl: string,
  maxRedirects: number,
  timeoutMs: number,
  userAgent: string
): Promise<LinkStatusResult> {
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
          headers: { "User-Agent": userAgent },
        });
      } finally {
        clearTimeout(timeout);
      }

      // Some servers reject HEAD (405/501) — retry with GET for this hop.
      if (res.status === 405 || res.status === 501) {
        const controller2 = new AbortController();
        const timeout2 = setTimeout(() => controller2.abort(), timeoutMs);
        try {
          res = await fetch(currentUrl, {
            method: "GET",
            redirect: "manual",
            signal: controller2.signal,
            headers: { "User-Agent": userAgent },
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
    const msg = err?.name === "AbortError" ? "Timed out" : (err?.message ?? "Network error");
    return { href: resolvedUrl, resolvedUrl, ok: false, statusCode: null, error: msg, redirectChain: chain, finalUrl: currentUrl };
  }
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
    linksWithoutText: links.filter((l) => l.hasNoText),
    missingRelNoopener: links.filter((l) => l.missingNoopener),
    duplicateLinks,

    brokenLinks,
    redirectChains,

    allChecked: statusResults,
  };
}
