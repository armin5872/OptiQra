# Links

[← Back to Home](https://github.com/armin5872/OptiQra/wiki/Home)

Checks the site's internal/external link graph — broken links, redirect chains, empty anchors, and how much of the link set could be verified within the scan's time budget. Source: `src/lib/link-analyzer.ts` (`buildLinkIssues`, `findBrokenLinksAcrossSite`).

**12 rules in this category.**

| ID | Rule | Severity | Weight |
|---|---|---|---|
| `broken-internal-links` | [N broken internal link(s) found across the site](#rule-broken-internal-links) | High | 12 pts |
| `broken-links` | [N broken link(s) found](#rule-broken-links) | High | 12 pts |
| `links-without-text` | [N link(s) have no accessible text](#rule-links-without-text) | Medium | 5 pts |
| `broken-external-links` | [N broken external link(s) found across the site](#rule-broken-external-links) | Low | 4 pts |
| `javascript-links` | [N link(s) use javascript: hrefs](#rule-javascript-links) | Low | 4 pts |
| `missing-rel-noopener` | [N target="_blank" link(s) missing rel="noopener"](#rule-missing-rel-noopener) | Low | 4 pts |
| `empty-hrefs` | [N link(s) with empty or missing href](#rule-empty-hrefs) | Low | 3 pts |
| `malformed-hrefs` | [N link(s) with an unparsable href](#rule-malformed-hrefs) | Low | 3 pts |
| `too-many-external-links` | [Page has N external links (over the N threshold)](#rule-too-many-external-links) | Low | 3 pts |
| `duplicate-links` | [N URL(s) linked to multiple times on this page](#rule-duplicate-links) | Low | 2 pts |
| `link-check-coverage` | [Checked N of N unique links found (the rest were skipped to stay within the scan's time budget, prioritizing links referenced from the most pages)](#rule-link-check-coverage) | Positive signal | 0 pts |
| `link-hygiene` | [No broken, empty, or malformed links found](#rule-link-hygiene) | Positive signal | 0 pts |

---

<a id="rule-broken-internal-links"></a>
## `broken-internal-links`

**N broken internal link(s) found across the site**

| Severity | Weight | Category |
|---|---|---|
| High | 12 pts | Links |

**What triggers it & why it matters:** N unique internal URL(s) returned an error (e.g. "N" → *(actual HTTP status code)*), referenced from *(actual value)* link instance(s) across the crawled pages.

**How to fix it & effect on score:** Fix or remove broken internal links, or add redirects for moved pages. Fixing this removes the 12 pts deduction from the **Links** category score on the next scan.

**What a pass looks like:** No broken internal links found across scanned pages


---

<a id="rule-broken-links"></a>
## `broken-links`

**N broken link(s) found**

| Severity | Weight | Category |
|---|---|---|
| High | 12 pts | Links |

**What triggers it & why it matters:** N link(s) on this page returned an error (e.g. "N" → *(actual HTTP status code)*).

**How to fix it & effect on score:** Fix or remove broken links, or update them to point at the correct destination. Fixing this removes the 12 pts deduction from the **Links** category score on the next scan.

**What a pass looks like:** All checked links resolve successfully


---

<a id="rule-links-without-text"></a>
## `links-without-text`

**N link(s) have no accessible text**

| Severity | Weight | Category |
|---|---|---|
| Medium | 5 pts | Links |

**What triggers it & why it matters:** Links with no text, aria-label, title, or alt text on a contained image are announced as just "link" by screen readers and provide no context to search engines.

**How to fix it & effect on score:** Add descriptive link text, an aria-label, or alt text on the linked image. Fixing this removes the 5 pts deduction from the **Links** category score on the next scan.


---

<a id="rule-broken-external-links"></a>
## `broken-external-links`

**N broken external link(s) found across the site**

| Severity | Weight | Category |
|---|---|---|
| Low | 4 pts | Links |

**What triggers it & why it matters:** N external URL(s) referenced from your pages returned an error or timed out (e.g. "N" → *(actual HTTP status code)*).

**How to fix it & effect on score:** Update or remove links to external sites that no longer resolve. Fixing this removes the 4 pts deduction from the **Links** category score on the next scan.

**What a pass looks like:** No broken external links found across scanned pages


---

<a id="rule-javascript-links"></a>
## `javascript-links`

**N link(s) use javascript: hrefs**

| Severity | Weight | Category |
|---|---|---|
| Low | 4 pts | Links |

**What triggers it & why it matters:** javascript: URLs aren't crawlable and often break middle-click/open-in-new-tab behavior.

**How to fix it & effect on score:** Use a real href and attach behavior via an event listener instead. Fixing this removes the 4 pts deduction from the **Links** category score on the next scan.


---

<a id="rule-missing-rel-noopener"></a>
## `missing-rel-noopener`

**N target="_blank" link(s) missing rel="noopener"**

| Severity | Weight | Category |
|---|---|---|
| Low | 4 pts | Links |

**What triggers it & why it matters:** Links that open in a new tab without rel="noopener noreferrer" let the destination page access window.opener, a known tabnabbing risk.

**How to fix it & effect on score:** Add rel="noopener noreferrer" to every target="_blank" link. Fixing this removes the 4 pts deduction from the **Links** category score on the next scan.


---

<a id="rule-empty-hrefs"></a>
## `empty-hrefs`

**N link(s) with empty or missing href**

| Severity | Weight | Category |
|---|---|---|
| Low | 3 pts | Links |

**What triggers it & why it matters:** Anchor tags without a valid href are not real links to crawlers or assistive tech, and often indicate leftover placeholder markup.

**How to fix it & effect on score:** Add a valid href, or use a `<button>` element if it isn't meant to navigate. Fixing this removes the 3 pts deduction from the **Links** category score on the next scan.


---

<a id="rule-malformed-hrefs"></a>
## `malformed-hrefs`

**N link(s) with an unparsable href**

| Severity | Weight | Category |
|---|---|---|
| Low | 3 pts | Links |

**What triggers it & why it matters:** These href values (e.g. containing stray spaces or invalid characters) can't be resolved into a valid URL at all, so browsers, crawlers, and assistive tech may fail to follow them.

**How to fix it & effect on score:** Fix the href so it forms a valid, properly encoded URL. Fixing this removes the 3 pts deduction from the **Links** category score on the next scan.


---

<a id="rule-too-many-external-links"></a>
## `too-many-external-links`

**Page has N external links (over the N threshold)**

| Severity | Weight | Category |
|---|---|---|
| Low | 3 pts | Links |

**What triggers it & why it matters:** A very high number of external links can dilute page authority and, in extreme cases, resemble a link farm to search engines.

**How to fix it & effect on score:** Review external links and keep only those that add genuine value for readers. Fixing this removes the 3 pts deduction from the **Links** category score on the next scan.


---

<a id="rule-duplicate-links"></a>
## `duplicate-links`

**N URL(s) linked to multiple times on this page**

| Severity | Weight | Category |
|---|---|---|
| Low | 2 pts | Links |

**What triggers it & why it matters:** For example, "N" appears N times. Not necessarily an error, but excessive repetition can dilute link equity and clutter navigation.

**How to fix it & effect on score:** Consolidate repeated links where possible, keeping only the most meaningful instance. Fixing this removes the 2 pts deduction from the **Links** category score on the next scan.


---

<a id="rule-link-check-coverage"></a>
## `link-check-coverage`

**Checked N of N unique links found (the rest were skipped to stay within the scan's time budget, prioritizing links referenced from the most pages)**

| Severity | Weight | Category |
|---|---|---|
| Positive signal | 0 pts | Links |

**What triggers it & why it matters:** This rule only ever surfaces as a passing signal in the current source — it fires (as a pass) when: *Checked N of N unique links found (the rest were skipped to stay within the scan's time budget, prioritizing links referenced from the most pages)*. There is no separate failing `issue()` call under this exact id; the failure condition is the logical negation of the pass condition, and in most cases is covered by a related rule id documented elsewhere in this category (see the table above for a sibling rule on the same feature).

**Effect on score:** Meeting this condition costs nothing and confirms a positive signal. Missing it doesn't directly deduct points under *this* id — it typically shows up as a deduction under the related failing rule instead.


---

<a id="rule-link-hygiene"></a>
## `link-hygiene`

**No broken, empty, or malformed links found**

| Severity | Weight | Category |
|---|---|---|
| Positive signal | 0 pts | Links |

**What triggers it & why it matters:** This rule only ever surfaces as a passing signal in the current source — it fires (as a pass) when: *No broken, empty, or malformed links found*. There is no separate failing `issue()` call under this exact id; the failure condition is the logical negation of the pass condition, and in most cases is covered by a related rule id documented elsewhere in this category (see the table above for a sibling rule on the same feature).

**Effect on score:** Meeting this condition costs nothing and confirms a positive signal. Missing it doesn't directly deduct points under *this* id — it typically shows up as a deduction under the related failing rule instead.


---