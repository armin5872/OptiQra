# OptiQra v2.5.0

Three things landed in this release: local AI model support in the desktop app, a meaningfully smarter scheduled-scans system, and a proper custom installer on Windows. Details below — go check them out for yourself.

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

| Platform | Installer | Signature |
|---|---|---|
| macOS (Apple Silicon) | [OptiQra_2.4.15_aarch64.dmg](https://github.com/armin5872/OptiQra/releases/download/v2.5.0/OptiQra_2.4.15_aarch64.dmg) | [.sig](https://github.com/armin5872/OptiQra/releases/download/v2.5.0/OptiQra_aarch64.app.tar.gz.sig) |
| macOS (Intel) | [OptiQra_2.4.15_x64.dmg](https://github.com/armin5872/OptiQra/releases/download/v2.5.0/OptiQra_2.4.15_x64.dmg) | [.sig](https://github.com/armin5872/OptiQra/releases/download/v2.5.0/OptiQra_x64.app.tar.gz.sig) |
| Windows (installer) | [OptiQra_2.4.15_x64-setup.exe](https://github.com/armin5872/OptiQra/releases/download/v2.5.0/OptiQra_2.4.15_x64-setup.exe) | [.sig](https://github.com/armin5872/OptiQra/releases/download/v2.5.0/OptiQra_2.4.15_x64-setup.exe.sig) |
| Windows (MSI) | [OptiQra_2.4.15_x64_en-US.msi](https://github.com/armin5872/OptiQra/releases/download/v2.5.0/OptiQra_2.4.15_x64_en-US.msi) | [.sig](https://github.com/armin5872/OptiQra/releases/download/v2.5.0/OptiQra_2.4.15_x64_en-US.msi.sig) |
| Linux (.deb) | [OptiQra_2.4.15_amd64.deb](https://github.com/armin5872/OptiQra/releases/download/v2.5.0/OptiQra_2.4.15_amd64.deb) | [.sig](https://github.com/armin5872/OptiQra/releases/download/v2.5.0/OptiQra_2.4.15_amd64.deb.sig) |
| Linux (.rpm) | [OptiQra-2.4.15-1.x86_64.rpm](https://github.com/armin5872/OptiQra/releases/download/v2.5.0/OptiQra-2.4.15-1.x86_64.rpm) | [.sig](https://github.com/armin5872/OptiQra/releases/download/v2.5.0/OptiQra-2.4.15-1.x86_64.rpm.sig) |

Additional raw macOS app bundles (used by the updater, not typically downloaded directly):
[aarch64 app.tar.gz](https://github.com/armin5872/OptiQra/releases/download/v2.5.0/OptiQra_aarch64.app.tar.gz) ·
[x64 app.tar.gz](https://github.com/armin5872/OptiQra/releases/download/v2.5.0/OptiQra_x64.app.tar.gz) ·
[updater manifest (latest.json)](https://github.com/armin5872/OptiQra/releases/download/v2.5.0/latest.json)

> Existing installs will pick this up automatically via the in-app updater — the links above are for fresh installs.

**Note:** installer filenames still read `2.4.15` even though this is the `v2.5.0` release tag — the app's internal version number wasn't bumped alongside the tag. Functionally these are the v2.5.0 binaries; the version string embedded in the filenames just hasn't caught up yet.
