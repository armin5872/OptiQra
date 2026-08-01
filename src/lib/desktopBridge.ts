/**
 * Bridges the browser's IndexedDB stores (scheduleStore.ts, used by
 * ScheduleManager.tsx) to the file store the desktop sidecar's scheduler
 * daemon reads (server/store/scheduleFileStore.ts) — see "The one real
 * gap left" in server/README.md for why this exists.
 *
 * Every function here is a safe no-op when this code runs as the normal
 * web app (Vercel deployment, `next dev` outside Tauri): `isDesktop()`
 * checks for the `__TAURI_INTERNALS__` global that only exists inside a
 * Tauri webview, so none of this ever executes there and nothing here
 * needs guarding at the call sites in scheduleStore.ts/scanStore.ts.
 */

export function isDesktop(): boolean {
	return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T | undefined> {
	if (!isDesktop()) return undefined;
	try {
		const { invoke: tauriInvoke } = await import("@tauri-apps/api/core");
		return await tauriInvoke<T>(cmd, args);
	} catch (err) {
		// Never let a sync failure break the actual save the user is
		// waiting on — schedule/scan operations already succeeded against
		// IndexedDB by the time these are called; this is best-effort.
		console.warn(`[desktopBridge] ${cmd} failed:`, err);
		return undefined;
	}
}

/** Fire-and-forget: mirrors one schedule into the file store the daemon
 *  reads. Call after every IndexedDB write in scheduleStore.ts. */
export function syncScheduleToDesktop(schedule: unknown): void {
	void invoke("sync_schedule", { schedule });
}

export function deleteScheduleFromDesktop(id: string): void {
	void invoke("delete_synced_schedule", { id });
}

export type SyncedScanEntry = {
	id: string;
	url: string;
	mode: "single" | "site";
	createdAt: number;
	overallScore: number;
};

/** Scans the daemon has saved that the UI might not have in IndexedDB yet
 *  (e.g. a schedule that ran while the window was closed). */
export async function listDesktopScans(): Promise<SyncedScanEntry[]> {
	const result = await invoke<SyncedScanEntry[]>("list_synced_scans");
	return result ?? [];
}

export async function readDesktopScan(id: string): Promise<unknown | undefined> {
	return invoke("read_synced_scan", { id });
}
