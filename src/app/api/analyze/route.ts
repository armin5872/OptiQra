import { NextRequest, NextResponse } from "next/server";
import {
	fetchPage,
	analyzeSEO,
	analyzeSpeed,
	analyzeA11y,
	analyzeConversions,
	type Issue,
} from "@/lib/htmlAudit";
import { analyzeLinks } from "@/lib/link-analyzer";
import { analyzeImages } from "@/lib/image-analyzer";
import { analyzeSecurityHeaders } from "@/lib/securityHeadersAudit";
import { runPageSpeed } from "@/lib/pagespeed";
import {
	crawlSite,
	DEFAULT_MAX_PAGES,
	HARD_MAX_PAGES,
} from "@/lib/siteCrawler";
import { CheerioAPI, load } from "cheerio";

export const runtime = "nodejs";
export const maxDuration = 60;

type Category = {
	label: string;
	score: number;
	issues: Issue[];
	passed: Issue[];
	source: string;
	pagesAnalyzed?: number;
};

type PageCategoryResult = {
	url: string;
	score: number;
	issues: Issue[];
	passed: Issue[];
};

/** Merges the same category (e.g. "SEO") computed across many pages into one card:
 *  score is the average across pages, issues are grouped by id with the list of
 *  pages each one showed up on, and passed checks are deduped. */
function aggregateCategory(
	label: string,
	source: string,
	perPage: PageCategoryResult[],
): Category {
	if (perPage.length === 0) {
		return {
			label,
			score: 50,
			issues: [],
			passed: [],
			source,
			pagesAnalyzed: 0,
		};
	}

	const avgScore = Math.round(
		perPage.reduce((sum, p) => sum + p.score, 0) / perPage.length,
	);

	const issueGroups = new Map<string, Issue & { affectedPages: string[] }>();
	for (const p of perPage) {
		for (const iss of p.issues) {
			const existing = issueGroups.get(iss.id);
			if (existing) {
				existing.affectedPages.push(p.url);
			} else {
				issueGroups.set(iss.id, { ...iss, affectedPages: [p.url] });
			}
		}
	}

	const passed: Issue[] = [];
	const passedSeen = new Set<string>();
	for (const p of perPage) {
		for (const ps of p.passed) {
			if (issueGroups.has(ps.id) || passedSeen.has(ps.id)) continue;
			passedSeen.add(ps.id);
			passed.push(ps);
		}
	}

	const issues = Array.from(issueGroups.values())
		.sort((a, b) => b.weight - a.weight)
		.map((iss) => {
			const pageCount = iss.affectedPages.length;
			const suffix =
				pageCount > 1 ?
					` (found on ${pageCount} of ${perPage.length} pages scanned)`
				:	"";
			return { ...iss, detail: `${iss.detail}${suffix}` };
		});

	return {
		label,
		score: Math.max(20, Math.min(100, avgScore)),
		issues,
		passed,
		source,
		pagesAnalyzed: perPage.length,
	};
}

type ImagesRequestBody = {
	url: string;
	maxFileSizeBytes?: number;
	oversizeRatio?: number;
};

type LinksRequestBody = {
	url: string;
	externalLinkThreshold?: number;
	checkLinkStatuses?: boolean;
};

function validateRequestUrl(url: unknown) {
	if (!url || typeof url !== "string") {
		throw new Error("Missing required 'url' string in request body.");
	}
	try {
		return new URL(url).toString();
	} catch {
		throw new Error("Invalid URL.");
	}
}

export async function analyzeImagesRequest(body: ImagesRequestBody) {
	const targetUrl = validateRequestUrl(body?.url);
	return analyzeImages(targetUrl, {
		maxFileSizeBytes:
			typeof body.maxFileSizeBytes === "number" ?
				body.maxFileSizeBytes
			:	undefined,
		oversizeRatio:
			typeof body.oversizeRatio === "number" ? body.oversizeRatio : undefined,
	});
}

export async function analyzeLinksRequest(body: LinksRequestBody) {
	const targetUrl = validateRequestUrl(body?.url);
	return analyzeLinks(targetUrl, {
		externalLinkThreshold:
			typeof body.externalLinkThreshold === "number" ?
				body.externalLinkThreshold
			:	undefined,
		checkLinkStatuses: body.checkLinkStatuses !== false,
	});
}

export async function POST(req: NextRequest) {
	try {
		const { url, mode, maxPages } = await req.json();

		if (!url || typeof url !== "string") {
			return NextResponse.json({ error: "URL is required" }, { status: 400 });
		}

		// Validate URL format
		let targetUrl: string;
		try {
			targetUrl = new URL(url).toString();
		} catch {
			return NextResponse.json(
				{ error: "Invalid URL format" },
				{ status: 400 },
			);
		}

		if (mode === "site") {
			const normalizedMaxPages =
				typeof maxPages === "number" && Number.isFinite(maxPages) ?
					Math.min(1000, Math.max(1, Math.round(maxPages)))
				:	undefined;
			return runSiteCrawl(targetUrl, normalizedMaxPages);
		}

		const categories: Record<string, Category> = {};
		let lighthouseAvailable = false;

		// 1. Fetch page content
		let $: CheerioAPI;
		let html: string;
		let response: Response;
		let elapsedMs: number;

		try {
			const fetchResult = await fetchPage(targetUrl);
			$ = load(fetchResult.html);
			html = fetchResult.html;
			response = fetchResult.response;
			elapsedMs = fetchResult.elapsedMs;
		} catch (error: any) {
			return NextResponse.json(
				{ error: `Failed to fetch page: ${error.message}` },
				{ status: 400 },
			);
		}

		// 2. Analyze Security Headers
		try {
			const securityResult = await analyzeSecurityHeaders(targetUrl);
			const secScore =
				100 - securityResult.issues.reduce((sum, i) => sum + i.weight, 0);
			categories["security"] = {
				label: "Security Headers",
				score: Math.max(20, Math.min(100, secScore)),
				issues: securityResult.issues,
				passed: securityResult.passed,
				source: "security-headers-audit",
			};
		} catch (error) {
			console.warn("Security headers audit failed:", error);
			categories["security"] = {
				label: "Security Headers",
				score: 50,
				issues: [],
				passed: [],
				source: "security-headers-audit",
			};
		}

		// 3. Analyze SEO
		try {
			const seoResult = await analyzeSEO($, html, targetUrl);
			const seoScore =
				100 - seoResult.issues.reduce((sum, i) => sum + i.weight, 0);
			categories["seo"] = {
				label: "SEO",
				score: Math.max(20, Math.min(100, seoScore)),
				issues: seoResult.issues,
				passed: seoResult.passed,
				source: "html-audit",
			};
		} catch (error) {
			console.warn("SEO audit failed:", error);
			categories["seo"] = {
				label: "SEO",
				score: 50,
				issues: [],
				passed: [],
				source: "html-audit",
			};
		}

		// 4. Analyze Page Speed (local checks)
		try {
			const speedResult = analyzeSpeed($, html, response, elapsedMs);
			const speedScore =
				100 - speedResult.issues.reduce((sum, i) => sum + i.weight, 0);
			categories["speed"] = {
				label: "Performance",
				score: Math.max(20, Math.min(100, speedScore)),
				issues: speedResult.issues,
				passed: speedResult.passed,
				source: "html-audit",
			};
		} catch (error) {
			console.warn("Speed audit failed:", error);
			categories["speed"] = {
				label: "Performance",
				score: 50,
				issues: [],
				passed: [],
				source: "html-audit",
			};
		}

		// 5. Analyze Accessibility
		try {
			const a11yResult = analyzeA11y($);
			const a11yScore =
				100 - a11yResult.issues.reduce((sum, i) => sum + i.weight, 0);
			categories["a11y"] = {
				label: "Accessibility",
				score: Math.max(20, Math.min(100, a11yScore)),
				issues: a11yResult.issues,
				passed: a11yResult.passed,
				source: "html-audit",
			};
		} catch (error) {
			console.warn("A11y audit failed:", error);
			categories["a11y"] = {
				label: "Accessibility",
				score: 50,
				issues: [],
				passed: [],
				source: "html-audit",
			};
		}

		// 6. Analyze Conversions
		try {
			const convResult = analyzeConversions($, html);
			const convScore =
				100 - convResult.issues.reduce((sum, i) => sum + i.weight, 0);
			categories["conversions"] = {
				label: "Conversions",
				score: Math.max(20, Math.min(100, convScore)),
				issues: convResult.issues,
				passed: convResult.passed,
				source: "html-audit",
			};
		} catch (error) {
			console.warn("Conversions audit failed:", error);
			categories["conversions"] = {
				label: "Conversions",
				score: 50,
				issues: [],
				passed: [],
				source: "html-audit",
			};
		}

		// 7. Try to run PageSpeed Insights (optional, requires API key)
		try {
			const psiResult = await runPageSpeed(targetUrl);
			if (psiResult.speed) {
				categories["psi-speed"] = {
					label: "PageSpeed Insights - Performance",
					score: psiResult.speed.score || 50,
					issues: psiResult.speed.issues || [],
					passed: psiResult.speed.passed || [],
					source: "pagespeed-insights",
				};
			}
			if (psiResult.a11y) {
				categories["psi-a11y"] = {
					label: "PageSpeed Insights - Accessibility",
					score: psiResult.a11y.score || 50,
					issues: psiResult.a11y.issues || [],
					passed: psiResult.a11y.passed || [],
					source: "pagespeed-insights",
				};
			}
			if (psiResult.seo) {
				categories["psi-seo"] = {
					label: "PageSpeed Insights - SEO",
					score: psiResult.seo.score || 50,
					issues: psiResult.seo.issues || [],
					passed: psiResult.seo.passed || [],
					source: "pagespeed-insights",
				};
			}
			if (psiResult.bestPractices) {
				categories["psi-bp"] = {
					label: "PageSpeed Insights - Best Practices",
					score: psiResult.bestPractices.score || 50,
					issues: psiResult.bestPractices.issues || [],
					passed: psiResult.bestPractices.passed || [],
					source: "pagespeed-insights",
				};
			}
			lighthouseAvailable = true;
		} catch (error) {
			console.warn(
				"PageSpeed Insights audit skipped (API key not configured):",
				error,
			);
		}

		return NextResponse.json({
			url: targetUrl,
			categories,
			lighthouseAvailable,
			timestamp: new Date().toISOString(),
		});
	} catch (error: any) {
		console.error("Analyze endpoint error:", error);
		return NextResponse.json(
			{ error: error.message || "Internal server error" },
			{ status: 500 },
		);
	}
}

async function runSiteCrawl(targetUrl: string, requestedMaxPages?: number) {
	const maxPages = Math.max(
		1,
		Math.min(requestedMaxPages ?? DEFAULT_MAX_PAGES, HARD_MAX_PAGES),
	);

	const crawl = await crawlSite(targetUrl, { maxPages });

	if (crawl.pages.length === 0) {
		return NextResponse.json(
			{
				error:
					"Couldn't reach any pages on that site. Check the URL and make sure the site is publicly accessible.",
			},
			{ status: 400 },
		);
	}

	const seoPerPage: PageCategoryResult[] = [];
	const speedPerPage: PageCategoryResult[] = [];
	const a11yPerPage: PageCategoryResult[] = [];
	const convPerPage: PageCategoryResult[] = [];

	for (let i = 0; i < crawl.pages.length; i++) {
		const page = crawl.pages[i];
		const $ = load(page.html);

		try {
			const result = await analyzeSEO($, page.html, page.url, {
				includeCrawlFiles: i === 0, // robots.txt / sitemap only need checking once per site
			});
			const score =
				100 - result.issues.reduce((sum, iss) => sum + iss.weight, 0);
			seoPerPage.push({
				url: page.url,
				score: Math.max(20, Math.min(100, score)),
				issues: result.issues,
				passed: result.passed,
			});
		} catch (error) {
			console.warn(`SEO audit failed for ${page.url}:`, error);
		}

		try {
			const result = analyzeSpeed($, page.html, page.response, page.elapsedMs);
			const score =
				100 - result.issues.reduce((sum, iss) => sum + iss.weight, 0);
			speedPerPage.push({
				url: page.url,
				score: Math.max(20, Math.min(100, score)),
				issues: result.issues,
				passed: result.passed,
			});
		} catch (error) {
			console.warn(`Speed audit failed for ${page.url}:`, error);
		}

		try {
			const result = analyzeA11y($);
			const score =
				100 - result.issues.reduce((sum, iss) => sum + iss.weight, 0);
			a11yPerPage.push({
				url: page.url,
				score: Math.max(20, Math.min(100, score)),
				issues: result.issues,
				passed: result.passed,
			});
		} catch (error) {
			console.warn(`Accessibility audit failed for ${page.url}:`, error);
		}

		try {
			const result = analyzeConversions($, page.html);
			const score =
				100 - result.issues.reduce((sum, iss) => sum + iss.weight, 0);
			convPerPage.push({
				url: page.url,
				score: Math.max(20, Math.min(100, score)),
				issues: result.issues,
				passed: result.passed,
			});
		} catch (error) {
			console.warn(`Conversions audit failed for ${page.url}:`, error);
		}
	}

	const categories: Record<string, Category> = {
		seo: aggregateCategory("SEO", "html-audit", seoPerPage),
		speed: aggregateCategory("Performance", "html-audit", speedPerPage),
		a11y: aggregateCategory("Accessibility", "html-audit", a11yPerPage),
		conversions: aggregateCategory("Conversions", "html-audit", convPerPage),
	};

	// Security headers are effectively a server/site-wide config, so check the
	// homepage only rather than once per crawled page.
	try {
		const securityResult = await analyzeSecurityHeaders(targetUrl);
		const secScore =
			100 - securityResult.issues.reduce((sum, i) => sum + i.weight, 0);
		categories["security"] = {
			label: "Security Headers",
			score: Math.max(20, Math.min(100, secScore)),
			issues: securityResult.issues,
			passed: securityResult.passed,
			source: "security-headers-audit",
		};
	} catch (error) {
		console.warn("Security headers audit failed:", error);
		categories["security"] = {
			label: "Security Headers",
			score: 50,
			issues: [],
			passed: [],
			source: "security-headers-audit",
		};
	}

	let lighthouseAvailable = false;
	try {
		const psiResult = await runPageSpeed(targetUrl);
		if (psiResult.speed) {
			categories["psi-speed"] = {
				label: "PageSpeed Insights - Performance (homepage)",
				score: psiResult.speed.score || 50,
				issues: psiResult.speed.issues || [],
				passed: psiResult.speed.passed || [],
				source: "pagespeed-insights",
			};
		}
		if (psiResult.a11y) {
			categories["psi-a11y"] = {
				label: "PageSpeed Insights - Accessibility (homepage)",
				score: psiResult.a11y.score || 50,
				issues: psiResult.a11y.issues || [],
				passed: psiResult.a11y.passed || [],
				source: "pagespeed-insights",
			};
		}
		if (psiResult.seo) {
			categories["psi-seo"] = {
				label: "PageSpeed Insights - SEO (homepage)",
				score: psiResult.seo.score || 50,
				issues: psiResult.seo.issues || [],
				passed: psiResult.seo.passed || [],
				source: "pagespeed-insights",
			};
		}
		if (psiResult.bestPractices) {
			categories["psi-bp"] = {
				label: "PageSpeed Insights - Best Practices (homepage)",
				score: psiResult.bestPractices.score || 50,
				issues: psiResult.bestPractices.issues || [],
				passed: psiResult.bestPractices.passed || [],
				source: "pagespeed-insights",
			};
		}
		lighthouseAvailable = true;
	} catch (error) {
		console.warn(
			"PageSpeed Insights audit skipped (API key not configured):",
			error,
		);
	}

	return NextResponse.json({
		url: targetUrl,
		mode: "site",
		categories,
		lighthouseAvailable,
		pagesScanned: crawl.pages.map((p) => p.url),
		pagesSkipped: crawl.skipped,
		crawlSource: crawl.source,
		crawlTruncated: crawl.truncated,
		maxPages,
		timestamp: new Date().toISOString(),
	});
}
