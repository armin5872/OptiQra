// lib/pagespeed.ts
//
// Real Core Web Vitals via Google's PageSpeed Insights API (v5), which wraps
// two very different data sources in one response:
//
//  - "field" data: actual Chrome UX Report (CrUX) numbers from real visitors
//    over the last 28 days — the same data Google Search Console shows, and
//    the numbers that actually affect search ranking. Only present once a
//    site/page has enough real-world traffic for Google to report on it.
//  - "lab" data: a single simulated Lighthouse run against the URL, done at
//    request time. Always present, but is one synthetic run under lab
//    network/CPU throttling, not what real visitors experience.
//
// This is deliberately kept separate from htmlAudit.ts's analyzeSpeed(),
// which is a heuristic proxy (HTML size, render-blocking scripts, etc.) that
// runs instantly against the raw fetched HTML for every crawled page. PSI
// calls are slow (2-20s) and rate-limited per Google API key, so this is an
// on-demand, opt-in check the user triggers for one URL at a time — not
// something run automatically across a whole site crawl.
//
// The user brings their own free Google API key (see PSI_KEY_INFO_URL
// below); it's sent from the browser to our own /api/pagespeed route, which
// proxies it to Google exactly once per check, same pattern as the AI
// provider keys in aiProviders.ts — never logged, persisted, or echoed back.

import { issue, pass, type Issue } from "@/lib/auditUtils";

export const PSI_KEY_INFO_URL =
	"https://developers.google.com/speed/docs/insights/v5/get-started";

export type PageSpeedStrategy = "mobile" | "desktop";

export type VitalRating = "good" | "needs-improvement" | "poor";

/** One metric's value plus how Google buckets it. `value` is in the metric's
 *  natural unit (ms for timing metrics, unitless for CLS). */
export interface VitalMetric {
	value: number;
	rating: VitalRating;
}

/** Field (CrUX) data for the "Core Web Vitals" trio Google actually uses for
 *  the pass/fail assessment, plus the two data points needed to compute LCP. */
export interface FieldVitals {
	/** Google's own overall pass/fail across LCP+INP+CLS together. */
	overallRating: VitalRating;
	lcp?: VitalMetric;
	inp?: VitalMetric;
	cls?: VitalMetric;
	fcp?: VitalMetric;
	ttfb?: VitalMetric;
	/** true if this is page-level CrUX data; false if Google only had enough
	 *  traffic to report at the origin/whole-site level instead. */
	isPageLevel: boolean;
}

/** Lab data from the single Lighthouse run PSI always performs, regardless
 *  of whether field data exists. */
export interface LabVitals {
	performanceScore: number; // 0-100
	lcpMs?: number;
	clsValue?: number;
	tbtMs?: number; // Total Blocking Time — lab proxy for INP (INP itself needs real interactions)
	fcpMs?: number;
	speedIndexMs?: number;
}

export interface CoreWebVitalsResult {
	url: string;
	strategy: PageSpeedStrategy;
	fetchedAt: string;
	field?: FieldVitals;
	lab: LabVitals;
	/** Direct link to the same URL/strategy on pagespeed.web.dev, for "see the
	 *  full breakdown" without re-implementing Lighthouse's whole UI here. */
	webDevUrl: string;
}

const RATING_LABEL: Record<VitalRating, string> = {
	good: "good",
	"needs-improvement": "needs improvement",
	poor: "poor",
};

// Thresholds straight from Google's official Core Web Vitals + Lighthouse
// scoring docs (web.dev/articles/lcp, /cls, /inp; TBT scoring curve for the
// lab proxy). Kept local rather than re-derived from PSI's own per-metric
// categories, which aren't always present in the response.
function rate(value: number, good: number, poor: number): VitalRating {
	if (value <= good) return "good";
	if (value <= poor) return "needs-improvement";
	return "poor";
}
const rateLCP = (ms: number) => rate(ms, 2500, 4000);
const rateINP = (ms: number) => rate(ms, 200, 500);
const rateCLS = (v: number) => rate(v, 0.1, 0.25);
const rateFCP = (ms: number) => rate(ms, 1800, 3000);
const rateTTFB = (ms: number) => rate(ms, 800, 1800);

function fmtMs(ms: number): string {
	return ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${Math.round(ms)}ms`;
}

// --- PSI API response parsing -------------------------------------------
// The response shape below is trimmed to only the fields we read; PSI's
// actual payload is much larger (audits, opportunities, screenshots, etc.).

interface PSICrUXMetric {
	percentile: number;
	category: "FAST" | "AVERAGE" | "SLOW" | "GOOD" | "NEEDS_IMPROVEMENT" | "POOR";
}
interface PSILoadingExperience {
	overall_category?: "FAST" | "AVERAGE" | "SLOW";
	metrics?: Record<string, PSICrUXMetric>;
}
interface PSIResponse {
	loadingExperience?: PSILoadingExperience;
	originLoadingExperience?: PSILoadingExperience;
	lighthouseResult?: {
		categories?: { performance?: { score: number } };
		audits?: Record<string, { numericValue?: number }>;
	};
	error?: { message?: string };
}

function cruxCategoryToRating(category: string): VitalRating {
	if (category === "FAST" || category === "GOOD") return "good";
	if (category === "SLOW" || category === "POOR") return "poor";
	return "needs-improvement";
}

function parseField(exp: PSILoadingExperience | undefined, isPageLevel: boolean): FieldVitals | undefined {
	if (!exp?.metrics) return undefined;
	const m = exp.metrics;
	const get = (key: string) => (m[key] ? { value: m[key].percentile, rating: cruxCategoryToRating(m[key].category) } : undefined);

	// CrUX field metric keys, per PSI's documented response shape.
	const lcp = get("LARGEST_CONTENTFUL_PAINT_MS");
	const inp = get("INTERACTION_TO_NEXT_PAINT");
	const cls = get("CUMULATIVE_LAYOUT_SHIFT_SCORE");
	const fcp = get("FIRST_CONTENTFUL_PAINT_MS");
	const ttfb = get("EXPERIMENTAL_TIME_TO_FIRST_BYTE");

	// CLS ships from CrUX scaled by 100 (e.g. 12 means 0.12).
	const clsFixed = cls ? { ...cls, value: cls.value / 100 } : undefined;

	return {
		overallRating:
			exp.overall_category === "FAST" ? "good"
			: exp.overall_category === "SLOW" ? "poor"
			: exp.overall_category === "AVERAGE" ? "needs-improvement"
			// Fall back to deriving it from LCP+INP+CLS if Google didn't send
			// an overall_category (seen for origin-level fallbacks).
			: [lcp?.rating, inp?.rating, clsFixed?.rating].includes("poor") ? "poor"
			: [lcp?.rating, inp?.rating, clsFixed?.rating].includes("needs-improvement") ? "needs-improvement"
			: "good",
		lcp,
		inp,
		cls: clsFixed,
		fcp,
		ttfb,
		isPageLevel,
	};
}

function parseLab(lh: PSIResponse["lighthouseResult"]): LabVitals {
	const audits = lh?.audits ?? {};
	const num = (id: string) => audits[id]?.numericValue;
	return {
		performanceScore: Math.round((lh?.categories?.performance?.score ?? 0) * 100),
		lcpMs: num("largest-contentful-paint"),
		clsValue: num("cumulative-layout-shift"),
		tbtMs: num("total-blocking-time"),
		fcpMs: num("first-contentful-paint"),
		speedIndexMs: num("speed-index"),
	};
}

export class PageSpeedError extends Error {
	constructor(
		message: string,
		public status: number,
	) {
		super(message);
		this.name = "PageSpeedError";
	}
}

/** Calls Google's PageSpeed Insights v5 API for one URL/strategy. Meant to
 *  be called server-side only (see /api/pagespeed) — `apiKey` is the user's
 *  own key, used for this single upstream call and never persisted. */
export async function runPageSpeed(
	targetUrl: string,
	apiKey: string,
	strategy: PageSpeedStrategy = "mobile",
	options?: { signal?: AbortSignal },
): Promise<CoreWebVitalsResult> {
	const params = new URLSearchParams({
		url: targetUrl,
		key: apiKey,
		strategy,
		category: "performance",
	});
	const endpoint = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params.toString()}`;

	const res = await fetch(endpoint, { signal: options?.signal });
	const data = (await res.json()) as PSIResponse;

	if (!res.ok) {
		throw new PageSpeedError(
			data?.error?.message || `PageSpeed Insights request failed (${res.status})`,
			res.status,
		);
	}

	const field = parseField(data.loadingExperience, true) ?? parseField(data.originLoadingExperience, false);

	return {
		url: targetUrl,
		strategy,
		fetchedAt: new Date().toISOString(),
		field,
		lab: parseLab(data.lighthouseResult),
		webDevUrl: `https://pagespeed.web.dev/analysis?url=${encodeURIComponent(targetUrl)}&form_factor=${strategy}`,
	};
}

/** Turns a CoreWebVitalsResult into the same Issue[]/passed[] shape the rest
 *  of the auditors use, so it can be shown alongside (or folded into) the
 *  Performance category's findings. Field data is preferred when present
 *  since it reflects real visitors; falls back to lab data otherwise. */
export function buildCoreWebVitalsIssues(result: CoreWebVitalsResult): { issues: Issue[]; passed: Issue[] } {
	const issues: Issue[] = [];
	const passed: Issue[] = [];
	const f = result.field;

	const lcpMs = f?.lcp?.value ?? result.lab.lcpMs;
	const lcpRating = f?.lcp?.rating ?? (result.lab.lcpMs !== undefined ? rateLCP(result.lab.lcpMs) : undefined);
	const lcpSource = f?.lcp ? (f.isPageLevel ? "real visitors" : "site-wide real visitors") : "a lab simulation";
	if (lcpMs !== undefined && lcpRating !== undefined) {
		if (lcpRating === "good") {
			passed.push(pass("cwv-lcp", `Largest Contentful Paint is good (${fmtMs(lcpMs)}, ${lcpSource})`));
		} else {
			issues.push(
				issue(
					"cwv-lcp",
					`Largest Contentful Paint is ${RATING_LABEL[lcpRating]} (${fmtMs(lcpMs)})`,
					`Based on ${lcpSource}, LCP is ${fmtMs(lcpMs)}. Google's threshold for "good" is 2.5s or under; this page is ${lcpRating === "poor" ? "well past" : "past"} that.`,
					"Speed up the largest above-the-fold element: optimize/preload its image, remove render-blocking CSS/JS, and improve server response time.",
					lcpRating === "poor" ? 14 : 8,
				),
			);
		}
	}

	// INP: only ever field data (real interactions are required) — TBT is
	// shown as a labeled lab proxy instead of pretending to be INP itself.
	if (f?.inp) {
		if (f.inp.rating === "good") {
			passed.push(pass("cwv-inp", `Interaction to Next Paint is good (${fmtMs(f.inp.value)}, real visitors)`));
		} else {
			issues.push(
				issue(
					"cwv-inp",
					`Interaction to Next Paint is ${RATING_LABEL[f.inp.rating]} (${fmtMs(f.inp.value)})`,
					`Based on real visitors, INP is ${fmtMs(f.inp.value)}. Google's threshold for "good" is 200ms or under.`,
					"Break up long JavaScript tasks, reduce main-thread work on interaction, and avoid heavy work in event handlers.",
					f.inp.rating === "poor" ? 14 : 8,
				),
			);
		}
	} else if (result.lab.tbtMs !== undefined) {
		const tbtRating = rate(result.lab.tbtMs, 200, 600);
		if (tbtRating === "good") {
			passed.push(pass("cwv-tbt", `Total Blocking Time (lab proxy for INP) is good (${fmtMs(result.lab.tbtMs)})`));
		} else {
			issues.push(
				issue(
					"cwv-tbt",
					`Total Blocking Time is ${RATING_LABEL[tbtRating]} (${fmtMs(result.lab.tbtMs)})`,
					`No real-visitor INP data is available yet for this URL, so this uses Total Blocking Time from a lab run as a proxy — high TBT usually means poor INP too.`,
					"Break up long JavaScript tasks and defer non-critical scripts so the main thread stays free to respond to input.",
					tbtRating === "poor" ? 10 : 6,
				),
			);
		}
	}

	const clsValue = f?.cls?.value ?? result.lab.clsValue;
	const clsRating = f?.cls?.rating ?? (result.lab.clsValue !== undefined ? rateCLS(result.lab.clsValue) : undefined);
	const clsSource = f?.cls ? (f.isPageLevel ? "real visitors" : "site-wide real visitors") : "a lab simulation";
	if (clsValue !== undefined && clsRating !== undefined) {
		if (clsRating === "good") {
			passed.push(pass("cwv-cls", `Cumulative Layout Shift is good (${clsValue.toFixed(2)}, ${clsSource})`));
		} else {
			issues.push(
				issue(
					"cwv-cls",
					`Cumulative Layout Shift is ${RATING_LABEL[clsRating]} (${clsValue.toFixed(2)})`,
					`Based on ${clsSource}, CLS is ${clsValue.toFixed(2)}. Google's threshold for "good" is 0.1 or under.`,
					"Reserve space for images/embeds/ads with explicit dimensions, and avoid inserting content above existing content after load.",
					clsRating === "poor" ? 12 : 7,
				),
			);
		}
	}

	return { issues, passed };
}

export { rateLCP, rateINP, rateCLS, rateFCP, rateTTFB, fmtMs };
