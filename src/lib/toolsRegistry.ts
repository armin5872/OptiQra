/**
 * Central registry for OptiQra's standalone "individual tool" pages
 * (optiqra.vercel.app/tools/<slug>).
 *
 * Every tool here is a thin, focused UI over the SAME audit/generator logic
 * that powers the full site-wide scan in src/lib — nothing in this file
 * re-implements analysis; it only points at existing exports (see the
 * `audit`/`generator`/`ai` engines in src/app/tools) so the standalone
 * pages and the full scan can never drift apart.
 *
 * The raw tool-name brainstorm this was distilled from had ~300 entries,
 * most of which were just SEO-keyword variants of the same underlying
 * check ("Broken Link Checker" / "Dead Link Checker" / "Link Checker" /
 * "URL Checker" ...). Each entry below already represents the merged,
 * de-duplicated capability — see DEDUPE_NOTES at the bottom for a map of
 * what got folded into what.
 */

export type ToolEngine = "audit" | "generator" | "pagespeed" | "ai";

export type AuditSource =
	| "seo"
	| "aeo"
	| "geo"
	| "security"
	| "structured"
	| "links"
	| "images"
	| "stack"
	| "a11y"
	| "speed"
	| "robots"
	| "sitemap"
	| "redirect"
	| "duplicate"
	| "favicon";

export type GeneratorKind =
	| "meta"
	| "schema"
	| "robots"
	| "sitemap"
	| "hreflang"
	| "slug"
	| "security-headers";

export type AiKind = "llms-txt" | "seo-fix" | "alt-text";

export interface ToolDef {
	slug: string;
	name: string;
	shortName: string;
	category: string;
	tagline: string;
	description: string;
	engine: ToolEngine;
	byok?: "ai" | "pagespeed" | null;
	// audit engine
	source?: AuditSource;
	idPrefixes?: string[];
	// generator engine
	generatorKind?: GeneratorKind;
	// ai engine
	aiKind?: AiKind;
	inputKind?: "url" | "urls" | "text";
	inputLabel?: string;
}

export const CATEGORIES = [
	"Meta & Social",
	"Structured Data",
	"Robots, Sitemap & Crawling",
	"Content & Structure",
	"International SEO",
	"Performance",
	"Security & Trust",
	"Accessibility",
	"Tech & Metadata",
	"AI / GEO / AEO",
] as const;

export const TOOLS: ToolDef[] = [
	// ---- Meta & Social -----------------------------------------------
	{
		slug: "meta-tag-checker",
		name: "Meta Tag & Social Preview Checker",
		shortName: "Meta Tag Checker",
		category: "Meta & Social",
		tagline: "Audit title, meta description, canonical, Open Graph and Twitter Card tags on any page.",
		description:
			"Fetches a page and checks its title tag, meta description, canonical URL, Open Graph tags, and Twitter Card tags for missing, duplicate, or badly-sized values.",
		engine: "audit",
		source: "seo",
		idPrefixes: ["title", "meta-desc", "meta-charset", "canonical", "og-", "twitter"],
		inputKind: "url",
	},
	{
		slug: "meta-tag-generator",
		name: "Meta Tag & Social Preview Generator",
		shortName: "Meta Tag Generator",
		category: "Meta & Social",
		tagline: "Generate title, meta description, canonical, Open Graph, and Twitter Card tags with a live SERP + social preview.",
		description:
			"Type in your page details and get copy-paste-ready <title>, <meta>, canonical, Open Graph, and Twitter Card markup, alongside a live Google SERP and social share preview.",
		engine: "generator",
		generatorKind: "meta",
	},

	// ---- Structured Data -----------------------------------------------
	{
		slug: "schema-markup-generator",
		name: "Schema Markup (JSON-LD) Generator",
		shortName: "Schema Generator",
		category: "Structured Data",
		tagline: "Generate valid JSON-LD for Organization, Article, Product, FAQ, LocalBusiness, Event, Breadcrumb and more.",
		description:
			"Pick a schema.org type, fill in the fields, and get a ready-to-paste <script type=\"application/ld+json\"> block.",
		engine: "generator",
		generatorKind: "schema",
	},
	{
		slug: "structured-data-checker",
		name: "Structured Data & JSON-LD Validator",
		shortName: "Schema Checker",
		category: "Structured Data",
		tagline: "Validate the JSON-LD and schema.org markup already on a page.",
		description:
			"Fetches a page and parses every JSON-LD block, flagging parse errors, missing required fields, and schema.org type problems.",
		engine: "audit",
		source: "structured",
		inputKind: "url",
	},

	// ---- Robots, Sitemap & Crawling -----------------------------------
	{
		slug: "robots-txt-checker",
		name: "Robots.txt Checker & AI Bot Access Tester",
		shortName: "Robots.txt Checker",
		category: "Robots, Sitemap & Crawling",
		tagline: "Fetch and parse a site's robots.txt, including whether GPTBot, ClaudeBot, and PerplexityBot are allowed in.",
		description:
			"Fetches /robots.txt, lists every rule group, flags syntax problems, and checks whether major AI crawlers (GPTBot, ClaudeBot, PerplexityBot, Google-Extended, CCBot) are allowed or blocked.",
		engine: "audit",
		source: "robots",
		inputKind: "url",
	},
	{
		slug: "robots-txt-generator",
		name: "Robots.txt Generator",
		shortName: "Robots.txt Generator",
		category: "Robots, Sitemap & Crawling",
		tagline: "Build a robots.txt with per-bot rules and one-click toggles for AI crawlers.",
		description:
			"Generate a robots.txt file, choose which paths to disallow, and toggle access for search and AI crawlers (Googlebot, Bingbot, GPTBot, ClaudeBot, PerplexityBot, Google-Extended, CCBot) individually.",
		engine: "generator",
		generatorKind: "robots",
	},
	{
		slug: "sitemap-checker",
		name: "XML Sitemap Checker & Validator",
		shortName: "Sitemap Checker",
		category: "Robots, Sitemap & Crawling",
		tagline: "Fetch and validate an XML sitemap or sitemap index.",
		description:
			"Fetches a sitemap.xml (or sitemap index), validates the XML, and reports URL count, malformed entries, and missing lastmod values.",
		engine: "audit",
		source: "sitemap",
		inputKind: "url",
		inputLabel: "Sitemap URL",
	},
	{
		slug: "sitemap-generator",
		name: "XML Sitemap Generator",
		shortName: "Sitemap Generator",
		category: "Robots, Sitemap & Crawling",
		tagline: "Paste a list of URLs and get a valid sitemap.xml.",
		description: "Paste one URL per line and get a standards-compliant sitemap.xml ready to upload.",
		engine: "generator",
		generatorKind: "sitemap",
	},
	{
		slug: "broken-link-checker",
		name: "Broken Link Checker",
		shortName: "Link Checker",
		category: "Robots, Sitemap & Crawling",
		tagline: "Scan a page's internal and external links for 404s, redirect chains, and status errors.",
		description:
			"Extracts every link on a page, checks each one's live HTTP status, and flags broken links, redirect chains, and an unusually high ratio of external links.",
		engine: "audit",
		source: "links",
		inputKind: "url",
	},
	{
		slug: "indexability-checker",
		name: "Indexability & Crawlability Checker",
		shortName: "Indexability Checker",
		category: "Robots, Sitemap & Crawling",
		tagline: "Check noindex, nofollow, and meta robots directives on a page.",
		description:
			"Checks a page's meta robots tag, X-Robots-Tag header, and canonical for anything that would keep it out of search results.",
		engine: "audit",
		source: "seo",
		idPrefixes: ["noindex", "canonical"],
		inputKind: "url",
	},
	{
		slug: "redirect-status-checker",
		name: "HTTP Status & Redirect Chain Checker",
		shortName: "Redirect Checker",
		category: "Robots, Sitemap & Crawling",
		tagline: "Follow redirect chains and check HTTP status codes for one or many URLs.",
		description:
			"Checks the live HTTP status of one or more URLs (one per line) and follows redirect chains, flagging loops and chains longer than 3 hops.",
		engine: "audit",
		source: "redirect",
		inputKind: "urls",
	},

	// ---- Content & Structure --------------------------------------------
	{
		slug: "heading-structure-checker",
		name: "Heading Structure (H1–H6) Checker",
		shortName: "Heading Checker",
		category: "Content & Structure",
		tagline: "Check for missing, duplicate, or out-of-order H1–H6 headings.",
		description: "Extracts the full heading outline of a page and flags missing H1s, multiple H1s, and skipped heading levels.",
		engine: "audit",
		source: "seo",
		idPrefixes: ["h1-", "heading-order"],
		inputKind: "url",
	},
	{
		slug: "content-seo-checker",
		name: "SEO Content & Readability Checker",
		shortName: "Content Checker",
		category: "Content & Structure",
		tagline: "Word count, keyword density, thin-content and above-the-fold checks.",
		description:
			"Analyzes on-page copy: word count, top keyword density, thin-content detection, above-the-fold content, and call-to-action clarity.",
		engine: "audit",
		source: "seo",
		idPrefixes: ["thin-content", "above-fold", "trust", "cta-clarity", "contact-path", "form-length", "url-structure"],
		inputKind: "url",
	},
	{
		slug: "duplicate-content-checker",
		name: "Duplicate Content Checker",
		shortName: "Duplicate Checker",
		category: "Content & Structure",
		tagline: "Compare two or more pages for duplicate or near-duplicate content.",
		description: "Paste two or more URLs (one per line) and check them for byte-identical or near-duplicate content and titles.",
		engine: "audit",
		source: "duplicate",
		inputKind: "urls",
	},
	{
		slug: "image-alt-text-checker",
		name: "Image Alt Text Checker",
		shortName: "Alt Text Checker",
		category: "Content & Structure",
		tagline: "Find images missing alt text or using non-lazy-loaded, oversized images.",
		description: "Scans every <img> on a page for missing/empty alt attributes, decorative-image handling, and lazy-loading usage.",
		engine: "audit",
		source: "seo",
		idPrefixes: ["alt-text", "decorative-alt", "lazy-loading"],
		inputKind: "url",
	},
	{
		slug: "image-optimization-checker",
		name: "Image Optimization Checker",
		shortName: "Image Checker",
		category: "Content & Structure",
		tagline: "Check image file sizes, formats, and oversized dimensions.",
		description:
			"Fetches every image on a page and flags oversized files, images served far larger than their display size, and legacy (non-WebP/AVIF) formats.",
		engine: "audit",
		source: "images",
		inputKind: "url",
	},
	{
		slug: "url-slug-generator",
		name: "URL Slug Generator",
		shortName: "Slug Generator",
		category: "Content & Structure",
		tagline: "Turn a title into a clean, SEO-friendly URL slug.",
		description: "Converts any title or phrase into a lowercase, hyphenated, SEO-friendly URL slug and flags overly long slugs.",
		engine: "generator",
		generatorKind: "slug",
	},

	// ---- International SEO ----------------------------------------------
	{
		slug: "hreflang-checker",
		name: "Hreflang Checker",
		shortName: "Hreflang Checker",
		category: "International SEO",
		tagline: "Validate hreflang tags for missing self-references and x-default.",
		description: "Checks a page's hreflang annotations for invalid language codes, missing self-reference, and missing x-default.",
		engine: "audit",
		source: "seo",
		idPrefixes: ["hreflang"],
		inputKind: "url",
	},
	{
		slug: "hreflang-generator",
		name: "Hreflang Tag Generator",
		shortName: "Hreflang Generator",
		category: "International SEO",
		tagline: "Generate a full hreflang tag block for your localized URLs.",
		description: "List each locale's URL and language code and get a complete, self-referencing hreflang <link> block, including x-default.",
		engine: "generator",
		generatorKind: "hreflang",
	},

	// ---- Performance ------------------------------------------------------
	{
		slug: "speed-signals-checker",
		name: "Website Speed Signals Checker",
		shortName: "Speed Checker",
		category: "Performance",
		tagline: "Page weight, render-blocking resources, compression, and cache headers — no API key needed.",
		description:
			"Checks HTML/response weight, render-blocking JS/CSS, compression (gzip/brotli), cache headers, and time-to-first-byte, all from a single fetch — no API key required.",
		engine: "audit",
		source: "speed",
		inputKind: "url",
	},
	{
		slug: "core-web-vitals-checker",
		name: "Core Web Vitals & PageSpeed Checker",
		shortName: "Core Web Vitals",
		category: "Performance",
		tagline: "Real Core Web Vitals (LCP, CLS, INP) via Google PageSpeed Insights.",
		description:
			"Runs a page through Google PageSpeed Insights for mobile and desktop, reporting lab and field LCP, CLS, and INP.",
		engine: "pagespeed",
		byok: "pagespeed",
		inputKind: "url",
	},

	// ---- Security & Trust ---------------------------------------------
	{
		slug: "security-headers-checker",
		name: "Security Headers & HTTPS Checker",
		shortName: "Security Headers",
		category: "Security & Trust",
		tagline: "Check HSTS, CSP, X-Frame-Options and other security headers, plus HTTPS usage.",
		description: "Fetches a page's response headers and checks for HSTS, Content-Security-Policy, X-Frame-Options, and other security headers, plus whether the page is served over HTTPS.",
		engine: "audit",
		source: "security",
		inputKind: "url",
	},
	{
		slug: "security-headers-generator",
		name: "Security Headers Generator",
		shortName: "Headers Generator",
		category: "Security & Trust",
		tagline: "Generate CSP, Permissions-Policy, Referrer-Policy, and a security.txt file.",
		description: "Build a Content-Security-Policy, Permissions-Policy, Referrer-Policy header, and a security.txt file from simple form fields.",
		engine: "generator",
		generatorKind: "security-headers",
	},

	// ---- Accessibility --------------------------------------------------
	{
		slug: "accessibility-checker",
		name: "Web Accessibility (WCAG) Checker",
		shortName: "Accessibility Checker",
		category: "Accessibility",
		tagline: "Check for missing labels, landmarks, language attributes and other WCAG basics.",
		description: "Scans a page for unlabeled form inputs, missing ARIA landmarks, missing lang attribute, and other common WCAG issues.",
		engine: "audit",
		source: "a11y",
		inputKind: "url",
	},
	{
		slug: "mobile-friendly-checker",
		name: "Mobile-Friendly Checker",
		shortName: "Mobile Checker",
		category: "Accessibility",
		tagline: "Check the viewport meta tag and pinch-zoom behavior.",
		description: "Checks whether a page declares a responsive viewport meta tag and whether pinch-to-zoom has been disabled.",
		engine: "audit",
		source: "seo",
		idPrefixes: ["mobile-viewport", "zoom-disabled"],
		inputKind: "url",
	},

	// ---- Tech & Metadata --------------------------------------------------
	{
		slug: "tech-stack-detector",
		name: "Website Technology / Framework Detector",
		shortName: "Tech Detector",
		category: "Tech & Metadata",
		tagline: "Detect the CMS, JS framework, and hosting stack behind any site.",
		description: "Fetches a page and its response headers and detects the CMS, JavaScript framework (React, Next.js, Astro, Vue...), and hosting/CDN signals in use.",
		engine: "audit",
		source: "stack",
		inputKind: "url",
	},
	{
		slug: "favicon-pwa-checker",
		name: "Favicon & PWA Manifest Checker",
		shortName: "Favicon Checker",
		category: "Tech & Metadata",
		tagline: "Check for a favicon and a valid web app manifest.",
		description: "Checks whether a page links a favicon and a web app manifest, and validates the manifest's required fields.",
		engine: "audit",
		source: "favicon",
		inputKind: "url",
	},

	// ---- AI / GEO / AEO -------------------------------------------------
	{
		slug: "ai-discoverability-checker",
		name: "AI Discoverability (GEO) Checker",
		shortName: "GEO Checker",
		category: "AI / GEO / AEO",
		tagline: "Check whether AI models can render, parse and trust your content (entity grounding, table structure, quotability).",
		description:
			"Runs OptiQra's GEO (generative engine optimization) audit: client-side rendering visibility, statistical density, attributed quotes, entity grounding, table structure, and sentence quotability.",
		engine: "audit",
		source: "geo",
		inputKind: "url",
	},
	{
		slug: "ai-citation-readiness-checker",
		name: "AI Citation Readiness (AEO) Checker",
		shortName: "AEO Checker",
		category: "AI / GEO / AEO",
		tagline: "Check whether your content is structured to be lifted directly into AI answers.",
		description:
			"Runs OptiQra's AEO (answer engine optimization) audit: FAQ/HowTo schema, question-style headings, author/freshness signals, llms.txt presence, and scannable structure.",
		engine: "audit",
		source: "aeo",
		inputKind: "url",
	},
	{
		slug: "ai-crawler-access-checker",
		name: "AI Crawler (GPTBot / ClaudeBot) Access Checker",
		shortName: "AI Crawler Checker",
		category: "AI / GEO / AEO",
		tagline: "Check whether GPTBot, ClaudeBot, PerplexityBot and Google-Extended can access your site.",
		description: "Checks robots.txt and firewall/network-level signals for whether major AI crawlers are allowed to access and index the page.",
		engine: "audit",
		source: "aeo",
		idPrefixes: ["aeo-ai-crawler"],
		inputKind: "url",
	},
	{
		slug: "llms-txt-generator",
		name: "llms.txt Generator",
		shortName: "llms.txt Generator",
		category: "AI / GEO / AEO",
		tagline: "Generate an llms.txt file describing your site for AI models — bring your own API key.",
		description:
			"Crawls your site's structure and uses an AI model (your API key, sent directly to your chosen provider) to draft an llms.txt file summarizing your site for AI crawlers.",
		engine: "ai",
		aiKind: "llms-txt",
		byok: "ai",
		inputKind: "url",
	},
	{
		slug: "ai-seo-fix-generator",
		name: "AI SEO Fix Generator",
		shortName: "AI Fix Generator",
		category: "AI / GEO / AEO",
		tagline: "Describe an SEO issue and get an AI-suggested fix — bring your own API key.",
		description:
			"Describe an SEO, accessibility, or performance issue and get a concrete, AI-generated fix using your own API key for OpenAI, Anthropic, Google, Groq, OpenRouter, Mistral, DeepSeek, or xAI.",
		engine: "ai",
		aiKind: "seo-fix",
		byok: "ai",
		inputKind: "text",
	},
];

export function getTool(slug: string): ToolDef | undefined {
	return TOOLS.find((t) => t.slug === slug);
}

export function toolsByCategory(): Record<string, ToolDef[]> {
	const map: Record<string, ToolDef[]> = {};
	for (const cat of CATEGORIES) map[cat] = [];
	for (const tool of TOOLS) {
		(map[tool.category] ||= []).push(tool);
	}
	return map;
}

/**
 * Map of "raw brainstorm name" -> tool slug it was folded into, for anyone
 * wondering where e.g. "Dead Link Checker" or "GEO Checker" ended up. Not
 * rendered anywhere critical — kept here as documentation of the curation
 * pass so it's easy to review/revisit later.
 */
export const DEDUPE_NOTES: Record<string, string> = {
	"LLMs-full.txt Generator": "llms-txt-generator (toggle)",
	"AI Bot Checker": "ai-crawler-access-checker",
	"AI Search Visibility Checker": "ai-discoverability-checker",
	"GEO Checker": "ai-discoverability-checker",
	"AEO Checker": "ai-citation-readiness-checker",
	"Website SEO Checker": "meta-tag-checker + content-seo-checker",
	"Free SEO Audit": "(use the full OptiQra scan)",
	"SEO Score Checker": "(use the full OptiQra scan)",
	"SEO Analyzer": "(use the full OptiQra scan)",
	"Website Analyzer": "(use the full OptiQra scan)",
	"Website Audit Tool": "(use the full OptiQra scan)",
	"Technical SEO Checker": "(use the full OptiQra scan)",
	"On-Page SEO Checker": "meta-tag-checker",
	"SEO Health Checker": "(use the full OptiQra scan)",
	"SEO Report Generator": "(use the full OptiQra scan)",
	"Meta Description Checker": "meta-tag-checker",
	"Meta Description Generator": "meta-tag-generator",
	"SEO Title Generator": "meta-tag-generator",
	"SEO Title Checker": "meta-tag-checker",
	"Title Tag Checker": "meta-tag-checker",
	"SERP Preview Tool": "meta-tag-generator",
	"Google SERP Simulator": "meta-tag-generator",
	"Search Snippet Preview": "meta-tag-generator",
	"SERP Snippet Generator": "meta-tag-generator",
	"Open Graph Generator": "meta-tag-generator",
	"Open Graph Checker": "meta-tag-checker",
	"Open Graph Preview": "meta-tag-generator",
	"OG Image Preview": "meta-tag-generator",
	"Twitter Card Generator": "meta-tag-generator",
	"Twitter Card Validator": "meta-tag-checker",
	"Social Media Preview": "meta-tag-generator",
	"Social Share Preview": "meta-tag-generator",
	"Canonical URL Checker": "meta-tag-checker",
	"Canonical Tag Generator": "meta-tag-generator",
	"Canonical URL Validator": "meta-tag-checker",
	"Robots.txt Tester": "robots-txt-checker",
	"Robots.txt Validator": "robots-txt-checker",
	"Robots.txt Parser": "robots-txt-checker",
	"Sitemap.xml Generator": "sitemap-generator",
	"XML Sitemap Validator": "sitemap-checker",
	"XML Sitemap Checker": "sitemap-checker",
	"Sitemap URL Extractor": "sitemap-checker",
	"Sitemap Analyzer": "sitemap-checker",
	"Sitemap Tester": "sitemap-checker",
	"Broken URL Checker": "broken-link-checker",
	"Dead Link Checker": "broken-link-checker",
	"Internal Link Checker": "broken-link-checker",
	"External Link Checker": "broken-link-checker",
	"Link Analyzer": "broken-link-checker",
	"Internal Linking Checker": "broken-link-checker",
	"Internal Link Analyzer": "broken-link-checker",
	"Anchor Text Checker": "broken-link-checker",
	"Anchor Text Analyzer": "broken-link-checker",
	"HTTP Redirect Checker": "redirect-status-checker",
	"Redirect Chain Checker": "redirect-status-checker",
	"Redirect Loop Checker": "redirect-status-checker",
	"301 Redirect Checker": "redirect-status-checker",
	"302 Redirect Checker": "redirect-status-checker",
	"HTTP Status Checker": "redirect-status-checker",
	"URL Status Checker": "redirect-status-checker",
	"URL Checker": "redirect-status-checker",
	"Nofollow Checker": "indexability-checker",
	"Meta Robots Checker": "indexability-checker",
	"X-Robots-Tag Checker": "indexability-checker",
	"Google Indexability Checker": "indexability-checker",
	"Crawlability Checker": "indexability-checker",
	"Crawl Budget Checker": "(no individual spot — needs a full crawl)",
	"SEO Crawler": "(use the full OptiQra scan)",
	"Website Crawler": "(use the full OptiQra scan)",
	"Website Crawl Analyzer": "(use the full OptiQra scan)",
	"Page Crawlability Checker": "indexability-checker",
	"HTML SEO Checker": "meta-tag-checker",
	"HTML Validator": "(out of scope — use the W3C validator)",
	"HTML Structure Checker": "heading-structure-checker",
	"Heading Structure Analyzer": "heading-structure-checker",
	"H1 Checker": "heading-structure-checker",
	"H1 Tag Checker": "heading-structure-checker",
	"H2 Checker": "heading-structure-checker",
	"Heading Analyzer": "heading-structure-checker",
	"Image SEO Checker": "image-optimization-checker",
	"Missing Alt Text Checker": "image-alt-text-checker",
	"Alt Text Generator": "ai-seo-fix-generator (describe the image)",
	"Image Accessibility Checker": "image-alt-text-checker",
	"Duplicate Page Checker": "duplicate-content-checker",
	"Duplicate URL Checker": "duplicate-content-checker",
	"Content Similarity Checker": "duplicate-content-checker",
	"SEO Content Analyzer": "content-seo-checker",
	"Content Structure Analyzer": "content-seo-checker",
	"Keyword Density Checker": "content-seo-checker",
	"Keyword Prominence Checker": "content-seo-checker",
	"Keyword Placement Checker": "content-seo-checker",
	"Word Count Checker": "content-seo-checker",
	"Readability Checker": "content-seo-checker",
	"Page Word Counter": "content-seo-checker",
	"Schema Generator": "schema-markup-generator",
	"JSON-LD Generator": "schema-markup-generator",
	"JSON-LD Validator": "structured-data-checker",
	"Structured Data Validator": "structured-data-checker",
	"Schema Markup Checker": "structured-data-checker",
	"Organization Schema Generator": "schema-markup-generator (type picker)",
	"Article Schema Generator": "schema-markup-generator (type picker)",
	"Product Schema Generator": "schema-markup-generator (type picker)",
	"Website Schema Generator": "schema-markup-generator (type picker)",
	"WebPage Schema Generator": "schema-markup-generator (type picker)",
	"Breadcrumb Schema Generator": "schema-markup-generator (type picker)",
	"SoftwareApplication Schema Generator": "schema-markup-generator (type picker)",
	"FAQ Schema Generator": "schema-markup-generator (type picker)",
	"Local Business Schema Generator": "schema-markup-generator (type picker)",
	"Person Schema Generator": "schema-markup-generator (type picker)",
	"Event Schema Generator": "schema-markup-generator (type picker)",
	"SEO Schema Checker": "structured-data-checker",
	"Breadcrumb Checker": "structured-data-checker",
	"Breadcrumb Validator": "structured-data-checker",
	"Breadcrumb Generator": "schema-markup-generator (type picker)",
	"Website Structure Analyzer": "(use the full OptiQra scan)",
	"Website Architecture Checker": "(use the full OptiQra scan)",
	"SEO Site Structure Analyzer": "(use the full OptiQra scan)",
	"URL Structure Checker": "content-seo-checker",
	"URL SEO Checker": "url-slug-generator",
	"SEO URL Generator": "url-slug-generator",
	"Slug Generator": "url-slug-generator",
	"URL Length Checker": "url-slug-generator",
	"URL Analyzer": "redirect-status-checker",
	"URL Parser": "redirect-status-checker",
	"URL Normalizer": "url-slug-generator",
	"HTTPS Checker": "security-headers-checker",
	"SSL Checker": "security-headers-checker",
	"SSL Certificate Checker": "security-headers-checker",
	"Mixed Content Checker": "security-headers-checker",
	"HTTP Headers Checker": "security-headers-checker",
	"HTTP Header Analyzer": "security-headers-checker",
	"Cache Header Checker": "speed-signals-checker",
	"Cache-Control Checker": "speed-signals-checker",
	"Compression Checker": "speed-signals-checker",
	"Gzip Checker": "speed-signals-checker",
	"Brotli Checker": "speed-signals-checker",
	"Content-Encoding Checker": "speed-signals-checker",
	"CSP Checker": "security-headers-checker",
	"CSP Generator": "security-headers-generator",
	"Content Security Policy Generator": "security-headers-generator",
	"Permissions Policy Generator": "security-headers-generator",
	"Referrer Policy Generator": "security-headers-generator",
	"Security.txt Generator": "security-headers-generator",
	"Website Performance Checker": "core-web-vitals-checker",
	"Page Speed Checker": "core-web-vitals-checker",
	"Website Speed Test": "core-web-vitals-checker",
	"Core Web Vitals Test": "core-web-vitals-checker",
	"LCP Checker": "core-web-vitals-checker",
	"CLS Checker": "core-web-vitals-checker",
	"INP Checker": "core-web-vitals-checker",
	"Largest Contentful Paint Checker": "core-web-vitals-checker",
	"Cumulative Layout Shift Checker": "core-web-vitals-checker",
	"Interaction to Next Paint Checker": "core-web-vitals-checker",
	"Render Blocking Resource Checker": "speed-signals-checker",
	"JavaScript Performance Checker": "speed-signals-checker",
	"CSS Performance Checker": "speed-signals-checker",
	"Image Optimization Checker (dup)": "image-optimization-checker",
	"Lazy Loading Checker": "image-alt-text-checker",
	"Font Loading Checker": "speed-signals-checker",
	"Third-Party Script Checker": "speed-signals-checker",
	"Mobile SEO Checker": "mobile-friendly-checker",
	"Responsive Website Checker": "mobile-friendly-checker",
	"Web Accessibility Checker": "accessibility-checker",
	"WCAG Checker": "accessibility-checker",
	"ARIA Checker": "accessibility-checker",
	"ARIA Validator": "accessibility-checker",
	"Semantic HTML Checker": "accessibility-checker",
	"Accessibility Audit": "accessibility-checker",
	"Website Accessibility Audit": "accessibility-checker",
	"Contrast Checker": "accessibility-checker",
	"Alt Attribute Checker": "image-alt-text-checker",
	"Language Attribute Checker": "accessibility-checker",
	"HTML Lang Attribute Checker": "accessibility-checker",
	"Website Technology Checker": "tech-stack-detector",
	"Tech Stack Detector": "tech-stack-detector",
	"Website Technology Lookup": "tech-stack-detector",
	"React Detector": "tech-stack-detector",
	"Next.js Detector": "tech-stack-detector",
	"Astro Detector": "tech-stack-detector",
	"Preact Detector": "tech-stack-detector",
	"JavaScript Framework Detector": "tech-stack-detector",
	"CMS Detector": "tech-stack-detector",
	"Website CMS Detector": "tech-stack-detector",
	"Website Metadata Extractor": "meta-tag-checker",
	"Website Information Extractor": "tech-stack-detector",
	"HTML Metadata Checker": "meta-tag-checker",
	"Website Source Analyzer": "tech-stack-detector",
	"Webpage Analyzer": "(use the full OptiQra scan)",
	"Webpage SEO Analyzer": "(use the full OptiQra scan)",
	"Page Analyzer": "(use the full OptiQra scan)",
	"SEO Page Analyzer": "(use the full OptiQra scan)",
	"Website Link Extractor": "broken-link-checker",
	"Sitemap Link Extractor": "sitemap-checker",
	"Website URL Extractor": "broken-link-checker",
	"Page Source Analyzer": "tech-stack-detector",
	"SEO Header Analyzer": "heading-structure-checker",
	"HTTP Header Checker": "security-headers-checker",
	"Response Header Checker": "security-headers-checker",
	"Content-Type Checker": "speed-signals-checker",
	"MIME Type Checker": "speed-signals-checker",
	"Doctype Checker": "(too minor for an individual spot)",
	"Charset Checker": "meta-tag-checker",
	"Encoding Checker": "meta-tag-checker",
	"Favicon Generator": "(image generation — out of scope)",
	"Web Manifest Checker": "favicon-pwa-checker",
	"PWA Checker": "favicon-pwa-checker",
	"PWA Audit": "favicon-pwa-checker",
	"Web App Manifest Generator": "(out of scope — copy a manifest.json template)",
	"Manifest Validator": "favicon-pwa-checker",
	"Open Graph Image Checker": "meta-tag-checker",
	"Favicon SEO Checker": "favicon-pwa-checker",
	"Social Metadata Checker": "meta-tag-checker",
	"Social Meta Tag Generator": "meta-tag-generator",
	"LinkedIn Preview": "meta-tag-generator",
	"Facebook Preview": "meta-tag-generator",
	"Discord Embed Preview": "meta-tag-generator",
	"Slack Link Preview": "meta-tag-generator",
	"X Card Preview": "meta-tag-generator",
	"Twitter Preview": "meta-tag-generator",
	"Website Preview Generator": "meta-tag-generator",
	"SEO Screenshot / SERP Preview": "meta-tag-generator",
	"International SEO Checker": "hreflang-checker",
	"Language Detection Tool": "tech-stack-detector",
	"Hreflang Sitemap Generator": "hreflang-generator",
	"Locale URL Checker": "hreflang-checker",
	"Country Code Checker": "hreflang-generator",
	"Language Code Checker": "hreflang-generator",
	"ISO Language Code Lookup": "(reference list — no individual spot)",
	"AI Content Crawler": "ai-crawler-access-checker",
	"AI Readiness Checker": "ai-discoverability-checker",
	"AI-Friendly Website Checker": "ai-discoverability-checker",
	"Machine Readability Checker": "ai-discoverability-checker",
	"Machine-Readable Website Checker": "ai-discoverability-checker",
	"AI Website Analyzer": "(use the full OptiQra scan)",
	"Generative Search Optimization Checker": "ai-discoverability-checker",
	"AI Visibility Audit": "(use the full OptiQra scan)",
	"ChatGPT Website Visibility Checker": "ai-crawler-access-checker",
	"Google AI Overview SEO Checker": "ai-citation-readiness-checker",
	"Perplexity SEO Checker": "ai-crawler-access-checker",
	"Claude SEO Checker": "ai-crawler-access-checker",
	"AI Bot Robots.txt Generator": "robots-txt-generator",
	"AI Crawler Robots.txt Generator": "robots-txt-generator",
	"GPTBot Checker": "ai-crawler-access-checker",
	"Google-Extended Checker": "ai-crawler-access-checker",
	"ClaudeBot Checker": "ai-crawler-access-checker",
	"PerplexityBot Checker": "ai-crawler-access-checker",
	"SEO Fix Generator": "ai-seo-fix-generator",
	"Robots.txt Fix Generator": "ai-seo-fix-generator",
	"Sitemap Fix Generator": "ai-seo-fix-generator",
	"Schema Fix Generator": "ai-seo-fix-generator",
	"Meta Tag Fix Generator": "ai-seo-fix-generator",
	"Canonical Fix Generator": "ai-seo-fix-generator",
	"Hreflang Fix Generator": "ai-seo-fix-generator",
	"SEO Recommendations Generator": "ai-seo-fix-generator",
	"Technical SEO Report Generator": "(use the full OptiQra scan)",
	"Website SEO Report": "(use the full OptiQra scan)",
	"SEO Checklist Generator": "(use the full OptiQra scan)",
	"Website SEO Checklist": "(use the full OptiQra scan)",
	"SEO Audit Report Generator": "(use the full OptiQra scan)",
	"Website Health Report": "(use the full OptiQra scan)",
	"Website Health Checker": "(use the full OptiQra scan)",
};
