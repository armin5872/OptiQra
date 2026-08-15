<html>
<body>
<!--StartFragment--><html><head></head><body><h1>Crawling &amp; Indexing (robots.txt / sitemap)</h1>
<p><a href="https://github.com/armin5872/OptiQra/wiki/Home">← Back to Home</a></p>
<p>Checks robots.txt syntax and reachability, and sitemap.xml/sitemap-index validity, size limits, and content — the two files that control whether crawlers (search or AI) can discover and index a site at all. Source: <code>src/lib/crawlAudit.ts</code> (<code>analyzeCrawlFiles</code>).</p>
<p><strong>33 rules in this category.</strong></p>

ID | Rule | Severity | Weight
-- | -- | -- | --
robots-disallow-all | robots.txt blocks all crawlers | Critical | 15 pts
sitemap-empty | Sitemap contains no URLs | High | 10 pts
sitemap-fetch | Could not fetch XML sitemap | High | 10 pts
sitemap-http | Sitemap returned HTTP (actual HTTP status code) | High | 10 pts
sitemap-not-xml | Sitemap response is not XML | High | 10 pts
sitemap-parse | Sitemap XML could not be parsed | High | 10 pts
sitemap-root | Invalid sitemap root element | High | 10 pts
sitemap-index-empty | Sitemap index contains no child sitemaps | High | 9 pts
sitemap-missing-loc | N sitemap entry is/ies are missing <loc> | High | 9 pts
robots-error | robots.txt returned HTTP (actual HTTP status code) | Medium | 8 pts
sitemap-index-missing-loc | N sitemap index entry is/ies are missing <loc> | Medium | 8 pts
sitemap-index-size | Sitemap index lists N child sitemaps (limit is 50,000) | Medium | 8 pts
sitemap-invalid-loc | N sitemap URL(s) is/are not valid absolute URLs | Medium | 8 pts
sitemap-missing | No XML sitemap found | Medium | 8 pts
sitemap-size | Sitemap lists N URLs (limit is 50,000) | Medium | 8 pts
robots-fetch | Could not fetch robots.txt | Medium | 7 pts
robots-no-groups | robots.txt has no User-agent blocks | Medium | 7 pts
sitemap-file-size | Sitemap file is N MB (limit is 50 MB uncompressed) | Medium | 7 pts
sitemap-index-invalid-loc | N child sitemap URL(s) is/are invalid | Medium | 7 pts
sitemap-index-unreachable | N referenced child sitemap(s) could not be reached | Medium | 7 pts
sitemap-off-domain | Sitemap URLs are all on a different domain | Medium | 7 pts
robots-missing | No robots.txt found | Medium | 6 pts
robots-no-sitemap | robots.txt does not declare a sitemap | Medium | 6 pts
robots-empty | robots.txt is empty | Medium | 5 pts
sitemap-duplicates | N duplicate URL(s) in sitemap | Medium | 5 pts
robots-malformed | robots.txt contains unrecognized directives | Low | 4 pts
sitemap-lastmod | N sitemap entry has/ies have invalid lastmod dates | Low | 4 pts
sitemap-mixed-domain | N sitemap URL(s) on a different domain | Low | 4 pts
robots-content-type | robots.txt has an unusual Content-Type | Low | 3 pts
robots-present | robots.txt is present and readable | Positive signal | 0 pts
robots-sitemap-declared | robots.txt declares N sitemap(s) | Positive signal | 0 pts
sitemap-index-valid | Sitemap index is valid (N child sitemap(s)) | Positive signal | 0 pts
sitemap-valid | Sitemap is valid (N URL(s)) | Positive signal | 0 pts


<p><strong>What triggers it &amp; why it matters:</strong> This rule only ever surfaces as a passing signal in the current source — it fires (as a pass) when: <em>Sitemap is valid (N URL(s))</em>. There is no separate failing <code>issue()</code> call under this exact id; the failure condition is the logical negation of the pass condition, and in most cases is covered by a related rule id documented elsewhere in this category (see the table above for a sibling rule on the same feature).</p>
<p><strong>Effect on score:</strong> Meeting this condition costs nothing and confirms a positive signal. Missing it doesn't directly deduct points under <em>this</em> id — it typically shows up as a deduction under the related failing rule instead.</p>
<hr></body></html><!--EndFragment-->
</body>
</html># Crawling & Indexing (robots.txt / sitemap)

[[← Back to Home](https://github.com/armin5872/OptiQra/wiki/Home)](https://github.com/armin5872/OptiQra/wiki/Home)

Checks robots.txt syntax and reachability, and sitemap.xml/sitemap-index validity, size limits, and content — the two files that control whether crawlers (search or AI) can discover and index a site at all. Source: `src/lib/crawlAudit.ts` (`analyzeCrawlFiles`).

**33 rules in this category.**

| ID | Rule | Severity | Weight |
|---|---|---|---|
| `robots-disallow-all` | [[robots.txt blocks all crawlers](https://github.com/armin5872/OptiQra/wiki/Audit-rules-crawling-indexing-robotstxt-sitemap#rule-robots-disallow-all)](#rule-robots-disallow-all) | Critical | 15 pts |
| `sitemap-empty` | [[Sitemap contains no URLs](https://github.com/armin5872/OptiQra/wiki/Audit-rules-crawling-indexing-robotstxt-sitemap#rule-sitemap-empty)](#rule-sitemap-empty) | High | 10 pts |
| `sitemap-fetch` | [[Could not fetch XML sitemap](https://github.com/armin5872/OptiQra/wiki/Audit-rules-crawling-indexing-robotstxt-sitemap#rule-sitemap-fetch)](#rule-sitemap-fetch) | High | 10 pts |
| `sitemap-http` | [Sitemap returned HTTP *(actual HTTP status code)*](#rule-sitemap-http) | High | 10 pts |
| `sitemap-not-xml` | [[Sitemap response is not XML](https://github.com/armin5872/OptiQra/wiki/Audit-rules-crawling-indexing-robotstxt-sitemap#rule-sitemap-not-xml)](#rule-sitemap-not-xml) | High | 10 pts |
| `sitemap-parse` | [[Sitemap XML could not be parsed](https://github.com/armin5872/OptiQra/wiki/Audit-rules-crawling-indexing-robotstxt-sitemap#rule-sitemap-parse)](#rule-sitemap-parse) | High | 10 pts |
| `sitemap-root` | [[Invalid sitemap root element](https://github.com/armin5872/OptiQra/wiki/Audit-rules-crawling-indexing-robotstxt-sitemap#rule-sitemap-root)](#rule-sitemap-root) | High | 10 pts |
| `sitemap-index-empty` | [[Sitemap index contains no child sitemaps](https://github.com/armin5872/OptiQra/wiki/Audit-rules-crawling-indexing-robotstxt-sitemap#rule-sitemap-index-empty)](#rule-sitemap-index-empty) | High | 9 pts |
| `sitemap-missing-loc` | [N sitemap entry is/ies are missing `<loc>`](#rule-sitemap-missing-loc) | High | 9 pts |
| `robots-error` | [robots.txt returned HTTP *(actual HTTP status code)*](#rule-robots-error) | Medium | 8 pts |
| `sitemap-index-missing-loc` | [N sitemap index entry is/ies are missing `<loc>`](#rule-sitemap-index-missing-loc) | Medium | 8 pts |
| `sitemap-index-size` | [[Sitemap index lists N child sitemaps (limit is 50,000)](https://github.com/armin5872/OptiQra/wiki/Audit-rules-crawling-indexing-robotstxt-sitemap#rule-sitemap-index-size)](#rule-sitemap-index-size) | Medium | 8 pts |
| `sitemap-invalid-loc` | [[N sitemap URL(s) is/are not valid absolute URLs](https://github.com/armin5872/OptiQra/wiki/Audit-rules-crawling-indexing-robotstxt-sitemap#rule-sitemap-invalid-loc)](#rule-sitemap-invalid-loc) | Medium | 8 pts |
| `sitemap-missing` | [[No XML sitemap found](https://github.com/armin5872/OptiQra/wiki/Audit-rules-crawling-indexing-robotstxt-sitemap#rule-sitemap-missing)](#rule-sitemap-missing) | Medium | 8 pts |
| `sitemap-size` | [[Sitemap lists N URLs (limit is 50,000)](https://github.com/armin5872/OptiQra/wiki/Audit-rules-crawling-indexing-robotstxt-sitemap#rule-sitemap-size)](#rule-sitemap-size) | Medium | 8 pts |
| `robots-fetch` | [[Could not fetch robots.txt](https://github.com/armin5872/OptiQra/wiki/Audit-rules-crawling-indexing-robotstxt-sitemap#rule-robots-fetch)](#rule-robots-fetch) | Medium | 7 pts |
| `robots-no-groups` | [[robots.txt has no User-agent blocks](https://github.com/armin5872/OptiQra/wiki/Audit-rules-crawling-indexing-robotstxt-sitemap#rule-robots-no-groups)](#rule-robots-no-groups) | Medium | 7 pts |
| `sitemap-file-size` | [[Sitemap file is N MB (limit is 50 MB uncompressed)](https://github.com/armin5872/OptiQra/wiki/Audit-rules-crawling-indexing-robotstxt-sitemap#rule-sitemap-file-size)](#rule-sitemap-file-size) | Medium | 7 pts |
| `sitemap-index-invalid-loc` | [[N child sitemap URL(s) is/are invalid](https://github.com/armin5872/OptiQra/wiki/Audit-rules-crawling-indexing-robotstxt-sitemap#rule-sitemap-index-invalid-loc)](#rule-sitemap-index-invalid-loc) | Medium | 7 pts |
| `sitemap-index-unreachable` | [[N referenced child sitemap(s) could not be reached](https://github.com/armin5872/OptiQra/wiki/Audit-rules-crawling-indexing-robotstxt-sitemap#rule-sitemap-index-unreachable)](#rule-sitemap-index-unreachable) | Medium | 7 pts |
| `sitemap-off-domain` | [[Sitemap URLs are all on a different domain](https://github.com/armin5872/OptiQra/wiki/Audit-rules-crawling-indexing-robotstxt-sitemap#rule-sitemap-off-domain)](#rule-sitemap-off-domain) | Medium | 7 pts |
| `robots-missing` | [[No robots.txt found](https://github.com/armin5872/OptiQra/wiki/Audit-rules-crawling-indexing-robotstxt-sitemap#rule-robots-missing)](#rule-robots-missing) | Medium | 6 pts |
| `robots-no-sitemap` | [[robots.txt does not declare a sitemap](https://github.com/armin5872/OptiQra/wiki/Audit-rules-crawling-indexing-robotstxt-sitemap#rule-robots-no-sitemap)](#rule-robots-no-sitemap) | Medium | 6 pts |
| `robots-empty` | [[robots.txt is empty](https://github.com/armin5872/OptiQra/wiki/Audit-rules-crawling-indexing-robotstxt-sitemap#rule-robots-empty)](#rule-robots-empty) | Medium | 5 pts |
| `sitemap-duplicates` | [[N duplicate URL(s) in sitemap](https://github.com/armin5872/OptiQra/wiki/Audit-rules-crawling-indexing-robotstxt-sitemap#rule-sitemap-duplicates)](#rule-sitemap-duplicates) | Medium | 5 pts |
| `robots-malformed` | [[robots.txt contains unrecognized directives](https://github.com/armin5872/OptiQra/wiki/Audit-rules-crawling-indexing-robotstxt-sitemap#rule-robots-malformed)](#rule-robots-malformed) | Low | 4 pts |
| `sitemap-lastmod` | [[N sitemap entry has/ies have invalid lastmod dates](https://github.com/armin5872/OptiQra/wiki/Audit-rules-crawling-indexing-robotstxt-sitemap#rule-sitemap-lastmod)](#rule-sitemap-lastmod) | Low | 4 pts |
| `sitemap-mixed-domain` | [[N sitemap URL(s) on a different domain](https://github.com/armin5872/OptiQra/wiki/Audit-rules-crawling-indexing-robotstxt-sitemap#rule-sitemap-mixed-domain)](#rule-sitemap-mixed-domain) | Low | 4 pts |
| `robots-content-type` | [[robots.txt has an unusual Content-Type](https://github.com/armin5872/OptiQra/wiki/Audit-rules-crawling-indexing-robotstxt-sitemap#rule-robots-content-type)](#rule-robots-content-type) | Low | 3 pts |
| `robots-present` | [[robots.txt is present and readable](https://github.com/armin5872/OptiQra/wiki/Audit-rules-crawling-indexing-robotstxt-sitemap#rule-robots-present)](#rule-robots-present) | Positive signal | 0 pts |
| `robots-sitemap-declared` | [[robots.txt declares N sitemap(s)](https://github.com/armin5872/OptiQra/wiki/Audit-rules-crawling-indexing-robotstxt-sitemap#rule-robots-sitemap-declared)](#rule-robots-sitemap-declared) | Positive signal | 0 pts |
| `sitemap-index-valid` | [[Sitemap index is valid (N child sitemap(s))](https://github.com/armin5872/OptiQra/wiki/Audit-rules-crawling-indexing-robotstxt-sitemap#rule-sitemap-index-valid)](#rule-sitemap-index-valid) | Positive signal | 0 pts |
| `sitemap-valid` | [[Sitemap is valid (N URL(s))](https://github.com/armin5872/OptiQra/wiki/Audit-rules-crawling-indexing-robotstxt-sitemap#rule-sitemap-valid)](#rule-sitemap-valid) | Positive signal | 0 pts |

---

<a id="rule-robots-disallow-all"></a>
## `robots-disallow-all`

**robots.txt blocks all crawlers**

| Severity | Weight | Category |
|---|---|---|
| Critical | 15 pts | Crawling & Indexing (robots.txt / sitemap) |

**What triggers it & why it matters:** User-agent: * includes Disallow: /, which tells search engines not to crawl any pages on the site.

**How to fix it & effect on score:** Remove or narrow the blanket Disallow: / rule unless the entire site should stay out of search results. Fixing this removes the 15 pts deduction from the **Crawling & Indexing (robots.txt / sitemap)** category score on the next scan.


---

<a id="rule-sitemap-empty"></a>
## `sitemap-empty`

**Sitemap contains no URLs**

| Severity | Weight | Category |
|---|---|---|
| High | 10 pts | Crawling & Indexing (robots.txt / sitemap) |

**What triggers it & why it matters:** N parsed as a urlset but has zero `<url>` entries, so it cannot help crawlers discover pages.

**How to fix it & effect on score:** Populate the sitemap with `<url>``<loc>`…`</loc>``</url>` entries for indexable pages. Fixing this removes the 10 pts deduction from the **Crawling & Indexing (robots.txt / sitemap)** category score on the next scan.


---

<a id="rule-sitemap-fetch"></a>
## `sitemap-fetch`

**Could not fetch XML sitemap**

| Severity | Weight | Category |
|---|---|---|
| High | 10 pts | Crawling & Indexing (robots.txt / sitemap) |

**What triggers it & why it matters:** Failed to load N. Crawlers may also struggle to retrieve it.

**How to fix it & effect on score:** Ensure the sitemap URL is publicly accessible and returns HTTP 200. Fixing this removes the 10 pts deduction from the **Crawling & Indexing (robots.txt / sitemap)** category score on the next scan.


---

<a id="rule-sitemap-http"></a>
## `sitemap-http`

**Sitemap returned HTTP *(actual HTTP status code)***

| Severity | Weight | Category |
|---|---|---|
| High | 10 pts | Crawling & Indexing (robots.txt / sitemap) |

**What triggers it & why it matters:** N did not return a successful response, so crawlers cannot use it.

**How to fix it & effect on score:** Fix the sitemap endpoint to return HTTP 200 with valid XML. Fixing this removes the 10 pts deduction from the **Crawling & Indexing (robots.txt / sitemap)** category score on the next scan.


---

<a id="rule-sitemap-not-xml"></a>
## `sitemap-not-xml`

**Sitemap response is not XML**

| Severity | Weight | Category |
|---|---|---|
| High | 10 pts | Crawling & Indexing (robots.txt / sitemap) |

**What triggers it & why it matters:** The sitemap URL returned content that does not look like XML (no leading < tag).

**How to fix it & effect on score:** Serve a valid XML sitemap at this URL. Fixing this removes the 10 pts deduction from the **Crawling & Indexing (robots.txt / sitemap)** category score on the next scan.


---

<a id="rule-sitemap-parse"></a>
## `sitemap-parse`

**Sitemap XML could not be parsed**

| Severity | Weight | Category |
|---|---|---|
| High | 10 pts | Crawling & Indexing (robots.txt / sitemap) |

**What triggers it & why it matters:** The sitemap file appears malformed and could not be parsed as XML.

**How to fix it & effect on score:** Fix XML syntax errors and ensure the file is well-formed. Fixing this removes the 10 pts deduction from the **Crawling & Indexing (robots.txt / sitemap)** category score on the next scan.


---

<a id="rule-sitemap-root"></a>
## `sitemap-root`

**Invalid sitemap root element**

| Severity | Weight | Category |
|---|---|---|
| High | 10 pts | Crawling & Indexing (robots.txt / sitemap) |

**What triggers it & why it matters:** Expected `<urlset>` or `<sitemapindex>` as the root element, but found <*(actual value)*>.

**How to fix it & effect on score:** Use a standards-compliant sitemap structure per sitemaps.org. Fixing this removes the 10 pts deduction from the **Crawling & Indexing (robots.txt / sitemap)** category score on the next scan.


---

<a id="rule-sitemap-index-empty"></a>
## `sitemap-index-empty`

**Sitemap index contains no child sitemaps**

| Severity | Weight | Category |
|---|---|---|
| High | 9 pts | Crawling & Indexing (robots.txt / sitemap) |

**What triggers it & why it matters:** N is a sitemap index but lists no `<sitemap>` entries.

**How to fix it & effect on score:** Add `<sitemap>``<loc>`…`</loc>``</sitemap>` entries pointing to child sitemap files. Fixing this removes the 9 pts deduction from the **Crawling & Indexing (robots.txt / sitemap)** category score on the next scan.


---

<a id="rule-sitemap-missing-loc"></a>
## `sitemap-missing-loc`

**N sitemap entry is/ies are missing `<loc>`**

| Severity | Weight | Category |
|---|---|---|
| High | 9 pts | Crawling & Indexing (robots.txt / sitemap) |

**What triggers it & why it matters:** Every `<url>` entry must include an absolute `<loc>` URL. Entries without one are ignored by crawlers.

**How to fix it & effect on score:** Add a valid absolute URL inside `<loc>` for every `<url>` entry. Fixing this removes the 9 pts deduction from the **Crawling & Indexing (robots.txt / sitemap)** category score on the next scan.


---

<a id="rule-robots-error"></a>
## `robots-error`

**robots.txt returned HTTP *(actual HTTP status code)***

| Severity | Weight | Category |
|---|---|---|
| Medium | 8 pts | Crawling & Indexing (robots.txt / sitemap) |

**What triggers it & why it matters:** Crawlers expect a plain-text robots.txt at the site root. A non-200 response can cause unpredictable crawl behavior.

**How to fix it & effect on score:** Fix the server response for /robots.txt so it returns HTTP 200 with valid plain text. Fixing this removes the 8 pts deduction from the **Crawling & Indexing (robots.txt / sitemap)** category score on the next scan.


---

<a id="rule-sitemap-index-missing-loc"></a>
## `sitemap-index-missing-loc`

**N sitemap index entry is/ies are missing `<loc>`**

| Severity | Weight | Category |
|---|---|---|
| Medium | 8 pts | Crawling & Indexing (robots.txt / sitemap) |

**What triggers it & why it matters:** Each `<sitemap>` entry in an index must include an absolute `<loc>` URL.

**How to fix it & effect on score:** Add valid `<loc>` URLs for every child sitemap. Fixing this removes the 8 pts deduction from the **Crawling & Indexing (robots.txt / sitemap)** category score on the next scan.


---

<a id="rule-sitemap-index-size"></a>
## `sitemap-index-size`

**Sitemap index lists N child sitemaps (limit is 50,000)**

| Severity | Weight | Category |
|---|---|---|
| Medium | 8 pts | Crawling & Indexing (robots.txt / sitemap) |

**What triggers it & why it matters:** A sitemap index may reference at most 50,000 sitemaps.

**How to fix it & effect on score:** Reduce the number of child sitemaps or split across multiple index files. Fixing this removes the 8 pts deduction from the **Crawling & Indexing (robots.txt / sitemap)** category score on the next scan.


---

<a id="rule-sitemap-invalid-loc"></a>
## `sitemap-invalid-loc`

**N sitemap URL(s) is/are not valid absolute URLs**

| Severity | Weight | Category |
|---|---|---|
| Medium | 8 pts | Crawling & Indexing (robots.txt / sitemap) |

**What triggers it & why it matters:** Sitemap `<loc>` values must be full http:// or https:// URLs, not relative paths.

**How to fix it & effect on score:** Use absolute URLs in every `<loc>` element. Fixing this removes the 8 pts deduction from the **Crawling & Indexing (robots.txt / sitemap)** category score on the next scan.


---

<a id="rule-sitemap-missing"></a>
## `sitemap-missing`

**No XML sitemap found**

| Severity | Weight | Category |
|---|---|---|
| Medium | 8 pts | Crawling & Indexing (robots.txt / sitemap) |

**What triggers it & why it matters:** No sitemap was declared in robots.txt and common paths like /sitemap.xml did not return a valid file.

**How to fix it & effect on score:** Create an XML sitemap, validate it, and add a Sitemap: line to robots.txt. Fixing this removes the 8 pts deduction from the **Crawling & Indexing (robots.txt / sitemap)** category score on the next scan.


---

<a id="rule-sitemap-size"></a>
## `sitemap-size`

**Sitemap lists N URLs (limit is 50,000)**

| Severity | Weight | Category |
|---|---|---|
| Medium | 8 pts | Crawling & Indexing (robots.txt / sitemap) |

**What triggers it & why it matters:** The sitemaps.org protocol allows at most 50,000 URLs per file. Larger sets must be split.

**How to fix it & effect on score:** Split the sitemap into multiple files and reference them from a sitemap index. Fixing this removes the 8 pts deduction from the **Crawling & Indexing (robots.txt / sitemap)** category score on the next scan.


---

<a id="rule-robots-fetch"></a>
## `robots-fetch`

**Could not fetch robots.txt**

| Severity | Weight | Category |
|---|---|---|
| Medium | 7 pts | Crawling & Indexing (robots.txt / sitemap) |

**What triggers it & why it matters:** Failed to load N. Crawlers may not discover your sitemap or crawl rules.

**How to fix it & effect on score:** Ensure /robots.txt is publicly accessible. Fixing this removes the 7 pts deduction from the **Crawling & Indexing (robots.txt / sitemap)** category score on the next scan.


---

<a id="rule-robots-no-groups"></a>
## `robots-no-groups`

**robots.txt has no User-agent blocks**

| Severity | Weight | Category |
|---|---|---|
| Medium | 7 pts | Crawling & Indexing (robots.txt / sitemap) |

**What triggers it & why it matters:** The file contains text but no recognizable User-agent groups, so crawlers may ignore the rules entirely.

**How to fix it & effect on score:** Structure robots.txt with User-agent and Disallow/Allow directives. Fixing this removes the 7 pts deduction from the **Crawling & Indexing (robots.txt / sitemap)** category score on the next scan.


---

<a id="rule-sitemap-file-size"></a>
## `sitemap-file-size`

**Sitemap file is N MB (limit is 50 MB uncompressed)**

| Severity | Weight | Category |
|---|---|---|
| Medium | 7 pts | Crawling & Indexing (robots.txt / sitemap) |

**What triggers it & why it matters:** Sitemaps larger than 50 MB uncompressed should be split into smaller files.

**How to fix it & effect on score:** Split the sitemap and reference the parts from a sitemap index. Fixing this removes the 7 pts deduction from the **Crawling & Indexing (robots.txt / sitemap)** category score on the next scan.


---

<a id="rule-sitemap-index-invalid-loc"></a>
## `sitemap-index-invalid-loc`

**N child sitemap URL(s) is/are invalid**

| Severity | Weight | Category |
|---|---|---|
| Medium | 7 pts | Crawling & Indexing (robots.txt / sitemap) |

**What triggers it & why it matters:** Child sitemap URLs must be absolute http:// or https:// addresses.

**How to fix it & effect on score:** Fix the `<loc>` URLs in the sitemap index. Fixing this removes the 7 pts deduction from the **Crawling & Indexing (robots.txt / sitemap)** category score on the next scan.


---

<a id="rule-sitemap-index-unreachable"></a>
## `sitemap-index-unreachable`

**N referenced child sitemap(s) could not be reached**

| Severity | Weight | Category |
|---|---|---|
| Medium | 7 pts | Crawling & Indexing (robots.txt / sitemap) |

**What triggers it & why it matters:** At least one sitemap listed in the index returned a non-200 response or failed to load.

**How to fix it & effect on score:** Ensure every child sitemap URL returns HTTP 200 and valid XML. Fixing this removes the 7 pts deduction from the **Crawling & Indexing (robots.txt / sitemap)** category score on the next scan.


---

<a id="rule-sitemap-off-domain"></a>
## `sitemap-off-domain`

**Sitemap URLs are all on a different domain**

| Severity | Weight | Category |
|---|---|---|
| Medium | 7 pts | Crawling & Indexing (robots.txt / sitemap) |

**What triggers it & why it matters:** All N URLs point outside *(actual value)*. Cross-domain sitemaps are usually a misconfiguration for the scanned site.

**How to fix it & effect on score:** Point the sitemap at URLs on the same host as the site being analyzed. Fixing this removes the 7 pts deduction from the **Crawling & Indexing (robots.txt / sitemap)** category score on the next scan.


---

<a id="rule-robots-missing"></a>
## `robots-missing`

**No robots.txt found**

| Severity | Weight | Category |
|---|---|---|
| Medium | 6 pts | Crawling & Indexing (robots.txt / sitemap) |

**What triggers it & why it matters:** No robots.txt file was returned at *(actual value)*/robots.txt. Search engines will crawl freely, but you lose a place to declare sitemap locations and crawl rules.

**How to fix it & effect on score:** Add a robots.txt at the site root with crawl rules and Sitemap directives. Fixing this removes the 6 pts deduction from the **Crawling & Indexing (robots.txt / sitemap)** category score on the next scan.


---

<a id="rule-robots-no-sitemap"></a>
## `robots-no-sitemap`

**robots.txt does not declare a sitemap**

| Severity | Weight | Category |
|---|---|---|
| Medium | 6 pts | Crawling & Indexing (robots.txt / sitemap) |

**What triggers it & why it matters:** No Sitemap: directive was found. Declaring sitemap URLs in robots.txt helps crawlers discover them reliably.

**How to fix it & effect on score:** Add Sitemap: https://yoursite.com/sitemap.xml to robots.txt. Fixing this removes the 6 pts deduction from the **Crawling & Indexing (robots.txt / sitemap)** category score on the next scan.


---

<a id="rule-robots-empty"></a>
## `robots-empty`

**robots.txt is empty**

| Severity | Weight | Category |
|---|---|---|
| Medium | 5 pts | Crawling & Indexing (robots.txt / sitemap) |

**What triggers it & why it matters:** The file exists but contains no directives, so crawlers get no guidance on sitemap location or restricted paths.

**How to fix it & effect on score:** Add User-agent rules and at least one Sitemap: line pointing to your XML sitemap. Fixing this removes the 5 pts deduction from the **Crawling & Indexing (robots.txt / sitemap)** category score on the next scan.


---

<a id="rule-sitemap-duplicates"></a>
## `sitemap-duplicates`

**N duplicate URL(s) in sitemap**

| Severity | Weight | Category |
|---|---|---|
| Medium | 5 pts | Crawling & Indexing (robots.txt / sitemap) |

**What triggers it & why it matters:** The same URL appears more than once, which wastes crawl budget and can confuse indexers.

**How to fix it & effect on score:** Remove duplicate `<loc>` entries so each URL appears once. Fixing this removes the 5 pts deduction from the **Crawling & Indexing (robots.txt / sitemap)** category score on the next scan.


---

<a id="rule-robots-malformed"></a>
## `robots-malformed`

**robots.txt contains unrecognized directives**

| Severity | Weight | Category |
|---|---|---|
| Low | 4 pts | Crawling & Indexing (robots.txt / sitemap) |

**What triggers it & why it matters:** Found N line(s) with unknown directives (e.g. "*(actual value)*"). Crawlers may skip invalid rules.

**How to fix it & effect on score:** Use only standard directives: User-agent, Disallow, Allow, Sitemap, and Crawl-delay. Fixing this removes the 4 pts deduction from the **Crawling & Indexing (robots.txt / sitemap)** category score on the next scan.


---

<a id="rule-sitemap-lastmod"></a>
## `sitemap-lastmod`

**N sitemap entry has/ies have invalid lastmod dates**

| Severity | Weight | Category |
|---|---|---|
| Low | 4 pts | Crawling & Indexing (robots.txt / sitemap) |

**What triggers it & why it matters:** lastmod values should use ISO 8601 format (e.g. 2024-06-15 or 2024-06-15T08:00:00Z).

**How to fix it & effect on score:** Fix or remove invalid `<lastmod>` values. Fixing this removes the 4 pts deduction from the **Crawling & Indexing (robots.txt / sitemap)** category score on the next scan.


---

<a id="rule-sitemap-mixed-domain"></a>
## `sitemap-mixed-domain`

**N sitemap URL(s) on a different domain**

| Severity | Weight | Category |
|---|---|---|
| Low | 4 pts | Crawling & Indexing (robots.txt / sitemap) |

**What triggers it & why it matters:** Some entries reference external domains. That can be intentional, but often indicates stale or copied sitemap content.

**How to fix it & effect on score:** Keep sitemap URLs on the same domain unless you intentionally index external pages. Fixing this removes the 4 pts deduction from the **Crawling & Indexing (robots.txt / sitemap)** category score on the next scan.


---

<a id="rule-robots-content-type"></a>
## `robots-content-type`

**robots.txt has an unusual Content-Type**

| Severity | Weight | Category |
|---|---|---|
| Low | 3 pts | Crawling & Indexing (robots.txt / sitemap) |

**What triggers it & why it matters:** The file was served as "*(actual value)*". robots.txt should ideally be text/plain.

**How to fix it & effect on score:** Serve robots.txt with Content-Type: text/plain; charset=utf-8. Fixing this removes the 3 pts deduction from the **Crawling & Indexing (robots.txt / sitemap)** category score on the next scan.


---

<a id="rule-robots-present"></a>
## `robots-present`

**robots.txt is present and readable**

| Severity | Weight | Category |
|---|---|---|
| Positive signal | 0 pts | Crawling & Indexing (robots.txt / sitemap) |

**What triggers it & why it matters:** This rule only ever surfaces as a passing signal in the current source — it fires (as a pass) when: *robots.txt is present and readable*. There is no separate failing `issue()` call under this exact id; the failure condition is the logical negation of the pass condition, and in most cases is covered by a related rule id documented elsewhere in this category (see the table above for a sibling rule on the same feature).

**Effect on score:** Meeting this condition costs nothing and confirms a positive signal. Missing it doesn't directly deduct points under *this* id — it typically shows up as a deduction under the related failing rule instead.


---

<a id="rule-robots-sitemap-declared"></a>
## `robots-sitemap-declared`

**robots.txt declares N sitemap(s)**

| Severity | Weight | Category |
|---|---|---|
| Positive signal | 0 pts | Crawling & Indexing (robots.txt / sitemap) |

**What triggers it & why it matters:** This rule only ever surfaces as a passing signal in the current source — it fires (as a pass) when: *robots.txt declares N sitemap(s)*. There is no separate failing `issue()` call under this exact id; the failure condition is the logical negation of the pass condition, and in most cases is covered by a related rule id documented elsewhere in this category (see the table above for a sibling rule on the same feature).

**Effect on score:** Meeting this condition costs nothing and confirms a positive signal. Missing it doesn't directly deduct points under *this* id — it typically shows up as a deduction under the related failing rule instead.


---

<a id="rule-sitemap-index-valid"></a>
## `sitemap-index-valid`

**Sitemap index is valid (N child sitemap(s))**

| Severity | Weight | Category |
|---|---|---|
| Positive signal | 0 pts | Crawling & Indexing (robots.txt / sitemap) |

**What triggers it & why it matters:** This rule only ever surfaces as a passing signal in the current source — it fires (as a pass) when: *Sitemap index is valid (N child sitemap(s))*. There is no separate failing `issue()` call under this exact id; the failure condition is the logical negation of the pass condition, and in most cases is covered by a related rule id documented elsewhere in this category (see the table above for a sibling rule on the same feature).

**Effect on score:** Meeting this condition costs nothing and confirms a positive signal. Missing it doesn't directly deduct points under *this* id — it typically shows up as a deduction under the related failing rule instead.


---

<a id="rule-sitemap-valid"></a>
## `sitemap-valid`

**Sitemap is valid (N URL(s))**

| Severity | Weight | Category |
|---|---|---|
| Positive signal | 0 pts | Crawling & Indexing (robots.txt / sitemap) |

**What triggers it & why it matters:** This rule only ever surfaces as a passing signal in the current source — it fires (as a pass) when: *Sitemap is valid (N URL(s))*. There is no separate failing `issue()` call under this exact id; the failure condition is the logical negation of the pass condition, and in most cases is covered by a related rule id documented elsewhere in this category (see the table above for a sibling rule on the same feature).

**Effect on score:** Meeting this condition costs nothing and confirms a positive signal. Missing it doesn't directly deduct points under *this* id — it typically shows up as a deduction under the related failing rule instead.


---