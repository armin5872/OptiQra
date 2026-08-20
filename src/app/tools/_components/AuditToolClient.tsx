"use client";

import { useState } from "react";
import type { ToolDef } from "@/lib/toolsRegistry";
import type { Issue } from "@/lib/auditUtils";
import IssueList from "./IssueList";

interface AuditResponse {
	ok: boolean;
	message?: string;
	score?: number;
	issues?: Issue[];
	passed?: Issue[];
	extra?: Record<string, unknown>;
}

function scoreColor(score: number) {
	if (score >= 80) return "var(--good)";
	if (score >= 50) return "var(--warn)";
	return "var(--critical)";
}

export default function AuditToolClient({ tool }: { tool: ToolDef }) {
	const [input, setInput] = useState("");
	const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
	const [result, setResult] = useState<AuditResponse | null>(null);
	const [error, setError] = useState("");

	const isMultiUrl = tool.inputKind === "urls";
	const isText = tool.inputKind === "text";

	const run = async () => {
		if (!input.trim()) return;
		setStatus("loading");
		setError("");
		setResult(null);

		const body: Record<string, unknown> = { source: tool.source, idPrefixes: tool.idPrefixes };
		if (isMultiUrl) {
			body.urls = input
				.split("\n")
				.map((l) => l.trim())
				.filter(Boolean);
		} else {
			body.url = normalizeUrl(input.trim());
		}

		try {
			const res = await fetch("/api/tools/audit", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});
			const data: AuditResponse = await res.json();
			if (!data.ok) {
				setError(data.message || "Something went wrong running this check.");
				setStatus("error");
				return;
			}
			setResult(data);
			setStatus("done");
		} catch {
			setError("Couldn't reach the server. Check your connection and try again.");
			setStatus("error");
		}
	};

	return (
		<div className="tool-panel">
			<div className="tool-input-row">
				{isMultiUrl || isText ? (
					<textarea
						className="tool-textarea"
						placeholder={isText ? tool.inputLabel || "Describe the issue…" : "https://example.com/page-1\nhttps://example.com/page-2"}
						value={input}
						onChange={(e) => setInput(e.target.value)}
						rows={isText ? 5 : 4}
					/>
				) : (
					<input
						className="tool-url-input"
						type="text"
						inputMode="url"
						placeholder={tool.inputLabel ? `${tool.inputLabel} — e.g. https://example.com` : "https://example.com"}
						value={input}
						onChange={(e) => setInput(e.target.value)}
						onKeyDown={(e) => e.key === "Enter" && run()}
					/>
				)}
				<button type="button" className="tool-run-btn" onClick={run} disabled={status === "loading" || !input.trim()}>
					{status === "loading" ? "Checking…" : "Run check"}
				</button>
			</div>

			{status === "error" && <div className="tool-error">{error}</div>}

			{status === "done" && result && (
				<div className="tool-result">
					{typeof result.score === "number" && (
						<div className="tool-score-row">
							<div className="tool-score-circle" style={{ borderColor: scoreColor(result.score) }}>
								<span style={{ color: scoreColor(result.score) }}>{result.score}</span>
							</div>
							<div className="tool-score-meta">
								<div>{result.issues?.length || 0} issue(s) found</div>
								<div className="tool-score-sub">{result.passed?.length || 0} checks passed</div>
							</div>
						</div>
					)}
					<ExtraPanel source={tool.source} extra={result.extra} />
					<IssueList issues={result.issues || []} passed={result.passed || []} />
				</div>
			)}
		</div>
	);
}

function normalizeUrl(u: string) {
	if (!/^https?:\/\//i.test(u)) return `https://${u}`;
	return u;
}

function ExtraPanel({ source, extra }: { source?: string; extra?: Record<string, unknown> }) {
	if (!extra || Object.keys(extra).length === 0) return null;

	if (source === "robots") {
		const botStatus = extra.botStatus as { bot: string; blocked: boolean }[] | undefined;
		if (!botStatus) return null;
		return (
			<div className="tool-extra-panel">
				<div className="tool-extra-title">AI crawler access</div>
				<div className="bot-grid">
					{botStatus.map((b) => (
						<div key={b.bot} className={`bot-pill ${b.blocked ? "blocked" : "allowed"}`}>
							{b.bot}: {b.blocked ? "Blocked" : "Allowed"}
						</div>
					))}
				</div>
			</div>
		);
	}

	if (source === "sitemap") {
		return (
			<div className="tool-extra-panel">
				<div className="tool-extra-title">
					{String(extra.urlCount ?? 0)} URL(s) found{extra.isIndex ? " (sitemap index)" : ""}
				</div>
			</div>
		);
	}

	if (source === "links") {
		return (
			<div className="tool-extra-panel">
				<div className="tool-extra-title">
					{String(extra.totalLinks ?? 0)} links checked — {String(extra.internal ?? 0)} internal, {String(extra.external ?? 0)} external
				</div>
			</div>
		);
	}

	if (source === "stack") {
		const stack = extra.stack as { primarySignal?: { name: string } | null; signals?: { name: string; category: string }[] } | undefined;
		if (!stack) return null;
		return (
			<div className="tool-extra-panel">
				{stack.primarySignal && <div className="tool-extra-title">Primary: {stack.primarySignal.name}</div>}
				{stack.signals && stack.signals.length > 0 && (
					<div className="bot-grid">
						{stack.signals.map((s, i) => (
							<div key={i} className="bot-pill allowed">
								{s.name}
							</div>
						))}
					</div>
				)}
			</div>
		);
	}

	if (source === "images") {
		return (
			<div className="tool-extra-panel">
				<div className="tool-extra-title">{String(extra.totalImages ?? 0)} image(s) scanned</div>
			</div>
		);
	}

	if (source === "seo" && extra.content) {
		const content = extra.content as { wordCount: number; topKeywords: { word: string; count: number; density: number }[] };
		return (
			<div className="tool-extra-panel">
				<div className="tool-extra-title">{content.wordCount} words</div>
				{content.topKeywords.length > 0 && (
					<div className="keyword-table">
						{content.topKeywords.map((k) => (
							<div key={k.word} className="keyword-row">
								<span>{k.word}</span>
								<span>{k.count}×</span>
								<span>{k.density}%</span>
							</div>
						))}
					</div>
				)}
			</div>
		);
	}

	return null;
}
