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
	toYAML,
	downloadText,
	type SourceReportData,
} from "@/lib/reportExport";
import { useSettings } from "@/lib/hooks/useSettings";
import { getErrorMessage } from "@/lib/errorUtils";
// Heavy exporters are dynamically imported on-click to avoid bloating the initial bundle
import type { exportReportPdf } from "@/lib/reportExport/pdf";
import type { exportReportDocx } from "@/lib/reportExport/docx";
import type { exportReportXlsx } from "@/lib/reportExport/xlsx";

type Format = "pdf" | "docx" | "xlsx" | "csv" | "tsv" | "md" | "txt" | "json" | "yaml";

const FORMATS: { id: Format; label: string; hint: string }[] = [
	{ id: "pdf", label: "PDF", hint: "Formatted, printable report" },
	{ id: "docx", label: "Word (.docx)", hint: "Editable document" },
	{ id: "xlsx", label: "Excel (.xlsx)", hint: "Multi-sheet spreadsheet" },
	{ id: "csv", label: "CSV", hint: "Spreadsheet-friendly" },
	{ id: "tsv", label: "TSV", hint: "Tab-separated" },
	{ id: "md", label: "Markdown", hint: "For docs / wikis" },
	{ id: "txt", label: "Plain text", hint: "No formatting" },
	{ id: "json", label: "JSON", hint: "Raw data, for tooling" },
	{ id: "yaml", label: "YAML", hint: "Raw data, human-readable" },
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
	const { settings, hydrated } = useSettings();

	const orderedFormats =
		hydrated ?
			[...FORMATS].sort((a, b) =>
				a.id === settings.reports.defaultExportFormat ? -1
				: b.id === settings.reports.defaultExportFormat ? 1
				: 0,
			)
		:	FORMATS;

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
			const model = buildReportModel(reportData, overallScore, {
				includePassedChecks: settings.analyzer.showPassedChecks,
			});
			const base = reportFileBaseName(model);

			switch (format) {
				case "pdf": {
					const { exportReportPdf } = await import("@/lib/reportExport/pdf");
					await exportReportPdf(model);
					break;
				}
				case "docx": {
					const { exportReportDocx } = await import("@/lib/reportExport/docx");
					await exportReportDocx(model);
					break;
				}
				case "xlsx": {
					const { exportReportXlsx } = await import("@/lib/reportExport/xlsx");
					await exportReportXlsx(model);
					break;
				}
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
				case "yaml":
					downloadText(toYAML(model), `${base}.yaml`, "application/x-yaml");
					break;
			}
			setOpen(false);
		} catch (err: unknown) {
			console.error(`Report export failed (${format}):`, err);
			const pkgName = format === "pdf" ? "jspdf" : format === "docx" ? "docx" : format === "xlsx" ? "xlsx" : null;
			const errMessage = getErrorMessage(err, "");
			const msg =
				errMessage.includes("not available") ?
					`Install the missing package: npm install ${pkgName}`
				: format === "pdf" || format === "docx" || format === "xlsx" ?
					`Couldn't generate the ${format.toUpperCase()} file (check console for details).`
				:	`Couldn't generate the ${format.toUpperCase()} file.`;
			setError(msg);
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
					{orderedFormats.map((f) => (
						<button
							key={f.id}
							role="menuitem"
							className="report-download-item"
							disabled={pending !== null}
							onClick={() => handleDownload(f.id)}
						>
							<span className="report-download-item-label">
								{pending === f.id ? "Preparing…" : f.label}
								{hydrated && f.id === settings.reports.defaultExportFormat && (
									<span className="settings-slider-value" style={{ marginLeft: 8 }}>
										default
									</span>
								)}
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
