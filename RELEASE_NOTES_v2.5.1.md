# OptiQra v2.5.1

Local AI model support in the desktop app, a meaningfully smarter scheduled-scans system, a proper custom installer on Windows, and a fix for a Windows installer bug that could leave an install in a broken state. Details below — go check them out for yourself.

## Windows installer fix

If OptiQra was already running in the system tray during an install or update (closing the window only hides it — the app stays running so scheduled scans keep firing), the installer could fail to overwrite the locked sidecar binary. Depending on whether that dialog was dismissed with Retry or Ignore, the result was either a stuck install or one that completed with an old sidecar sitting next to new frontend files — showing up as a styleless UI and `ChunkLoadError`s when opening the app.

The installer now force-closes any running OptiQra process before copying files (and again before uninstalling), so this can't happen anymore.

**If you're recovering from this right now:** right-click the OptiQra tray icon → **Quit OptiQra** (closing the window alone won't do it), confirm nothing named `OptiQra.exe` or `optiqra-server*.exe` is left in Task Manager, then reinstall v2.5.1 over it.

## Local AI model support (Ollama, desktop only)

OptiQra Desktop can now run AI fixes and insights against a **local Ollama server** instead of a cloud provider. Pick "Ollama (local)" in AI Provider setup and it's pre-filled with `http://127.0.0.1:11434` — point it at your own Ollama install and pull whatever model you like.

- Nothing leaves your machine: requests go straight from OptiQra Desktop to your local Ollama server. This only works inside the desktop app — the hosted web version has no way to reach `localhost` on your machine, so this option is desktop-exclusive.
- The setup panel swaps the usual "paste an API key" field for a server URL field when a local provider is selected, and skips the key-format validation that doesn't make sense for a local endpoint.
- Connection testing tells you plainly what's wrong if it can't connect — whether Ollama isn't running, or the model you asked for hasn't been pulled yet (`ollama pull <model>`).

## Expanded scheduled scans

Scheduled scans got a real trend-analysis layer, not just a timer:

- **Score trend detection** — a lightweight linear fit over your scan history reports whether a site's score is trending up, down, or flat, plus a naive 14-day projection, so a schedule tells you *where things are headed*, not just what the last scan said.
- **Chronic issue tracking** — issues that keep showing up across consecutive scans (3+ in a row) get flagged as chronic, so recurring problems don't quietly blend into the noise of one-off findings.
- **Predictive alerts** — opt in per-schedule, and OptiQra will proactively notify you if a site's score is trending down toward a concerning threshold, or if a chronic issue rises to high/critical severity — separate from the normal "scan finished" notification.
- **Frequency suggestions** — based on how volatile or stable a site's score has actually been, OptiQra will suggest checking more often (volatile) or less often (stable) than your current schedule. It's a one-tap suggestion you apply or ignore — nothing changes automatically.
- Same trend logic runs identically in the browser tab/PWA scheduler and in the desktop background daemon, so behavior doesn't drift between the two.

## Custom installer (Windows)

The Windows installer now ships with OptiQra's own branding instead of the generic NSIS defaults — custom header and sidebar artwork, and shortcuts grouped under an "OptiQra" Start Menu folder instead of landing loose at the top level.

## Downloads

Filenames now embed `2.5.1` (this was the `2.4.15`/`v2.5.0` mismatch fixed in this release — the internal version now matches the tag). Once the `v2.5.1` tag is pushed and the release workflow finishes, the artifacts will be at:

```
https://github.com/armin5872/OptiQra/releases/download/v2.5.1/OptiQra_2.5.1_aarch64.dmg
https://github.com/armin5872/OptiQra/releases/download/v2.5.1/OptiQra_2.5.1_x64.dmg
https://github.com/armin5872/OptiQra/releases/download/v2.5.1/OptiQra_2.5.1_x64-setup.exe
https://github.com/armin5872/OptiQra/releases/download/v2.5.1/OptiQra_2.5.1_x64_en-US.msi
https://github.com/armin5872/OptiQra/releases/download/v2.5.1/OptiQra_2.5.1_amd64.deb
https://github.com/armin5872/OptiQra/releases/download/v2.5.1/OptiQra-2.5.1-1.x86_64.rpm
```

plus the matching `.sig` files, the raw macOS `.app.tar.gz` bundles, and `latest.json` for the updater — same set as before, just under the new tag. `optiqra.vercel.app`'s download page doesn't need any further changes; it builds these URLs from the version constant already bumped in this release.

> Existing installs will pick this up automatically via the in-app updater once published.
