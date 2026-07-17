# OptiQra

**Audit your site for both search engines and AI.** OptiQra crawls your entire website and scores it across SEO, performance, accessibility, security, and conversion signals — plus two new categories that matter now: **GEO** (generative engine optimization) and **AEO** (answer engine optimization). ChatGPT, Claude, Perplexity, and Google's AI Overviews now send as much traffic as traditional search. OptiQra tells you if your site is set up to be read, cited, and answered by them.

![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript)
![License](https://img.shields.io/badge/License-MIT-green)
[![Deployed on Vercel](https://img.shields.io/badge/Deployed%20on-Vercel-black?logo=vercel)](https://optiqra.vercel.app/)

**[Live demo](https://optiqra.vercel.app)** · Free, no signup, no accounts

![OptiQra](optiqra.webp)

## Core audits

### 🔍 Site Crawling & Indexing
- Crawls entire sites through sitemaps and internal links
- Detects duplicate and near-duplicate content (repeated titles, byte-identical pages, thin/templated content)
- Analyzes links (broken links, internal/external, redirect chains)
- Scans images (missing alt text, lazy loading, responsive `srcset`/`<picture>` usage)

### 🎯 SEO Essentials
- Meta tags (title, description, canonical, Open Graph, Twitter cards)
- Structured data (JSON-LD, schema.org validation)
- robots.txt and sitemap analysis
- Internal linking patterns and anchor text quality

### 🤖 Generative Engine Optimization (GEO)
- **Entity grounding** — checks for authoritative `sameAs` links (Wikipedia, Wikidata, Crunchbase, LinkedIn, GitHub) that help AI models cite and disambiguate your content
- **Client-side rendering detection** — flags content hidden behind client-side JavaScript that generative crawlers (GPTBot, ClaudeBot) can't see
- **Citation-friendliness** — analyzes whether pages are structured to be easily quoted and attributed in AI answers

### 🤖 Answer Engine Optimization (AEO)
- **Crawler access** — checks whether AI answer-engine crawlers (GPTBot, ClaudeBot, PerplexityBot, Google-Extended, etc.) are allowed or blocked by robots.txt
- **Answer-liftable content** — detects whether key content is structured to be extracted directly into answers, Q&A format, and featured snippets
- **Q&A structuring** — validates whether content is formatted to answer common questions about your domain

### ⚡ Performance
- HTML/response performance characteristics

### ♿ Accessibility
- Missing alt text, labels, and ARIA attributes
- Color contrast problems
- Keyboard navigation and semantic HTML issues

### 🔐 Security
- Security headers (HSTS, CSP, X-Frame-Options, etc.)
- Conversion signals and trust badges

### 📊 Reports & Intelligence
- **AI-generated fixes** — paste an API key (yours to keep) and OptiQra suggests fixes for each issue using OpenAI, Anthropic, Google, Groq, OpenRouter, Mistral, DeepSeek, or xAI
- **Site-wide AI insights** — generates a strategic summary reasoning across all categories and pages
- **Visual crawl tree** — hover/click any page to see individual stats
- **Export to PDF, DOCX, Markdown, CSV, TSV, TXT, JSON**
- **Periodic scanning** — schedule re-scans (hourly to yearly), get browser notifications, auto-compare against previous results
- **PWA + offline** — installable, past reports visible without internet

## How it works

1. **Paste a URL** — any website, any size
2. **OptiQra crawls it** — follows internal links, scans every page
3. **See results in seconds** — visual tree of all crawled pages, scores by category, detailed issue list
4. **Get AI fixes** — (optional) paste an API key and OptiQra generates suggested fixes for each issue using your choice of provider: OpenAI, Anthropic, Google, Groq, OpenRouter, Mistral, DeepSeek, or xAI

Everything runs in your browser. No server sees your data. No account needed.

## Showcase
![showcase](showcase.gif)

## How OptiQra compares

| Feature | OptiQra | Lighthouse | SEMrush | Ahrefs |
|---------|---------|-----------|---------|--------|
| **Full-site crawl** | ✅ Free | ❌ Single page | ✅ Paid | ✅ Paid |
| **GEO/AEO audits** | ✅ Yes | ❌ No | ❌ No | ❌ No |
| **AI-generated fixes** | ✅ Yes (your API) | ❌ No | ❌ No | ❌ No |
| **No signup required** | ✅ Yes | ✅ Yes | ❌ No | ❌ No |
| **Runs in browser** | ✅ Yes | ✅ Yes | ❌ No | ❌ No |
| **Free forever** | ✅ Yes | ✅ Yes | ❌ No | ❌ No |
| **Open source** | ✅ Yes | ✅ Yes | ❌ No | ❌ No |

**OptiQra's edge:** Free full-site crawls + AI-native audits (GEO/AEO) + AI-generated fixes, all in your browser. No accounts, no limits, no subscriptions.

## Why this matters

SEO isn't just about Google anymore. **ChatGPT, Claude, Perplexity, and Gemini now generate answers that cite (or don't cite) your site.** Traffic from AI has already surpassed some traditional search channels for content creators. But most auditing tools haven't caught up — they still measure you against Googlebot alone.

OptiQra fills that gap. It tells you:
- Whether your content is *visible* to AI crawlers (or hidden behind client-side JS)
- Whether AI models can *cite* you credibly (via entity grounding)
- Whether your content is *liftable* into direct answers
- Whether you've *allowed or blocked* AI crawlers in robots.txt

In a world where one well-placed answer-engine citation is worth more traffic than page-two Google rankings, knowing your GEO/AEO score matters.

## 📚 Tech stack

- Next.js 16
- React 19
- TypeScript 5
- Cheerio for HTML parsing, `image-size` for image inspection
- `idb` (IndexedDB) for local scan history and schedules, backed by a custom PWA service worker for offline support and periodic-sync scans
- `jspdf` and `docx` for report exports
- ESLint and Next.js linting configuration

## 🚀 Quick start

### Prerequisites

- Node.js 18 or newer
- npm

### Local development

```bash
npm install
npm run dev
```

Open http://localhost:3000 in your browser.

### Environment variables

The app runs its built-in audits without any configuration. AI-powered fixes and insights use a provider API key you enter in the UI rather than an environment variable, so nothing needs to be set for those either.

## Available scripts

```bash
npm run dev      # Start the development server
npm run build    # Create a production build
npm run start    # Start the production server
npm run lint     # Run ESLint
```

## Docker

```bash
docker compose up --build
```

The app will be available at http://localhost:3000. A `docker-compose.dev.yml` and `Dockerfile.dev` are also included for a hot-reloading development container.

## Periodic scans

Click **⏱ Schedule this scan** on a report (or **⏱ Scheduled scans** in the header to manage all of them) to have OptiQra re-scan a URL on a recurring cadence — hourly, daily, weekly, monthly, or yearly. Each run:

- Saves a new report to this browser's scan history, same as a manual scan.
- Optionally compares the new report against the most recent previous scan of that URL — score change, new issues, resolved issues.
- Optionally fires a browser notification with a one-line summary once it finishes.

**Scope/limitations, to be upfront about them:** this app has no server, database, or user accounts — schedules and their history live entirely in this browser's IndexedDB (`src/lib/scheduleStore.ts`). A background checker (`src/lib/scheduler.ts`) runs while any tab of the app is open (or installed as a PWA) and checks every minute for schedules that are due, so you don't need to keep the report on screen or babysit a scan — but scans only fire while the browser process itself is running somewhere. There's a best-effort attempt to register the [Periodic Background Sync API](https://developer.chrome.com/docs/capabilities/periodic-background-sync) on browsers/installs that support it, which can extend this a little further, but that API has no guaranteed interval and isn't available in most browsers — treat it as a bonus, not a guarantee. For true "runs even when nothing is open" scheduling you'd want a server-side cron job hitting `/api/analyze` instead.

## AI-powered fixes and insights

If you paste in an API key for one of the supported providers (OpenAI, Anthropic, Google, Groq, OpenRouter, Mistral, DeepSeek, or xAI), OptiQra can:

- Generate a suggested fix for any individual issue in a report
- Generate a site-wide AI insights summary that reasons across every category and page

Keys are entered per-session in the browser and sent straight to the provider you chose to make the request — OptiQra's own server never sees or stores them.

## PWA and offline support

OptiQra is installable as a Progressive Web App. Completed scans and schedules are saved locally in IndexedDB, so past reports remain viewable offline and survive reloads; a lightweight pointer to your recent scan history is also kept in a capped cookie for fast, synchronous access. See [PWA_SETUP.md](PWA_SETUP.md) for the full breakdown of caching strategy, service worker behavior, and what does and doesn't work offline.

## API

### POST /api/analyze

Send a JSON body containing a URL:

```json
{
	"url": "https://example.com"
}
```

The endpoint returns a report with categories such as SEO, GEO/AEO, performance, accessibility, security, and conversions, along with issue details and scores. Outbound requests are validated against SSRF (blocked private/loopback/link-local IP ranges, including DNS rebinding checks) before being fetched — see `src/lib/urlSafety.ts`.

### POST /api/ai-fix

Generates an AI-written fix for a single issue, given a provider, API key, and issue details.

### POST /api/ai-insights

Generates a site-wide AI insights summary across a full report.

### POST /api/ai-test

Verifies that a given provider/API key/model combination is reachable and working.

## Project structure

- `src/app/page.tsx`: the main diagnostic UI
- `src/app/api/analyze/route.ts`: the analysis orchestration endpoint
- `src/app/api/ai-fix`, `ai-insights`, `ai-test`: AI-backed endpoints
- `src/lib`: audit modules — crawler, SEO, GEO, AEO, structured data, performance, accessibility (via HTML audit), security headers, links, images, and duplicate content
- `src/lib/aiFix.ts`, `aiProviders.ts`, `aiInsights.ts`: multi-provider AI fix and insights generation
- `src/lib/reportExport`: PDF, DOCX, Markdown, CSV, TSV, TXT, and JSON report exporters, built on a shared format-agnostic report model
- `src/lib/scanStore.ts`, `scanCookies.ts`: local (IndexedDB + cookie) scan history
- `src/lib/scheduler.ts`, `scheduleStore.ts`, `scanCompare.ts`, `notifications.ts`: periodic re-scan engine (see "Periodic scans" above)
- `src/lib/urlSafety.ts`: SSRF protection for outbound crawl/analyze requests
- `worker/index.ts`: custom service worker logic (periodic sync, notification clicks) layered on top of next-pwa

## Security

Outbound scan requests are guarded against SSRF, and API keys for AI providers are never persisted server-side. See [SECURITY.md](SECURITY.md) for the full policy and how to report a vulnerability.

## 🌱 Roadmap

### v0.2

- [x] SEO audit
- [x] Accessibility audit
- [x] Performance audit
- [x] Conversion analysis
- [x] Security header analysis
- [x] robots.txt analysis
- [x] Sitemap analysis
- [x] Structured data detection
- [x] Google Lighthouse integration

### v0.3

- [x] Advanced link analyzer
- [x] Advanced image analyzer
- [x] Open Graph preview
- [x] Twitter card preview
- [x] Security score improvements
- [ ] HTTP/2 and HTTP/3 detection
- [ ] Core Web Vitals visualization

### v0.5

- [x] Whole website crawler
- [x] Multi-page SEO reports
- [x] Duplicate content detection
- [x] Internal linking analysis
- [x] Broken link detection
- [x] Crawl visualization

### v1.0

- [x] AI website review
- [x] AI generated fixes
- [x] Multi-provider AI support (OpenAI, Anthropic, Google, Groq, OpenRouter, Mistral, DeepSeek, xAI)
- [x] GEO (generative engine optimization) audit
- [x] AEO (answer engine optimization) audit
- [x] PWA / offline support
- [x] Report export (PDF, DOCX, Markdown, CSV, TSV, TXT, JSON)
- [ ] Competitor comparison
- [x] Historical scan tracking
- [x] Periodic (scheduled) scans with change detection and notifications
- [ ] CI/CD integration
- [ ] GitHub pull request fixes

## 💡 Vision

OptiQra aims to grow from a single-page auditing tool into a complete AI-powered website optimization platform — capable of crawling entire websites, identifying issues across both traditional search and generative-engine visibility, prioritizing improvements, generating fixes, and helping developers build faster, more secure, more accessible, and more AI-discoverable web experiences.

## 🤝 Contributing

Contributions are welcome. Pick up an open issue, start on the next item on the roadmap, or add something you think would make the app better. See [CONTRIBUTING.md](CONTRIBUTING.md) for setup notes. If you make changes, please keep the audit output shape consistent and verify the app still builds locally.

## License

[MIT](LICENSE) © ArminNX

## Made by ArminNX and the community
