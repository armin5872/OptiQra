# Core Web Vitals (PageSpeed)

[← Back to Home](https://github.com/armin5872/OptiQra/wiki/Home)

Checks against Google PageSpeed Insights / Lighthouse lab metrics (LCP, CLS, TBT, etc.) when a PageSpeed API key is configured, on top of OptiQra's own lightweight performance checks. Source: `src/lib/pagespeed.ts` (`buildCoreWebVitalsIssues`).

**4 rules in this category.**

| ID | Rule | Severity | Weight |
|---|---|---|---|
| `cwv-inp` | [Interaction to Next Paint is *(rating: good / needs improvement / poor)* (N)](#rule-cwv-inp) | Medium–Critical | 8–14 pts (scales with how much of the page is affected — see source) |
| `cwv-lcp` | [Largest Contentful Paint is *(rating: good / needs improvement / poor)* (N)](#rule-cwv-lcp) | Medium–Critical | 8–14 pts (scales with how much of the page is affected — see source) |
| `cwv-cls` | [Cumulative Layout Shift is *(rating: good / needs improvement / poor)* (N)](#rule-cwv-cls) | Medium–High | 7–12 pts (scales with how much of the page is affected — see source) |
| `cwv-tbt` | [Total Blocking Time is *(rating: good / needs improvement / poor)* (N)](#rule-cwv-tbt) | Medium–High | 6–10 pts (scales with how much of the page is affected — see source) |

---

<a id="rule-cwv-inp"></a>
## `cwv-inp`

**Interaction to Next Paint is *(rating: good / needs improvement / poor)* (N)**

| Severity | Weight | Category |
|---|---|---|
| Medium–Critical | 8–14 pts (scales with how much of the page is affected — see source) | Core Web Vitals (PageSpeed) |

**What triggers it & why it matters:** Based on real visitors, INP is N. Google's threshold for "good" is 200ms or under.

**How to fix it & effect on score:** Break up long JavaScript tasks, reduce main-thread work on interaction, and avoid heavy work in event handlers. Fixing this removes the 8–14 pts (scales with how much of the page is affected — see source) deduction from the **Core Web Vitals (PageSpeed)** category score on the next scan.

**What a pass looks like:** Interaction to Next Paint is good (N, real visitors)


---

<a id="rule-cwv-lcp"></a>
## `cwv-lcp`

**Largest Contentful Paint is *(rating: good / needs improvement / poor)* (N)**

| Severity | Weight | Category |
|---|---|---|
| Medium–Critical | 8–14 pts (scales with how much of the page is affected — see source) | Core Web Vitals (PageSpeed) |

**What triggers it & why it matters:** Based on *(actual value)*, LCP is N. Google's threshold for "good" is 2.5s or under; this page is well past / past that.

**How to fix it & effect on score:** Speed up the largest above-the-fold element: optimize/preload its image, remove render-blocking CSS/JS, and improve server response time. Fixing this removes the 8–14 pts (scales with how much of the page is affected — see source) deduction from the **Core Web Vitals (PageSpeed)** category score on the next scan.

**What a pass looks like:** Largest Contentful Paint is good (N, *(actual value)*)


---

<a id="rule-cwv-cls"></a>
## `cwv-cls`

**Cumulative Layout Shift is *(rating: good / needs improvement / poor)* (N)**

| Severity | Weight | Category |
|---|---|---|
| Medium–High | 7–12 pts (scales with how much of the page is affected — see source) | Core Web Vitals (PageSpeed) |

**What triggers it & why it matters:** Based on *(actual value)*, CLS is N. Google's threshold for "good" is 0.1 or under.

**How to fix it & effect on score:** Reserve space for images/embeds/ads with explicit dimensions, and avoid inserting content above existing content after load. Fixing this removes the 7–12 pts (scales with how much of the page is affected — see source) deduction from the **Core Web Vitals (PageSpeed)** category score on the next scan.

**What a pass looks like:** Cumulative Layout Shift is good (N, *(actual value)*)


---

<a id="rule-cwv-tbt"></a>
## `cwv-tbt`

**Total Blocking Time is *(rating: good / needs improvement / poor)* (N)**

| Severity | Weight | Category |
|---|---|---|
| Medium–High | 6–10 pts (scales with how much of the page is affected — see source) | Core Web Vitals (PageSpeed) |

**What triggers it & why it matters:** No real-visitor INP data is available yet for this URL, so this uses Total Blocking Time from a lab run as a proxy — high TBT usually means poor INP too.

**How to fix it & effect on score:** Break up long JavaScript tasks and defer non-critical scripts so the main thread stays free to respond to input. Fixing this removes the 6–10 pts (scales with how much of the page is affected — see source) deduction from the **Core Web Vitals (PageSpeed)** category score on the next scan.

**What a pass looks like:** Total Blocking Time (lab proxy for INP) is good (N)


---