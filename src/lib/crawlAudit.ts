import * as cheerio from 'cheerio';
import { issue, pass, type Issue } from '@/lib/auditUtils';

const FETCH_HEADERS = { 'User-Agent': 'OptiqraBot/1.0 (+https://optiqra.vercel.app/bot)' };
const SITEMAP_FALLBACK_PATHS = ['/sitemap.xml', '/sitemap_index.xml', '/sitemap-index.xml'];
const MAX_SITEMAPS_TO_VALIDATE = 3;

interface RobotsGroup {
  userAgents: string[];
  rules: { directive: string; value: string }[];
}

interface AuditResult {
  issues: Issue[];
  passed: Issue[];
}

async function fetchText(url: string) {
  const response = await fetch(url, {
    redirect: 'follow',
    headers: FETCH_HEADERS,
    next: { revalidate: 3600 },
  });
  const text = await response.text();
  return { response, text };
}

function parseRobotsGroups(text: string): RobotsGroup[] {
  const groups: RobotsGroup[] = [];
  let current: RobotsGroup | null = null;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.split('#')[0].trim();
    if (!line) continue;

    const colon = line.indexOf(':');
    if (colon === -1) continue;

    const directive = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (!directive) continue;

    if (directive === 'user-agent') {
      if (!current || current.rules.length > 0) {
        current = { userAgents: [value.toLowerCase()], rules: [] };
        groups.push(current);
      } else {
        current.userAgents.push(value.toLowerCase());
      }
    } else if (current) {
      current.rules.push({ directive, value });
    }
  }

  return groups;
}

function extractSitemapUrls(text: string): string[] {
  const sitemaps: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.split('#')[0].trim();
    const match = /^sitemap:\s*(.+)$/i.exec(line);
    if (match) sitemaps.push(match[1].trim());
  }
  return sitemaps;
}

function findMalformedRobotsLines(text: string): string[] {
  const known = new Set(['user-agent', 'disallow', 'allow', 'sitemap', 'crawl-delay', 'host', 'clean-param']);
  const malformed: string[] = [];

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.split('#')[0].trim();
    if (!line || !line.includes(':')) continue;

    const directive = line.slice(0, line.indexOf(':')).trim().toLowerCase();
    if (!known.has(directive)) malformed.push(line.slice(0, 80));
  }

  return malformed;
}

function isWildcardFullyDisallowed(groups: RobotsGroup[]): boolean {
  const wildcard = groups.find(g => g.userAgents.includes('*'));
  if (!wildcard) return false;

  return wildcard.rules.some(
    r => r.directive === 'disallow' && (r.value === '/' || r.value === '/*'),
  );
}

function resolveUrl(candidate: string, baseUrl: string): string | null {
  try {
    return new URL(candidate, baseUrl).toString();
  } catch {
    return null;
  }
}

function isValidLastmod(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}(?:[T\s]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?)?$/.test(value);
}

function isAbsoluteHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function analyzeRobotsTxt(targetUrl: string, response: Response, text: string): AuditResult {
  const issues: Issue[] = [];
  const passed: Issue[] = [];
  const origin = new URL(targetUrl).origin;

  if (response.status === 404) {
    issues.push(issue(
      'robots-missing',
      'No robots.txt found',
      `No robots.txt file was returned at ${origin}/robots.txt. Search engines will crawl freely, but you lose a place to declare sitemap locations and crawl rules.`,
      'Add a robots.txt at the site root with crawl rules and Sitemap directives.',
      6,
    ));
    return { issues, passed };
  }

  if (!response.ok) {
    issues.push(issue(
      'robots-error',
      `robots.txt returned HTTP ${response.status}`,
      'Crawlers expect a plain-text robots.txt at the site root. A non-200 response can cause unpredictable crawl behavior.',
      'Fix the server response for /robots.txt so it returns HTTP 200 with valid plain text.',
      8,
    ));
    return { issues, passed };
  }

  const trimmed = text.trim();
  if (!trimmed) {
    issues.push(issue(
      'robots-empty',
      'robots.txt is empty',
      'The file exists but contains no directives, so crawlers get no guidance on sitemap location or restricted paths.',
      'Add User-agent rules and at least one Sitemap: line pointing to your XML sitemap.',
      5,
    ));
    return { issues, passed };
  }

  const groups = parseRobotsGroups(trimmed);
  const sitemaps = extractSitemapUrls(trimmed);
  const malformed = findMalformedRobotsLines(trimmed);

  if (groups.length === 0) {
    issues.push(issue(
      'robots-no-groups',
      'robots.txt has no User-agent blocks',
      'The file contains text but no recognizable User-agent groups, so crawlers may ignore the rules entirely.',
      'Structure robots.txt with User-agent and Disallow/Allow directives.',
      7,
    ));
  } else {
    passed.push(pass('robots-present', 'robots.txt is present and readable'));
  }

  if (isWildcardFullyDisallowed(groups)) {
    issues.push(issue(
      'robots-disallow-all',
      'robots.txt blocks all crawlers',
      'User-agent: * includes Disallow: /, which tells search engines not to crawl any pages on the site.',
      'Remove or narrow the blanket Disallow: / rule unless the entire site should stay out of search results.',
      15,
    ));
  }

  if (sitemaps.length === 0) {
    issues.push(issue(
      'robots-no-sitemap',
      'robots.txt does not declare a sitemap',
      'No Sitemap: directive was found. Declaring sitemap URLs in robots.txt helps crawlers discover them reliably.',
      'Add Sitemap: https://yoursite.com/sitemap.xml to robots.txt.',
      6,
    ));
  } else {
    passed.push(pass('robots-sitemap-declared', `robots.txt declares ${sitemaps.length} sitemap${sitemaps.length === 1 ? '' : 's'}`));
  }

  if (malformed.length > 0) {
    issues.push(issue(
      'robots-malformed',
      'robots.txt contains unrecognized directives',
      `Found ${malformed.length} line${malformed.length === 1 ? '' : 's'} with unknown directives (e.g. "${malformed[0]}"). Crawlers may skip invalid rules.`,
      'Use only standard directives: User-agent, Disallow, Allow, Sitemap, and Crawl-delay.',
      4,
    ));
  }

  const contentType = response.headers.get('content-type') || '';
  if (contentType && !/text\/plain|text\/html|application\/octet-stream/i.test(contentType)) {
    issues.push(issue(
      'robots-content-type',
      'robots.txt has an unusual Content-Type',
      `The file was served as "${contentType.split(';')[0]}". robots.txt should ideally be text/plain.`,
      'Serve robots.txt with Content-Type: text/plain; charset=utf-8.',
      3,
    ));
  }

  return { issues, passed };
}

async function discoverSitemapUrls(targetUrl: string, robotsText: string | null): Promise<string[]> {
  const discovered = new Set<string>();

  if (robotsText) {
    for (const raw of extractSitemapUrls(robotsText)) {
      const resolved = resolveUrl(raw, targetUrl);
      if (resolved) discovered.add(resolved);
    }
  }

  if (discovered.size === 0) {
    for (const path of SITEMAP_FALLBACK_PATHS) {
      const candidate = new URL(path, targetUrl).toString();
      try {
        const { response } = await fetchText(candidate);
        if (response.ok) {
          discovered.add(candidate);
          break;
        }
      } catch {
        // try next fallback path
      }
    }
  }

  return [...discovered].slice(0, MAX_SITEMAPS_TO_VALIDATE);
}

function validateUrlset($: cheerio.CheerioAPI, pageOrigin: string, sitemapUrl: string): AuditResult {
  const issues: Issue[] = [];
  const passed: Issue[] = [];
  const urls = $('url');
  const pageHost = new URL(pageOrigin).hostname;

  if (urls.length === 0) {
    issues.push(issue(
      'sitemap-empty',
      'Sitemap contains no URLs',
      `${sitemapUrl} parsed as a urlset but has zero <url> entries, so it cannot help crawlers discover pages.`,
      'Populate the sitemap with <url><loc>…</loc></url> entries for indexable pages.',
      10,
    ));
    return { issues, passed };
  }

  const locs = new Set<string>();
  let missingLoc = 0;
  let invalidLoc = 0;
  let offDomain = 0;
  let invalidLastmod = 0;
  let duplicateCount = 0;

  urls.each((_, el) => {
    const loc = $(el).find('loc').first().text().trim();
    if (!loc) {
      missingLoc++;
      return;
    }

    if (!isAbsoluteHttpUrl(loc)) {
      invalidLoc++;
      return;
    }

    if (locs.has(loc)) duplicateCount++;
    locs.add(loc);

    try {
      if (new URL(loc).hostname !== pageHost) offDomain++;
    } catch {
      invalidLoc++;
    }

    const lastmod = $(el).find('lastmod').first().text().trim();
    if (lastmod && !isValidLastmod(lastmod)) invalidLastmod++;
  });

  if (missingLoc > 0) {
    issues.push(issue(
      'sitemap-missing-loc',
      `${missingLoc} sitemap entr${missingLoc === 1 ? 'y is' : 'ies are'} missing <loc>`,
      'Every <url> entry must include an absolute <loc> URL. Entries without one are ignored by crawlers.',
      'Add a valid absolute URL inside <loc> for every <url> entry.',
      9,
    ));
  }

  if (invalidLoc > 0) {
    issues.push(issue(
      'sitemap-invalid-loc',
      `${invalidLoc} sitemap URL${invalidLoc === 1 ? '' : 's'} ${invalidLoc === 1 ? 'is' : 'are'} not valid absolute URLs`,
      'Sitemap <loc> values must be full http:// or https:// URLs, not relative paths.',
      'Use absolute URLs in every <loc> element.',
      8,
    ));
  }

  if (duplicateCount > 0) {
    issues.push(issue(
      'sitemap-duplicates',
      `${duplicateCount} duplicate URL${duplicateCount === 1 ? '' : 's'} in sitemap`,
      'The same URL appears more than once, which wastes crawl budget and can confuse indexers.',
      'Remove duplicate <loc> entries so each URL appears once.',
      5,
    ));
  }

  if (offDomain > 0 && offDomain === locs.size) {
    issues.push(issue(
      'sitemap-off-domain',
      'Sitemap URLs are all on a different domain',
      `All ${locs.size} URLs point outside ${pageHost}. Cross-domain sitemaps are usually a misconfiguration for the scanned site.`,
      'Point the sitemap at URLs on the same host as the site being analyzed.',
      7,
    ));
  } else if (offDomain > 0) {
    issues.push(issue(
      'sitemap-mixed-domain',
      `${offDomain} sitemap URL${offDomain === 1 ? '' : 's'} on a different domain`,
      'Some entries reference external domains. That can be intentional, but often indicates stale or copied sitemap content.',
      'Keep sitemap URLs on the same domain unless you intentionally index external pages.',
      4,
    ));
  }

  if (invalidLastmod > 0) {
    issues.push(issue(
      'sitemap-lastmod',
      `${invalidLastmod} sitemap entr${invalidLastmod === 1 ? 'y has' : 'ies have'} invalid lastmod dates`,
      'lastmod values should use ISO 8601 format (e.g. 2024-06-15 or 2024-06-15T08:00:00Z).',
      'Fix or remove invalid <lastmod> values.',
      4,
    ));
  }

  if (urls.length > 50000) {
    issues.push(issue(
      'sitemap-size',
      `Sitemap lists ${urls.length.toLocaleString()} URLs (limit is 50,000)`,
      'The sitemaps.org protocol allows at most 50,000 URLs per file. Larger sets must be split.',
      'Split the sitemap into multiple files and reference them from a sitemap index.',
      8,
    ));
  }

  if (issues.length === 0) {
    passed.push(pass('sitemap-valid', `Sitemap is valid (${locs.size.toLocaleString()} URL${locs.size === 1 ? '' : 's'})`));
  }

  return { issues, passed };
}

async function validateSitemapIndex($: cheerio.CheerioAPI, sitemapUrl: string): Promise<AuditResult> {
  const issues: Issue[] = [];
  const passed: Issue[] = [];
  const entries = $('sitemap');

  if (entries.length === 0) {
    issues.push(issue(
      'sitemap-index-empty',
      'Sitemap index contains no child sitemaps',
      `${sitemapUrl} is a sitemap index but lists no <sitemap> entries.`,
      'Add <sitemap><loc>…</loc></sitemap> entries pointing to child sitemap files.',
      9,
    ));
    return { issues, passed };
  }

  let missingLoc = 0;
  let invalidLoc = 0;
  let unreachable = 0;

  for (let i = 0; i < entries.length && i < 5; i++) {
    const loc = $(entries[i]).find('loc').first().text().trim();
    if (!loc) {
      missingLoc++;
      continue;
    }
    if (!isAbsoluteHttpUrl(loc)) {
      invalidLoc++;
      continue;
    }

    try {
      const child = await fetch(loc, { method: 'HEAD', redirect: 'follow', headers: FETCH_HEADERS });
      if (!child.ok) unreachable++;
    } catch {
      unreachable++;
    }
  }

  if (missingLoc > 0) {
    issues.push(issue(
      'sitemap-index-missing-loc',
      `${missingLoc} sitemap index entr${missingLoc === 1 ? 'y is' : 'ies are'} missing <loc>`,
      'Each <sitemap> entry in an index must include an absolute <loc> URL.',
      'Add valid <loc> URLs for every child sitemap.',
      8,
    ));
  }

  if (invalidLoc > 0) {
    issues.push(issue(
      'sitemap-index-invalid-loc',
      `${invalidLoc} child sitemap URL${invalidLoc === 1 ? '' : 's'} ${invalidLoc === 1 ? 'is' : 'are'} invalid`,
      'Child sitemap URLs must be absolute http:// or https:// addresses.',
      'Fix the <loc> URLs in the sitemap index.',
      7,
    ));
  }

  if (unreachable > 0) {
    issues.push(issue(
      'sitemap-index-unreachable',
      `${unreachable} referenced child sitemap${unreachable === 1 ? '' : 's'} could not be reached`,
      'At least one sitemap listed in the index returned a non-200 response or failed to load.',
      'Ensure every child sitemap URL returns HTTP 200 and valid XML.',
      7,
    ));
  }

  if (entries.length > 50000) {
    issues.push(issue(
      'sitemap-index-size',
      `Sitemap index lists ${entries.length.toLocaleString()} child sitemaps (limit is 50,000)`,
      'A sitemap index may reference at most 50,000 sitemaps.',
      'Reduce the number of child sitemaps or split across multiple index files.',
      8,
    ));
  }

  if (issues.length === 0) {
    passed.push(pass('sitemap-index-valid', `Sitemap index is valid (${entries.length} child sitemap${entries.length === 1 ? '' : 's'})`));
  }

  return { issues, passed };
}

async function validateSitemapXml(sitemapUrl: string, pageOrigin: string): Promise<AuditResult> {
  const issues: Issue[] = [];
  const passed: Issue[] = [];

  let response: Response;
  let text: string;

  try {
    ({ response, text } = await fetchText(sitemapUrl));
  } catch {
    issues.push(issue(
      'sitemap-fetch',
      'Could not fetch XML sitemap',
      `Failed to load ${sitemapUrl}. Crawlers may also struggle to retrieve it.`,
      'Ensure the sitemap URL is publicly accessible and returns HTTP 200.',
      10,
    ));
    return { issues, passed };
  }

  if (!response.ok) {
    issues.push(issue(
      'sitemap-http',
      `Sitemap returned HTTP ${response.status}`,
      `${sitemapUrl} did not return a successful response, so crawlers cannot use it.`,
      'Fix the sitemap endpoint to return HTTP 200 with valid XML.',
      10,
    ));
    return { issues, passed };
  }

  const trimmed = text.trim();
  if (!trimmed.startsWith('<')) {
    issues.push(issue(
      'sitemap-not-xml',
      'Sitemap response is not XML',
      'The sitemap URL returned content that does not look like XML (no leading < tag).',
      'Serve a valid XML sitemap at this URL.',
      10,
    ));
    return { issues, passed };
  }

  let $: cheerio.CheerioAPI;
  try {
    $ = cheerio.load(trimmed, { xmlMode: true });
  } catch {
    issues.push(issue(
      'sitemap-parse',
      'Sitemap XML could not be parsed',
      'The sitemap file appears malformed and could not be parsed as XML.',
      'Fix XML syntax errors and ensure the file is well-formed.',
      10,
    ));
    return { issues, passed };
  }

  const root = $.root().children().filter((_, el) => {
    const name = 'name' in el && typeof el.name === 'string' ? el.name.toLowerCase() : '';
    return Boolean(name) && !name.startsWith('?');
  }).first();

  const rootTag = root.prop('tagName')?.toLowerCase() || '';

  if (rootTag === 'urlset') {
    const result = validateUrlset($, pageOrigin, sitemapUrl);
    issues.push(...result.issues);
    passed.push(...result.passed);
  } else if (rootTag === 'sitemapindex') {
    const result = await validateSitemapIndex($, sitemapUrl);
    issues.push(...result.issues);
    passed.push(...result.passed);
  } else {
    issues.push(issue(
      'sitemap-root',
      'Invalid sitemap root element',
      `Expected <urlset> or <sitemapindex> as the root element, but found <${rootTag || 'unknown'}>.`,
      'Use a standards-compliant sitemap structure per sitemaps.org.',
      10,
    ));
  }

  const sizeBytes = Buffer.byteLength(trimmed, 'utf8');
  if (sizeBytes > 50 * 1024 * 1024) {
    issues.push(issue(
      'sitemap-file-size',
      `Sitemap file is ${Math.round(sizeBytes / (1024 * 1024))} MB (limit is 50 MB uncompressed)`,
      'Sitemaps larger than 50 MB uncompressed should be split into smaller files.',
      'Split the sitemap and reference the parts from a sitemap index.',
      7,
    ));
  }

  return { issues, passed };
}

export async function analyzeCrawlFiles(targetUrl: string): Promise<AuditResult> {
  const issues: Issue[] = [];
  const passed: Issue[] = [];
  const origin = new URL(targetUrl).origin;
  const robotsUrl = new URL('/robots.txt', targetUrl).toString();

  let robotsText: string | null = null;

  try {
    const { response, text } = await fetchText(robotsUrl);
    robotsText = response.ok ? text : null;
    const robotsAudit = analyzeRobotsTxt(targetUrl, response, text);
    issues.push(...robotsAudit.issues);
    passed.push(...robotsAudit.passed);
  } catch {
    issues.push(issue(
      'robots-fetch',
      'Could not fetch robots.txt',
      `Failed to load ${robotsUrl}. Crawlers may not discover your sitemap or crawl rules.`,
      'Ensure /robots.txt is publicly accessible.',
      7,
    ));
  }

  const sitemapUrls = await discoverSitemapUrls(targetUrl, robotsText);

  if (sitemapUrls.length === 0) {
    issues.push(issue(
      'sitemap-missing',
      'No XML sitemap found',
      'No sitemap was declared in robots.txt and common paths like /sitemap.xml did not return a valid file.',
      'Create an XML sitemap, validate it, and add a Sitemap: line to robots.txt.',
      8,
    ));
    return { issues, passed };
  }

  for (const sitemapUrl of sitemapUrls) {
    const sitemapAudit = await validateSitemapXml(sitemapUrl, origin);
    issues.push(...sitemapAudit.issues);
    passed.push(...sitemapAudit.passed);
  }

  return { issues, passed };
}
