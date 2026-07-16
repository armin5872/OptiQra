"use client";

import { useState } from "react";
import { useAIProvider } from "@/lib/hooks/useAIProvider";
import type { EngineTestMode } from "@/lib/aiEngineTest";
import { getErrorMessage } from "@/lib/errorUtils";
import MarkdownLite from "./MarkdownLite";

interface Props {
	url: string;
	mode: EngineTestMode;
	/** True when the report covers a multi-page site crawl rather than a
	 *  single page — the live test only ever checks `url` itself, so this
	 *  just clarifies scope rather than changing behavior. */
	siteWide?: boolean;
}

const COPY: Record<EngineTestMode, { title: string; subtitle: string; label: string }> = {
	aeo: {
		title: "🧪 Live AEO test",
		subtitle:
			"Sends this page to your AI provider and asks it to act as an answer engine (ChatGPT, Perplexity, AI Overviews) deciding whether it would cite this page.",
		label: "answer engine",
	},
	geo: {
		title: "🧪 Live GEO test",
		subtitle:
			"Sends this page to your AI provider and asks it to act as a generative engine deciding whether it would pull facts from this page into a synthesized answer.",
		label: "generative engine",
	},
};

const VERDICT_LINE = /^VERDICT:\s*(Likely|Possible|Unlikely)\s*/i;

const VERDICT_STYLE: Record<string, { bg: string; color: string; text: string }> = {
	likely: { bg: "var(--sev-info)", color: "var(--good)", text: "Likely to be cited" },
	possible: { bg: "var(--sev-medium-bg)", color: "var(--sev-medium)", text: "Might be cited" },
	unlikely: { bg: "var(--sev-critical-bg)", color: "var(--sev-critical)", text: "Unlikely to be cited" },
};

export default function AIEngineTest({ url, mode, siteWide }: Props) {
	const { provider, apiKey, model, isConfigured, hydrated } = useAIProvider();
	const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
	const [output, setOutput] = useState("");
	const [error, setError] = useState<string | null>(null);

	const copy = COPY[mode];

	const handleRun = async () => {
		setStatus("loading");
		setOutput("");
		setError(null);

		try {
			const res = await fetch("/api/ai-engine-test", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ provider, apiKey, model, url, mode }),
			});

			if (!res.ok) {
				const body = await res.json().catch(() => null);
				throw new Error(body?.error ?? `Request failed (HTTP ${res.status})`);
			}
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
		} catch (err: unknown) {
			setError(getErrorMessage(err, "Failed to run the live test"));
			setStatus("error");
		}
	};

	if (!hydrated) return null;

	const verdictMatch = output.match(VERDICT_LINE);
	const verdictKey = verdictMatch?.[1]?.toLowerCase();
	const verdictStyle = verdictKey ? VERDICT_STYLE[verdictKey] : null;
	const body = verdictMatch ? output.slice(verdictMatch[0].length).replace(/^\s+/, "") : output;

	return (
		<div className="ai-insights-card ai-engine-test-card">
			<div className="ai-insights-head">
				<div>
					<h3>{copy.title}</h3>
					<p className="ai-insights-subtitle">
						{copy.subtitle}
						{siteWide && " Checks the URL you entered — not every crawled page."}
					</p>
				</div>

				{status !== "loading" && (
					<button
						type="button"
						className="apply-btn"
						disabled={!isConfigured}
						onClick={handleRun}
						title={!isConfigured ? "Set up an AI provider above first" : undefined}
					>
						{status === "done" ? "Run again" : "Run live test"}
					</button>
				)}
			</div>

			{!isConfigured && (
				<p className="ai-insights-hint">Set up an AI provider above to enable this.</p>
			)}

			{status === "loading" && !output && (
				<p className="ai-insights-hint">
					Asking your {copy.label} to read this page…
				</p>
			)}

			{status === "error" && (
				<div className="ai-fix-error" style={{ textAlign: "left" }}>
					{error}
					<button type="button" className="link-btn" onClick={handleRun}>
						retry
					</button>
				</div>
			)}

			{output && (
				<>
					{verdictStyle && (
						<span
							className="engine-test-verdict"
							style={{ background: verdictStyle.bg, color: verdictStyle.color }}
						>
							{verdictStyle.text}
						</span>
					)}
					<div className="ai-insights-output">
						<MarkdownLite text={body} />
						{status === "loading" && <span className="md-cursor" aria-hidden="true" />}
					</div>
				</>
			)}
		</div>
	);
}
