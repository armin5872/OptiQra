import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { AIProviderId } from "@/lib/aiFix";

/**
 * Persists the user's chosen AI provider, API key(s), and per-provider model
 * choice across reloads/sessions.
 *
 * Storage: IndexedDB only — deliberately NOT a cookie. Cookies get attached
 * automatically to every request this origin makes (including our own
 * /api/* routes and anything Sentry captures around those requests), which
 * would leak the key into places it has no reason to be. IndexedDB is
 * origin-scoped, never transmitted automatically, and only read when this
 * code explicitly asks for it — same trust boundary as before (see the
 * SECURITY NOTES in customCode.ts: a same-origin script could always read
 * this either way), just persistent instead of cleared on tab close.
 */

const DB_NAME = "optiqra-ai-provider";
const DB_VERSION = 1;
const STORE_NAME = "provider";
const STATE_KEY = "state";

export interface AIProviderStoredState {
	provider: AIProviderId | null;
	apiKeys: Partial<Record<AIProviderId, string>>;
	models: Partial<Record<AIProviderId, string>>;
}

const EMPTY_STATE: AIProviderStoredState = { provider: null, apiKeys: {}, models: {} };

interface AIProviderDB extends DBSchema {
	provider: {
		key: string;
		value: AIProviderStoredState;
	};
}

let dbPromise: Promise<IDBPDatabase<AIProviderDB>> | null = null;

function getDB() {
	if (typeof indexedDB === "undefined") {
		return Promise.reject(new Error("IndexedDB is only available in the browser"));
	}
	if (!dbPromise) {
		dbPromise = openDB<AIProviderDB>(DB_NAME, DB_VERSION, {
			upgrade(db) {
				if (!db.objectStoreNames.contains(STORE_NAME)) {
					db.createObjectStore(STORE_NAME);
				}
			},
		});
	}
	return dbPromise;
}

export async function getAIProviderState(): Promise<AIProviderStoredState> {
	try {
		const db = await getDB();
		const stored = await db.get(STORE_NAME, STATE_KEY);
		if (!stored) return EMPTY_STATE;
		return { provider: stored.provider ?? null, apiKeys: stored.apiKeys ?? {}, models: stored.models ?? {} };
	} catch {
		return EMPTY_STATE;
	}
}

export async function saveAIProviderState(state: AIProviderStoredState): Promise<void> {
	try {
		const db = await getDB();
		await db.put(STORE_NAME, state, STATE_KEY);
	} catch {
		// IndexedDB unavailable (private mode, etc.) — key just won't persist
		// across reloads this session; the in-memory React state still works.
	}
}

export async function clearAIProviderState(): Promise<void> {
	await saveAIProviderState(EMPTY_STATE);
}
