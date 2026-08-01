"use client";

import { useState } from "react";

const LEARN_MORE_URL = "/app";

/**
 * Promotes the OptiQra desktop app from within the web app. Dismissible,
 * remembers dismissal in localStorage so it doesn't nag every visit.
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
		<div className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/5 px-4 py-3 mb-4">
			<div className="flex items-center gap-3 min-w-0">
				<span className="text-xl" aria-hidden>
					🖥️
				</span>
				<p className="text-sm text-black/80 truncate">
					<strong className="text-black">Get the OptiQra desktop app</strong>{" "}
					— scheduled scans run in the background, and project audits work
					fully offline.
				</p>
			</div>
			<div className="flex items-center gap-2 shrink-0">
				<a
					href={LEARN_MORE_URL}
					className="rounded-lg bg-white text-black text-sm font-medium px-3 py-1.5 hover:bg-white/90 transition-colors"
				>
					Download
				</a>
				<button
					onClick={dismiss}
					aria-label="Dismiss"
					className="text-black/40 hover:text-white/70 text-sm px-1"
				>
					✕
				</button>
			</div>
		</div>
	);
}
