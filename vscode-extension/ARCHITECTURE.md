# vscode-extension — how this points at the app instead of duplicating it

This extension does **not** maintain its own copy of the audit/fix engine.
Everything in `../src/lib/` (auditUtils, htmlAudit, structuredDataAudit,
geoAudit, aeoAudit, duplicateContentAudit, jsxAutoFix, markupFixes,
autoFixEngine, projectFixEngine, stackDetector, projectAudit,
reportAggregate, aiProviders, aiFix*, fixIntegrityGuard, urlSafety, etc.) is
imported directly by relative path (`../../../src/lib/...` / `../../src/lib/...`,
see `tsconfig.json`'s `@/lib/*` path mapping) — the exact same source the
web/Tauri app runs. Fix a bug or add a check in `src/lib/`, and both the
app and this extension pick it up automatically.

## Why this works with (almost) zero adaptation

Most of `src/lib/` was already environment-agnostic: it takes a Cheerio
document / HTML string / project file list and returns issues — no
`window`, no React, no Next.js runtime dependency. The only genuinely
network-bound pieces are a handful of individual functions (live robots.txt
probing, a live GPTBot-vs-browser firewall comparison, live sitemap URL
validation) — the extension simply never calls those, using the
already-existing `{ includeCrawlFiles: false }` option on `analyzeSEO()`
instead of forking the file.

## The one adaptation that *is* new: `crawlAudit`-for-disk

There's no live URL when auditing a workspace, so
`src/scanner/projectScanner.ts` + `src/audit/engine.ts` read
`robots.txt`/`sitemap.xml` off disk (public/, static/, or project root)
rather than fetching them — that's new code because it's solving a problem
the app never had, not a rewrite of something it already does.

## Why the extension still has its own `package.json`/`node_modules`

VS Code extensions ship as a single `.vsix` that end users install in
isolation — it can't lean on a monorepo's hoisted `node_modules` at
install time. So `vscode-extension/` is its own npm package (its
`dependencies` mirror the subset of the root app's dependencies that
`src/lib/` actually needs — cheerio, domhandler, image-size, idb — plus
`three`/`marked` for the extension-only UI), even though its *source*
imports the root app's `src/lib/` directly rather than a copy of it.

## Build

```
cd vscode-extension
npm install
npm run build      # bundles dist/extension.js + media/crawltree/bundle.js via esbuild
npm run package    # produces a .vsix via @vscode/vsce
```
