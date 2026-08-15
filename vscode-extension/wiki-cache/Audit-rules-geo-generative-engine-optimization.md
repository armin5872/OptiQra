# GEO (Generative Engine Optimization)

[← Back to Home](https://github.com/armin5872/OptiQra/wiki/Home)

Checks specific to how generative AI models (the ones answering questions directly, not just linking out) read, ground, and cite a page — entity disambiguation, JS-dependent content, quotability, statistic density. Source: `src/lib/geoAudit.ts` (`analyzeGEO`).

**10 rules in this category.**

| ID | Rule | Severity | Weight |
|---|---|---|---|
| `geo-js-rendered-content` | [Page content appears to require JavaScript to render](#rule-geo-js-rendered-content) | High | 10 pts |
| `geo-entity-grounding-missing` | [Entity schema has no sameAs links to authoritative profiles](#rule-geo-entity-grounding-missing) | Medium | 6 pts |
| `geo-noai-directive` | [Page includes a generative-AI opt-out directive](#rule-geo-noai-directive) | Medium | 6 pts |
| `geo-statistics-density` | [No statistics, percentages, or figures found in the content](#rule-geo-statistics-density) | Medium | 5 pts |
| `geo-table-headers` | [N of N table(s) on the page has/have no header cells](#rule-geo-table-headers) | Low | 4 pts |
| `geo-attributed-quotes-missing` | [No directly attributed quotations found](#rule-geo-attributed-quotes-missing) | Low | 3 pts |
| `geo-content-chunking` | [At least one section runs to roughly N words without a subheading](#rule-geo-content-chunking) | Low | 3 pts |
| `geo-sentence-length` | [Average sentence length is N words](#rule-geo-sentence-length) | Low | 3 pts |
| `geo-attributed-quotes` | [Content includes N directly attributed quote(s)](#rule-geo-attributed-quotes) | Positive signal | 0 pts |
| `geo-entity-grounding` | [Organization/Person schema includes sameAs links to authoritative external profiles](#rule-geo-entity-grounding) | Positive signal | 0 pts |

---

<a id="rule-geo-js-rendered-content"></a>
## `geo-js-rendered-content`

**Page content appears to require JavaScript to render**

| Severity | Weight | Category |
|---|---|---|
| High | 10 pts | GEO (Generative Engine Optimization) |

**What triggers it & why it matters:** Only about N word(s) of text are present in the raw HTML, alongside N external script tag(s) and a client-rendered app-shell marker. Most generative-engine crawlers (GPTBot, ClaudeBot, PerplexityBot, Google-Extended) fetch raw HTML and do not execute JavaScript, so content that only appears after hydration is effectively invisible to them, even though a browser visitor sees it fine. Turn on "Render JavaScript" in scan options to confirm this rather than estimate it.

**How to fix it & effect on score:** Server-render (or statically generate/prerender) the primary content so it's present in the initial HTML response, not just after client-side JavaScript runs. Fixing this removes the 10 pts deduction from the **GEO (Generative Engine Optimization)** category score on the next scan.

**What a pass looks like:** Page's main content is present in the raw HTML, not dependent on client-side JavaScript


---

<a id="rule-geo-entity-grounding-missing"></a>
## `geo-entity-grounding-missing`

**Entity schema has no sameAs links to authoritative profiles**

| Severity | Weight | Category |
|---|---|---|
| Medium | 6 pts | GEO (Generative Engine Optimization) |

**What triggers it & why it matters:** The page's Organization/Person structured data doesn't include a sameAs property pointing to an external authoritative profile (Wikipedia, Wikidata, LinkedIn, Crunchbase, GitHub, etc.). Generative engines rely heavily on entity grounding to disambiguate brands and people before deciding what to say about them; without it, an AI answer engine may confuse this entity with a similarly named one or simply have less confidence citing it.

**How to fix it & effect on score:** Add a sameAs array to your Organization/Person JSON-LD listing this entity's Wikipedia/Wikidata page (if one exists) and other authoritative profiles. Fixing this removes the 6 pts deduction from the **GEO (Generative Engine Optimization)** category score on the next scan.


---

<a id="rule-geo-noai-directive"></a>
## `geo-noai-directive`

**Page includes a generative-AI opt-out directive**

| Severity | Weight | Category |
|---|---|---|
| Medium | 6 pts | GEO (Generative Engine Optimization) |

**What triggers it & why it matters:** The robots meta tag includes *(comma-separated list of the specific items found)*, an emerging token that some AI crawlers and training pipelines respect as an explicit opt-out. If this content is meant to be eligible for AI answer engines, this directive works directly against that.

**How to fix it & effect on score:** Remove noai/noimageai from the robots meta tag if you want this content eligible for generative-engine answers; keep it only if the opt-out is intentional. Fixing this removes the 6 pts deduction from the **GEO (Generative Engine Optimization)** category score on the next scan.

**What a pass looks like:** No noai/noimageai directive blocking generative use


---

<a id="rule-geo-statistics-density"></a>
## `geo-statistics-density`

**No statistics, percentages, or figures found in the content**

| Severity | Weight | Category |
|---|---|---|
| Medium | 5 pts | GEO (Generative Engine Optimization) |

**What triggers it & why it matters:** The page has roughly N words of body text but no detectable numeric statistics, percentages, or dollar figures. Generative engines disproportionately lift and cite pages that back claims with concrete, quotable numbers rather than purely qualitative statements.

**How to fix it & effect on score:** Where relevant, back key claims with specific figures (percentages, counts, dates, dollar amounts) rather than vague qualifiers like "many" or "significant". Fixing this removes the 5 pts deduction from the **GEO (Generative Engine Optimization)** category score on the next scan.

**What a pass looks like:** Content includes N quotable statistic(s)/figure(s)


---

<a id="rule-geo-table-headers"></a>
## `geo-table-headers`

**N of N table(s) on the page has/have no header cells**

| Severity | Weight | Category |
|---|---|---|
| Low | 4 pts | GEO (Generative Engine Optimization) |

**What triggers it & why it matters:** Tables without `<th>` header cells (in a `<thead>` or the first row) don't tell an extraction pipeline what each column or row represents, so generative engines are far less likely to lift the data accurately into a generated answer or comparison.

**How to fix it & effect on score:** Add `<th scope="col">` (or scope="row") header cells to every data table so each value's meaning is unambiguous without visual layout. Fixing this removes the 4 pts deduction from the **GEO (Generative Engine Optimization)** category score on the next scan.

**What a pass looks like:** Data tables use proper header cells, making them reliable for generative engines to extract


---

<a id="rule-geo-attributed-quotes-missing"></a>
## `geo-attributed-quotes-missing`

**No directly attributed quotations found**

| Severity | Weight | Category |
|---|---|---|
| Low | 3 pts | GEO (Generative Engine Optimization) |

**What triggers it & why it matters:** No quoted statements tied to a named source (e.g. '"...", said/according to...') were found in the body text. Attributed quotes give generative engines a low-risk, verifiable snippet to reproduce, which increases the odds a page gets cited rather than paraphrased or skipped.

**How to fix it & effect on score:** Where you're citing an expert, customer, study author, or spokesperson, quote them directly and attribute the quote by name. Fixing this removes the 3 pts deduction from the **GEO (Generative Engine Optimization)** category score on the next scan.


---

<a id="rule-geo-content-chunking"></a>
## `geo-content-chunking`

**At least one section runs to roughly N words without a subheading**

| Severity | Weight | Category |
|---|---|---|
| Low | 3 pts | GEO (Generative Engine Optimization) |

**What triggers it & why it matters:** Generative engines and RAG pipelines typically retrieve content in heading-bounded chunks. A long run of text under a single heading is harder to retrieve precisely and more likely to be partially or incorrectly quoted.

**How to fix it & effect on score:** Break long sections into smaller subsections with their own H3 headings, each covering one idea. Fixing this removes the 3 pts deduction from the **GEO (Generative Engine Optimization)** category score on the next scan.

**What a pass looks like:** Content is broken into well-sized, heading-bounded sections


---

<a id="rule-geo-sentence-length"></a>
## `geo-sentence-length`

**Average sentence length is N words**

| Severity | Weight | Category |
|---|---|---|
| Low | 3 pts | GEO (Generative Engine Optimization) |

**What triggers it & why it matters:** Generative engines tend to extract and quote short, self-contained sentences rather than paraphrase long, clause-heavy ones. This page's prose runs long on average, making individual sentences harder to lift cleanly into a generated answer.

**How to fix it & effect on score:** Break long sentences into shorter, single-idea statements, especially in sections most likely to be quoted (openings, key claims, definitions). Fixing this removes the 3 pts deduction from the **GEO (Generative Engine Optimization)** category score on the next scan.

**What a pass looks like:** Average sentence length (N words) is easy to quote


---

<a id="rule-geo-attributed-quotes"></a>
## `geo-attributed-quotes`

**Content includes N directly attributed quote(s)**

| Severity | Weight | Category |
|---|---|---|
| Positive signal | 0 pts | GEO (Generative Engine Optimization) |

**What triggers it & why it matters:** This rule only ever surfaces as a passing signal in the current source — it fires (as a pass) when: *Content includes N directly attributed quote(s)*. There is no separate failing `issue()` call under this exact id; the failure condition is the logical negation of the pass condition, and in most cases is covered by a related rule id documented elsewhere in this category (see the table above for a sibling rule on the same feature).

**Effect on score:** Meeting this condition costs nothing and confirms a positive signal. Missing it doesn't directly deduct points under *this* id — it typically shows up as a deduction under the related failing rule instead.


---

<a id="rule-geo-entity-grounding"></a>
## `geo-entity-grounding`

**Organization/Person schema links to Wikipedia or Wikidata for entity disambiguation**

| Severity | Weight | Category |
|---|---|---|
| Positive signal | 0 pts | GEO (Generative Engine Optimization) |

**What triggers it & why it matters:** This rule only ever surfaces as a passing signal in the current source — it fires (as a pass) when: *Organization/Person schema includes sameAs links to authoritative external profiles*. There is no separate failing `issue()` call under this exact id; the failure condition is the logical negation of the pass condition, and in most cases is covered by a related rule id documented elsewhere in this category (see the table above for a sibling rule on the same feature).

**Effect on score:** Meeting this condition costs nothing and confirms a positive signal. Missing it doesn't directly deduct points under *this* id — it typically shows up as a deduction under the related failing rule instead.


---