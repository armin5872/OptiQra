"use client";

import { useState } from "react";
import { usePageSpeedKey } from "@/lib/hooks/usePageSpeedKey";
import type { CoreWebVitalsResult, VitalRating } from "@/lib/pagespeed";
import { getErrorMessage } from "@/lib/errorUtils";

interface Props {
	url: string;
}

const RATING_COLOR: Record<VitalRating, string> = {
	good: "var(--good)",
	"needs-improvement": "var(--warn)",
	poor: "var(--critical)",
};
const RATING_LABEL: Record<VitalRating, string> = {
	good: "Good",
	"needs-improvement": "Needs improvement",
	poor: "Poor",
};

function fmt(ms: number | undefined): string {
	if (ms === undefined) return "—";
	return ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${Math.round(ms)}ms`;
}

function MetricTile({
	label,
	value,
	rating,
	note,
}: {
	label: string;
	value: string;
	rating?: VitalRating;
	note: string;
}) {
	return (
		<div className="cwv-tile">
			<div className="cwv-tile-label">{label}</div>
			<div className="cwv-tile-value" style={{ color: rating ? RATING_COLOR[rating] : undefined }}>
				{value}
			</div>
			{rating && (
				<div className="cwv-tile-rating" style={{ color: RATING_COLOR[rating] }}>
					{RATING_LABEL[rating]}
				</div>
			)}
			<div className="cwv-tile-note">{note}</div>
		</div>
	);
}

/** Shown inside the Performance category panel. The existing "speed" score
 *  comes from instant HTML heuristics (see htmlAudit.ts) — this is a
 *  separate, opt-in, on-demand check against Google's PageSpeed Insights
 *  API for the site's main URL, using the person's own API key. Kept as its
 *  own self-contained card (same pattern as AIEngineTest) rather than
 *  merged into the category's score, since it's slow/rate-limited and only
 *  ever covers one URL, not every crawled page. */
export default function CoreWebVitalsPanel({ url }: Props) {
	const { apiKey, strategy, isConfigured, hydrated } = usePageSpeedKey();
	const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
	const [result, setResult] = useState<CoreWebVitalsResult | null>(null);
	const [error, setError] = useState<string | null>(null);

	if (!hydrated) return null;

	const handleRun = async () => {
		setStatus("loading");
		setError(null);
		try {
			const res = await fetch("/api/pagespeed", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ url, apiKey, strategy }),
			});
			const json = await res.json();
			if (!json.ok) throw new Error(json.message ?? `Request failed (HTTP ${res.status})`);
			setResult(json.result);
			setStatus("done");
		} catch (err) {
			setError(getErrorMessage(err, "Couldn't run the Core Web Vitals check"));
			setStatus("error");
		}
	};

	const f = result?.field;
	const lab = result?.lab;

	return (
		<div className="ai-insights-card">
			<div className="ai-insights-head">
				<div>
					<h3>⚡ Core Web Vitals</h3>
					<p className="ai-insights-subtitle">
						Real LCP/INP/CLS from Google PageSpeed Insights — actual visitor data when Google has enough
						traffic for this URL, otherwise a live Lighthouse run. Checks {url}, tested as {strategy}.
					</p>
				</div>
				{status !== "loading" && (
					<button
						type="button"
						className="apply-btn"
						disabled={!isConfigured}
						onClick={handleRun}
						title={!isConfigured ? "Add a PageSpeed Insights API key in Settings → Analyzer first" : undefined}
					>
						{status === "done" ? "Run again" : "Run Core Web Vitals check"}
					</button>
				)}
			</div>

			{!isConfigured && (
				<p className="ai-insights-hint">
					Add your own free Google PageSpeed Insights API key in Settings → Analyzer to enable this.
				</p>
			)}

			{status === "loading" && (
				<p className="ai-insights-hint">Running a live PageSpeed Insights check — this can take up to 20s…</p>
			)}

			{status === "error" && (
				<div className="ai-fix-error" style={{ textAlign: "left" }}>
					{error}
					<button type="button" className="link-btn" onClick={handleRun}>
						retry
					</button>
				</div>
			)}

			{status === "done" && result && lab && (
				<>
					<div className="cwv-grid">
						<MetricTile
							label="LCP"
							value={fmt(f?.lcp?.value ?? lab.lcpMs)}
							rating={f?.lcp?.rating}
							note={f?.lcp ? "real visitors" : "lab simulation only"}
						/>
						<MetricTile
							label="INP"
							value={f?.inp ? fmt(f.inp.value) : lab.tbtMs !== undefined ? `${fmt(lab.tbtMs)} TBT` : "—"}
							rating={f?.inp?.rating}
							note={f?.inp ? "real visitors" : "no field data — showing lab TBT proxy"}
						/>
						<MetricTile
							label="CLS"
							value={(f?.cls?.value ?? lab.clsValue ?? 0).toFixed(2)}
							rating={f?.cls?.rating}
							note={f?.cls ? "real visitors" : "lab simulation only"}
						/>
						<MetricTile label="Lighthouse score" value={`${lab.performanceScore}/100`} note="single lab run" />
					</div>
					{!f && (
						<p className="ai-insights-hint">
							No real-visitor (CrUX) data was available for this URL yet — Google needs more traffic
							history before it reports field data. Everything above is from the one-off lab run instead.
						</p>
					)}
					<p className="ai-insights-hint">
						<a href={result.webDevUrl} target="_blank" rel="noreferrer">
							See the full breakdown on pagespeed.web.dev ↗
						</a>
					</p>
				</>
			)}
		</div>
	);
}
