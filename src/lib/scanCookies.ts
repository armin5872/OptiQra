/**
 * Cookies cap out around 4KB and get sent to the server on every request,
 * so they're a bad home for full scan reports (that's what IndexedDB in
 * scanStore.ts is for). What cookies *are* good for is a small, synchronous
 * "here's what this browser last scanned" pointer that's readable
 * server-side too (e.g. from a Server Component or middleware) without
 * waiting on an async IndexedDB open.
 *
 * So: full report -> IndexedDB. Lightweight history (id/url/score/time) ->
 * cookie, capped to the most recent MAX_HISTORY entries.
 */

export type ScanCookieEntry = {
	id: string;
	url: string;
	mode: "single" | "site";
	overallScore: number;
	createdAt: number;
};

const HISTORY_COOKIE = "optiqra_scan_history";
const LAST_SCAN_COOKIE = "optiqra_last_scan";
const MAX_HISTORY = 10;
const COOKIE_MAX_AGE_DAYS = 90;

function setCookie(name: string, value: string, maxAgeDays = COOKIE_MAX_AGE_DAYS) {
	if (typeof document === "undefined") return;
	const maxAge = maxAgeDays * 24 * 60 * 60;
	// SameSite=Lax + no explicit domain keeps this scoped to the app's own
	// origin. Add `Secure` automatically once served over https.
	const secure = typeof location !== "undefined" && location.protocol === "https:" ? "; Secure" : "";
	document.cookie = `${name}=${encodeURIComponent(value)}; Max-Age=${maxAge}; Path=/; SameSite=Lax${secure}`;
}

function getCookie(name: string): string | null {
	if (typeof document === "undefined") return null;
	const match = document.cookie
		.split("; ")
		.find((row) => row.startsWith(`${name}=`));
	return match ? decodeURIComponent(match.split("=").slice(1).join("=")) : null;
}

function deleteCookie(name: string) {
	if (typeof document === "undefined") return;
	document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax`;
}

export function getScanHistoryFromCookie(): ScanCookieEntry[] {
	const raw = getCookie(HISTORY_COOKIE);
	if (!raw) return [];
	try {
		const parsed = JSON.parse(raw);
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
}

export function getLastScanFromCookie(): ScanCookieEntry | null {
	const raw = getCookie(LAST_SCAN_COOKIE);
	if (!raw) return null;
	try {
		return JSON.parse(raw) as ScanCookieEntry;
	} catch {
		return null;
	}
}

/**
 * Records a completed scan in the cookie history. Keeps only the newest
 * MAX_HISTORY entries so the cookie stays well under the 4KB browser limit
 * (each entry is ~100 bytes, so 10 entries is roughly 1KB).
 */
export function recordScanInCookie(entry: ScanCookieEntry): void {
	const existing = getScanHistoryFromCookie().filter((e) => e.id !== entry.id);
	const next = [entry, ...existing].slice(0, MAX_HISTORY);
	setCookie(HISTORY_COOKIE, JSON.stringify(next));
	setCookie(LAST_SCAN_COOKIE, JSON.stringify(entry));
}

export function removeScanFromCookie(id: string): void {
	const next = getScanHistoryFromCookie().filter((e) => e.id !== id);
	setCookie(HISTORY_COOKIE, JSON.stringify(next));
}

export function clearScanCookies(): void {
	deleteCookie(HISTORY_COOKIE);
	deleteCookie(LAST_SCAN_COOKIE);
}
