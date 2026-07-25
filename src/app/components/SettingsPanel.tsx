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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch as ShadSwitch } from "@/components/ui/switch";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogBody,
} from "@/components/ui/dialog";
import {
	Select,
	SelectTrigger,
	SelectValue,
	SelectContent,
	SelectItem,
} from "@/components/ui/select";
import { Settings as SettingsIcon } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

// Simple debounce for slider inputs so we don't update 60x/second
function useDebounced<T>(value: T, ms: number): T {
	const [debouncedValue, setDebouncedValue] = useState(value);
	useEffect(() => {
		const timer = setTimeout(() => setDebouncedValue(value), ms);
		return () => clearTimeout(timer);
	}, [value, ms]);
	return debouncedValue;
}

// Single-value numeric slider, wired to shadcn's (multi-thumb-capable) Slider.
function SliderControl({
	min,
	max,
	step = 1,
	value,
	onChange,
}: {
	min: number;
	max: number;
	step?: number;
	value: number;
	onChange: (v: number) => void;
}) {
	return (
		<Slider
			min={min}
			max={max}
			step={step}
			value={[value]}
			onValueChange={([v]) => onChange(v)}
			className="flex-1"
		/>
	);
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

// Thin wrapper so every existing call site (`<Switch on={...} onToggle={...}
// label="..." />`) keeps working unchanged, backed by the real shadcn Switch.
function Switch({ on, onToggle, label }: { on: boolean; onToggle: () => void; label: string }) {
	return <ShadSwitch checked={on} onCheckedChange={onToggle} aria-label={label} />;
}

// A labeled settings row: label + hint on the left, control on the right
// (or full-width below, when `stack` is set). Used ~30 times below — kept as
// one small component instead of repeating the same handful of utility
// classes at every call site.
function SettingsRow({
	label,
	hint,
	children,
	stack,
	danger,
}: {
	label: React.ReactNode;
	hint?: React.ReactNode;
	children?: React.ReactNode;
	stack?: boolean;
	danger?: boolean;
}) {
	return (
		<div
			className={cn(
				"flex items-center justify-between gap-4 border-b border-line py-3.5 last:border-b-0",
				stack && "flex-col items-stretch",
			)}
		>
			<div className="flex flex-col gap-0.5 pr-4">
				<strong className={cn("text-sm font-semibold", danger ? "text-critical" : "text-ink")}>
					{label}
				</strong>
				{hint && <span className="max-w-[42ch] text-xs text-ink-soft">{hint}</span>}
			</div>
			{children && <div className="flex shrink-0 items-center gap-2">{children}</div>}
		</div>
	);
}

// The pill/segmented button-group control, used ~8 times for small enum
// settings (theme, density, font family, motion speed, ...).
function Segmented<T extends string>({
	value,
	options,
	onChange,
}: {
	value: T;
	options: { value: T; label: string }[];
	onChange: (v: T) => void;
}) {
	return (
		<div className="flex gap-1 rounded-md border border-line bg-secondary p-1">
			{options.map((opt) => (
				<button
					key={opt.value}
					type="button"
					className={cn(
						"rounded px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors",
						value === opt.value ?
							"bg-card text-ink shadow-xs"
						:	"text-ink-soft hover:text-ink",
					)}
					onClick={() => onChange(opt.value)}
				>
					{opt.label}
				</button>
			))}
		</div>
	);
}

export default function SettingsPanel() {
	const [open, setOpen] = useState(false);
	const [tab, setTab] = useState<TabId>("appearance");
	const { settings, hydrated, update, replaceAll, reset } = useSettings();
	const { t } = useTranslation();
	const { provider, model, isConfigured, hydrated: aiHydrated } = useAIProvider();
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
			<Button
				type="button"
				variant="outline"
				size="sm"
				onClick={() => setOpen(true)}
				aria-haspopup="dialog"
				aria-expanded={open}
				className="gap-1.5"
			>
				<SettingsIcon className="size-3.5" />
				{t("header.settings")}
			</Button>

			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent
					className="h-[min(720px,88vh)] w-[min(980px,95vw)] max-w-none flex-row p-0"
					aria-label={t("settings.title")}
					showCloseButton={false}
				>
					<nav className="flex w-52 shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-line bg-surface-2 p-3">
						<div className="mb-2 px-2 py-1.5 text-sm font-semibold text-ink">
							⚙️ {t("settings.title")}
						</div>
						{TABS.map((tabInfo) => (
							<button
								key={tabInfo.id}
								type="button"
								className={cn(
									"flex items-center gap-2 rounded-md px-2.5 py-2 text-left text-[13px] font-medium transition-colors",
									tab === tabInfo.id ?
										"bg-card text-ink shadow-xs"
									:	"text-ink-soft hover:bg-card/60 hover:text-ink",
								)}
								onClick={() => setTab(tabInfo.id)}
							>
								<span aria-hidden>{tabInfo.icon}</span>
								{t(tabInfo.labelKey)}
							</button>
						))}
					</nav>

					<div className="flex min-w-0 flex-1 flex-col">
						<DialogHeader>
							<div>
								<DialogTitle>
									{t(TABS.find((tabInfo) => tabInfo.id === tab)?.labelKey ?? "settings.tabs.appearance")}
								</DialogTitle>
								<p className="mt-0.5 text-xs text-ink-soft">
									{t("settings.changesSaveAutomatically")}
								</p>
							</div>
							<button
								type="button"
								className="flex size-7 shrink-0 items-center justify-center rounded-full text-lg text-ink-soft hover:bg-secondary hover:text-ink"
								onClick={() => setOpen(false)}
								aria-label={t("settings.closeSettings")}
							>
								×
							</button>
						</DialogHeader>

						<DialogBody className="flex-1 overflow-y-auto">

								{tab === "appearance" && (
									<>
										<p className="mb-4 text-sm text-ink-soft">
											{t("settings.appearance.sectionDesc")}
										</p>
										<div className="rounded-(--radius) border border-line bg-card px-4">
											<SettingsRow
												label={t("settings.appearance.language")}
												hint={t("settings.appearance.languageHint")}
											>
												<Select
													value={settings.general.language}
													onValueChange={(v) =>
														update("general", {
															language: v as OptiqraSettings["general"]["language"],
														})
													}
												>
													<SelectTrigger aria-label={t("settings.appearance.language")} className="w-40">
														<SelectValue />
													</SelectTrigger>
													<SelectContent>
														{LANGUAGES.map((lang) => (
															<SelectItem key={lang.code} value={lang.code}>
																{lang.nativeName}
															</SelectItem>
														))}
													</SelectContent>
												</Select>
											</SettingsRow>
											<SettingsRow
												label={t("settings.appearance.theme")}
												hint={t("settings.appearance.themeHint")}
											>
												<Segmented
													value={a.theme}
													onChange={(v) => update("appearance", { theme: v })}
													options={(["system", "light", "dark"] as const).map((v) => ({
														value: v,
														label:
															v === "system" ?
																t("settings.appearance.auto")
															:	t(`settings.appearance.${v}` as TranslationKey),
													}))}
												/>
											</SettingsRow>
											<SettingsRow
												label={t("settings.appearance.accentColor")}
												hint={t("settings.appearance.accentColorHint")}
											>
												<div className="flex flex-wrap gap-2">
													{ACCENT_PRESETS.map((p) => (
														<button
															key={p.id}
															type="button"
															className={cn(
																"relative size-6 rounded-full",
																a.accentColor === p.value && "settings-swatch active",
															)}
															style={{ background: p.value }}
															title={p.label}
															aria-label={p.label}
															onClick={() => update("appearance", { accentColor: p.value })}
														/>
													))}
												</div>
											</SettingsRow>
											<SettingsRow
												label={t("settings.appearance.density")}
												hint={t("settings.appearance.densityHint")}
											>
												<Segmented
													value={a.density}
													onChange={(v) => update("appearance", { density: v })}
													options={(["comfortable", "compact"] as const).map((v) => ({
														value: v,
														label:
															v === "comfortable" ?
																t("settings.appearance.comfortable")
															:	t("settings.appearance.compact"),
													}))}
												/>
											</SettingsRow>
											<SettingsRow
												label={t("settings.appearance.textSize")}
												hint={t("settings.appearance.textSizeHint")}
											>
												<Segmented
													value={a.fontScale}
													onChange={(v) => update("appearance", { fontScale: v })}
													options={(["small", "default", "large"] as const).map((v) => ({
														value: v,
														label: t(`settings.appearance.${v}` as TranslationKey),
													}))}
												/>
											</SettingsRow>
											<SettingsRow
												label={t("settings.appearance.reduceMotion")}
												hint={t("settings.appearance.reduceMotionHint")}
											>
												<Switch
													on={a.reduceMotion}
													label={t("settings.appearance.reduceMotion")}
													onToggle={() => update("appearance", { reduceMotion: !a.reduceMotion })}
												/>
											</SettingsRow>
										</div>
									</>
								)}

								{tab === "layout" && (
									<>
										<p className="mb-4 text-sm text-ink-soft">
											Reshape the page itself — corner roundness, content width, and how fast
											things move. Applies instantly, everywhere, no reload.
										</p>
										<div className="rounded-(--radius) border border-line bg-card px-4">
											<SettingsRow
												label="Corner roundness"
												hint="Buttons, cards, inputs — 0 is sharp, 28 is very round"
												stack
											>
												<div className="flex items-center gap-3">
													<SliderControl
														min={0}
														max={28}
														value={settings.layout.cornerRadius}
														onChange={(v) => update("layout", { cornerRadius: v })}
													/>
													<span className="w-14 shrink-0 text-right font-(family-name:--font-mono) text-xs text-ink-soft">
														{settings.layout.cornerRadius}px
													</span>
												</div>
											</SettingsRow>
											<SettingsRow label="Content width" hint="How wide the main column gets on large screens" stack>
												<div className="flex items-center gap-3">
													<SliderControl
														min={720}
														max={1600}
														step={20}
														value={settings.layout.contentWidth}
														onChange={(v) => update("layout", { contentWidth: v })}
													/>
													<span className="w-14 shrink-0 text-right font-(family-name:--font-mono) text-xs text-ink-soft">
														{settings.layout.contentWidth}px
													</span>
												</div>
											</SettingsRow>
											<SettingsRow label="Motion speed" hint="How fast transitions and animations run">
												<Segmented
													value={settings.layout.motionSpeed}
													onChange={(v) => update("layout", { motionSpeed: v })}
													options={(["slow", "normal", "fast"] as const).map((v) => ({
														value: v,
														label: v[0].toUpperCase() + v.slice(1),
													}))}
												/>
											</SettingsRow>
										</div>
									</>
								)}

								{tab === "typography" && (
									<>
										<p className="mb-4 text-sm text-ink-soft">
											Swap the typeface and tighten or loosen letter spacing. Custom font names
											need to already be available on your system or loaded elsewhere on the
											page — OptiqRA doesn&apos;t fetch font files for you.
										</p>
										<div className="rounded-(--radius) border border-line bg-card px-4">
											<SettingsRow label="Font family" hint="Overrides every typeface in the app">
												<Segmented
													value={settings.typography.fontFamily}
													onChange={(v) => update("typography", { fontFamily: v })}
													options={(["default", "system", "serif", "mono", "custom"] as const).map(
														(v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) }),
													)}
												/>
											</SettingsRow>
											{settings.typography.fontFamily === "custom" && (
												<SettingsRow
													label="Custom font name"
													hint={'e.g. "Georgia", or a font-family you\'ve loaded'}
													stack
												>
													<Input
														type="text"
														placeholder="Georgia, serif"
														value={settings.typography.customFontFamily}
														onChange={(e) =>
															update("typography", { customFontFamily: e.target.value })
														}
													/>
												</SettingsRow>
											)}
											<SettingsRow label="Letter spacing" hint="Nudges tracking tighter or looser" stack>
												<div className="flex items-center gap-3">
													<SliderControl
														min={-1}
														max={2}
														step={0.1}
														value={settings.typography.letterSpacing}
														onChange={(v) => update("typography", { letterSpacing: v })}
													/>
													<span className="w-14 shrink-0 text-right font-(family-name:--font-mono) text-xs text-ink-soft">
														{settings.typography.letterSpacing.toFixed(1)}px
													</span>
												</div>
											</SettingsRow>
										</div>
									</>
								)}

								{tab === "scanning" && (
									<>
										<p className="mb-4 text-sm text-ink-soft">
											What a fresh visit to OptiQra starts with. You can still change scan mode or
											depth per-scan — this just sets the starting point.
										</p>
										<div className="rounded-(--radius) border border-line bg-card px-4">
											<SettingsRow label="Default scan mode" hint="Single page or whole-site crawl">
												<Segmented
													value={settings.scanning.defaultMode}
													onChange={(v) => update("scanning", { defaultMode: v })}
													options={(["single", "site"] as const).map((v) => ({
														value: v,
														label: v === "single" ? "Single page" : "Whole site",
													}))}
												/>
											</SettingsRow>
											<SettingsRow label="Default scan depth" hint='Used when scan mode is "Whole site"'>
												<Select
													value={settings.scanning.defaultDepth}
													onValueChange={(v) =>
														update("scanning", {
															defaultDepth: v as OptiqraSettings["scanning"]["defaultDepth"],
														})
													}
												>
													<SelectTrigger className="w-44">
														<SelectValue />
													</SelectTrigger>
													<SelectContent>
														<SelectItem value="quick">Quick (15 pages)</SelectItem>
														<SelectItem value="standard">Standard (50 pages)</SelectItem>
														<SelectItem value="full">Full site (100 pages)</SelectItem>
														<SelectItem value="crawl">Full crawl (250 pages)</SelectItem>
														<SelectItem value="custom">Custom</SelectItem>
													</SelectContent>
												</Select>
											</SettingsRow>
											{settings.scanning.defaultDepth === "custom" && (
												<SettingsRow label="Custom page count" hint="Default number of pages for custom depth">
													<Input
														type="number"
														min={1}
														value={settings.scanning.defaultCustomPages}
														onChange={(e) =>
															update("scanning", {
																defaultCustomPages: Math.max(1, Number(e.target.value) || 1),
															})
														}
														className="w-24"
													/>
												</SettingsRow>
											)}
											<SettingsRow
												label="Auto-expand crawled page list"
												hint="Show every scanned URL by default on site reports"
											>
												<Switch
													on={settings.scanning.autoShowPageList}
													label="Auto-expand crawled page list"
													onToggle={() =>
														update("scanning", { autoShowPageList: !settings.scanning.autoShowPageList })
													}
												/>
											</SettingsRow>
										</div>
									</>
								)}

								{tab === "crawler" && (
									<>
										<p className="mb-4 text-sm text-ink-soft">
											Tune how the crawler behaves on whole-site scans. Higher concurrency finishes
											faster but is heavier on the target server — keep it modest for smaller sites.
										</p>
										<div className="rounded-(--radius) border border-line bg-card px-4">
											<div className="flex flex-col gap-2 border-b border-line py-3.5">
												<div className="flex items-center justify-between gap-4">
													<strong className="text-sm font-semibold text-ink">Concurrency</strong>
													<span className="text-xs text-ink-soft">
														{settings.crawler.concurrency} parallel requests
													</span>
												</div>
												<SliderControl
													min={1}
													max={12}
													value={settings.crawler.concurrency}
													onChange={(v) => update("crawler", { concurrency: v })}
												/>
											</div>
											<div className="flex flex-col gap-2 border-b border-line py-3.5">
												<div className="flex items-center justify-between gap-4">
													<strong className="text-sm font-semibold text-ink">Max link depth</strong>
													<span className="text-xs text-ink-soft">
														{settings.crawler.maxLinkDepth} hop{settings.crawler.maxLinkDepth === 1 ? "" : "s"}
													</span>
												</div>
												<SliderControl
													min={1}
													max={10}
													value={settings.crawler.maxLinkDepth}
													onChange={(v) => update("crawler", { maxLinkDepth: v })}
												/>
											</div>
											<SettingsRow
												label="Render JavaScript"
												hint="Execute each page's scripts in a sandboxed browser-like environment before auditing, so client-rendered (SPA) content is seen — slower per page, and only recommended for sites you trust."
											>
												<Switch
													on={settings.crawler.renderJs}
													label="Render JavaScript"
													onToggle={() => update("crawler", { renderJs: !settings.crawler.renderJs })}
												/>
											</SettingsRow>
										</div>
										<p className="mt-3 text-xs text-ink-soft">
											The crawler always checks sitemap.xml first, respects your page-count limit, and
											skips non-HTML files (images, PDFs, scripts) automatically.
										</p>
									</>
								)}

								{tab === "analyzer" && (
									<>
										<p className="mb-4 text-sm text-ink-soft">
											Choose which categories show up as cards in your reports. Turning one off just
											hides it from view — handy if some checks aren't relevant to your site.
										</p>
										<div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2">
											{(Object.keys(CATEGORY_LABEL_KEYS) as (keyof typeof CATEGORY_LABEL_KEYS)[]).map((key) => {
												const on = settings.analyzer.visibleCategories[key];
												return (
													<label
														key={key}
														className={cn(
															"flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors",
															on ?
																"border-brand bg-brand-soft text-ink"
															:	"border-line bg-card text-ink-soft",
														)}
													>
														<input
															type="checkbox"
															checked={on}
															className="accent-brand"
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
										<div className="mt-4 rounded-(--radius) border border-line bg-card px-4">
											<SettingsRow
												label="Show passed checks"
												hint="Include checks that already passed in exported reports, not just issues"
											>
												<Switch
													on={settings.analyzer.showPassedChecks}
													label="Show passed checks"
													onToggle={() =>
														update("analyzer", { showPassedChecks: !settings.analyzer.showPassedChecks })
													}
												/>
											</SettingsRow>
										</div>
									</>
								)}

								{tab === "ai" && (
									<>
										<p className="mb-4 text-sm text-ink-soft">
											Controls how the AI assistant behaves once it's connected. Set up your
											provider and API key from the AI section on a report page — that stays
											separate from these preferences.
										</p>
										<div className="rounded-(--radius) border border-line bg-card px-4">
											<SettingsRow label="Connection status">
												<span className="text-xs text-ink-soft">
													{aiHydrated && isConfigured ?
														`Connected — ${provider} (${model})`
													:	"Not connected yet"}
												</span>
											</SettingsRow>
											<SettingsRow
												label="Auto-generate insights"
												hint="Runs AI insights automatically when a report finishes, if connected"
											>
												<Switch
													on={settings.ai.autoGenerateInsights}
													label="Auto-generate insights"
													onToggle={() =>
														update("ai", { autoGenerateInsights: !settings.ai.autoGenerateInsights })
													}
												/>
											</SettingsRow>
											<SettingsRow label="Insight style" hint="How long and detailed the AI readout is">
												<Segmented
													value={settings.ai.insightsTone}
													onChange={(v) => update("ai", { insightsTone: v })}
													options={(["concise", "detailed"] as const).map((v) => ({
														value: v,
														label: v === "concise" ? "Concise" : "Detailed",
													}))}
												/>
											</SettingsRow>
										</div>
									</>
								)}

								{tab === "rules" && <CustomRulesPanel />}

								{tab === "advanced" && (
									<>
										<p className="mb-4 text-sm text-ink-soft">
											The full escape hatch: inject your own CSS, or run your own JavaScript in
											this tab. Both only ever affect this browser — nothing here touches other
											visitors or the server.
										</p>

										<div className="mb-4 rounded-(--radius) border border-line bg-card px-4">
											<SettingsRow label="Custom CSS" hint="Injected into the page and applied live as you type" stack>
												<Textarea
													spellCheck={false}
													rows={8}
													placeholder=".settings-panel { font-style: italic; }"
													value={settings.advanced.customCSS}
													onChange={(e) => update("advanced", { customCSS: e.target.value })}
													className="font-(family-name:--font-mono) text-xs"
												/>
											</SettingsRow>
										</div>

										<div className="mb-4 rounded-(--radius) border border-warn/30 bg-warn-bg p-4 text-sm text-ink">
											<strong>Before you turn on custom JavaScript:</strong> it runs with full
											access to this page, in this browser tab — including anything OptiqRA
											keeps in this browser, like an AI provider API key you&apos;ve pasted in
											under AI Assistant. Only run code you wrote yourself or fully trust. A
											snippet copied from a stranger online can read or send that data
											anywhere. This can break the app until you clear it — that&apos;s expected
											for a raw code editor with no guardrails.
										</div>

										<div className="rounded-(--radius) border border-line bg-card px-4">
											<SettingsRow label="Enable custom JavaScript" hint="Required before any JS below can run">
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
											</SettingsRow>
											<div className="border-b border-line py-3.5">
												<label className="flex cursor-pointer items-start gap-2.5 text-xs leading-relaxed text-ink-soft">
													<input
														type="checkbox"
														className="mt-0.5 accent-brand"
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
											<div className="flex flex-col items-stretch gap-2 py-3.5">
												<div className="flex flex-col gap-0.5">
													<strong className="text-sm font-semibold text-ink">Custom JavaScript</strong>
													<span className="text-xs text-ink-soft">
														Doesn&apos;t run as you type — click &quot;Run code&quot; to execute
														it deliberately
													</span>
												</div>
												<Textarea
													spellCheck={false}
													rows={8}
													placeholder='console.log("hello from OptiQra");'
													value={settings.advanced.customJS}
													onChange={(e) => {
														update("advanced", { customJS: e.target.value });
														setJsRunResult(null);
													}}
													className="font-(family-name:--font-mono) text-xs"
												/>
												<div>
													<Button
														type="button"
														variant="brand"
														size="sm"
														disabled={
															!settings.advanced.customJSEnabled ||
															!settings.advanced.acknowledgedCodeRisk ||
															!settings.advanced.customJS.trim()
														}
														onClick={handleRunCustomJS}
													>
														Run code
													</Button>
												</div>
												{jsRunResult && (
													<p
														className={cn(
															"mt-1 text-sm",
															jsRunResult.ok ? "text-good" : "text-critical",
														)}
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
										<p className="mb-4 text-sm text-ink-soft">
											Get a browser notification when a scan finishes — especially useful for
											scheduled scans that run while you're away. Set up schedules from the
											"Scheduled scans" button on any report.
										</p>
										<div className="rounded-(--radius) border border-line bg-card px-4">
											<SettingsRow
												label="Scan-complete notifications"
												hint={
													<>
														Browser permission:{" "}
														{permission === "granted" ? "granted"
														: permission === "denied" ? "blocked — check your browser settings"
														: permission === "unsupported" ? "not supported in this browser"
														: "not requested yet"}
													</>
												}
											>
												{permission !== "granted" && permission !== "unsupported" && (
													<Button type="button" variant="outline" size="sm" onClick={handleEnableNotifications}>
														Enable
													</Button>
												)}
												<Switch
													on={settings.notifications.enabled}
													label="Scan-complete notifications"
													onToggle={() =>
														update("notifications", { enabled: !settings.notifications.enabled })
													}
												/>
											</SettingsRow>
										</div>
									</>
								)}

								{tab === "reports" && (
									<>
										<p className="mb-4 text-sm text-ink-soft">
											Defaults for the "Download report" button on a finished scan. Whichever
											format you pick here is listed first in the download menu.
										</p>
										<div className="rounded-(--radius) border border-line bg-card px-4">
											<SettingsRow label="Default export format" hint="Pinned to the top of the download menu">
												<Segmented
													value={settings.reports.defaultExportFormat}
													onChange={(v) => update("reports", { defaultExportFormat: v })}
													options={(["pdf", "docx", "json"] as const).map((v) => ({
														value: v,
														label: v.toUpperCase(),
													}))}
												/>
											</SettingsRow>
											<SettingsRow
												label="Include passed checks"
												hint="Also controls whether exported reports list passed checks, not just issues"
											>
												<Switch
													on={settings.analyzer.showPassedChecks}
													label="Include passed checks in exports"
													onToggle={() =>
														update("analyzer", { showPassedChecks: !settings.analyzer.showPassedChecks })
													}
												/>
											</SettingsRow>
										</div>
									</>
								)}

								{tab === "privacy" && (
									<>
										<p className="mb-4 text-sm text-ink-soft">
											Everything OptiQra stores lives only in this browser — nothing is sent to a
											server for storage. Manage or wipe it here at any time.
										</p>
										<div className="mb-4 rounded-(--radius) border border-line bg-card px-4">
											<SettingsRow
												label="Save scan history"
												hint="Keep past reports in this browser so you can revisit them"
											>
												<Switch
													on={settings.privacy.saveScanHistory}
													label="Save scan history"
													onToggle={() =>
														update("privacy", { saveScanHistory: !settings.privacy.saveScanHistory })
													}
												/>
											</SettingsRow>
											<SettingsRow
												label="Scan history"
												hint={
													scanCount === null ? "Loading…" : `${scanCount} saved scan${scanCount === 1 ? "" : "s"}`
												}
												danger
											>
												<Button type="button" variant="destructive" size="sm" onClick={handleClearHistory}>
													Clear history
												</Button>
											</SettingsRow>
											{storage && storage.quotaBytes > 0 && (
												<SettingsRow
													label="Storage used"
													hint={
														<>
															{(storage.usageBytes / 1024 / 1024).toFixed(1)} MB of{" "}
															{(storage.quotaBytes / 1024 / 1024 / 1024).toFixed(1)} GB available
														</>
													}
													stack
												>
													<div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
														<div
															className="h-full rounded-full bg-brand"
															style={{
																width: `${Math.min(100, (storage.usageBytes / storage.quotaBytes) * 100)}%`,
															}}
														/>
													</div>
												</SettingsRow>
											)}
										</div>

										<div className="rounded-(--radius) border border-line bg-card px-4">
											<SettingsRow label="Export settings" hint="Save your preferences as a JSON file" danger>
												<Button type="button" variant="outline" size="sm" onClick={handleExport}>
													Export
												</Button>
											</SettingsRow>
											<SettingsRow
												label="Import settings"
												hint="Load preferences from a previously exported file"
												danger
											>
												<Button
													type="button"
													variant="outline"
													size="sm"
													onClick={() => fileInputRef.current?.click()}
												>
													Import
												</Button>
												<input
													ref={fileInputRef}
													type="file"
													accept="application/json"
													className="hidden"
													onChange={(e) => {
														const file = e.target.files?.[0];
														if (file) handleImportFile(file);
														e.target.value = "";
													}}
												/>
											</SettingsRow>
											<SettingsRow
												label="Reset everything"
												hint="Restore all settings on this page back to defaults"
												danger
											>
												<Button
													type="button"
													variant="destructive"
													size="sm"
													onClick={() => {
														reset();
														flashToast("Settings reset to defaults");
													}}
												>
													Reset to defaults
												</Button>
											</SettingsRow>
										</div>
									</>
								)}
							</DialogBody>

							<div className="flex items-center justify-between gap-3 border-t border-line px-6 py-3">
								<span className="text-xs text-ink-soft">
									Stored locally in this browser (IndexedDB) — nothing leaves your device.
								</span>
								{toast && (
									<span className="text-xs font-medium text-good">✓ {toast}</span>
								)}
							</div>
						</div>
					</DialogContent>
				</Dialog>
			</>
	);
}
