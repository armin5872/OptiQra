"use client";

import { useState } from "react";
import type { Issue } from "@/lib/auditUtils";
import { useAIProvider } from "@/lib/hooks/useAIProvider";
import { getErrorMessage } from "@/lib/errorUtils";
import MarkdownLite from "./MarkdownLite";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogBody,
	DialogFooter,
} from "@/components/ui/dialog";

interface Props {
	issue: Issue;
	pageUrl: string;
	category: string;
	/** Detected tech stack of the scanned site, if known — lets the fix be
	 *  written in the site's actual stack instead of generic HTML. */
	stack?: { primary: string; summary: string; guidance: string };
	onResolve: () => void;
}

export default function AIFixButton({ issue, pageUrl, category, stack, onResolve }: Props) {
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
			<Button size="sm" variant="secondary" disabled className="shrink-0">
				Resolved
			</Button>
		);
	}

	// No provider set up yet — fall back to the original plain "Mark resolved"
	// behavior rather than blocking the workflow entirely.
	if (!hydrated || !isConfigured) {
		return (
			<Button size="sm" variant="brand" className="shrink-0" onClick={onResolve}>
				Mark resolved
			</Button>
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
					stack,
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
		} catch (err: unknown) {
			setError(getErrorMessage(err, "Failed to generate fix"));
			setStatus("error");
		}
	};

	const closeModal = () => setModalOpen(false);
	const openModal = () => setModalOpen(true);

	return (
		<>
			{/* Main button area */}
			<div className="flex w-full max-w-[380px] shrink-0 flex-col items-end gap-2">
				{status === "idle" && (
					<Button size="sm" variant="brand" onClick={handleGenerate}>
						Generate fix with AI
					</Button>
				)}

				{status === "loading" && !output && (
					<Button size="sm" variant="brand" disabled>
						Generating…
					</Button>
				)}

				{status === "error" && !output && (
					<div className="text-right text-[12.5px] text-critical">
						{error}{" "}
						<button
							type="button"
							className="text-brand underline-offset-2 hover:underline"
							onClick={handleGenerate}
						>
							retry
						</button>
					</div>
				)}

				{output && status === "done" && (
					<Button size="sm" variant="brand" onClick={openModal}>
						Show AI fix
					</Button>
				)}
			</div>

			{/* Modal */}
			<Dialog open={modalOpen} onOpenChange={(open) => !open && closeModal()}>
				<DialogContent className="max-w-2xl">
					<DialogHeader>
						<DialogTitle>AI-Generated Fix</DialogTitle>
					</DialogHeader>

					{status === "loading" && !output && (
						<DialogBody>
							<p className="my-10 text-center text-ink-soft italic">
								Generating fix…
							</p>
						</DialogBody>
					)}

					{status === "error" && output === "" && (
						<DialogBody>
							<div className="text-center">
								<p className="mb-3 text-critical">{error}</p>
								<button
									type="button"
									className="text-brand underline-offset-2 hover:underline"
									onClick={handleGenerate}
								>
									retry
								</button>
							</div>
						</DialogBody>
					)}

					{output && (
						<>
							<DialogBody>
								<div className="font-(family-name:--font-readable) leading-relaxed text-ink">
									<MarkdownLite text={output} />
									{status === "loading" && (
										<span className="md-cursor" aria-hidden="true" />
									)}
								</div>
							</DialogBody>

							{status === "done" && (
								<DialogFooter>
									<button
										type="button"
										className="text-sm text-brand underline-offset-2 hover:underline"
										onClick={handleCopy}
									>
										{copied ? "copied!" : "copy"}
									</button>
									<button
										type="button"
										className="text-sm text-brand underline-offset-2 hover:underline"
										onClick={handleGenerate}
									>
										regenerate
									</button>
									<Button
										size="sm"
										variant="brand"
										onClick={() => {
											onResolve();
											closeModal();
										}}
									>
										Mark resolved
									</Button>
								</DialogFooter>
							)}
						</>
					)}
				</DialogContent>
			</Dialog>
		</>
	);
}
