/**
 * English is the canonical translation — every other file in this
 * directory is typed against `Translations` (inferred from this object),
 * so TypeScript will fail the build if a language is missing a key.
 *
 * Scope: this covers OptiQra's chrome — header, hero/intake screen, and the
 * Settings panel (tabs, labels, toggles, toasts). Deep, dynamically
 * generated audit/report content (SEO findings, AI insights, etc.) is
 * produced by the analyzer libraries in src/lib and is intentionally left
 * in English for now — translating that is a separate, larger effort.
 */
const en = {
	common: {
		close: "Close",
		cancel: "Cancel",
		save: "Save",
		reset: "Reset",
		export: "Export",
		import: "Import",
	},
	footer: {
		madeBy: "Made by",
	},
	header: {
		settings: "Settings",
	},
	hero: {
		eyebrow: "Diagnostic scan",
		title: "Find out what's actually wrong with your website.",
		subtitle:
			"Paste a URL. We check your SEO, speed, accessibility, and conversion paths — then show you exactly what to fix.",
		singlePage: "Single page",
		wholeSite: "Whole site",
		pagesToScan: "Pages to scan",
		yourChoice: "your choice",
		pagesSuffix: "pages",
		urlPlaceholder: "https://yoursite.com",
		runDiagnostic: "Run diagnostic →",
		crawlSite: "Crawl site →",
	},
	settings: {
		title: "Settings",
		changesSaveAutomatically: "Changes save automatically, right on this device.",
		closeSettings: "Close settings",
		tabs: {
			appearance: "Appearance",
			layout: "Layout",
			typography: "Typography",
			scanning: "Scanning",
			crawler: "Crawler",
			analyzer: "Analyzer",
			ai: "AI Assistant",
			rules: "Custom rules",
			advanced: "Advanced / Code",
			notifications: "Notifications",
			reports: "Reports",
			privacy: "Privacy & data",
		},
		appearance: {
			sectionDesc: "Make OptiQra look and feel like yours. These apply instantly, everywhere.",
			language: "Language",
			languageHint: "Sets the language used throughout the app",
			theme: "Theme",
			themeHint: "Light, dark, or match your system",
			auto: "Auto",
			light: "Light",
			dark: "Dark",
			accentColor: "Accent color",
			accentColorHint: "Colors links, buttons, and highlights",
			density: "Density",
			densityHint: "How much breathing room cards & lists get",
			comfortable: "Comfortable",
			compact: "Compact",
			textSize: "Text size",
			textSizeHint: "Scales all body text",
			default: "Default",
			small: "Small",
			large: "Large",
			reduceMotion: "Reduce motion",
			reduceMotionHint: "Turns off animations & transitions",
		},
		categories: {
			seo: "SEO",
			aeo: "AEO",
			geo: "GEO",
			speed: "Performance",
			a11y: "Accessibility",
			conversions: "Conversions",
			security: "Security headers",
			links: "Broken links",
			duplicateContent: "Duplicate content",
		},
		toasts: {
			applied: "✓ Applied",
			scanHistoryCleared: "Scan history cleared",
			settingsExported: "Settings exported",
			settingsImported: "Settings imported",
			couldntReadFile: "Couldn't read that file",
		},
	},
};

export default en;
export type Translations = typeof en;
