import { openDB, type DBSchema, type IDBPDatabase } from "idb";

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
	if (typeof window === "undefined") {
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

/** Save (or overwrite) a full scan report. Returns the stored record. */
export async function saveScan(
	scan: Omit<StoredScan, "id" | "createdAt"> & { id?: string; createdAt?: number },
): Promise<StoredScan> {
	const db = await getDB();
	const record: StoredScan = {
		id: scan.id ?? crypto.randomUUID(),
		createdAt: scan.createdAt ?? Date.now(),
		url: scan.url,
		mode: scan.mode,
		overallScore: scan.overallScore,
		data: scan.data,
	};
	await db.put(STORE_NAME, record);
	return record;
}

/** All stored scans, newest first. */
export async function getAllScans(): Promise<StoredScan[]> {
	const db = await getDB();
	const all = await db.getAllFromIndex(STORE_NAME, "by-createdAt");
	return all.reverse();
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
