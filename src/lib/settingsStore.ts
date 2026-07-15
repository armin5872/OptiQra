import { openDB, type DBSchema, type IDBPDatabase } from "idb";

/**
 * All user-facing customization for OptiQra lives here: appearance, scan
 * defaults, crawler behavior, which audit categories show up in reports, AI
 * assistant behavior, notifications, report export defaults, and privacy /
 * data controls.
 *
 * Storage strategy mirrors scanStore.ts / scanCookies.ts:
 *  - IndexedDB is the source of truth (full object, survives reloads, works
 *    offline, available to the service worker too).
 *  - A small cookie mirror holds just the fields needed to paint the right
 *    theme before the page's JS has even run (readable synchronously, no
 *    flash of the wrong theme). It's a subset, not a replacement — IndexedDB
 *    always wins once it's finished opening.
 */

export type ThemeMode = "system" | "light" | "dark";
export type Density = "comfortable" | "compact";
export type FontScale = "small" | "default" | "large";
export type ScanDepthId = "quick" | "standard" | "full" | "crawl" | "custom";
export type ExportFormat = "pdf" | "docx" | "json";
export type InsightsTone = "concise" | "detailed";

export interface OptiqraSettings {
	appearance: {
		theme: ThemeMode;
		accentColor: string; // hex
		density: Density;
		reduceMotion: boolean;
		fontScale: FontScale;
	};
	scanning: {
		defaultMode: "single" | "site";
		defaultDepth: ScanDepthId;
		defaultCustomPages: number;
		autoShowPageList: boolean;
	};
	crawler: {
		concurrency: number; // 1-12, parallel page fetches
		maxLinkDepth: number; // 1-10, how many link-hops deep to follow
	};
	analyzer: {
		visibleCategories: {
			seo: boolean;
			aeo: boolean;
			geo: boolean;
			speed: boolean;
			a11y: boolean;
			conversions: boolean;
			security: boolean;
			links: boolean;
			duplicateContent: boolean;
		};
		showPassedChecks: boolean;
	};
	ai: {
		autoGenerateInsights: boolean;
		insightsTone: InsightsTone;
	};
	notifications: {
		enabled: boolean;
	};
	reports: {
		defaultExportFormat: ExportFormat;
	};
	privacy: {
		saveScanHistory: boolean;
		historyRetentionDays: number; // 0 = keep forever
	};
}

export const DEFAULT_SETTINGS: OptiqraSettings = {
	appearance: {
		theme: "system",
		accentColor: "#6505ff",
		density: "comfortable",
		reduceMotion: false,
		fontScale: "default",
	},
	scanning: {
		defaultMode: "single",
		defaultDepth: "quick",
		defaultCustomPages: 100,
		autoShowPageList: false,
	},
	crawler: {
		concurrency: 6,
		maxLinkDepth: 3,
	},
	analyzer: {
		visibleCategories: {
			seo: true,
			aeo: true,
			geo: true,
			speed: true,
			a11y: true,
			conversions: true,
			security: true,
			links: true,
			duplicateContent: true,
		},
		showPassedChecks: true,
	},
	ai: {
		autoGenerateInsights: false,
		insightsTone: "detailed",
	},
	notifications: {
		enabled: true,
	},
	reports: {
		defaultExportFormat: "pdf",
	},
	privacy: {
		saveScanHistory: true,
		historyRetentionDays: 0,
	},
};

/** Preset accent swatches shown in the Appearance tab — kept small and
 *  curated rather than a raw color picker, so every option still looks
 *  intentional against the app's neutral surfaces. */
export const ACCENT_PRESETS = [
	{ id: "violet", label: "Violet", value: "#6505ff" },
	{ id: "teal", label: "Teal", value: "#0c8f7f" },
	{ id: "blue", label: "Blue", value: "#1a5fd6" },
	{ id: "rose", label: "Rose", value: "#c23b6b" },
	{ id: "amber", label: "Amber", value: "#b9791c" },
	{ id: "forest", label: "Forest", value: "#1e8f5e" },
] as const;

const DB_NAME = "optiqra-settings";
const DB_VERSION = 1;
const STORE_NAME = "settings";
const SETTINGS_KEY = "user-settings";
const MIRROR_COOKIE = "optiqra_settings_mirror";

interface SettingsDB extends DBSchema {
	settings: {
		key: string;
		value: OptiqraSettings;
	};
}

let dbPromise: Promise<IDBPDatabase<SettingsDB>> | null = null;

function getDB() {
	if (typeof indexedDB === "undefined") {
		return Promise.reject(new Error("IndexedDB is only available in the browser"));
	}
	if (!dbPromise) {
		dbPromise = openDB<SettingsDB>(DB_NAME, DB_VERSION, {
			upgrade(db) {
				if (!db.objectStoreNames.contains(STORE_NAME)) {
					db.createObjectStore(STORE_NAME);
				}
			},
		});
	}
	return dbPromise;
}

/** Deep-merges a possibly-partial/older-shaped stored object onto the current
 *  defaults, so adding a new setting later never breaks someone's existing
 *  saved preferences (missing keys just fall back to the default). */
function mergeWithDefaults(stored: unknown): OptiqraSettings {
	const s = (stored ?? {}) as Partial<OptiqraSettings>;
	return {
		appearance: { ...DEFAULT_SETTINGS.appearance, ...s.appearance },
		scanning: { ...DEFAULT_SETTINGS.scanning, ...s.scanning },
		crawler: { ...DEFAULT_SETTINGS.crawler, ...s.crawler },
		analyzer: {
			...DEFAULT_SETTINGS.analyzer,
			...s.analyzer,
			visibleCategories: {
				...DEFAULT_SETTINGS.analyzer.visibleCategories,
				...s.analyzer?.visibleCategories,
			},
		},
		ai: { ...DEFAULT_SETTINGS.ai, ...s.ai },
		notifications: { ...DEFAULT_SETTINGS.notifications, ...s.notifications },
		reports: { ...DEFAULT_SETTINGS.reports, ...s.reports },
		privacy: { ...DEFAULT_SETTINGS.privacy, ...s.privacy },
	};
}

function setMirrorCookie(settings: OptiqraSettings) {
	if (typeof document === "undefined") return;
	const mirror = {
		theme: settings.appearance.theme,
		accentColor: settings.appearance.accentColor,
		density: settings.appearance.density,
		reduceMotion: settings.appearance.reduceMotion,
		fontScale: settings.appearance.fontScale,
	};
	const secure = typeof location !== "undefined" && location.protocol === "https:" ? "; Secure" : "";
	const maxAge = 365 * 24 * 60 * 60;
	document.cookie = `${MIRROR_COOKIE}=${encodeURIComponent(JSON.stringify(mirror))}; Max-Age=${maxAge}; Path=/; SameSite=Lax${secure}`;
}

/** Reads just the appearance mirror from the cookie — synchronous, so it can
 *  run in a blocking script before first paint. See layout.tsx. */
export function readAppearanceMirrorFromCookie(): OptiqraSettings["appearance"] | null {
	if (typeof document === "undefined") return null;
	const match = document.cookie.split("; ").find((row) => row.startsWith(`${MIRROR_COOKIE}=`));
	if (!match) return null;
	try {
		const raw = JSON.parse(decodeURIComponent(match.split("=").slice(1).join("=")));
		return { ...DEFAULT_SETTINGS.appearance, ...raw };
	} catch {
		return null;
	}
}

export async function getSettings(): Promise<OptiqraSettings> {
	try {
		const db = await getDB();
		const stored = await db.get(STORE_NAME, SETTINGS_KEY);
		return mergeWithDefaults(stored);
	} catch {
		return DEFAULT_SETTINGS;
	}
}

export async function saveSettings(settings: OptiqraSettings): Promise<OptiqraSettings> {
	const merged = mergeWithDefaults(settings);
	try {
		const db = await getDB();
		await db.put(STORE_NAME, merged, SETTINGS_KEY);
	} catch {
		// IndexedDB unavailable (private mode, etc.) — the cookie mirror below
		// still keeps appearance settings working for this session.
	}
	setMirrorCookie(merged);
	return merged;
}

export async function resetSettings(): Promise<OptiqraSettings> {
	return saveSettings(DEFAULT_SETTINGS);
}

/** Rough estimate of what OptiQra is storing in this browser, for the
 *  Privacy & Data tab. Not exact (storage estimates never are) but gives a
 *  meaningful sense of scale. */
export async function getStorageEstimate(): Promise<{ usageBytes: number; quotaBytes: number } | null> {
	if (typeof navigator === "undefined" || !navigator.storage?.estimate) return null;
	try {
		const { usage, quota } = await navigator.storage.estimate();
		return { usageBytes: usage ?? 0, quotaBytes: quota ?? 0 };
	} catch {
		return null;
	}
}

export function exportSettingsAsJSON(settings: OptiqraSettings): string {
	return JSON.stringify(settings, null, 2);
}

export function parseImportedSettings(json: string): OptiqraSettings | null {
	try {
		return mergeWithDefaults(JSON.parse(json));
	} catch {
		return null;
	}
}
