"use client";

import { useEffect, useState } from "react";
import { isDesktop } from "@/lib/desktopBridge";

const LEARN_MORE_URL = "/app";
const DISMISS_KEY = "optiqra-post-scan-cta-dismissed";

/**
 * Shown once a scan finishes rendering its report. Dismisses for the rest
 * of the session (sessionStorage) rather than forever, and hides itself
 * automatically inside the desktop app (isDesktop()).
 *
 * Same CSS-var-based styling as PlatformsBanner.tsx — see that file's
 * comment for why this doesn't use Tailwind.
 */
export default function PostScanDesktopCTA() {
	const [visible, setVisible] = useState(false);

	useEffect(() => {
		if (isDesktop()) return;
		if (typeof window === "undefined") return;
		if (window.sessionStorage.getItem(DISMISS_KEY) === "1") return;
		setVisible(true);
	}, []);

	if (!visible) return null;

	function dismiss() {
		window.sessionStorage.setItem(DISMISS_KEY, "1");
		setVisible(false);
	}

	return (
		<div className="desktop-promo-banner desktop-promo-banner-postscan">
			<div className="desktop-promo-banner-text">
				<span className="desktop-promo-banner-icon" aria-hidden>
					⚡
				</span>
				<p>
					For a better experience, <strong>download the OptiQra app</strong> — this scan
					could&apos;ve run in the background, and the next one can.
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
