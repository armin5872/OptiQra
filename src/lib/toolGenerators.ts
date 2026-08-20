/**
 * Pure, client-safe generator functions for the standalone "generator"
 * tool pages (optiqra.vercel.app/tools/<slug>). No network calls, no
 * server dependency — everything here runs in the browser.
 */

// ---------------------------------------------------------------------------
// Meta tags / Open Graph / Twitter Card
// ---------------------------------------------------------------------------

export interface MetaTagInput {
	title: string;
	description: string;
	url: string;
	siteName?: string;
	imageUrl?: string;
	twitterHandle?: string;
	locale?: string;
}

export function generateMetaTags(input: MetaTagInput): string {
	const lines: string[] = [];
	if (input.title) lines.push(`<title>${escapeHtml(input.title)}</title>`);
	if (input.description) lines.push(`<meta name="description" content="${escapeHtml(input.description)}" />`);
	if (input.url) lines.push(`<link rel="canonical" href="${escapeHtml(input.url)}" />`);
	lines.push("");
	lines.push("<!-- Open Graph -->");
	if (input.title) lines.push(`<meta property="og:title" content="${escapeHtml(input.title)}" />`);
	if (input.description) lines.push(`<meta property="og:description" content="${escapeHtml(input.description)}" />`);
	lines.push(`<meta property="og:type" content="website" />`);
	if (input.url) lines.push(`<meta property="og:url" content="${escapeHtml(input.url)}" />`);
	if (input.siteName) lines.push(`<meta property="og:site_name" content="${escapeHtml(input.siteName)}" />`);
	if (input.imageUrl) lines.push(`<meta property="og:image" content="${escapeHtml(input.imageUrl)}" />`);
	if (input.locale) lines.push(`<meta property="og:locale" content="${escapeHtml(input.locale)}" />`);
	lines.push("");
	lines.push("<!-- Twitter Card -->");
	lines.push(`<meta name="twitter:card" content="${input.imageUrl ? "summary_large_image" : "summary"}" />`);
	if (input.twitterHandle) lines.push(`<meta name="twitter:site" content="${escapeHtml(normalizeHandle(input.twitterHandle))}" />`);
	if (input.title) lines.push(`<meta name="twitter:title" content="${escapeHtml(input.title)}" />`);
	if (input.description) lines.push(`<meta name="twitter:description" content="${escapeHtml(input.description)}" />`);
	if (input.imageUrl) lines.push(`<meta name="twitter:image" content="${escapeHtml(input.imageUrl)}" />`);
	return lines.join("\n");
}

function normalizeHandle(h: string) {
	const trimmed = h.trim();
	return trimmed.startsWith("@") ? trimmed : `@${trimmed}`;
}

export function metaTagWarnings(input: MetaTagInput): string[] {
	const warnings: string[] = [];
	if (input.title && (input.title.length < 10 || input.title.length > 60)) {
		warnings.push(`Title is ${input.title.length} characters — aim for roughly 50–60.`);
	}
	if (input.description && (input.description.length < 50 || input.description.length > 160)) {
		warnings.push(`Description is ${input.description.length} characters — aim for roughly 120–160.`);
	}
	if (!input.imageUrl) warnings.push("No image set — social shares will show a plain link card.");
	return warnings;
}

// ---------------------------------------------------------------------------
// Schema.org / JSON-LD
// ---------------------------------------------------------------------------

export type SchemaType =
	| "Organization"
	| "Article"
	| "Product"
	| "WebSite"
	| "WebPage"
	| "BreadcrumbList"
	| "SoftwareApplication"
	| "FAQPage"
	| "LocalBusiness"
	| "Person"
	| "Event";

export const SCHEMA_TYPES: { value: SchemaType; label: string; fields: { key: string; label: string; placeholder?: string; type?: "text" | "url" | "textarea" | "list" }[] }[] = [
	{
		value: "Organization",
		label: "Organization",
		fields: [
			{ key: "name", label: "Name" },
			{ key: "url", label: "URL", type: "url" },
			{ key: "logo", label: "Logo URL", type: "url" },
			{ key: "sameAs", label: "Social/reference profile URLs (one per line)", type: "list" },
		],
	},
	{
		value: "Article",
		label: "Article",
		fields: [
			{ key: "headline", label: "Headline" },
			{ key: "author", label: "Author name" },
			{ key: "datePublished", label: "Date published (YYYY-MM-DD)" },
			{ key: "image", label: "Image URL", type: "url" },
			{ key: "url", label: "Article URL", type: "url" },
		],
	},
	{
		value: "Product",
		label: "Product",
		fields: [
			{ key: "name", label: "Product name" },
			{ key: "description", label: "Description", type: "textarea" },
			{ key: "image", label: "Image URL", type: "url" },
			{ key: "brand", label: "Brand" },
			{ key: "price", label: "Price" },
			{ key: "priceCurrency", label: "Currency (e.g. USD)" },
		],
	},
	{
		value: "WebSite",
		label: "WebSite",
		fields: [
			{ key: "name", label: "Site name" },
			{ key: "url", label: "URL", type: "url" },
		],
	},
	{
		value: "WebPage",
		label: "WebPage",
		fields: [
			{ key: "name", label: "Page title" },
			{ key: "description", label: "Description", type: "textarea" },
			{ key: "url", label: "URL", type: "url" },
		],
	},
	{
		value: "BreadcrumbList",
		label: "Breadcrumb",
		fields: [{ key: "items", label: "Breadcrumb items — one per line, as \"Name | URL\"", type: "list" }],
	},
	{
		value: "SoftwareApplication",
		label: "SoftwareApplication",
		fields: [
			{ key: "name", label: "App name" },
			{ key: "applicationCategory", label: "Category (e.g. DeveloperApplication)" },
			{ key: "operatingSystem", label: "Operating system" },
			{ key: "price", label: "Price (0 for free)" },
		],
	},
	{
		value: "FAQPage",
		label: "FAQ",
		fields: [{ key: "items", label: "Q&A pairs — one per line, as \"Question | Answer\"", type: "list" }],
	},
	{
		value: "LocalBusiness",
		label: "LocalBusiness",
		fields: [
			{ key: "name", label: "Business name" },
			{ key: "streetAddress", label: "Street address" },
			{ key: "addressLocality", label: "City" },
			{ key: "addressRegion", label: "State/region" },
			{ key: "postalCode", label: "Postal code" },
			{ key: "telephone", label: "Phone" },
		],
	},
	{
		value: "Person",
		label: "Person",
		fields: [
			{ key: "name", label: "Name" },
			{ key: "url", label: "URL", type: "url" },
			{ key: "jobTitle", label: "Job title" },
			{ key: "sameAs", label: "Social/reference profile URLs (one per line)", type: "list" },
		],
	},
	{
		value: "Event",
		label: "Event",
		fields: [
			{ key: "name", label: "Event name" },
			{ key: "startDate", label: "Start date (YYYY-MM-DD)" },
			{ key: "endDate", label: "End date (YYYY-MM-DD)" },
			{ key: "locationName", label: "Location name" },
		],
	},
];

export function generateSchema(type: SchemaType, fields: Record<string, string>): string {
	const base: Record<string, unknown> = { "@context": "https://schema.org", "@type": type };

	switch (type) {
		case "Organization":
		case "Person":
			Object.assign(base, {
				name: fields.name,
				url: fields.url || undefined,
				...(type === "Organization" ? { logo: fields.logo || undefined } : { jobTitle: fields.jobTitle || undefined }),
				sameAs: splitLines(fields.sameAs),
			});
			break;
		case "Article":
			Object.assign(base, {
				headline: fields.headline,
				author: fields.author ? { "@type": "Person", name: fields.author } : undefined,
				datePublished: fields.datePublished || undefined,
				image: fields.image || undefined,
				mainEntityOfPage: fields.url ? { "@type": "WebPage", "@id": fields.url } : undefined,
			});
			break;
		case "Product":
			Object.assign(base, {
				name: fields.name,
				description: fields.description || undefined,
				image: fields.image || undefined,
				brand: fields.brand ? { "@type": "Brand", name: fields.brand } : undefined,
				offers: fields.price
					? { "@type": "Offer", price: fields.price, priceCurrency: fields.priceCurrency || "USD" }
					: undefined,
			});
			break;
		case "WebSite":
			Object.assign(base, { name: fields.name, url: fields.url || undefined });
			break;
		case "WebPage":
			Object.assign(base, { name: fields.name, description: fields.description || undefined, url: fields.url || undefined });
			break;
		case "BreadcrumbList": {
			const items = splitLines(fields.items).map((line, i) => {
				const [name, url] = line.split("|").map((s) => s.trim());
				return { "@type": "ListItem", position: i + 1, name: name || line, item: url || undefined };
			});
			Object.assign(base, { itemListElement: items });
			break;
		}
		case "SoftwareApplication":
			Object.assign(base, {
				name: fields.name,
				applicationCategory: fields.applicationCategory || undefined,
				operatingSystem: fields.operatingSystem || undefined,
				offers: fields.price ? { "@type": "Offer", price: fields.price, priceCurrency: "USD" } : undefined,
			});
			break;
		case "FAQPage": {
			const items = splitLines(fields.items).map((line) => {
				const [q, a] = line.split("|").map((s) => s.trim());
				return { "@type": "Question", name: q || line, acceptedAnswer: { "@type": "Answer", text: a || "" } };
			});
			Object.assign(base, { mainEntity: items });
			break;
		}
		case "LocalBusiness":
			Object.assign(base, {
				name: fields.name,
				telephone: fields.telephone || undefined,
				address: {
					"@type": "PostalAddress",
					streetAddress: fields.streetAddress || undefined,
					addressLocality: fields.addressLocality || undefined,
					addressRegion: fields.addressRegion || undefined,
					postalCode: fields.postalCode || undefined,
				},
			});
			break;
		case "Event":
			Object.assign(base, {
				name: fields.name,
				startDate: fields.startDate || undefined,
				endDate: fields.endDate || undefined,
				location: fields.locationName ? { "@type": "Place", name: fields.locationName } : undefined,
			});
			break;
	}

	const cleaned = JSON.parse(JSON.stringify(base, (_k, v) => (v === undefined || v === "" ? undefined : v)));
	return `<script type="application/ld+json">\n${JSON.stringify(cleaned, null, 2)}\n</script>`;
}

// ---------------------------------------------------------------------------
// robots.txt
// ---------------------------------------------------------------------------

export interface RobotsGeneratorInput {
	disallowPaths: string[];
	sitemapUrl?: string;
	allowSearchBots: boolean;
	allowedAiBots: string[]; // subset of AI_BOT_NAMES the user wants to ALLOW
}

export const AI_BOT_NAMES = ["GPTBot", "ClaudeBot", "PerplexityBot", "Google-Extended", "CCBot", "anthropic-ai", "OAI-SearchBot"];

export function generateRobotsTxt(input: RobotsGeneratorInput): string {
	const lines: string[] = [];
	lines.push("User-agent: *");
	if (input.allowSearchBots && input.disallowPaths.length === 0) {
		lines.push("Disallow:");
	} else {
		for (const p of input.disallowPaths) lines.push(`Disallow: ${p}`);
		if (!input.allowSearchBots) lines.push("Disallow: /");
	}
	lines.push("");

	for (const bot of AI_BOT_NAMES) {
		lines.push(`User-agent: ${bot}`);
		lines.push(input.allowedAiBots.includes(bot) ? "Allow: /" : "Disallow: /");
		lines.push("");
	}

	if (input.sitemapUrl) {
		lines.push(`Sitemap: ${input.sitemapUrl}`);
	}
	return lines.join("\n").trim() + "\n";
}

// ---------------------------------------------------------------------------
// XML Sitemap
// ---------------------------------------------------------------------------

export function generateSitemapXml(urls: string[]): string {
	const today = new Date().toISOString().slice(0, 10);
	const entries = urls
		.map((u) => u.trim())
		.filter(Boolean)
		.map((u) => `  <url>\n    <loc>${escapeXml(u)}</loc>\n    <lastmod>${today}</lastmod>\n  </url>`)
		.join("\n");
	return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`;
}

// ---------------------------------------------------------------------------
// hreflang
// ---------------------------------------------------------------------------

export interface HreflangEntry {
	lang: string;
	url: string;
}

export function generateHreflangTags(entries: HreflangEntry[], includeXDefault: boolean, xDefaultUrl?: string): string {
	const lines = entries
		.filter((e) => e.lang && e.url)
		.map((e) => `<link rel="alternate" hreflang="${escapeHtml(e.lang)}" href="${escapeHtml(e.url)}" />`);
	if (includeXDefault && (xDefaultUrl || entries[0]?.url)) {
		lines.push(`<link rel="alternate" hreflang="x-default" href="${escapeHtml(xDefaultUrl || entries[0].url)}" />`);
	}
	return lines.join("\n");
}

// ---------------------------------------------------------------------------
// URL slug
// ---------------------------------------------------------------------------

export function generateSlug(title: string): { slug: string; warnings: string[] } {
	const slug = title
		.toLowerCase()
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[^a-z0-9\s-]/g, "")
		.trim()
		.replace(/[\s_]+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "");
	const warnings: string[] = [];
	if (slug.length > 75) warnings.push(`Slug is ${slug.length} characters — consider trimming to under ~75 for readability.`);
	if (slug.split("-").length > 8) warnings.push("Slug has a lot of words — shorter slugs tend to perform better in search results.");
	return { slug, warnings };
}

// ---------------------------------------------------------------------------
// Security headers
// ---------------------------------------------------------------------------

export interface SecurityHeadersInput {
	allowedScriptSrc: string[];
	allowedImageSrc: string[];
	allowFrames: boolean;
	securityContact: string; // email or URL, for security.txt
}

export function generateCSP(input: SecurityHeadersInput): string {
	const scriptSrc = ["'self'", ...input.allowedScriptSrc].join(" ");
	const imgSrc = ["'self'", "data:", ...input.allowedImageSrc].join(" ");
	const frameAncestors = input.allowFrames ? "'self'" : "'none'";
	return [
		`default-src 'self';`,
		`script-src ${scriptSrc};`,
		`style-src 'self' 'unsafe-inline';`,
		`img-src ${imgSrc};`,
		`font-src 'self';`,
		`connect-src 'self';`,
		`frame-ancestors ${frameAncestors};`,
		`base-uri 'self';`,
		`object-src 'none';`,
	].join("\n");
}

export function generatePermissionsPolicy(): string {
	return ["camera=()", "microphone=()", "geolocation=(self)", "interest-cohort=()"].join(", ");
}

export function generateReferrerPolicy(): string {
	return "strict-origin-when-cross-origin";
}

export function generateSecurityTxt(input: SecurityHeadersInput): string {
	const expires = new Date();
	expires.setFullYear(expires.getFullYear() + 1);
	return [
		`Contact: ${input.securityContact || "mailto:security@example.com"}`,
		`Expires: ${expires.toISOString().split(".")[0]}Z`,
		`Preferred-Languages: en`,
	].join("\n");
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function escapeHtml(s: string): string {
	return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function escapeXml(s: string): string {
	return escapeHtml(s);
}

function splitLines(s?: string): string[] {
	return (s || "")
		.split("\n")
		.map((l) => l.trim())
		.filter(Boolean);
}
