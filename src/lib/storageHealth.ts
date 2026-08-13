/**
 * Every store in this app (settingsStore, aiProviderStore, scanStore,
 * pagespeedKeyStore, customRulesStore, scheduleStore) persists to its own
 * IndexedDB database, and every one of them used to swallow failures
 * silently — a QuotaExceededError, a blocked/corrupted DB, private
 * browsing, whatever — and just fall back to empty/default data with
 * nothing in the console and nothing in the UI. From the user's
 * perspective that looks exactly like "my settings/API key/scan history
 * just vanished", with zero signal about why.
 *
 * This module gives every store one place to report a failure:
 *  - always logs it to the console with context, so it's actually
 *    debuggable instead of a silent catch-and-forget
 *  - tracks the most recent failure so the UI can show something (see
 *    StorageWarningBanner.tsx), since "everything quietly reset to
 *    defaults" is a much worse experience than "hey, your browser
 *    blocked local storage, here's why"
 */

export type StorageFailure = {
	/** Which store/operation failed, e.g. "settings:save", "scans:load". */
	context: string;
	message: string;
	/** True for the one error type actionable from inside this app —
	 *  everything else needs a browser/OS-level fix. */
	likelyQuotaExceeded: boolean;
	at: number;
};

let lastFailure: StorageFailure | null = null;
const listeners = new Set<() => void>();

function isQuotaError(err: unknown): boolean {
	if (err instanceof DOMException) {
		return err.name === "QuotaExceededError";
	}
	return err instanceof Error && /quota/i.test(err.message);
}

/** Call this from any store's catch block instead of swallowing the error.
 *  Safe to call from the service worker too (no DOM access needed). */
export function reportStorageError(context: string, err: unknown): void {
	const message = err instanceof Error ? err.message : String(err);
	lastFailure = {
		context,
		message,
		likelyQuotaExceeded: isQuotaError(err),
		at: Date.now(),
	};
	console.error(`[storage] ${context} failed — this data will not persist:`, err);
	for (const listener of listeners) listener();
}

export function getLastStorageFailure(): StorageFailure | null {
	return lastFailure;
}

/** Clears the banner (e.g. after the user frees up space and a save
 *  succeeds again) without needing every store to know about the UI. */
export function clearStorageFailure(): void {
	if (!lastFailure) return;
	lastFailure = null;
	for (const listener of listeners) listener();
}

export function subscribeToStorageFailures(listener: () => void): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}
