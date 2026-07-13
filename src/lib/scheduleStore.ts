import { openDB, type DBSchema, type IDBPDatabase } from "idb";

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
	| "yearly";

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
	return updated;
}
