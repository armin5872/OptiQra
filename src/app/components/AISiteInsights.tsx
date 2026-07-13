"use client";

import { useState } from "react";
import type { Issue } from "./CrawlTree";
import { useAIProvider } from "@/lib/hooks/useAIProvider";
import type { InsightsCategorySummary } from "@/lib/aiInsights";

type Category = {
	label: string;
	score: number;
	issues: Issue[];
	passed: Issue[];
	source: string;
	pagesAnalyzed?: number;
};

interface Props {
	siteUrl: string;
	mode?: "single" | "site";
	pagesScanned?: number;
	overallScore: number;
	categories: Record<string, Category>;
}

const MAX_ISSUES_PER_CATEGORY = 6;

/** Trims each category down to its highest-weight open issues so the prompt
 *  stays compact even on a 1000-page crawl — categories are already deduped
 *  by issue id upstream (see aggregateCategory), so this is just a further cap. */
function summarizeCategories(categories: Record<string, Category>): InsightsCategorySummary[] {
	return Object.values(categories)
		.filter((cat) => cat.pagesAnalyzed !== 0)
		.map((cat) => {
			const open = cat.issues.filter((i) => !i.resolved).sort((a, b) => b.weight - a.weight);
			return {
				label: cat.label,
				score: cat.score,
				pagesAnalyzed: cat.pagesAnalyzed,
				totalIssues: open.length,
				topIssues: open.slice(0, MAX_ISSUES_PER_CATEGORY).map((i) => ({
					title: i.title,
					detail: i.detail,
					severity: i.severity,
					weight: i.weight,
				})),
			};
		});
}

export default function AISiteInsights({ siteUrl, mode, pagesScanned, overallScore, categories }: Props) {
	const { provider, apiKey, model, isConfigured, hydrated } = useAIProvider();
	const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
	const [output, setOutput] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [copied, setCopied] = useState(false);

	if (!hydrated) return null;

	const scopeLabel = mode === "site" ? "this site" : "this page";

	const handleCopy = async () => {
		try {
			await navigator.clipboard.writeText(output);
			setCopied(true);
			setTimeout(() => setCopied(false), 1500);
		} catch {
			// clipboard API unavailable — silently ignore, the text is still selectable
		}
	};

	const handleGenerate = async () => {
		setStatus("loading");
		setOutput("");
		setError(null);

		try {
			const res = await fetch("/api/ai-insights", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					provider,
					apiKey,
					model,
					siteUrl,
					mode: mode ?? "single",
					pagesScanned,
					overallScore,
					categories: summarizeCategories(categories),
				}),
			});

			if (!res.body) throw new Error("No response stream");

			const reader = res.body.getReader();
			const decoder = new TextDecoder();
			let buffer = "";

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				buffer += decoder.decode(value, { stream: true });

				const lines = buffer.split("\n");
				buffer = lines.pop() ?? "";

				for (const line of lines) {
					if (!line.trim()) continue;
					const event = JSON.parse(line);
					if (event.type === "delta") setOutput((prev) => prev + event.text);
					if (event.type === "error") throw new Error(event.message);
				}
			}

			setStatus("done");
		} catch (err: any) {
			setError(err?.message ?? "Failed to generate insights");
			setStatus("error");
		}
	};

	return (
		<div className="ai-insights-card">
			<div className="ai-insights-head">
				<div>
					<h3>✨ AI insights for {scopeLabel}</h3>
					<p className="ai-insights-subtitle">
						A synthesized overview and prioritized action plan across every category above.
					</p>
				</div>

				{status !== "loading" && (
					<button
						type="button"
						className="apply-btn"
						disabled={!isConfigured}
						onClick={handleGenerate}
						title={!isConfigured ? "Set up an AI provider above first" : undefined}
					>
						{status === "done" ? "Regenerate" : "Generate insights"}
					</button>
				)}
			</div>

			{!isConfigured && (
				<p className="ai-insights-hint">Set up an AI provider above to enable this.</p>
			)}

			{status === "loading" && !output && (
				<p className="ai-insights-hint">Reading through the full report…</p>
			)}

			{status === "error" && (
				<div className="ai-fix-error" style={{ textAlign: "left" }}>
					{error}
					<button type="button" className="link-btn" onClick={handleGenerate}>
						retry
					</button>
				</div>
			)}

			{output && (
				<>
					<div className="ai-insights-output">{output}</div>
					{status === "done" && (
						<button type="button" className="link-btn ai-insights-copy" onClick={handleCopy}>
							{copied ? "copied!" : "copy"}
						</button>
					)}
				</>
			)}
		</div>
	);
}
