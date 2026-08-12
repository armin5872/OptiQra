import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

/**
 * Node-side counterpart to src/lib/scheduleStore.ts. That file is
 * IndexedDB-backed and stays exactly as-is for the browser UI (schedule
 * creation/editing still happens through the React app, same as today).
 *
 * This file is what the ALWAYS-RUNNING sidecar process (server/index.ts)
 * reads from, since IndexedDB doesn't exist outside a browser/worker
 * context. It's a plain JSON file rather than SQLite — schedule counts
 * here are small (tens, not millions), so a full DB engine buys nothing
 * and a JSON file is trivial to inspect/back up by hand.
 *
 * Types are duplicated from scheduleStore.ts rather than imported, since
 * that file is only ever bundled for the browser and importing it here
 * would pull `idb` into the Node/pkg build for no reason. Keep the two
 * shapes in sync if either changes.
 */

export type ScanFrequency = "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "custom";

export type ScheduleRunResult = {
	ranAt: number;
	scanId: string;
	overallScore: number;
	previousScore?: number;
	scoreDelta?: number;
	newIssueCount?: number;
	resolvedIssueCount?: number;
	ok: boolean;
	error?: string;
	trendDirection?: "up" | "down" | "flat";
	predictedScore14d?: number;
	chronicIssueCount?: number;
	suggestedFrequency?: ScanFrequency;
	suggestedFrequencyReason?: string;
};

export type ScanSchedule = {
	id: string;
	url: string;
	mode: "single" | "site";
	maxPages?: number;
	frequency: ScanFrequency;
	compareWithPrevious: boolean;
	notify: boolean;
	enabled: boolean;
	createdAt: number;
	nextRunAt: number;
	lastRunAt?: number;
	lastScanId?: string;
	lastResult?: ScheduleRunResult;
	predictiveAlerts?: boolean;
	customIntervalMinutes?: number;
	timeOfDay?: string;
	daysOfWeek?: number[];
};

function dataDir(): string {
	// Respects an override (useful for `tauri dev` pointing at a scratch
	// dir) but defaults to a normal per-OS app-data location so the file
	// survives updates and doesn't clutter the install directory.
	if (process.env.OPTIQRA_DATA_DIR) return process.env.OPTIQRA_DATA_DIR;
	return path.join(os.homedir(), ".optiqra");
}

function schedulesFile(): string {
	return path.join(dataDir(), "schedules.json");
}

async function readAll(): Promise<ScanSchedule[]> {
	try {
		const raw = await fs.readFile(schedulesFile(), "utf-8");
		const parsed = JSON.parse(raw);
		return Array.isArray(parsed) ? parsed : [];
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
		console.warn("[scheduleFileStore] couldn't read schedules.json, starting empty:", err);
		return [];
	}
}

async function writeAll(schedules: ScanSchedule[]): Promise<void> {
	await fs.mkdir(dataDir(), { recursive: true });
	// Write to a temp file then rename — avoids truncating the real file
	// to zero bytes if the process is killed mid-write (e.g. force-quit
	// from the tray while a save is in flight).
	const tmp = `${schedulesFile()}.tmp-${process.pid}`;
	await fs.writeFile(tmp, JSON.stringify(schedules, null, 2), "utf-8");
	await fs.rename(tmp, schedulesFile());
}

export async function getAllSchedules(): Promise<ScanSchedule[]> {
	const all = await readAll();
	return [...all].sort((a, b) => a.nextRunAt - b.nextRunAt);
}

export async function getSchedule(id: string): Promise<ScanSchedule | undefined> {
	const all = await readAll();
	return all.find((s) => s.id === id);
}

export async function saveSchedule(schedule: ScanSchedule): Promise<ScanSchedule> {
	const all = await readAll();
	const idx = all.findIndex((s) => s.id === schedule.id);
	if (idx >= 0) all[idx] = schedule;
	else all.push(schedule);
	await writeAll(all);
	return schedule;
}

export async function updateSchedule(
	id: string,
	patch: Partial<ScanSchedule>,
): Promise<ScanSchedule | undefined> {
	const all = await readAll();
	const idx = all.findIndex((s) => s.id === id);
	if (idx < 0) return undefined;
	const updated = { ...all[idx], ...patch };
	all[idx] = updated;
	await writeAll(all);
	return updated;
}

export async function deleteSchedule(id: string): Promise<void> {
	const all = await readAll();
	await writeAll(all.filter((s) => s.id !== id));
}
