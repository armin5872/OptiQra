# PWA setup notes

OptiQra now has:

- **next-pwa** — generates a service worker at build time (`next build`) that precaches the app shell and adds runtime caching (see `next.config.ts`):
  - Next static JS/CSS chunks, icons/images → cache-first
  - Google Fonts → cache-first / stale-while-revalidate
  - `/api/*` → network-only (scans always hit the server live)
  - Everything else (pages) → network-first with a 10s timeout, falling back to cache, then to `public/offline.html`
- **idb** (`src/lib/scanStore.ts`) — every completed scan (single-page or full-site) is saved in full to an IndexedDB database (`optiqra-scans`), so past reports are viewable offline and survive reloads. A "Recent scans" list on the home screen reads from here.
- **idb** (`src/lib/scheduleStore.ts`) — periodic scan schedules (frequency, compare-with-previous, notify) live in a second IndexedDB database (`optiqra-schedules`). `src/lib/scheduler.ts` polls it once a minute (while a tab is open) and runs whatever's due — see the "Periodic scans" section in README.md for the full picture, including what it can't do (fire while the browser is fully closed).
- **Cookies** (`src/lib/scanCookies.ts`) — a lightweight pointer to your scan history (id, url, mode, score, timestamp — not the full report) is also written to a cookie, capped at the last 10 scans (~1KB), since cookies are readable synchronously and server-side, unlike IndexedDB.
- **Custom service worker code** (`worker/index.ts`) — next-pwa's default generated `sw.js` only does precaching/runtime-caching. `worker/index.ts` (picked up automatically via next-pwa's `customWorkerDir`, default `"worker"`) adds two handlers the scheduler relies on: a `periodicsync` listener that actually runs due schedules when the browser wakes the SW (without it, `startScheduler()`'s `periodicSync.register()` call succeeds but nothing ever happens), and a `notificationclick` listener that focuses/opens the app when a scan-finished notification is tapped.
- **Manifest + icons** — `public/manifest.json` and `public/icons/*` (generated from `optiqra.webp`), linked from `src/app/layout.tsx`, so the app is installable.

## To run this locally

```bash
npm install       # pulls in next-pwa and idb, added to package.json
npm run build     # generates public/sw.js, workbox-*.js (git-ignored, rebuilt every build)
npm start         # service worker only registers in production
```

`next dev` intentionally disables the service worker (`disable: process.env.NODE_ENV === "development"` in `next.config.ts`) — hot reload and a caching SW fight each other. Test PWA/offline behavior with `npm run build && npm start`.

## Notes / things worth knowing

- Cookies max out around 4KB, so only a small pointer list lives there — the full report JSON (which can be large for whole-site crawls) lives in IndexedDB instead.
- If you clear site data / browsing data in the browser, both the cookie history and the IndexedDB scans are wiped — there's no server-side backup.
- The generated icons are simple resizes/pads of `optiqra.webp`; swap `public/icons/*.png` for real branded assets whenever you have them.
