"use client";

import { useEffect, useRef, useState } from "react";
import { REPO_URL } from "@/lib/githubContribute";
import GithubMark from "./icons/GithubMark";

const SHOW_DELAY_MS = 10_000;
const AUTO_CLOSE_MS = 20_000;
const LEAVE_ANIM_MS = 220;

/** localStorage: permanent opt-out via "Don't show this again". */
const NEVER_SHOW_KEY = "optiqra-github-star-never-show";
/** sessionStorage: guards against firing more than once per tab session
 *  (e.g. scanning several sites in a row). */
const SESSION_SHOWN_KEY = "optiqra-github-star-shown";

/**
 * Shown once, ~10s after a scan's report finishes rendering — long enough
 * that the person has actually looked at their results before we ask them
 * for anything. Auto-dismisses after 20s, can be closed early via the ✕,
 * or turned off forever via "Don't show this again".
 *
 * Mount this once per report render (see page.tsx, next to
 * PostScanDesktopCTA) — it self-guards against re-showing via
 * sessionStorage/localStorage, so it's safe even if the parent re-renders.
 */
export default function GithubStarToast() {
	const [visible, setVisible] = useState(false);
	const [leaving, setLeaving] = useState(false);
	const autoCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		if (typeof window === "undefined") return;
		if (window.localStorage.getItem(NEVER_SHOW_KEY) === "1") return;
		if (window.sessionStorage.getItem(SESSION_SHOWN_KEY) === "1") return;

		const showTimer = setTimeout(() => {
			window.sessionStorage.setItem(SESSION_SHOWN_KEY, "1");
			setVisible(true);
			playStarChime();
		}, SHOW_DELAY_MS);

		return () => clearTimeout(showTimer);
	}, []);

	useEffect(() => {
		if (!visible) return;
		autoCloseTimer.current = setTimeout(dismiss, AUTO_CLOSE_MS);
		return () => {
			if (autoCloseTimer.current) clearTimeout(autoCloseTimer.current);
		};
	}, [visible]);

	useEffect(() => {
		return () => {
			if (leaveTimer.current) clearTimeout(leaveTimer.current);
		};
	}, []);

	function dismiss() {
		if (autoCloseTimer.current) clearTimeout(autoCloseTimer.current);
		setLeaving(true);
		leaveTimer.current = setTimeout(() => {
			setVisible(false);
			setLeaving(false);
		}, LEAVE_ANIM_MS);
	}

	function neverShowAgain() {
		window.localStorage.setItem(NEVER_SHOW_KEY, "1");
		dismiss();
	}

	if (!visible) return null;

	return (
		<div
			className={`github-star-toast${leaving ? " github-star-toast-leaving" : ""}`}
			role="status"
			aria-live="polite"
		>
			<div className="github-star-toast-progress" style={{ animationDuration: `${AUTO_CLOSE_MS}ms` }} />

			<button
				type="button"
				className="github-star-toast-close"
				onClick={dismiss}
				aria-label="Close"
			>
				✕
			</button>

			<div className="github-star-toast-body">
				<span className="github-star-toast-star" aria-hidden>
					⭐
				</span>
				<div className="github-star-toast-text">
					<p className="github-star-toast-title">Enjoying OptiQra?</p>
					<p className="github-star-toast-sub">
						Give us a star on GitHub — it helps more people find the project!
					</p>
				</div>
			</div>

			<div className="github-star-toast-actions">
				<a
					href={REPO_URL}
					target="_blank"
					rel="noreferrer"
					className="github-star-toast-cta"
					onClick={dismiss}
				>
					<GithubMark size={14} />
					Star on GitHub
				</a>
				<button
					type="button"
					className="github-star-toast-never"
					onClick={neverShowAgain}
				>
					Don&apos;t show this again
				</button>
			</div>
		</div>
	);
}

/**
 * Tiny two-note synth chime played through the Web Audio API — no audio
 * asset to ship, load, or have go missing. Wrapped in try/catch since some
 * browsers block audio until a user gesture; by the time this fires the
 * person has already interacted with the page (started a scan), but we
 * never want a blocked AudioContext to break the toast itself.
 */
function playStarChime() {
	try {
		const AudioCtx =
			window.AudioContext ||
			(window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
		if (!AudioCtx) return;

		const ctx = new AudioCtx();
		const now = ctx.currentTime;
		const notes: Array<{ freq: number; start: number; duration: number }> = [
			{ freq: 880, start: now, duration: 0.32 },
			{ freq: 1318.5, start: now + 0.1, duration: 0.4 },
		];

		notes.forEach(({ freq, start, duration }) => {
			const osc = ctx.createOscillator();
			const gain = ctx.createGain();
			osc.type = "sine";
			osc.frequency.value = freq;
			gain.gain.setValueAtTime(0, start);
			gain.gain.linearRampToValueAtTime(0.13, start + 0.02);
			gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
			osc.connect(gain);
			gain.connect(ctx.destination);
			osc.start(start);
			osc.stop(start + duration + 0.05);
		});

		setTimeout(() => ctx.close(), 900);
	} catch {
		// Sound is a nice-to-have, never worth surfacing an error for.
	}
}
