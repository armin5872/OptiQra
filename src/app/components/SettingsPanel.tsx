"use client";

import { useEffect, useRef, useState } from "react";
import { useSettings } from "@/lib/hooks/useSettings";
import { useTranslation, type TranslationKey } from "@/lib/hooks/useTranslation";
import { useAIProvider } from "@/lib/hooks/useAIProvider";
import { LANGUAGES } from "@/lib/i18n";
import {
	ACCENT_PRESETS,
	exportSettingsAsJSON,
	parseImportedSettings,
	getStorageEstimate,
	type OptiqraSettings,
} from "@/lib/settingsStore";
import { clearScans, getAllScans } from "@/lib/scanStore";
import { clearScanCookies } from "@/lib/scanCookies";
import {
	getNotificationPermission,
	requestNotificationPermission,
	type NotificationPermissionState,
} from "@/lib/notifications";
import CustomRulesPanel from "./CustomRulesPanel";
import { runCustomJS } from "@/lib/customCode";

// Simple debounce for slider inputs so we don't update 60x/second
function useDebounced<T>(value: T, ms: number): T {
	const [debouncedValue, setDebouncedValue] = useState(value);
	useEffect(() => {
		const timer = setTimeout(() => setDebouncedValue(value), ms);
		return () => clearTimeout(timer);
	}, [value, ms]);
	return debouncedValue;
}

type TabId =
	| "appearance"
	| "layout"
	| "typography"
	| "scanning"
	| "crawler"
	| "analyzer"
	| "ai"
	| "rules"
	| "advanced"
	| "notifications"
	| "reports"
	| "privacy";

const TABS: { id: TabId; labelKey: TranslationKey; icon: string }[] = [
	{ id: "appearance", labelKey: "settings.tabs.appearance", icon: "🎨" },
	{ id: "layout", labelKey: "settings.tabs.layout", icon: "📐" },
	{ id: "typography", labelKey: "settings.tabs.typography", icon: "🔤" },
	{ id: "scanning", labelKey: "settings.tabs.scanning", icon: "🔍" },
	{ id: "crawler", labelKey: "settings.tabs.crawler", icon: "🕸️" },
	{ id: "analyzer", labelKey: "settings.tabs.analyzer", icon: "📊" },
	{ id: "ai", labelKey: "settings.tabs.ai", icon: "✨" },
	{ id: "rules", labelKey: "settings.tabs.rules", icon: "🧩" },
	{ id: "advanced", labelKey: "settings.tabs.advanced", icon: "🛠️" },
	{ id: "notifications", labelKey: "settings.tabs.notifications", icon: "🔔" },
	{ id: "reports", labelKey: "settings.tabs.reports", icon: "📄" },
	{ id: "privacy", labelKey: "settings.tabs.privacy", icon: "🛡️" },
];

const CATEGORY_LABEL_KEYS: Record<keyof OptiqraSettings["analyzer"]["visibleCategories"], TranslationKey> = {
	seo: "settings.categories.seo",
	aeo: "settings.categories.aeo",
	geo: "settings.categories.geo",
	speed: "settings.categories.speed",
	a11y: "settings.categories.a11y",
	conversions: "settings.categories.conversions",
	security: "settings.categories.security",
	links: "settings.categories.links",
	duplicateContent: "settings.categories.duplicateContent",
};

function Switch({ on, onToggle, label }: { on: boolean; onToggle: () => void; label: string }) {
	return (
		<button
			type="button"
			className={`settings-switch ${on ? "on" : ""}`}
			role="switch"
			aria-checked={on}
			aria-label={label}
			onClick={onToggle}
		/>
	);
}

export default function SettingsPanel() {
	const [open, setOpen] = useState(false);
	const [tab, setTab] = useState<TabId>("appearance");
	const { settings, hydrated, update, replaceAll, reset } = useSettings();
	const { t } = useTranslation();
	const { provider, model, isConfigured, hydrated: aiHydrated } = useAIProvider();
	const panelRef = useRef<HTMLDivElement>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);

	const [permission, setPermission] = useState<NotificationPermissionState>("default");
	const [scanCount, setScanCount] = useState<number | null>(null);
	const [storage, setStorage] = useState<{ usageBytes: number; quotaBytes: number } | null>(null);
	const [toast, setToast] = useState("");
	const [jsRunResult, setJsRunResult] = useState<{ ok: boolean; message: string } | null>(null);

	// Show brief "Applied" feedback when appearance/layout/typography settings change
	useEffect(() => {
		if (!hydrated) return;
		flashToast(t("settings.toasts.applied"));
	}, [hydrated, settings.appearance, settings.layout, settings.typography, settings.advanced.customCSS, t]);

	useEffect(() => {
		if (!open) return;
		setPermission(getNotificationPermission());
		getAllScans()
			.then((s) => setScanCount(s.length))
			.catch(() => setScanCount(0));
		getStorageEstimate().then(setStorage);
	}, [open]);

	useEffect(() => {
		if (!open) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") setOpen(false);
		};
		document.addEventListener("keydown", onKey);
		return () => document.removeEventListener("keydown", onKey);
	}, [open]);

	const flashToast = (msg: string) => {
		setToast(msg);
		setTimeout(() => setToast(""), 2200);
	};

	const handleClearHistory = async () => {
		await clearScans();
		clearScanCookies();
		setScanCount(0);
		flashToast(t("settings.toasts.scanHistoryCleared"));
	};

	const handleExport = () => {
		const blob = new Blob([exportSettingsAsJSON(settings)], { type: "application/json" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = "optiqra-settings.json";
		a.click();
		URL.revokeObjectURL(url);
		flashToast(t("settings.toasts.settingsExported"));
	};

	const handleImportFile = async (file: File) => {
		const text = await file.text();
		const parsed = parseImportedSettings(text);
		if (!parsed) {
			flashToast(t("settings.toasts.couldntReadFile"));
			return;
		}
		replaceAll(parsed);
		flashToast(t("settings.toasts.settingsImported"));
	};

	const handleEnableNotifications = async () => {
		const result = await requestNotificationPermission();
		setPermission(result);
	};

	const handleRunCustomJS = () => {
		const result = runCustomJS(settings.advanced.customJS);
		setJsRunResult(
			result.ok ?
				{ ok: true, message: "Ran without errors." }
			:	{ ok: false, message: result.error },
		);
	};

	if (!hydrated) return null;
	const a = settings.appearance;

	return (
		<>
			<button
				type="button"
				className="settings-trigger-btn"
				onClick={() => setOpen(true)}
				aria-haspopup="dialog"
				aria-expanded={open}
			>
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none">
					<circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
					<path
						d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
						stroke="currentColor"
						strokeWidth="1.6"
					/>
				</svg>
				{t("header.settings")}
			</button>

			{open && (
				<div className="settings-overlay" onClick={() => setOpen(false)}>
					<div
						className="settings-panel"
						role="dialog"
						aria-label={t("settings.title")}
						ref={panelRef}
						onClick={(e) => e.stopPropagation()}
					>
						<nav className="settings-nav">
							<div className="settings-nav-title">⚙️ {t("settings.title")}</div>
							{TABS.map((tabInfo) => (
								<button
									key={tabInfo.id}
									type="button"
									className={`settings-nav-btn ${tab === tabInfo.id ? "active" : ""}`}
									onClick={() => setTab(tabInfo.id)}
								>
									<span className="settings-nav-icon">{tabInfo.icon}</span>
									{t(tabInfo.labelKey)}
								</button>
							))}
						</nav>

						<div className="settings-main">
							<div className="settings-header">
								<div className="settings-header-title">
									<h2>{t(TABS.find((tabInfo) => tabInfo.id === tab)?.labelKey ?? "settings.tabs.appearance")}</h2>
									<p>{t("settings.changesSaveAutomatically")}</p>
								</div>
								<button
									type="button"
									className="modal-close"
									onClick={() => setOpen(false)}
									aria-label={t("settings.closeSettings")}
								>
									×
								</button>
							</div>

							<div className="settings-body">
								{tab === "appearance" && (
									<>
										<p className="settings-section-desc">
											{t("settings.appearance.sectionDesc")}
										</p>
										<div className="settings-group">
											<div className="settings-row">
												<div className="settings-row-label">
													<strong>{t("settings.appearance.language")}</strong>
													<span>{t("settings.appearance.languageHint")}</span>
												</div>
												<div className="settings-row-control">
													<select
														value={settings.general.language}
														onChange={(e) =>
															update("general", {
																language: e.target.value as OptiqraSettings["general"]["language"],
															})
														}
														aria-label={t("settings.appearance.language")}
													>
														{LANGUAGES.map((lang) => (
															<option key={lang.code} value={lang.code}>
																{lang.nativeName}
															</option>
														))}
													</select>
												</div>
											</div>
											<div className="settings-row">
												<div className="settings-row-label">
													<strong>{t("settings.appearance.theme")}</strong>
													<span>{t("settings.appearance.themeHint")}</span>
												</div>
												<div className="settings-row-control">
													<div className="settings-segmented">
														{(["system", "light", "dark"] as const).map((v) => (
															<button
																key={v}
																type="button"
																className={a.theme === v ? "active" : ""}
																onClick={() => update("appearance", { theme: v })}
															>
																{v === "system"
																	? t("settings.appearance.auto")
																	: t(`settings.appearance.${v}` as TranslationKey)}
															</button>
														))}
													</div>
												</div>
											</div>
											<div className="settings-row">
												<div className="settings-row-label">
													<strong>{t("settings.appearance.accentColor")}</strong>
													<span>{t("settings.appearance.accentColorHint")}</span>
												</div>
												<div className="settings-row-control">
													<div className="settings-swatches">
														{ACCENT_PRESETS.map((p) => (
															<button
																key={p.id}
																type="button"
																className={`settings-swatch ${a.accentColor === p.value ? "active" : ""}`}
																style={{ background: p.value }}
																title={p.label}
																aria-label={p.label}
																onClick={() => update("appearance", { accentColor: p.value })}
															/>
														))}
													</div>
												</div>
											</div>
											<div className="settings-row">
												<div className="settings-row-label">
													<strong>{t("settings.appearance.density")}</strong>
													<span>{t("settings.appearance.densityHint")}</span>
												</div>
												<div className="settings-row-control">
													<div className="settings-segmented">
														{(["comfortable", "compact"] as const).map((v) => (
															<button
																key={v}
																type="button"
																className={a.density === v ? "active" : ""}
																onClick={() => update("appearance", { density: v })}
															>
																{v === "comfortable"
																	? t("settings.appearance.comfortable")
																	: t("settings.appearance.compact")}
															</button>
														))}
													</div>
												</div>
											</div>
											<div className="settings-row">
												<div className="settings-row-label">
													<strong>{t("settings.appearance.textSize")}</strong>
													<span>{t("settings.appearance.textSizeHint")}</span>
												</div>
												<div className="settings-row-control">
													<div className="settings-segmented">
														{(["small", "default", "large"] as const).map((v) => (
															<button
																key={v}
																type="button"
																className={a.fontScale === v ? "active" : ""}
																onClick={() => update("appearance", { fontScale: v })}
															>
																{t(`settings.appearance.${v}` as TranslationKey)}
															</button>
														))}
													</div>
												</div>
											</div>
											<div className="settings-row">
												<div className="settings-row-label">
													<strong>{t("settings.appearance.reduceMotion")}</strong>
													<span>{t("settings.appearance.reduceMotionHint")}</span>
												</div>
												<Switch
													on={a.reduceMotion}
													label={t("settings.appearance.reduceMotion")}
													onToggle={() => update("appearance", { reduceMotion: !a.reduceMotion })}
												/>
											</div>
										</div>
									</>
								)}

								{tab === "layout" && (
									<>
										<p className="settings-section-desc">
											Reshape the page itself — corner roundness, content width, and how fast
											things move. Applies instantly, everywhere, no reload.
										</p>
										<div className="settings-group">
											<div className="settings-row">
												<div className="settings-row-label">
													<strong>Corner roundness</strong>
													<span>Buttons, cards, inputs — 0 is sharp, 28 is very round</span>
												</div>
												<div className="settings-slider">
													<input
														type="range"
														min={0}
														max={28}
														value={settings.layout.cornerRadius}
														onChange={(e) =>
															update("layout", { cornerRadius: Number(e.target.value) })
														}
													/>
													<output>{settings.layout.cornerRadius}px</output>
												</div>
											</div>
											<div className="settings-row">
												<div className="settings-row-label">
													<strong>Content width</strong>
													<span>How wide the main column gets on large screens</span>
												</div>
												<div className="settings-slider">
													<input
														type="range"
														min={720}
														max={1600}
														step={20}
														value={settings.layout.contentWidth}
														onChange={(e) =>
															update("layout", { contentWidth: Number(e.target.value) })
														}
													/>
													<output>{settings.layout.contentWidth}px</output>
												</div>
											</div>
											<div className="settings-row">
												<div className="settings-row-label">
													<strong>Motion speed</strong>
													<span>How fast transitions and animations run</span>
												</div>
												<div className="settings-row-control">
													<div className="settings-segmented">
														{(["slow", "normal", "fast"] as const).map((v) => (
															<button
																key={v}
																type="button"
																className={settings.layout.motionSpeed === v ? "active" : ""}
																onClick={() => update("layout", { motionSpeed: v })}
															>
																{v[0].toUpperCase() + v.slice(1)}
															</button>
														))}
													</div>
												</div>
											</div>
										</div>
									</>
								)}

								{tab === "typography" && (
									<>
										<p className="settings-section-desc">
											Swap the typeface and tighten or loosen letter spacing. Custom font names
											need to already be available on your system or loaded elsewhere on the
											page — OptiqRA doesn&apos;t fetch font files for you.
										</p>
										<div className="settings-group">
											<div className="settings-row">
												<div className="settings-row-label">
													<strong>Font family</strong>
													<span>Overrides every typeface in the app</span>
												</div>
												<div className="settings-row-control">
													<div className="settings-segmented">
														{(["default", "system", "serif", "mono", "custom"] as const).map(
															(v) => (
																<button
																	key={v}
																	type="button"
																	className={settings.typography.fontFamily === v ? "active" : ""}
																	onClick={() => update("typography", { fontFamily: v })}
																>
																	{v[0].toUpperCase() + v.slice(1)}
																</button>
															),
														)}
													</div>
												</div>
											</div>
											{settings.typography.fontFamily === "custom" && (
												<div className="settings-row">
													<div className="settings-row-label">
														<strong>Custom font name</strong>
														<span>e.g. &quot;Georgia&quot;, or a font-family you&apos;ve loaded</span>
													</div>
													<div className="settings-row-control" style={{ flex: 1 }}>
														<input
															type="text"
															className="settings-text-input"
															style={{ marginBottom: 0 }}
															placeholder="Georgia, serif"
															value={settings.typography.customFontFamily}
															onChange={(e) =>
																update("typography", { customFontFamily: e.target.value })
															}
														/>
													</div>
												</div>
											)}
											<div className="settings-row">
												<div className="settings-row-label">
													<strong>Letter spacing</strong>
													<span>Nudges tracking tighter or looser</span>
												</div>
												<div className="settings-slider">
													<input
														type="range"
														min={-1}
														max={2}
														step={0.1}
														value={settings.typography.letterSpacing}
														onChange={(e) =>
															update("typography", { letterSpacing: Number(e.target.value) })
														}
													/>
													<output>{settings.typography.letterSpacing.toFixed(1)}px</output>
												</div>
											</div>
										</div>
									</>
								)}

								{tab === "scanning" && (
									<>
										<p className="settings-section-desc">
											What a fresh visit to OptiQra starts with. You can still change scan mode or
											depth per-scan — this just sets the starting point.
										</p>
										<div className="settings-group">
											<div className="settings-row">
												<div className="settings-row-label">
													<strong>Default scan mode</strong>
													<span>Single page or whole-site crawl</span>
												</div>
												<div className="settings-row-control">
													<div className="settings-segmented">
														{(["single", "site"] as const).map((v) => (
															<button
																key={v}
																type="button"
																className={settings.scanning.defaultMode === v ? "active" : ""}
																onClick={() => update("scanning", { defaultMode: v })}
															>
																{v === "single" ? "Single page" : "Whole site"}
															</button>
														))}
													</div>
												</div>
											</div>
											<div className="settings-row">
												<div className="settings-row-label">
													<strong>Default scan depth</strong>
													<span>Used when scan mode is "Whole site"</span>
												</div>
												<div className="settings-row-control">
													<select
														value={settings.scanning.defaultDepth}
														onChange={(e) =>
															update("scanning", {
																defaultDepth: e.target.value as OptiqraSettings["scanning"]["defaultDepth"],
															})
														}
													>
														<option value="quick">Quick (15 pages)</option>
														<option value="standard">Standard (50 pages)</option>
														<option value="full">Full site (100 pages)</option>
														<option value="crawl">Full crawl (250 pages)</option>
														<option value="custom">Custom</option>
													</select>
												</div>
											</div>
											{settings.scanning.defaultDepth === "custom" && (
												<div className="settings-row">
													<div className="settings-row-label">
														<strong>Custom page count</strong>
														<span>Default number of pages for custom depth</span>
													</div>
													<div className="settings-row-control">
														<input
															type="number"
															min={1}
															value={settings.scanning.defaultCustomPages}
															onChange={(e) =>
																update("scanning", {
																	defaultCustomPages: Math.max(1, Number(e.target.value) || 1),
																})
															}
														/>
													</div>
												</div>
											)}
											<div className="settings-row">
												<div className="settings-row-label">
													<strong>Auto-expand crawled page list</strong>
													<span>Show every scanned URL by default on site reports</span>
												</div>
												<Switch
													on={settings.scanning.autoShowPageList}
													label="Auto-expand crawled page list"
													onToggle={() =>
														update("scanning", { autoShowPageList: !settings.scanning.autoShowPageList })
													}
												/>
											</div>
										</div>
									</>
								)}

								{tab === "crawler" && (
									<>
										<p className="settings-section-desc">
											Tune how the crawler behaves on whole-site scans. Higher concurrency finishes
											faster but is heavier on the target server — keep it modest for smaller sites.
										</p>
										<div className="settings-group">
											<div className="settings-slider-row">
												<div className="settings-slider-head">
													<strong>Concurrency</strong>
													<span className="settings-slider-value">
														{settings.crawler.concurrency} parallel requests
													</span>
												</div>
												<input
													type="range"
													min={1}
													max={12}
													value={settings.crawler.concurrency}
													onChange={(e) => update("crawler", { concurrency: Number(e.target.value) })}
												/>
											</div>
											<div className="settings-slider-row">
												<div className="settings-slider-head">
													<strong>Max link depth</strong>
													<span className="settings-slider-value">
														{settings.crawler.maxLinkDepth} hop{settings.crawler.maxLinkDepth === 1 ? "" : "s"}
													</span>
												</div>
												<input
													type="range"
													min={1}
													max={10}
													value={settings.crawler.maxLinkDepth}
													onChange={(e) => update("crawler", { maxLinkDepth: Number(e.target.value) })}
												/>
											</div>
											<div className="settings-row">
												<div className="settings-row-label">
													<strong>Render JavaScript</strong>
													<span>
														Execute each page&apos;s scripts in a sandboxed browser-like
														environment before auditing, so client-rendered (SPA) content is
														seen — slower per page, and only recommended for sites you trust.
													</span>
												</div>
												<Switch
													on={settings.crawler.renderJs}
													label="Render JavaScript"
													onToggle={() =>
														update("crawler", { renderJs: !settings.crawler.renderJs })
													}
												/>
											</div>
										</div>
										<p className="settings-footer-note">
											The crawler always checks sitemap.xml first, respects your page-count limit, and
											skips non-HTML files (images, PDFs, scripts) automatically.
										</p>
									</>
								)}

								{tab === "analyzer" && (
									<>
										<p className="settings-section-desc">
											Choose which categories show up as cards in your reports. Turning one off just
											hides it from view — handy if some checks aren't relevant to your site.
										</p>
										<div className="settings-cat-grid">
											{(Object.keys(CATEGORY_LABEL_KEYS) as (keyof typeof CATEGORY_LABEL_KEYS)[]).map((key) => {
												const on = settings.analyzer.visibleCategories[key];
												return (
													<label key={key} className={`settings-cat-chip ${on ? "on" : ""}`}>
														<input
															type="checkbox"
															checked={on}
															onChange={() =>
																update("analyzer", {
																	visibleCategories: {
																		...settings.analyzer.visibleCategories,
																		[key]: !on,
																	},
																})
															}
														/>
														{t(CATEGORY_LABEL_KEYS[key])}
													</label>
												);
											})}
										</div>
										<div className="settings-group" style={{ marginTop: 16 }}>
											<div className="settings-row">
												<div className="settings-row-label">
													<strong>Show passed checks</strong>
													<span>Include checks that already passed in exported reports, not just issues</span>
												</div>
												<Switch
													on={settings.analyzer.showPassedChecks}
													label="Show passed checks"
													onToggle={() =>
														update("analyzer", { showPassedChecks: !settings.analyzer.showPassedChecks })
													}
												/>
											</div>
										</div>
									</>
								)}

								{tab === "ai" && (
									<>
										<p className="settings-section-desc">
											Controls how the AI assistant behaves once it's connected. Set up your
											provider and API key from the AI section on a report page — that stays
											separate from these preferences.
										</p>
										<div className="settings-group">
											<div className="settings-row">
												<div className="settings-row-label">
													<strong>Connection status</strong>
													<span>
														{aiHydrated && isConfigured ?
															`Connected — ${provider} (${model})`
														:	"Not connected yet"}
													</span>
												</div>
											</div>
											<div className="settings-row">
												<div className="settings-row-label">
													<strong>Auto-generate insights</strong>
													<span>Runs AI insights automatically when a report finishes, if connected</span>
												</div>
												<Switch
													on={settings.ai.autoGenerateInsights}
													label="Auto-generate insights"
													onToggle={() =>
														update("ai", { autoGenerateInsights: !settings.ai.autoGenerateInsights })
													}
												/>
											</div>
											<div className="settings-row">
												<div className="settings-row-label">
													<strong>Insight style</strong>
													<span>How long and detailed the AI readout is</span>
												</div>
												<div className="settings-row-control">
													<div className="settings-segmented">
														{(["concise", "detailed"] as const).map((v) => (
															<button
																key={v}
																type="button"
																className={settings.ai.insightsTone === v ? "active" : ""}
																onClick={() => update("ai", { insightsTone: v })}
															>
																{v === "concise" ? "Concise" : "Detailed"}
															</button>
														))}
													</div>
												</div>
											</div>
										</div>
									</>
								)}

								{tab === "rules" && <CustomRulesPanel />}

								{tab === "advanced" && (
									<>
										<p className="settings-section-desc">
											The full escape hatch: inject your own CSS, or run your own JavaScript in
											this tab. Both only ever affect this browser — nothing here touches other
											visitors or the server.
										</p>

										<div className="settings-group">
											<div className="settings-row" style={{ flexDirection: "column", alignItems: "stretch" }}>
												<div className="settings-row-label">
													<strong>Custom CSS</strong>
													<span>Injected into the page and applied live as you type</span>
												</div>
												<textarea
													className="settings-code-textarea"
													spellCheck={false}
													rows={8}
													placeholder={".settings-panel { font-style: italic; }"}
													value={settings.advanced.customCSS}
													onChange={(e) => update("advanced", { customCSS: e.target.value })}
												/>
											</div>
										</div>

										<div className="settings-warning-box">
											<strong>Before you turn on custom JavaScript:</strong> it runs with full
											access to this page, in this browser tab — including anything OptiqRA
											keeps in this browser, like an AI provider API key you&apos;ve pasted in
											under AI Assistant. Only run code you wrote yourself or fully trust. A
											snippet copied from a stranger online can read or send that data
											anywhere. This can break the app until you clear it — that&apos;s expected
											for a raw code editor with no guardrails.
										</div>

										<div className="settings-group">
											<div className="settings-row">
												<div className="settings-row-label">
													<strong>Enable custom JavaScript</strong>
													<span>Required before any JS below can run</span>
												</div>
												<Switch
													on={settings.advanced.customJSEnabled}
													label="Enable custom JavaScript"
													onToggle={() => {
														if (
															!settings.advanced.customJSEnabled &&
															!settings.advanced.acknowledgedCodeRisk
														) {
															flashToast("Check the box below first");
															return;
														}
														update("advanced", {
															customJSEnabled: !settings.advanced.customJSEnabled,
														});
													}}
												/>
											</div>
											<div className="settings-row" style={{ flexDirection: "column", alignItems: "stretch" }}>
												<label className="settings-checkbox-row">
													<input
														type="checkbox"
														checked={settings.advanced.acknowledgedCodeRisk}
														onChange={(e) =>
															update("advanced", { acknowledgedCodeRisk: e.target.checked })
														}
													/>
													I understand this code runs with full access to this browser tab, that
													it could read or leak locally-stored data (including any AI API key
													I&apos;ve entered), and that I&apos;m only running code I wrote or fully
													trust.
												</label>
											</div>
											<div className="settings-row" style={{ flexDirection: "column", alignItems: "stretch" }}>
												<div className="settings-row-label">
													<strong>Custom JavaScript</strong>
													<span>
														Doesn&apos;t run as you type — click &quot;Run code&quot; to execute
														it deliberately
													</span>
												</div>
												<textarea
													className="settings-code-textarea"
													spellCheck={false}
													rows={8}
													placeholder={'console.log("hello from OptiQra");'}
													value={settings.advanced.customJS}
													onChange={(e) => {
														update("advanced", { customJS: e.target.value });
														setJsRunResult(null);
													}}
												/>
												<div className="settings-row-control" style={{ marginTop: 8 }}>
													<button
														type="button"
														className="settings-btn-primary"
														disabled={
															!settings.advanced.customJSEnabled ||
															!settings.advanced.acknowledgedCodeRisk ||
															!settings.advanced.customJS.trim()
														}
														onClick={handleRunCustomJS}
													>
														Run code
													</button>
												</div>
												{jsRunResult && (
													<p
														className="settings-section-desc"
														style={{
															margin: "8px 0 0",
															color: jsRunResult.ok ? "var(--good)" : "var(--critical)",
														}}
													>
														{jsRunResult.ok ? "✓ " : "Error: "}
														{jsRunResult.message}
													</p>
												)}
											</div>
										</div>
									</>
								)}

								{tab === "notifications" && (
									<>
										<p className="settings-section-desc">
											Get a browser notification when a scan finishes — especially useful for
											scheduled scans that run while you're away. Set up schedules from the
											"Scheduled scans" button on any report.
										</p>
										<div className="settings-group">
											<div className="settings-row">
												<div className="settings-row-label">
													<strong>Scan-complete notifications</strong>
													<span>
														Browser permission:{" "}
														{permission === "granted" ? "granted"
														: permission === "denied" ? "blocked — check your browser settings"
														: permission === "unsupported" ? "not supported in this browser"
														: "not requested yet"}
													</span>
												</div>
												<div className="settings-row-control">
													{permission !== "granted" && permission !== "unsupported" && (
														<button
															type="button"
															className="settings-btn-outline"
															onClick={handleEnableNotifications}
														>
															Enable
														</button>
													)}
													<Switch
														on={settings.notifications.enabled}
														label="Scan-complete notifications"
														onToggle={() =>
															update("notifications", { enabled: !settings.notifications.enabled })
														}
													/>
												</div>
											</div>
										</div>
									</>
								)}

								{tab === "reports" && (
									<>
										<p className="settings-section-desc">
											Defaults for the "Download report" button on a finished scan. Whichever
											format you pick here is listed first in the download menu.
										</p>
										<div className="settings-group">
											<div className="settings-row">
												<div className="settings-row-label">
													<strong>Default export format</strong>
													<span>Pinned to the top of the download menu</span>
												</div>
												<div className="settings-row-control">
													<div className="settings-segmented">
														{(["pdf", "docx", "json"] as const).map((v) => (
															<button
																key={v}
																type="button"
																className={settings.reports.defaultExportFormat === v ? "active" : ""}
																onClick={() => update("reports", { defaultExportFormat: v })}
															>
																{v.toUpperCase()}
															</button>
														))}
													</div>
												</div>
											</div>
											<div className="settings-row">
												<div className="settings-row-label">
													<strong>Include passed checks</strong>
													<span>Also controls whether exported reports list passed checks, not just issues</span>
												</div>
												<Switch
													on={settings.analyzer.showPassedChecks}
													label="Include passed checks in exports"
													onToggle={() =>
														update("analyzer", { showPassedChecks: !settings.analyzer.showPassedChecks })
													}
												/>
											</div>
										</div>
									</>
								)}

								{tab === "privacy" && (
									<>
										<p className="settings-section-desc">
											Everything OptiQra stores lives only in this browser — nothing is sent to a
											server for storage. Manage or wipe it here at any time.
										</p>
										<div className="settings-group">
											<div className="settings-row">
												<div className="settings-row-label">
													<strong>Save scan history</strong>
													<span>Keep past reports in this browser so you can revisit them</span>
												</div>
												<Switch
													on={settings.privacy.saveScanHistory}
													label="Save scan history"
													onToggle={() =>
														update("privacy", { saveScanHistory: !settings.privacy.saveScanHistory })
													}
												/>
											</div>
											<div className="settings-danger-row">
												<div className="settings-row-label">
													<strong>Scan history</strong>
													<span>
														{scanCount === null ? "Loading…" : `${scanCount} saved scan${scanCount === 1 ? "" : "s"}`}
													</span>
												</div>
												<button type="button" className="settings-btn-danger" onClick={handleClearHistory}>
													Clear history
												</button>
											</div>
											{storage && storage.quotaBytes > 0 && (
												<div className="settings-row" style={{ flexDirection: "column", alignItems: "stretch" }}>
													<div className="settings-row-label">
														<strong>Storage used</strong>
														<span>
															{(storage.usageBytes / 1024 / 1024).toFixed(1)} MB of{" "}
															{(storage.quotaBytes / 1024 / 1024 / 1024).toFixed(1)} GB available
														</span>
													</div>
													<div className="settings-storage-bar">
														<div
															className="settings-storage-fill"
															style={{
																width: `${Math.min(100, (storage.usageBytes / storage.quotaBytes) * 100)}%`,
															}}
														/>
													</div>
												</div>
											)}
										</div>

										<div className="settings-group">
											<div className="settings-danger-row">
												<div className="settings-row-label">
													<strong>Export settings</strong>
													<span>Save your preferences as a JSON file</span>
												</div>
												<button type="button" className="settings-btn-outline" onClick={handleExport}>
													Export
												</button>
											</div>
											<div className="settings-danger-row">
												<div className="settings-row-label">
													<strong>Import settings</strong>
													<span>Load preferences from a previously exported file</span>
												</div>
												<button
													type="button"
													className="settings-btn-outline"
													onClick={() => fileInputRef.current?.click()}
												>
													Import
												</button>
												<input
													ref={fileInputRef}
													type="file"
													accept="application/json"
													style={{ display: "none" }}
													onChange={(e) => {
														const file = e.target.files?.[0];
														if (file) handleImportFile(file);
														e.target.value = "";
													}}
												/>
											</div>
											<div className="settings-danger-row">
												<div className="settings-row-label">
													<strong>Reset everything</strong>
													<span>Restore all settings on this page back to defaults</span>
												</div>
												<button
													type="button"
													className="settings-btn-danger"
													onClick={() => {
														reset();
														flashToast("Settings reset to defaults");
													}}
												>
													Reset to defaults
												</button>
											</div>
										</div>
									</>
								)}
							</div>

							<div className="settings-footer">
								<span className="settings-footer-note">
									Stored locally in this browser (IndexedDB) — nothing leaves your device.
								</span>
								{toast && <span className="settings-toast">✓ {toast}</span>}
							</div>
						</div>
					</div>
				</div>
			)}
		</>
	);
}
