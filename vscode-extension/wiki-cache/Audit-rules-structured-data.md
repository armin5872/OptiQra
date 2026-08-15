<html>
<body>
<!--StartFragment--><html><head></head><body><h1>Structured Data</h1>
<p><a href="https://github.com/armin5872/OptiQra/wiki/Home">← Back to Home</a></p>
<p>Checks JSON-LD, Microdata, and RDFa markup against schema.org requirements for the most common types (Organization, WebSite, Article, Product, FAQPage, BreadcrumbList, LocalBusiness, Person, Event). Source: <code>src/lib/structuredDataAudit.ts</code> (<code>analyzeStructuredData</code>).</p>
<p><strong>42 rules in this category.</strong></p>

ID | Rule | Severity | Weight
-- | -- | -- | --
jsonld-parse-error | N JSON-LD block(s) failed to parse | High | 10 pts
schema-article-required-Article | Article schema is missing one or more required properties | Medium–High | 6–9 pts (scales with how much of the page is affected — see source)
schema-article-required-BlogPosting | BlogPosting schema is missing one or more required properties | Medium–High | 6–9 pts (scales with how much of the page is affected — see source)
schema-article-required-NewsArticle | NewsArticle schema is missing one or more required properties | Medium–High | 6–9 pts (scales with how much of the page is affected — see source)
jsonld-missing | No JSON-LD structured data found | Medium | 8 pts
schema-breadcrumb-invalid | BreadcrumbList schema has N issue(s) | Medium | 5–8 pts (scales with how much of the page is affected — see source)
schema-event-required | Event schema is missing required property/ies: N | Medium | 5–8 pts (scales with how much of the page is affected — see source)
schema-faq-invalid | FAQPage schema has N issue(s) | Medium | 5–8 pts (scales with how much of the page is affected — see source)
schema-missing-type | N JSON-LD node(s) missing "@type" | Medium | 8 pts
schema-org-required | Organization schema is missing required property/ies: N | Medium | 5–8 pts (scales with how much of the page is affected — see source)
structured-data-none | No structured data detected on the page (JSON-LD, Microdata, or RDFa) | Medium | 8 pts
schema-invalid-type | Unrecognized schema type(s): (actual value found on the page, truncated) | Medium | 7 pts
schema-localbusiness-required | LocalBusiness schema is missing required property/ies: N | Medium | 7 pts
schema-missing-context | N JSON-LD node(s) missing a schema.org "@context" | Medium | 6 pts
schema-product-offers | Product schema is missing a valid "offers" with price/priceCurrency | Medium | 6 pts
schema-product-required | Product schema is missing required property/ies: N | Medium | 6 pts
schema-website-required | WebSite schema is missing required property/ies: N | Medium | 6 pts
microdata-missing-itemtype | N microdata element(s) missing "itemtype" | Medium | 5 pts
schema-person-required | Person schema is missing required property: name | Medium | 5 pts
schema-searchaction-invalid | SearchAction is malformed (invalid target/urlTemplate / invalid query-input) | Medium | 5 pts
microdata-invalid-itemtype | N microdata element(s) use a non-schema.org itemtype | Low | 4 pts
rdfa-missing-vocab | RDFa "typeof" attributes found without a "vocab" declaration | Low | 4 pts
schema-searchaction-missing | WebSite schema has no SearchAction (sitelinks search box) | Low | 4 pts
jsonld-empty | N empty JSON-LD script tag(s) | Low | 3 pts
schema-localbusiness-phone | LocalBusiness schema is missing "telephone" | Low | 3 pts
schema-org-logo | Organization schema is missing "logo" | Low | 3 pts
schema-product-image | Product schema is missing "image" | Low | 3 pts
jsonld-present | N JSON-LD block(s) found | Positive signal | 0 pts
microdata | Microdata found on N element(s) and looks well-formed | Positive signal | 0 pts
rdfa | RDFa markup found on N element(s) with a vocab declared | Positive signal | 0 pts
schema-article-Article | Article schema has all required properties (headline, author, datePublished) | Positive signal | 0 pts
schema-article-BlogPosting | BlogPosting schema has all required properties (headline, author, datePublished) | Positive signal | 0 pts
schema-article-NewsArticle | NewsArticle schema has all required properties (headline, author, datePublished) | Positive signal | 0 pts
schema-breadcrumb | BreadcrumbList schema is valid | Positive signal | 0 pts
schema-event | Event schema has required properties | Positive signal | 0 pts
schema-faq | FAQPage schema is valid | Positive signal | 0 pts
schema-localbusiness | LocalBusiness schema has required properties | Positive signal | 0 pts
schema-org | Organization schema has required properties | Positive signal | 0 pts
schema-person | Person schema has required properties | Positive signal | 0 pts
schema-product | Product schema has required properties | Positive signal | 0 pts
schema-searchaction | SearchAction is present and correctly configured | Positive signal | 0 pts
schema-website | WebSite schema has required properties | Positive signal | 0 pts


<p><strong>What triggers it &amp; why it matters:</strong> This rule only ever surfaces as a passing signal in the current source — it fires (as a pass) when: <em>WebSite schema has required properties</em>. There is no separate failing <code>issue()</code> call under this exact id; the failure condition is the logical negation of the pass condition, and in most cases is covered by a related rule id documented elsewhere in this category (see the table above for a sibling rule on the same feature).</p>
<p><strong>Effect on score:</strong> Meeting this condition costs nothing and confirms a positive signal. Missing it doesn't directly deduct points under <em>this</em> id — it typically shows up as a deduction under the related failing rule instead.</p>
<hr></body></html><!--EndFragment-->
</body>
</html># Structured Data

[[← Back to Home](https://github.com/armin5872/OptiQra/wiki/Home)](https://github.com/armin5872/OptiQra/wiki/Home)

Checks JSON-LD, Microdata, and RDFa markup against schema.org requirements for the most common types (Organization, WebSite, Article, Product, FAQPage, BreadcrumbList, LocalBusiness, Person, Event). Source: `src/lib/structuredDataAudit.ts` (`analyzeStructuredData`).

**42 rules in this category.**

| ID | Rule | Severity | Weight |
|---|---|---|---|
| `jsonld-parse-error` | [[N JSON-LD block(s) failed to parse](https://github.com/armin5872/OptiQra/wiki/Audit-rules-structured-data#rule-jsonld-parse-error)](#rule-jsonld-parse-error) | High | 10 pts |
| `schema-article-required-Article` | [[Article schema is missing one or more required properties](https://github.com/armin5872/OptiQra/wiki/Audit-rules-structured-data#rule-schema-article-required-article)](#rule-schema-article-required-article) | Medium–High | 6–9 pts (scales with how much of the page is affected — see source) |
| `schema-article-required-BlogPosting` | [[BlogPosting schema is missing one or more required properties](https://github.com/armin5872/OptiQra/wiki/Audit-rules-structured-data#rule-schema-article-required-blogposting)](#rule-schema-article-required-blogposting) | Medium–High | 6–9 pts (scales with how much of the page is affected — see source) |
| `schema-article-required-NewsArticle` | [[NewsArticle schema is missing one or more required properties](https://github.com/armin5872/OptiQra/wiki/Audit-rules-structured-data#rule-schema-article-required-newsarticle)](#rule-schema-article-required-newsarticle) | Medium–High | 6–9 pts (scales with how much of the page is affected — see source) |
| `jsonld-missing` | [[No JSON-LD structured data found](https://github.com/armin5872/OptiQra/wiki/Audit-rules-structured-data#rule-jsonld-missing)](#rule-jsonld-missing) | Medium | 8 pts |
| `schema-breadcrumb-invalid` | [[BreadcrumbList schema has N issue(s)](https://github.com/armin5872/OptiQra/wiki/Audit-rules-structured-data#rule-schema-breadcrumb-invalid)](#rule-schema-breadcrumb-invalid) | Medium | 5–8 pts (scales with how much of the page is affected — see source) |
| `schema-event-required` | [[Event schema is missing required property/ies: N](https://github.com/armin5872/OptiQra/wiki/Audit-rules-structured-data#rule-schema-event-required)](#rule-schema-event-required) | Medium | 5–8 pts (scales with how much of the page is affected — see source) |
| `schema-faq-invalid` | [[FAQPage schema has N issue(s)](https://github.com/armin5872/OptiQra/wiki/Audit-rules-structured-data#rule-schema-faq-invalid)](#rule-schema-faq-invalid) | Medium | 5–8 pts (scales with how much of the page is affected — see source) |
| `schema-missing-type` | [[N JSON-LD node(s) missing "@type"](https://github.com/armin5872/OptiQra/wiki/Audit-rules-structured-data#rule-schema-missing-type)](#rule-schema-missing-type) | Medium | 8 pts |
| `schema-org-required` | [[Organization schema is missing required property/ies: N](https://github.com/armin5872/OptiQra/wiki/Audit-rules-structured-data#rule-schema-org-required)](#rule-schema-org-required) | Medium | 5–8 pts (scales with how much of the page is affected — see source) |
| `structured-data-none` | [[No structured data detected on the page (JSON-LD, Microdata, or RDFa)](https://github.com/armin5872/OptiQra/wiki/Audit-rules-structured-data#rule-structured-data-none)](#rule-structured-data-none) | Medium | 8 pts |
| `schema-invalid-type` | [Unrecognized schema type(s): *(actual value found on the page, truncated)*](#rule-schema-invalid-type) | Medium | 7 pts |
| `schema-localbusiness-required` | [[LocalBusiness schema is missing required property/ies: N](https://github.com/armin5872/OptiQra/wiki/Audit-rules-structured-data#rule-schema-localbusiness-required)](#rule-schema-localbusiness-required) | Medium | 7 pts |
| `schema-missing-context` | [[N JSON-LD node(s) missing a schema.org "@context"](https://github.com/armin5872/OptiQra/wiki/Audit-rules-structured-data#rule-schema-missing-context)](#rule-schema-missing-context) | Medium | 6 pts |
| `schema-product-offers` | [[Product schema is missing a valid "offers" with price/priceCurrency](https://github.com/armin5872/OptiQra/wiki/Audit-rules-structured-data#rule-schema-product-offers)](#rule-schema-product-offers) | Medium | 6 pts |
| `schema-product-required` | [[Product schema is missing required property/ies: N](https://github.com/armin5872/OptiQra/wiki/Audit-rules-structured-data#rule-schema-product-required)](#rule-schema-product-required) | Medium | 6 pts |
| `schema-website-required` | [[WebSite schema is missing required property/ies: N](https://github.com/armin5872/OptiQra/wiki/Audit-rules-structured-data#rule-schema-website-required)](#rule-schema-website-required) | Medium | 6 pts |
| `microdata-missing-itemtype` | [[N microdata element(s) missing "itemtype"](https://github.com/armin5872/OptiQra/wiki/Audit-rules-structured-data#rule-microdata-missing-itemtype)](#rule-microdata-missing-itemtype) | Medium | 5 pts |
| `schema-person-required` | [[Person schema is missing required property: name](https://github.com/armin5872/OptiQra/wiki/Audit-rules-structured-data#rule-schema-person-required)](#rule-schema-person-required) | Medium | 5 pts |
| `schema-searchaction-invalid` | [[SearchAction is malformed (invalid target/urlTemplate / invalid query-input)](https://github.com/armin5872/OptiQra/wiki/Audit-rules-structured-data#rule-schema-searchaction-invalid)](#rule-schema-searchaction-invalid) | Medium | 5 pts |
| `microdata-invalid-itemtype` | [[N microdata element(s) use a non-schema.org itemtype](https://github.com/armin5872/OptiQra/wiki/Audit-rules-structured-data#rule-microdata-invalid-itemtype)](#rule-microdata-invalid-itemtype) | Low | 4 pts |
| `rdfa-missing-vocab` | [[RDFa "typeof" attributes found without a "vocab" declaration](https://github.com/armin5872/OptiQra/wiki/Audit-rules-structured-data#rule-rdfa-missing-vocab)](#rule-rdfa-missing-vocab) | Low | 4 pts |
| `schema-searchaction-missing` | [[WebSite schema has no SearchAction (sitelinks search box)](https://github.com/armin5872/OptiQra/wiki/Audit-rules-structured-data#rule-schema-searchaction-missing)](#rule-schema-searchaction-missing) | Low | 4 pts |
| `jsonld-empty` | [[N empty JSON-LD script tag(s)](https://github.com/armin5872/OptiQra/wiki/Audit-rules-structured-data#rule-jsonld-empty)](#rule-jsonld-empty) | Low | 3 pts |
| `schema-localbusiness-phone` | [[LocalBusiness schema is missing "telephone"](https://github.com/armin5872/OptiQra/wiki/Audit-rules-structured-data#rule-schema-localbusiness-phone)](#rule-schema-localbusiness-phone) | Low | 3 pts |
| `schema-org-logo` | [[Organization schema is missing "logo"](https://github.com/armin5872/OptiQra/wiki/Audit-rules-structured-data#rule-schema-org-logo)](#rule-schema-org-logo) | Low | 3 pts |
| `schema-product-image` | [[Product schema is missing "image"](https://github.com/armin5872/OptiQra/wiki/Audit-rules-structured-data#rule-schema-product-image)](#rule-schema-product-image) | Low | 3 pts |
| `jsonld-present` | [[N JSON-LD block(s) found](https://github.com/armin5872/OptiQra/wiki/Audit-rules-structured-data#rule-jsonld-present)](#rule-jsonld-present) | Positive signal | 0 pts |
| `microdata` | [[Microdata found on N element(s) and looks well-formed](https://github.com/armin5872/OptiQra/wiki/Audit-rules-structured-data#rule-microdata)](#rule-microdata) | Positive signal | 0 pts |
| `rdfa` | [[RDFa markup found on N element(s) with a vocab declared](https://github.com/armin5872/OptiQra/wiki/Audit-rules-structured-data#rule-rdfa)](#rule-rdfa) | Positive signal | 0 pts |
| `schema-article-Article` | [[Article schema has all required properties (headline, author, datePublished)](https://github.com/armin5872/OptiQra/wiki/Audit-rules-structured-data#rule-schema-article-article)](#rule-schema-article-article) | Positive signal | 0 pts |
| `schema-article-BlogPosting` | [[BlogPosting schema has all required properties (headline, author, datePublished)](https://github.com/armin5872/OptiQra/wiki/Audit-rules-structured-data#rule-schema-article-blogposting)](#rule-schema-article-blogposting) | Positive signal | 0 pts |
| `schema-article-NewsArticle` | [[NewsArticle schema has all required properties (headline, author, datePublished)](https://github.com/armin5872/OptiQra/wiki/Audit-rules-structured-data#rule-schema-article-newsarticle)](#rule-schema-article-newsarticle) | Positive signal | 0 pts |
| `schema-breadcrumb` | [[BreadcrumbList schema is valid](https://github.com/armin5872/OptiQra/wiki/Audit-rules-structured-data#rule-schema-breadcrumb)](#rule-schema-breadcrumb) | Positive signal | 0 pts |
| `schema-event` | [[Event schema has required properties](https://github.com/armin5872/OptiQra/wiki/Audit-rules-structured-data#rule-schema-event)](#rule-schema-event) | Positive signal | 0 pts |
| `schema-faq` | [[FAQPage schema is valid](https://github.com/armin5872/OptiQra/wiki/Audit-rules-structured-data#rule-schema-faq)](#rule-schema-faq) | Positive signal | 0 pts |
| `schema-localbusiness` | [[LocalBusiness schema has required properties](https://github.com/armin5872/OptiQra/wiki/Audit-rules-structured-data#rule-schema-localbusiness)](#rule-schema-localbusiness) | Positive signal | 0 pts |
| `schema-org` | [[Organization schema has required properties](https://github.com/armin5872/OptiQra/wiki/Audit-rules-structured-data#rule-schema-org)](#rule-schema-org) | Positive signal | 0 pts |
| `schema-person` | [[Person schema has required properties](https://github.com/armin5872/OptiQra/wiki/Audit-rules-structured-data#rule-schema-person)](#rule-schema-person) | Positive signal | 0 pts |
| `schema-product` | [[Product schema has required properties](https://github.com/armin5872/OptiQra/wiki/Audit-rules-structured-data#rule-schema-product)](#rule-schema-product) | Positive signal | 0 pts |
| `schema-searchaction` | [[SearchAction is present and correctly configured](https://github.com/armin5872/OptiQra/wiki/Audit-rules-structured-data#rule-schema-searchaction)](#rule-schema-searchaction) | Positive signal | 0 pts |
| `schema-website` | [[WebSite schema has required properties](https://github.com/armin5872/OptiQra/wiki/Audit-rules-structured-data#rule-schema-website)](#rule-schema-website) | Positive signal | 0 pts |

---

<a id="rule-jsonld-parse-error"></a>
## `jsonld-parse-error`

**N JSON-LD block(s) failed to parse**

| Severity | Weight | Category |
|---|---|---|
| High | 10 pts | Structured Data |

**What triggers it & why it matters:** One or more `<script type="application/ld+json">` tags contain invalid JSON, so search engines will silently ignore them.

**How to fix it & effect on score:** Validate JSON-LD with a linter (or the Rich Results Test) and fix syntax errors like trailing commas or unescaped quotes. Fixing this removes the 10 pts deduction from the **Structured Data** category score on the next scan.


---

<a id="rule-schema-article-required-article"></a>
## `schema-article-required-Article`

**Article schema is missing one or more required properties**

| Severity | Weight | Category |
|---|---|---|
| Medium–High | 6–9 pts (scales with how much of the page is affected — see source) | Structured Data |

**What triggers it & why it matters:** A JSON-LD node typed `Article` is missing at least one of its required properties (headline, author, datePublished). Article-family rich results require headline, author, datePublished; missing fields can prevent the article rich result from showing in search.

**How to fix it & effect on score:** Add the missing propert(y/ies) — one or more of headline, author, datePublished — to the `Article` JSON-LD block. Fixing this removes the 6–9 pts (scales with how much of the page is affected — see source) deduction from the **Structured Data** category score on the next scan.

**What a pass looks like:** Article schema has all required properties


---

<a id="rule-schema-article-required-blogposting"></a>
## `schema-article-required-BlogPosting`

**BlogPosting schema is missing one or more required properties**

| Severity | Weight | Category |
|---|---|---|
| Medium–High | 6–9 pts (scales with how much of the page is affected — see source) | Structured Data |

**What triggers it & why it matters:** A JSON-LD node typed `BlogPosting` is missing at least one of its required properties (headline, author, datePublished). Article-family rich results require headline, author, datePublished; missing fields can prevent the article rich result from showing in search.

**How to fix it & effect on score:** Add the missing propert(y/ies) — one or more of headline, author, datePublished — to the `BlogPosting` JSON-LD block. Fixing this removes the 6–9 pts (scales with how much of the page is affected — see source) deduction from the **Structured Data** category score on the next scan.

**What a pass looks like:** BlogPosting schema has all required properties


---

<a id="rule-schema-article-required-newsarticle"></a>
## `schema-article-required-NewsArticle`

**NewsArticle schema is missing one or more required properties**

| Severity | Weight | Category |
|---|---|---|
| Medium–High | 6–9 pts (scales with how much of the page is affected — see source) | Structured Data |

**What triggers it & why it matters:** A JSON-LD node typed `NewsArticle` is missing at least one of its required properties (headline, author, datePublished). Article-family rich results require headline, author, datePublished; missing fields can prevent the article rich result from showing in search.

**How to fix it & effect on score:** Add the missing propert(y/ies) — one or more of headline, author, datePublished — to the `NewsArticle` JSON-LD block. Fixing this removes the 6–9 pts (scales with how much of the page is affected — see source) deduction from the **Structured Data** category score on the next scan.

**What a pass looks like:** NewsArticle schema has all required properties


---

<a id="rule-jsonld-missing"></a>
## `jsonld-missing`

**No JSON-LD structured data found**

| Severity | Weight | Category |
|---|---|---|
| Medium | 8 pts | Structured Data |

**What triggers it & why it matters:** No `<script type="application/ld+json">` blocks were found on the page. JSON-LD is the format Google recommends for rich results (Organization, WebSite, Breadcrumbs, FAQs, Articles, Products, etc.).

**How to fix it & effect on score:** Add JSON-LD structured data describing the page, e.g. Organization/WebSite on the homepage, Article on blog posts, or Product on product pages. Fixing this removes the 8 pts deduction from the **Structured Data** category score on the next scan.


---

<a id="rule-schema-breadcrumb-invalid"></a>
## `schema-breadcrumb-invalid`

**BreadcrumbList schema has N issue(s)**

| Severity | Weight | Category |
|---|---|---|
| Medium | 5–8 pts (scales with how much of the page is affected — see source) | Structured Data |

**What triggers it & why it matters:** Breadcrumb rich results require each itemListElement to have position, name, and item: *(actual value found on the page, truncated)*.

**How to fix it & effect on score:** Ensure every itemListElement has "position" (integer), "name", and an absolute "item" URL. Fixing this removes the 5–8 pts (scales with how much of the page is affected — see source) deduction from the **Structured Data** category score on the next scan.


---

<a id="rule-schema-event-required"></a>
## `schema-event-required`

**Event schema is missing required property/ies: N**

| Severity | Weight | Category |
|---|---|---|
| Medium | 5–8 pts (scales with how much of the page is affected — see source) | Structured Data |

**What triggers it & why it matters:** Event rich results require "name", "startDate", and "location" at minimum.

**How to fix it & effect on score:** Add N to the Event JSON-LD block. Fixing this removes the 5–8 pts (scales with how much of the page is affected — see source) deduction from the **Structured Data** category score on the next scan.


---

<a id="rule-schema-faq-invalid"></a>
## `schema-faq-invalid`

**FAQPage schema has N issue(s)**

| Severity | Weight | Category |
|---|---|---|
| Medium | 5–8 pts (scales with how much of the page is affected — see source) | Structured Data |

**What triggers it & why it matters:** FAQ rich results require each mainEntity Question to have a name and an acceptedAnswer.text: *(actual value found on the page, truncated)*.

**How to fix it & effect on score:** Ensure every Question has "name" and an acceptedAnswer with "text". Fixing this removes the 5–8 pts (scales with how much of the page is affected — see source) deduction from the **Structured Data** category score on the next scan.


---

<a id="rule-schema-missing-type"></a>
## `schema-missing-type`

**N JSON-LD node(s) missing "@type"**

| Severity | Weight | Category |
|---|---|---|
| Medium | 8 pts | Structured Data |

**What triggers it & why it matters:** Every JSON-LD node needs an "@type" so search engines know which schema.org vocabulary applies.

**How to fix it & effect on score:** Add an appropriate "@type" (e.g. "Organization", "Article", "Product") to each JSON-LD node. Fixing this removes the 8 pts deduction from the **Structured Data** category score on the next scan.


---

<a id="rule-schema-org-required"></a>
## `schema-org-required`

**Organization schema is missing required property/ies: N**

| Severity | Weight | Category |
|---|---|---|
| Medium | 5–8 pts (scales with how much of the page is affected — see source) | Structured Data |

**What triggers it & why it matters:** Organization schema needs at least "name" and "url" to be usable for knowledge panel / logo rich results.

**How to fix it & effect on score:** Add N to the Organization JSON-LD block. Fixing this removes the 5–8 pts (scales with how much of the page is affected — see source) deduction from the **Structured Data** category score on the next scan.


---

<a id="rule-structured-data-none"></a>
## `structured-data-none`

**No structured data detected on the page (JSON-LD, Microdata, or RDFa)**

| Severity | Weight | Category |
|---|---|---|
| Medium | 8 pts | Structured Data |

**What triggers it & why it matters:** Without any structured data, this page is not eligible for rich results like sitelinks search boxes, breadcrumbs, FAQs, product pricing, or article cards.

**How to fix it & effect on score:** Add JSON-LD structured data appropriate to the page type (Organization/WebSite on the homepage, Article on posts, Product on product pages, etc.). Fixing this removes the 8 pts deduction from the **Structured Data** category score on the next scan.


---

<a id="rule-schema-invalid-type"></a>
## `schema-invalid-type`

**Unrecognized schema type(s): *(actual value found on the page, truncated)***

| Severity | Weight | Category |
|---|---|---|
| Medium | 7 pts | Structured Data |

**What triggers it & why it matters:** These "@type" values don't match standard schema.org type names (case-sensitive), which likely means a typo or an invalid/custom type that rich results won't recognize.

**How to fix it & effect on score:** Check spelling/casing against schema.org and use a valid registered type (e.g. "LocalBusiness", not "localbusiness" or "Local_Business"). Fixing this removes the 7 pts deduction from the **Structured Data** category score on the next scan.


---

<a id="rule-schema-localbusiness-required"></a>
## `schema-localbusiness-required`

**LocalBusiness schema is missing required property/ies: N**

| Severity | Weight | Category |
|---|---|---|
| Medium | 7 pts | Structured Data |

**What triggers it & why it matters:** LocalBusiness schema needs "name" and "address" for local search / map pack eligibility.

**How to fix it & effect on score:** Add N to the LocalBusiness JSON-LD block. Fixing this removes the 7 pts deduction from the **Structured Data** category score on the next scan.


---

<a id="rule-schema-missing-context"></a>
## `schema-missing-context`

**N JSON-LD node(s) missing a schema.org "@context"**

| Severity | Weight | Category |
|---|---|---|
| Medium | 6 pts | Structured Data |

**What triggers it & why it matters:** Without "@context": "https://schema.org", the "@type" values are ambiguous and may be ignored by search engines.

**How to fix it & effect on score:** Add "@context": "https://schema.org" to each top-level JSON-LD object. Fixing this removes the 6 pts deduction from the **Structured Data** category score on the next scan.


---

<a id="rule-schema-product-offers"></a>
## `schema-product-offers`

**Product schema is missing a valid "offers" with price/priceCurrency**

| Severity | Weight | Category |
|---|---|---|
| Medium | 6 pts | Structured Data |

**What triggers it & why it matters:** Google requires Product rich results to include an offers object with "price" and "priceCurrency" (or an aggregateOffer) to show pricing.

**How to fix it & effect on score:** Add an "offers" object with "price", "priceCurrency", and "availability". Fixing this removes the 6 pts deduction from the **Structured Data** category score on the next scan.


---

<a id="rule-schema-product-required"></a>
## `schema-product-required`

**Product schema is missing required property/ies: N**

| Severity | Weight | Category |
|---|---|---|
| Medium | 6 pts | Structured Data |

**What triggers it & why it matters:** Product schema needs at least a "name" to be valid.

**How to fix it & effect on score:** Add N to the Product JSON-LD block. Fixing this removes the 6 pts deduction from the **Structured Data** category score on the next scan.


---

<a id="rule-schema-website-required"></a>
## `schema-website-required`

**WebSite schema is missing required property/ies: N**

| Severity | Weight | Category |
|---|---|---|
| Medium | 6 pts | Structured Data |

**What triggers it & why it matters:** WebSite schema needs "name" and "url" at minimum.

**How to fix it & effect on score:** Add N to the WebSite JSON-LD block. Fixing this removes the 6 pts deduction from the **Structured Data** category score on the next scan.


---

<a id="rule-microdata-missing-itemtype"></a>
## `microdata-missing-itemtype`

**N microdata element(s) missing "itemtype"**

| Severity | Weight | Category |
|---|---|---|
| Medium | 5 pts | Structured Data |

**What triggers it & why it matters:** Elements using itemscope without a matching itemtype have no defined vocabulary, so parsers can't interpret the properties inside them.

**How to fix it & effect on score:** Add an itemtype attribute (e.g. itemtype="https://schema.org/Product") to every itemscope element. Fixing this removes the 5 pts deduction from the **Structured Data** category score on the next scan.


---

<a id="rule-schema-person-required"></a>
## `schema-person-required`

**Person schema is missing required property: name**

| Severity | Weight | Category |
|---|---|---|
| Medium | 5 pts | Structured Data |

**What triggers it & why it matters:** Person schema is not useful to search engines without at least a "name".

**How to fix it & effect on score:** Add a "name" property to the Person JSON-LD block. Fixing this removes the 5 pts deduction from the **Structured Data** category score on the next scan.


---

<a id="rule-schema-searchaction-invalid"></a>
## `schema-searchaction-invalid`

**SearchAction is malformed (invalid target/urlTemplate / invalid query-input)**

| Severity | Weight | Category |
|---|---|---|
| Medium | 5 pts | Structured Data |

**What triggers it & why it matters:** The SearchAction target must contain "{search_term_string}" as a placeholder and query-input must reference "search_term_string".

**How to fix it & effect on score:** Set target.urlTemplate to something like "https://example.com/search?q={search_term_string}" and query-input to "required name=search_term_string". Fixing this removes the 5 pts deduction from the **Structured Data** category score on the next scan.


---

<a id="rule-microdata-invalid-itemtype"></a>
## `microdata-invalid-itemtype`

**N microdata element(s) use a non-schema.org itemtype**

| Severity | Weight | Category |
|---|---|---|
| Low | 4 pts | Structured Data |

**What triggers it & why it matters:** itemtype values should be absolute schema.org URLs (https://schema.org/Type) for search engines to recognize them.

**How to fix it & effect on score:** Point itemtype attributes at https://schema.org/ type URLs. Fixing this removes the 4 pts deduction from the **Structured Data** category score on the next scan.


---

<a id="rule-rdfa-missing-vocab"></a>
## `rdfa-missing-vocab`

**RDFa "typeof" attributes found without a "vocab" declaration**

| Severity | Weight | Category |
|---|---|---|
| Low | 4 pts | Structured Data |

**What triggers it & why it matters:** RDFa typeof values are ambiguous without a vocab attribute (typically vocab="https://schema.org/") establishing which vocabulary the types come from.

**How to fix it & effect on score:** Add vocab="https://schema.org/" to the `<html>` or a wrapping element that contains the RDFa markup. Fixing this removes the 4 pts deduction from the **Structured Data** category score on the next scan.


---

<a id="rule-schema-searchaction-missing"></a>
## `schema-searchaction-missing`

**WebSite schema has no SearchAction (sitelinks search box)**

| Severity | Weight | Category |
|---|---|---|
| Low | 4 pts | Structured Data |

**What triggers it & why it matters:** Without a potentialAction/SearchAction, Google cannot show a sitelinks search box for your site in search results.

**How to fix it & effect on score:** Add a potentialAction with @type "SearchAction", a target urlTemplate containing "{search_term_string}", and query-input "required name=search_term_string". Fixing this removes the 4 pts deduction from the **Structured Data** category score on the next scan.


---

<a id="rule-jsonld-empty"></a>
## `jsonld-empty`

**N empty JSON-LD script tag(s)**

| Severity | Weight | Category |
|---|---|---|
| Low | 3 pts | Structured Data |

**What triggers it & why it matters:** A `<script type="application/ld+json">` tag exists but contains no content.

**How to fix it & effect on score:** Remove empty JSON-LD script tags or populate them with valid structured data. Fixing this removes the 3 pts deduction from the **Structured Data** category score on the next scan.


---

<a id="rule-schema-localbusiness-phone"></a>
## `schema-localbusiness-phone`

**LocalBusiness schema is missing "telephone"**

| Severity | Weight | Category |
|---|---|---|
| Low | 3 pts | Structured Data |

**What triggers it & why it matters:** A phone number helps LocalBusiness listings qualify for click-to-call rich results.

**How to fix it & effect on score:** Add a "telephone" property in E.164 or national format. Fixing this removes the 3 pts deduction from the **Structured Data** category score on the next scan.


---

<a id="rule-schema-org-logo"></a>
## `schema-org-logo`

**Organization schema is missing "logo"**

| Severity | Weight | Category |
|---|---|---|
| Low | 3 pts | Structured Data |

**What triggers it & why it matters:** Google uses the Organization logo for knowledge panels and search result branding.

**How to fix it & effect on score:** Add a "logo" property with an absolute image URL to the Organization schema. Fixing this removes the 3 pts deduction from the **Structured Data** category score on the next scan.


---

<a id="rule-schema-product-image"></a>
## `schema-product-image`

**Product schema is missing "image"**

| Severity | Weight | Category |
|---|---|---|
| Low | 3 pts | Structured Data |

**What triggers it & why it matters:** Product rich results display an image; without it, the listing looks incomplete.

**How to fix it & effect on score:** Add an "image" property with one or more absolute image URLs. Fixing this removes the 3 pts deduction from the **Structured Data** category score on the next scan.


---

<a id="rule-jsonld-present"></a>
## `jsonld-present`

**N JSON-LD block(s) found**

| Severity | Weight | Category |
|---|---|---|
| Positive signal | 0 pts | Structured Data |

**What triggers it & why it matters:** This rule only ever surfaces as a passing signal in the current source — it fires (as a pass) when: *N JSON-LD block(s) found*. There is no separate failing `issue()` call under this exact id; the failure condition is the logical negation of the pass condition, and in most cases is covered by a related rule id documented elsewhere in this category (see the table above for a sibling rule on the same feature).

**Effect on score:** Meeting this condition costs nothing and confirms a positive signal. Missing it doesn't directly deduct points under *this* id — it typically shows up as a deduction under the related failing rule instead.


---

<a id="rule-microdata"></a>
## `microdata`

**Microdata found on N element(s) and looks well-formed**

| Severity | Weight | Category |
|---|---|---|
| Positive signal | 0 pts | Structured Data |

**What triggers it & why it matters:** This rule only ever surfaces as a passing signal in the current source — it fires (as a pass) when: *Microdata found on N element(s) and looks well-formed*. There is no separate failing `issue()` call under this exact id; the failure condition is the logical negation of the pass condition, and in most cases is covered by a related rule id documented elsewhere in this category (see the table above for a sibling rule on the same feature).

**Effect on score:** Meeting this condition costs nothing and confirms a positive signal. Missing it doesn't directly deduct points under *this* id — it typically shows up as a deduction under the related failing rule instead.


---

<a id="rule-rdfa"></a>
## `rdfa`

**RDFa markup found on N element(s) with a vocab declared**

| Severity | Weight | Category |
|---|---|---|
| Positive signal | 0 pts | Structured Data |

**What triggers it & why it matters:** This rule only ever surfaces as a passing signal in the current source — it fires (as a pass) when: *RDFa markup found on N element(s) with a vocab declared*. There is no separate failing `issue()` call under this exact id; the failure condition is the logical negation of the pass condition, and in most cases is covered by a related rule id documented elsewhere in this category (see the table above for a sibling rule on the same feature).

**Effect on score:** Meeting this condition costs nothing and confirms a positive signal. Missing it doesn't directly deduct points under *this* id — it typically shows up as a deduction under the related failing rule instead.


---

<a id="rule-schema-article-article"></a>
## `schema-article-Article`

**Article schema has all required properties**

| Severity | Weight | Category |
|---|---|---|
| Positive signal | 0 pts | Structured Data |

**What triggers it & why it matters:** This rule only ever surfaces as a passing signal in the current source — it fires (as a pass) when: *Article schema has all required properties (headline, author, datePublished)*. There is no separate failing `issue()` call under this exact id; the failure condition is the logical negation of the pass condition, and in most cases is covered by a related rule id documented elsewhere in this category (see the table above for a sibling rule on the same feature).

**Effect on score:** Meeting this condition costs nothing and confirms a positive signal. Missing it doesn't directly deduct points under *this* id — it typically shows up as a deduction under the related failing rule instead.


---

<a id="rule-schema-article-blogposting"></a>
## `schema-article-BlogPosting`

**BlogPosting schema has all required properties**

| Severity | Weight | Category |
|---|---|---|
| Positive signal | 0 pts | Structured Data |

**What triggers it & why it matters:** This rule only ever surfaces as a passing signal in the current source — it fires (as a pass) when: *BlogPosting schema has all required properties (headline, author, datePublished)*. There is no separate failing `issue()` call under this exact id; the failure condition is the logical negation of the pass condition, and in most cases is covered by a related rule id documented elsewhere in this category (see the table above for a sibling rule on the same feature).

**Effect on score:** Meeting this condition costs nothing and confirms a positive signal. Missing it doesn't directly deduct points under *this* id — it typically shows up as a deduction under the related failing rule instead.


---

<a id="rule-schema-article-newsarticle"></a>
## `schema-article-NewsArticle`

**NewsArticle schema has all required properties**

| Severity | Weight | Category |
|---|---|---|
| Positive signal | 0 pts | Structured Data |

**What triggers it & why it matters:** This rule only ever surfaces as a passing signal in the current source — it fires (as a pass) when: *NewsArticle schema has all required properties (headline, author, datePublished)*. There is no separate failing `issue()` call under this exact id; the failure condition is the logical negation of the pass condition, and in most cases is covered by a related rule id documented elsewhere in this category (see the table above for a sibling rule on the same feature).

**Effect on score:** Meeting this condition costs nothing and confirms a positive signal. Missing it doesn't directly deduct points under *this* id — it typically shows up as a deduction under the related failing rule instead.


---

<a id="rule-schema-breadcrumb"></a>
## `schema-breadcrumb`

**BreadcrumbList schema is valid**

| Severity | Weight | Category |
|---|---|---|
| Positive signal | 0 pts | Structured Data |

**What triggers it & why it matters:** This rule only ever surfaces as a passing signal in the current source — it fires (as a pass) when: *BreadcrumbList schema is valid*. There is no separate failing `issue()` call under this exact id; the failure condition is the logical negation of the pass condition, and in most cases is covered by a related rule id documented elsewhere in this category (see the table above for a sibling rule on the same feature).

**Effect on score:** Meeting this condition costs nothing and confirms a positive signal. Missing it doesn't directly deduct points under *this* id — it typically shows up as a deduction under the related failing rule instead.


---

<a id="rule-schema-event"></a>
## `schema-event`

**Event schema has required properties**

| Severity | Weight | Category |
|---|---|---|
| Positive signal | 0 pts | Structured Data |

**What triggers it & why it matters:** This rule only ever surfaces as a passing signal in the current source — it fires (as a pass) when: *Event schema has required properties*. There is no separate failing `issue()` call under this exact id; the failure condition is the logical negation of the pass condition, and in most cases is covered by a related rule id documented elsewhere in this category (see the table above for a sibling rule on the same feature).

**Effect on score:** Meeting this condition costs nothing and confirms a positive signal. Missing it doesn't directly deduct points under *this* id — it typically shows up as a deduction under the related failing rule instead.


---

<a id="rule-schema-faq"></a>
## `schema-faq`

**FAQPage schema is valid**

| Severity | Weight | Category |
|---|---|---|
| Positive signal | 0 pts | Structured Data |

**What triggers it & why it matters:** This rule only ever surfaces as a passing signal in the current source — it fires (as a pass) when: *FAQPage schema is valid*. There is no separate failing `issue()` call under this exact id; the failure condition is the logical negation of the pass condition, and in most cases is covered by a related rule id documented elsewhere in this category (see the table above for a sibling rule on the same feature).

**Effect on score:** Meeting this condition costs nothing and confirms a positive signal. Missing it doesn't directly deduct points under *this* id — it typically shows up as a deduction under the related failing rule instead.


---

<a id="rule-schema-localbusiness"></a>
## `schema-localbusiness`

**LocalBusiness schema has required properties**

| Severity | Weight | Category |
|---|---|---|
| Positive signal | 0 pts | Structured Data |

**What triggers it & why it matters:** This rule only ever surfaces as a passing signal in the current source — it fires (as a pass) when: *LocalBusiness schema has required properties*. There is no separate failing `issue()` call under this exact id; the failure condition is the logical negation of the pass condition, and in most cases is covered by a related rule id documented elsewhere in this category (see the table above for a sibling rule on the same feature).

**Effect on score:** Meeting this condition costs nothing and confirms a positive signal. Missing it doesn't directly deduct points under *this* id — it typically shows up as a deduction under the related failing rule instead.


---

<a id="rule-schema-org"></a>
## `schema-org`

**Organization schema has required properties**

| Severity | Weight | Category |
|---|---|---|
| Positive signal | 0 pts | Structured Data |

**What triggers it & why it matters:** This rule only ever surfaces as a passing signal in the current source — it fires (as a pass) when: *Organization schema has required properties*. There is no separate failing `issue()` call under this exact id; the failure condition is the logical negation of the pass condition, and in most cases is covered by a related rule id documented elsewhere in this category (see the table above for a sibling rule on the same feature).

**Effect on score:** Meeting this condition costs nothing and confirms a positive signal. Missing it doesn't directly deduct points under *this* id — it typically shows up as a deduction under the related failing rule instead.


---

<a id="rule-schema-person"></a>
## `schema-person`

**Person schema has required properties**

| Severity | Weight | Category |
|---|---|---|
| Positive signal | 0 pts | Structured Data |

**What triggers it & why it matters:** This rule only ever surfaces as a passing signal in the current source — it fires (as a pass) when: *Person schema has required properties*. There is no separate failing `issue()` call under this exact id; the failure condition is the logical negation of the pass condition, and in most cases is covered by a related rule id documented elsewhere in this category (see the table above for a sibling rule on the same feature).

**Effect on score:** Meeting this condition costs nothing and confirms a positive signal. Missing it doesn't directly deduct points under *this* id — it typically shows up as a deduction under the related failing rule instead.


---

<a id="rule-schema-product"></a>
## `schema-product`

**Product schema has required properties**

| Severity | Weight | Category |
|---|---|---|
| Positive signal | 0 pts | Structured Data |

**What triggers it & why it matters:** This rule only ever surfaces as a passing signal in the current source — it fires (as a pass) when: *Product schema has required properties*. There is no separate failing `issue()` call under this exact id; the failure condition is the logical negation of the pass condition, and in most cases is covered by a related rule id documented elsewhere in this category (see the table above for a sibling rule on the same feature).

**Effect on score:** Meeting this condition costs nothing and confirms a positive signal. Missing it doesn't directly deduct points under *this* id — it typically shows up as a deduction under the related failing rule instead.


---

<a id="rule-schema-searchaction"></a>
## `schema-searchaction`

**SearchAction is present and correctly configured**

| Severity | Weight | Category |
|---|---|---|
| Positive signal | 0 pts | Structured Data |

**What triggers it & why it matters:** This rule only ever surfaces as a passing signal in the current source — it fires (as a pass) when: *SearchAction is present and correctly configured*. There is no separate failing `issue()` call under this exact id; the failure condition is the logical negation of the pass condition, and in most cases is covered by a related rule id documented elsewhere in this category (see the table above for a sibling rule on the same feature).

**Effect on score:** Meeting this condition costs nothing and confirms a positive signal. Missing it doesn't directly deduct points under *this* id — it typically shows up as a deduction under the related failing rule instead.


---

<a id="rule-schema-website"></a>
## `schema-website`

**WebSite schema has required properties**

| Severity | Weight | Category |
|---|---|---|
| Positive signal | 0 pts | Structured Data |

**What triggers it & why it matters:** This rule only ever surfaces as a passing signal in the current source — it fires (as a pass) when: *WebSite schema has required properties*. There is no separate failing `issue()` call under this exact id; the failure condition is the logical negation of the pass condition, and in most cases is covered by a related rule id documented elsewhere in this category (see the table above for a sibling rule on the same feature).

**Effect on score:** Meeting this condition costs nothing and confirms a positive signal. Missing it doesn't directly deduct points under *this* id — it typically shows up as a deduction under the related failing rule instead.


---