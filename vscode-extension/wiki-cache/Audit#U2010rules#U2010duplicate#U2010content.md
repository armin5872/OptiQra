# Duplicate Content

[← Back to Home](https://github.com/armin5872/OptiQra/wiki/Home)

Checks across every crawled page for byte-identical duplicates, near-duplicate/templated content, and repeated titles — content patterns that dilute ranking signal and confuse which URL should be indexed. Source: `src/lib/duplicateContentAudit.ts` (`analyzeDuplicateContent`).

**5 rules in this category.**

| ID | Rule | Severity | Weight |
|---|---|---|---|
| `duplicate-body-content` | [N group(s) of pages have identical main content (N pages total)](#rule-duplicate-body-content) | High | 10 pts |
| `duplicate-title` | [N title tag(s) reused across N pages](#rule-duplicate-title) | Medium | 8 pts |
| `near-duplicate-content` | [N pair(s) of pages are near-duplicates (≥N% similar text)](#rule-near-duplicate-content) | Medium | 6 pts |
| `duplicate-meta-description` | [N meta description(s) reused across N pages](#rule-duplicate-meta-description) | Medium | 5 pts |
| `duplicate-content` | [No duplicate or near-duplicate page content detected](#rule-duplicate-content) | Positive signal | 0 pts |

---

<a id="rule-duplicate-body-content"></a>
## `duplicate-body-content`

**N group(s) of pages have identical main content (N pages total)**

| Severity | Weight | Category |
|---|---|---|
| High | 10 pts | Duplicate Content |

**What triggers it & why it matters:** Some pages returned byte-for-byte identical visible text (after stripping scripts/nav/footer). This usually means URL variants, parameter duplicates, or templated pages serving the same content, which splits ranking signals and wastes crawl budget.

**How to fix it & effect on score:** Consolidate duplicate pages, add a canonical URL, or add unique content to differentiate each page. Fixing this removes the 10 pts deduction from the **Duplicate Content** category score on the next scan.


---

<a id="rule-duplicate-title"></a>
## `duplicate-title`

**N title tag(s) reused across N pages**

| Severity | Weight | Category |
|---|---|---|
| Medium | 8 pts | Duplicate Content |

**What triggers it & why it matters:** The same `<title>` text appears on multiple pages (e.g. "*(actual value found on the page, truncated)*…" on N page(s)). Search engines rely on unique titles to tell pages apart in results.

**How to fix it & effect on score:** Give each page a unique, descriptive `<title>` that reflects its specific content. Fixing this removes the 8 pts deduction from the **Duplicate Content** category score on the next scan.

**What a pass looks like:** No duplicate title tags found across scanned pages


---

<a id="rule-near-duplicate-content"></a>
## `near-duplicate-content`

**N pair(s) of pages are near-duplicates (≥N% similar text)**

| Severity | Weight | Category |
|---|---|---|
| Medium | 6 pts | Duplicate Content |

**What triggers it & why it matters:** For example, two scanned pages share roughly N% of the same text. Highly similar pages compete with each other in search results instead of ranking well individually.

**How to fix it & effect on score:** Differentiate near-duplicate pages with unique content, or merge/redirect and canonicalize them if they serve the same purpose. Fixing this removes the 6 pts deduction from the **Duplicate Content** category score on the next scan.


---

<a id="rule-duplicate-meta-description"></a>
## `duplicate-meta-description`

**N meta description(s) reused across N pages**

| Severity | Weight | Category |
|---|---|---|
| Medium | 5 pts | Duplicate Content |

**What triggers it & why it matters:** The same meta description appears on multiple pages (e.g. on N page(s)). Duplicate descriptions reduce click-through in search results and give search engines no signal to differentiate pages.

**How to fix it & effect on score:** Write a unique meta description for each page summarizing its specific content. Fixing this removes the 5 pts deduction from the **Duplicate Content** category score on the next scan.

**What a pass looks like:** No duplicate meta descriptions found across scanned pages


---

<a id="rule-duplicate-content"></a>
## `duplicate-content`

**No duplicate or near-duplicate page content detected**

| Severity | Weight | Category |
|---|---|---|
| Positive signal | 0 pts | Duplicate Content |

**What triggers it & why it matters:** This rule only ever surfaces as a passing signal in the current source — it fires (as a pass) when: *No duplicate or near-duplicate page content detected*. There is no separate failing `issue()` call under this exact id; the failure condition is the logical negation of the pass condition, and in most cases is covered by a related rule id documented elsewhere in this category (see the table above for a sibling rule on the same feature).

**Effect on score:** Meeting this condition costs nothing and confirms a positive signal. Missing it doesn't directly deduct points under *this* id — it typically shows up as a deduction under the related failing rule instead.


---