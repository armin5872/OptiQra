# Performance

[← Back to Home](https://github.com/armin5872/OptiQra/wiki/Home)

Checks derived from the raw HTTP response and HTML payload of a page (not a full browser trace) — response time, payload size, render-blocking resources, and compression. Source: `src/lib/htmlAudit.ts` (`analyzeSpeed`).

**8 rules in this category.**

| ID | Rule | Severity | Weight |
|---|---|---|---|
| `ttfb` | [Server response took Nms](#rule-ttfb) | High–Critical | 9–15 pts (scales with how much of the page is affected — see source) |
| `html-size` | [HTML document is large (N KB)](#rule-html-size) | Medium–High | 7–12 pts (scales with how much of the page is affected — see source) |
| `render-blocking-js` | [N render-blocking script(s) in `<head>`](#rule-render-blocking-js) | Medium–High | 7–11 pts (scales with how much of the page is affected — see source) |
| `cls-images` | [N of N images missing width/height](#rule-cls-images) | Medium–High | 6–10 pts (scales with how much of the page is affected — see source) |
| `compression` | [Response is not compressed](#rule-compression) | High | 9 pts |
| `cache` | [No Cache-Control header](#rule-cache) | Medium | 6 pts |
| `css-count` | [N separate stylesheets loaded](#rule-css-count) | Medium | 6 pts |
| `lazy-loading` | [No images use lazy loading](#rule-lazy-loading) | Medium | 5 pts |

---

<a id="rule-ttfb"></a>
## `ttfb`

**Server response took Nms**

| Severity | Weight | Category |
|---|---|---|
| High–Critical | 9–15 pts (scales with how much of the page is affected — see source) | Performance |

**What triggers it & why it matters:** A slow time-to-first-byte delays everything else on the page, since the browser can't start rendering until the response arrives.

**How to fix it & effect on score:** Investigate server/database response time, or add caching/CDN in front of the origin. Fixing this removes the 9–15 pts (scales with how much of the page is affected — see source) deduction from the **Performance** category score on the next scan.

**What a pass looks like:** Server responded quickly


---

<a id="rule-html-size"></a>
## `html-size`

**HTML document is large (N KB)**

| Severity | Weight | Category |
|---|---|---|
| Medium–High | 7–12 pts (scales with how much of the page is affected — see source) | Performance |

**What triggers it & why it matters:** A large initial HTML payload delays first paint, especially on slower connections.

**How to fix it & effect on score:** Trim unused markup and move large inline content out of the initial HTML. Fixing this removes the 7–12 pts (scales with how much of the page is affected — see source) deduction from the **Performance** category score on the next scan.

**What a pass looks like:** Initial HTML payload is a reasonable size


---

<a id="rule-render-blocking-js"></a>
## `render-blocking-js`

**N render-blocking script(s) in `<head>`**

| Severity | Weight | Category |
|---|---|---|
| Medium–High | 7–11 pts (scales with how much of the page is affected — see source) | Performance |

**What triggers it & why it matters:** Scripts in the head without async/defer stop the browser from parsing the rest of the page until they finish loading.

**How to fix it & effect on score:** Add defer (or async, if order doesn't matter) to head scripts, or move them before `</body>`. Fixing this removes the 7–11 pts (scales with how much of the page is affected — see source) deduction from the **Performance** category score on the next scan.

**What a pass looks like:** No render-blocking scripts in `<head>`


---

<a id="rule-cls-images"></a>
## `cls-images`

**N of N images missing width/height**

| Severity | Weight | Category |
|---|---|---|
| Medium–High | 6–10 pts (scales with how much of the page is affected — see source) | Performance |

**What triggers it & why it matters:** Images without explicit dimensions cause layout shifts as they load, pushing content around the page.

**How to fix it & effect on score:** Add width and height attributes (or aspect-ratio in CSS) to every image. Fixing this removes the 6–10 pts (scales with how much of the page is affected — see source) deduction from the **Performance** category score on the next scan.

**What a pass looks like:** Images have explicit dimensions


---

<a id="rule-compression"></a>
## `compression`

**Response is not compressed**

| Severity | Weight | Category |
|---|---|---|
| High | 9 pts | Performance |

**What triggers it & why it matters:** No gzip/Brotli content-encoding header was returned, so the page transfers larger than necessary.

**How to fix it & effect on score:** Enable gzip or Brotli compression on the server or CDN. Fixing this removes the 9 pts deduction from the **Performance** category score on the next scan.

**What a pass looks like:** Response is compressed


---

<a id="rule-cache"></a>
## `cache`

**No Cache-Control header**

| Severity | Weight | Category |
|---|---|---|
| Medium | 6 pts | Performance |

**What triggers it & why it matters:** Without caching headers, repeat visitors re-download the page unnecessarily.

**How to fix it & effect on score:** Set Cache-Control headers appropriate to how often the page changes. Fixing this removes the 6 pts deduction from the **Performance** category score on the next scan.

**What a pass looks like:** Cache-Control header is set


---

<a id="rule-css-count"></a>
## `css-count`

**N separate stylesheets loaded**

| Severity | Weight | Category |
|---|---|---|
| Medium | 6 pts | Performance |

**What triggers it & why it matters:** Many separate CSS files each cost a network round trip before the page can be styled.

**How to fix it & effect on score:** Bundle stylesheets and load non-critical CSS asynchronously. Fixing this removes the 6 pts deduction from the **Performance** category score on the next scan.


---

<a id="rule-lazy-loading"></a>
## `lazy-loading`

**No images use lazy loading**

| Severity | Weight | Category |
|---|---|---|
| Medium | 5 pts | Performance |

**What triggers it & why it matters:** Every image on a long page loads immediately, even ones far below the fold.

**How to fix it & effect on score:** Add loading="lazy" to images that appear below the initial viewport. Fixing this removes the 5 pts deduction from the **Performance** category score on the next scan.


---