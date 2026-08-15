<html>
<body>
<!--StartFragment--><html><head></head><body><h1>SEO</h1>
<p>Checks OptiQra runs against the crawled HTML of every page — titles, meta tags, canonicalization, headings, and other classic on-page ranking factors search engines have used for two decades. Source: <code>src/lib/htmlAudit.ts</code> (<code>analyzeSEO</code>).</p>
<p><strong>30 rules in this category.</strong></p>

ID | Rule | Severity | Weight
-- | -- | -- | --
noindex | Page is marked noindex | Critical | 15 pts
title | Title tag is missing | Critical | 14 pts
alt-text | N of N images missing alt text | Medium–High | 6–10 pts (scales with how much of the page is affected — see source)
h1-missing | No H1 heading found | High | 10 pts
meta-desc | No meta description | High | 9 pts
canonical | Missing canonical tag | Medium | 8 pts
og-image | Missing og:image | Medium | 8 pts
h1-multiple | Multiple H1 headings found (N) | Medium | 6 pts
heading-order | Heading levels skip a step | Medium | 6 pts
thin-content | Page has very little text content (N words) | Medium | 6 pts
title-length | Title tag length is off | Medium | 6 pts
hreflang-invalid | Invalid hreflang language code(s) found | Medium | 5 pts
meta-desc-length | Meta description length is off | Medium | 5 pts
og-basic | Missing core Open Graph tags | Medium | 5 pts
canonical-cross-domain | Canonical tag points to a different domain | Low | 4 pts
hreflang-no-self-reference | Page doesn't reference itself in its hreflang set | Low | 4 pts
twitter-card | Missing twitter:card | Low | 4 pts
twitter-card-invalid | Unrecognized twitter:card value ("(actual value found on the page)") | Low | 4 pts
canonical-relative | Canonical tag uses a relative URL | Low | 3 pts
favicon | No favicon declared | Low | 3 pts
hreflang-no-x-default | No x-default hreflang fallback | Low | 3 pts
meta-charset | No charset declared | Low | 3 pts
meta-desc-duplicates-title | Meta description is identical to the title tag | Low | 3 pts
og-url | Missing og:url | Low | 3 pts
twitter-content | Twitter card is missing N | Low | 3 pts
og-site-name | Missing og:site_name | Low | 2 pts
og-type | Missing og:type | Low | 2 pts
url-structure | URL structure could be cleaner | Low | 2 pts
h1 | Exactly one H1 heading | Positive signal | 0 pts
hreflang-valid | hreflang codes are valid | Positive signal | 0 pts


<p><strong>What triggers it &amp; why it matters:</strong> This rule only ever surfaces as a passing signal in the current source — it fires (as a pass) when: <em>hreflang codes are valid</em>. There is no separate failing <code>issue()</code> call under this exact id; the failure condition is the logical negation of the pass condition, and in most cases is covered by a related rule id documented elsewhere in this category (see the table above for a sibling rule on the same feature).</p>
<p><strong>Effect on score:</strong> Meeting this condition costs nothing and confirms a positive signal. Missing it doesn't directly deduct points under <em>this</em> id — it typically shows up as a deduction under the related failing rule instead.</p>
<hr></body></html><!--EndFragment-->
</body>
</html># SEO

Checks OptiQra runs against the crawled HTML of every page — titles, meta tags, canonicalization, headings, and other classic on-page ranking factors search engines have used for two decades. Source: `src/lib/htmlAudit.ts` (`analyzeSEO`).

**30 rules in this category.**

| ID | Rule | Severity | Weight |
|---|---|---|---|
| `noindex` | [[Page is marked noindex](https://github.com/armin5872/OptiQra/wiki/Audit-rules-seo#rule-noindex)](#rule-noindex) | Critical | 15 pts |
| `title` | [[Title tag is missing](https://github.com/armin5872/OptiQra/wiki/Audit-rules-seo#rule-title)](#rule-title) | Critical | 14 pts |
| `alt-text` | [[N of N images missing alt text](https://github.com/armin5872/OptiQra/wiki/Audit-rules-seo#rule-alt-text)](#rule-alt-text) | Medium–High | 6–10 pts (scales with how much of the page is affected — see source) |
| `h1-missing` | [[No H1 heading found](https://github.com/armin5872/OptiQra/wiki/Audit-rules-seo#rule-h1-missing)](#rule-h1-missing) | High | 10 pts |
| `meta-desc` | [[No meta description](https://github.com/armin5872/OptiQra/wiki/Audit-rules-seo#rule-meta-desc)](#rule-meta-desc) | High | 9 pts |
| `canonical` | [[Missing canonical tag](https://github.com/armin5872/OptiQra/wiki/Audit-rules-seo#rule-canonical)](#rule-canonical) | Medium | 8 pts |
| `og-image` | [[Missing og:image](https://github.com/armin5872/OptiQra/wiki/Audit-rules-seo#rule-og-image)](#rule-og-image) | Medium | 8 pts |
| `h1-multiple` | [[Multiple H1 headings found (N)](https://github.com/armin5872/OptiQra/wiki/Audit-rules-seo#rule-h1-multiple)](#rule-h1-multiple) | Medium | 6 pts |
| `heading-order` | [[Heading levels skip a step](https://github.com/armin5872/OptiQra/wiki/Audit-rules-seo#rule-heading-order)](#rule-heading-order) | Medium | 6 pts |
| `thin-content` | [[Page has very little text content (N words)](https://github.com/armin5872/OptiQra/wiki/Audit-rules-seo#rule-thin-content)](#rule-thin-content) | Medium | 6 pts |
| `title-length` | [[Title tag length is off](https://github.com/armin5872/OptiQra/wiki/Audit-rules-seo#rule-title-length)](#rule-title-length) | Medium | 6 pts |
| `hreflang-invalid` | [[Invalid hreflang language code(s) found](https://github.com/armin5872/OptiQra/wiki/Audit-rules-seo#rule-hreflang-invalid)](#rule-hreflang-invalid) | Medium | 5 pts |
| `meta-desc-length` | [[Meta description length is off](https://github.com/armin5872/OptiQra/wiki/Audit-rules-seo#rule-meta-desc-length)](#rule-meta-desc-length) | Medium | 5 pts |
| `og-basic` | [[Missing core Open Graph tags](https://github.com/armin5872/OptiQra/wiki/Audit-rules-seo#rule-og-basic)](#rule-og-basic) | Medium | 5 pts |
| `canonical-cross-domain` | [[Canonical tag points to a different domain](https://github.com/armin5872/OptiQra/wiki/Audit-rules-seo#rule-canonical-cross-domain)](#rule-canonical-cross-domain) | Low | 4 pts |
| `hreflang-no-self-reference` | [[Page doesn't reference itself in its hreflang set](https://github.com/armin5872/OptiQra/wiki/Audit-rules-seo#rule-hreflang-no-self-reference)](#rule-hreflang-no-self-reference) | Low | 4 pts |
| `twitter-card` | [[Missing twitter:card](https://github.com/armin5872/OptiQra/wiki/Audit-rules-seo#rule-twitter-card)](#rule-twitter-card) | Low | 4 pts |
| `twitter-card-invalid` | [Unrecognized twitter:card value ("*(actual value found on the page)*")](#rule-twitter-card-invalid) | Low | 4 pts |
| `canonical-relative` | [[Canonical tag uses a relative URL](https://github.com/armin5872/OptiQra/wiki/Audit-rules-seo#rule-canonical-relative)](#rule-canonical-relative) | Low | 3 pts |
| `favicon` | [[No favicon declared](https://github.com/armin5872/OptiQra/wiki/Audit-rules-seo#rule-favicon)](#rule-favicon) | Low | 3 pts |
| `hreflang-no-x-default` | [[No x-default hreflang fallback](https://github.com/armin5872/OptiQra/wiki/Audit-rules-seo#rule-hreflang-no-x-default)](#rule-hreflang-no-x-default) | Low | 3 pts |
| `meta-charset` | [[No charset declared](https://github.com/armin5872/OptiQra/wiki/Audit-rules-seo#rule-meta-charset)](#rule-meta-charset) | Low | 3 pts |
| `meta-desc-duplicates-title` | [[Meta description is identical to the title tag](https://github.com/armin5872/OptiQra/wiki/Audit-rules-seo#rule-meta-desc-duplicates-title)](#rule-meta-desc-duplicates-title) | Low | 3 pts |
| `og-url` | [[Missing og:url](https://github.com/armin5872/OptiQra/wiki/Audit-rules-seo#rule-og-url)](#rule-og-url) | Low | 3 pts |
| `twitter-content` | [[Twitter card is missing N](https://github.com/armin5872/OptiQra/wiki/Audit-rules-seo#rule-twitter-content)](#rule-twitter-content) | Low | 3 pts |
| `og-site-name` | [[Missing og:site_name](https://github.com/armin5872/OptiQra/wiki/Audit-rules-seo#rule-og-site-name)](#rule-og-site-name) | Low | 2 pts |
| `og-type` | [[Missing og:type](https://github.com/armin5872/OptiQra/wiki/Audit-rules-seo#rule-og-type)](#rule-og-type) | Low | 2 pts |
| `url-structure` | [[URL structure could be cleaner](https://github.com/armin5872/OptiQra/wiki/Audit-rules-seo#rule-url-structure)](#rule-url-structure) | Low | 2 pts |
| `h1` | [[Exactly one H1 heading](https://github.com/armin5872/OptiQra/wiki/Audit-rules-seo#rule-h1)](#rule-h1) | Positive signal | 0 pts |
| `hreflang-valid` | [[hreflang codes are valid](https://github.com/armin5872/OptiQra/wiki/Audit-rules-seo#rule-hreflang-valid)](#rule-hreflang-valid) | Positive signal | 0 pts |

---

<a id="rule-noindex"></a>
## `noindex`

**Page is marked noindex**

| Severity | Weight | Category |
|---|---|---|
| Critical | 15 pts | SEO |

**What triggers it & why it matters:** A robots meta tag is telling search engines not to index this page.

**How to fix it & effect on score:** Remove the noindex directive if this page should appear in search results. Fixing this removes the 15 pts deduction from the **SEO** category score on the next scan.


---

<a id="rule-title"></a>
## `title`

**Title tag is missing**

| Severity | Weight | Category |
|---|---|---|
| Critical | 14 pts | SEO |

**What triggers it & why it matters:** No `<title>` element was found in the page head, so search results fall back to a generic or unreadable title.

**How to fix it & effect on score:** Add a unique, descriptive `<title>` tag, ideally 50–60 characters. Fixing this removes the 14 pts deduction from the **SEO** category score on the next scan.

**What a pass looks like:** Title tag is present and well-sized


---

<a id="rule-alt-text"></a>
## `alt-text`

**N of N images missing alt text**

| Severity | Weight | Category |
|---|---|---|
| Medium–High | 6–10 pts (scales with how much of the page is affected — see source) | SEO |

**What triggers it & why it matters:** Images without descriptive alt attributes lose potential image-search traffic and provide no fallback content.

**How to fix it & effect on score:** Add descriptive alt text to every meaningful image. Fixing this removes the 6–10 pts (scales with how much of the page is affected — see source) deduction from the **SEO** category score on the next scan.

**What a pass looks like:** All images have alt text


---

<a id="rule-h1-missing"></a>
## `h1-missing`

**No H1 heading found**

| Severity | Weight | Category |
|---|---|---|
| High | 10 pts | SEO |

**What triggers it & why it matters:** The page has no top-level H1, leaving both users and search engines without a clear statement of the page topic.

**How to fix it & effect on score:** Add exactly one H1 that describes the page's main topic. Fixing this removes the 10 pts deduction from the **SEO** category score on the next scan.


---

<a id="rule-meta-desc"></a>
## `meta-desc`

**No meta description**

| Severity | Weight | Category |
|---|---|---|
| High | 9 pts | SEO |

**What triggers it & why it matters:** Search engines are writing their own snippet because no meta description was found.

**How to fix it & effect on score:** Add a 140–160 character meta description summarizing the page. Fixing this removes the 9 pts deduction from the **SEO** category score on the next scan.

**What a pass looks like:** Meta description is present and well-sized


---

<a id="rule-canonical"></a>
## `canonical`

**Missing canonical tag**

| Severity | Weight | Category |
|---|---|---|
| Medium | 8 pts | SEO |

**What triggers it & why it matters:** Without a canonical tag, pages reachable through multiple URLs (tracking params, trailing slashes) risk being indexed as duplicates.

**How to fix it & effect on score:** Add a self-referencing `<link rel="canonical">` tag to every indexable page. Fixing this removes the 8 pts deduction from the **SEO** category score on the next scan.

**What a pass looks like:** Canonical tag is present


---

<a id="rule-og-image"></a>
## `og-image`

**Missing og:image**

| Severity | Weight | Category |
|---|---|---|
| Medium | 8 pts | SEO |

**What triggers it & why it matters:** Without an og:image tag, shared links render as a plain text card with no thumbnail, which measurably lowers click-through on social feeds.

**How to fix it & effect on score:** Add `<meta property="og:image" content="https://.../preview.jpg">` pointing at a roughly 1200×630 image. Fixing this removes the 8 pts deduction from the **SEO** category score on the next scan.

**What a pass looks like:** og:image is present


---

<a id="rule-h1-multiple"></a>
## `h1-multiple`

**Multiple H1 headings found (N)**

| Severity | Weight | Category |
|---|---|---|
| Medium | 6 pts | SEO |

**What triggers it & why it matters:** Several H1 elements dilute the page's topical signal and can confuse heading-based navigation.

**How to fix it & effect on score:** Keep a single H1 per page and demote the rest to H2/H3. Fixing this removes the 6 pts deduction from the **SEO** category score on the next scan.


---

<a id="rule-heading-order"></a>
## `heading-order`

**Heading levels skip a step**

| Severity | Weight | Category |
|---|---|---|
| Medium | 6 pts | SEO |

**What triggers it & why it matters:** Somewhere the page jumps, e.g. H2 straight to H4, which breaks the logical outline for screen readers and crawlers.

**How to fix it & effect on score:** Restructure headings so each level follows in order without skipping. Fixing this removes the 6 pts deduction from the **SEO** category score on the next scan.

**What a pass looks like:** Heading hierarchy is in order


---

<a id="rule-thin-content"></a>
## `thin-content`

**Page has very little text content (N words)**

| Severity | Weight | Category |
|---|---|---|
| Medium | 6 pts | SEO |

**What triggers it & why it matters:** Pages with very little unique body text give search engines little to rank on and are more likely to be treated as thin content, especially if similar pages exist elsewhere on the site.

**How to fix it & effect on score:** Expand the page with substantive, unique content relevant to its topic, or noindex it if it's intentionally minimal (e.g. a redirect or utility page). Fixing this removes the 6 pts deduction from the **SEO** category score on the next scan.

**What a pass looks like:** Page has substantive body content (N words)


---

<a id="rule-title-length"></a>
## `title-length`

**Title tag length is off**

| Severity | Weight | Category |
|---|---|---|
| Medium | 6 pts | SEO |

**What triggers it & why it matters:** The title is N characters ("*(actual value found on the page, truncated)*…"). Search engines typically truncate titles outside the 50–60 character range.

**How to fix it & effect on score:** Tighten the title to roughly 50–60 characters while keeping it descriptive. Fixing this removes the 6 pts deduction from the **SEO** category score on the next scan.


---

<a id="rule-hreflang-invalid"></a>
## `hreflang-invalid`

**Invalid hreflang language code(s) found**

| Severity | Weight | Category |
|---|---|---|
| Medium | 5 pts | SEO |

**What triggers it & why it matters:** One or more hreflang values (*(comma-separated list of the specific items found)*) don't match a valid ISO 639-1 language code or language-region pair. Search engines ignore alternates with unrecognized codes entirely.

**How to fix it & effect on score:** Use valid codes like "en", "en-us", or "x-default" for the international fallback. Fixing this removes the 5 pts deduction from the **SEO** category score on the next scan.


---

<a id="rule-meta-desc-length"></a>
## `meta-desc-length`

**Meta description length is off**

| Severity | Weight | Category |
|---|---|---|
| Medium | 5 pts | SEO |

**What triggers it & why it matters:** The description is N characters, outside the ~140–160 range search engines display in full.

**How to fix it & effect on score:** Adjust the meta description to roughly 140–160 characters. Fixing this removes the 5 pts deduction from the **SEO** category score on the next scan.


---

<a id="rule-og-basic"></a>
## `og-basic`

**Missing core Open Graph tags**

| Severity | Weight | Category |
|---|---|---|
| Medium | 5 pts | SEO |

**What triggers it & why it matters:** N missing, so links shared on Facebook, LinkedIn, Slack, and similar platforms fall back to a blank or auto-generated title/snippet.

**How to fix it & effect on score:** Add og:title and og:description meta tags with content written for social sharing. Fixing this removes the 5 pts deduction from the **SEO** category score on the next scan.

**What a pass looks like:** og:title and og:description are present


---

<a id="rule-canonical-cross-domain"></a>
## `canonical-cross-domain`

**Canonical tag points to a different domain**

| Severity | Weight | Category |
|---|---|---|
| Low | 4 pts | SEO |

**What triggers it & why it matters:** The canonical URL ("*(actual value)*") points to a different domain than the page being audited (*(actual value)*). This is sometimes intentional (e.g. syndicated content), but if unintended it tells search engines to index the other domain's URL instead of this one.

**How to fix it & effect on score:** Confirm this is intentional; otherwise point the canonical tag at this page's own domain. Fixing this removes the 4 pts deduction from the **SEO** category score on the next scan.


---

<a id="rule-hreflang-no-self-reference"></a>
## `hreflang-no-self-reference`

**Page doesn't reference itself in its hreflang set**

| Severity | Weight | Category |
|---|---|---|
| Low | 4 pts | SEO |

**What triggers it & why it matters:** Google's guidelines expect every page in a hreflang group to include a self-referencing alternate; without one, the whole annotation set can be disregarded.

**How to fix it & effect on score:** Add a hreflang alternate for this exact URL pointing back to itself. Fixing this removes the 4 pts deduction from the **SEO** category score on the next scan.


---

<a id="rule-twitter-card"></a>
## `twitter-card`

**Missing twitter:card**

| Severity | Weight | Category |
|---|---|---|
| Low | 4 pts | SEO |

**What triggers it & why it matters:** X/Twitter will not render a rich preview at all without a twitter:card tag, even when Open Graph tags are present.

**How to fix it & effect on score:** Add `<meta name="twitter:card" content="summary_large_image">` (or "summary" for a smaller preview). Fixing this removes the 4 pts deduction from the **SEO** category score on the next scan.

**What a pass looks like:** twitter:card is present and valid


---

<a id="rule-twitter-card-invalid"></a>
## `twitter-card-invalid`

**Unrecognized twitter:card value ("*(actual value found on the page)*")**

| Severity | Weight | Category |
|---|---|---|
| Low | 4 pts | SEO |

**What triggers it & why it matters:** X/Twitter only recognizes "summary", "summary_large_image", "app", and "player" as twitter:card values — anything else causes the preview to silently fail.

**How to fix it & effect on score:** Set twitter:card to "summary_large_image" for most content pages. Fixing this removes the 4 pts deduction from the **SEO** category score on the next scan.


---

<a id="rule-canonical-relative"></a>
## `canonical-relative`

**Canonical tag uses a relative URL**

| Severity | Weight | Category |
|---|---|---|
| Low | 3 pts | SEO |

**What triggers it & why it matters:** The canonical href ("*(actual value)*") isn't a full absolute URL. Google's own guidance recommends absolute URLs for canonical tags to avoid ambiguity if the tag is copied elsewhere or the base URL changes.

**How to fix it & effect on score:** Use a full absolute URL (https://...) in the canonical tag rather than a relative path. Fixing this removes the 3 pts deduction from the **SEO** category score on the next scan.


---

<a id="rule-favicon"></a>
## `favicon`

**No favicon declared**

| Severity | Weight | Category |
|---|---|---|
| Low | 3 pts | SEO |

**What triggers it & why it matters:** No `<link rel="icon">` (or shortcut/apple-touch-icon) tag was found. Google displays a page's favicon next to its listing in both mobile and desktop search results, so a missing one leaves search results looking generic.

**How to fix it & effect on score:** Add `<link rel="icon" href="/favicon.ico" sizes="any">` in `<head>` (plus an SVG/PNG variant for higher resolution). Fixing this removes the 3 pts deduction from the **SEO** category score on the next scan.

**What a pass looks like:** Favicon is declared


---

<a id="rule-hreflang-no-x-default"></a>
## `hreflang-no-x-default`

**No x-default hreflang fallback**

| Severity | Weight | Category |
|---|---|---|
| Low | 3 pts | SEO |

**What triggers it & why it matters:** Multiple language/region alternates are declared but none is marked hreflang="x-default", so visitors whose language doesn't match any listed variant get no explicit fallback page.

**How to fix it & effect on score:** Add `<link rel="alternate" hreflang="x-default" href="...">` pointing at your default/international page. Fixing this removes the 3 pts deduction from the **SEO** category score on the next scan.


---

<a id="rule-meta-charset"></a>
## `meta-charset`

**No charset declared**

| Severity | Weight | Category |
|---|---|---|
| Low | 3 pts | SEO |

**What triggers it & why it matters:** Neither a `<meta charset>` tag nor a Content-Type meta tag with a charset was found in the page head. Without an explicit charset, browsers have to guess the encoding, which can occasionally garble non-ASCII text before it's indexed.

**How to fix it & effect on score:** Add `<meta charset="UTF-8">` as the first element inside `<head>`. Fixing this removes the 3 pts deduction from the **SEO** category score on the next scan.

**What a pass looks like:** Charset is declared


---

<a id="rule-meta-desc-duplicates-title"></a>
## `meta-desc-duplicates-title`

**Meta description is identical to the title tag**

| Severity | Weight | Category |
|---|---|---|
| Low | 3 pts | SEO |

**What triggers it & why it matters:** The meta description just repeats the title verbatim instead of adding new information, so the search snippet wastes the chance to give searchers an extra reason to click through.

**How to fix it & effect on score:** Write a meta description that summarizes the page's content rather than repeating the title. Fixing this removes the 3 pts deduction from the **SEO** category score on the next scan.


---

<a id="rule-og-url"></a>
## `og-url`

**Missing og:url**

| Severity | Weight | Category |
|---|---|---|
| Low | 3 pts | SEO |

**What triggers it & why it matters:** Without og:url, shares of the same page reached through different query strings or paths can be treated as separate URLs, splitting likes and shares across duplicates.

**How to fix it & effect on score:** Add `<meta property="og:url" content="N">` using the canonical URL of the page. Fixing this removes the 3 pts deduction from the **SEO** category score on the next scan.

**What a pass looks like:** og:url is present


---

<a id="rule-twitter-content"></a>
## `twitter-content`

**Twitter card is missing N**

| Severity | Weight | Category |
|---|---|---|
| Low | 3 pts | SEO |

**What triggers it & why it matters:** twitter:title, twitter:description, and twitter:image fall back to their og: equivalents when absent, but neither the twitter:* nor the og: version is set here, so the card renders incomplete.

**How to fix it & effect on score:** Add the missing twitter:* tags directly, or add the matching og: tags so Twitter can fall back to them. Fixing this removes the 3 pts deduction from the **SEO** category score on the next scan.

**What a pass looks like:** Twitter card has title, description, and image (directly or via Open Graph fallback)


---

<a id="rule-og-site-name"></a>
## `og-site-name`

**Missing og:site_name**

| Severity | Weight | Category |
|---|---|---|
| Low | 2 pts | SEO |

**What triggers it & why it matters:** Without og:site_name, some platforms omit the brand label that normally appears above the title in a shared card.

**How to fix it & effect on score:** Add `<meta property="og:site_name" content="Your Site Name">`. Fixing this removes the 2 pts deduction from the **SEO** category score on the next scan.

**What a pass looks like:** og:site_name is present


---

<a id="rule-og-type"></a>
## `og-type`

**Missing og:type**

| Severity | Weight | Category |
|---|---|---|
| Low | 2 pts | SEO |

**What triggers it & why it matters:** Open Graph silently defaults to "website" when og:type is absent, but declaring it explicitly (article, product, etc.) unlocks richer, type-specific card layouts on some platforms.

**How to fix it & effect on score:** Add `<meta property="og:type" content="website">` (or "article", "product", etc. as appropriate). Fixing this removes the 2 pts deduction from the **SEO** category score on the next scan.

**What a pass looks like:** og:type is present


---

<a id="rule-url-structure"></a>
## `url-structure`

**URL structure could be cleaner**

| Severity | Weight | Category |
|---|---|---|
| Low | 2 pts | SEO |

**What triggers it & why it matters:** This page's URL N. Google treats hyphens as word separators but not underscores, and mixed-case or heavily-parameterized URLs are more prone to being treated as duplicates of a cleaner canonical version.

**How to fix it & effect on score:** Prefer lowercase, hyphen-separated paths and keep query parameters minimal on the canonical/indexable URL. Fixing this removes the 2 pts deduction from the **SEO** category score on the next scan.

**What a pass looks like:** URL structure follows SEO-friendly conventions


---

<a id="rule-h1"></a>
## `h1`

**Exactly one H1 heading**

| Severity | Weight | Category |
|---|---|---|
| Positive signal | 0 pts | SEO |

**What triggers it & why it matters:** This rule only ever surfaces as a passing signal in the current source — it fires (as a pass) when: *Exactly one H1 heading*. There is no separate failing `issue()` call under this exact id; the failure condition is the logical negation of the pass condition, and in most cases is covered by a related rule id documented elsewhere in this category (see the table above for a sibling rule on the same feature).

**Effect on score:** Meeting this condition costs nothing and confirms a positive signal. Missing it doesn't directly deduct points under *this* id — it typically shows up as a deduction under the related failing rule instead.


---

<a id="rule-hreflang-valid"></a>
## `hreflang-valid`

**hreflang codes are valid**

| Severity | Weight | Category |
|---|---|---|
| Positive signal | 0 pts | SEO |

**What triggers it & why it matters:** This rule only ever surfaces as a passing signal in the current source — it fires (as a pass) when: *hreflang codes are valid*. There is no separate failing `issue()` call under this exact id; the failure condition is the logical negation of the pass condition, and in most cases is covered by a related rule id documented elsewhere in this category (see the table above for a sibling rule on the same feature).

**Effect on score:** Meeting this condition costs nothing and confirms a positive signal. Missing it doesn't directly deduct points under *this* id — it typically shows up as a deduction under the related failing rule instead.


---