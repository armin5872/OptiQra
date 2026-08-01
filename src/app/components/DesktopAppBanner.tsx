"use client";

import { useState } from "react";

const LEARN_MORE_URL = "/app";

/**
 * Promotes the OptiQra desktop app from within the web app. Dismissible,
 * remembers dismissal in localStorage so it doesn't nag every visit.
 *
 * Uses the app's own CSS variables (--surface, --line, --ink, --accent,
 * defined in globals.css and re-mapped by [data-theme="dark"]) rather
 * than Tailwind utility classes, so it actually adapts across the app's
 * light/dark themes instead of assuming a dark background.
 */
export default function DesktopAppBanner() {
	const [dismissed, setDismissed] = useState(() => {
		if (typeof window === "undefined") return false;
		return window.localStorage.getItem("optiqra-desktop-banner-dismissed") === "1";
	});

	if (dismissed) return null;

	function dismiss() {
		window.localStorage.setItem("optiqra-desktop-banner-dismissed", "1");
		setDismissed(true);
	}

	return (
		<div className="desktop-promo-banner">
			<div className="desktop-promo-banner-text">
				<span className="desktop-promo-banner-icon" aria-hidden>
					🖥️
				</span>
				<p>
					<strong>Get the OptiQra desktop app</strong> — scheduled scans run in the background,
					and project audits work fully offline.
				</p>
			</div>
			<div className="desktop-promo-banner-actions">
				<a href={LEARN_MORE_URL} className="apply-btn">
					Download
				</a>
				<button onClick={dismiss} aria-label="Dismiss" className="desktop-promo-dismiss">
					✕
				</button>
			</div>
		</div>
	);
}
