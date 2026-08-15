# JS Rendering / Client-Side Content

[← Back to Home](https://github.com/armin5872/OptiQra/wiki/Home)

Checks that compare a page's raw HTML against its JavaScript-rendered DOM to quantify how much content is added by client-side rendering — the same signal GEO's JS-dependency check draws on, exposed as its own diagnostic. Source: `src/lib/jsRenderer.ts` (`analyzeJsRendering`).

**2 rules in this category.**

| ID | Rule | Severity | Weight |
|---|---|---|---|
| `js-render-timeout` | [JavaScript rendering timed out](#rule-js-render-timeout) | Low | 4 pts |
| `js-render-errors` | [N script error(s) during rendering](#rule-js-render-errors) | Low | 3 pts |

---

<a id="rule-js-render-timeout"></a>
## `js-render-timeout`

**JavaScript rendering timed out**

| Severity | Weight | Category |
|---|---|---|
| Low | 4 pts | JS Rendering / Client-Side Content |

**What triggers it & why it matters:** The page's scripts were still running after Nms, so this scan snapshotted whatever had rendered by then. Content that only appears after a slow fetch or long-running script may be missing from this scan.

**How to fix it & effect on score:** If the page depends on slow client-side data fetching, consider server-rendering or statically generating the initial content instead. Fixing this removes the 4 pts deduction from the **JS Rendering / Client-Side Content** category score on the next scan.

**What a pass looks like:** JavaScript finished rendering within the time budget


---

<a id="rule-js-render-errors"></a>
## `js-render-errors`

**N script error(s) during rendering**

| Severity | Weight | Category |
|---|---|---|
| Low | 3 pts | JS Rendering / Client-Side Content |

**What triggers it & why it matters:** The page's own JavaScript threw errors while this scan rendered it: *(actual value)*N. Errors like these can also break rendering for real visitors and JS-executing crawlers.

**How to fix it & effect on score:** Open the page in a browser devtools console to reproduce and fix the underlying script error. Fixing this removes the 3 pts deduction from the **JS Rendering / Client-Side Content** category score on the next scan.

**What a pass looks like:** No script errors during rendering


---