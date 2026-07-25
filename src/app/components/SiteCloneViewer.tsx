"use client";

import { useMemo, useState } from "react";
import { getErrorMessage } from "@/lib/errorUtils";
import { useAIProvider } from "@/lib/hooks/useAIProvider";
import type { Severity } from "@/lib/auditUtils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogBody,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

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
	className,
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
			<Button
				type="button"
				variant="outline"
				size="sm"
				className={className}
				onClick={handleOpen}
			>
				{label}
			</Button>

			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent
					className="flex h-[min(880px,92vh)] w-[min(1200px,94vw)] max-w-none flex-col"
					aria-label={`Highlighted clone of ${url}`}
				>
					<DialogHeader className="items-start">
						<div>
							<DialogTitle>Highlighted clone</DialogTitle>
							<p className="mt-1 truncate text-[13px] text-ink-soft">{url}</p>
						</div>
					</DialogHeader>

					{status === "loading" && (
						<div className="flex-1 py-10 text-center text-ink-soft italic">
							Rendering a highlighted clone of the page…
						</div>
					)}

					{status === "error" && (
						<div className="flex-1 py-10 text-center">
							<p className="mb-3 text-critical">{error}</p>
							<Button type="button" variant="brand" size="sm" onClick={load}>
								Try again
							</Button>
						</div>
					)}

					{status === "ready" && data && (
						<DialogBody className="flex flex-1 flex-col gap-4 overflow-y-auto">
							<div className="flex flex-wrap items-center gap-2 border-b border-line pb-4">
								<span className="text-sm font-semibold text-ink">
									{allIssues.length} issue{allIssues.length === 1 ? "" : "s"}{" "}
									found
								</span>
								{(["critical", "high", "medium", "low"] as Severity[]).map((sev) =>
									counts[sev] ?
										<Badge key={sev} variant={`sev-${sev}` as never}>
											{counts[sev]} {sev}
										</Badge>
									:	null,
								)}
								{!data.renderJsApplied && renderJs && (
									<span className="text-xs text-ink-soft italic">
										Showing static HTML — JS rendering wasn&apos;t applied
									</span>
								)}
								<span className="ml-auto flex items-center gap-3">
									{autoFixResult && (
										<button
											type="button"
											className="text-sm text-brand underline-offset-2 hover:underline"
											onClick={() => setShowFixed((v) => !v)}
										>
											{showFixed ? "View original" : "View fixed"}
										</button>
									)}
									<Button
										type="button"
										variant="brand"
										size="sm"
										onClick={runAutoFix}
										disabled={autoFixStatus === "running"}
									>
										{autoFixStatus === "running" ? "Auto-fixing…" : "⚡ Auto-fix all issues"}
									</Button>
								</span>
							</div>

							{!hydrated ? null : (
								!isConfigured && (
									<p className="text-xs text-ink-soft">
										No AI provider configured — issues needing generated content (titles,
										descriptions, alt text…) will reuse a fix from elsewhere on your site if
										one exists, or stay unfixed. Everything mechanical still gets fixed.
									</p>
								)
							)}

							{autoFixStatus === "error" && (
								<div className="text-center">
									<p className="mb-3 text-critical">{autoFixError}</p>
									<Button type="button" variant="brand" size="sm" onClick={runAutoFix}>
										Try again
									</Button>
								</div>
							)}

							{autoFixResult && (
								<div className="flex flex-col gap-3">
									<div className="flex flex-wrap items-center gap-2">
										<Badge variant="good">{autoFixResult.summary.fixed} fixed</Badge>
										{autoFixResult.summary.duplicated > 0 && (
											<Badge variant="secondary">
												{autoFixResult.summary.duplicated} reused from another page
											</Badge>
										)}
										{autoFixResult.summary.skipped > 0 && (
											<Badge variant="outline">
												{autoFixResult.summary.skipped} left unfixed
											</Badge>
										)}
										<span className="text-xs text-ink-soft">
											Detected stack: {autoFixResult.stack.summary}
										</span>
										<Button
											type="button"
											variant="brand"
											size="sm"
											onClick={() => downloadHtml(autoFixResult.html, url)}
										>
											Download fixed HTML
										</Button>
									</div>
									<ul className="flex flex-col gap-1.5">
										{autoFixResult.results.map((r) => (
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
												<span className="text-ink-soft">{r.note}</span>
											</li>
										))}
									</ul>
								</div>
							)}

							<div className="min-h-[300px] flex-1 overflow-hidden rounded-(--radius) border border-line">
								<iframe
									title={`${showFixed ? "Fixed" : "Highlighted"} clone of ${url}`}
									srcDoc={srcDoc}
									sandbox="allow-scripts"
									className="size-full"
								/>
							</div>

							{!showFixed && data.pageIssues.length > 0 && (
								<div className="flex flex-col gap-2">
									<h3 className="m-0 text-sm font-semibold text-ink">Page-level issues</h3>
									<ul className="flex flex-col gap-1.5">
										{data.pageIssues.map((iss) => (
											<li
												key={iss.id}
												className={cn(
													"flex flex-wrap items-baseline gap-2 rounded-(--radius) border-l-2 bg-card px-3 py-2 text-sm",
													iss.severity === "critical" ? "border-l-sev-critical"
													: iss.severity === "high" ? "border-l-sev-high"
													: iss.severity === "medium" ? "border-l-sev-medium"
													: iss.severity === "low" ? "border-l-sev-low"
													:	"border-l-line",
												)}
											>
												<strong className="text-ink">{iss.title}</strong>
												<span className="text-ink-soft">{iss.detail}</span>
											</li>
										))}
									</ul>
								</div>
							)}
						</DialogBody>
					)}
				</DialogContent>
			</Dialog>
		</>
	);
}
