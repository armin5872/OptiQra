"use client";

import { useEffect, useState } from "react";
import { isDesktop } from "@/lib/desktopBridge";

const LEARN_MORE_URL = "/app";
const DISMISS_KEY = "optiqra-post-scan-cta-dismissed";

/**
 * Shown once a scan finishes rendering its report — this is the moment
 * someone's actually feeling the wait/reload/tab-open cost the desktop
 * app removes, so it's a better prompt than a banner shown all the time.
 * Dismisses for the rest of the session (sessionStorage, not
 * localStorage) so it can resurface on a later visit instead of being
 * gone forever after one click.
 */
export default function PostScanDesktopCTA() {
	const [visible, setVisible] = useState(false);

	useEffect(() => {
		if (isDesktop()) return; // already using it — nothing to prompt
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
		<div className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/5 backdrop-blur px-4 py-3 my-4">
			<div className="flex items-center gap-3 min-w-0">
				<span className="text-xl" aria-hidden>
					⚡
				</span>
				<p className="text-sm text-white/80 truncate">
					For a better experience, <strong className="text-white">download the OptiQra app</strong>{" "}
					— this scan could've run in the background, and the next one can.
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
					className="text-white/40 hover:text-white/70 text-sm px-1"
				>
					✕
				</button>
			</div>
		</div>
	);
}
