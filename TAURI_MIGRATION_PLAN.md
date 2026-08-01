# OptiQra desktop migration — phased plan

## Phase 0 (done in this pass)
- `src-tauri/` scaffold: window, tray icon, single-instance lock,
  hide-on-close (so closing the window doesn't kill the scheduler),
  sidecar spawning, updater plugin wired to GitHub Releases.
- `server/README.md`: exact steps to package the existing Next.js
  standalone build as the sidecar binary.
- `src/app/components/DesktopAppBanner.tsx`: dismissible banner for the
  web app promoting the desktop download.

## Phase 1 — make the sidecar buildable
- Add `@yao-pkg/pkg` packaging step to CI (see server/README.md).
- Generate real tray/app icons (`src-tauri/icons/` currently empty —
  `tauri icon path/to/1024x1024.png` generates the full set).
- Generate an updater signing keypair (`tauri signer generate`) and put
  the public key into `tauri.conf.json`'s `updater.pubkey` (placeholder
  there now), private key into CI secrets.

## Phase 2 — the actual scheduler fix (the point of this whole project)
**Implemented**, in `server/`:
- `server/store/scheduleFileStore.ts` / `scanFileStore.ts` — file-backed
  stores the daemon uses, separate from the browser's IndexedDB stores.
- `server/scheduler-daemon.ts` — the checker loop, ported from
  `src/lib/scheduler.ts`, running server-side for the sidecar's whole
  lifetime instead of a tab's.
- `server/index.ts` — boots the Next standalone server, then the daemon,
  in one process.
- Notifications go through `node-notifier` (real OS notification)
  instead of the browser Notification API.

**Also implemented** — the schedule/scan sync between IndexedDB and the
daemon's file store (`src-tauri/src/commands.rs`,
`src/lib/desktopBridge.ts`, small additions to `scheduleStore.ts`/
`scanStore.ts`). See "Schedule/scan sync" in `server/README.md` for
exactly what changed. Phase 2 is functionally complete; the Rust side
hasn't been run through `cargo build` yet (no Rust toolchain available
while writing this) so treat first build as the real test.

## Phase 3 — offline UX
- Nothing to build for project-upload audits — once Phase 1 is live
  they already run against the local sidecar, no network required.
- Add an online/offline indicator (`navigator.onLine` + a ping to the
  sidecar) and disable/gray out the panels that inherently need the
  network: live-site crawling, PageSpeed Insights, AI provider calls.

## Phase 4 — distribution
- Repo: `optiqra-desktop` (this scaffold + the app source, or a git
  submodule/subtree pointing at the existing `OptiQra` repo — avoid a
  fully separate copy of `src/`, it will drift).
- Releases: GitHub Releases on `optiqra-desktop`, using
  `tauri-action` (official GitHub Action) to build all three platforms
  and upload installers + `latest.json` automatically on tag push.
- Landing page: separate route or repo, links its download button
  straight at `.../releases/latest/download/OptiQra_<version>_<platform>.<ext>`.

## What's intentionally NOT done yet
- No actual Rust rewriting of `htmlAudit.ts` / `link-analyzer.ts` /
  `autoFixEngine.ts` — they stay TypeScript and run inside the sidecar.
  This is the right call for a 30+ route, jsdom/cheerio/jszip-heavy
  backend; a Rust port would be months of work for no user-facing
  benefit.
- No landing page yet — say the word and that's next.
