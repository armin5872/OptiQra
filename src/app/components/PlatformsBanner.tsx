"use client";

import { useState } from "react";

const DESKTOP_URL = "/app";
const VSCODE_URL = "https://github.com/armin5872/OptiQra/tree/main/vscode-extension";

/**
 * Promotes OptiQra beyond the web app — the desktop app (scheduled scans,
 * fully offline project audits) and the VS Code extension (live in-editor
 * diagnostics, one-click fixes, OPCA). Dismissible, remembers dismissal in
 * localStorage so it doesn't nag every visit.
 *
 * Formerly DesktopAppBanner — renamed since it now promotes both platforms.
 * Uses the app's own CSS variables (--surface, --line, --ink, --accent,
 * defined in globals.css and re-mapped by [data-theme="dark"]) rather
 * than Tailwind utility classes, so it actually adapts across the app's
 * light/dark themes instead of assuming a dark background.
 */
export default function PlatformsBanner() {
	const [dismissed, setDismissed] = useState(() => {
		if (typeof window === "undefined") return false;
		return window.localStorage.getItem("optiqra-platforms-banner-dismissed") === "1";
	});

	if (dismissed) return null;

	function dismiss() {
		window.localStorage.setItem("optiqra-platforms-banner-dismissed", "1");
		setDismissed(true);
	}

	return (
		<div className="desktop-promo-banner">
			<div className="desktop-promo-banner-text">
				<span className="desktop-promo-banner-icon" aria-hidden>
					🖥️
				</span>
				<p>
					<strong>OptiQra isn&apos;t just this tab.</strong> Get the desktop app for scheduled,
					fully-offline scans, or install the VS Code extension to catch SEO/GEO/AEO and
					accessibility issues — and fix them — right where you write the code.
				</p>
			</div>
			<div className="desktop-promo-banner-actions">
				<a href={DESKTOP_URL} className="apply-btn">
					Get Desktop App
				</a>
				<a href={VSCODE_URL} className="apply-btn apply-btn-secondary">
					Get VS Code Extension
				</a>
				<button onClick={dismiss} aria-label="Dismiss" className="desktop-promo-dismiss">
					✕
				</button>
			</div>
		</div>
	);
}
