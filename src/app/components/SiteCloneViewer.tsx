"use client";

import { useMemo, useState } from "react";
import { getErrorMessage } from "@/lib/errorUtils";
import { useAIProvider } from "@/lib/hooks/useAIProvider";
import type { Severity } from "@/lib/auditUtils";

export interface CloneAnnotation {
	id: string;
	title: string;
	detail: string;
	fix?: string;
	severity: Severity;
	category: string;
}

interface CloneResponse {
	url: string;
	html: string;
	elementIssues: CloneAnnotation[];
	pageIssues: CloneAnnotation[];
	renderJsApplied: boolean;
}

type AutoFixIssueStatus = "fixed" | "ai-needed" | "duplicated" | "skipped";

interface AutoFixIssueResult {
	id: string;
	title: string;
	category: string;
	severity: Severity;
	status: AutoFixIssueStatus;
	note: string;
}

interface AutoFixResponse {
	url: string;
	html: string;
	results: AutoFixIssueResult[];
	summary: { fixed: number; duplicated: number; skipped: number };
	stack: { primary: string; summary: string; guidance: string };
	duplicateBankUpdates: Record<string, string>;
}

// Session-scoped cache of previously AI-generated fix content, keyed by
// "kind:category" — reused verbatim when auto-fixing a page with no AI key
// configured, rather than leaving those issues untouched.
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

function downloadHtml(html: string, url: string) {
	const filename =
		(() => {
			try {
				const u = new URL(url);
				const base = u.hostname + u.pathname.replace(/\/$/, "");
				return `${base.replace(/[^a-z0-9.-]+/gi, "-")}-fixed.html`;
			} catch {
				return "fixed-page.html";
			}
		})();
	const blob = new Blob([html], { type: "text/html" });
	const href = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = href;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	a.remove();
	URL.revokeObjectURL(href);
}

// Mirrors the --sev-* palette in globals.css. Hardcoded here (rather than
// read from CSS vars) because the overlay script runs inside the iframe's
// own document, which doesn't inherit the parent app's stylesheet.
const SEVERITY_COLOR: Record<Severity, string> = {
	critical: "#0a0a0a",
	high: "#d1332b",
	medium: "#c99a05",
	low: "#1c64d1",
	informational: "#4c5c55",
	good: "#1e8f5e",
};

function buildSrcDoc(html: string, elementIssues: CloneAnnotation[]): string {
	const byId: Record<string, CloneAnnotation> = {};
	elementIssues.forEach((a) => {
		byId[a.id] = a;
	});
	// </script> inside embedded JSON would terminate the tag early; escaping
	// "<" is the standard guard for inlining JSON into a <script> block.
	const dataJson = JSON.stringify(byId).replace(/</g, "\\u003c");
	const colorsJson = JSON.stringify(SEVERITY_COLOR).replace(/</g, "\\u003c");

	const overlayScript = `
<script>
(function () {
  var DATA = ${dataJson};
  var COLORS = ${colorsJson};
  function color(sev) { return COLORS[sev] || COLORS.medium; }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  // This is a static snapshot for inspection, not a page to browse from —
  // stop links/forms from navigating the iframe out from under the overlay.
  document.addEventListener("click", function (e) {
    var a = e.target && e.target.closest ? e.target.closest("a") : null;
    if (a) e.preventDefault();
  }, true);
  document.addEventListener("submit", function (e) { e.preventDefault(); }, true);

  var layer = document.createElement("div");
  layer.id = "__optiqra_overlay_layer";
  layer.style.cssText = "position:absolute;top:0;left:0;width:1px;height:1px;pointer-events:none;z-index:2147483000;";
  document.body.appendChild(layer);

  var boxes = [];
  Array.prototype.forEach.call(document.querySelectorAll("[data-optiqra-issue]"), function (el) {
    var ids = (el.getAttribute("data-optiqra-issue") || "").split(" ").filter(Boolean);
    ids.forEach(function (id) {
      var meta = DATA[id];
      if (!meta) return;
      var box = document.createElement("div");
      box.style.cssText = "position:absolute;pointer-events:auto;box-sizing:border-box;cursor:pointer;border:2px solid " + color(meta.severity) + ";border-radius:4px;";
      var label = document.createElement("div");
      label.textContent = meta.title;
      label.style.cssText = "position:absolute;bottom:100%;left:0;margin-bottom:4px;background:" + color(meta.severity) + ";color:#fff;font:600 11px/1.4 -apple-system,BlinkMacSystemFont,sans-serif;padding:2px 8px;border-radius:4px;white-space:nowrap;max-width:280px;overflow:hidden;text-overflow:ellipsis;";
      box.appendChild(label);
      var tip = document.createElement("div");
      tip.style.cssText = "display:none;position:absolute;top:100%;left:0;margin-top:6px;background:#161616;color:#fff;font:12px/1.5 -apple-system,BlinkMacSystemFont,sans-serif;padding:10px 12px;border-radius:8px;width:260px;box-shadow:0 8px 24px rgba(0,0,0,.35);";
      tip.innerHTML = "<strong>" + escapeHtml(meta.title) + "</strong><br>" + escapeHtml(meta.detail) + (meta.fix ? "<br><br><em>Fix: " + escapeHtml(meta.fix) + "</em>" : "");
      box.appendChild(tip);
      box.addEventListener("click", function (e) {
        e.stopPropagation();
        var willOpen = tip.style.display !== "block";
        Array.prototype.forEach.call(document.querySelectorAll("[data-optiqra-tip-open]"), function (t) {
          t.style.display = "none";
          t.removeAttribute("data-optiqra-tip-open");
        });
        tip.style.display = willOpen ? "block" : "none";
        if (willOpen) tip.setAttribute("data-optiqra-tip-open", "1");
        try { parent.postMessage({ source: "optiqra-clone", type: "issue-click", id: id }, "*"); } catch (err) {}
      });
      layer.appendChild(box);
      boxes.push({ el: el, box: box });
    });
  });

  function reposition() {
    boxes.forEach(function (pair) {
      var r = pair.el.getBoundingClientRect();
      pair.box.style.top = (r.top + window.scrollY) + "px";
      pair.box.style.left = (r.left + window.scrollX) + "px";
      pair.box.style.width = Math.max(r.width, 4) + "px";
      pair.box.style.height = Math.max(r.height, 4) + "px";
    });
  }
  reposition();
  window.addEventListener("resize", reposition);
  window.addEventListener("scroll", reposition, true);
  window.addEventListener("load", reposition);
  setTimeout(reposition, 300);
  setTimeout(reposition, 1200);

  document.addEventListener("click", function () {
    Array.prototype.forEach.call(document.querySelectorAll("[data-optiqra-tip-open]"), function (t) {
      t.style.display = "none";
      t.removeAttribute("data-optiqra-tip-open");
    });
  });
})();
</script>`;

	if (html.includes("</body>")) {
		return html.replace("</body>", `${overlayScript}</body>`);
	}
	return `${html}${overlayScript}`;
}

export default function SiteCloneViewer({
	url,
	renderJs = true,
	label = "🔍 View site with issues highlighted",
	className = "clone-view-btn",
}: {
	url: string;
	renderJs?: boolean;
	label?: string;
	className?: string;
}) {
	const [status, setStatus] = useState<"idle" | "loading" | "error" | "ready">(
		"idle",
	);
	const [error, setError] = useState<string | null>(null);
	const [data, setData] = useState<CloneResponse | null>(null);
	const [open, setOpen] = useState(false);

	const { provider, apiKey, model, isConfigured, hydrated } = useAIProvider();
	const [autoFixStatus, setAutoFixStatus] = useState<"idle" | "running" | "error">("idle");
	const [autoFixError, setAutoFixError] = useState<string | null>(null);
	const [autoFixResult, setAutoFixResult] = useState<AutoFixResponse | null>(null);
	const [showFixed, setShowFixed] = useState(false);

	const runAutoFix = async () => {
		setAutoFixStatus("running");
		setAutoFixError(null);
		try {
			const res = await fetch("/api/auto-fix", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					url,
					renderJs,
					provider: hydrated && isConfigured ? provider : undefined,
					apiKey: hydrated && isConfigured ? apiKey : undefined,
					model: hydrated && isConfigured ? model : undefined,
					duplicateBank: readDuplicateBank(),
				}),
			});
			const json = await res.json();
			if (!res.ok) throw new Error(json.error || "Failed to auto-fix the page");
			setAutoFixResult(json);
			writeDuplicateBankUpdates(json.duplicateBankUpdates || {});
			setShowFixed(true);
			setAutoFixStatus("idle");
		} catch (err) {
			setAutoFixError(getErrorMessage(err, "Failed to auto-fix the page"));
			setAutoFixStatus("error");
		}
	};

	const load = async () => {
		setStatus("loading");
		setError(null);
		try {
			const res = await fetch("/api/clone", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ url, renderJs }),
			});
			const json = await res.json();
			if (!res.ok) throw new Error(json.error || "Failed to build the highlighted clone");
			setData(json);
			setStatus("ready");
		} catch (err) {
			setError(getErrorMessage(err, "Failed to build the highlighted clone"));
			setStatus("error");
		}
	};

	const handleOpen = () => {
		setOpen(true);
		if (data && data.url === url) return;
		setAutoFixResult(null);
		setAutoFixStatus("idle");
		setAutoFixError(null);
		setShowFixed(false);
		void load();
	};

	const srcDoc = useMemo(() => {
		if (showFixed && autoFixResult) return autoFixResult.html;
		if (!data) return "";
		return buildSrcDoc(data.html, data.elementIssues);
	}, [data, showFixed, autoFixResult]);

	const allIssues = useMemo(() => {
		if (!data) return [];
		return [...data.pageIssues, ...data.elementIssues];
	}, [data]);

	const counts = useMemo(() => {
		const c: Partial<Record<Severity, number>> = {};
		allIssues.forEach((i) => {
			c[i.severity] = (c[i.severity] || 0) + 1;
		});
		return c;
	}, [allIssues]);

	return (
		<>
			<button type="button" className={className} onClick={handleOpen}>
				{label}
			</button>

			{open && (
				<div
					className="modal-overlay clone-modal-overlay"
					onClick={() => setOpen(false)}
					role="presentation"
				>
					<div
						className="clone-modal"
						role="dialog"
						aria-modal="true"
						aria-label={`Highlighted clone of ${url}`}
						onClick={(e) => e.stopPropagation()}
					>
						<div className="modal-header clone-modal-header">
							<div>
								<h2>Highlighted clone</h2>
								<p className="clone-modal-url">{url}</p>
							</div>
							<button
								type="button"
								className="modal-close"
								onClick={() => setOpen(false)}
								aria-label="Close"
							>
								×
							</button>
						</div>

						{status === "loading" && (
							<div className="modal-loading clone-modal-loading">
								Rendering a highlighted clone of the page…
							</div>
						)}

						{status === "error" && (
							<div className="modal-error clone-modal-error">
								<p>{error}</p>
								<button type="button" className="apply-btn" onClick={load}>
									Try again
								</button>
							</div>
						)}

						{status === "ready" && data && (
							<div className="clone-modal-body">
								<div className="clone-legend">
									<span className="clone-legend-total">
										{allIssues.length} issue{allIssues.length === 1 ? "" : "s"}{" "}
										found
									</span>
									{(["critical", "high", "medium", "low"] as Severity[]).map(
										(sev) =>
											counts[sev] ? (
												<span
													key={sev}
													className={`clone-legend-chip clone-sev-${sev}`}
												>
													{counts[sev]} {sev}
												</span>
											) : null,
									)}
									{!data.renderJsApplied && renderJs && (
										<span className="clone-legend-note">
											Showing static HTML — JS rendering wasn&apos;t applied
										</span>
									)}
									<span className="autofix-legend-actions">
										{autoFixResult && (
											<button
												type="button"
												className="link-btn"
												onClick={() => setShowFixed((v) => !v)}
											>
												{showFixed ? "View original" : "View fixed"}
											</button>
										)}
										<button
											type="button"
											className="apply-btn autofix-btn"
											onClick={runAutoFix}
											disabled={autoFixStatus === "running"}
										>
											{autoFixStatus === "running" ? "Auto-fixing…" : "⚡ Auto-fix all issues"}
										</button>
									</span>
								</div>

								{!hydrated ? null : !isConfigured && (
									<p className="autofix-note">
										No AI provider configured — issues needing generated content (titles,
										descriptions, alt text…) will reuse a fix from elsewhere on your site if
										one exists, or stay unfixed. Everything mechanical still gets fixed.
									</p>
								)}

								{autoFixStatus === "error" && (
									<div className="modal-error clone-modal-error">
										<p>{autoFixError}</p>
										<button type="button" className="apply-btn" onClick={runAutoFix}>
											Try again
										</button>
									</div>
								)}

								{autoFixResult && (
									<div className="autofix-summary">
										<div className="autofix-summary-row">
											<span className="autofix-chip autofix-chip-fixed">
												{autoFixResult.summary.fixed} fixed
											</span>
											{autoFixResult.summary.duplicated > 0 && (
												<span className="autofix-chip autofix-chip-duplicated">
													{autoFixResult.summary.duplicated} reused from another page
												</span>
											)}
											{autoFixResult.summary.skipped > 0 && (
												<span className="autofix-chip autofix-chip-skipped">
													{autoFixResult.summary.skipped} left unfixed
												</span>
											)}
											<span className="autofix-stack-note">
												Detected stack: {autoFixResult.stack.summary}
											</span>
											<button
												type="button"
												className="apply-btn"
												onClick={() => downloadHtml(autoFixResult.html, url)}
											>
												Download fixed HTML
											</button>
										</div>
										<ul className="autofix-results-list">
											{autoFixResult.results.map((r) => (
												<li key={r.id} className={`autofix-result autofix-result-${r.status}`}>
													<strong>{r.title}</strong>
													<span>{r.note}</span>
												</li>
											))}
										</ul>
									</div>
								)}

								<div className="clone-frame-wrap">
									<iframe
										title={`${showFixed ? "Fixed" : "Highlighted"} clone of ${url}`}
										srcDoc={srcDoc}
										sandbox="allow-scripts"
										className="clone-iframe"
									/>
								</div>

								{!showFixed && data.pageIssues.length > 0 && (
									<div className="clone-page-issues">
										<h3>Page-level issues</h3>
										<ul>
											{data.pageIssues.map((iss) => (
												<li
													key={iss.id}
													className={`clone-page-issue clone-sev-${iss.severity}`}
												>
													<strong>{iss.title}</strong>
													<span>{iss.detail}</span>
												</li>
											))}
										</ul>
									</div>
								)}
							</div>
						)}
					</div>
				</div>
			)}
		</>
	);
}
