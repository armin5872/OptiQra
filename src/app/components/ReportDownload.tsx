"use client";

// Save this file as components/ReportDownload.tsx (flattened here alongside
// the rest of the uploaded files). Imported from page.tsx as
// `@/components/ReportDownload`.
//
// Renders a "Download report" button with a dropdown of every supported
// format. Heavy formats (PDF via jspdf, DOCX via docx) are dynamically
// imported only when the user picks them, so they never bloat the initial
// page bundle.
//
// Requires two extra dependencies for the PDF/DOCX formats:
//   npm install jspdf docx

import { useEffect, useRef, useState } from "react";
import {
	buildReportModel,
	reportFileBaseName,
	toCSV,
	toTSV,
	toMarkdown,
	toTxt,
	toJSON,
	downloadText,
	exportReportPdf,
	exportReportDocx,
	type SourceReportData,
} from "@/lib/reportExport";

type Format = "pdf" | "docx" | "csv" | "tsv" | "md" | "txt" | "json";

const FORMATS: { id: Format; label: string; hint: string }[] = [
	{ id: "pdf", label: "PDF", hint: "Formatted, printable report" },
	{ id: "docx", label: "Word (.docx)", hint: "Editable document" },
	{ id: "csv", label: "CSV", hint: "Spreadsheet-friendly" },
	{ id: "tsv", label: "TSV", hint: "Tab-separated" },
	{ id: "md", label: "Markdown", hint: "For docs / wikis" },
	{ id: "txt", label: "Plain text", hint: "No formatting" },
	{ id: "json", label: "JSON", hint: "Raw data, for tooling" },
];

export default function ReportDownload({
	reportData,
	overallScore,
}: {
	reportData: SourceReportData;
	overallScore: number;
}) {
	const [open, setOpen] = useState(false);
	const [pending, setPending] = useState<Format | null>(null);
	const [error, setError] = useState("");
	const menuRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!open) return;
		const onClick = (e: MouseEvent) => {
			if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
				setOpen(false);
			}
		};
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") setOpen(false);
		};
		document.addEventListener("mousedown", onClick);
		document.addEventListener("keydown", onKey);
		return () => {
			document.removeEventListener("mousedown", onClick);
			document.removeEventListener("keydown", onKey);
		};
	}, [open]);

	const handleDownload = async (format: Format) => {
		setError("");
		setPending(format);
		try {
			const model = buildReportModel(reportData, overallScore);
			const base = reportFileBaseName(model);

			switch (format) {
				case "pdf":
					await exportReportPdf(model);
					break;
				case "docx":
					await exportReportDocx(model);
					break;
				case "csv":
					downloadText(toCSV(model), `${base}.csv`, "text/csv");
					break;
				case "tsv":
					downloadText(toTSV(model), `${base}.tsv`, "text/tab-separated-values");
					break;
				case "md":
					downloadText(toMarkdown(model), `${base}.md`, "text/markdown");
					break;
				case "txt":
					downloadText(toTxt(model), `${base}.txt`, "text/plain");
					break;
				case "json":
					downloadText(toJSON(model), `${base}.json`, "application/json");
					break;
			}
			setOpen(false);
		} catch (err) {
			console.error(`Report export failed (${format}):`, err);
			setError(
				format === "pdf" || format === "docx" ?
					`Couldn't generate the ${format.toUpperCase()} file. Make sure the "${format === "pdf" ? "jspdf" : "docx"}" package is installed.`
				:	`Couldn't generate the ${format.toUpperCase()} file.`,
			);
		} finally {
			setPending(null);
		}
	};

	return (
		<div className="report-download" ref={menuRef}>
			<button
				className="report-download-btn"
				onClick={() => setOpen((v) => !v)}
				aria-haspopup="menu"
				aria-expanded={open}
			>
				Download report
				<span className="report-download-caret">{open ? "▲" : "▼"}</span>
			</button>

			{open && (
				<div className="report-download-menu" role="menu">
					{FORMATS.map((f) => (
						<button
							key={f.id}
							role="menuitem"
							className="report-download-item"
							disabled={pending !== null}
							onClick={() => handleDownload(f.id)}
						>
							<span className="report-download-item-label">
								{pending === f.id ? "Preparing…" : f.label}
							</span>
							<span className="report-download-item-hint">{f.hint}</span>
						</button>
					))}
				</div>
			)}

			{error && <div className="report-download-error">{error}</div>}
		</div>
	);
}
