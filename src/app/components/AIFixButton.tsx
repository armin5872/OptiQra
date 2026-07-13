"use client";

import { useState } from "react";
import type { Issue } from "@/lib/auditUtils";
import { useAIProvider } from "@/lib/hooks/useAIProvider";
import MarkdownLite from "./MarkdownLite";

interface Props {
	issue: Issue;
	pageUrl: string;
	category: string;
	onResolve: () => void;
}

export default function AIFixButton({ issue, pageUrl, category, onResolve }: Props) {
	const { provider, apiKey, model, isConfigured, hydrated } = useAIProvider();
	const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
	const [output, setOutput] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [copied, setCopied] = useState(false);
	const [modalOpen, setModalOpen] = useState(false);

	const handleCopy = async () => {
		try {
			await navigator.clipboard.writeText(output);
			setCopied(true);
			setTimeout(() => setCopied(false), 1500);
		} catch {
			// clipboard API unavailable — silently ignore, the text is still selectable
		}
	};

	if (issue.resolved) {
		return (
			<button className="apply-btn done" disabled>
				Resolved
			</button>
		);
	}

	// No provider set up yet — fall back to the original plain "Mark resolved"
	// behavior rather than blocking the workflow entirely.
	if (!hydrated || !isConfigured) {
		return (
			<button className="apply-btn" onClick={onResolve}>
				Mark resolved
			</button>
		);
	}

	const handleGenerate = async () => {
		setStatus("loading");
		setOutput("");
		setError(null);
		setModalOpen(true); // Open modal immediately when generating

		try {
			const res = await fetch("/api/ai-fix", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					provider,
					apiKey,
					model,
					pageUrl,
					category,
					issue: {
						title: issue.title,
						detail: issue.detail,
						fix: issue.fix,
						severity: issue.severity,
					},
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
			setError(err?.message ?? "Failed to generate fix");
			setStatus("error");
		}
	};

	const closeModal = () => setModalOpen(false);
	const openModal = () => setModalOpen(true);

	return (
		<>
			{/* Main button area */}
			<div className="ai-fix-block">
				{status === "idle" && (
					<button type="button" className="apply-btn" onClick={handleGenerate}>
						Generate fix with AI
					</button>
				)}

				{status === "loading" && !output && (
					<button type="button" className="apply-btn" disabled>
						Generating…
					</button>
				)}

				{status === "error" && !output && (
					<div className="ai-fix-error">
						{error}
						<button type="button" className="link-btn" onClick={handleGenerate}>
							retry
						</button>
					</div>
				)}

				{output && status === "done" && (
					<button type="button" className="apply-btn" onClick={openModal}>
						Show AI fix
					</button>
				)}
			</div>

			{/* Modal overlay and content */}
			{modalOpen && (
				<>
					<div className="modal-overlay" onClick={closeModal} />
					<div className="modal-container">
						<div className="modal-header">
							<h2>AI-Generated Fix</h2>
							<button
								type="button"
								className="modal-close"
								onClick={closeModal}
								aria-label="Close modal"
							>
								✕
							</button>
						</div>

						{status === "loading" && !output && (
							<div className="modal-body">
								<p className="modal-loading">Generating fix…</p>
							</div>
						)}

						{status === "error" && output === "" && (
							<div className="modal-body">
								<div className="modal-error">
									<p>{error}</p>
									<button type="button" className="link-btn" onClick={handleGenerate}>
										retry
									</button>
								</div>
							</div>
						)}

						{output && (
							<>
								<div className="modal-body">
									<div className="ai-fix-output-modal">
										<MarkdownLite text={output} />
										{status === "loading" && <span className="md-cursor" aria-hidden="true" />}
									</div>
								</div>

								{status === "done" && (
									<div className="modal-footer">
										<button type="button" className="link-btn" onClick={handleCopy}>
											{copied ? "copied!" : "copy"}
										</button>
										<button type="button" className="link-btn" onClick={handleGenerate}>
											regenerate
										</button>
										<button
											type="button"
											className="apply-btn"
											onClick={() => {
												onResolve();
												closeModal();
											}}
										>
											Mark resolved
										</button>
									</div>
								)}
							</>
						)}
					</div>
				</>
			)}
		</>
	);
}
