"use client";

import { useState } from "react";
import type { ToolDef } from "@/lib/toolsRegistry";
import AIProviderSetup from "@/app/components/AIProviderSetup";
import AIFixButton from "@/app/components/AIFixButton";
import { useAIProvider } from "@/lib/hooks/useAIProvider";
import { readNDJSONStream, type DeltaStreamEvent } from "@/lib/ndjsonStream";
import { getErrorMessage } from "@/lib/errorUtils";
import type { Severity } from "@/lib/auditUtils";
import ShareReport from "@/app/components/ShareReport";
import GetBadge from "@/app/components/GetBadge";
import { aiLlmsTxtShareCopy, aiSeoFixShareCopy, toolBadgeIntro } from "@/lib/shareMessages";

export default function AiToolClient({ tool }: { tool: ToolDef }) {
	if (tool.aiKind === "llms-txt") return <LlmsTxtGenerator />;
	if (tool.aiKind === "seo-fix") return <SeoFixGenerator />;
	return null;
}

function LlmsTxtGenerator() {
	const { provider, apiKey, model, isConfigured } = useAIProvider();
	const [url, setUrl] = useState("");
	const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
	const [output, setOutput] = useState("");
	const [error, setError] = useState("");

	const run = async () => {
		if (!url.trim() || !provider || !apiKey) return;
		setStatus("loading");
		setOutput("");
		setError("");
		try {
			const res = await fetch("/api/generate-llms-txt", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ provider, apiKey, model, siteUrl: /^https?:\/\//i.test(url) ? url : `https://${url}` }),
			});
			if (!res.body) throw new Error("No response stream");
			for await (const event of readNDJSONStream<DeltaStreamEvent>(res.body)) {
				if (event.type === "delta") setOutput((prev) => prev + event.text);
				if (event.type === "error") throw new Error(event.message);
			}
			setStatus("done");
		} catch (err) {
			setError(getErrorMessage(err, "Failed to generate llms.txt"));
			setStatus("error");
		}
	};

	const copy = async () => {
		try {
			await navigator.clipboard.writeText(output);
		} catch {
			// ignore
		}
	};

	return (
		<div className="tool-panel">
			<AIProviderSetup />
			<div className="tool-input-row" style={{ marginTop: 16 }}>
				<input
					className="tool-url-input"
					type="text"
					inputMode="url"
					placeholder="https://example.com"
					value={url}
					onChange={(e) => setUrl(e.target.value)}
					onKeyDown={(e) => e.key === "Enter" && run()}
				/>
				<button type="button" className="tool-run-btn" onClick={run} disabled={!isConfigured || !url.trim() || status === "loading"}>
					{status === "loading" ? "Generating…" : "Generate llms.txt"}
				</button>
			</div>
			{!isConfigured && <p className="ai-insights-hint">Add an API key above to generate an llms.txt.</p>}
			{status === "error" && <div className="tool-error">{error}</div>}
			{output && (
				<div className="tool-output-block" style={{ marginTop: 16 }}>
					<div className="tool-output-bar">
						<span>llms.txt</span>
						<button type="button" className="link-btn" onClick={copy}>
							Copy
						</button>
					</div>
					<pre className="tool-output-code">
						<code>{output}</code>
					</pre>
				</div>
			)}
			{status === "done" && output && (
				<div className="tool-share-bar">
					<ShareReport
						{...aiLlmsTxtShareCopy({ url: /^https?:\/\//i.test(url) ? url : `https://${url}` })}
						buttonLabel="Share result"
						shareTitle="My generated llms.txt"
					/>
					<GetBadge intro={toolBadgeIntro("llms.txt Generator")} />
				</div>
			)}
		</div>
	);
}

function SeoFixGenerator() {
	const [pageUrl, setPageUrl] = useState("");
	const [category, setCategory] = useState("SEO");
	const [title, setTitle] = useState("");
	const [detail, setDetail] = useState("");
	const [severity, setSeverity] = useState<Severity>("medium");
	const [submitted, setSubmitted] = useState(false);
	const [resolved, setResolved] = useState(false);

	const canSubmit = pageUrl.trim() && title.trim() && detail.trim();

	return (
		<div className="tool-panel">
			<AIProviderSetup />
			<div className="tool-form-grid" style={{ marginTop: 16 }}>
				<label className="tool-field">
					<span>Page URL</span>
					<input value={pageUrl} onChange={(e) => setPageUrl(e.target.value)} placeholder="https://example.com/page" />
				</label>
				<label className="tool-field">
					<span>Category</span>
					<select value={category} onChange={(e) => setCategory(e.target.value)}>
						{["SEO", "Speed", "Accessibility", "Security", "Conversions", "GEO", "AEO"].map((c) => (
							<option key={c} value={c}>
								{c}
							</option>
						))}
					</select>
				</label>
				<label className="tool-field">
					<span>Issue title</span>
					<input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Missing meta description" />
				</label>
				<label className="tool-field">
					<span>Detail (what&apos;s actually happening, site-specific)</span>
					<textarea rows={4} value={detail} onChange={(e) => setDetail(e.target.value)} placeholder="The page has no <meta name=&quot;description&quot;> tag, so search engines will auto-generate a snippet." />
				</label>
				<label className="tool-field">
					<span>Severity</span>
					<select value={severity} onChange={(e) => setSeverity(e.target.value as Severity)}>
						{(["critical", "high", "medium", "low", "informational"] as Severity[]).map((s) => (
							<option key={s} value={s}>
								{s}
							</option>
						))}
					</select>
				</label>
			</div>
			{!submitted ? (
				<button type="button" className="tool-run-btn" style={{ marginTop: 12 }} disabled={!canSubmit} onClick={() => setSubmitted(true)}>
					Set up fix request
				</button>
			) : (
				<div style={{ marginTop: 16 }}>
					<AIFixButton
						issue={{ id: "custom", title, detail, fix: "", weight: 0, severity, resolved }}
						pageUrl={pageUrl}
						category={category}
						onResolve={() => setResolved(true)}
					/>
					{resolved && (
						<div className="tool-share-bar">
							<ShareReport
								{...aiSeoFixShareCopy({ issueTitle: title })}
								buttonLabel="Share result"
								shareTitle="My AI-generated SEO fix"
							/>
							<GetBadge intro={toolBadgeIntro("AI SEO Fix Generator")} />
						</div>
					)}
				</div>
			)}
		</div>
	);
}
