"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.saveScan = saveScan;
exports.getAllScans = getAllScans;
exports.getScan = getScan;
exports.deleteScan = deleteScan;
exports.pruneScansOlderThan = pruneScansOlderThan;
const node_fs_1 = require("node:fs");
const node_path_1 = __importDefault(require("node:path"));
const node_os_1 = __importDefault(require("node:os"));
const node_crypto_1 = __importDefault(require("node:crypto"));
function scansDir() {
    const base = process.env.OPTIQRA_DATA_DIR ?? node_path_1.default.join(node_os_1.default.homedir(), ".optiqra");
    return node_path_1.default.join(base, "scans");
}
function scanFile(id) {
    return node_path_1.default.join(scansDir(), `${id}.json`);
}
/** Small index file (id/url/mode/score/createdAt only) so listing recent
 *  scans doesn't require reading every full report off disk. Kept in sync
 *  by saveScan/deleteScan below. */
function indexFile() {
    return node_path_1.default.join(scansDir(), "_index.json");
}
async function readIndex() {
    try {
        const raw = await node_fs_1.promises.readFile(indexFile(), "utf-8");
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    }
    catch (err) {
        if (err.code === "ENOENT")
            return [];
        return [];
    }
}
async function writeIndex(entries) {
    await node_fs_1.promises.mkdir(scansDir(), { recursive: true });
    await node_fs_1.promises.writeFile(indexFile(), JSON.stringify(entries, null, 2), "utf-8");
}
async function saveScan(scan) {
    await node_fs_1.promises.mkdir(scansDir(), { recursive: true });
    const record = {
        id: scan.id ?? node_crypto_1.default.randomUUID(),
        createdAt: scan.createdAt ?? Date.now(),
        url: scan.url,
        mode: scan.mode,
        overallScore: scan.overallScore,
        data: scan.data,
    };
    await node_fs_1.promises.writeFile(scanFile(record.id), JSON.stringify(record), "utf-8");
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
async function getAllScans() {
    const index = await readIndex();
    const sorted = [...index].sort((a, b) => b.createdAt - a.createdAt);
    const full = await Promise.all(sorted.map(async (entry) => {
        try {
            const raw = await node_fs_1.promises.readFile(scanFile(entry.id), "utf-8");
            return JSON.parse(raw);
        }
        catch {
            return null;
        }
    }));
    return full.filter((s) => s !== null);
}
async function getScan(id) {
    try {
        const raw = await node_fs_1.promises.readFile(scanFile(id), "utf-8");
        return JSON.parse(raw);
    }
    catch {
        return undefined;
    }
}
async function deleteScan(id) {
    try {
        await node_fs_1.promises.unlink(scanFile(id));
    }
    catch {
        // already gone — fine
    }
    const index = await readIndex();
    await writeIndex(index.filter((e) => e.id !== id));
}
async function pruneScansOlderThan(retentionDays) {
    if (!retentionDays || retentionDays <= 0)
        return 0;
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    const index = await readIndex();
    const stale = index.filter((e) => e.createdAt < cutoff);
    await Promise.all(stale.map((e) => deleteScan(e.id)));
    return stale.length;
}
