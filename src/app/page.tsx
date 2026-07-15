"use client";

import { useState, useEffect, useRef } from "react";
import CrawlTree from "./components/CrawlTree";
import type { PageNode, Issue } from "./components/CrawlTree";
import AIProviderSetup from "./components/AIProviderSetup";
import AIFixButton from "./components/AIFixButton";
import AISiteInsights from "./components/AISiteInsights";
import AIEngineTest from "./components/AIEngineTest";
import ReportDownload from "./components/ReportDownload";
import ScheduleManager from "./components/ScheduleManager";
import SettingsPanel from "./components/SettingsPanel";
import MissingFileBanner from "./components/MissingFileBanner";
import { useSettings } from "@/lib/hooks/useSettings";
import {
	saveScan,
	getRecentScans,
	deleteScan as deleteStoredScan,
	getScan as getStoredScan,
	type StoredScan,
} from "@/lib/scanStore";
import {
	recordScanInCookie,
	removeScanFromCookie,
} from "@/lib/scanCookies";

type ScanState = "hero" | "scanning" | "report";
type ScanMode = "single" | "site";

const SCAN_DEPTHS = [
	{ id: "quick", label: "⚡Quick scan", pages: 15 },
	{ id: "standard", label: "🔍Standard scan", pages: 50 },
	{ id: "full", label: "🏢Full site scan", pages: 100 },
	{ id: "crawl", label: "🌍Full crawl", pages: 250 },
	{ id: "custom", label: "Custom", pages: null },
] as const;
type ScanDepthId = (typeof SCAN_DEPTHS)[number]["id"];
const MIN_CUSTOM_PAGES = 1;
const MAX_CUSTOM_PAGES = Infinity; // Unlimited pages

type CrawlProgress = { scanned: number; total: number; currentUrl?: string };

type Category = {
	label: string;
	score: number;
	issues: Issue[];
	passed: Issue[];
	source: string;
	pagesAnalyzed?: number;
};

export default function Home() {
	const { settings, hydrated: settingsHydrated } = useSettings();
	const appliedDefaultsRef = useRef(false);
	const [viewState, setViewState] = useState<ScanState>("hero");
	const [url, setUrl] = useState("");
	const [scanMode, setScanMode] = useState<ScanMode>("single");
	const [scanDepth, setScanDepth] = useState<ScanDepthId>("quick");
	const [customPages, setCustomPages] = useState("100");
	const [errorMsg, setErrorMsg] = useState("");
	const [stoppedNote, setStoppedNote] = useState("");
	const [activeStep, setActiveStep] = useState(0);
	const [crawlProgress, setCrawlProgress] = useState<CrawlProgress | null>(
		null,
	);
	const [statusMessage, setStatusMessage] = useState("");
	const abortRef = useRef<AbortController | null>(null);
	const liveScanIdRef = useRef<string | null>(null);
	const [stopMenuOpen, setStopMenuOpen] = useState(false);
	const [finishingUp, setFinishingUp] = useState(false);
	const [linkCheckProgress, setLinkCheckProgress] = useState<{
		checked: number;
		total: number;
	} | null>(null);
	const [reportData, setReportData] = useState<{
		url: string;
		mode?: ScanMode;
		categories: Record<string, Category>;
		lighthouseAvailable: boolean;
		pagesScanned?: string[];
		pagesSkipped?: { url: string; reason: string }[];
		crawlTruncated?: boolean;
		pages?: PageNode[];
		partial?: boolean;
	} | null>(null);
	const [openPanel, setOpenPanel] = useState<string | null>(null);
	const [showPageList, setShowPageList] = useState(false);
	const [recentScans, setRecentScans] = useState<StoredScan[]>([]);
	const [recentScansLoaded, setRecentScansLoaded] = useState(false);
	const [activeScanId, setActiveScanId] = useState<string | null>(null);

	const refreshRecentScans = () => {
		getRecentScans(8)
			.then(setRecentScans)
			.catch(() => setRecentScans([]))
			.finally(() => setRecentScansLoaded(true));
	};

	// Load past scans from IndexedDB once on mount (client-only — idb needs
	// window/indexedDB, so this can't run during SSR).
	useEffect(() => {
		refreshRecentScans();
	}, []);

	// Settings → Scanning defaults. Applied once, only while still on the hero
	// screen untouched — never clobbers a choice the person already made.
	useEffect(() => {
		if (!settingsHydrated || appliedDefaultsRef.current || viewState !== "hero") return;
		appliedDefaultsRef.current = true;
		setScanMode(settings.scanning.defaultMode);
		setScanDepth(settings.scanning.defaultDepth);
		setCustomPages(String(settings.scanning.defaultCustomPages));
		setShowPageList(settings.scanning.autoShowPageList);
	}, [settingsHydrated, settings.scanning, viewState]);

	const overallFromCategories = (categories: Record<string, Category>) => {
		const keys = Object.keys(categories);
		if (!keys.length) return 0;
		const sum = keys.reduce((a, k) => a + categories[k].score, 0);
		return Math.round(sum / keys.length);
	};

	// Persists a finished scan to IndexedDB (full report) and to a cookie
	// (lightweight pointer: id/url/score/time) so scan history is available
	// both offline and before IndexedDB finishes opening.
	const persistScan = async (
		data: NonNullable<typeof reportData>,
		mode: ScanMode,
	) => {
		if (!settings.privacy.saveScanHistory) return;
		try {
			const stored = await saveScan({
				url: data.url,
				mode,
				overallScore: overallFromCategories(data.categories),
				data,
			});
			setActiveScanId(stored.id);
			recordScanInCookie({
				id: stored.id,
				url: stored.url,
				mode: stored.mode,
				overallScore: stored.overallScore,
				createdAt: stored.createdAt,
			});
			refreshRecentScans();
		} catch (err) {
			// Persistence failing shouldn't block showing the report itself.
			console.warn("Couldn't save scan locally:", err);
		}
	};

	const openStoredScan = async (id: string) => {
		const stored = await getStoredScan(id);
		if (!stored) return;
		setReportData(stored.data as typeof reportData);
		setUrl(stored.url);
		setActiveScanId(stored.id);
		setErrorMsg("");
		setStoppedNote("");
		setViewState("report");
	};

	const deleteScanEverywhere = async (id: string) => {
		await deleteStoredScan(id);
		removeScanFromCookie(id);
		refreshRecentScans();
	};

	// Site-mode page count comes from the chosen preset, or the custom field
	// (clamped to 1–1000).
	const resolvedMaxPages =
		scanDepth === "custom" ?
			Math.max(
				MIN_CUSTOM_PAGES,
				Math.min(
					MAX_CUSTOM_PAGES,
					Math.round(Number(customPages)) || MIN_CUSTOM_PAGES,
				),
			)
		:	(SCAN_DEPTHS.find((d) => d.id === scanDepth)?.pages ?? 15);

	// Fake step-by-step animation for single-page scans (no real per-page
	// progress to report there, so this just gives a sense of motion). Site
	// scans get a real progress bar driven by the server instead.
	useEffect(() => {
		let timeout: NodeJS.Timeout;
		if (viewState === "scanning" && scanMode === "single") {
			const stepCount = 7;
			const tickDelay = 480;
			const tick = (step: number) => {
				setActiveStep(step);
				if (step < stepCount - 1) {
					timeout = setTimeout(() => tick(step + 1), tickDelay);
				}
			};
			tick(0);
		}
		return () => clearTimeout(timeout);
	}, [viewState, scanMode]);

	const runScan = async (e: React.FormEvent) => {
		e.preventDefault();
		setErrorMsg("");
		setStoppedNote("");
		if (!url) return;

		const formattedUrl = /^https?:\/\//i.test(url) ? url : `https://${url}`;
		setUrl(formattedUrl);
		setViewState("scanning");
		setActiveScanId(null);
		setActiveStep(0);
		setStatusMessage("");
		setCrawlProgress(
			scanMode === "site" ? { scanned: 0, total: resolvedMaxPages } : null,
		);
		setStopMenuOpen(false);
		setFinishingUp(false);
		setLinkCheckProgress(null);
		liveScanIdRef.current = null;

		const controller = new AbortController();
		abortRef.current = controller;

		try {
			if (scanMode === "site") {
				await runSiteScanStream(formattedUrl, controller.signal);
			} else {
				const res = await fetch("/api/analyze", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ url: formattedUrl, mode: scanMode }),
					signal: controller.signal,
				});
				const data = await res.json();

				if (!res.ok)
					throw new Error(
						data.error || "Something went wrong running that scan.",
					);

				setReportData(data);
				setTimeout(() => setViewState("report"), 350);
				persistScan(data, "single");
			}
		} catch (err: any) {
			if (err?.name === "AbortError") {
				setStoppedNote("Scan stopped.");
				setViewState("hero");
			} else {
				setErrorMsg(err.message);
				setViewState("hero");
			}
		} finally {
			abortRef.current = null;
		}
	};

	// Reads the /api/analyze NDJSON stream for a site (multi-page) scan, updating
	// live progress as each page comes in and resolving once the final report
	// ("done") line arrives.
	const runSiteScanStream = async (
		formattedUrl: string,
		signal: AbortSignal,
	) => {
		const res = await fetch("/api/analyze", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				url: formattedUrl,
				mode: "site",
				maxPages: resolvedMaxPages,
				concurrency: settings.crawler.concurrency,
				maxDepth: settings.crawler.maxLinkDepth,
			}),
			signal,
		});

		if (!res.ok || !res.body) {
			let message = "Something went wrong running that scan.";
			try {
				const errJson = await res.json();
				message = errJson.error || message;
			} catch {
				// response wasn't JSON (or already consumed) — fall back to the default message
			}
			throw new Error(message);
		}

		const reader = res.body.getReader();
		const decoder = new TextDecoder();
		let buffer = "";

		while (true) {
			const { value, done } = await reader.read();
			if (done) break;
			buffer += decoder.decode(value, { stream: true });

			let newlineIdx;
			while ((newlineIdx = buffer.indexOf("\n")) >= 0) {
				const line = buffer.slice(0, newlineIdx).trim();
				buffer = buffer.slice(newlineIdx + 1);
				if (!line) continue;

				let evt: any;
				try {
					evt = JSON.parse(line);
				} catch {
					continue;
				}

				if (evt.type === "scanId") {
					liveScanIdRef.current = evt.scanId ?? null;
				} else if (evt.type === "status") {
					setStatusMessage(evt.message ?? "");
					// Once the crawl itself is done, the pipeline moves into
					// per-site post-processing (broken links, duplicate content,
					// security headers, PageSpeed Insights) that can take
					// anywhere from a few seconds to 30+ seconds. That phase has
					// no per-page `currentUrl` of its own, so without this the
					// last crawled page's URL stays pinned on screen and the
					// status messages below never get a chance to show,
					// making the scan look frozen right after "N of N pages".
					setCrawlProgress((p) =>
						p ? { ...p, currentUrl: undefined } : p,
					);
					// A new phase started — any link-check progress bar from a
					// previous phase no longer applies.
					setLinkCheckProgress(null);
				} else if (evt.type === "progress") {
					setCrawlProgress({
						scanned: evt.scanned,
						total: evt.total,
						currentUrl: evt.currentUrl,
					});
				} else if (evt.type === "linkProgress") {
					setLinkCheckProgress({ checked: evt.checked, total: evt.total });
				} else if (evt.type === "done") {
					setCrawlProgress((p) => (p ? { ...p, scanned: p.total } : p));
					setFinishingUp(false);
					setReportData(evt.data);
					setTimeout(() => setViewState("report"), 350);
					persistScan(evt.data, "site");
					return;
				} else if (evt.type === "aborted") {
					setStoppedNote(
						evt.pagesScanned ?
							`Scan stopped — ${evt.pagesScanned} page${evt.pagesScanned === 1 ? "" : "s"} were analyzed before you stopped it.`
						:	"Scan stopped.",
					);
					setViewState("hero");
					return;
				} else if (evt.type === "error") {
					throw new Error(
						evt.message || "Something went wrong running that scan.",
					);
				}
			}
		}
	};

	// Site scans get a "stop" menu with three real choices instead of an
	// instant kill: Resume (just closes the menu, the scan was never actually
	// interrupted), Cancel (abort outright, back to the start screen — the old
	// "stop scan" behavior), or Create report (stop the crawler dead — no more
	// pages fetched — and build the report right here from whatever was
	// already scanned). Single-page scans have no meaningful "partial report"
	// to build, so they keep the old one-click stop.
	const openStopMenu = () => {
		if (scanMode === "site") {
			setStopMenuOpen(true);
		} else {
			stopScan();
		}
	};

	const resumeScan = () => setStopMenuOpen(false);

	const cancelScan = () => {
		setStopMenuOpen(false);
		stopScan();
	};

	const stopScan = () => {
		abortRef.current?.abort();
	};

	// Tells the server to stop dispatching new page fetches and immediately
	// ship back a report built from whatever pages it already scanned. This
	// is a *separate* request from the streaming scan connection — aborting
	// that connection directly would kill the crawl before it could send
	// anything back.
	const createReportNow = async () => {
		setStopMenuOpen(false);
		const scanId = liveScanIdRef.current;
		if (!scanId) {
			// No scan id yet (stopped before the server even sent one) — nothing
			// to report on, fall back to a plain cancel.
			stopScan();
			return;
		}
		setFinishingUp(true);
		try {
			await fetch("/api/analyze/stop", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ scanId }),
			});
			// The stream is still open — the "done" event (with partial: true)
			// will arrive shortly and take over from here.
		} catch {
			// Couldn't reach the stop endpoint — fall back to a hard cancel
			// rather than leaving the user stuck on the scanning screen.
			setFinishingUp(false);
			stopScan();
		}
	};

	const applyFix = (catKey: string, issueIdx: number) => {
		if (!reportData) return;
		const newData = { ...reportData };
		const issue = newData.categories[catKey].issues[issueIdx];
		if (!issue.resolved) {
			issue.resolved = true;
			newData.categories[catKey].score = Math.min(
				97,
				newData.categories[catKey].score + issue.weight,
			);
			setReportData(newData);
		}
	};

	const fixAll = () => {
		if (!reportData) return;
		const newData = { ...reportData };
		Object.keys(newData.categories).forEach((key) => {
			newData.categories[key].issues.forEach((iss) => (iss.resolved = true));
		});
		setReportData(newData);
	};

	const computeOverall = () => {
		if (!reportData) return 0;
		const keys = Object.keys(reportData.categories);
		const sum = keys.reduce((a, k) => a + reportData.categories[k].score, 0);
		return Math.round(sum / keys.length);
	};
	const scoreColorClass = (score: number) =>
		score >= 80 ? "score-good"
		: score >= 60 ? "score-warn"
		: "score-critical";

	const progressClass = (score: number) => {
		const bucket = Math.min(100, Math.max(0, Math.round(score / 10) * 10));
		return `progress-${bucket}`;
	};
	const overall = computeOverall();
	const allResolved =
		reportData ?
			Object.values(reportData.categories).every((c) =>
				c.issues.every((i) => i.resolved),
			)
		:	false;

	// Settings → Analyzer lets people hide category cards they don't care
	// about. This only affects what's displayed — the overall score above is
	// always computed from every category, filtered or not.
	const CATEGORY_GROUP: Record<string, keyof typeof settings.analyzer.visibleCategories> = {
		seo: "seo",
		"psi-seo": "seo",
		speed: "speed",
		"psi-speed": "speed",
		a11y: "a11y",
		"psi-a11y": "a11y",
		"psi-bp": "security",
		aeo: "aeo",
		geo: "geo",
		conversions: "conversions",
		security: "security",
		links: "links",
		duplicateContent: "duplicateContent",
	};
	const visibleCategories: Record<string, Category> = {};
	if (reportData) {
		Object.entries(reportData.categories).forEach(([key, cat]) => {
			const group = CATEGORY_GROUP[key];
			const isVisible = group ? settings.analyzer.visibleCategories[group] : true;
			if (isVisible) visibleCategories[key] = cat;
		});
	}

	return (
		<div className="wrap">
			<header>
				<div className="brand">
					<span className="brand-mark">
						<svg width="14" height="14" viewBox="0 0 14 14">
							<path
								d="M1 7 L4 7 L5.5 2 L8 12 L9.5 7 L13 7"
								stroke="#fff"
								strokeWidth="1.4"
								fill="none"
								strokeLinecap="round"
								strokeLinejoin="round"
							/>
						</svg>
					</span>
					OptiQra
				</div>
				<div className="header-actions">
					<ScheduleManager />
					<SettingsPanel />
				</div>
			</header>

			{viewState === "hero" && (
				<section className="hero">
					<p className="eyebrow">Diagnostic scan</p>
					<h1>Find out what's actually wrong with your website.</h1>
					<p className="sub">
						Paste a URL. We check your SEO, speed, accessibility, and conversion
						paths — then show you exactly what to fix.
					</p>
					<div className="mode-toggle" role="radiogroup" aria-label="Scan mode">
						<button
							type="button"
							role="radio"
							aria-checked={scanMode === "single"}
							className={scanMode === "single" ? "active" : ""}
							onClick={() => setScanMode("single")}
						>
							Single page
						</button>
						<button
							type="button"
							role="radio"
							aria-checked={scanMode === "site"}
							className={scanMode === "site" ? "active" : ""}
							onClick={() => setScanMode("site")}
						>
							Whole site
						</button>
					</div>
					{scanMode === "site" && (
						<div
							className="depth-select"
							role="radiogroup"
							aria-label="Scan depth"
						>
							{SCAN_DEPTHS.map((d) => (
								<button
									key={d.id}
									type="button"
									role="radio"
									aria-checked={scanDepth === d.id}
									className={`depth-btn ${scanDepth === d.id ? "active" : ""}`}
									onClick={() => setScanDepth(d.id)}
								>
									<span className="depth-label">{d.label}</span>
									<span className="depth-hint">
										{d.id === "custom" ? "your choice" : `${d.pages} pages`}
									</span>
								</button>
							))}
						</div>
					)}
					{scanMode === "site" && scanDepth === "custom" && (
						<div className="custom-pages">
							<label htmlFor="customPages">Pages to scan</label>
							<input
								id="customPages"
								type="number"
								min={MIN_CUSTOM_PAGES}
								max={MAX_CUSTOM_PAGES}
								value={customPages}
								onChange={(e) => setCustomPages(e.target.value)}
								onBlur={() => {
									const n = Math.max(
										MIN_CUSTOM_PAGES,
										Math.min(
											MAX_CUSTOM_PAGES,
											Math.round(Number(customPages)) || MIN_CUSTOM_PAGES,
										),
									);
									setCustomPages(String(n));
								}}
								aria-label="Custom number of pages (unlimited)"
							/>
						</div>
					)}
					<form className="intake" onSubmit={runScan}>
						<input
							type="text"
							value={url}
							onChange={(e) => setUrl(e.target.value)}
							placeholder="https://yoursite.com"
							required
							aria-label="Website URL"
						/>
						<button type="submit">
							{scanMode === "site" ? "Crawl site →" : "Run diagnostic →"}
						</button>
					</form>
					{scanMode === "site" && (
						<p className="demo-note">
							We'll follow internal links (and your sitemap, if there is one) to
							scan up to {resolvedMaxPages} page
							{resolvedMaxPages === 1 ? "" : "s"}.
						</p>
					)}
					{errorMsg && (
						<p className="demo-note error-note show" role="alert">
							{errorMsg}
						</p>
					)}
					{stoppedNote && (
						<p className="demo-note stopped-note show" role="status">
							{stoppedNote}
						</p>
					)}

					{recentScansLoaded && recentScans.length > 0 && (
						<div className="recent-scans">
							<div className="recent-scans-head">
								<p className="recent-scans-title">
									Recent scans <span className="recent-scans-hint">(saved on this device)</span>
								</p>
							</div>
							<ul className="recent-scans-list">
								{recentScans.map((scan) => (
									<li key={scan.id} className="recent-scan-item">
										<button
											type="button"
											className="recent-scan-open"
											onClick={() => openStoredScan(scan.id)}
										>
											<span
												className={`recent-scan-score ${scoreColorClass(scan.overallScore)}`}
											>
												{scan.overallScore}
											</span>
											<span className="recent-scan-meta">
												<span className="recent-scan-url">{scan.url}</span>
												<span className="recent-scan-sub">
													{scan.mode === "site" ? "Whole site" : "Single page"} ·{" "}
													{new Date(scan.createdAt).toLocaleDateString()}
												</span>
											</span>
										</button>
										<button
											type="button"
											className="recent-scan-delete"
											aria-label={`Delete saved scan of ${scan.url}`}
											onClick={() => deleteScanEverywhere(scan.id)}
										>
											×
										</button>
									</li>
								))}
							</ul>
						</div>
					)}
				</section>
			)}

			{viewState === "scanning" && (
				<section className="scan active">
					<p className="scan-url">{url}</p>
					<p className="scan-title">
						{scanMode === "site" ? "Crawling the site…" : "Running diagnostic…"}
					</p>

					{scanMode === "site" && crawlProgress && (
						<div className="crawl-progress">
							<div className="crawl-scanner" aria-hidden="true">
								{Array.from({ length: 7 }).map((_, i) => (
									<span
										key={i}
										className="crawl-scanner-page"
										style={{ animationDelay: `${i * 0.18}s` }}
									>
										<svg viewBox="0 0 24 24" width="16" height="16">
											<path
												d="M6 2h9l4 4v16H6z"
												fill="none"
												stroke="currentColor"
												strokeWidth="1.6"
												strokeLinejoin="round"
											/>
											<path
												d="M9 12h7M9 16h7M9 8h3"
												stroke="currentColor"
												strokeWidth="1.4"
												strokeLinecap="round"
											/>
										</svg>
									</span>
								))}
								<span className="crawl-scanner-bot">
									<svg viewBox="0 0 24 24" width="18" height="18">
										<circle
											cx="12"
											cy="12"
											r="7"
											fill="none"
											stroke="currentColor"
											strokeWidth="1.8"
										/>
										<circle cx="12" cy="12" r="2" fill="currentColor" />
										<path
											d="M12 2v3M12 19v3"
											stroke="currentColor"
											strokeWidth="1.8"
											strokeLinecap="round"
										/>
									</svg>
								</span>
							</div>
							<div className="crawl-progress-head">
								<span>
									Scanned {crawlProgress.scanned} of {crawlProgress.total} page
									{crawlProgress.total === 1 ? "" : "s"}
								</span>
								<span>
									{Math.min(
										100,
										Math.round(
											(crawlProgress.scanned / crawlProgress.total) * 100,
										),
									)}
									%
								</span>
							</div>
							<div className="progress-bar">
								<div
									className="progress-bar-fill"
									style={{
										width: `${Math.min(
											100,
											Math.round(
												(crawlProgress.scanned / crawlProgress.total) * 100,
											),
										)}%`,
									}}
								/>
							</div>
							<p className="crawl-current-url">
								{crawlProgress.currentUrl ||
									statusMessage ||
									"Getting started…"}
							</p>
							{linkCheckProgress && linkCheckProgress.total > 0 && (
								<div className="link-check-progress">
									<div className="crawl-progress-head">
										<span>
											Checking links: {linkCheckProgress.checked} of{" "}
											{linkCheckProgress.total}
										</span>
										<span>
											{Math.min(
												100,
												Math.round(
													(linkCheckProgress.checked /
														linkCheckProgress.total) *
														100,
												),
											)}
											%
										</span>
									</div>
									<div className="progress-bar">
										<div
											className="progress-bar-fill"
											style={{
												width: `${Math.min(
													100,
													Math.round(
														(linkCheckProgress.checked /
															linkCheckProgress.total) *
															100,
													),
												)}%`,
											}}
										/>
									</div>
								</div>
							)}
						</div>
					)}

					{scanMode === "single" && (
						<ul className="steps">
							{[
								"Reading page structure",
								"Checking meta tags & schema",
								"Analyzing robots.txt & sitemaps",
								"Scanning security headers",
								"Measuring load & paint timing",
								"Auditing color contrast & ARIA",
								"Compiling full report",
							].map((stepText, i) => (
								<li
									key={i}
									className={`${
										activeStep === i ? "active"
										: activeStep > i ? "done"
										: ""
									}`}
								>
									<span className="dot"></span> {stepText}
								</li>
							))}
						</ul>
					)}

					{finishingUp ?
						<p className="finishing-up-note" role="status">
							Wrapping up your report from the pages already scanned…
						</p>
					: stopMenuOpen ?
						<div className="stop-menu" role="group" aria-label="Stop scan options">
							<p className="stop-menu-prompt">Stop this scan?</p>
							<div className="stop-menu-actions">
								<button
									type="button"
									className="stop-menu-btn stop-menu-resume"
									onClick={resumeScan}
								>
									Resume
								</button>
								<button
									type="button"
									className="stop-menu-btn stop-menu-report"
									onClick={createReportNow}
								>
									Create report now
								</button>
								<button
									type="button"
									className="stop-menu-btn stop-menu-cancel"
									onClick={cancelScan}
								>
									Cancel scan
								</button>
							</div>
						</div>
					:	<button type="button" className="stop-btn" onClick={openStopMenu}>
							Stop scan
						</button>
					}
				</section>
			)}

			{viewState === "report" && reportData && (
				<section className="report active">
					<p className="report-url">{reportData.url}</p>
					{reportData.partial && (
						<p className="demo-note stopped-note show" role="status">
							⏸ Report generated early — this only includes the{" "}
							{reportData.pagesScanned?.length ?? 0} page
							{reportData.pagesScanned?.length === 1 ? "" : "s"} scanned before
							you stopped the crawl. Broken-link, duplicate-content, and other
							site-wide checks were skipped.
						</p>
					)}
					{reportData.mode === "site" &&
						reportData.pages &&
						reportData.pages.length > 1 && (
							<CrawlTree
								pages={reportData.pages}
								title="Site structure & performance"
							/>
						)}

					{reportData.mode === "site" && reportData.pagesScanned && (
						<p className="demo-note">
							Scanned {reportData.pagesScanned.length} page
							{reportData.pagesScanned.length === 1 ? "" : "s"}
							{reportData.crawlTruncated ?
								" (more pages were found but not scanned — increase the page limit to cover the rest)"
							:	""}
							.{" "}
							<button
								type="button"
								className="link-btn"
								onClick={() => setShowPageList((v) => !v)}
							>
								{showPageList ? "Hide list" : "Show list"}
							</button>
						</p>
					)}
					{showPageList && reportData.pagesScanned && (
						<ul className="crawled-pages">
							{reportData.pagesScanned.map((pageUrl) => (
								<li key={pageUrl}>{pageUrl}</li>
							))}
						</ul>
					)}
					<div className="report-top">
						<h2>Diagnostic report</h2>
						<div className="report-top-actions">
							<ReportDownload reportData={reportData} overallScore={overall} />
							<ScheduleManager
								url={reportData.url}
								mode={reportData.mode ?? scanMode}
								maxPages={resolvedMaxPages}
							/>
							<button
								className="fix-all"
								onClick={fixAll}
								disabled={allResolved}
							>
								Mark everything resolved
							</button>
						</div>
					</div>

					<AIProviderSetup />

					<div className="overall">
						<div
							className="score"
							style={{
								color:
									overall >= 80 ? "var(--good)"
									: overall >= 60 ? "var(--warn)"
									: "var(--critical)",
							}}
						>
							{overall}
							<span>/100</span>
						</div>
						<div className="meta">
							<div className="label">Overall vitals</div>
						</div>
					</div>

					<AISiteInsights
						siteUrl={reportData.url}
						mode={reportData.mode}
						pagesScanned={reportData.pagesScanned?.length}
						overallScore={overall}
						categories={visibleCategories}
						autoGenerate={settings.ai.autoGenerateInsights}
						tone={settings.ai.insightsTone}
					/>

					<div className="cards">
						{Object.entries(visibleCategories).map(([key, cat]) => {
							const openIssues = cat.issues.filter((i) => !i.resolved).length;
							const color =
								cat.score >= 80 ? "var(--good)"
								: cat.score >= 60 ? "var(--warn)"
								: "var(--critical)";
							return (
								<div
									key={key}
									className="card"
									role="button"
									tabIndex={0}
									aria-expanded={openPanel === key}
									onClick={() => setOpenPanel(openPanel === key ? null : key)}
									onKeyDown={(e) => {
										if (e.key === "Enter" || e.key === " ") {
											e.preventDefault();
											setOpenPanel(openPanel === key ? null : key);
										}
									}}
								>
									<div className="card-head">
										<div className="card-name">{cat.label}</div>
										<div className="card-score" style={{ color }}>
											{cat.score}
										</div>
									</div>
									<div className="card-count">
										{openIssues} open issue{openIssues === 1 ? "" : "s"}
									</div>
									<div className="card-bar">
										<div
											style={{ width: `${cat.score}%`, background: color }}
										></div>
									</div>
									<div className="card-source">
										{cat.source === "lighthouse" ?
											"Google Lighthouse"
										: cat.pagesAnalyzed && cat.pagesAnalyzed > 1 ?
											`Live HTML scan · ${cat.pagesAnalyzed} pages`
										:	"Live HTML scan"}
									</div>
								</div>
							);
						})}
					</div>

					<div id="panels-container">
						{Object.entries(visibleCategories).map(([key, cat]) => (
							<div
								key={key}
								className={`panel ${openPanel === key ? "open" : ""}`}
							>
								{key === "seo" && (
									<div key={activeScanId ?? reportData.url}>
										{cat.issues.some(
											(i) => i.id === "sitemap-missing" && !i.resolved,
										) && (
											<MissingFileBanner
												kind="sitemap"
												siteUrl={reportData.url}
												pagesScanned={reportData.pagesScanned}
											/>
										)}
										{cat.issues.some(
											(i) => i.id === "robots-missing" && !i.resolved,
										) && (
											<MissingFileBanner kind="robots" siteUrl={reportData.url} />
										)}
									</div>
								)}
								{(key === "aeo" || key === "geo") && (
									<AIEngineTest
										key={`${key}-${activeScanId ?? reportData.url}`}
										url={reportData.url}
										mode={key}
										siteWide={reportData.mode === "site"}
									/>
								)}
								{cat.issues.map((iss, idx) => (
									<div
										key={idx}
										className={`finding ${iss.resolved ? "resolved" : ""}`}
									>
										<span
											className={`sev-dot ${iss.resolved ? "sev-good" : `sev-${iss.severity}`}`}
										></span>
										<div className="finding-body">
											{!iss.resolved && (
												<span className={`sev-badge sev-badge-${iss.severity}`}>
													{iss.severity}
												</span>
											)}
											<div className="finding-title">{iss.title}</div>
											<div className="finding-detail">{iss.detail}</div>
											<div className="finding-fix">Fix: {iss.fix}</div>
										</div>
										<AIFixButton
											issue={iss}
											pageUrl={reportData.url}
											category={cat.label}
											onResolve={() => applyFix(key, idx)}
										/>
									</div>
								))}
							</div>
						))}
					</div>

					<div className="again">
						<button
							onClick={() => {
								setViewState("hero");
								setUrl("");
								setErrorMsg("");
								setStoppedNote("");
								setCrawlProgress(null);
							}}
						>
							Run another scan
						</button>
					</div>
				</section>
			)}
		</div>
	);
}
