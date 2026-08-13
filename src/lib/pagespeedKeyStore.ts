import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { PageSpeedStrategy } from "@/lib/pagespeed";
import { reportStorageError, clearStorageFailure } from "@/lib/storageHealth";

/**
 * Persists the user's PageSpeed Insights API key and strategy choice across
 * reloads. Its own IndexedDB database — deliberately NOT settingsStore's:
 * settingsStore's contents get written straight into the downloadable
 * "export settings" JSON file (see SettingsPanel's exportSettingsAsJSON), so
 * a secret key living there would end up inside that file. Also not a
 * cookie, for the same reason as aiProviderStore.ts: cookies get attached to
 * every request this origin makes automatically, which this key has no
 * reason to ride along on.
 */

const DB_NAME = "optiqra-pagespeed-key";
const DB_VERSION = 1;
const STORE_NAME = "pagespeed";
const STATE_KEY = "state";

export interface PageSpeedStoredState {
	apiKey: string;
	strategy: PageSpeedStrategy;
}

const EMPTY_STATE: PageSpeedStoredState = { apiKey: "", strategy: "mobile" };

interface PageSpeedDB extends DBSchema {
	pagespeed: {
		key: string;
		value: PageSpeedStoredState;
	};
}

let dbPromise: Promise<IDBPDatabase<PageSpeedDB>> | null = null;

function getDB() {
	if (typeof indexedDB === "undefined") {
		return Promise.reject(new Error("IndexedDB is only available in the browser"));
	}
	if (!dbPromise) {
		dbPromise = openDB<PageSpeedDB>(DB_NAME, DB_VERSION, {
			upgrade(db) {
				if (!db.objectStoreNames.contains(STORE_NAME)) {
					db.createObjectStore(STORE_NAME);
				}
			},
		});
	}
	return dbPromise;
}

export async function getPageSpeedState(): Promise<PageSpeedStoredState> {
	try {
		const db = await getDB();
		const stored = await db.get(STORE_NAME, STATE_KEY);
		clearStorageFailure();
		if (!stored) return EMPTY_STATE;
		const strategy: PageSpeedStrategy = stored.strategy === "desktop" ? "desktop" : "mobile";
		return { apiKey: stored.apiKey ?? "", strategy };
	} catch (err) {
		reportStorageError("pagespeed-key:load", err);
		return EMPTY_STATE;
	}
}

export async function savePageSpeedState(state: PageSpeedStoredState): Promise<void> {
	try {
		const db = await getDB();
		await db.put(STORE_NAME, state, STATE_KEY);
		clearStorageFailure();
	} catch (err) {
		// IndexedDB unavailable (private mode, quota exceeded, etc.) — key
		// just won't persist across reloads this session; the in-memory
		// React state still works.
		reportStorageError("pagespeed-key:save", err);
	}
}
