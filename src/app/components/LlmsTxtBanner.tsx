"use client";

import { useState } from "react";
import { buildLlmsTxt } from "@/lib/generateCrawlFiles";
import { downloadText } from "@/lib/reportExport/download";
import { useAIProvider } from "@/lib/hooks/useAIProvider";
import { readNDJSONStream, type DeltaStreamEvent } from "@/lib/ndjsonStream";
import { getErrorMessage } from "@/lib/errorUtils";
import type { StackPromptContext } from "@/lib/stackDetector";

interface Props {
	siteUrl: string;
	pagesScanned?: string[];
	pageTitle?: string;
	pageDescription?: string;
	stack?: StackPromptContext;
}

export default function LlmsTxtBanner({ siteUrl, pagesScanned, pageTitle, pageDescription, stack }: Props) {
	const { provider, apiKey, model, isConfigured, hydrated } = useAIProvider();
	const [dismissed, setDismissed] = useState(false);
	const [mode, setMode] = useState<"idle" | "ai-loading" | "ai-done" | "ai-error">("idle");
	const [preview, setPreview] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [templateDownloaded, setTemplateDownloaded] = useState(false);
	const [copied, setCopied] = useState(false);

	if (dismissed) return null;

	const handleTemplateDownload = () => {
		downloadText(buildLlmsTxt(siteUrl, pagesScanned), "llms.txt", "text/plain");
		setTemplateDownloaded(true);
	};

	const handleAIGenerate = async () => {
		setMode("ai-loading");
		setPreview("");
		setError(null);

		try {
			const res = await fetch("/api/generate-llms-txt", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					provider,
					apiKey,
					model,
					siteUrl,
					pagesScanned,
					pageTitle,
					pageDescription,
					stack,
				}),
			});

			if (!res.body) throw new Error("No response stream");

			for await (const event of readNDJSONStream<DeltaStreamEvent>(res.body)) {
				if (event.type === "delta") setPreview((prev) => prev + event.text);
				if (event.type === "error") throw new Error(event.message);
			}

			setMode("ai-done");
		} catch (err: unknown) {
			setError(getErrorMessage(err, "Failed to generate llms.txt"));
			setMode("ai-error");
		}
	};

	const handleDownloadPreview = () => {
		downloadText(preview, "llms.txt", "text/plain");
	};

	const handleCopyPreview = async () => {
		try {
			await navigator.clipboard.writeText(preview);
			setCopied(true);
			setTimeout(() => setCopied(false), 1500);
		} catch {
			// clipboard API unavailable — silently ignore, the text is still selectable
		}
	};

	return (
		<div className="missing-file-banner">
			<span className="missing-file-banner-icon" aria-hidden="true">
				🧠
			</span>
			<div className="missing-file-banner-body">
				<div className="missing-file-banner-title">Your website doesn&apos;t seem to have an llms.txt</div>
				<div className="missing-file-banner-detail">
					This emerging convention gives AI assistants like ChatGPT and Claude a concise map of your
					site so they can answer questions about it accurately. We can generate one from the pages we
					just scanned.
				</div>

				<div className="missing-file-banner-actions">
					<button
						type="button"
						className={`missing-file-banner-generate${templateDownloaded ? " done" : ""}`}
						onClick={handleTemplateDownload}
					>
						{templateDownloaded ? "Downloaded ✓ Generate again" : "Generate llms.txt"}
					</button>

					{hydrated && mode !== "ai-loading" && (
						<button
							type="button"
							className="missing-file-banner-generate llms-ai-btn"
							disabled={!isConfigured}
							title={!isConfigured ? "Set up an AI provider in Settings first" : undefined}
							onClick={handleAIGenerate}
						>
							✨ {mode === "ai-done" ? "Regenerate with AI" : "Generate with AI"}
						</button>
					)}

					{mode === "ai-loading" && <span className="missing-file-banner-hint">Writing with AI…</span>}

					{templateDownloaded && mode === "idle" && (
						<span className="missing-file-banner-hint">Upload it to your site root as /llms.txt</span>
					)}
				</div>

				{hydrated && !isConfigured && (
					<div className="missing-file-banner-hint llms-ai-hint">
						The plain generator above works with no setup. Configure an AI provider in Settings for a
						version with a real summary and grouped sections instead of a bare page list.
					</div>
				)}

				{mode === "ai-error" && (
					<div className="ai-fix-error" style={{ textAlign: "left", marginTop: 8 }}>
						{error}
						<button type="button" className="link-btn" onClick={handleAIGenerate}>
							retry
						</button>
					</div>
				)}

				{preview && (
					<div className="llms-ai-preview">
						<pre>
							{preview}
							{mode === "ai-loading" && <span className="md-cursor" aria-hidden="true" />}
						</pre>
						{mode === "ai-done" && (
							<div className="llms-ai-preview-actions">
								<button type="button" className="missing-file-banner-generate" onClick={handleDownloadPreview}>
									Download llms.txt
								</button>
								<button type="button" className="link-btn" onClick={handleCopyPreview}>
									{copied ? "copied!" : "copy"}
								</button>
							</div>
						)}
					</div>
				)}
			</div>
			<button
				type="button"
				className="missing-file-banner-dismiss"
				aria-label="Dismiss llms.txt suggestion"
				onClick={() => setDismissed(true)}
			>
				✕
			</button>
		</div>
	);
}
