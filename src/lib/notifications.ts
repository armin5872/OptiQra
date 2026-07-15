/**
 * Thin wrapper around the browser Notification API. Used to let a
 * scheduled scan tell the user it finished (and what changed) without
 * them having to keep the tab focused and watch it happen.
 *
 * Caveat that's worth being upfront about: this only fires while the
 * browser process is running. If the tab/app isn't open in some window,
 * nothing checks the schedule and no notification fires — see
 * src/lib/scheduler.ts and PWA_SETUP.md for details.
 */

export type NotificationPermissionState = "unsupported" | "granted" | "denied" | "default";

export function getNotificationPermission(): NotificationPermissionState {
	if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
	return Notification.permission;
}

export async function requestNotificationPermission(): Promise<NotificationPermissionState> {
	if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
	if (Notification.permission === "granted" || Notification.permission === "denied") {
		return Notification.permission;
	}
	try {
		const result = await Notification.requestPermission();
		return result;
	} catch {
		return "denied";
	}
}

/** True when this code is executing inside the service worker itself
 * (e.g. a periodicsync-triggered scan in worker/index.ts) rather than in
 * a window/tab. There's no `window` or `Notification` constructor in that
 * scope, but `self.registration.showNotification` is available directly. */
function isServiceWorkerScope(): boolean {
	return (
		typeof window === "undefined" &&
		typeof self !== "undefined" &&
		typeof (self as unknown as ServiceWorkerGlobalScope).registration !== "undefined"
	);
}

/** Shows a notification if permission has been granted; silently no-ops
 * otherwise (callers shouldn't have to guard on permission themselves).
 * Safe to call both from a window/tab and from inside the service worker
 * (worker/index.ts's periodicsync handler calls this same function). */
export async function showScanNotification(title: string, body: string, url?: string) {
	const inWorker = isServiceWorkerScope();
	if (!inWorker && (typeof window === "undefined" || !("Notification" in window))) return;
	if (!inWorker && Notification.permission !== "granted") return;

	// Settings → Notifications. Works from the service worker too, since
	// IndexedDB (unlike window/localStorage) is available in that scope.
	try {
		const { getSettings } = await import("./settingsStore");
		const settings = await getSettings();
		if (!settings.notifications.enabled) return;
	} catch {
		// If settings can't be read, default to showing the notification —
		// permission was already granted, so this stays opt-in overall.
	}

	const options: NotificationOptions = {
		body,
		icon: "/icons/icon-192.png",
		badge: "/icons/icon-72.png",
		tag: url ? `optiqra-scan-${url}` : "optiqra-scan",
		data: { url },
	};

	try {
		if (inWorker) {
			// Already running as the service worker — this *is* the
			// registration, no need to look one up.
			await (self as unknown as ServiceWorkerGlobalScope).registration.showNotification(title, options);
			return;
		}
		// Prefer showing via the service worker registration when available —
		// those notifications survive even if this particular tab closes
		// (as long as the browser is still running and the SW is alive),
		// and they support click-to-focus behavior via notificationclick.
		if ("serviceWorker" in navigator) {
			const reg = await navigator.serviceWorker.getRegistration();
			if (reg) {
				await reg.showNotification(title, options);
				return;
			}
		}
		new Notification(title, options);
	} catch (err) {
		console.warn("Couldn't show scan notification:", err);
	}
}
