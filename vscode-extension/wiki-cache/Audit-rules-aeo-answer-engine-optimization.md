<html>
<body>
<!--StartFragment--><html><head></head><body><h1>AEO (Answer Engine Optimization)</h1>
<p><a href="https://github.com/armin5872/OptiQra/wiki/Home">← Back to Home</a></p>
<p>Checks for whether AI <em>answer engines</em> (ChatGPT browsing, Perplexity, Google AI Overviews, voice assistants) can access a page at all, and whether its content is structured so an answer engine can lift it directly into a response. Source: <code>src/lib/aeoAudit.ts</code> (<code>analyzeAEO</code>, <code>analyzeAEOSiteSignals</code>).</p>
<p><strong>24 rules in this category.</strong></p>

ID | Rule | Severity | Weight
-- | -- | -- | --
aeo-ai-crawlers-blocked | robots.txt blocks N AI answer-engine crawler(s) | High | 12 pts
aeo-ai-crawler-firewall-block | Requests with an AI crawler user-agent get HTTP (actual HTTP status code) | High | 10 pts
aeo-ai-crawler-network-block | A request identifying as an AI crawler failed outright | High | 10 pts
aeo-answer-schema-missing | Q&A-style content isn't marked up as FAQPage/QAPage | Medium | 7 pts
aeo-freshness-missing | No publish or last-updated date found | Medium | 6 pts
aeo-intro-paragraph | No clear introductory paragraph found | Medium | 6 pts
aeo-semantic-container | No <main> or <article> element wraps the content | Medium | 6 pts
aeo-author-missing | No author or byline found | Medium | 5 pts
aeo-question-headings | No subheadings are phrased as questions | Medium | 5 pts
aeo-scannable-structure | No lists or tables found in substantial content | Medium | 5 pts
aeo-intro-paragraph-thin | Opening paragraph is too short to serve as a direct answer | Low | 4 pts
aeo-no-qa-content | No question-and-answer content or schema found | Low | 4 pts
aeo-citations | No outbound links to external sources | Low | 3 pts
aeo-llms-txt-missing | No llms.txt file found | Low | 3 pts
aeo-toc-missing | Long page has no jump-to-section navigation | Low | 3 pts
aeo-speakable-missing | No Speakable schema for voice assistants | Low | 2 pts
aeo-ai-crawler-firewall | Requests with an AI crawler user-agent (GPTBot) aren't blocked at the network level | Positive signal | 0 pts
aeo-ai-crawlers | AI answer-engine crawlers (GPTBot, ClaudeBot, PerplexityBot, Google-Extended, etc.) are not blocked | Positive signal | 0 pts
aeo-answer-schema | Page uses FAQPage/QAPage/HowTo structured data that answer engines can lift directly | Positive signal | 0 pts
aeo-author | Page identifies an author or byline | Positive signal | 0 pts
aeo-freshness | Page exposes a publish or last-updated date | Positive signal | 0 pts
aeo-llms-txt | llms.txt is present with content | Positive signal | 0 pts
aeo-speakable | Page marks speakable sections for voice assistants | Positive signal | 0 pts
aeo-toc | Long-form content includes a jump-to-section table of contents | Positive signal | 0 pts


<p><strong>What triggers it &amp; why it matters:</strong> This rule only ever surfaces as a passing signal in the current source — it fires (as a pass) when: <em>Long-form content includes a jump-to-section table of contents</em>. There is no separate failing <code>issue()</code> call under this exact id; the failure condition is the logical negation of the pass condition, and in most cases is covered by a related rule id documented elsewhere in this category (see the table above for a sibling rule on the same feature).</p>
<p><strong>Effect on score:</strong> Meeting this condition costs nothing and confirms a positive signal. Missing it doesn't directly deduct points under <em>this</em> id — it typically shows up as a deduction under the related failing rule instead.</p>
<hr></body></html><!--EndFragment-->
</body>
</html># AEO (Answer Engine Optimization)

[[← Back to Home](https://github.com/armin5872/OptiQra/wiki/Home)](https://github.com/armin5872/OptiQra/wiki/Home)

Checks for whether AI *answer engines* (ChatGPT browsing, Perplexity, Google AI Overviews, voice assistants) can access a page at all, and whether its content is structured so an answer engine can lift it directly into a response. Source: `src/lib/aeoAudit.ts` (`analyzeAEO`, `analyzeAEOSiteSignals`).

**24 rules in this category.**

| ID | Rule | Severity | Weight |
|---|---|---|---|
| `aeo-ai-crawlers-blocked` | [[robots.txt blocks N AI answer-engine crawler(s)](https://github.com/armin5872/OptiQra/wiki/Audit-rules-aeo-answer-engine-optimization#rule-aeo-ai-crawlers-blocked)](#rule-aeo-ai-crawlers-blocked) | High | 12 pts |
| `aeo-ai-crawler-firewall-block` | [Requests with an AI crawler user-agent get HTTP *(actual HTTP status code)*](#rule-aeo-ai-crawler-firewall-block) | High | 10 pts |
| `aeo-ai-crawler-network-block` | [[A request identifying as an AI crawler failed outright](https://github.com/armin5872/OptiQra/wiki/Audit-rules-aeo-answer-engine-optimization#rule-aeo-ai-crawler-network-block)](#rule-aeo-ai-crawler-network-block) | High | 10 pts |
| `aeo-answer-schema-missing` | [[Q&A-style content isn't marked up as FAQPage/QAPage](https://github.com/armin5872/OptiQra/wiki/Audit-rules-aeo-answer-engine-optimization#rule-aeo-answer-schema-missing)](#rule-aeo-answer-schema-missing) | Medium | 7 pts |
| `aeo-freshness-missing` | [[No publish or last-updated date found](https://github.com/armin5872/OptiQra/wiki/Audit-rules-aeo-answer-engine-optimization#rule-aeo-freshness-missing)](#rule-aeo-freshness-missing) | Medium | 6 pts |
| `aeo-intro-paragraph` | [[No clear introductory paragraph found](https://github.com/armin5872/OptiQra/wiki/Audit-rules-aeo-answer-engine-optimization#rule-aeo-intro-paragraph)](#rule-aeo-intro-paragraph) | Medium | 6 pts |
| `aeo-semantic-container` | [No `<main>` or `<article>` element wraps the content](#rule-aeo-semantic-container) | Medium | 6 pts |
| `aeo-author-missing` | [[No author or byline found](https://github.com/armin5872/OptiQra/wiki/Audit-rules-aeo-answer-engine-optimization#rule-aeo-author-missing)](#rule-aeo-author-missing) | Medium | 5 pts |
| `aeo-question-headings` | [[No subheadings are phrased as questions](https://github.com/armin5872/OptiQra/wiki/Audit-rules-aeo-answer-engine-optimization#rule-aeo-question-headings)](#rule-aeo-question-headings) | Medium | 5 pts |
| `aeo-scannable-structure` | [[No lists or tables found in substantial content](https://github.com/armin5872/OptiQra/wiki/Audit-rules-aeo-answer-engine-optimization#rule-aeo-scannable-structure)](#rule-aeo-scannable-structure) | Medium | 5 pts |
| `aeo-intro-paragraph-thin` | [[Opening paragraph is too short to serve as a direct answer](https://github.com/armin5872/OptiQra/wiki/Audit-rules-aeo-answer-engine-optimization#rule-aeo-intro-paragraph-thin)](#rule-aeo-intro-paragraph-thin) | Low | 4 pts |
| `aeo-no-qa-content` | [[No question-and-answer content or schema found](https://github.com/armin5872/OptiQra/wiki/Audit-rules-aeo-answer-engine-optimization#rule-aeo-no-qa-content)](#rule-aeo-no-qa-content) | Low | 4 pts |
| `aeo-citations` | [[No outbound links to external sources](https://github.com/armin5872/OptiQra/wiki/Audit-rules-aeo-answer-engine-optimization#rule-aeo-citations)](#rule-aeo-citations) | Low | 3 pts |
| `aeo-llms-txt-missing` | [[No llms.txt file found](https://github.com/armin5872/OptiQra/wiki/Audit-rules-aeo-answer-engine-optimization#rule-aeo-llms-txt-missing)](#rule-aeo-llms-txt-missing) | Low | 3 pts |
| `aeo-toc-missing` | [[Long page has no jump-to-section navigation](https://github.com/armin5872/OptiQra/wiki/Audit-rules-aeo-answer-engine-optimization#rule-aeo-toc-missing)](#rule-aeo-toc-missing) | Low | 3 pts |
| `aeo-speakable-missing` | [[No Speakable schema for voice assistants](https://github.com/armin5872/OptiQra/wiki/Audit-rules-aeo-answer-engine-optimization#rule-aeo-speakable-missing)](#rule-aeo-speakable-missing) | Low | 2 pts |
| `aeo-ai-crawler-firewall` | [[Requests with an AI crawler user-agent (GPTBot) aren't blocked at the network level](https://github.com/armin5872/OptiQra/wiki/Audit-rules-aeo-answer-engine-optimization#rule-aeo-ai-crawler-firewall)](#rule-aeo-ai-crawler-firewall) | Positive signal | 0 pts |
| `aeo-ai-crawlers` | [[AI answer-engine crawlers (GPTBot, ClaudeBot, PerplexityBot, Google-Extended, etc.) are not blocked](https://github.com/armin5872/OptiQra/wiki/Audit-rules-aeo-answer-engine-optimization#rule-aeo-ai-crawlers)](#rule-aeo-ai-crawlers) | Positive signal | 0 pts |
| `aeo-answer-schema` | [[Page uses FAQPage/QAPage/HowTo structured data that answer engines can lift directly](https://github.com/armin5872/OptiQra/wiki/Audit-rules-aeo-answer-engine-optimization#rule-aeo-answer-schema)](#rule-aeo-answer-schema) | Positive signal | 0 pts |
| `aeo-author` | [[Page identifies an author or byline](https://github.com/armin5872/OptiQra/wiki/Audit-rules-aeo-answer-engine-optimization#rule-aeo-author)](#rule-aeo-author) | Positive signal | 0 pts |
| `aeo-freshness` | [[Page exposes a publish or last-updated date](https://github.com/armin5872/OptiQra/wiki/Audit-rules-aeo-answer-engine-optimization#rule-aeo-freshness)](#rule-aeo-freshness) | Positive signal | 0 pts |
| `aeo-llms-txt` | [[llms.txt is present with content](https://github.com/armin5872/OptiQra/wiki/Audit-rules-aeo-answer-engine-optimization#rule-aeo-llms-txt)](#rule-aeo-llms-txt) | Positive signal | 0 pts |
| `aeo-speakable` | [[Page marks speakable sections for voice assistants](https://github.com/armin5872/OptiQra/wiki/Audit-rules-aeo-answer-engine-optimization#rule-aeo-speakable)](#rule-aeo-speakable) | Positive signal | 0 pts |
| `aeo-toc` | [[Long-form content includes a jump-to-section table of contents](https://github.com/armin5872/OptiQra/wiki/Audit-rules-aeo-answer-engine-optimization#rule-aeo-toc)](#rule-aeo-toc) | Positive signal | 0 pts |

---

<a id="rule-aeo-ai-crawlers-blocked"></a>
## `aeo-ai-crawlers-blocked`

**robots.txt blocks N AI answer-engine crawler(s)**

| Severity | Weight | Category |
|---|---|---|
| High | 12 pts | AEO (Answer Engine Optimization) |

**What triggers it & why it matters:** N is/are disallowed in robots.txt, so this content can't be crawled, cited, or surfaced by that assistant's answers, even if it ranks well in traditional search.

**How to fix it & effect on score:** If you want this content eligible for AI answer engines, remove the Disallow rule for the relevant user-agent(s), or add an explicit Allow group for them. Fixing this removes the 12 pts deduction from the **AEO (Answer Engine Optimization)** category score on the next scan.


---

<a id="rule-aeo-ai-crawler-firewall-block"></a>
## `aeo-ai-crawler-firewall-block`

**Requests with an AI crawler user-agent get HTTP *(actual HTTP status code)***

| Severity | Weight | Category |
|---|---|---|
| High | 10 pts | AEO (Answer Engine Optimization) |

**What triggers it & why it matters:** A request using GPTBot's user-agent returned HTTP *(actual HTTP status code)*, while the identical request with a normal browser user-agent returned *(actual HTTP status code)*. robots.txt may allow this crawler, but a firewall, bot-protection service, or CDN rule is blocking it at the network level, which fully excludes this page from that engine's answers regardless of robots.txt.

**How to fix it & effect on score:** Check your CDN/WAF bot-management settings (e.g. Cloudflare "Verified Bots") for rules blocking AI crawlers by user-agent or ASN, and allow the ones you want indexed. Fixing this removes the 10 pts deduction from the **AEO (Answer Engine Optimization)** category score on the next scan.


---

<a id="rule-aeo-ai-crawler-network-block"></a>
## `aeo-ai-crawler-network-block`

**A request identifying as an AI crawler failed outright**

| Severity | Weight | Category |
|---|---|---|
| High | 10 pts | AEO (Answer Engine Optimization) |

**What triggers it & why it matters:** A request sent with GPTBot's user-agent could not complete at all (connection-level failure), while the same request under a normal browser user-agent succeeded. This points to a firewall, CDN, or bot-management rule blocking AI crawlers below the level robots.txt can express.

**How to fix it & effect on score:** Check your CDN/WAF (Cloudflare, etc.) bot-management rules for entries blocking GPTBot or AI crawlers generally, and allow the ones you want eligible for AI answers. Fixing this removes the 10 pts deduction from the **AEO (Answer Engine Optimization)** category score on the next scan.


---

<a id="rule-aeo-answer-schema-missing"></a>
## `aeo-answer-schema-missing`

**Q&A-style content isn't marked up as FAQPage/QAPage**

| Severity | Weight | Category |
|---|---|---|
| Medium | 7 pts | AEO (Answer Engine Optimization) |

**What triggers it & why it matters:** Found N question-style heading(s) (e.g. "*(actual value found on the page, truncated)*") but no matching FAQPage, QAPage, or HowTo structured data. Answer engines strongly favor content that's explicitly marked up this way when choosing what to quote or cite.

**How to fix it & effect on score:** Wrap existing question/answer content in FAQPage (or HowTo for step-by-step content) JSON-LD so each question and its answer are machine-readable. Fixing this removes the 7 pts deduction from the **AEO (Answer Engine Optimization)** category score on the next scan.


---

<a id="rule-aeo-freshness-missing"></a>
## `aeo-freshness-missing`

**No publish or last-updated date found**

| Severity | Weight | Category |
|---|---|---|
| Medium | 6 pts | AEO (Answer Engine Optimization) |

**What triggers it & why it matters:** No article:modified_time meta tag, `<time datetime>` element, or dateModified/datePublished in structured data was found. Answer engines favor demonstrably current content, especially for anything time-sensitive.

**How to fix it & effect on score:** Add a visible last-updated date wrapped in a `<time datetime="...">` element, and set dateModified in your JSON-LD. Fixing this removes the 6 pts deduction from the **AEO (Answer Engine Optimization)** category score on the next scan.


---

<a id="rule-aeo-intro-paragraph"></a>
## `aeo-intro-paragraph`

**No clear introductory paragraph found**

| Severity | Weight | Category |
|---|---|---|
| Medium | 6 pts | AEO (Answer Engine Optimization) |

**What triggers it & why it matters:** There's no `<p>` element near the top of the page. Answer engines look for a short, self-contained paragraph early in the content that directly states the answer or topic before pulling in supporting detail.

**How to fix it & effect on score:** Open the main content with a concise paragraph (2–3 sentences) that directly answers the page's core question before going into detail. Fixing this removes the 6 pts deduction from the **AEO (Answer Engine Optimization)** category score on the next scan.

**What a pass looks like:** Page opens with a substantive paragraph an answer engine can quote


---

<a id="rule-aeo-semantic-container"></a>
## `aeo-semantic-container`

**No `<main>` or `<article>` element wraps the content**

| Severity | Weight | Category |
|---|---|---|
| Medium | 6 pts | AEO (Answer Engine Optimization) |

**What triggers it & why it matters:** Without a `<main>`, `<article>`, or role="main" landmark, crawlers have to guess where navigation/boilerplate ends and the actual answerable content begins.

**How to fix it & effect on score:** Wrap the primary content in a single `<main>` (or `<article>` for individual posts) element. Fixing this removes the 6 pts deduction from the **AEO (Answer Engine Optimization)** category score on the next scan.

**What a pass looks like:** Content is wrapped in a semantic main/article landmark


---

<a id="rule-aeo-author-missing"></a>
## `aeo-author-missing`

**No author or byline found**

| Severity | Weight | Category |
|---|---|---|
| Medium | 5 pts | AEO (Answer Engine Optimization) |

**What triggers it & why it matters:** No author meta tag, article:author, rel=author link, or JSON-LD author property was found. Answer engines weigh clear authorship as part of judging whether content is trustworthy enough to cite.

**How to fix it & effect on score:** Add a visible byline plus matching author markup (meta author, or an author property in your Article/BlogPosting JSON-LD). Fixing this removes the 5 pts deduction from the **AEO (Answer Engine Optimization)** category score on the next scan.


---

<a id="rule-aeo-question-headings"></a>
## `aeo-question-headings`

**No subheadings are phrased as questions**

| Severity | Weight | Category |
|---|---|---|
| Medium | 5 pts | AEO (Answer Engine Optimization) |

**What triggers it & why it matters:** None of the page's H2/H3 headings are phrased as direct questions. Answer engines tend to extract a heading and the paragraph beneath it verbatim when the heading itself matches how people phrase queries.

**How to fix it & effect on score:** Rephrase a few section headings as the questions they answer, e.g. "How much does it cost?" instead of "Pricing". Fixing this removes the 5 pts deduction from the **AEO (Answer Engine Optimization)** category score on the next scan.

**What a pass looks like:** N of N subheadings are phrased as questions


---

<a id="rule-aeo-scannable-structure"></a>
## `aeo-scannable-structure`

**No lists or tables found in substantial content**

| Severity | Weight | Category |
|---|---|---|
| Medium | 5 pts | AEO (Answer Engine Optimization) |

**What triggers it & why it matters:** The page has roughly N words but no `<ul>`/`<ol>` lists or `<table>` elements. Answer engines preferentially extract and summarize list- and table-formatted content over long unbroken paragraphs.

**How to fix it & effect on score:** Break out steps, features, comparisons, or specs into bulleted/numbered lists or a table where it makes sense. Fixing this removes the 5 pts deduction from the **AEO (Answer Engine Optimization)** category score on the next scan.

**What a pass looks like:** Page includes list or table structure that's easy for answer engines to extract


---

<a id="rule-aeo-intro-paragraph-thin"></a>
## `aeo-intro-paragraph-thin`

**Opening paragraph is too short to serve as a direct answer**

| Severity | Weight | Category |
|---|---|---|
| Low | 4 pts | AEO (Answer Engine Optimization) |

**What triggers it & why it matters:** The first paragraph is only N characters ("*(actual value)*"), too short to give an answer engine a self-contained statement to quote.

**How to fix it & effect on score:** Expand the opening paragraph to 2–3 sentences that fully answer the page's main question in plain language. Fixing this removes the 4 pts deduction from the **AEO (Answer Engine Optimization)** category score on the next scan.


---

<a id="rule-aeo-no-qa-content"></a>
## `aeo-no-qa-content`

**No question-and-answer content or schema found**

| Severity | Weight | Category |
|---|---|---|
| Low | 4 pts | AEO (Answer Engine Optimization) |

**What triggers it & why it matters:** Answer engines (ChatGPT, Perplexity, Google AI Overviews) disproportionately cite pages that explicitly answer a question near the top of the content. This page has neither Q&A-phrased headings nor FAQPage/HowTo schema.

**How to fix it & effect on score:** Add a short FAQ or Q&A section covering the questions people actually ask about this topic, marked up with FAQPage structured data. Fixing this removes the 4 pts deduction from the **AEO (Answer Engine Optimization)** category score on the next scan.


---

<a id="rule-aeo-citations"></a>
## `aeo-citations`

**No outbound links to external sources**

| Severity | Weight | Category |
|---|---|---|
| Low | 3 pts | AEO (Answer Engine Optimization) |

**What triggers it & why it matters:** The page makes claims without linking out to any external source, study, or reference. Citing sources is one of the signals answer engines use to gauge whether a page is safe to quote as an authority.

**How to fix it & effect on score:** Where relevant, link to the original sources, studies, or documentation backing up factual claims. Fixing this removes the 3 pts deduction from the **AEO (Answer Engine Optimization)** category score on the next scan.

**What a pass looks like:** Page links out to external sources


---

<a id="rule-aeo-llms-txt-missing"></a>
## `aeo-llms-txt-missing`

**No llms.txt file found**

| Severity | Weight | Category |
|---|---|---|
| Low | 3 pts | AEO (Answer Engine Optimization) |

**What triggers it & why it matters:** llms.txt is an emerging convention that gives AI assistants a concise, curated Markdown map of a site's key pages, similar in spirit to robots.txt for crawl rules. Its absence isn't penalized by search engines, but it's a low-cost signal several answer engines are starting to look for.

**How to fix it & effect on score:** Add a plain-text /llms.txt with an H1 site name, a one-line summary, and a linked list of your most important pages. Fixing this removes the 3 pts deduction from the **AEO (Answer Engine Optimization)** category score on the next scan.


---

<a id="rule-aeo-toc-missing"></a>
## `aeo-toc-missing`

**Long page has no jump-to-section navigation**

| Severity | Weight | Category |
|---|---|---|
| Low | 3 pts | AEO (Answer Engine Optimization) |

**What triggers it & why it matters:** The page has roughly N words across N sections but no linked table of contents (anchor links pointing at heading ids). Answer engines and readers both benefit from being able to jump straight to a relevant subsection instead of scanning the whole page.

**How to fix it & effect on score:** Add id attributes to your H2/H3 headings and a short linked table of contents near the top of long-form content. Fixing this removes the 3 pts deduction from the **AEO (Answer Engine Optimization)** category score on the next scan.


---

<a id="rule-aeo-speakable-missing"></a>
## `aeo-speakable-missing`

**No Speakable schema for voice assistants**

| Severity | Weight | Category |
|---|---|---|
| Low | 2 pts | AEO (Answer Engine Optimization) |

**What triggers it & why it matters:** The page has FAQ/QA/HowTo schema but no SpeakableSpecification marking which sections are suitable for text-to-speech playback by voice assistants. This is an optional enhancement, not a ranking requirement.

**How to fix it & effect on score:** Add a "speakable": { "@type": "SpeakableSpecification", "cssSelector": [...] } property to your WebPage/Article JSON-LD pointing at the summary or answer sections. Fixing this removes the 2 pts deduction from the **AEO (Answer Engine Optimization)** category score on the next scan.


---

<a id="rule-aeo-ai-crawler-firewall"></a>
## `aeo-ai-crawler-firewall`

**Requests with an AI crawler user-agent (GPTBot) aren't blocked at the network level**

| Severity | Weight | Category |
|---|---|---|
| Positive signal | 0 pts | AEO (Answer Engine Optimization) |

**What triggers it & why it matters:** This rule only ever surfaces as a passing signal in the current source — it fires (as a pass) when: *Requests with an AI crawler user-agent (GPTBot) aren't blocked at the network level*. There is no separate failing `issue()` call under this exact id; the failure condition is the logical negation of the pass condition, and in most cases is covered by a related rule id documented elsewhere in this category (see the table above for a sibling rule on the same feature).

**Effect on score:** Meeting this condition costs nothing and confirms a positive signal. Missing it doesn't directly deduct points under *this* id — it typically shows up as a deduction under the related failing rule instead.


---

<a id="rule-aeo-ai-crawlers"></a>
## `aeo-ai-crawlers`

**robots.txt has no rules blocking AI answer-engine crawlers**

| Severity | Weight | Category |
|---|---|---|
| Positive signal | 0 pts | AEO (Answer Engine Optimization) |

**What triggers it & why it matters:** This rule only ever surfaces as a passing signal in the current source — it fires (as a pass) when: *AI answer-engine crawlers (GPTBot, ClaudeBot, PerplexityBot, Google-Extended, etc.) are not blocked*. There is no separate failing `issue()` call under this exact id; the failure condition is the logical negation of the pass condition, and in most cases is covered by a related rule id documented elsewhere in this category (see the table above for a sibling rule on the same feature).

**Effect on score:** Meeting this condition costs nothing and confirms a positive signal. Missing it doesn't directly deduct points under *this* id — it typically shows up as a deduction under the related failing rule instead.


---

<a id="rule-aeo-answer-schema"></a>
## `aeo-answer-schema`

**Page uses FAQPage/QAPage/HowTo structured data that answer engines can lift directly**

| Severity | Weight | Category |
|---|---|---|
| Positive signal | 0 pts | AEO (Answer Engine Optimization) |

**What triggers it & why it matters:** This rule only ever surfaces as a passing signal in the current source — it fires (as a pass) when: *Page uses FAQPage/QAPage/HowTo structured data that answer engines can lift directly*. There is no separate failing `issue()` call under this exact id; the failure condition is the logical negation of the pass condition, and in most cases is covered by a related rule id documented elsewhere in this category (see the table above for a sibling rule on the same feature).

**Effect on score:** Meeting this condition costs nothing and confirms a positive signal. Missing it doesn't directly deduct points under *this* id — it typically shows up as a deduction under the related failing rule instead.


---

<a id="rule-aeo-author"></a>
## `aeo-author`

**Page identifies an author or byline**

| Severity | Weight | Category |
|---|---|---|
| Positive signal | 0 pts | AEO (Answer Engine Optimization) |

**What triggers it & why it matters:** This rule only ever surfaces as a passing signal in the current source — it fires (as a pass) when: *Page identifies an author or byline*. There is no separate failing `issue()` call under this exact id; the failure condition is the logical negation of the pass condition, and in most cases is covered by a related rule id documented elsewhere in this category (see the table above for a sibling rule on the same feature).

**Effect on score:** Meeting this condition costs nothing and confirms a positive signal. Missing it doesn't directly deduct points under *this* id — it typically shows up as a deduction under the related failing rule instead.


---

<a id="rule-aeo-freshness"></a>
## `aeo-freshness`

**Page exposes a publish or last-updated date**

| Severity | Weight | Category |
|---|---|---|
| Positive signal | 0 pts | AEO (Answer Engine Optimization) |

**What triggers it & why it matters:** This rule only ever surfaces as a passing signal in the current source — it fires (as a pass) when: *Page exposes a publish or last-updated date*. There is no separate failing `issue()` call under this exact id; the failure condition is the logical negation of the pass condition, and in most cases is covered by a related rule id documented elsewhere in this category (see the table above for a sibling rule on the same feature).

**Effect on score:** Meeting this condition costs nothing and confirms a positive signal. Missing it doesn't directly deduct points under *this* id — it typically shows up as a deduction under the related failing rule instead.


---

<a id="rule-aeo-llms-txt"></a>
## `aeo-llms-txt`

**llms.txt is present with content**

| Severity | Weight | Category |
|---|---|---|
| Positive signal | 0 pts | AEO (Answer Engine Optimization) |

**What triggers it & why it matters:** This rule only ever surfaces as a passing signal in the current source — it fires (as a pass) when: *llms.txt is present with content*. There is no separate failing `issue()` call under this exact id; the failure condition is the logical negation of the pass condition, and in most cases is covered by a related rule id documented elsewhere in this category (see the table above for a sibling rule on the same feature).

**Effect on score:** Meeting this condition costs nothing and confirms a positive signal. Missing it doesn't directly deduct points under *this* id — it typically shows up as a deduction under the related failing rule instead.


---

<a id="rule-aeo-speakable"></a>
## `aeo-speakable`

**Page marks speakable sections for voice assistants**

| Severity | Weight | Category |
|---|---|---|
| Positive signal | 0 pts | AEO (Answer Engine Optimization) |

**What triggers it & why it matters:** This rule only ever surfaces as a passing signal in the current source — it fires (as a pass) when: *Page marks speakable sections for voice assistants*. There is no separate failing `issue()` call under this exact id; the failure condition is the logical negation of the pass condition, and in most cases is covered by a related rule id documented elsewhere in this category (see the table above for a sibling rule on the same feature).

**Effect on score:** Meeting this condition costs nothing and confirms a positive signal. Missing it doesn't directly deduct points under *this* id — it typically shows up as a deduction under the related failing rule instead.


---

<a id="rule-aeo-toc"></a>
## `aeo-toc`

**Long-form content includes a jump-to-section table of contents**

| Severity | Weight | Category |
|---|---|---|
| Positive signal | 0 pts | AEO (Answer Engine Optimization) |

**What triggers it & why it matters:** This rule only ever surfaces as a passing signal in the current source — it fires (as a pass) when: *Long-form content includes a jump-to-section table of contents*. There is no separate failing `issue()` call under this exact id; the failure condition is the logical negation of the pass condition, and in most cases is covered by a related rule id documented elsewhere in this category (see the table above for a sibling rule on the same feature).

**Effect on score:** Meeting this condition costs nothing and confirms a positive signal. Missing it doesn't directly deduct points under *this* id — it typically shows up as a deduction under the related failing rule instead.


---