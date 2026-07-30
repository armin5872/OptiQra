// Generates a starter sitemap.xml / robots.txt when the analyzer finds the
// site is missing one. Runs entirely client-side using data already
// collected during the scan (the crawled page list), so no extra network
// requests are needed.

function escapeXml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&apos;");
}

/** Builds a standards-compliant urlset sitemap from the pages the crawler
 *  already visited. Falls back to just the scanned URL for single-page scans. */
export function buildSitemapXml(siteUrl: string, pagesScanned?: string[]): string {
	const urls = pagesScanned && pagesScanned.length > 0 ? pagesScanned : [siteUrl];
	const today = new Date().toISOString().slice(0, 10);
	const entries = urls
		.map(
			(u) =>
				`  <url>\n    <loc>${escapeXml(u)}</loc>\n    <lastmod>${today}</lastmod>\n  </url>`,
		)
		.join("\n");

	return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`;
}

/** Builds a sensible default robots.txt that allows crawling and points at
 *  the site's sitemap. */
export function buildRobotsTxt(siteUrl: string): string {
	const origin = new URL(siteUrl).origin;
	return `User-agent: *\nAllow: /\n\nSitemap: ${origin}/sitemap.xml\n`;
}

/** Builds a bare-bones starter llms.txt (per the https://llmstxt.org
 *  convention) purely from pages the crawler already visited — no AI call
 *  involved. This is the always-available fallback that sits next to the
 *  AI-assisted generator, the same way buildSitemapXml/buildRobotsTxt are
 *  template-only. */
export function buildLlmsTxt(siteUrl: string, pagesScanned?: string[]): string {
	const origin = new URL(siteUrl).origin;
	let host: string;
	try {
		host = new URL(siteUrl).hostname.replace(/^www\./, "");
	} catch {
		host = origin;
	}

	const pages = (pagesScanned && pagesScanned.length > 0 ? pagesScanned : [siteUrl]).slice(0, 25);
	const links = pages
		.map((u) => {
			let label: string;
			try {
				const path = new URL(u).pathname.replace(/\/+$/, "");
				label = path === "" || path === "/" ? "Home" : path.slice(1);
			} catch {
				label = u;
			}
			return `- [${label}](${u})`;
		})
		.join("\n");

	return `# ${host}\n\n> Add a one or two sentence summary of what this site/product is and who it's for here.\n\n## Pages\n\n${links}\n\n## Notes\n\nThis is a starter file generated from the pages scanned during an OptiQra audit. Edit the summary above, prune or relabel links, and add any docs/API references AI assistants should know about. Learn more about this convention at https://llmstxt.org.\n`;
}
