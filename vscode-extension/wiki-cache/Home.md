# OptiQra Audit Rules Reference

**Welcome, Thank You For Your Interstest In OptiQra's Wiki**.This wiki documents every audit rule implemented in OptiQra's scoring engine, generated directly from the source in `src/lib/*Audit.ts` and related modules (`2026-08-14`, against the `master` branch). There are **205 distinct rule checks** across 13 categories, each pulled directly from the `issue()`/`pass()` calls in the audit modules — nothing here is hand-summarized from the README, it's read out of the code that actually runs.

## Scope note: live URL scans vs. project/codebase scans

Everything below documents the rule set applied when OptiQra scans a **live URL** (`src/app/api/analyze/route.ts` → `analyzeSEO`/`analyzeGEO`/`analyzeAEO`/etc.). When you instead upload a **project/codebase** for OptiQra to audit and auto-fix (`src/lib/projectAudit.ts`, `src/lib/autoFixEngine.ts`, `src/lib/jsxAutoFix.ts`, `src/lib/markupFixes.ts`), the same underlying issues (missing title, missing alt text, missing meta description, and so on) are detected against source files rather than rendered HTML, and reported through a single generic aggregator (`buildProjectCategoryReport`) that carries over whatever `title`/`severity`/`category` the underlying fix engine assigned rather than a second fixed rule-ID list. In practice it's the same rule *substance*, applied to source instead of a live DOM — so it isn't double-counted as separate rules here.

## How to read each entry

Every rule has a stable `id` used as the issue's key in a scan report. Each entry below lists:

- **Trigger / Evidence** — the exact condition in the page (or site) that causes the rule to fire, pulled from the same string the UI shows in a report.
- **Why it matters** — the reasoning for why that condition is a problem (or a positive signal), again sourced from the audit module itself.
- **Effect / Fix** — what to change, and what fixing it does to the score.
- **Weight / Severity** — points deducted from that category's 100-point starting score if the rule fails, and the severity bucket that weight maps to (`severityFromWeight` in `src/lib/auditUtils.ts`): ≥14 Critical, ≥9 High, ≥5 Medium, ≥2 Low, else Informational.

## Scoring model

Each category starts at 100 points. Every failed rule subtracts its `weight` from that category's score, clamped to a `20`–`99` range (`scoreFromIssues` in `src/lib/auditUtils.ts`) — a page can never show a perfect 100 or bottom out below 20, so the score always signals room for improvement or partial credit. Rules with a passing counterpart contribute nothing when they pass; a small number of rules exist only in their passing form in the current source (their failure state is folded into a sibling rule with a different `id` — noted per-entry below).

## Categories

- [[SEO](https://github.com/armin5872/OptiQra/wiki/Audit-Rules-SEO)](https://github.com/armin5872/OptiQra/wiki/Audit-Rules-SEO) — 30 rules
- [[Performance](https://github.com/armin5872/OptiQra/wiki/Audit-Rules-Performance)](https://github.com/armin5872/OptiQra/wiki/Audit-Rules-Performance) — 8 rules
- [[Accessibility](https://github.com/armin5872/OptiQra/wiki/Audit-Rules-Accessibility)](https://github.com/armin5872/OptiQra/wiki/Audit-Rules-Accessibility) — 6 rules
- [[Conversion & Trust](https://github.com/armin5872/OptiQra/wiki/Audit-Rules-Conversion-Trust)](https://github.com/armin5872/OptiQra/wiki/Audit-Rules-Conversion-Trust) — 6 rules
- [[GEO (Generative Engine Optimization)](https://github.com/armin5872/OptiQra/wiki/Audit-Rules-GEO-Generative-Engine-Optimization)](https://github.com/armin5872/OptiQra/wiki/Audit-Rules-GEO-Generative-Engine-Optimization) — 10 rules
- [[AEO (Answer Engine Optimization)](https://github.com/armin5872/OptiQra/wiki/Audit-Rules-AEO-Answer-Engine-Optimization)](https://github.com/armin5872/OptiQra/wiki/Audit-Rules-AEO-Answer-Engine-Optimization) — 24 rules
- [[Security Headers](https://github.com/armin5872/OptiQra/wiki/Audit-Rules-Security-Headers)](https://github.com/armin5872/OptiQra/wiki/Audit-Rules-Security-Headers) — 23 rules
- [[Structured Data](https://github.com/armin5872/OptiQra/wiki/Audit-Rules-Structured-Data)](https://github.com/armin5872/OptiQra/wiki/Audit-Rules-Structured-Data) — 42 rules
- [[Crawling & Indexing (robots.txt / sitemap)](https://github.com/armin5872/OptiQra/wiki/Audit-Rules-Crawling-Indexing-robotstxt-sitemap)](https://github.com/armin5872/OptiQra/wiki/Audit-Rules-Crawling-Indexing-robotstxt-sitemap) — 33 rules
- [[Duplicate Content](https://github.com/armin5872/OptiQra/wiki/Audit-Rules-Duplicate-Content)](https://github.com/armin5872/OptiQra/wiki/Audit-Rules-Duplicate-Content) — 5 rules
- [[Links](https://github.com/armin5872/OptiQra/wiki/Audit-Rules-Links)](https://github.com/armin5872/OptiQra/wiki/Audit-Rules-Links) — 12 rules
- [[Core Web Vitals (PageSpeed)](https://github.com/armin5872/OptiQra/wiki/Audit-Rules-Core-Web-Vitals-PageSpeed)](https://github.com/armin5872/OptiQra/wiki/Audit-Rules-Core-Web-Vitals-PageSpeed) — 4 rules
- [[JS Rendering / Client-Side Content](https://github.com/armin5872/OptiQra/wiki/Audit-Rules-JS-Rendering-Client-Side-Content)](https://github.com/armin5872/OptiQra/wiki/Audit-Rules-JS-Rendering-Client-Side-Content) — 2 rules