"use client";

import { useState, useEffect, useRef } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import CrawlTree from "./components/CrawlTree";
import { useTranslation } from "@/lib/hooks/useTranslation";
import type { PageNode, Issue } from "./components/CrawlTree";
import AIProviderSetup from "./components/AIProviderSetup";
import AIFixButton from "./components/AIFixButton";
import AISiteInsights from "./components/AISiteInsights";
import AIEngineTest from "./components/AIEngineTest";
import ReportDownload from "./components/ReportDownload";
import SiteCloneViewer from "./components/SiteCloneViewer";
import ProjectUploadPanel from "./components/ProjectUploadPanel";
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
import { aggregateCategoriesFromPageNodes, pickSiteStack } from "@/lib/reportAggregate";
import { getErrorMessage, isAbortError } from "@/lib/errorUtils";

type ScanState = "hero" | "scanning" | "report";
type ScanMode = "single" | "site";

// Shape of the parsed report the "done" event (and the /api/analyze
// single-page response) resolves to. Kept as its own named type so it can
// be reused for both useState<ReportData | null> and the streamed event.
type ReportData = {
	url: string;
	mode?: ScanMode;
	categories: Record<string, Category>;
	pagesScanned?: string[];
	pagesSkipped?: { url: string; reason: string }[];
	crawlTruncated?: boolean;
	pages?: PageNode[];
	partial?: boolean;
	stack?: { primary: string; summary: string; guidance: string };
};

// Discriminated union for each NDJSON line emitted by the /api/analyze
// site-scan stream (see runSiteScanStream below).
type SiteScanStreamEvent =
	| { type: "status"; message?: string }
	| { type: "progress"; pageNode?: PageNode; scanned: number; total: number; currentUrl?: string }
	| { type: "linkProgress"; checked: number; total: number }
	| { type: "done"; data: ReportData }
	| { type: "aborted"; pagesScanned?: number }
	| { type: "error"; message?: string };

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
	const { t } = useTranslation();
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
	const scanUrlRef = useRef<string>("");
	/** Every PageNode audited so far in the current site scan, across any
	 *  pause/resume cycles — this is what "Pause"/"Create report now" have
	 *  available to build a report from without needing anything else from
	 *  the server. */
	const pageNodesRef = useRef<PageNode[]>([]);
	/** Set right before we deliberately abort the live connection (pause /
	 *  create-report-now / cancel), so the stream-reading code below knows
	 *  whether an AbortError means "the user cancelled, go back to the start
	 *  screen" or "this abort was expected, the click handler already updated
	 *  the UI — do nothing more." */
	const stopIntentRef = useRef<"cancel" | "pause" | "report" | null>(null);
	const [isPaused, setIsPaused] = useState(false);
	const [linkCheckProgress, setLinkCheckProgress] = useState<{
		checked: number;
		total: number;
	} | null>(null);
	const [reportData, setReportData] = useState<ReportData | null>(null);
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
		scanUrlRef.current = formattedUrl;
		setViewState("scanning");
		setActiveScanId(null);
		setActiveStep(0);
		setStatusMessage("");
		setCrawlProgress(
			scanMode === "site" ? { scanned: 0, total: resolvedMaxPages } : null,
		);
		setLinkCheckProgress(null);
		setIsPaused(false);
		pageNodesRef.current = [];
		stopIntentRef.current = null;

		const controller = new AbortController();
		abortRef.current = controller;

		try {
			if (scanMode === "site") {
				await runSiteScanStream(formattedUrl, controller.signal, {
					maxPages: resolvedMaxPages,
				});
			} else {
				const res = await fetch("/api/analyze", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						url: formattedUrl,
						mode: scanMode,
						renderJs: settings.crawler.renderJs,
					}),
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
		} catch (err: unknown) {
			if (isAbortError(err)) {
				// Cancel is the only path that lands here on purpose (pause and
				// create-report-now handle their own UI transitions before
				// aborting) — anything else means the connection dropped
				// unexpectedly, which should still send the user back rather
				// than leaving them stuck on a frozen scanning screen.
				if (stopIntentRef.current === "cancel" || stopIntentRef.current === null) {
					setStoppedNote(
						pageNodesRef.current.length > 0 ?
							`Scan stopped — ${pageNodesRef.current.length} page${pageNodesRef.current.length === 1 ? "" : "s"} were analyzed before you stopped it.`
						:	"Scan stopped.",
					);
					setViewState("hero");
				}
			} else {
				setErrorMsg(getErrorMessage(err));
				setViewState("hero");
			}
		} finally {
			abortRef.current = null;
			stopIntentRef.current = null;
		}
	};

	// Reads the /api/analyze NDJSON stream for a site (multi-page) scan, updating
	// live progress as each page comes in and resolving once the final report
	// ("done") line arrives. Also used to resume a paused scan: pass
	// `excludeUrls`/`priorPageNodes` (already-scanned pages to skip / seed the
	// report with) and `maxPages` set to the *remaining* page budget.
	const runSiteScanStream = async (
		formattedUrl: string,
		signal: AbortSignal,
		opts: {
			maxPages: number;
			excludeUrls?: string[];
			priorPageNodes?: PageNode[];
		},
	) => {
		const res = await fetch("/api/analyze", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				url: formattedUrl,
				mode: "site",
				maxPages: opts.maxPages,
				concurrency: settings.crawler.concurrency,
				maxDepth: settings.crawler.maxLinkDepth,
				renderJs: settings.crawler.renderJs,
				excludeUrls: opts.excludeUrls,
				priorPageNodes: opts.priorPageNodes,
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

				let evt: SiteScanStreamEvent;
				try {
					evt = JSON.parse(line) as SiteScanStreamEvent;
				} catch {
					continue;
				}

				if (evt.type === "status") {
					setStatusMessage(evt.message ?? "");
					// Once the crawl itself is done, the pipeline moves into
					// per-site post-processing (broken links, duplicate content,
					// security headers) that can take
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
					if (evt.pageNode) pageNodesRef.current.push(evt.pageNode);
					setCrawlProgress({
						scanned: evt.scanned,
						total: evt.total,
						currentUrl: evt.currentUrl,
					});
				} else if (evt.type === "linkProgress") {
					setLinkCheckProgress({ checked: evt.checked, total: evt.total });
				} else if (evt.type === "done") {
					setCrawlProgress((p) => (p ? { ...p, scanned: p.total } : p));
					setReportData(evt.data);
					setTimeout(() => setViewState("report"), 350);
					persistScan(evt.data, "site");
					return;
				} else if (evt.type === "aborted") {
					// Only a plain Cancel should redirect home from here — pause
					// and create-report-now already set the UI they want before
					// triggering this same abort.
					if (stopIntentRef.current !== "pause" && stopIntentRef.current !== "report") {
						setStoppedNote(
							evt.pagesScanned ?
								`Scan stopped — ${evt.pagesScanned} page${evt.pagesScanned === 1 ? "" : "s"} were analyzed before you stopped it.`
							:	"Scan stopped.",
						);
						setViewState("hero");
					}
					return;
				} else if (evt.type === "error") {
					throw new Error(
						evt.message || "Something went wrong running that scan.",
					);
				}
			}
		}
	};

	// Pause: stop the crawler dead (abort the connection — there's no way to
	// truly suspend a live request without tearing it down) but keep every
	// page audited so far, and flip the button to "Resume".
	const pauseScan = () => {
		stopIntentRef.current = "pause";
		abortRef.current?.abort();
		setIsPaused(true);
	};

	// Resume: starts a *new* crawl request, telling the server which pages are
	// already done (skip them) and seeding it with their results (so the
	// eventual report still covers the whole site), capped to whatever's left
	// of the original page budget.
	const resumeScan = async () => {
		setIsPaused(false);
		stopIntentRef.current = null;
		const already = pageNodesRef.current;
		const remaining = Math.max(1, resolvedMaxPages - already.length);

		const controller = new AbortController();
		abortRef.current = controller;
		try {
			await runSiteScanStream(scanUrlRef.current, controller.signal, {
				maxPages: remaining,
				excludeUrls: already.map((p) => p.url),
				priorPageNodes: already,
			});
		} catch (err: unknown) {
			if (isAbortError(err)) {
				if (stopIntentRef.current === "cancel" || stopIntentRef.current === null) {
					setStoppedNote(
						already.length > 0 ?
							`Scan stopped — ${already.length} page${already.length === 1 ? "" : "s"} were analyzed before you stopped it.`
						:	"Scan stopped.",
					);
					setViewState("hero");
				}
			} else {
				setErrorMsg(getErrorMessage(err));
				setViewState("hero");
			}
		} finally {
			abortRef.current = null;
			stopIntentRef.current = null;
		}
	};

	// Cancel: stop for good and go back to the start screen. Works whether
	// the scan is actively running or currently paused.
	const cancelScan = () => {
		stopIntentRef.current = "cancel";
		if (abortRef.current) {
			abortRef.current.abort();
		} else {
			// Already paused (no live connection to abort) — reset directly.
			setStoppedNote(
				pageNodesRef.current.length > 0 ?
					`Scan stopped — ${pageNodesRef.current.length} page${pageNodesRef.current.length === 1 ? "" : "s"} were analyzed before you stopped it.`
				:	"Scan stopped.",
			);
			setViewState("hero");
		}
	};

	// Create report now: stop the crawler dead and build the report right
	// here from whatever pages were already scanned — no extra site-wide
	// checks (broken links, duplicate content, etc.), no trip back to the
	// landing page. Works whether actively scanning or paused, since the
	// report is built entirely from what's already in `pageNodesRef`.
	const createReportNow = () => {
		const nodes = pageNodesRef.current;
		if (nodes.length === 0) {
			cancelScan();
			return;
		}

		const categories = aggregateCategoriesFromPageNodes(nodes);
		const data = {
			url: scanUrlRef.current,
			mode: "site" as ScanMode,
			categories,
			pagesScanned: nodes.map((n) => n.url),
			pagesSkipped: [],
			crawlTruncated: true,
			pages: nodes,
			partial: true,
			stack: pickSiteStack(nodes),
		};

		stopIntentRef.current = "report";
		abortRef.current?.abort();
		setReportData(data);
		setViewState("report");
		persistScan(data, "site");
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
		speed: "speed",
		a11y: "a11y",
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
			<header className="flex items-center justify-between py-7">
				<div className="flex items-center gap-2 font-(family-name:--font-cond) text-lg font-bold">
					<span className="flex size-6 items-center justify-center rounded-md bg-brand">
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
				<div className="flex items-center gap-2">
					<ScheduleManager />
					<SettingsPanel />
				</div>
			</header>

			{viewState === "hero" && (
				<section className="pt-8 pb-20">
					<p className="mb-3 flex items-center gap-2 font-(family-name:--font-mono) text-xs font-medium tracking-[0.08em] text-ink-soft uppercase">
						<span className="eyebrow-dot inline-block size-1.5 rounded-full bg-brand" />
						{t("hero.eyebrow")}
					</p>
					<h1 className="mb-5 max-w-[14ch] font-(family-name:--font-cond) text-[clamp(34px,5vw,52px)] leading-[1.05] font-bold tracking-[-0.01em]">
						{t("hero.title")}
					</h1>
					<p className="mb-8 max-w-[52ch] font-(family-name:--font-readable) text-[15.5px] leading-relaxed text-ink-soft">
						{t("hero.subtitle")}
					</p>
					<Tabs
						value={scanMode}
						onValueChange={(v) => setScanMode(v as ScanMode)}
						className="mb-5"
					>
						<TabsList aria-label="Scan mode">
							<TabsTrigger value="single">{t("hero.singlePage")}</TabsTrigger>
							<TabsTrigger value="site">{t("hero.wholeSite")}</TabsTrigger>
						</TabsList>
					</Tabs>
					{scanMode === "site" && (
						<div
							className="mb-5 flex flex-wrap gap-2"
							role="radiogroup"
							aria-label="Scan depth"
						>
							{SCAN_DEPTHS.map((d) => (
								<button
									key={d.id}
									type="button"
									role="radio"
									aria-checked={scanDepth === d.id}
									onClick={() => setScanDepth(d.id)}
									className={cn(
										"flex flex-col items-start gap-0.5 rounded-(--radius) border px-3.5 py-2.5 text-left transition-colors",
										scanDepth === d.id ?
											"border-brand bg-brand-soft"
										:	"border-line bg-card hover:border-brand/50",
									)}
								>
									<span
										className={cn(
											"text-sm font-semibold",
											scanDepth === d.id ? "text-brand" : "text-ink",
										)}
									>
										{d.label}
									</span>
									<span className="text-xs text-ink-soft">
										{d.id === "custom" ? t("hero.yourChoice") : `${d.pages} ${t("hero.pagesSuffix")}`}
									</span>
								</button>
							))}
						</div>
					)}
					{scanMode === "site" && scanDepth === "custom" && (
						<div className="mb-5 flex items-center gap-3">
							<Label htmlFor="customPages" className="text-sm text-ink-soft">
								{t("hero.pagesToScan")}
							</Label>
							<Input
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
								className="w-28"
							/>
						</div>
					)}
					<form className="mb-4 flex gap-2" onSubmit={runScan}>
						<Input
							type="text"
							value={url}
							onChange={(e) => setUrl(e.target.value)}
							placeholder={t("hero.urlPlaceholder")}
							required
							aria-label="Website URL"
							className="h-11 max-w-md text-[15px]"
						/>
						<Button type="submit" variant="brand" size="lg" className="h-11">
							{scanMode === "site" ? t("hero.crawlSite") : t("hero.runDiagnostic")}
						</Button>
					</form>
					{scanMode === "site" && (
						<p className="mb-2 max-w-md text-sm text-ink-soft">
							We&apos;ll follow internal links (and your sitemap, if there is one) to
							scan up to {resolvedMaxPages} page
							{resolvedMaxPages === 1 ? "" : "s"}.
						</p>
					)}
					{errorMsg && (
						<p
							className="mb-2 max-w-md text-sm text-critical"
							role="alert"
						>
							{errorMsg}
						</p>
					)}
					{stoppedNote && (
						<p className="mb-2 max-w-md text-sm text-ink-soft" role="status">
							{stoppedNote}
						</p>
					)}

					<ProjectUploadPanel />

					{recentScansLoaded && recentScans.length > 0 && (
						<div className="mt-10 max-w-xl">
							<p className="mb-3 text-sm font-semibold text-ink">
								Recent scans{" "}
								<span className="font-normal text-ink-soft">
									(saved on this device)
								</span>
							</p>
							<ul className="flex flex-col gap-2">
								{recentScans.map((scan) => (
									<li
										key={scan.id}
										className="flex items-center gap-2 rounded-(--radius) border border-line bg-card"
									>
										<button
											type="button"
											className="flex flex-1 items-center gap-3 px-4 py-3 text-left"
											onClick={() => openStoredScan(scan.id)}
										>
											<span
												className={cn(
													"flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-bold",
													scoreColorClass(scan.overallScore) === "score-good" &&
														"bg-good-bg text-good",
													scoreColorClass(scan.overallScore) === "score-warn" &&
														"bg-warn-bg text-warn",
													scoreColorClass(scan.overallScore) === "score-critical" &&
														"bg-critical-bg text-critical",
												)}
											>
												{scan.overallScore}
											</span>
											<span className="flex min-w-0 flex-col">
												<span className="truncate text-sm font-medium text-ink">
													{scan.url}
												</span>
												<span className="text-xs text-ink-soft">
													{scan.mode === "site" ? "Whole site" : "Single page"} ·{" "}
													{new Date(scan.createdAt).toLocaleDateString()}
												</span>
											</span>
										</button>
										<button
											type="button"
											className="mr-3 flex size-6 shrink-0 items-center justify-center rounded text-ink-soft hover:bg-secondary hover:text-critical"
											aria-label={`Delete saved scan of ${scan.url}`}
											onClick={() => deleteScanEverywhere(scan.id)}
										>
											<X className="size-3.5" />
										</button>
									</li>
								))}
							</ul>
						</div>
					)}
				</section>
			)}

			{viewState === "scanning" && (
				<section className="py-14 pb-20">
					<p className="mb-1.5 font-(family-name:--font-mono) text-sm text-ink-soft">
						{url}
					</p>
					<p className="mb-8 font-(family-name:--font-cond) text-2xl font-bold">
						{scanMode === "site" ? "Crawling the site…" : "Running diagnostic…"}
					</p>

					{scanMode === "site" && crawlProgress && (
						<div className="mb-9 max-w-md">
							<div
								className="relative mb-2.5 flex h-[30px] items-center justify-between px-0.5"
								aria-hidden="true"
							>
								{Array.from({ length: 7 }).map((_, i) => (
									<span
										key={i}
										className="crawl-scanner-page flex text-line"
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
								<span className="crawl-scanner-bot absolute top-1/2 left-0 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-card text-brand">
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
							<div className="mb-2 flex justify-between font-(family-name:--font-mono) text-[13px] text-ink-soft">
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
							<Progress
								value={Math.min(
									100,
									Math.round(
										(crawlProgress.scanned / crawlProgress.total) * 100,
									),
								)}
							/>
							<p className="mt-2.5 truncate font-(family-name:--font-mono) text-xs text-ink-soft">
								{isPaused ?
									"⏸ Paused — press Resume to keep going."
								:	crawlProgress.currentUrl ||
									statusMessage ||
									"Getting started…"}
							</p>
							{linkCheckProgress && linkCheckProgress.total > 0 && (
								<div className="mt-4">
									<div className="mb-2 flex justify-between font-(family-name:--font-mono) text-[13px] text-ink-soft">
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
									<Progress
										value={Math.min(
											100,
											Math.round(
												(linkCheckProgress.checked /
													linkCheckProgress.total) *
													100,
											),
										)}
									/>
								</div>
							)}
						</div>
					)}

					{scanMode === "single" && (
						<ul className="max-w-md list-none p-0">
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
									className={cn(
										"flex items-center gap-3 border-b border-line py-2.5 text-[14.5px] transition-colors last:border-b-0",
										activeStep === i ? "text-ink"
										: activeStep > i ? "text-ink-soft"
										: "text-ink-soft/60",
									)}
								>
									<span
										className={cn(
											"flex size-4 shrink-0 items-center justify-center rounded-full border-[1.5px]",
											activeStep > i ?
												"step-dot-done border-good bg-good"
											: activeStep === i ?
												"step-dot-active border-brand"
											:	"border-line",
										)}
									/>{" "}
									{stepText}
								</li>
							))}
						</ul>
					)}

					<div className="mt-8 flex flex-wrap items-center gap-3">
						{scanMode === "site" && (
							<Button
								type="button"
								variant="secondary"
								onClick={isPaused ? resumeScan : pauseScan}
							>
								{isPaused ? "Resume" : "Pause"}
							</Button>
						)}
						{scanMode === "site" && (
							<Button type="button" variant="outline" onClick={createReportNow}>
								Create report now
							</Button>
						)}
						<Button
							type="button"
							variant="ghost"
							className="text-ink-soft hover:text-critical"
							onClick={cancelScan}
						>
							Cancel scan
						</Button>
					</div>
				</section>
			)}


			{viewState === "report" && reportData && (
				<section className="pt-8 pb-20">
					<p className="mb-1 truncate font-(family-name:--font-mono) text-sm text-ink-soft">
						{reportData.url}
					</p>
					{reportData.partial && (
						<p className="mb-3 max-w-2xl text-sm text-ink-soft" role="status">
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
						<p className="mb-2 text-sm text-ink-soft">
							Scanned {reportData.pagesScanned.length} page
							{reportData.pagesScanned.length === 1 ? "" : "s"}
							{reportData.crawlTruncated ?
								" (more pages were found but not scanned — increase the page limit to cover the rest)"
							:	""}
							.{" "}
							<button
								type="button"
								className="text-brand underline-offset-2 hover:underline"
								onClick={() => setShowPageList((v) => !v)}
							>
								{showPageList ? "Hide list" : "Show list"}
							</button>
						</p>
					)}
					{showPageList && reportData.pagesScanned && (
						<ul className="mb-4 flex max-h-56 flex-col gap-1 overflow-y-auto rounded-(--radius) border border-line bg-card p-3 font-(family-name:--font-mono) text-xs text-ink-soft">
							{reportData.pagesScanned.map((pageUrl) => (
								<li key={pageUrl} className="truncate">
									{pageUrl}
								</li>
							))}
						</ul>
					)}
					<div className="mt-8 mb-6 flex flex-wrap items-center justify-between gap-4">
						<h2 className="font-(family-name:--font-cond) text-2xl font-bold">
							Diagnostic report
						</h2>
						<div className="flex flex-wrap items-center gap-2">
							<ReportDownload reportData={reportData} overallScore={overall} />
							<SiteCloneViewer
								url={reportData.url}
								renderJs={settings.crawler.renderJs}
							/>
							<ScheduleManager
								url={reportData.url}
								mode={reportData.mode ?? scanMode}
								maxPages={resolvedMaxPages}
							/>
							<Button variant="outline" onClick={fixAll} disabled={allResolved}>
								Mark everything resolved
							</Button>
						</div>
					</div>

					<AIProviderSetup />

					<div className="my-8 flex items-center gap-5">
						<div
							className={cn(
								"font-(family-name:--font-cond) text-6xl font-bold",
								overall >= 80 ? "text-good"
								: overall >= 60 ? "text-warn"
								: "text-critical",
							)}
						>
							{overall}
							<span className="text-2xl font-medium text-ink-soft">/100</span>
						</div>
						<div className="text-sm font-semibold text-ink-soft">
							Overall vitals
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
						stack={reportData.stack}
					/>

					<div className="density-cards my-6 grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3.5">
						{Object.entries(visibleCategories).map(([key, cat]) => {
							const openIssues = cat.issues.filter((i) => !i.resolved).length;
							const colorClass =
								cat.score >= 80 ? "good"
								: cat.score >= 60 ? "warn"
								: "critical";
							return (
								<Card
									key={key}
									className="density-card cursor-pointer gap-2 p-4 shadow-none transition-colors hover:border-brand/50"
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
									<div className="flex items-center justify-between gap-2">
										<div className="text-sm font-semibold">{cat.label}</div>
										<div
											className={cn(
												"text-lg font-bold",
												colorClass === "good" && "text-good",
												colorClass === "warn" && "text-warn",
												colorClass === "critical" && "text-critical",
											)}
										>
											{cat.score}
										</div>
									</div>
									<div className="text-xs text-ink-soft">
										{openIssues} open issue{openIssues === 1 ? "" : "s"}
									</div>
									<div className="h-1.5 overflow-hidden rounded-full bg-secondary">
										<div
											className={cn(
												"h-full rounded-full",
												colorClass === "good" && "bg-good",
												colorClass === "warn" && "bg-warn",
												colorClass === "critical" && "bg-critical",
											)}
											style={{ width: `${cat.score}%` }}
										/>
									</div>
									<div className="text-[11px] text-ink-soft">
										{cat.source === "lighthouse" ?
											"Google Lighthouse"
										: cat.pagesAnalyzed && cat.pagesAnalyzed > 1 ?
											`Live HTML scan · ${cat.pagesAnalyzed} pages`
										:	"Live HTML scan"}
									</div>
								</Card>
							);
						})}
					</div>

					<div id="panels-container">
						{Object.entries(visibleCategories).map(([key, cat]) => (
							<div
								key={key}
								className={cn(
									"grid transition-[grid-template-rows] duration-200",
									openPanel === key ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
								)}
							>
								<div className="flex flex-col gap-3 overflow-hidden">
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
											className={cn(
												"density-finding flex items-start gap-3 rounded-(--radius) border border-line bg-card p-4",
												iss.resolved && "opacity-60",
											)}
										>
											<span
												className={cn(
													"mt-1 size-2 shrink-0 rounded-full",
													iss.resolved ? "bg-good"
													: iss.severity === "critical" ? "bg-sev-critical"
													: iss.severity === "high" ? "bg-sev-high"
													: iss.severity === "medium" ? "bg-sev-medium"
													: iss.severity === "low" ? "bg-sev-low"
													: "bg-sev-info border border-sev-info-border",
												)}
											/>
											<div className="flex flex-1 flex-col gap-1">
												{!iss.resolved && (
													<Badge
														variant={`sev-${iss.severity}` as never}
														className="self-start capitalize"
													>
														{iss.severity}
													</Badge>
												)}
												<div className="text-sm font-semibold text-ink">
													{iss.title}
												</div>
												<div className="text-sm text-ink-soft">{iss.detail}</div>
												<div className="text-sm text-ink-soft italic">
													Fix: {iss.fix}
												</div>
											</div>
											<AIFixButton
												issue={iss}
												pageUrl={reportData.url}
												category={cat.label}
												stack={reportData.stack}
												onResolve={() => applyFix(key, idx)}
											/>
										</div>
									))}
								</div>
							</div>
						))}
					</div>

					<div className="mt-10 flex justify-center">
						<Button
							variant="outline"
							size="lg"
							onClick={() => {
								setViewState("hero");
								setUrl("");
								setErrorMsg("");
								setStoppedNote("");
								setCrawlProgress(null);
							}}
						>
							Run another scan
						</Button>
					</div>
				</section>
			)}
		</div>
	);
}
