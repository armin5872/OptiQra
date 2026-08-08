"use client";

import { useEffect } from "react";
import { isDesktop } from "@/lib/desktopBridge";

/**
 * Checks for a new desktop release on startup and, if one's available,
 * downloads + installs it in the background, then asks before relaunching
 * so it never yanks the app out from under someone mid-scan.
 *
 * No-op on the web deployment — `isDesktop()` gates on the
 * `__TAURI_INTERNALS__` global that only exists inside a Tauri webview,
 * same convention as everything else in desktopBridge.ts.
 */
export default function UpdaterCheck() {
	useEffect(() => {
		if (!isDesktop()) return;

		let cancelled = false;

		(async () => {
			try {
				const { check } = await import("@tauri-apps/plugin-updater");
				const update = await check();
				if (!update || cancelled) return;

				console.log(`[updater] ${update.version} available (current ${update.currentVersion})`);
				await update.downloadAndInstall();
				if (cancelled) return;

				const shouldRelaunch = window.confirm(
					`OptiQra ${update.version} has been downloaded and is ready to install. Restart now?`,
				);
				if (shouldRelaunch) {
					const { relaunch } = await import("@tauri-apps/plugin-process");
					await relaunch();
				}
			} catch (err) {
				// Never block startup on this — worst case, the user just
				// stays on the current version until the next check.
				console.warn("[updater] check failed:", err);
			}
		})();

		return () => {
			cancelled = true;
		};
	}, []);

	return null;
}
