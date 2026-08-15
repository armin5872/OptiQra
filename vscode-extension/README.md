# OptiQra for VS Code

**Offline SEO, GEO & AEO engineering, live in your editor.**

OptiQra brings the audit engine from the [OptiQra](https://github.com/armin5872/OptiQra) app straight into VS Code — no URL, no live site required. It scans the project you already have open, flags SEO / GEO (generative-engine) / AEO (answer-engine) / accessibility / security / performance / conversion / structured-data issues as you type, and fixes them: automatically when it can, with **OPCA** (an AI coding agent, BYOK) when it needs judgment — always with your approval first, unless you turn auto-approve on.

It's the same engine — not a lighter reimplementation — so what it finds and fixes matches what you'd see in the web and desktop apps, just without leaving your editor.

> **Like OptiQra? [Give us a star on GitHub ★](https://github.com/armin5872/OptiQra)**

## Features

- **SEO Intelligence in the editor** — issues show up as red/yellow squiggles exactly where they live in your source, with hover explanations and one-click quick fixes. Runs entirely offline.
- **Fix, not just flag** — every issue has a real **Fix** action. If an AI key is configured it uses OPCA; if not, it falls back to deterministic automated fixes. Every change is shown as a diff and requires your approval, unless you've turned on auto-approve.
- **OPCA — OptiQra's coding agent** — a chat panel (bring your own API key: OpenAI, Anthropic, Google, Groq, OpenRouter, Mistral, DeepSeek, or xAI) grounded in OptiQra's own audit-rule wiki, aware of your open file, and able to work across your stack — Next.js, Vue, Angular, Svelte, Laravel/PHP, Python, or anything else.
- **Dashboard** — an overall score, per-category breakdowns (SEO, Performance, Accessibility, Security, Conversions, Best Practices, GEO, AEO, Structured Data, Duplicate Content), and the top issues in each, computed from your actual codebase.
- **Crawl Tree, 2D & 3D** — a visualization of your project's internal link graph, built from the links that already exist in your source — drag, zoom, orbit, and click through to any file.
- **Offline Wiki** — the full OptiQra audit-rules reference, bundled for offline reading, with a one-click link back to the live GitHub wiki.
- **Native VS Code integration** — a Problems-style Issues tree in its own Activity Bar container, quick fixes via the standard Code Actions lightbulb, a status bar score indicator, command palette commands, and settings that live in the normal Settings UI (`Ctrl/Cmd+,` → search "OptiQra").

## Getting started

1. Open a workspace/folder in VS Code.
2. Run **OptiQra: Run Full Scan** from the Command Palette (or click it in the OptiQra Activity Bar view).
3. Open any HTML/JSX/TSX/Vue/Svelte/Astro/PHP file to see live diagnostics.
4. (Optional) Run **OptiQra: Set AI API Key** and pick a provider in Settings → OptiQra → AI to enable OPCA and AI-authored fixes.

## Settings

All settings live under `optiqra.*` in your normal VS Code Settings UI — categories to audit, diagnostics behavior, fix/auto-approve behavior, AI provider/model, scan include/exclude globs, and OPCA options. See the extension's Settings page for the full list with descriptions.

## Privacy

Everything runs locally. The only network calls this extension makes are (a) to whichever AI provider *you* configure, only when you use OPCA or an AI-authored fix, and (b) an explicit "Open on GitHub" / "Sync Wiki" link you click yourself. No project code is ever sent anywhere unless you've turned on AI and triggered an AI action.

## Links

- [OptiQra on GitHub](https://github.com/armin5872/OptiQra)
- [OptiQra Wiki](https://github.com/armin5872/OptiQra/wiki)
- [Report an issue](https://github.com/armin5872/OptiQra/issues)

**Like OptiQra? [Give us a star on GitHub ★](https://github.com/armin5872/OptiQra)**
