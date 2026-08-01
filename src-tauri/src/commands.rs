// Commands invoked from the frontend (via @tauri-apps/api's `invoke`) to
// bridge the two stores described in server/README.md's "one real gap
// left": ScheduleManager.tsx writes schedules to IndexedDB (browser-only,
// unreachable from the sidecar's Node process), while
// server/store/scheduleFileStore.ts is what the always-running daemon
// actually checks. These commands are the sync path between them, and
// they read/write the SAME file layout scheduleFileStore.ts /
// scanFileStore.ts use, at the SAME directory (OPTIQRA_DATA_DIR, set on
// the sidecar's env in main.rs and mirrored here via app_data_dir()) —
// so either side can read what the other wrote.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

fn data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("couldn't resolve app data dir: {e}"))?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn schedules_file(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(data_dir(app)?.join("schedules.json"))
}

fn read_schedules(app: &AppHandle) -> Result<Vec<Value>, String> {
    let path = schedules_file(app)?;
    if !path.exists() {
        return Ok(Vec::new());
    }
    let raw = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&raw).map_err(|e| e.to_string())
}

fn write_schedules(app: &AppHandle, schedules: &[Value]) -> Result<(), String> {
    let path = schedules_file(app)?;
    // Same crash-safety approach as scheduleFileStore.ts's writeAll: write
    // to a temp file, then rename, so a mid-write kill (force-quit from
    // the tray) can't leave schedules.json truncated.
    let tmp = path.with_extension("json.tmp");
    let body = serde_json::to_string_pretty(schedules).map_err(|e| e.to_string())?;
    fs::write(&tmp, body).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &path).map_err(|e| e.to_string())
}

/// Upserts one schedule (by `id`) into the file store the daemon reads.
/// Called from src/lib/scheduleStore.ts after every IndexedDB write —
/// see that file for the fire-and-forget call site.
#[tauri::command]
pub fn sync_schedule(app: AppHandle, schedule: Value) -> Result<(), String> {
    let id = schedule
        .get("id")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "schedule is missing an id".to_string())?
        .to_string();

    let mut all = read_schedules(&app)?;
    match all.iter_mut().find(|s| s.get("id").and_then(|v| v.as_str()) == Some(id.as_str())) {
        Some(existing) => *existing = schedule,
        None => all.push(schedule),
    }
    write_schedules(&app, &all)
}

/// Removes one schedule from the file store. Called from
/// src/lib/scheduleStore.ts's deleteSchedule().
#[tauri::command]
pub fn delete_synced_schedule(app: AppHandle, id: String) -> Result<(), String> {
    let all = read_schedules(&app)?;
    let filtered: Vec<Value> = all
        .into_iter()
        .filter(|s| s.get("id").and_then(|v| v.as_str()) != Some(id.as_str()))
        .collect();
    write_schedules(&app, &filtered)
}

#[derive(Serialize, Deserialize)]
pub struct ScanIndexEntry {
    id: String,
    url: String,
    mode: String,
    #[serde(rename = "createdAt")]
    created_at: i64,
    #[serde(rename = "overallScore")]
    overall_score: i64,
}

/// Lists scans the daemon has saved (scanFileStore.ts's index file) so
/// the UI can figure out which ones it doesn't have in IndexedDB yet —
/// e.g. scans a schedule ran while the window was closed.
#[tauri::command]
pub fn list_synced_scans(app: AppHandle) -> Result<Vec<ScanIndexEntry>, String> {
    let path = data_dir(&app)?.join("scans").join("_index.json");
    if !path.exists() {
        return Ok(Vec::new());
    }
    let raw = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&raw).map_err(|e| e.to_string())
}

/// Returns one full scan report (raw JSON) by id, for the entries
/// list_synced_scans() said are missing from IndexedDB.
#[tauri::command]
pub fn read_synced_scan(app: AppHandle, id: String) -> Result<Value, String> {
    let path = data_dir(&app)?.join("scans").join(format!("{id}.json"));
    let raw = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&raw).map_err(|e| e.to_string())
}
