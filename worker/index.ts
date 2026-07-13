/**
 * Custom service worker code. next-pwa (via its `customWorkerDir` option,
 * default "worker") bundles this file separately and `importScripts()`s it
 * into the workbox-generated sw.js, so this runs alongside the
 * precaching/runtime-caching logic configured in next.config.ts.
 *
 * Two things live here, both tied to src/lib/scheduler.ts's
 * startScheduler(), which registers Periodic Background Sync as a
 * best-effort way to keep scheduled scans running even when no tab is
 * open:
 *
 *  1. `periodicsync` — actually runs due schedules when the browser wakes
 *     the worker up. Without this listener, the periodicSync.register()
 *     call in scheduler.ts succeeds but nothing ever happens on tick;
 *     the registration was a no-op.
 *  2. `notificationclick` — focuses (or opens) the app when a scan-finished
 *     notification is clicked, since `self.registration.showNotification`
 *     doesn't get that behavior for free.
 *
 * Reminder from PWA_SETUP.md still applies: periodicSync is opt-in per
 * browser, has no guaranteed interval, and isn't available at all in most
 * browsers. The foreground checker in scheduler.ts is the one guarantee;
 * this is a bonus for the browsers that support it.
 */

import { runDueSchedules } from "../src/lib/scheduler";

declare let self: ServiceWorkerGlobalScope;

/** TypeScript's lib.webworker.d.ts doesn't ship a type for this event (it's
 * a newer, Chromium-only API), so declare the one field this file needs. */
interface PeriodicSyncEvent extends ExtendableEvent {
	readonly tag: string;
}

self.addEventListener("periodicsync", ((event: PeriodicSyncEvent) => {
	if (event.tag !== "optiqra-scan-check") return;
	event.waitUntil(
		runDueSchedules().catch(() => {
			// Best-effort — a failed background check shouldn't crash the SW,
			// the next periodicsync tick (or the foreground checker, next time
			// a tab is open) will just try again.
		}),
	);
}) as EventListener);

self.addEventListener("notificationclick", (event) => {
	event.notification.close();
	const targetUrl: string | undefined = event.notification.data?.url;

	event.waitUntil(
		self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
			// Prefer focusing an already-open tab over opening a new one.
			for (const client of clientList) {
				if ("focus" in client) {
					if (targetUrl && "navigate" in client) {
						(client as WindowClient).navigate(targetUrl).catch(() => {});
					}
					return (client as WindowClient).focus();
				}
			}
			return self.clients.openWindow(targetUrl ?? "/");
		}),
	);
});
