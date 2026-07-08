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
import { CheerioAPI, load } from "cheerio";

export const runtime = "nodejs";
export const maxDuration = 60;

type Category = {
	label: string;
	score: number;
	issues: Issue[];
	passed: Issue[];
	source: string;
};

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
		const { url } = await req.json();

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
