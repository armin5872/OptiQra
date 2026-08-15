# Conversion & Trust

[← Back to Home](https://github.com/armin5872/OptiQra/wiki/Home)

Checks that affect whether a visitor actually converts or trusts the page once they land on it — CTAs, trust signals, contact information. Source: `src/lib/htmlAudit.ts` (`analyzeConversions`).

**6 rules in this category.**

| ID | Rule | Severity | Weight |
|---|---|---|---|
| `above-fold` | [No clear call-to-action near the top of the page](#rule-above-fold) | High | 12 pts |
| `mobile-viewport` | [No responsive viewport meta tag](#rule-mobile-viewport) | High | 11 pts |
| `form-length` | [Signup/contact form asks for N fields](#rule-form-length) | High | 9 pts |
| `cta-clarity` | [Generic call-to-action text found ("*(actual value found on the page)*")](#rule-cta-clarity) | Medium | 8 pts |
| `trust` | [No obvious trust signals detected](#rule-trust) | Medium | 7 pts |
| `contact-path` | [No visible contact method found](#rule-contact-path) | Medium | 5 pts |

---

<a id="rule-above-fold"></a>
## `above-fold`

**No clear call-to-action near the top of the page**

| Severity | Weight | Category |
|---|---|---|
| High | 12 pts | Conversion & Trust |

**What triggers it & why it matters:** Visitors may need to scroll well past the first screen before finding anything to click.

**How to fix it & effect on score:** Place a primary action (button or prominent link) within the first section of the page. Fixing this removes the 12 pts deduction from the **Conversion & Trust** category score on the next scan.

**What a pass looks like:** A call-to-action appears early in the page


---

<a id="rule-mobile-viewport"></a>
## `mobile-viewport`

**No responsive viewport meta tag**

| Severity | Weight | Category |
|---|---|---|
| High | 11 pts | Conversion & Trust |

**What triggers it & why it matters:** Without a viewport meta tag, mobile browsers render a desktop layout and zoom out, making buttons and text hard to tap and read.

**How to fix it & effect on score:** Add `<meta name="viewport" content="width=device-width, initial-scale=1">`. Fixing this removes the 11 pts deduction from the **Conversion & Trust** category score on the next scan.

**What a pass looks like:** Responsive viewport meta tag is set


---

<a id="rule-form-length"></a>
## `form-length`

**Signup/contact form asks for N fields**

| Severity | Weight | Category |
|---|---|---|
| High | 9 pts | Conversion & Trust |

**What triggers it & why it matters:** Long forms shown before a visitor has a reason to trust the site tend to suppress completion rates.

**How to fix it & effect on score:** Cut the form to essential fields only, and ask for the rest after signup. Fixing this removes the 9 pts deduction from the **Conversion & Trust** category score on the next scan.

**What a pass looks like:** Form length is reasonable


---

<a id="rule-cta-clarity"></a>
## `cta-clarity`

**Generic call-to-action text found ("*(actual value found on the page)*")**

| Severity | Weight | Category |
|---|---|---|
| Medium | 8 pts | Conversion & Trust |

**What triggers it & why it matters:** Buttons labeled "Submit" or "Click here" don't tell visitors what happens next, which softens click-through.

**How to fix it & effect on score:** Rename buttons to describe the outcome, e.g. "Start free trial" instead of "Submit". Fixing this removes the 8 pts deduction from the **Conversion & Trust** category score on the next scan.

**What a pass looks like:** Call-to-action text is descriptive


---

<a id="rule-trust"></a>
## `trust`

**No obvious trust signals detected**

| Severity | Weight | Category |
|---|---|---|
| Medium | 7 pts | Conversion & Trust |

**What triggers it & why it matters:** No testimonials, review mentions, or guarantee language were found, which can leave first-time visitors uncertain.

**How to fix it & effect on score:** Add a short trust signal near the primary action: a testimonial, rating, or guarantee. Fixing this removes the 7 pts deduction from the **Conversion & Trust** category score on the next scan.

**What a pass looks like:** Trust signals are present on the page


---

<a id="rule-contact-path"></a>
## `contact-path`

**No visible contact method found**

| Severity | Weight | Category |
|---|---|---|
| Medium | 5 pts | Conversion & Trust |

**What triggers it & why it matters:** Visitors who hesitate before converting have no easy way to reach out with questions.

**How to fix it & effect on score:** Add a visible contact link, phone number, or chat option. Fixing this removes the 5 pts deduction from the **Conversion & Trust** category score on the next scan.


---