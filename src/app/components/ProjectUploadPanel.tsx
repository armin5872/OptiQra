"use client";

import { useRef, useState } from "react";
import { useAIProvider } from "@/lib/hooks/useAIProvider";
import AIProviderSetup from "./AIProviderSetup";
import { getErrorMessage } from "@/lib/errorUtils";
import type { AutoFixResult } from "@/lib/autoFixEngine";

interface PerFileSummary {
	path: string;
	results: AutoFixResult[];
}

interface ProjectFixResponse {
	zipBase64: string;
	stack: string;
	summary: { filesFixed: number; filesSkippedTooMany: number; fixed: number; duplicated: number; skipped: number };
	perFileResults: PerFileSummary[];
	projectResults: AutoFixResult[];
	duplicateBankUpdates: Record<string, string>;
}

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

export default function ProjectUploadPanel() {
	const { provider, apiKey, model, isConfigured, hydrated } = useAIProvider();
	const [dragOver, setDragOver] = useState(false);
	const [status, setStatus] = useState<"idle" | "uploading" | "error">("idle");
	const [error, setError] = useState<string | null>(null);
	const [result, setResult] = useState<ProjectFixResponse | null>(null);
	const [showKeyPanel, setShowKeyPanel] = useState(false);
	const [expandedFile, setExpandedFile] = useState<string | null>(null);
	const folderInputRef = useRef<HTMLInputElement>(null);
	const zipInputRef = useRef<HTMLInputElement>(null);

	const runUpload = async (files: File[]) => {
		if (files.length === 0) return;
		setStatus("uploading");
		setError(null);
		setResult(null);

		const form = new FormData();
		for (const f of files) form.append("project", f, f.name);
		form.append("siteUrl", "");
		if (hydrated && isConfigured) {
			form.append("provider", provider || "");
			form.append("apiKey", apiKey);
			form.append("model", model);
		}
		form.append("duplicateBank", JSON.stringify(readDuplicateBank()));

		try {
			const res = await fetch("/api/auto-fix-project", { method: "POST", body: form });
			const json = await res.json();
			if (!res.ok) throw new Error(json.error || "Failed to auto-fix the project");
			setResult(json);
			writeDuplicateBankUpdates(json.duplicateBankUpdates || {});
			setStatus("idle");
		} catch (err) {
			setError(getErrorMessage(err, "Failed to auto-fix the project"));
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

	return (
		<div className="project-upload">
			<div className="upload-divider">
				<span>or</span>
			</div>

			<div
				className={`upload-dropzone ${dragOver ? "drag-over" : ""}`}
				onDragOver={(e) => {
					e.preventDefault();
					setDragOver(true);
				}}
				onDragLeave={() => setDragOver(false)}
				onDrop={handleDrop}
			>
				<p className="upload-dropzone-title">Drag &amp; drop or upload your project</p>
				<p className="upload-dropzone-sub">We&apos;ll scan every HTML file and auto-fix what it finds — right in your browser, nothing kept on our servers after.</p>
				<div className="upload-dropzone-actions">
					<button type="button" className="apply-btn" onClick={() => folderInputRef.current?.click()}>
						Choose folder
					</button>
					<button type="button" className="link-btn" onClick={() => zipInputRef.current?.click()}>
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

			<button type="button" className="link-btn upload-key-toggle" onClick={() => setShowKeyPanel((v) => !v)}>
				{hydrated && isConfigured ? "AI key configured — for better fixes" : "For better fixes, add your AI API key (optional)"}
			</button>
			{showKeyPanel && <AIProviderSetup />}
			{hydrated && !isConfigured && (
				<p className="autofix-note">
					No key? Auto-fix still handles every mechanical issue (headers, tags, attributes, structure). Anything
					needing written content (titles, descriptions, alt text) will reuse a fix from elsewhere in your
					project if one exists, or stay unfixed.
				</p>
			)}

			{status === "uploading" && <p className="upload-status">Fixing your project…</p>}

			{status === "error" && (
				<div className="modal-error clone-modal-error">
					<p>{error}</p>
				</div>
			)}

			{result && (
				<div className="autofix-summary">
					<div className="autofix-summary-row">
						<span className="autofix-chip autofix-chip-fixed">{result.summary.fixed} fixed</span>
						{result.summary.duplicated > 0 && (
							<span className="autofix-chip autofix-chip-duplicated">
								{result.summary.duplicated} reused from elsewhere in your project
							</span>
						)}
						{result.summary.skipped > 0 && (
							<span className="autofix-chip autofix-chip-skipped">{result.summary.skipped} left unfixed</span>
						)}
						<span className="autofix-stack-note">Detected stack: {result.stack}</span>
						<button type="button" className="apply-btn" onClick={() => downloadZip(result.zipBase64, "optiqra-fixed-project.zip")}>
							Download fixed project
						</button>
					</div>
					{result.summary.filesSkippedTooMany > 0 && (
						<p className="autofix-note">
							Fixed the first {result.summary.filesFixed} HTML files; {result.summary.filesSkippedTooMany} more were
							left as-is to keep this request from running too long — re-upload just that subfolder to cover the rest.
						</p>
					)}

					{result.projectResults.length > 0 && (
						<>
							<p className="autofix-file-group-title">Project-wide</p>
							<ul className="autofix-results-list">
								{result.projectResults.map((r) => (
									<li key={r.id} className={`autofix-result autofix-result-${r.status}`}>
										<strong>{r.title}</strong>
										<span>{r.note}</span>
									</li>
								))}
							</ul>
						</>
					)}

					{result.perFileResults.map((f) => (
						<div key={f.path} className="autofix-file-group">
							<button
								type="button"
								className="autofix-file-group-title autofix-file-toggle"
								onClick={() => setExpandedFile((cur) => (cur === f.path ? null : f.path))}
							>
								{expandedFile === f.path ? "▾" : "▸"} {f.path}{" "}
								<span className="autofix-file-count">({f.results.length} issue{f.results.length === 1 ? "" : "s"})</span>
							</button>
							{expandedFile === f.path && (
								<ul className="autofix-results-list">
									{f.results.map((r) => (
										<li key={r.id} className={`autofix-result autofix-result-${r.status}`}>
											<strong>{r.title}</strong>
											<span>{r.note}</span>
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
