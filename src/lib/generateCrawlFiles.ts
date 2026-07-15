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
