"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAllSchedules = getAllSchedules;
exports.getSchedule = getSchedule;
exports.saveSchedule = saveSchedule;
exports.updateSchedule = updateSchedule;
exports.deleteSchedule = deleteSchedule;
const node_fs_1 = require("node:fs");
const node_path_1 = __importDefault(require("node:path"));
const node_os_1 = __importDefault(require("node:os"));
function dataDir() {
    // Respects an override (useful for `tauri dev` pointing at a scratch
    // dir) but defaults to a normal per-OS app-data location so the file
    // survives updates and doesn't clutter the install directory.
    if (process.env.OPTIQRA_DATA_DIR)
        return process.env.OPTIQRA_DATA_DIR;
    return node_path_1.default.join(node_os_1.default.homedir(), ".optiqra");
}
function schedulesFile() {
    return node_path_1.default.join(dataDir(), "schedules.json");
}
async function readAll() {
    try {
        const raw = await node_fs_1.promises.readFile(schedulesFile(), "utf-8");
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    }
    catch (err) {
        if (err.code === "ENOENT")
            return [];
        console.warn("[scheduleFileStore] couldn't read schedules.json, starting empty:", err);
        return [];
    }
}
async function writeAll(schedules) {
    await node_fs_1.promises.mkdir(dataDir(), { recursive: true });
    // Write to a temp file then rename — avoids truncating the real file
    // to zero bytes if the process is killed mid-write (e.g. force-quit
    // from the tray while a save is in flight).
    const tmp = `${schedulesFile()}.tmp-${process.pid}`;
    await node_fs_1.promises.writeFile(tmp, JSON.stringify(schedules, null, 2), "utf-8");
    await node_fs_1.promises.rename(tmp, schedulesFile());
}
async function getAllSchedules() {
    const all = await readAll();
    return [...all].sort((a, b) => a.nextRunAt - b.nextRunAt);
}
async function getSchedule(id) {
    const all = await readAll();
    return all.find((s) => s.id === id);
}
async function saveSchedule(schedule) {
    const all = await readAll();
    const idx = all.findIndex((s) => s.id === schedule.id);
    if (idx >= 0)
        all[idx] = schedule;
    else
        all.push(schedule);
    await writeAll(all);
    return schedule;
}
async function updateSchedule(id, patch) {
    const all = await readAll();
    const idx = all.findIndex((s) => s.id === id);
    if (idx < 0)
        return undefined;
    const updated = { ...all[idx], ...patch };
    all[idx] = updated;
    await writeAll(all);
    return updated;
}
async function deleteSchedule(id) {
    const all = await readAll();
    await writeAll(all.filter((s) => s.id !== id));
}
