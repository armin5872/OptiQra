"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startSchedulerDaemon = startSchedulerDaemon;
exports.stopSchedulerDaemon = stopSchedulerDaemon;
const node_notifier_1 = __importDefault(require("node-notifier"));
const scheduleFileStore_1 = require("./store/scheduleFileStore");
const scanFileStore_1 = require("./store/scanFileStore");
const scanCompare_1 = require("../src/lib/scanCompare");
const errorUtils_1 = require("../src/lib/errorUtils");
const ndjsonStream_1 = require("../src/lib/ndjsonStream");
const CHECK_INTERVAL_MS = 60 * 1000;
// Duplicated from scheduler.ts (calendar-aware next-run math) rather than
// imported, since that file also pulls in idb-backed scheduleStore.ts at
// module scope — importing it here would drag a browser-only dependency
// into the Node/pkg build. Keep in sync if the frequency options change.
function computeNextRun(frequency, from = Date.now()) {
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
function overallFromCategories(categories) {
    const keys = Object.keys(categories ?? {});
    if (!keys.length)
        return 0;
    const sum = keys.reduce((a, k) => a + (categories[k].score ?? 0), 0);
    return Math.round(sum / keys.length);
}
function notify(title, message) {
    // node-notifier shells out to the native notifier on each platform
    // (Notification Center on macOS, toast on Windows, notify-send on
    // Linux) — works regardless of whether the OptiQra window is open,
    // hidden, or the app is sitting in the tray.
    node_notifier_1.default.notify({ title, message, sound: false });
}
async function performScan(port, url, mode, maxPages) {
    const res = await fetch(`http://127.0.0.1:${port}/api/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mode === "site" ? { url, mode, maxPages } : { url, mode }),
    });
    const contentType = res.headers.get("Content-Type") ?? "";
    if (!contentType.includes("ndjson")) {
        const data = (await res.json());
        if (!res.ok)
            throw new Error(data.error || "Scheduled scan failed.");
        return data;
    }
    if (!res.ok || !res.body) {
        let message = "Scheduled scan failed.";
        try {
            const errJson = (await res.json());
            message = errJson.error || message;
        }
        catch {
            // not JSON — keep default message
        }
        throw new Error(message);
    }
    for await (const evt of (0, ndjsonStream_1.readNDJSONStream)(res.body)) {
        if (evt.type === "done")
            return evt.data;
        if (evt.type === "aborted")
            throw new Error("Scan was interrupted.");
        if (evt.type === "error")
            throw new Error(evt.message || "Scheduled scan failed.");
    }
    throw new Error("Scan stream ended without a result.");
}
const runningIds = new Set();
async function runSchedule(port, schedule) {
    if (runningIds.has(schedule.id))
        return;
    runningIds.add(schedule.id);
    try {
        const priorScans = await (0, scanFileStore_1.getAllScans)();
        const previous = schedule.compareWithPrevious
            ? priorScans.find((s) => s.url === schedule.url && s.mode === schedule.mode)
            : undefined;
        const data = await performScan(port, schedule.url, schedule.mode, schedule.maxPages);
        const overallScore = overallFromCategories(data.categories);
        const stored = await (0, scanFileStore_1.saveScan)({
            url: schedule.url,
            mode: schedule.mode,
            overallScore,
            data,
        });
        let summary = `Scored ${overallScore}/100.`;
        let comparisonFields = {};
        if (previous) {
            const cmp = (0, scanCompare_1.compareScans)(previous.data, data);
            summary = (0, scanCompare_1.summarizeComparison)(cmp);
            comparisonFields = {
                previousScore: cmp.previousOverall,
                scoreDelta: cmp.overallDelta,
                newIssueCount: cmp.newIssues.length,
                resolvedIssueCount: cmp.resolvedIssues.length,
            };
        }
        const now = Date.now();
        await (0, scheduleFileStore_1.updateSchedule)(schedule.id, {
            lastRunAt: now,
            nextRunAt: computeNextRun(schedule.frequency, now),
            lastScanId: stored.id,
            lastResult: { ranAt: now, scanId: stored.id, overallScore, ok: true, ...comparisonFields },
        });
        if (schedule.notify) {
            notify(`Scan finished: ${schedule.url}`, summary);
        }
    }
    catch (err) {
        const now = Date.now();
        await (0, scheduleFileStore_1.updateSchedule)(schedule.id, {
            lastRunAt: now,
            nextRunAt: computeNextRun(schedule.frequency, now),
            lastResult: {
                ranAt: now,
                scanId: schedule.lastScanId ?? "",
                overallScore: schedule.lastResult?.overallScore ?? 0,
                ok: false,
                error: (0, errorUtils_1.getErrorMessage)(err, "Scheduled scan failed."),
            },
        });
        if (schedule.notify) {
            notify(`Scheduled scan failed: ${schedule.url}`, (0, errorUtils_1.getErrorMessage)(err, "Something went wrong running that scan."));
        }
    }
    finally {
        runningIds.delete(schedule.id);
    }
}
async function runDueSchedules(port) {
    const schedules = await (0, scheduleFileStore_1.getAllSchedules)();
    const now = Date.now();
    const due = schedules.filter((s) => s.enabled && s.nextRunAt <= now);
    for (const schedule of due) {
        await runSchedule(port, schedule);
    }
}
let intervalHandle = null;
/** Starts the always-on checker. Call once, after the Next server in this
 *  same process is confirmed listening (see server/index.ts). */
function startSchedulerDaemon(port) {
    if (intervalHandle)
        return; // already running — don't double-schedule
    console.log(`[scheduler-daemon] watching schedules every ${CHECK_INTERVAL_MS / 1000}s`);
    runDueSchedules(port).catch((err) => console.error("[scheduler-daemon] initial check failed:", err));
    intervalHandle = setInterval(() => {
        runDueSchedules(port).catch((err) => console.error("[scheduler-daemon] check failed:", err));
    }, CHECK_INTERVAL_MS);
}
function stopSchedulerDaemon() {
    if (intervalHandle)
        clearInterval(intervalHandle);
    intervalHandle = null;
}
