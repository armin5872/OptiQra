import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { syncScheduleToDesktop, deleteScheduleFromDesktop } from "@/lib/desktopBridge";

/**
 * Persists periodic-scan schedules in IndexedDB (same pattern as
 * scanStore.ts). There's no server-side database in this app, so a
 * "schedule" only ever runs while some tab of the app is open — see
 * src/lib/scheduler.ts for the checker that actually executes them and
 * PWA_SETUP.md for the honest limitations around background execution.
 */

const DB_NAME = "optiqra-schedules";
const DB_VERSION = 1;
const STORE_NAME = "schedules";

export type ScanFrequency =
	| "hourly"
	| "daily"
	| "weekly"
	| "monthly"
	| "yearly"
	| "custom";

export type ScheduleRunResult = {
	ranAt: number;
	scanId: string;
	overallScore: number;
	previousScore?: number;
	scoreDelta?: number;
	newIssueCount?: number;
	resolvedIssueCount?: number;
	ok: boolean;
	error?: string;
	/** Predictive-scan fields — populated once at least 3 prior scans exist
	 *  for this URL/mode. See src/lib/scanTrends.ts. */
	trendDirection?: "up" | "down" | "flat";
	predictedScore14d?: number;
	chronicIssueCount?: number;
	suggestedFrequency?: ScanFrequency;
	suggestedFrequencyReason?: string;
};

export type ScanSchedule = {
	id: string;
	url: string;
	mode: "single" | "site";
	maxPages?: number;
	frequency: ScanFrequency;
	compareWithPrevious: boolean;
	notify: boolean;
	enabled: boolean;
	createdAt: number;
	nextRunAt: number;
	lastRunAt?: number;
	lastScanId?: string;
	lastResult?: ScheduleRunResult;
	/** Opt-in: send a separate heads-up notification when the score trend
	 *  is declining and projected to cross a concerning threshold, or when
	 *  the same issue has now shown up unresolved for 3+ scans in a row —
	 *  instead of waiting for a bad "scan finished" summary after the fact. */
	predictiveAlerts?: boolean;

	// --- Custom scheduling (all optional — omitting them keeps the
	// original "N <unit> after the last run" behavior for hourly/daily/
	// weekly/monthly/yearly, so existing schedules aren't affected). ---

	/** Only used when frequency === "custom": run every N minutes, where N
	 *  is this value converted from whatever unit the UI collected it in
	 *  (minutes/hours/days/weeks) — see CUSTOM_INTERVAL_MIN_MINUTES for the
	 *  floor. */
	customIntervalMinutes?: number;
	/** Local 24h clock time ("HH:MM") to anchor daily/weekly/monthly/yearly
	 *  (and day+ "custom") runs to, e.g. "run at 03:00" instead of "run 24h
	 *  after whenever the last run happened to fire" — avoids the small
	 *  drift that causes a "daily" scan to slowly creep later and later if
	 *  a run is ever a few minutes late. Ignored for "hourly" and for
	 *  "custom" intervals under a day. */
	timeOfDay?: string;
	/** Only meaningful for "weekly" (or a "custom" interval of 7+ days):
	 *  specific days to run on, 0=Sunday..6=Saturday. When set, this
	 *  replaces "same weekday the schedule was created on" with an
	 *  explicit, possibly multi-day, list — e.g. "Mon + Thu". */
	daysOfWeek?: number[];
};

interface ScheduleDB extends DBSchema {
	schedules: {
		key: string;
		value: ScanSchedule;
		indexes: { "by-nextRunAt": number; "by-url": string };
	};
}

let dbPromise: Promise<IDBPDatabase<ScheduleDB>> | null = null;

function getDB() {
	// Same reasoning as scanStore.ts: IndexedDB exists inside the service
	// worker too, and that's exactly where periodicsync needs to read/write
	// schedules from. Gate on `indexedDB` itself, not `window`.
	if (typeof indexedDB === "undefined") {
		return Promise.reject(new Error("IndexedDB is only available in the browser"));
	}
	if (!dbPromise) {
		dbPromise = openDB<ScheduleDB>(DB_NAME, DB_VERSION, {
			upgrade(db) {
				if (!db.objectStoreNames.contains(STORE_NAME)) {
					const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
					store.createIndex("by-nextRunAt", "nextRunAt");
					store.createIndex("by-url", "url");
				}
			},
		});
	}
	return dbPromise;
}

export async function saveSchedule(schedule: ScanSchedule): Promise<ScanSchedule> {
	const db = await getDB();
	await db.put(STORE_NAME, schedule);
	// Best-effort mirror into the file store the desktop sidecar's
	// scheduler daemon reads — see src/lib/desktopBridge.ts. No-op on web.
	syncScheduleToDesktop(schedule);
	return schedule;
}

export async function getAllSchedules(): Promise<ScanSchedule[]> {
	const db = await getDB();
	const all = await db.getAllFromIndex(STORE_NAME, "by-nextRunAt");
	return all;
}

export async function getSchedule(id: string): Promise<ScanSchedule | undefined> {
	const db = await getDB();
	return db.get(STORE_NAME, id);
}

export async function deleteSchedule(id: string): Promise<void> {
	const db = await getDB();
	await db.delete(STORE_NAME, id);
	deleteScheduleFromDesktop(id);
}

export async function updateSchedule(
	id: string,
	patch: Partial<ScanSchedule>,
): Promise<ScanSchedule | undefined> {
	const db = await getDB();
	const existing = await db.get(STORE_NAME, id);
	if (!existing) return undefined;
	const updated = { ...existing, ...patch };
	await db.put(STORE_NAME, updated);
	syncScheduleToDesktop(updated);
	return updated;
}
