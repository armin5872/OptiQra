/**
 * Runs scheduled (periodic) scans.
 *
 * Important scope note: this app has no server-side database or job
 * queue (see PWA_SETUP.md) — every schedule lives in this browser's
 * IndexedDB, and the only thing that can trigger a run is this checker,
 * which is started from a client component and lives for as long as some
 * tab of the app is open. That's enough to cover "leave OptiQra open (or
 * installed as a PWA) and it'll keep itself up to date" without you
 * having to sit and watch a scan run — it does NOT mean scans fire while
 * your browser is fully closed. `startScheduler()` also makes a
 * best-effort attempt to register the Periodic Background Sync API where
 * the browser supports it, which can extend this somewhat on Chromium/
 * installed-PWA setups, but that API is opt-in per browser, has no
 * guaranteed interval, and isn't available at all in most browsers —
 * treat it as a bonus, not a guarantee.
 */

import { saveScan, getAllScans } from "@/lib/scanStore";
import { recordScanInCookie } from "@/lib/scanCookies";
import {
	getAllSchedules,
	updateSchedule,
	type ScanSchedule,
	type ScanFrequency,
	type ScheduleRunResult,
} from "@/lib/scheduleStore";
import { compareScans, summarizeComparison } from "@/lib/scanCompare";
import { showScanNotification } from "@/lib/notifications";
import type { Category } from "@/lib/reportAggregate";
import { getErrorMessage } from "@/lib/errorUtils";

export const FREQUENCY_OPTIONS: { id: ScanFrequency; label: string }[] = [
	{ id: "hourly", label: "Every hour" },
	{ id: "daily", label: "Daily" },
	{ id: "weekly", label: "Weekly" },
	{ id: "monthly", label: "Monthly" },
	{ id: "yearly", label: "Yearly" },
];

const CHECK_INTERVAL_MS = 60 * 1000; // how often the foreground checker looks for due schedules

/** Calendar-aware "next run" — hourly/daily/weekly are fixed durations,
 * monthly/yearly walk the calendar so e.g. "run on the 31st" doesn't drift. */
export function computeNextRun(frequency: ScanFrequency, from = Date.now()): number {
	const d = new Date(from);
	switch (frequency) {
		case "hourly":
			return from + 60 * 60 * 1000;
		case "daily":
			return from + 24 * 60 * 60 * 1000;
		case "weekly":
			return from + 7 * 24 * 60 * 60 * 1000;
		case "monthly": {
			const next = new Date(d);
			next.setMonth(next.getMonth() + 1);
			return next.getTime();
		}
		case "yearly": {
			const next = new Date(d);
			next.setFullYear(next.getFullYear() + 1);
			return next.getTime();
		}
		default:
			return from + 24 * 60 * 60 * 1000;
	}
}

type ScanReportData = {
	url: string;
	mode?: "single" | "site";
	categories: Record<string, Category>;
	[key: string]: unknown;
};

// Discriminated union for each NDJSON line the /api/analyze site-scan
// stream can emit — mirrors the shape used in page.tsx's client-side
// reader for the same endpoint.
type ScanStreamEvent =
	| { type: "status"; message?: string }
	| { type: "progress" }
	| { type: "linkProgress" }
	| { type: "done"; data: ScanReportData }
	| { type: "aborted" }
	| { type: "error"; message?: string };

/** Runs one scan against /api/analyze and resolves with the final report,
 * whether it came back as plain JSON (single-page) or as an NDJSON
 * progress stream (whole-site). No UI/progress plumbing — this is meant
 * to run unattended. */
async function performScan(
	url: string,
	mode: "single" | "site",
	maxPages?: number,
): Promise<ScanReportData> {
	const res = await fetch("/api/analyze", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(
			mode === "site" ? { url, mode, maxPages } : { url, mode },
		),
	});

	const contentType = res.headers.get("Content-Type") ?? "";

	if (!contentType.includes("ndjson")) {
		const data = await res.json();
		if (!res.ok) throw new Error(data.error || "Scheduled scan failed.");
		return data;
	}

	if (!res.ok || !res.body) {
		let message = "Scheduled scan failed.";
		try {
			const errJson = await res.json();
			message = errJson.error || message;
		} catch {
			// not JSON — keep default message
		}
		throw new Error(message);
	}

	const reader = res.body.getReader();
	const decoder = new TextDecoder();
	let buffer = "";

	while (true) {
		const { value, done } = await reader.read();
		if (done) break;
		buffer += decoder.decode(value, { stream: true });

		let newlineIdx;
		while ((newlineIdx = buffer.indexOf("\n")) >= 0) {
			const line = buffer.slice(0, newlineIdx).trim();
			buffer = buffer.slice(newlineIdx + 1);
			if (!line) continue;

			let evt: ScanStreamEvent;
			try {
				evt = JSON.parse(line) as ScanStreamEvent;
			} catch {
				continue;
			}

			if (evt.type === "done") return evt.data;
			if (evt.type === "aborted") throw new Error("Scan was interrupted.");
			if (evt.type === "error") throw new Error(evt.message || "Scheduled scan failed.");
		}
	}

	throw new Error("Scan stream ended without a result.");
}

function overallFromCategories(categories: Record<string, Category>): number {
	const keys = Object.keys(categories ?? {});
	if (!keys.length) return 0;
	const sum = keys.reduce((a, k) => a + (categories[k].score ?? 0), 0);
	return Math.round(sum / keys.length);
}

const runningIds = new Set<string>();

/** Executes one due schedule: runs the scan, saves it, optionally compares
 * against the previous scan for that URL, optionally notifies, and always
 * reschedules the next run (even on failure, so one bad scan doesn't spin
 * the checker every minute forever). */
async function runSchedule(schedule: ScanSchedule) {
	if (runningIds.has(schedule.id)) return;
	runningIds.add(schedule.id);

	try {
		const priorScans = await getAllScans();
		const previous = schedule.compareWithPrevious
			? priorScans.find((s) => s.url === schedule.url && s.mode === schedule.mode)
			: undefined;

		const data = await performScan(schedule.url, schedule.mode, schedule.maxPages);
		const overallScore = overallFromCategories(data.categories);

		const stored = await saveScan({
			url: schedule.url,
			mode: schedule.mode,
			overallScore,
			data,
		});
		recordScanInCookie({
			id: stored.id,
			url: stored.url,
			mode: stored.mode,
			overallScore: stored.overallScore,
			createdAt: stored.createdAt,
		});

		let summary = `Scored ${overallScore}/100.`;
		let comparisonFields: Partial<ScheduleRunResult> = {};
		if (previous) {
			const cmp = compareScans(
				previous.data as { url: string; categories: Record<string, Category> },
				data,
			);
			summary = summarizeComparison(cmp);
			comparisonFields = {
				previousScore: cmp.previousOverall,
				scoreDelta: cmp.overallDelta,
				newIssueCount: cmp.newIssues.length,
				resolvedIssueCount: cmp.resolvedIssues.length,
			};
		}

		const now = Date.now();
		await updateSchedule(schedule.id, {
			lastRunAt: now,
			nextRunAt: computeNextRun(schedule.frequency, now),
			lastScanId: stored.id,
			lastResult: {
				ranAt: now,
				scanId: stored.id,
				overallScore,
				ok: true,
				...comparisonFields,
			},
		});

		if (schedule.notify) {
			await showScanNotification(
				`Scan finished: ${schedule.url}`,
				summary,
				schedule.url,
			);
		}
	} catch (err: unknown) {
		const now = Date.now();
		await updateSchedule(schedule.id, {
			lastRunAt: now,
			nextRunAt: computeNextRun(schedule.frequency, now),
			lastResult: {
				ranAt: now,
				scanId: schedule.lastScanId ?? "",
				overallScore: schedule.lastResult?.overallScore ?? 0,
				ok: false,
				error: getErrorMessage(err, "Scheduled scan failed."),
			},
		});
		if (schedule.notify) {
			await showScanNotification(
				`Scheduled scan failed: ${schedule.url}`,
				getErrorMessage(err, "Something went wrong running that scan."),
				schedule.url,
			);
		}
	} finally {
		runningIds.delete(schedule.id);
		if (typeof window !== "undefined") {
			window.dispatchEvent(new CustomEvent("optiqra:schedules-updated"));
		} else if (typeof (self as unknown as ServiceWorkerGlobalScope).clients !== "undefined") {
			// Running inside the service worker (periodicsync) — there's no
			// `window` to dispatch to, but any open tab can still hear about
			// it via postMessage so its schedule list refreshes.
			const clientsList = await (self as unknown as ServiceWorkerGlobalScope).clients.matchAll({ type: "window" });
			for (const client of clientsList) {
				client.postMessage({ type: "optiqra:schedules-updated" });
			}
		}
	}
}

/** Checks every schedule and runs whichever are due. Safe to call
 * repeatedly — schedules already running are skipped, not queued twice.
 * Called both from the foreground checker below (in a tab) and from
 * worker/index.ts's periodicsync handler (inside the service worker) —
 * so this must not bail out just because `window` isn't defined. */
export async function runDueSchedules() {
	if (typeof indexedDB === "undefined") return;
	const schedules = await getAllSchedules();
	const now = Date.now();
	const due = schedules.filter((s) => s.enabled && s.nextRunAt <= now);
	// Run sequentially rather than in parallel — these can be full-site
	// crawls, no reason to hammer several targets (or this server) at once.
	for (const schedule of due) {
		await runSchedule(schedule);
	}
}

let checkerHandle: ReturnType<typeof setInterval> | null = null;

/** Starts the foreground checker (idempotent — calling this again is a
 * no-op if it's already running). Call once from a client component that
 * mounts as long as the app is open, e.g. near the root of page.tsx. */
export function startScheduler() {
	if (typeof window === "undefined" || checkerHandle) return;

	// Catch up on anything that came due while the app was closed, then
	// keep checking every minute.
	runDueSchedules().catch((err) => console.warn("Scheduler check failed:", err));
	checkerHandle = setInterval(() => {
		runDueSchedules().catch((err) => console.warn("Scheduler check failed:", err));
	}, CHECK_INTERVAL_MS);

	// Best-effort Periodic Background Sync registration — see file header.
	// `periodicSync` isn't in the standard lib.dom ServiceWorkerRegistration
	// type (it's a Chromium-only extension gated behind an installed-PWA +
	// permission check), so we extend the real type rather than reach for
	// `any`.
	type PeriodicSyncRegistration = ServiceWorkerRegistration & {
		periodicSync?: {
			register: (tag: string, options: { minInterval: number }) => Promise<void>;
		};
	};

	if ("serviceWorker" in navigator) {
		navigator.serviceWorker.ready
			.then(async (reg: PeriodicSyncRegistration) => {
				if (!reg.periodicSync) return;
				const status = await (navigator.permissions
					.query({ name: "periodic-background-sync" } as unknown as PermissionDescriptor) as Promise<PermissionStatus>)
					.catch(() => null);
				if (status && status.state === "granted") {
					await reg.periodicSync
						.register("optiqra-scan-check", { minInterval: 60 * 60 * 1000 })
						.catch(() => {});
				}
			})
			.catch(() => {});
	}
}

export function stopScheduler() {
	if (checkerHandle) {
		clearInterval(checkerHandle);
		checkerHandle = null;
	}
}
