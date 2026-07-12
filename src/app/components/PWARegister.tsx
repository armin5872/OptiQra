"use client";

import { useEffect } from "react";

/**
 * next-pwa's `register: true` handles most of this automatically, but its
 * auto-injection was written with the Pages Router in mind. Registering
 * explicitly here is cheap insurance under the App Router — calling
 * `.register()` on an already-registered URL/scope is a no-op, so this
 * can't cause double registrations.
 */
export default function PWARegister() {
	useEffect(() => {
		if (process.env.NODE_ENV !== "production") return;
		if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

		navigator.serviceWorker.register("/sw.js").catch((err) => {
			console.warn("Service worker registration failed:", err);
		});
	}, []);

	return null;
}
