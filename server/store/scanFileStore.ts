import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";

/**
 * Node-side counterpart to src/lib/scanStore.ts, same reasoning as
 * scheduleFileStore.ts: the browser UI keeps using IndexedDB untouched,
 * this is only for scans the sidecar daemon runs unattended.
 *
 * Each scan is its own JSON file (keyed by id) rather than one big file,
 * since full reports (especially site-mode crawls) can be sizeable and
 * schedules only need to read/write ONE scan at a time — no reason to
 * rewrite the whole history on every run.
 */

export type StoredScan = {
	id: string;
	url: string;
	mode: "single" | "site";
	createdAt: number;
	overallScore: number;
	data: unknown;
};

function scansDir(): string {
	const base = process.env.OPTIQRA_DATA_DIR ?? path.join(os.homedir(), ".optiqra");
	return path.join(base, "scans");
}

function scanFile(id: string): string {
	return path.join(scansDir(), `${id}.json`);
}

/** Small index file (id/url/mode/score/createdAt only) so listing recent
 *  scans doesn't require reading every full report off disk. Kept in sync
 *  by saveScan/deleteScan below. */
function indexFile(): string {
	return path.join(scansDir(), "_index.json");
}

type IndexEntry = Pick<StoredScan, "id" | "url" | "mode" | "createdAt" | "overallScore">;

async function readIndex(): Promise<IndexEntry[]> {
	try {
		const raw = await fs.readFile(indexFile(), "utf-8");
		const parsed = JSON.parse(raw);
		return Array.isArray(parsed) ? parsed : [];
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
		return [];
	}
}

async function writeIndex(entries: IndexEntry[]): Promise<void> {
	await fs.mkdir(scansDir(), { recursive: true });
	await fs.writeFile(indexFile(), JSON.stringify(entries, null, 2), "utf-8");
}

export async function saveScan(
	scan: Omit<StoredScan, "id" | "createdAt"> & { id?: string; createdAt?: number },
): Promise<StoredScan> {
	await fs.mkdir(scansDir(), { recursive: true });
	const record: StoredScan = {
		id: scan.id ?? crypto.randomUUID(),
		createdAt: scan.createdAt ?? Date.now(),
		url: scan.url,
		mode: scan.mode,
		overallScore: scan.overallScore,
		data: scan.data,
	};
	await fs.writeFile(scanFile(record.id), JSON.stringify(record), "utf-8");

	const index = await readIndex();
	const withoutThis = index.filter((e) => e.id !== record.id);
	withoutThis.push({
		id: record.id,
		url: record.url,
		mode: record.mode,
		createdAt: record.createdAt,
		overallScore: record.overallScore,
	});
	await writeIndex(withoutThis);

	return record;
}

export async function getAllScans(): Promise<StoredScan[]> {
	const index = await readIndex();
	const sorted = [...index].sort((a, b) => b.createdAt - a.createdAt);
	const full = await Promise.all(
		sorted.map(async (entry) => {
			try {
				const raw = await fs.readFile(scanFile(entry.id), "utf-8");
				return JSON.parse(raw) as StoredScan;
			} catch {
				return null;
			}
		}),
	);
	return full.filter((s): s is StoredScan => s !== null);
}

export async function getScan(id: string): Promise<StoredScan | undefined> {
	try {
		const raw = await fs.readFile(scanFile(id), "utf-8");
		return JSON.parse(raw) as StoredScan;
	} catch {
		return undefined;
	}
}

export async function deleteScan(id: string): Promise<void> {
	try {
		await fs.unlink(scanFile(id));
	} catch {
		// already gone — fine
	}
	const index = await readIndex();
	await writeIndex(index.filter((e) => e.id !== id));
}

export async function pruneScansOlderThan(retentionDays: number): Promise<number> {
	if (!retentionDays || retentionDays <= 0) return 0;
	const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
	const index = await readIndex();
	const stale = index.filter((e) => e.createdAt < cutoff);
	await Promise.all(stale.map((e) => deleteScan(e.id)));
	return stale.length;
}
