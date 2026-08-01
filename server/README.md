# optiqra-server (Tauri sidecar)

The executable `src-tauri/src/main.rs` spawns as a background process.
Two jobs, one process: serve the app (same Next.js code as the Vercel
deployment, unmodified) and run schedules for the app's whole lifetime,
independent of whether the window is open — that's the actual feature
being built here.

## Pieces

- **`index.ts`** — entrypoint. Requires the Next standalone `server.js`
  (starts it listening), waits for `/api/health` to respond, then starts
  the scheduler daemon.
- **`scheduler-daemon.ts`** — the checker loop. Logic mirrors
  `src/lib/scheduler.ts`'s `runDueSchedules`/`runSchedule` (same
  `computeNextRun`, same compare-with-previous, same notify decision) so
  a schedule behaves the same whether a tab or this daemon catches it.
  What's different: it reads/writes the file stores below instead of
  IndexedDB, calls `/api/analyze` over `http://127.0.0.1:<port>` instead
  of a same-origin `fetch`, and notifies via `node-notifier` (real OS
  notification, works whether or not any window is visible) instead of
  the browser Notification API.
- **`store/scheduleFileStore.ts`**, **`store/scanFileStore.ts`** — Node
  file-backed replacements for `scheduleStore.ts`/`scanStore.ts`, used
  only here. **The browser UI's stores are untouched** — schedule
  creation/editing in `ScheduleManager.tsx` still writes to IndexedDB,
  exactly as before. The daemon reads a separate copy under
  `~/.optiqra/` (or `%APPDATA%\optiqra` on Windows, wherever
  `os.homedir()` resolves).
- **`scripts/package-sidecar.js`** — bundles the compiled daemon +
  `.next/standalone` into the sidecar binary `main.rs` expects.

## Schedule/scan sync (browser IndexedDB ↔ daemon file store)

Closed via `src-tauri/src/commands.rs` + `src/lib/desktopBridge.ts`:

- `scheduleStore.ts`'s `saveSchedule`/`updateSchedule`/`deleteSchedule`
  now also mirror the write into the daemon's file store via a Tauri
  command (`sync_schedule` / `delete_synced_schedule`), fire-and-forget,
  right after the IndexedDB write succeeds. Works for every existing
  caller (`ScheduleManager.tsx`, `scheduler.ts`, the service worker)
  without touching those call sites.
- `scanStore.ts`'s `getAllScans()` does a one-time-per-session merge:
  asks Rust (`list_synced_scans`) what the daemon has saved, and for any
  scan not already in IndexedDB, pulls the full report
  (`read_synced_scan`) and stores it. So a scan the daemon ran while the
  window was closed shows up in "recent scans" the next time the app is
  opened.
- `main.rs` resolves the app's data dir once via `app.path().app_data_dir()`
  and passes it to the sidecar as `OPTIQRA_DATA_DIR` — that's what makes
  Rust's file writes (from commands.rs) and the sidecar's Node file writes
  (scheduleFileStore.ts/scanFileStore.ts) land in the exact same files
  instead of two different OS-default locations.
- Everything here is a no-op on the web deployment —
  `desktopBridge.ts`'s `isDesktop()` gates on the `__TAURI_INTERNALS__`
  global that only exists inside a Tauri webview.

**Not yet done, worth knowing about:** none of the Rust in `commands.rs`
has been run through `cargo build` (no Rust toolchain in the environment
this was written in) — it's been reviewed carefully for the obvious
things (borrow checker shape, trait imports, Cargo.toml deps match what's
used) but treat the first `cargo build`/`tauri dev` as the real
verification step, the same as you would for any code you haven't run
yet.

## Build steps (per platform, in CI)

```
DOCKER_BUILD=1 next build      # produces .next/standalone (already configured in next.config.ts)
npm run desktop:compile        # tsc -p server/tsconfig.json -> dist-server/
npm run desktop:package        # bundles into src-tauri/binaries/optiqra-server-<target-triple>
tauri build                    # builds the Rust shell, embeds the sidecar, produces installers
```

`npm run desktop:build` runs all four in order. This has to run natively
per OS (macOS/Windows/Linux runners) — `@yao-pkg/pkg` doesn't reliably
cross-compile a working native binary for other platforms from one
machine, so CI needs a matrix build the same way `tauri-action` already
sets up for the Rust half.

## Local dev without packaging anything

```
next dev -p 4173      # in one terminal
tauri dev              # in another — devUrl in tauri.conf.json already points at :4173
```

The scheduler daemon doesn't run in this mode (it's part of the packaged
sidecar, not `next dev`) — for local testing, run the daemon's logic
directly against a scratch `OPTIQRA_DATA_DIR`, e.g. write a schedule by
hand into `$OPTIQRA_DATA_DIR/schedules.json` with a past `nextRunAt` and
confirm it gets picked up and executed.
