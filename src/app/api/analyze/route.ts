import { NextRequest, NextResponse } from "next/server";
import {
	fetchPage,
	analyzeSEO,
	analyzeSpeed,
	analyzeA11y,
	analyzeConversions,
	type Issue,
} from "@/lib/htmlAudit";
import { analyzeAEO, analyzeAEOSiteSignals } from "@/lib/aeoAudit";
import { analyzeGEO } from "@/lib/geoAudit";
import { renderPageJs, analyzeJsRendering } from "@/lib/jsRenderer";
import {
	analyzeLinks,
	buildLinkIssues,
	findBrokenLinksAcrossSite,
} from "@/lib/link-analyzer";
import { analyzeDuplicateContent } from "@/lib/duplicateContentAudit";
import { analyzeImages } from "@/lib/image-analyzer";
import { analyzeSecurityHeaders } from "@/lib/securityHeadersAudit";
import { runPageSpeed } from "@/lib/pagespeed";
import {
	crawlSite,
	DEFAULT_MAX_PAGES,
	HARD_MAX_PAGES,
} from "@/lib/siteCrawler";
import { CheerioAPI, load } from "cheerio";
import { assertSafeUrl, UnsafeUrlError } from "@/lib/urlSafety";
import {
	aggregateCategory,
	type Category,
	type PageCategoryResult,
	type PageNode,
} from "@/lib/reportAggregate";

export const runtime = "nodejs";
// Site scans can now go up to 1000 pages, which won't finish in the default 60s.
// 300s is the max allowed on Vercel Pro; on Hobby this is capped back down to 60s
// by the platform regardless of what's set here. Long custom scans are still
// "best effort" within whatever the hosting plan allows.
export const maxDuration = 300;

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

async function validateRequestUrl(url: unknown) {
	if (!url || typeof url !== "string") {
		throw new Error("Missing required 'url' string in request body.");
	}
	return assertSafeUrl(url);
}

export async function analyzeImagesRequest(body: ImagesRequestBody) {
	const targetUrl = await validateRequestUrl(body?.url);
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
	const targetUrl = await validateRequestUrl(body?.url);
	return analyzeLinks(targetUrl, {
		externalLinkThreshold:
			typeof body.externalLinkThreshold === "number" ?
				body.externalLinkThreshold
			:	undefined,
		checkLinkStatuses: body.checkLinkStatuses !== false,
	});
}

function throwIfAborted(signal?: AbortSignal) {
	if (signal?.aborted) {
		throw new DOMException("Scan stopped by user.", "AbortError");
	}
}

export async function POST(req: NextRequest) {
	let url: unknown,
		mode: unknown,
		maxPages: unknown,
		concurrency: unknown,
		maxDepth: unknown,
		renderJs: unknown;
	let excludeUrls: unknown;
	let priorPageNodes: unknown;
	try {
		({
			url,
			mode,
			maxPages,
			concurrency,
			maxDepth,
			excludeUrls,
			priorPageNodes,
			renderJs,
		} = await req.json());
	} catch {
		return NextResponse.json(
			{ error: "Invalid request body" },
			{ status: 400 },
		);
	}

	if (!url || typeof url !== "string") {
		return NextResponse.json({ error: "URL is required" }, { status: 400 });
	}

	// Validate URL format and make sure it isn't pointing at an internal/
	// private address (SSRF guard) before we let the crawler anywhere near it.
	let targetUrl: string;
	try {
		targetUrl = await assertSafeUrl(url);
	} catch (err) {
		const message =
			err instanceof UnsafeUrlError ? err.message : "Invalid URL format";
		return NextResponse.json({ error: message }, { status: 400 });
	}

	const shouldRenderJs = renderJs === true;

	if (mode === "site") {
		return streamSiteCrawl(
			targetUrl,
			typeof maxPages === "number" ? maxPages : undefined,
			req.signal,
			typeof concurrency === "number" ? concurrency : undefined,
			typeof maxDepth === "number" ? maxDepth : undefined,
			Array.isArray(excludeUrls) ?
				excludeUrls.filter((u): u is string => typeof u === "string")
			:	undefined,
			Array.isArray(priorPageNodes) ? (priorPageNodes as PageNode[]) : undefined,
			shouldRenderJs,
		);
	}

	return runSinglePageScan(targetUrl, req.signal, shouldRenderJs);
}

async function runSinglePageScan(
	targetUrl: string,
	signal: AbortSignal,
	renderJs = false,
) {
	try {
		const categories: Record<string, Category> = {};
		let lighthouseAvailable = false;

		// 1. Fetch page content
		let $: CheerioAPI;
		let html: string;
		let response: Response;
		let elapsedMs: number;

		try {
			const fetchResult = await fetchPage(targetUrl, { signal });
			$ = load(fetchResult.html);
			html = fetchResult.html;
			response = fetchResult.response;
			elapsedMs = fetchResult.elapsedMs;
		} catch (error: any) {
			if (error?.name === "AbortError") {
				return NextResponse.json(
					{ error: "Scan stopped by user." },
					{ status: 499 },
				);
			}
			return NextResponse.json(
				{ error: `Failed to fetch page: ${error.message}` },
				{ status: 400 },
			);
		}

		throwIfAborted(signal);

		// 1b. Optionally execute the page's JavaScript in a sandboxed DOM so the
		// content-based audits below see the same fully-hydrated page a real
		// visitor would, instead of only the raw server response. `$`/`html`
		// stay pointed at the raw fetch throughout — analyzeGEO's renderability
		// check specifically needs the *raw* baseline to compare rendered
		// content against, so only a separate `$rendered`/`renderedHtml` pair
		// gets swapped in for the other, content-hungry audits.
		let $rendered: CheerioAPI | undefined;
		let renderedHtml: string | undefined;
		let renderedText: string | undefined;
		if (renderJs) {
			try {
				const renderResult = await renderPageJs(targetUrl, html, { signal });
				renderedHtml = renderResult.html;
				renderedText = renderResult.text;
				$rendered = load(renderResult.html);
				const jsRenderAudit = analyzeJsRendering(renderResult);
				const jsRenderScore =
					100 - jsRenderAudit.issues.reduce((sum, i) => sum + i.weight, 0);
				categories["jsRendering"] = {
					label: "JavaScript Rendering",
					score: Math.max(20, Math.min(100, jsRenderScore)),
					issues: jsRenderAudit.issues,
					passed: jsRenderAudit.passed,
					source: "js-renderer",
				};
			} catch (error) {
				console.warn("JavaScript rendering failed:", error);
			}
		}
		const $active = $rendered ?? $;
		const htmlActive = renderedHtml ?? html;

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
			const seoResult = await analyzeSEO($active, htmlActive, targetUrl);
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

		// 3b. Analyze AEO (Answer Engine Optimization: how citeable this page is
		// to AI answer engines like ChatGPT, Perplexity, and Google AI Overviews)
		try {
			const [pageAeo, siteAeo] = await Promise.all([
				Promise.resolve(analyzeAEO($active, htmlActive, targetUrl)),
				analyzeAEOSiteSignals(targetUrl),
			]);
			const aeoIssues = [...pageAeo.issues, ...siteAeo.issues];
			const aeoPassed = [...pageAeo.passed, ...siteAeo.passed];
			const aeoScore =
				100 - aeoIssues.reduce((sum, i) => sum + i.weight, 0);
			categories["aeo"] = {
				label: "AEO",
				score: Math.max(20, Math.min(100, aeoScore)),
				issues: aeoIssues,
				passed: aeoPassed,
				source: "html-audit",
			};
		} catch (error) {
			console.warn("AEO audit failed:", error);
			categories["aeo"] = {
				label: "AEO",
				score: 50,
				issues: [],
				passed: [],
				source: "html-audit",
			};
		}

		// 3c. Analyze GEO (Generative Engine Optimization: renderability,
		// factual density, attribution, and entity grounding for AI tools like
		// ChatGPT, Gemini, and Perplexity when they synthesize an answer)
		try {
			const geoResult = analyzeGEO($, html, targetUrl, { renderedText });
			const geoScore =
				100 - geoResult.issues.reduce((sum, i) => sum + i.weight, 0);
			categories["geo"] = {
				label: "GEO",
				score: Math.max(20, Math.min(100, geoScore)),
				issues: geoResult.issues,
				passed: geoResult.passed,
				source: "html-audit",
			};
		} catch (error) {
			console.warn("GEO audit failed:", error);
			categories["geo"] = {
				label: "GEO",
				score: 50,
				issues: [],
				passed: [],
				source: "html-audit",
			};
		}

		// 4. Analyze Page Speed (local checks)
		try {
			const speedResult = analyzeSpeed($active, htmlActive, response, elapsedMs);
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

		// 5. Analyze A11y
		try {
			const a11yResult = analyzeA11y($active);
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
			const convResult = analyzeConversions($active, htmlActive);
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

		// 7. Analyze Links (broken links, duplicate/empty/js hrefs, missing rel=noopener, etc.)
		try {
			const linksResult = await analyzeLinks(targetUrl, {
				checkLinkStatuses: true,
			});
			const { issues: linkIssues, passed: linkPassed } =
				buildLinkIssues(linksResult);
			const linksScore =
				100 - linkIssues.reduce((sum, i) => sum + i.weight, 0);
			categories["links"] = {
				label: "Links",
				score: Math.max(20, Math.min(100, linksScore)),
				issues: linkIssues,
				passed: linkPassed,
				source: "link-analyzer",
			};
		} catch (error) {
			console.warn("Link audit failed:", error);
			categories["links"] = {
				label: "Links",
				score: 50,
				issues: [],
				passed: [],
				source: "link-analyzer",
			};
		}

		// 8. Run Lighthouse (PageSpeed Insights) if API key is configured
		try {
			const psiResult = await runPageSpeed(targetUrl);
			if (psiResult.speed) {
				categories["psi-speed"] = {
					label: "PageSpeed Insights - Performance",
					score: psiResult.speed.score || 50,
					issues: psiResult.speed.issues || [],
					passed: psiResult.speed.passed || [],
					source: "lighthouse",
				};
			}
			if (psiResult.a11y) {
				categories["psi-a11y"] = {
					label: "PageSpeed Insights - Accessibility",
					score: psiResult.a11y.score || 50,
					issues: psiResult.a11y.issues || [],
					passed: psiResult.a11y.passed || [],
					source: "lighthouse",
				};
			}
			if (psiResult.seo) {
				categories["psi-seo"] = {
					label: "PageSpeed Insights - SEO",
					score: psiResult.seo.score || 50,
					issues: psiResult.seo.issues || [],
					passed: psiResult.seo.passed || [],
					source: "lighthouse",
				};
			}
			if (psiResult.bestPractices) {
				categories["psi-bp"] = {
					label: "PageSpeed Insights - Best Practices",
					score: psiResult.bestPractices.score || 50,
					issues: psiResult.bestPractices.issues || [],
					passed: psiResult.bestPractices.passed || [],
					source: "lighthouse",
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
			renderJsApplied: Boolean($rendered),
			timestamp: new Date().toISOString(),
		});
	} catch (error: any) {
		if (error?.name === "AbortError") {
			return NextResponse.json(
				{ error: "Scan stopped by user." },
				{ status: 499 },
			);
		}
		console.error("Analyze endpoint error:", error);
		return NextResponse.json(
			{ error: error.message || "Internal server error" },
			{ status: 500 },
		);
	}
}

function ndjson(obj: unknown): Uint8Array {
	return new TextEncoder().encode(JSON.stringify(obj) + "\n");
}

/** Streams a whole-site scan as newline-delimited JSON so the client can render
 *  a live progress bar and offer pause/cancel/create-report controls instead
 *  of waiting on a single request/response round trip. Each line is one JSON
 *  object:
 *   - {type:"status", message}                          general phase updates
 *   - {type:"progress", scanned, total, currentUrl, pageNode}  after each page is crawled + audited
 *   - {type:"linkProgress", checked, total}              during the post-crawl broken-link check
 *   - {type:"done", data}                                final report, same shape the old JSON endpoint returned
 *   - {type:"aborted", pagesScanned}                     user hit "cancel"/"pause" before the crawl finished
 *   - {type:"error", message}                            unrecoverable failure
 *
 *  `excludeUrls` + `priorPageNodes` let the client resume a paused scan: pages
 *  in `excludeUrls` are skipped by the crawler (already scanned last time),
 *  and `priorPageNodes` seeds the running per-page results so the eventual
 *  `done` report covers the whole site, not just the pages from this request.
 */
function streamSiteCrawl(
	targetUrl: string,
	requestedMaxPages: number | undefined,
	signal: AbortSignal,
	requestedConcurrency?: number,
	requestedMaxDepth?: number,
	excludeUrls?: string[],
	priorPageNodes?: PageNode[],
	renderJs = false,
) {
	const maxPages = Math.max(
		1,
		Math.min(requestedMaxPages ?? DEFAULT_MAX_PAGES, HARD_MAX_PAGES),
	);
	// User-tunable via Settings → Crawler. Clamped defensively even though the
	// client already clamps, since this is a public API route.
	const concurrency =
		typeof requestedConcurrency === "number" ?
			Math.max(1, Math.min(Math.round(requestedConcurrency), 12))
		:	undefined;
	const maxDepth =
		typeof requestedMaxDepth === "number" ?
			Math.max(1, Math.min(Math.round(requestedMaxDepth), 10))
		:	undefined;

	const stream = new ReadableStream<Uint8Array>({
		async start(controller) {
			let closed = false;
			const enqueue = (obj: unknown) => {
				if (closed) return;
				try {
					controller.enqueue(ndjson(obj));
				} catch {
					// stream already closed (client disconnected) — safe to ignore
				}
			};
			const close = () => {
				if (closed) return;
				closed = true;
				try {
					controller.close();
				} catch {
					// already closed
				}
			};

			try {
				enqueue({
					type: "status",
					message: `Discovering pages (up to ${maxPages})...`,
				});

				const seoPerPage: PageCategoryResult[] = [];
				const aeoPerPage: PageCategoryResult[] = [];
				const geoPerPage: PageCategoryResult[] = [];
				const speedPerPage: PageCategoryResult[] = [];
				const a11yPerPage: PageCategoryResult[] = [];
				const convPerPage: PageCategoryResult[] = [];
				const jsRenderingPerPage: PageCategoryResult[] = [];
				const pageNodes: PageNode[] = [];

				// Resuming a paused scan: seed everything already scanned before the
				// pause so the eventual report covers the whole site, and tell the
				// crawler to skip those URLs instead of re-fetching them.
				if (priorPageNodes && priorPageNodes.length > 0) {
					for (const node of priorPageNodes) {
						pageNodes.push(node);
						if (node.categories.seo) seoPerPage.push({ url: node.url, ...node.categories.seo });
						if (node.categories.aeo) aeoPerPage.push({ url: node.url, ...node.categories.aeo });
						if (node.categories.geo) geoPerPage.push({ url: node.url, ...node.categories.geo });
						if (node.categories.speed) speedPerPage.push({ url: node.url, ...node.categories.speed });
						if (node.categories.a11y) a11yPerPage.push({ url: node.url, ...node.categories.a11y });
						if (node.categories.conversions) convPerPage.push({ url: node.url, ...node.categories.conversions });
						if (node.categories.jsRendering) jsRenderingPerPage.push({ url: node.url, ...node.categories.jsRendering });
					}
				}

				const crawl = await crawlSite(targetUrl, {
					maxPages,
					...(concurrency ? { concurrency } : {}),
					...(maxDepth ? { maxDepth } : {}),
					...(excludeUrls && excludeUrls.length > 0 ? { seedSeen: excludeUrls } : {}),
					signal,
					onPage: async (page, pagesSoFar) => {
						const $ = load(page.html);

						// Same raw-vs-rendered split as the single-page scan: `$`/
						// `page.html` stay raw (GEO's renderability check needs that
						// baseline), while `$active`/`htmlActive` point at the
						// rendered DOM for every other, content-hungry audit.
						let $rendered: CheerioAPI | undefined;
						let renderedHtml: string | undefined;
						let renderedText: string | undefined;
						if (renderJs) {
							try {
								const renderResult = await renderPageJs(page.url, page.html, {
									signal,
								});
								renderedHtml = renderResult.html;
								renderedText = renderResult.text;
								$rendered = load(renderResult.html);
								const jsRenderAudit = analyzeJsRendering(renderResult);
								const score =
									100 -
									jsRenderAudit.issues.reduce((sum, iss) => sum + iss.weight, 0);
								jsRenderingPerPage.push({
									url: page.url,
									score: Math.max(20, Math.min(100, score)),
									issues: jsRenderAudit.issues,
									passed: jsRenderAudit.passed,
								});
							} catch (error) {
								console.warn(`JavaScript rendering failed for ${page.url}:`, error);
							}
						}
						const $active = $rendered ?? $;
						const htmlActive = renderedHtml ?? page.html;

						const pageCategories: PageNode["categories"] = {
							seo: { label: "SEO", score: 0, issues: [], passed: [] },
							aeo: { label: "AEO", score: 0, issues: [], passed: [] },
							geo: { label: "GEO", score: 0, issues: [], passed: [] },
							speed: { label: "Performance", score: 0, issues: [], passed: [] },
							a11y: {
								label: "Accessibility",
								score: 0,
								issues: [],
								passed: [],
							},
							conversions: {
								label: "Conversions",
								score: 0,
								issues: [],
								passed: [],
							},
						};
						let pageScore = 0;
						let categoryCount = 0;

						try {
							const result = await analyzeSEO($active, htmlActive, page.url, {
								// robots.txt / sitemap only need checking once per site. Pages
								// now fetch concurrently, so completion order no longer
								// guarantees the seed page finishes first — key off depth
								// instead of `pagesSoFar === 1`.
								includeCrawlFiles: page.depth === 0,
							});
							const score =
								100 - result.issues.reduce((sum, iss) => sum + iss.weight, 0);
							const clampedScore = Math.max(20, Math.min(100, score));
							seoPerPage.push({
								url: page.url,
								score: clampedScore,
								issues: result.issues,
								passed: result.passed,
							});
							pageCategories.seo = {
								label: "SEO",
								score: clampedScore,
								issues: result.issues,
								passed: result.passed,
							};
							pageScore += clampedScore;
							categoryCount++;
						} catch (error) {
							console.warn(`SEO audit failed for ${page.url}:`, error);
						}

						try {
							const pageAeo = analyzeAEO($active, htmlActive, page.url);
							// robots.txt AI-crawler rules and llms.txt are site-wide, so
							// only fetch them once (on the seed page) same as crawl files.
							const siteAeo =
								page.depth === 0 ?
									await analyzeAEOSiteSignals(page.url)
								:	{ issues: [], passed: [] };
							const combinedIssues = [...pageAeo.issues, ...siteAeo.issues];
							const combinedPassed = [...pageAeo.passed, ...siteAeo.passed];
							const score =
								100 -
								combinedIssues.reduce((sum, iss) => sum + iss.weight, 0);
							const clampedScore = Math.max(20, Math.min(100, score));
							aeoPerPage.push({
								url: page.url,
								score: clampedScore,
								issues: combinedIssues,
								passed: combinedPassed,
							});
							pageCategories.aeo = {
								label: "AEO",
								score: clampedScore,
								issues: combinedIssues,
								passed: combinedPassed,
							};
							pageScore += clampedScore;
							categoryCount++;
						} catch (error) {
							console.warn(`AEO audit failed for ${page.url}:`, error);
						}

						try {
							const result = analyzeGEO($, page.html, page.url, {
								renderedText,
							});
							const score =
								100 - result.issues.reduce((sum, iss) => sum + iss.weight, 0);
							const clampedScore = Math.max(20, Math.min(100, score));
							geoPerPage.push({
								url: page.url,
								score: clampedScore,
								issues: result.issues,
								passed: result.passed,
							});
							pageCategories.geo = {
								label: "GEO",
								score: clampedScore,
								issues: result.issues,
								passed: result.passed,
							};
							pageScore += clampedScore;
							categoryCount++;
						} catch (error) {
							console.warn(`GEO audit failed for ${page.url}:`, error);
						}

						try {
							const result = analyzeSpeed(
								$active,
								htmlActive,
								page.response,
								page.elapsedMs,
							);
							const score =
								100 - result.issues.reduce((sum, iss) => sum + iss.weight, 0);
							const clampedScore = Math.max(20, Math.min(100, score));
							speedPerPage.push({
								url: page.url,
								score: clampedScore,
								issues: result.issues,
								passed: result.passed,
							});
							pageCategories.speed = {
								label: "Performance",
								score: clampedScore,
								issues: result.issues,
								passed: result.passed,
							};
							pageScore += clampedScore;
							categoryCount++;
						} catch (error) {
							console.warn(`Speed audit failed for ${page.url}:`, error);
						}

						try {
							const result = analyzeA11y($active);
							const score =
								100 - result.issues.reduce((sum, iss) => sum + iss.weight, 0);
							const clampedScore = Math.max(20, Math.min(100, score));
							a11yPerPage.push({
								url: page.url,
								score: clampedScore,
								issues: result.issues,
								passed: result.passed,
							});
							pageCategories.a11y = {
								label: "Accessibility",
								score: clampedScore,
								issues: result.issues,
								passed: result.passed,
							};
							pageScore += clampedScore;
							categoryCount++;
						} catch (error) {
							console.warn(
								`Accessibility audit failed for ${page.url}:`,
								error,
							);
						}

						try {
							const result = analyzeConversions($active, htmlActive);
							const score =
								100 - result.issues.reduce((sum, iss) => sum + iss.weight, 0);
							const clampedScore = Math.max(20, Math.min(100, score));
							convPerPage.push({
								url: page.url,
								score: clampedScore,
								issues: result.issues,
								passed: result.passed,
							});
							pageCategories.conversions = {
								label: "Conversions",
								score: clampedScore,
								issues: result.issues,
								passed: result.passed,
							};
							pageScore += clampedScore;
							categoryCount++;
						} catch (error) {
							console.warn(`Conversions audit failed for ${page.url}:`, error);
						}

						const overallScore =
							categoryCount > 0 ? Math.round(pageScore / categoryCount) : 50;
						const pageNode: PageNode = {
							url: page.url,
							parentUrl: page.parentUrl,
							depth: page.depth ?? 0,
							score: overallScore,
							categories: pageCategories,
						};
						pageNodes.push(pageNode);

						enqueue({
							type: "progress",
							scanned: (priorPageNodes?.length ?? 0) + pagesSoFar,
							total: maxPages + (priorPageNodes?.length ?? 0),
							currentUrl: page.url,
							pageNode,
						});
					},
				});

				if (pageNodes.length === 0) {
					enqueue({
						type: "error",
						message:
							crawl.aborted ?
								"Scan stopped before any pages could be analyzed."
							:	"Couldn't reach any pages on that site. Check the URL and make sure the site is publicly accessible.",
					});
					return close();
				}

				if (crawl.aborted) {
					enqueue({ type: "aborted", pagesScanned: pageNodes.length });
					return close();
				}

				const categories: Record<string, Category> = {
					seo: aggregateCategory("SEO", "html-audit", seoPerPage),
					aeo: aggregateCategory("AEO", "html-audit", aeoPerPage),
					geo: aggregateCategory("GEO", "html-audit", geoPerPage),
					speed: aggregateCategory("Performance", "html-audit", speedPerPage),
					a11y: aggregateCategory("Accessibility", "html-audit", a11yPerPage),
					conversions: aggregateCategory(
						"Conversions",
						"html-audit",
						convPerPage,
					),
					...(jsRenderingPerPage.length > 0 ?
						{
							jsRendering: aggregateCategory(
								"JavaScript Rendering",
								"js-renderer",
								jsRenderingPerPage,
							),
						}
					:	{}),
				};

				// Broken-link detection across the whole crawled site: every link from
				// every page is deduped by resolved URL first, so a link repeated in a
				// shared header/footer is only checked once no matter how many pages
				// reference it.
				enqueue({
					type: "status",
					message: "Checking for broken links across the site...",
				});
				try {
					const siteLinksResult = await findBrokenLinksAcrossSite(
						crawl.pages.map((p) => ({ url: p.url, html: p.html })),
						{
							concurrency: 5, // Conservative concurrency to avoid overwhelming servers
							maxRedirects: 5,
							fetchTimeoutMs: 12000, // 12 second timeout for stability
							checkExternal: true,
							// Link-dense sites (heavy nav/footer, per-item links —
							// think GitHub) can produce thousands of unique URLs
							// regardless of how many pages were crawled. Without a
							// cap and a time budget here, this phase alone could run
							// past the route's maxDuration and get killed by the
							// host, dropping the connection instead of finishing
							// with a graceful result — leaving 90s of headroom for
							// the duplicate-content, security-header, and PSI checks
							// that still need to run afterward.
							maxLinksToCheck: 500,
							overallTimeoutMs: 90_000,
							onProgress: (checked, total) => {
								enqueue({ type: "linkProgress", checked, total });
							},
						},
					);
					const linksScore =
						100 - siteLinksResult.issues.reduce((sum, i) => sum + i.weight, 0);
					categories["links"] = {
						label: "Broken Links",
						score: Math.max(20, Math.min(100, linksScore)),
						issues: siteLinksResult.issues,
						passed: siteLinksResult.passed,
						source: "link-analyzer",
						pagesAnalyzed: crawl.pages.length,
					};
				} catch (error) {
					console.warn("Site-wide link audit failed:", error);
					categories["links"] = {
						label: "Broken Links",
						score: 50,
						issues: [],
						passed: [],
						source: "link-analyzer",
						pagesAnalyzed: crawl.pages.length,
					};
				}

				if (signal.aborted) {
					enqueue({ type: "aborted", pagesScanned: crawl.pages.length });
					return close();
				}

				// Duplicate-content detection: repeated titles/meta descriptions, and
				// pages whose main text is identical or highly similar to another page.
				enqueue({
					type: "status",
					message: "Checking for duplicate content...",
				});
				try {
					const duplicateContentResult = analyzeDuplicateContent(
						crawl.pages.map((p) => ({ url: p.url, html: p.html })),
					);
					const duplicateScore =
						100 -
						duplicateContentResult.issues.reduce(
							(sum, i) => sum + i.weight,
							0,
						);
					categories["duplicateContent"] = {
						label: "Duplicate Content",
						score: Math.max(20, Math.min(100, duplicateScore)),
						issues: duplicateContentResult.issues,
						passed: duplicateContentResult.passed,
						source: "duplicate-content-audit",
						pagesAnalyzed: crawl.pages.length,
					};
				} catch (error) {
					console.warn("Duplicate content audit failed:", error);
					categories["duplicateContent"] = {
						label: "Duplicate Content",
						score: 50,
						issues: [],
						passed: [],
						source: "duplicate-content-audit",
						pagesAnalyzed: crawl.pages.length,
					};
				}

				enqueue({ type: "status", message: "Checking security headers..." });

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

				if (signal.aborted) {
					enqueue({ type: "aborted", pagesScanned: crawl.pages.length });
					return close();
				}

				enqueue({
					type: "status",
					message: "Running Lighthouse on the homepage...",
				});

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

				enqueue({
					type: "done",
					data: {
						url: targetUrl,
						mode: "site",
						categories,
						lighthouseAvailable,
						pagesScanned: pageNodes.map((p) => p.url),
						pagesSkipped: crawl.skipped,
						crawlSource: crawl.source,
						crawlTruncated: crawl.truncated,
						maxPages,
						timestamp: new Date().toISOString(),
						pages: pageNodes,
					},
				});
				close();
			} catch (error: any) {
				if (error?.name === "AbortError" || signal.aborted) {
					enqueue({ type: "aborted", pagesScanned: 0 });
				} else {
					console.error("Site crawl stream error:", error);
					enqueue({
						type: "error",
						message: error?.message || "Internal server error",
					});
				}
				close();
			}
		},
	});

	return new Response(stream, {
		headers: {
			"Content-Type": "application/x-ndjson; charset=utf-8",
			"Cache-Control": "no-cache, no-transform",
			"X-Content-Type-Options": "nosniff",
		},
	});
}
