"use client";

import { useState } from "react";
import { useAIProvider } from "@/lib/hooks/useAIProvider";
import type { EngineTestMode } from "@/lib/aiEngineTest";
import { getErrorMessage } from "@/lib/errorUtils";
import MarkdownLite from "./MarkdownLite";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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

const VERDICT_STYLE: Record<string, { className: string; text: string }> = {
	likely: { className: "bg-sev-info border border-sev-info-border text-good", text: "Likely to be cited" },
	possible: { className: "bg-sev-medium-bg text-sev-medium", text: "Might be cited" },
	unlikely: { className: "bg-sev-critical-bg text-sev-critical", text: "Unlikely to be cited" },
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
		<Card className="mb-6 gap-3 border-t-2 border-t-brand p-[18px_20px]">
			<CardContent className="flex flex-col gap-3 p-0">
				<div className="flex flex-wrap items-start justify-between gap-4">
					<div>
						<h3 className="m-0 mb-1 text-[15px] font-semibold">{copy.title}</h3>
						<p className="m-0 max-w-[46ch] font-(family-name:--font-readable) text-[12.5px] text-ink-soft">
							{copy.subtitle}
							{siteWide && " Checks the URL you entered — not every crawled page."}
						</p>
					</div>

					{status !== "loading" && (
						<Button
							type="button"
							variant="brand"
							size="sm"
							disabled={!isConfigured}
							onClick={handleRun}
							title={!isConfigured ? "Set up an AI provider above first" : undefined}
						>
							{status === "done" ? "Run again" : "Run live test"}
						</Button>
					)}
				</div>

				{!isConfigured && (
					<p className="m-0 text-[12.5px] text-ink-soft">
						Set up an AI provider above to enable this.
					</p>
				)}

				{status === "loading" && !output && (
					<p className="m-0 text-[12.5px] text-ink-soft">
						Asking your {copy.label} to read this page…
					</p>
				)}

				{status === "error" && (
					<div className="text-left text-[12.5px] text-critical">
						{error}{" "}
						<button
							type="button"
							className="text-brand underline-offset-2 hover:underline"
							onClick={handleRun}
						>
							retry
						</button>
					</div>
				)}

				{output && (
					<>
						{verdictStyle && (
							<span
								className={cn(
									"inline-block self-start rounded-full px-2.5 py-0.5 font-(family-name:--font-mono) text-[11px] font-semibold tracking-[0.04em]",
									verdictStyle.className,
								)}
							>
								{verdictStyle.text}
							</span>
						)}
						<div className="font-(family-name:--font-readable) rounded-lg border border-line bg-surface-2 px-5 py-4 text-ink">
							<MarkdownLite text={body} />
							{status === "loading" && <span className="md-cursor" aria-hidden="true" />}
						</div>
					</>
				)}
			</CardContent>
		</Card>
	);
}
