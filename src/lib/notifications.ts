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

/** Shows a notification if permission has been granted; silently no-ops
 * otherwise (callers shouldn't have to guard on permission themselves). */
export async function showScanNotification(title: string, body: string, url?: string) {
	if (typeof window === "undefined" || !("Notification" in window)) return;
	if (Notification.permission !== "granted") return;

	const options: NotificationOptions = {
		body,
		icon: "/icons/icon-192.png",
		badge: "/icons/icon-72.png",
		tag: url ? `optiqra-scan-${url}` : "optiqra-scan",
	};

	try {
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
