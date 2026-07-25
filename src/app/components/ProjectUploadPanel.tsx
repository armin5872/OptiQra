"use client";

import { useRef, useState } from "react";
import { useAIProvider } from "@/lib/hooks/useAIProvider";
import AIProviderSetup from "./AIProviderSetup";
import { getErrorMessage } from "@/lib/errorUtils";
import type { AutoFixResult } from "@/lib/autoFixEngine";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { Upload } from "lucide-react";

type ProjectMode = "audit" | "fix";

interface PerFileSummary {
	path: string;
	results: AutoFixResult[];
}

interface ProjectResponseData {
	mode: ProjectMode;
	zipBase64?: string;
	stack: string;
	summary: {
		filesFixed: number;
		filesSkippedTooMany: number;
		fixed: number;
		duplicated: number;
		aiNeeded: number;
		skipped: number;
	};
	perFileResults: PerFileSummary[];
	projectResults: AutoFixResult[];
	duplicateBankUpdates: Record<string, string>;
}

type StreamEvent =
	| { type: "status"; message: string }
	| { type: "progress"; processed: number; total: number; currentFile?: string }
	| { type: "done"; data: ProjectResponseData }
	| { type: "error"; message: string };

const DUPLICATE_BANK_KEY = "optiqra_autofix_bank";

function readDuplicateBank(): Record<string, string> {
	if (typeof window === "undefined") return {};
	try {
		return JSON.parse(sessionStorage.getItem(DUPLICATE_BANK_KEY) || "{}");
	} catch {
		return {};
	}
}

function writeDuplicateBankUpdates(updates: Record<string, string>) {
	if (typeof window === "undefined" || Object.keys(updates).length === 0) return;
	const current = readDuplicateBank();
	sessionStorage.setItem(DUPLICATE_BANK_KEY, JSON.stringify({ ...current, ...updates }));
}

/** Recursively walks a dropped folder's DataTransferItemList into a flat
 *  array of Files, renamed so their `.name` carries the relative path
 *  (FormData only preserves `.name`, not a separate path field). */
async function filesFromDataTransfer(items: DataTransferItemList): Promise<File[]> {
	const out: File[] = [];

	function readEntry(entry: FileSystemEntry, prefix: string): Promise<void> {
		return new Promise((resolve) => {
			if (entry.isFile) {
				(entry as FileSystemFileEntry).file((file) => {
					out.push(new File([file], prefix + file.name, { type: file.type }));
					resolve();
				}, () => resolve());
			} else if (entry.isDirectory) {
				const reader = (entry as FileSystemDirectoryEntry).createReader();
				const readAll = () => {
					reader.readEntries(async (entries) => {
						if (entries.length === 0) {
							resolve();
							return;
						}
						await Promise.all(entries.map((e) => readEntry(e, prefix + entry.name + "/")));
						readAll(); // directory readers only return a batch at a time
					}, () => resolve());
				};
				readAll();
			} else {
				resolve();
			}
		});
	}

	const entries: FileSystemEntry[] = [];
	for (let i = 0; i < items.length; i++) {
		const entry = items[i].webkitGetAsEntry?.();
		if (entry) entries.push(entry);
	}
	await Promise.all(entries.map((e) => readEntry(e, "")));
	return out;
}

function downloadZip(base64: string, filename: string) {
	const bytes = atob(base64);
	const arr = new Uint8Array(bytes.length);
	for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
	const blob = new Blob([arr], { type: "application/zip" });
	const href = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = href;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	a.remove();
	URL.revokeObjectURL(href);
}

const STATUS_LABEL: Record<AutoFixResult["status"], string> = {
	fixed: "Auto-fixable",
	duplicated: "Auto-fixable",
	"ai-needed": "Needs AI / manual",
	skipped: "Left as-is",
};

export default function ProjectUploadPanel() {
	const { provider, apiKey, model, isConfigured, hydrated } = useAIProvider();
	const [mode, setMode] = useState<ProjectMode>("audit");
	const [dragOver, setDragOver] = useState(false);
	const [status, setStatus] = useState<"idle" | "uploading" | "error">("idle");
	const [error, setError] = useState<string | null>(null);
	const [result, setResult] = useState<ProjectResponseData | null>(null);
	const [showKeyPanel, setShowKeyPanel] = useState(false);
	const [expandedFile, setExpandedFile] = useState<string | null>(null);
	const [progress, setProgress] = useState<{ processed: number; total: number } | null>(null);
	const [statusMessage, setStatusMessage] = useState("");
	const folderInputRef = useRef<HTMLInputElement>(null);
	const zipInputRef = useRef<HTMLInputElement>(null);

	const runUpload = async (files: File[]) => {
		if (files.length === 0) return;
		setStatus("uploading");
		setError(null);
		setResult(null);
		setProgress(null);
		setStatusMessage("Reading your project…");

		const form = new FormData();
		for (const f of files) form.append("project", f, f.name);
		form.append("mode", mode);
		form.append("siteUrl", "");
		if (mode === "fix" && hydrated && isConfigured) {
			form.append("provider", provider || "");
			form.append("apiKey", apiKey);
			form.append("model", model);
		}
		form.append("duplicateBank", JSON.stringify(readDuplicateBank()));

		try {
			const res = await fetch("/api/auto-fix-project", { method: "POST", body: form });
			if (!res.ok || !res.body) {
				let message = mode === "audit" ? "Failed to audit the project" : "Failed to auto-fix the project";
				try {
					const json = await res.json();
					message = json.error || message;
				} catch {
					// non-JSON error body — fall back to the default message
				}
				throw new Error(message);
			}

			const reader = res.body.getReader();
			const decoder = new TextDecoder();
			let buffer = "";
			let finished = false;

			while (true) {
				const { value, done } = await reader.read();
				if (done) break;
				buffer += decoder.decode(value, { stream: true });

				let newlineIdx;
				while ((newlineIdx = buffer.indexOf("\n")) >= 0) {
					const line = buffer.slice(0, newlineIdx).trim();
					buffer = buffer.slice(newlineIdx + 1);
					if (!line) continue;

					let evt: StreamEvent;
					try {
						evt = JSON.parse(line) as StreamEvent;
					} catch {
						continue;
					}

					if (evt.type === "status") {
						setStatusMessage(evt.message);
					} else if (evt.type === "progress") {
						setProgress({ processed: evt.processed, total: evt.total });
						if (evt.currentFile) setStatusMessage(evt.currentFile);
					} else if (evt.type === "done") {
						setResult(evt.data);
						writeDuplicateBankUpdates(evt.data.duplicateBankUpdates || {});
						setStatus("idle");
						finished = true;
					} else if (evt.type === "error") {
						throw new Error(evt.message);
					}
				}
			}

			if (!finished) throw new Error("Connection closed before the scan finished.");
		} catch (err) {
			setError(getErrorMessage(err, mode === "audit" ? "Failed to audit the project" : "Failed to auto-fix the project"));
			setStatus("error");
		}
	};

	const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
		e.preventDefault();
		setDragOver(false);
		if (e.dataTransfer.items && e.dataTransfer.items.length > 0 && typeof e.dataTransfer.items[0].webkitGetAsEntry === "function") {
			const files = await filesFromDataTransfer(e.dataTransfer.items);
			void runUpload(files);
		} else {
			void runUpload(Array.from(e.dataTransfer.files));
		}
	};

	const handleFolderPick = (e: React.ChangeEvent<HTMLInputElement>) => {
		const list = e.target.files;
		if (!list) return;
		const files = Array.from(list).map(
			(f) => new File([f], (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name, { type: f.type }),
		);
		void runUpload(files);
		e.target.value = "";
	};

	const handleZipPick = (e: React.ChangeEvent<HTMLInputElement>) => {
		const list = e.target.files;
		if (!list || list.length === 0) return;
		void runUpload([list[0]]);
		e.target.value = "";
	};

	const percent = progress && progress.total > 0 ? Math.round((progress.processed / progress.total) * 100) : 0;

	return (
		<div className="mt-8 flex max-w-xl flex-col gap-4">
			<div className="relative flex items-center justify-center text-xs text-ink-soft before:absolute before:inset-x-0 before:top-1/2 before:h-px before:bg-line">
				<span className="relative bg-bg px-3">or</span>
			</div>

			<div
				className="grid grid-cols-2 gap-2"
				role="tablist"
				aria-label="Project upload mode"
			>
				<button
					type="button"
					role="tab"
					aria-selected={mode === "audit"}
					className={cn(
						"flex items-start gap-2.5 rounded-(--radius) border p-3.5 text-left transition-colors",
						mode === "audit" ?
							"border-brand bg-brand-soft"
						:	"border-line bg-card hover:border-brand/50",
					)}
					onClick={() => setMode("audit")}
					disabled={status === "uploading"}
				>
					<span className="text-lg" aria-hidden>🔍</span>
					<span className="flex flex-col gap-0.5">
						<span className="text-sm font-semibold text-ink">Audit</span>
						<span className="text-xs text-ink-soft">Scan &amp; report issues — nothing changes</span>
					</span>
				</button>
				<button
					type="button"
					role="tab"
					aria-selected={mode === "fix"}
					className={cn(
						"flex items-start gap-2.5 rounded-(--radius) border p-3.5 text-left transition-colors",
						mode === "fix" ?
							"border-brand bg-brand-soft"
						:	"border-line bg-card hover:border-brand/50",
					)}
					onClick={() => setMode("fix")}
					disabled={status === "uploading"}
				>
					<span className="text-lg" aria-hidden>🛠️</span>
					<span className="flex flex-col gap-0.5">
						<span className="text-sm font-semibold text-ink">Auto-fix</span>
						<span className="text-xs text-ink-soft">Apply fixes &amp; download the result</span>
					</span>
				</button>
			</div>

			<div
				className={cn(
					"flex flex-col items-center gap-3 rounded-(--radius) border-2 border-dashed border-line bg-card px-6 py-10 text-center transition-colors",
					dragOver && "border-brand bg-brand-soft",
				)}
				onDragOver={(e) => {
					e.preventDefault();
					setDragOver(true);
				}}
				onDragLeave={() => setDragOver(false)}
				onDrop={handleDrop}
			>
				<div className="text-ink-soft" aria-hidden>
					<Upload className="size-7" strokeWidth={1.8} />
				</div>
				<p className="text-sm font-semibold text-ink">Drag &amp; drop or upload your project</p>
				<p className="max-w-md font-(family-name:--font-readable) text-xs text-ink-soft">
					We&apos;ll scan every HTML, JSX/TSX, Vue, Svelte, and Angular file we find (Next.js, Nuxt, Vite/CRA, SvelteKit,
					Angular, or plain static/vanilla JS) — {mode === "audit" ? "and report what it finds" : "and auto-fix what it finds"}{" "}
					— right in your browser, nothing kept on our servers after.
				</p>
				<div className="mt-1 flex items-center gap-4">
					<Button
						type="button"
						variant="brand"
						size="sm"
						onClick={() => folderInputRef.current?.click()}
						disabled={status === "uploading"}
					>
						Choose folder
					</Button>
					<button
						type="button"
						className="text-sm text-brand underline-offset-2 hover:underline disabled:pointer-events-none disabled:opacity-50"
						onClick={() => zipInputRef.current?.click()}
						disabled={status === "uploading"}
					>
						or upload a .zip
					</button>
				</div>
				<input
					ref={folderInputRef}
					type="file"
					hidden
					// @ts-expect-error -- webkitdirectory isn't in the TS DOM lib yet
					webkitdirectory=""
					directory=""
					multiple
					onChange={handleFolderPick}
				/>
				<input ref={zipInputRef} type="file" hidden accept=".zip" onChange={handleZipPick} />
			</div>

			{mode === "fix" && (
				<>
					<button
						type="button"
						className="self-start text-xs text-brand underline-offset-2 hover:underline"
						onClick={() => setShowKeyPanel((v) => !v)}
					>
						{hydrated && isConfigured ? "AI key configured — for better fixes" : "For better fixes, add your AI API key (optional)"}
					</button>
					{showKeyPanel && <AIProviderSetup />}
					{hydrated && !isConfigured && (
						<p className="text-xs text-ink-soft">
							No key? Auto-fix still handles every mechanical issue (headers, tags, attributes, structure). Anything
							needing written content (titles, descriptions, alt text) will reuse a fix from elsewhere in your
							project if one exists, or stay unfixed.
						</p>
					)}
				</>
			)}
			{mode === "audit" && (
				<p className="text-xs text-ink-soft">
					Audit only looks — it detects the same issues Auto-fix would touch and reports them, without changing or
					downloading anything. Switch to Auto-fix any time to apply changes.
				</p>
			)}

			{status === "uploading" && (
				<div className="flex flex-col gap-2">
					<div className="flex justify-between font-(family-name:--font-mono) text-[13px] text-ink-soft">
						<span>{mode === "audit" ? "Auditing…" : "Fixing…"}</span>
						<span>{progress ? `${progress.processed} / ${progress.total}` : ""}</span>
					</div>
					<Progress value={progress ? percent : 12} />
					{statusMessage && (
						<p className="truncate text-xs text-ink-soft" title={statusMessage}>
							{statusMessage}
						</p>
					)}
				</div>
			)}

			{status === "error" && (
				<div className="text-center">
					<p className="text-sm text-critical">{error}</p>
				</div>
			)}

			{result && (
				<div className="flex flex-col gap-4">
					<div className="flex flex-wrap items-center gap-2">
						{result.mode === "fix" ? (
							<>
								<Badge variant="good">{result.summary.fixed} fixed</Badge>
								{result.summary.duplicated > 0 && (
									<Badge variant="secondary">
										{result.summary.duplicated} reused from elsewhere in your project
									</Badge>
								)}
								{result.summary.skipped > 0 && (
									<Badge variant="outline">{result.summary.skipped} left unfixed</Badge>
								)}
							</>
						) : (
							<>
								<Badge variant="good">{result.summary.fixed} auto-fixable</Badge>
								{result.summary.aiNeeded > 0 && (
									<Badge variant="warn">
										{result.summary.aiNeeded} need AI / manual content
									</Badge>
								)}
								{result.summary.skipped > 0 && (
									<Badge variant="outline">{result.summary.skipped} intentionally left alone</Badge>
								)}
							</>
						)}
						<span className="text-xs text-ink-soft">Detected stack: {result.stack}</span>
						{result.mode === "fix" && result.zipBase64 && (
							<Button
								type="button"
								variant="brand"
								size="sm"
								onClick={() => downloadZip(result.zipBase64!, "optiqra-fixed-project.zip")}
							>
								Download fixed project
							</Button>
						)}
						{result.mode === "audit" && (
							<Button type="button" variant="brand" size="sm" onClick={() => setMode("fix")}>
								Switch to Auto-fix
							</Button>
						)}
					</div>
					{result.summary.filesSkippedTooMany > 0 && (
						<p className="text-xs text-ink-soft">
							Scanned the first {result.summary.filesFixed} files; {result.summary.filesSkippedTooMany} more were
							left as-is to keep this request from running too long — re-upload just that subfolder to cover the rest.
						</p>
					)}

					{result.projectResults.length > 0 && (
						<div className="flex flex-col gap-2">
							<p className="text-sm font-semibold text-ink">Project-wide</p>
							<ul className="flex flex-col gap-1.5">
								{result.projectResults.map((r) => (
									<li
										key={r.id}
										className={cn(
											"flex flex-wrap items-baseline gap-2 rounded-(--radius) border-l-2 bg-card px-3 py-2 text-sm",
											r.status === "fixed" || r.status === "duplicated" ?
												"border-l-good"
											: r.status === "ai-needed" ?
												"border-l-warn"
											:	"border-l-line",
										)}
									>
										<strong className="text-ink">{r.title}</strong>
										{result.mode === "audit" && (
											<Badge variant="secondary" className="text-[10px]">
												{STATUS_LABEL[r.status]}
											</Badge>
										)}
										<span className="text-ink-soft">{r.note}</span>
									</li>
								))}
							</ul>
						</div>
					)}

					{result.perFileResults.map((f) => (
						<div key={f.path} className="flex flex-col gap-2">
							<button
								type="button"
								className="text-left text-sm font-semibold text-ink hover:text-brand"
								onClick={() => setExpandedFile((cur) => (cur === f.path ? null : f.path))}
							>
								{expandedFile === f.path ? "▾" : "▸"} {f.path}{" "}
								<span className="font-normal text-ink-soft">
									({f.results.length} issue{f.results.length === 1 ? "" : "s"})
								</span>
							</button>
							{expandedFile === f.path && (
								<ul className="flex flex-col gap-1.5">
									{f.results.map((r) => (
										<li
											key={r.id}
											className={cn(
												"flex flex-wrap items-baseline gap-2 rounded-(--radius) border-l-2 bg-card px-3 py-2 text-sm",
												r.status === "fixed" || r.status === "duplicated" ?
													"border-l-good"
												: r.status === "ai-needed" ?
													"border-l-warn"
												:	"border-l-line",
											)}
										>
											<strong className="text-ink">{r.title}</strong>
											{result.mode === "audit" && (
												<Badge variant="secondary" className="text-[10px]">
													{STATUS_LABEL[r.status]}
												</Badge>
											)}
											<span className="text-ink-soft">{r.note}</span>
										</li>
									))}
								</ul>
							)}
						</div>
					))}
				</div>
			)}
		</div>
	);
}
