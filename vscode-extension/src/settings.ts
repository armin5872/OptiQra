// Central typed reader for all OptiQra VS Code settings. Mirrors the shape
// of the web/Tauri app's Settings panel (src/lib/settingsStore.ts) wherever
// a setting has an offline meaning — URL-only settings (target URL, crawl
// depth/concurrency for a *remote* crawl, schedule intervals for re-scanning
// a live site) are dropped since this extension never crawls a URL. A few
// settings are new and specific to running inside an editor (diagnostics
// severity mapping, auto-approve, ignore globs, live-check toggles).
import * as vscode from "vscode";
import type { InsightsMood } from "../../src/lib/settingsStore";
import type { AIProviderId } from "../../src/lib/aiFix";

export type DiagnosticsSeverityMap = "vscode-default" | "all-warning" | "all-error";

export interface OptiQraExtensionSettings {
	// --- Categories (on/off), mirrors the app's per-category toggles ---
	categories: {
		seo: boolean;
		performance: boolean;
		accessibility: boolean;
		security: boolean;
		conversions: boolean;
		bestPractices: boolean;
		geo: boolean;
		aeo: boolean;
		structuredData: boolean;
		duplicateContent: boolean;
	};
	// --- Diagnostics / SEO Intelligence (new: editor-only) ---
	diagnostics: {
		enabled: boolean;
		liveAsYouType: boolean;
		severityMap: DiagnosticsSeverityMap;
		minSeverity: "informational" | "low" | "medium" | "high" | "critical";
	};
	// --- Fix behavior ---
	fix: {
		autoApprove: boolean;
		preferAI: boolean;
		showDiffBeforeApply: boolean;
	};
	// --- AI / BYOK (mirrors Settings → AI Assistant, minus site-specific bits) ---
	ai: {
		provider: AIProviderId | "none";
		model: string;
		tone: "concise" | "detailed";
		mood: InsightsMood;
		moodPotency: number;
	};
	// --- Scanning scope (new: editor-only equivalents of the app's crawl scope) ---
	scan: {
		include: string[];
		exclude: string[];
		maxFileSizeKb: number;
	};
	// --- Reports / export ---
	reports: {
		defaultExportFormat: "pdf" | "docx" | "markdown" | "csv" | "tsv" | "txt" | "json";
	};
	// --- OPCA (new: coding agent for OptiQra) ---
	opca: {
		enabled: boolean;
		useWikiContext: boolean;
		maxAutoFixesPerRun: number;
	};
}

function cfg() {
	return vscode.workspace.getConfiguration("optiqra");
}

export function getSettings(): OptiQraExtensionSettings {
	const c = cfg();
	return {
		categories: {
			seo: c.get("categories.seo", true),
			performance: c.get("categories.performance", true),
			accessibility: c.get("categories.accessibility", true),
			security: c.get("categories.security", true),
			conversions: c.get("categories.conversions", true),
			bestPractices: c.get("categories.bestPractices", true),
			geo: c.get("categories.geo", true),
			aeo: c.get("categories.aeo", true),
			structuredData: c.get("categories.structuredData", true),
			duplicateContent: c.get("categories.duplicateContent", true),
		},
		diagnostics: {
			enabled: c.get("diagnostics.enabled", true),
			liveAsYouType: c.get("diagnostics.liveAsYouType", true),
			severityMap: c.get("diagnostics.severityMap", "vscode-default"),
			minSeverity: c.get("diagnostics.minSeverity", "informational"),
		},
		fix: {
			autoApprove: c.get("fix.autoApprove", false),
			preferAI: c.get("fix.preferAI", true),
			showDiffBeforeApply: c.get("fix.showDiffBeforeApply", true),
		},
		ai: {
			provider: c.get("ai.provider", "none"),
			model: c.get("ai.model", ""),
			tone: c.get("ai.tone", "detailed"),
			mood: c.get("ai.mood", "normal"),
			moodPotency: c.get("ai.moodPotency", 50),
		},
		scan: {
			include: c.get("scan.include", [
				"**/*.html",
				"**/*.htm",
				"**/*.jsx",
				"**/*.tsx",
				"**/*.vue",
				"**/*.svelte",
				"**/*.astro",
			]),
			exclude: c.get("scan.exclude", [
				"**/node_modules/**",
				"**/dist/**",
				"**/build/**",
				"**/.next/**",
				"**/out/**",
				"**/.git/**",
				"**/coverage/**",
			]),
			maxFileSizeKb: c.get("scan.maxFileSizeKb", 512),
		},
		reports: {
			defaultExportFormat: c.get("reports.defaultExportFormat", "markdown"),
		},
		opca: {
			enabled: c.get("opca.enabled", true),
			useWikiContext: c.get("opca.useWikiContext", true),
			maxAutoFixesPerRun: c.get("opca.maxAutoFixesPerRun", 25),
		},
	};
}

const SECRET_KEY = "optiqra.aiApiKey";

export async function getApiKey(context: vscode.ExtensionContext): Promise<string | undefined> {
	return context.secrets.get(SECRET_KEY);
}

export async function setApiKey(context: vscode.ExtensionContext, key: string): Promise<void> {
	await context.secrets.store(SECRET_KEY, key);
}

export async function clearApiKey(context: vscode.ExtensionContext): Promise<void> {
	await context.secrets.delete(SECRET_KEY);
}
