// lib/duplicateContentAudit.ts
// Detects duplicate/near-duplicate content across a crawled site: repeated
// <title>/meta-description tags, pages whose main text is byte-for-byte
// identical, and pages that are highly similar but not identical (thin or
// templated pages that dilute SEO signals). Requires multiple pages, so this
// only produces meaningful results in a site (multi-page) scan.

import * as cheerio from "cheerio";
import { issue, pass, type Issue } from "@/lib/auditUtils";

export interface CrawledPageInput {
  url: string;
  html: string;
}

export interface DuplicateGroup {
  key: string; // normalized value the pages have in common (truncated for long body hashes)
  pages: string[];
}

export interface NearDuplicatePair {
  pageA: string;
  pageB: string;
  similarity: number; // 0-1, Jaccard similarity over word shingles
}

export interface DuplicateContentReport {
  duplicateTitles: DuplicateGroup[];
  duplicateMetaDescriptions: DuplicateGroup[];
  duplicateBodyContent: DuplicateGroup[];
  nearDuplicatePages: NearDuplicatePair[];
  issues: Issue[];
  passed: Issue[];
}

const NEAR_DUPLICATE_THRESHOLD = 0.9; // >=90% shingle overlap counts as near-duplicate
const MIN_WORDS_FOR_COMPARISON = 30; // skip near-empty pages (nav-only, error pages, etc.) — too noisy to compare
const MAX_PAGES_FOR_PAIRWISE = 300; // pairwise near-dup comparison is O(n^2); cap it for very large crawls
const SHINGLE_SIZE = 5;

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function normalizeTitleOrMeta(text: string): string {
  return normalizeWhitespace(text).toLowerCase();
}

/** Strips boilerplate-ish elements (nav/header/footer/scripts) before comparing
 *  body text, so a shared site chrome doesn't make every page look "duplicate". */
function extractBodyText($: cheerio.CheerioAPI): string {
  const $clone = $.root().clone();
  $clone.find("script, style, noscript, nav, header, footer, svg").remove();
  return normalizeWhitespace($clone.text()).toLowerCase();
}

/** djb2 string hash — fast, dependency-free, plenty collision-resistant for grouping page text. */
function hashString(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
}

/** Builds a set of overlapping k-word shingles, used for Jaccard similarity between pages. */
function shingles(text: string, k = SHINGLE_SIZE): Set<string> {
  const words = text.split(" ").filter(Boolean);
  const set = new Set<string>();
  if (words.length < k) {
    if (words.length > 0) set.add(words.join(" "));
    return set;
  }
  for (let i = 0; i <= words.length - k; i++) {
    set.add(words.slice(i, i + k).join(" "));
  }
  return set;
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  const [smaller, larger] = a.size <= b.size ? [a, b] : [b, a];
  let intersection = 0;
  for (const item of smaller) {
    if (larger.has(item)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/** Full pipeline: parses every crawled page once and reports duplicate titles,
 *  duplicate meta descriptions, exact-duplicate body content, and near-duplicate
 *  body content (similar but not identical) across the whole set of pages. */
export function analyzeDuplicateContent(pages: CrawledPageInput[]): DuplicateContentReport {
  const issues: Issue[] = [];
  const passed: Issue[] = [];

  const titleGroups = new Map<string, string[]>();
  const metaGroups = new Map<string, string[]>();
  const bodyHashGroups = new Map<string, string[]>();
  const shingleByUrl = new Map<string, Set<string>>();

  for (const page of pages) {
    let $: cheerio.CheerioAPI;
    try {
      $ = cheerio.load(page.html);
    } catch {
      continue;
    }

    const title = normalizeTitleOrMeta($("title").first().text());
    if (title) {
      if (!titleGroups.has(title)) titleGroups.set(title, []);
      titleGroups.get(title)!.push(page.url);
    }

    const metaDesc = normalizeTitleOrMeta($('meta[name="description"]').attr("content") || "");
    if (metaDesc) {
      if (!metaGroups.has(metaDesc)) metaGroups.set(metaDesc, []);
      metaGroups.get(metaDesc)!.push(page.url);
    }

    const bodyText = extractBodyText($);
    const wordCount = bodyText ? bodyText.split(" ").filter(Boolean).length : 0;

    if (wordCount >= MIN_WORDS_FOR_COMPARISON) {
      const hash = hashString(bodyText);
      if (!bodyHashGroups.has(hash)) bodyHashGroups.set(hash, []);
      bodyHashGroups.get(hash)!.push(page.url);
      shingleByUrl.set(page.url, shingles(bodyText));
    }
  }

  const duplicateTitles: DuplicateGroup[] = Array.from(titleGroups.entries())
    .filter(([, urls]) => urls.length > 1)
    .map(([key, urls]) => ({ key, pages: urls }));

  const duplicateMetaDescriptions: DuplicateGroup[] = Array.from(metaGroups.entries())
    .filter(([, urls]) => urls.length > 1)
    .map(([key, urls]) => ({ key, pages: urls }));

  const duplicateBodyContent: DuplicateGroup[] = Array.from(bodyHashGroups.entries())
    .filter(([, urls]) => urls.length > 1)
    .map(([key, urls]) => ({ key, pages: urls }));

  // Near-duplicate detection (pairwise Jaccard over shingles) — skip pages already
  // flagged as exact body-content duplicates, and cap the comparison set so this
  // doesn't become O(n^2) on very large crawls.
  const exactDupeUrls = new Set(duplicateBodyContent.flatMap((g) => g.pages));
  const candidateUrls = Array.from(shingleByUrl.keys())
    .filter((url) => !exactDupeUrls.has(url))
    .slice(0, MAX_PAGES_FOR_PAIRWISE);

  const nearDuplicatePages: NearDuplicatePair[] = [];
  for (let i = 0; i < candidateUrls.length; i++) {
    for (let j = i + 1; j < candidateUrls.length; j++) {
      const urlA = candidateUrls[i];
      const urlB = candidateUrls[j];
      const sim = jaccardSimilarity(shingleByUrl.get(urlA)!, shingleByUrl.get(urlB)!);
      if (sim >= NEAR_DUPLICATE_THRESHOLD) {
        nearDuplicatePages.push({ pageA: urlA, pageB: urlB, similarity: sim });
      }
    }
  }
  nearDuplicatePages.sort((a, b) => b.similarity - a.similarity);

  // --- Build issues ---
  if (duplicateTitles.length > 0) {
    const totalPages = duplicateTitles.reduce((s, g) => s + g.pages.length, 0);
    const first = duplicateTitles[0];
    issues.push(issue(
      "duplicate-title",
      `${duplicateTitles.length} title tag${duplicateTitles.length === 1 ? "" : "s"} reused across ${totalPages} pages`,
      `The same <title> text appears on multiple pages (e.g. "${first.key.slice(0, 60)}${first.key.length > 60 ? "…" : ""}" on ${first.pages.length} page${first.pages.length === 1 ? "" : "s"}). Search engines rely on unique titles to tell pages apart in results.`,
      "Give each page a unique, descriptive <title> that reflects its specific content.",
      8,
    ));
  } else if (titleGroups.size > 0) {
    passed.push(pass("duplicate-title", "No duplicate title tags found across scanned pages"));
  }

  if (duplicateMetaDescriptions.length > 0) {
    const totalPages = duplicateMetaDescriptions.reduce((s, g) => s + g.pages.length, 0);
    const first = duplicateMetaDescriptions[0];
    issues.push(issue(
      "duplicate-meta-description",
      `${duplicateMetaDescriptions.length} meta description${duplicateMetaDescriptions.length === 1 ? "" : "s"} reused across ${totalPages} pages`,
      `The same meta description appears on multiple pages (e.g. on ${first.pages.length} page${first.pages.length === 1 ? "" : "s"}). Duplicate descriptions reduce click-through in search results and give search engines no signal to differentiate pages.`,
      "Write a unique meta description for each page summarizing its specific content.",
      5,
    ));
  } else if (metaGroups.size > 0) {
    passed.push(pass("duplicate-meta-description", "No duplicate meta descriptions found across scanned pages"));
  }

  if (duplicateBodyContent.length > 0) {
    const totalPages = duplicateBodyContent.reduce((s, g) => s + g.pages.length, 0);
    issues.push(issue(
      "duplicate-body-content",
      `${duplicateBodyContent.length} group${duplicateBodyContent.length === 1 ? "" : "s"} of pages have identical main content (${totalPages} pages total)`,
      "Some pages returned byte-for-byte identical visible text (after stripping scripts/nav/footer). This usually means URL variants, parameter duplicates, or templated pages serving the same content, which splits ranking signals and wastes crawl budget.",
      "Consolidate duplicate pages, add a canonical URL, or add unique content to differentiate each page.",
      10,
    ));
  }

  if (nearDuplicatePages.length > 0) {
    const top = nearDuplicatePages[0];
    issues.push(issue(
      "near-duplicate-content",
      `${nearDuplicatePages.length} pair${nearDuplicatePages.length === 1 ? "" : "s"} of pages are near-duplicates (≥${Math.round(NEAR_DUPLICATE_THRESHOLD * 100)}% similar text)`,
      `For example, two scanned pages share roughly ${Math.round(top.similarity * 100)}% of the same text. Highly similar pages compete with each other in search results instead of ranking well individually.`,
      "Differentiate near-duplicate pages with unique content, or merge/redirect and canonicalize them if they serve the same purpose.",
      6,
    ));
  }

  if (duplicateBodyContent.length === 0 && nearDuplicatePages.length === 0 && shingleByUrl.size > 1) {
    passed.push(pass("duplicate-content", "No duplicate or near-duplicate page content detected"));
  }

  return {
    duplicateTitles,
    duplicateMetaDescriptions,
    duplicateBodyContent,
    nearDuplicatePages,
    issues,
    passed,
  };
}
