import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { isDesktop, listDesktopScans, readDesktopScan } from "@/lib/desktopBridge";
import { reportStorageError, clearStorageFailure } from "@/lib/storageHealth";

/**
 * Persists full scan reports in IndexedDB so past scans survive reloads,
 * work offline, and don't need to be re-fetched from the server. A small
 * pointer to the same scans is also kept in a cookie (see scanCookies.ts)
 * so the app can show "last scanned" info before IndexedDB has opened.
 */

const DB_NAME = "optiqra-scans";
const DB_VERSION = 1;
const STORE_NAME = "scans";

export type StoredScan = {
	id: string;
	url: string;
	mode: "single" | "site";
	createdAt: number;
	overallScore: number;
	// The exact shape produced by /api/analyze — kept loose here so this
	// file doesn't need to import page.tsx's report type.
	data: unknown;
};

interface ScanDB extends DBSchema {
	scans: {
		key: string;
		value: StoredScan;
		indexes: { "by-createdAt": number; "by-url": string };
	};
}

let dbPromise: Promise<IDBPDatabase<ScanDB>> | null = null;

function getDB() {
	// IndexedDB is also available inside the service worker (no `window`
	// there), which matters for the periodicsync-triggered scans in
	// worker/index.ts. Gate on `indexedDB` itself rather than `window` so
	// this only actually rejects in a true SSR/Node context.
	if (typeof indexedDB === "undefined") {
		return Promise.reject(new Error("IndexedDB is only available in the browser"));
	}
	if (!dbPromise) {
		dbPromise = openDB<ScanDB>(DB_NAME, DB_VERSION, {
			upgrade(db) {
				if (!db.objectStoreNames.contains(STORE_NAME)) {
					const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
					store.createIndex("by-createdAt", "createdAt");
					store.createIndex("by-url", "url");
				}
			},
		});
	}
	return dbPromise;
}

let desktopMerged = false;

/** Pulls in any scans the desktop sidecar's scheduler daemon ran while
 *  the window was closed (see server/README.md's "the one real gap
 *  left") — those land in the daemon's file store, not IndexedDB, until
 *  this runs. Called once per session, lazily, from getAllScans() below,
 *  rather than requiring a useEffect wired into page.tsx: same effect,
 *  smaller diff against the existing app. No-ops instantly on web. */
async function mergeDesktopScansOnce(db: IDBPDatabase<ScanDB>) {
	if (desktopMerged || !isDesktop()) return;
	desktopMerged = true;
	try {
		const remote = await listDesktopScans();
		for (const entry of remote) {
			const existing = await db.get(STORE_NAME, entry.id);
			if (existing) continue;
			const full = await readDesktopScan(entry.id);
			if (!full) continue;
			await db.put(STORE_NAME, full as StoredScan);
		}
	} catch (err) {
		console.warn("[scanStore] desktop scan merge failed:", err);
	}
}

/** Save (or overwrite) a full scan report. Returns the stored record.
 *  Throws on failure (see storageHealth.ts) — callers already wrap this in
 *  try/catch (page.tsx's persistScan), so it's reported both to the console
 *  and to the shared storage-health tracker before propagating. */
export async function saveScan(
	scan: Omit<StoredScan, "id" | "createdAt"> & { id?: string; createdAt?: number },
): Promise<StoredScan> {
	const record: StoredScan = {
		id: scan.id ?? crypto.randomUUID(),
		createdAt: scan.createdAt ?? Date.now(),
		url: scan.url,
		mode: scan.mode,
		overallScore: scan.overallScore,
		data: scan.data,
	};
	try {
		const db = await getDB();
		await db.put(STORE_NAME, record);
		clearStorageFailure();
		return record;
	} catch (err) {
		reportStorageError("scans:save", err);
		throw err;
	}
}

/** All stored scans, newest first. */
export async function getAllScans(): Promise<StoredScan[]> {
	try {
		const db = await getDB();
		await mergeDesktopScansOnce(db);
		const all = await db.getAllFromIndex(STORE_NAME, "by-createdAt");
		clearStorageFailure();
		return all.reverse();
	} catch (err) {
		reportStorageError("scans:load", err);
		throw err;
	}
}

/** Most recent N scans (default 10) — cheap for a "recent scans" list. */
export async function getRecentScans(limit = 10): Promise<StoredScan[]> {
	const all = await getAllScans();
	return all.slice(0, limit);
}

export async function getScan(id: string): Promise<StoredScan | undefined> {
	const db = await getDB();
	return db.get(STORE_NAME, id);
}

export async function deleteScan(id: string): Promise<void> {
	const db = await getDB();
	await db.delete(STORE_NAME, id);
}

export async function clearScans(): Promise<void> {
	const db = await getDB();
	await db.clear(STORE_NAME);
}

/** Deletes stored scans older than `retentionDays`. Called on app load with
 *  the current `privacy.historyRetentionDays` setting — a no-op when it's 0
 *  ("keep forever"). Returns how many records were removed, mostly for
 *  optional debugging/telemetry. */
export async function pruneScansOlderThan(retentionDays: number): Promise<number> {
	if (!retentionDays || retentionDays <= 0) return 0;
	const db = await getDB();
	const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
	const all = await db.getAllFromIndex(STORE_NAME, "by-createdAt");
	const stale = all.filter((scan) => scan.createdAt < cutoff);
	await Promise.all(stale.map((scan) => db.delete(STORE_NAME, scan.id)));
	return stale.length;
}
