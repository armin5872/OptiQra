/**
 * This is the actual fix for the thing scheduler.ts is upfront about not
 * doing: "scans fire while your browser is fully closed." That file's
 * checker only runs inside a tab. This daemon runs inside the sidecar
 * process that src-tauri/src/main.rs spawns, which keeps going after the
 * window is hidden (see main.rs's on_window_event) — so it's the one
 * piece that needed real behavioral changes, not just a wrapper.
 *
 * Logic is intentionally kept parallel to runSchedule()/runDueSchedules()
 * in src/lib/scheduler.ts (same fields, same computeNextRun, same
 * compare/notify decisions) so schedules created in the UI behave
 * identically whether they're checked by a tab or by this daemon. The
 * only things that differ are the storage layer (file store instead of
 * IndexedDB) and how the scan itself gets kicked off (HTTP call to the
 * sidecar's own Next server instead of a same-origin fetch from a tab)
 * and how the user gets told about it (OS notification via
 * `node-notifier` instead of the browser Notification API, since there's
 * no window guaranteed to be open).
 */

import notifier from "node-notifier";
import {
	getAllSchedules,
	updateSchedule,
	type ScanSchedule,
	type ScheduleRunResult,
} from "./store/scheduleFileStore";
import { getAllScans, saveScan } from "./store/scanFileStore";
import { compareScans, summarizeComparison } from "../src/lib/scanCompare";
import { computeScoreTrend, findChronicIssues, suggestFrequency, type TrendPoint } from "../src/lib/scanTrends";
import { getErrorMessage } from "../src/lib/errorUtils";
import { readNDJSONStream } from "../src/lib/ndjsonStream";

const CHECK_INTERVAL_MS = 60 * 1000;

// Mirrors the Category shape scanCompare.ts's ReportLike expects (and
// which reportAggregate.ts's real Category also satisfies) — duplicated
// rather than imported from reportAggregate.ts on purpose. That file
// type-imports from htmlAudit.ts/stackDetector.ts, and pulling those into
// this isolated server/tsconfig.json program (no DOM lib, no Next.js
// ambient `fetch` extensions) surfaces unrelated pre-existing type errors
// that have nothing to do with the daemon.
type Category = { label: string; score: number; issues: { id: string; title: string; severity: "critical" | "high" | "medium" | "low" | "informational" | "good"; weight: number }[] };

type ScanReportData = {
	url: string;
	mode?: "single" | "site";
	categories: Record<string, Category>;
	[key: string]: unknown;
};

type ScanStreamEvent =
	| { type: "status"; message?: string }
	| { type: "progress" }
	| { type: "linkProgress" }
	| { type: "done"; data: ScanReportData }
	| { type: "aborted" }
	| { type: "error"; message?: string };

// Duplicated from scheduler.ts (calendar-aware next-run math, now
// including custom-interval/time-of-day/days-of-week support) rather than
// imported, since that file also pulls in idb-backed scheduleStore.ts at
// module scope — importing it here would drag a browser-only dependency
// into the Node/pkg build. Keep in sync if this logic changes.
function withTimeOfDay(date: Date, timeOfDay: string): Date {
	const [h, m] = timeOfDay.split(":").map((n) => parseInt(n, 10));
	const d = new Date(date);
	if (!Number.isNaN(h) && !Number.isNaN(m)) d.setHours(h, m, 0, 0);
	return d;
}

function nextAnchoredRun(from: Date, timeOfDay: string, stepDays: number, daysOfWeek?: number[]): number {
	let candidate = withTimeOfDay(from, timeOfDay);
	if (daysOfWeek && daysOfWeek.length > 0) {
		for (let i = 0; i < 8; i++) {
			if (candidate.getTime() > from.getTime() && daysOfWeek.includes(candidate.getDay())) {
				return candidate.getTime();
			}
			candidate = withTimeOfDay(new Date(candidate.getTime() + 24 * 60 * 60 * 1000), timeOfDay);
		}
		return candidate.getTime();
	}
	if (candidate.getTime() <= from.getTime()) {
		candidate = new Date(candidate.getTime() + stepDays * 24 * 60 * 60 * 1000);
	}
	return candidate.getTime();
}

const CUSTOM_INTERVAL_MIN_MINUTES = 5;

function computeNextRun(schedule: Pick<ScanSchedule, "frequency" | "customIntervalMinutes" | "timeOfDay" | "daysOfWeek">, from = Date.now()): number {
	const { frequency, timeOfDay, daysOfWeek, customIntervalMinutes } = schedule;
	const d = new Date(from);

	if (frequency === "custom") {
		const minutes = Math.max(CUSTOM_INTERVAL_MIN_MINUTES, customIntervalMinutes ?? 60);
		if (timeOfDay && minutes >= 24 * 60) {
			return nextAnchoredRun(d, timeOfDay, Math.round(minutes / (24 * 60)), daysOfWeek);
		}
		return from + minutes * 60 * 1000;
	}

	if (frequency === "hourly") return from + 60 * 60 * 1000;

	if (timeOfDay && (frequency === "daily" || frequency === "weekly")) {
		return nextAnchoredRun(d, timeOfDay, frequency === "weekly" ? 7 : 1, daysOfWeek);
	}
	if (timeOfDay && frequency === "monthly") {
		const next = withTimeOfDay(d, timeOfDay);
		if (next.getTime() <= from) next.setMonth(next.getMonth() + 1);
		return next.getTime();
	}
	if (timeOfDay && frequency === "yearly") {
		const next = withTimeOfDay(d, timeOfDay);
		if (next.getTime() <= from) next.setFullYear(next.getFullYear() + 1);
		return next.getTime();
	}

	switch (frequency) {
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

function overallFromCategories(categories: Record<string, Category>): number {
	const keys = Object.keys(categories ?? {});
	if (!keys.length) return 0;
	const sum = keys.reduce((a, k) => a + (categories[k].score ?? 0), 0);
	return Math.round(sum / keys.length);
}

function notify(title: string, message: string) {
	// node-notifier shells out to the native notifier on each platform
	// (Notification Center on macOS, toast on Windows, notify-send on
	// Linux) — works regardless of whether the OptiQra window is open,
	// hidden, or the app is sitting in the tray.
	notifier.notify({ title, message, sound: false });
}

async function performScan(
	port: number,
	url: string,
	mode: "single" | "site",
	maxPages?: number,
): Promise<ScanReportData> {
	const res = await fetch(`http://127.0.0.1:${port}/api/analyze`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(mode === "site" ? { url, mode, maxPages } : { url, mode }),
	});

	const contentType = res.headers.get("Content-Type") ?? "";

	if (!contentType.includes("ndjson")) {
		const data = (await res.json()) as ScanReportData & { error?: string };
		if (!res.ok) throw new Error(data.error || "Scheduled scan failed.");
		return data;
	}

	if (!res.ok || !res.body) {
		let message = "Scheduled scan failed.";
		try {
			const errJson = (await res.json()) as { error?: string };
			message = errJson.error || message;
		} catch {
			// not JSON — keep default message
		}
		throw new Error(message);
	}

	for await (const evt of readNDJSONStream<ScanStreamEvent>(res.body)) {
		if (evt.type === "done") return evt.data;
		if (evt.type === "aborted") throw new Error("Scan was interrupted.");
		if (evt.type === "error") throw new Error(evt.message || "Scheduled scan failed.");
	}

	throw new Error("Scan stream ended without a result.");
}

const runningIds = new Set<string>();

async function runSchedule(port: number, schedule: ScanSchedule) {
	if (runningIds.has(schedule.id)) return;
	runningIds.add(schedule.id);

	try {
		const priorScans = await getAllScans();
		const previous = schedule.compareWithPrevious
			? priorScans.find((s) => s.url === schedule.url && s.mode === schedule.mode)
			: undefined;

		// All prior scans for this exact url+mode, oldest first — used for
		// trend/predictive analysis below. Independent of compareWithPrevious
		// (that toggle is about the per-run diff summary; trend/chronic-issue
		// detection is its own opt-in via schedule.predictiveAlerts).
		const sameTarget = priorScans
			.filter((s) => s.url === schedule.url && s.mode === schedule.mode)
			.sort((a, b) => a.createdAt - b.createdAt);

		const data = await performScan(port, schedule.url, schedule.mode, schedule.maxPages);
		const overallScore = overallFromCategories(data.categories);

		const stored = await saveScan({
			url: schedule.url,
			mode: schedule.mode,
			overallScore,
			data,
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

		// --- Predictive scan: trend + recurring-issue detection ---
		// Runs regardless of predictiveAlerts (it's cheap, pure in-memory
		// math over data we already have) — the toggle only controls
		// whether it also fires a separate heads-up notification below.
		// Trend fields still get stored either way so the UI can show a
		// "trending down" badge even for schedules that don't want alerts.
		const trendHistory: TrendPoint[] = [
			...sameTarget.map((s) => ({ at: s.createdAt, overallScore: s.overallScore })),
			{ at: stored.createdAt, overallScore },
		];
		const trend = computeScoreTrend(trendHistory);

		const recentReportsNewestFirst = [data, ...sameTarget.slice(-5).reverse().map((s) => s.data)] as Record<
			string,
			Category
		>[];
		const chronicIssues = findChronicIssues(recentReportsNewestFirst);

		const predictiveFields: Partial<ScheduleRunResult> = trend
			? {
					trendDirection: trend.direction,
					predictedScore14d: trend.predicted14d,
					chronicIssueCount: chronicIssues.length,
				}
			: {};
		const freqSuggestion = suggestFrequency(schedule.frequency, trend);
		if (freqSuggestion) {
			predictiveFields.suggestedFrequency = freqSuggestion.suggestion;
			predictiveFields.suggestedFrequencyReason = freqSuggestion.reason;
		}

		const now = Date.now();
		await updateSchedule(schedule.id, {
			lastRunAt: now,
			nextRunAt: computeNextRun(schedule, now),
			lastScanId: stored.id,
			lastResult: { ranAt: now, scanId: stored.id, overallScore, ok: true, ...comparisonFields, ...predictiveFields },
		});

		if (schedule.notify) {
			notify(`Scan finished: ${schedule.url}`, summary);
		}

		// A second, distinct notification for the thing a plain "scan
		// finished" summary won't say on its own: not "here's what changed
		// this run" but "here's where this is headed if nothing changes."
		// Kept separate rather than merged into `summary` so it doesn't fire
		// (or get read) every single run — only when there's actually
		// something worth a heads-up.
		if (schedule.notify && schedule.predictiveAlerts && trend) {
			const droppingBelow60 = trend.direction === "down" && trend.predicted14d < 60 && overallScore >= 60;
			const chronicWorthFlagging = chronicIssues.some((c) => c.severity === "critical" || c.severity === "high");
			if (droppingBelow60) {
				notify(
					`Heads up: ${schedule.url} is trending down`,
					`Projected around ${trend.predicted14d}/100 within two weeks if this keeps up.`,
				);
			} else if (chronicWorthFlagging) {
				const worst = chronicIssues.find((c) => c.severity === "critical" || c.severity === "high")!;
				notify(
					`Recurring issue on ${schedule.url}`,
					`"${worst.title}" has now shown up unresolved in ${worst.streak} scans in a row.`,
				);
			}
		}
	} catch (err: unknown) {
		const now = Date.now();
		await updateSchedule(schedule.id, {
			lastRunAt: now,
			nextRunAt: computeNextRun(schedule, now),
			lastResult: {
				ranAt: now,
				scanId: schedule.lastScanId ?? "",
				overallScore: schedule.lastResult?.overallScore ?? 0,
				ok: false,
				error: getErrorMessage(err, "Scheduled scan failed."),
			},
		});
		if (schedule.notify) {
			notify(
				`Scheduled scan failed: ${schedule.url}`,
				getErrorMessage(err, "Something went wrong running that scan."),
			);
		}
	} finally {
		runningIds.delete(schedule.id);
	}
}

async function runDueSchedules(port: number) {
	const schedules = await getAllSchedules();
	const now = Date.now();
	const due = schedules.filter((s) => s.enabled && s.nextRunAt <= now);
	for (const schedule of due) {
		await runSchedule(port, schedule);
	}
}

let intervalHandle: ReturnType<typeof setInterval> | null = null;

/** Starts the always-on checker. Call once, after the Next server in this
 *  same process is confirmed listening (see server/index.ts). */
export function startSchedulerDaemon(port: number) {
	if (intervalHandle) return; // already running — don't double-schedule
	console.log(`[scheduler-daemon] watching schedules every ${CHECK_INTERVAL_MS / 1000}s`);
	runDueSchedules(port).catch((err) => console.error("[scheduler-daemon] initial check failed:", err));
	intervalHandle = setInterval(() => {
		runDueSchedules(port).catch((err) => console.error("[scheduler-daemon] check failed:", err));
	}, CHECK_INTERVAL_MS);
}

export function stopSchedulerDaemon() {
	if (intervalHandle) clearInterval(intervalHandle);
	intervalHandle = null;
}
