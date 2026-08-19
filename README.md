


# OptiQra

![OptiQra Logo](optiqra.webp)

**An open-source AI website optimizer that actually fixes what it finds.**

OptiQra crawls your website or project, finds problems across **SEO, AEO, GEO, performance, accessibility, security, and technical quality**, explains what matters, shows you where the problems are, and can **actually fix them**. It's the rare audit tool that closes the loop instead of just handing you a to-do list — and now it goes wherever you build: web, desktop, and directly inside your editor.

Instead of:

> Audit → 200 problems → good luck

OptiQra is built around:

> **Crawl → Understand → Fix → Verify → Monitor**

---

## 🚀 Live / Download / Source

[![Live Demo](https://img.shields.io/badge/Live%20Demo-optiqra.vercel.app-00C7B7?style=for-the-badge&logo=vercel)](https://optiqra.vercel.app/)
[![GitHub Repo](https://img.shields.io/badge/GitHub-Source-181717?style=for-the-badge&logo=github)](https://github.com/armin5872/OptiQra)
[![Download](https://img.shields.io/badge/Desktop-Download-blue?style=for-the-badge&logo=github)](https://github.com/armin5872/OptiQra/releases/latest)
[![VS Code Extension](https://img.shields.io/badge/VS%20Code-Extension-6366F1?style=for-the-badge&logo=visualstudiocode)](https://marketplace.visualstudio.com/items?itemName=ArminRomero.optiqra-vscode)
[![Issues](https://img.shields.io/badge/Report%20Bug-Issues-red?style=for-the-badge&logo=github)](https://github.com/armin5872/OptiQra/issues)

---

## 🧠 See it in action

![OptiQra Showcase](showcase.gif)

OptiQra isn't designed to leave you with a giant checklist of things you need to fix yourself.

It is designed to close the loop:

**Find the problem → understand it → fix it → inspect the result.**


**[Try OptiQra](https://optiqra.vercel.app/)** · **Free · No signup · No account required**

**[Download Desktop](https://github.com/armin5872/OptiQra/releases/latest)** · **[View source](https://github.com/armin5872/OptiQra)** · **[Report a bug](https://github.com/armin5872/OptiQra/issues)**



## Why OptiQra?

Most website auditing tools are very good at answering:

> **"What's wrong?"**

OptiQra is built to answer the next questions too:

> **"Why is it wrong?"**

> **"Where exactly is it happening?"**

> **"How should I fix it?"**

> **"Can you fix it for me?"**

> **"Did the fix actually work?"**

You can scan a live URL, upload a project/codebase, inspect the discovered issues directly on the page, apply deterministic or AI-assisted fixes, and continue monitoring the site over time.

### The core workflow

```text
        ┌─────────┐
        │  Crawl  │
        └────┬────┘
             ↓
        ┌───────────┐
        │  Analyze  │
        └─────┬─────┘
              ↓
        ┌────────────┐
        │ Understand │
        └──────┬─────┘
               ↓
        ┌─────────┐
        │   Fix   │
        └────┬────┘
             ↓
        ┌──────────┐
        │  Verify  │
        └────┬─────┘
             ↓
        ┌───────────┐
        │  Monitor  │
        └───────────┘
```

---

# What can OptiQra analyze?

OptiQra currently contains **180+ analysis rules** spanning traditional search, AI visibility, accessibility, performance, security, and technical website quality. If you want to have a bit more insight into these rules I suggest you read the [wiki](https://github.com/armin5872/OptiQra/wiki)

## 🔍 Website crawling

* Full-site crawling through internal links and sitemaps
* Configurable page limits
* Configurable crawl concurrency
* Optional JavaScript rendering
* Internal and external link analysis
* Redirect-chain detection
* Broken-link detection
* Duplicate and near-duplicate content detection
* Image analysis
* Crawl visualization
* Live crawl-tree updates
* 2D crawl tree
* Interactive 3D crawl tree
* Galaxy-style crawl visualization
* Configurable link-hop depth

OptiQra is designed to work with modern JavaScript-heavy websites rather than relying only on raw HTML.

---

## 🎯 SEO

OptiQra checks the foundations of technical and on-page SEO, including:

* Page titles
* Meta descriptions
* Canonicals
* Open Graph
* Twitter/X cards
* Structured data
* JSON-LD
* Schema.org
* robots.txt
* XML sitemaps
* Internal linking
* Anchor text
* Duplicate content
* Thin content
* Image optimization
* Crawlability
* HTTP behavior
* HTTP/2
* HTTP/3

Missing `robots.txt` or sitemaps can also be addressed with generated starter files.

---

## 🤖 GEO — Generative Engine Optimization

Search is no longer limited to ten blue links.

AI systems increasingly discover, summarize, cite, and recommend information from websites.

OptiQra analyzes factors that can affect how your site is exposed to generative systems, including:

* AI crawler accessibility
* Client-side rendering problems
* Content visibility
* Entity grounding
* `sameAs` relationships
* Citation-friendliness
* Answer-oriented content structure
* AI visibility signals
* `llms.txt` detection
* AI-assisted `llms.txt` generation

The goal isn't to promise that an AI model will cite you.

The goal is to identify technical and content conditions that can make your site easier—or harder—for AI systems to discover, understand, and use.

---

## 💬 AEO — Answer Engine Optimization

OptiQra checks whether your content is structured to answer questions clearly.

It analyzes things such as:

* AI crawler access
* GPTBot / ClaudeBot / PerplexityBot and related crawler rules
* Question-and-answer structures
* Answer-liftable content
* Heading structure
* Direct-answer opportunities
* Content that may be hidden behind client-side rendering
* Robots.txt rules affecting AI crawlers

---

## ⚡ Performance

OptiQra analyzes performance-related signals and can integrate with **Google PageSpeed Insights** for additional Core Web Vitals and performance data.

You can inspect:

* Performance characteristics
* Core Web Vitals
* PageSpeed data
* Slow or problematic resources
* Performance-related issues discovered during crawling

---

## ♿ Accessibility

Accessibility checks include:

* Missing image alt text
* Missing labels
* ARIA issues
* Semantic HTML problems
* Keyboard-navigation issues
* Contrast problems
* Form accessibility
* Other accessibility signals detected during analysis

---

## 🔐 Security & trust

OptiQra can identify security and trust-related issues including:

* HSTS
* CSP
* X-Frame-Options
* Other security headers
* Missing or weak trust signals
* Conversion-related signals
* Technology-stack information

OptiQra also fingerprints the site's technology stack so fixes can be tailored to the project rather than blindly modifying generic HTML.

---

# The part that makes OptiQra different

## 🛠️ It can actually fix the problems

An audit is only useful if something happens afterward.

OptiQra supports several levels of fixing.

### Deterministic Auto Fix

Mechanical problems can be fixed directly without AI.

Examples include:

* Missing tags
* Incorrect attributes
* Existing content that needs to be inserted
* Structured markup changes
* Other deterministic transformations

These fixes are reproducible and don't require an AI provider.

### AI-generated fixes

For issues that require actual writing or contextual reasoning, OptiQra can use your chosen AI provider to generate fixes.

Examples include:

* Page titles
* Meta descriptions
* Alt text
* Form labels
* CTA copy
* Other content-level improvements

You provide the API key. OptiQra sends the request directly to the provider.

### Full AI Fix

For more complicated problems, **Full AI Fix** can give the model an entire file together with its detected issues and ask it to return the corrected file.

This is intentionally opt-in because broad AI rewriting is fundamentally different from deterministic transformations.

### Framework-aware fixes

Fixes can work with project formats including:

* HTML
* JSX / TSX
* Vue
* Nuxt
* Angular
* Svelte
* Astro

### Integrity checking

OptiQra validates text-splicing fix operations against structural invariants.

If a transformation looks unsafe or invalid, the change can be discarded instead of being silently shipped.

---

# 👀 See the problems on the actual website

Audit tables are useful.

Seeing the actual problem is better.

OptiQra can generate a **highlighted clone** of a scanned page and annotate the discovered issues directly on the relevant elements.

Instead of:

> `Missing alt attribute — /products/widget`

you can inspect the actual page and see the element associated with the problem.

This connects the abstract audit result to the thing you actually need to change.

---

# 📁 Audit your actual project

OptiQra isn't limited to live URLs.

You can upload a project `.zip` and audit the actual codebase.

Project audits can inspect:

* HTML
* JSX / TSX
* Vue
* Nuxt
* Angular
* Svelte
* Astro
* Configuration files
* Headers
* Compression configuration
* Sitemap/robots configuration
* Other project-level signals

This also means OptiQra can fix things that a remote URL crawler fundamentally cannot see.

### URL audit

```text
Website
   ↓
Crawl
   ↓
Analyze live pages
   ↓
Report
   ↓
Fix
```

### Project audit

```text
Project ZIP
   ↓
Inspect source
   ↓
Analyze files + configuration
   ↓
Report
   ↓
Fix files
   ↓
Download corrected project
```

---

# 🌌 Understand your site visually

OptiQra doesn't only produce tables.

It can visualize the structure of a crawled website.

### 2D crawl tree

The default visualization shows the hierarchy of your site's pages and links.

### 3D crawl tree

Explore the crawl structure as an interactive three-dimensional graph.

### Galaxy mode

A more experimental visualization turns the site's pages into an animated galaxy-like structure.

These aren't intended to replace the report—they make large site structures easier to explore and understand.

---

# 🧠 AI insights

OptiQra can generate a site-wide AI analysis that reasons across the findings from the entire scan.

Instead of asking an AI model about one isolated issue at a time, the insights system can look at the broader report and identify patterns and priorities.

You can configure:

* AI provider
* Model
* API key
* Response detail
* AI persona
* Persona potency

Supported providers include:

* OpenAI
* Anthropic
* Google
* Groq
* OpenRouter
* Mistral
* DeepSeek
* xAI

Your API key is provided by you and is not sent to OptiQra's own server for storage.

---

# 🎭 AI moods & potency

AI insights and fixes can use configurable personas.

Available personas include:

* Normal
* Professional
* Friendly
* Energetic
* Sarcastic
* Full Dev Mode
* No Dev Friendly
* Quirky
* Experimental

The **1–100 potency slider** controls how strongly the selected personality affects the response.

So you can have anything from a restrained professional explanation to a much more exaggerated personality.

The technical findings remain the same—the persona changes how they are communicated.

---

# 📊 Reports & exports

OptiQra keeps scan results locally and can compare scans over time.

Reports can be exported to:

* PDF
* DOCX
* XLSX
* Markdown
* CSV
* TSV
* TXT
* JSON

You can also compare periodic scans to identify:

* New issues
* Resolved issues
* Score changes
* Changes over time

---

# ⏱️ Continuous / scheduled scanning

OptiQra can periodically re-scan websites.

Schedules can run:

* Hourly
* Daily
* Weekly
* Monthly
* Yearly

Each scan can:

1. Crawl the site
2. Generate a new report
3. Compare it with previous results
4. Identify new/resolved issues
5. Notify you about the result

The web application can perform scheduled checks while it is running.

The desktop application goes further.

---

# 🖥️ OptiQra Desktop

OptiQra also ships as a native desktop application built with **Tauri 2**.

The desktop application exists for capabilities that are difficult or impossible to guarantee from a browser tab.

### Web vs Desktop

|                         | Web                     | Desktop                 |
| ----------------------- | ----------------------- | ----------------------- |
| Full-site crawling      | ✅                       | ✅                       |
| Project/codebase audits | ✅                       | ✅                       |
| Offline project audits  | Limited                 | ✅                       |
| Scheduled scans         | While app/PWA is active | Background process      |
| OS notifications        | Browser notifications   | Native OS notifications |
| Scan history            | Local                   | Local                   |
| Same audit engine       | ✅                       | ✅                       |
| AI-powered fixes        | ✅                       | ✅                       |
| Live-site crawling      | Requires network        | Requires network        |

The desktop application uses the same core application and audit engine rather than maintaining a completely separate implementation.

### Background operation

Closing the desktop window does not necessarily stop OptiQra.

The application can remain running in the system tray, allowing scheduled scans to continue in the background.

### Desktop features

* Native Tauri 2 shell
* System tray
* Background scheduler
* Native notifications
* Single-instance locking
* Autostart
* Automatic updates
* Offline project/codebase audits
* Local scan history
* Cross-platform installers

### Supported platforms

* **Windows 10/11 — x64**
* **macOS 12+ — Apple Silicon & Intel**
* **Linux — AppImage / ****`.deb`**

**[Download the latest release →](https://github.com/armin5872/OptiQra/releases/latest)**

---

# 🔒 Privacy by architecture

OptiQra is designed to keep as much processing as possible on the user's side.

For local project audits:

> **Your source code does not need to be uploaded to an OptiQra cloud backend.**

For AI functionality:

> **You choose the AI provider and provide your own API key.**

For live-site scanning:

> OptiQra obviously has to access the URL you ask it to scan.

There is no mandatory account or subscription required to use the application.

AI provider keys are not persisted on OptiQra's own backend.

---

# 🧩 Custom rules & custom code

OptiQra isn't limited to the built-in audit rules.

You can create custom client-side rules that process scan results and surface findings specific to your website.

You can also inject custom CSS or JavaScript into the report view for specialized workflows.

Custom rules can even be proposed upstream to the OptiQra project through GitHub's own file/PR workflow.

---

# 🔌 CI/CD & developer workflows

OptiQra can be integrated into development workflows rather than being used only after deployment.

The project includes CI/CD support and is designed to make website quality checks part of the development lifecycle.

The broader goal is simple:

> **Website optimization shouldn't have to be a manual event you remember to perform once every few months.**

---

# 🌍 13 languages

OptiQra currently supports **13 languages**, including:

* English
* Spanish
* French
* German
* Chinese
* Russian
* Dutch
* Persian
* Korean
* Japanese
* Italian
* Arabic
* Hindi
* and additional supported translations

The UI also supports right-to-left layouts for languages such as Persian and Arabic.

Translations live in:

```text
src/lib/i18n/
```

---

# 🔬 How OptiQra works

At a high level:

### 1. Give it a website or project

Paste a URL or upload a project archive.

### 2. Crawl it

OptiQra discovers pages and analyzes the site structure.

### 3. Analyze it

The analysis engine evaluates the site across multiple categories and rules.

### 4. Understand the findings

You get scores, individual issues, explanations, visualizations, and optional AI insights.

### 5. Fix it

Apply deterministic fixes, AI-generated fixes, or Full AI Fix.

### 6. Verify it

Inspect the modified result and compare it against the original findings.

### 7. Monitor it

Schedule future scans and compare changes over time.

---

# 🆚 How is OptiQra different?

OptiQra isn't trying to be a smaller copy of an enterprise SEO platform.

It takes a different approach.

|                              | OptiQra   | Traditional audit / SEO platforms |
| ---------------------------- | --------- | --------------------------------- |
| Open source                  | ✅         | Usually ❌                         |
| Free core product            | ✅         | Varies                            |
| No account required          | ✅         | Often ❌                           |
| Full-site crawling           | ✅         | Varies                            |
| SEO analysis                 | ✅         | ✅                                 |
| AEO analysis                 | ✅         | Varies                            |
| GEO / AI visibility analysis | ✅         | Varies                            |
| AI-generated fixes           | ✅         | Varies                            |
| Automatically applies fixes  | ✅         | Usually limited                   |
| Project/codebase audits      | ✅         | Usually limited                   |
| Offline project auditing     | ✅ Desktop | Usually ❌                         |
| Background local scheduling  | ✅ Desktop | Usually cloud-based               |
| Local scan history           | ✅         | Varies                            |
| 3D crawl visualization       | ✅         | Rare                              |
| Open-source codebase         | ✅         | Usually ❌                         |

The important difference isn't:

> **"OptiQra has more checkboxes."**

It's:

> **"OptiQra tries to close the loop between discovering a problem and actually fixing it."**

---

# 🔐 Security

OptiQra includes protections for outbound URL analysis, including SSRF defenses and private/loopback/link-local address restrictions.

AI provider keys are not stored server-side by OptiQra.

For security issues, please see [SECURITY.md](SECURITY.md) rather than opening a public issue.

---

# 🛠️ Tech stack

## Web

* Next.js 16
* React 19
* TypeScript 5
* Cheerio
* jsdom
* IndexedDB
* Three.js
* PWA/service-worker infrastructure
* Playwright
* Sentry
* jsPDF
* DOCX generation
* XLSX generation
* JSZip

## Desktop

* Tauri 2
* Rust
* Next.js standalone output
* Node.js scheduler sidecar
* `@yao-pkg/pkg`
* `node-notifier`

The desktop application uses the same application and audit engine as the web experience rather than maintaining a separate ruleset.

## VS Code Extension

* TypeScript
* esbuild
* Cheerio (same engine as Web/Desktop — see [`vscode-extension/ARCHITECTURE.md`](./vscode-extension/ARCHITECTURE.md))
* Three.js (2D/3D Crawl Tree)
* VS Code Diagnostics / Code Actions / Webview APIs
* OPCA — BYOK AI coding agent, grounded in the offline-bundled wiki

---

# 🚀 Quick start

## Requirements

* Node.js 22+
* npm

## Run locally

```bash
git clone https://github.com/armin5872/OptiQra.git
cd OptiQra

npm install
npm run dev
```

Then open:

```text
http://localhost:3000
```

No database is required for the built-in audit engine.

AI-powered functionality uses an API key configured through the UI.

---

## Available scripts

```bash
npm run dev
npm run build
npm run start
npm run lint
npm run type-check

npm test
npm run test:e2e:ui
npm run test:e2e:report
```

Desktop:

```bash
npm run desktop:dev
npm run desktop:build
```

---

# 🖥️ Building the desktop application

The desktop application is built from the same repository.

A production build performs roughly the following:

```text
Next.js production build
        ↓
Standalone application
        ↓
Compile scheduler daemon
        ↓
Package sidecar
        ↓
Tauri build
        ↓
Platform installer
```

Run:

```bash
npm run desktop:build
```

Cross-platform releases should be built natively for the target operating system.

See:

* `.github/workflows/release.yml`
* `server/README.md`

for the complete desktop build architecture.

---

# 🐳 Docker

```bash
docker compose up --build
```

The application will be available at:

```text
http://localhost:3000
```

Development Docker configuration is also included.

---

# 🔌 API

OptiQra exposes internal API routes used by the application.

Important endpoints include:

### Analyze

```http
POST /api/analyze
```

```json
{
  "url": "https://example.com"
}
```

### Stop crawl

```http
POST /api/analyze/stop
```

### Highlighted clone

```http
POST /api/clone
```

### Auto Fix

```http
POST /api/auto-fix
```

### Project audit/fix

```http
POST /api/auto-fix-project
```

### Individual AI fix

```http
POST /api/ai-fix
```

### AI insights

```http
POST /api/ai-insights
```

### AI provider test

```http
POST /api/ai-test
POST /api/ai-engine-test
```

### `llms.txt` generation

```http
POST /api/generate-llms-txt
```

### PageSpeed

```http
POST /api/pagespeed
```

### Health

```http
GET /api/health
```

Outbound URL requests are validated against SSRF protections before crawling.

---

# 📁 Project structure

```text
src/
├── app/
│   ├── api/
│   └── ...
├── lib/
│   ├── crawler
│   ├── analyzers
│   ├── auto-fix
│   ├── AI
│   ├── scheduling
│   ├── reporting
│   ├── localization
│   └── ...
│
src-tauri/
└── Tauri desktop shell

server/
└── desktop scheduler sidecar

worker/
└── service worker
```

Some of the most important areas include:

* `src/lib/` — crawling and analysis engine
* `src/lib/autoFixEngine.ts` — deterministic fixes
* `src/lib/fullAiFixEngine.ts` — Full AI Fix
* `src/lib/fixIntegrityGuard.ts` — fix validation
* `src/lib/projectAudit.ts` — project/codebase auditing
* `src/lib/scheduler.ts` — browser scheduling
* `server/` — desktop background scheduler
* `src-tauri/` — native desktop shell
* `src/lib/i18n/` — localization

---

# 🗺️ Roadmap

OptiQra already has a large feature surface, so the roadmap is intentionally focused on improving the existing platform rather than adding features indiscriminately.

## Current

* [x] Tauri 2 desktop application
* [x] Background scheduler
* [x] Offline project/codebase audits
* [x] Desktop notifications
* [x] Scan history
* [x] Automatic updates
* [x] Multi-platform desktop releases
* [x] 150+ analysis rules
* [x] AI-assisted fixes
* [x] Full AI Fix
* [x] Framework-aware fixes
* [x] GEO/AEO analysis
* [x] 3D / Galaxy crawl visualization
* [x] Project auditing
* [x] Periodic scans
* [x] Scan comparison
* [x] Report exports
* [x] Custom rules
* [x] Custom code
* [x] CI/CD integration

## In development / planned

* [ ] Signed and notarized builds across platforms
* [ ] Competitor comparison and intelligence
* [ ] GitHub pull-request-based fixes
* [ ] Expanded website history and change intelligence
* [ ] Additional developer integrations
* [ ] Further crawler and analyzer improvements

The roadmap may change as real-world usage and contributor feedback reveal what is most valuable.

---

# 💡 Vision

OptiQra started as a website auditing project.

The long-term goal is much larger:

> **Make website optimization continuous instead of something you do once in a while.**

A website should not need to wait for someone to remember:

> "I should probably run an SEO audit."

It should be possible to continuously:

* Understand the site's structure
* Detect regressions
* Find new problems
* Track changes
* Analyze search visibility
* Analyze AI visibility
* Prioritize improvements
* Apply fixes
* Verify the result
* Monitor the site over time

The eventual direction is a persistent **website intelligence system**—one that knows the history and structure of a particular site instead of treating every scan as an isolated report.

---

# 🤝 Contributing

Contributions are welcome.

You can:

* Fix an existing issue
* Improve an analyzer
* Add a new rule
* Improve the crawler
* Improve the UI
* Add translations
* Improve desktop functionality
* Improve documentation
* Add integrations

See [CONTRIBUTING.md](CONTRIBUTING.md) for development and contribution guidelines.

If you're adding or modifying audit rules, please keep the report structure consistent and verify that the project still builds and passes its test suite.

---

# 📄 License

OptiQra is released under the [MIT License](LICENSE).

© ArminNX

---

## Built by ArminNX and the open-source community

If OptiQra is useful to you, consider **[starring the repository](https://github.com/armin5872/OptiQra)**.

It helps the project get discovered by other developers and makes it easier to attract contributors.

**[⭐ Star OptiQra on GitHub](https://github.com/armin5872/OptiQra)**** · ****[🚀 Try it](https://optiqra.vercel.app/)**** · ****[⬇️ Download Desktop](https://github.com/armin5872/OptiQra/releases/latest)**

## VS Code Extension

OptiQra now lives where you actually write code. A full-featured VS Code extension in [`vscode-extension/`](./vscode-extension) brings offline SEO/GEO/AEO/accessibility/security auditing, live in-editor diagnostics, one-click fixes (automated or via OPCA/BYOK AI, always with your approval), a Dashboard, a 2D/3D Crawl Tree, and an offline Wiki — running entirely inside the editor, no server round-trip required. It imports `src/lib/` directly rather than duplicating it, so it stays in lockstep with the same engine the web and desktop apps run — see [`vscode-extension/ARCHITECTURE.md`](./vscode-extension/ARCHITECTURE.md). And you can download it in the [VS code marketplace](https://marketplace.visualstudio.com/items?itemName=ArminRomero.optiqra-vscode)

**Like OptiQra? [Give us a star on GitHub ★](https://github.com/armin5872/OptiQra)**
