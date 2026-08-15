# Accessibility

[← Back to Home](https://github.com/armin5872/OptiQra/wiki/Home)

Checks that a page can be used by people relying on assistive technology — alt text, form labels, color contrast, and keyboard/semantic structure. Source: `src/lib/htmlAudit.ts` (`analyzeA11y`).

**6 rules in this category.**

| ID | Rule | Severity | Weight |
|---|---|---|---|
| `labels` | [N of N form fields have no associated label](#rule-labels) | Medium–High | 8–12 pts (scales with how much of the page is affected — see source) |
| `button-names` | [N button(s) with no accessible name](#rule-button-names) | High | 9 pts |
| `lang` | [Missing lang attribute on `<html>`](#rule-lang) | Medium | 8 pts |
| `zoom-disabled` | [Pinch-to-zoom is disabled](#rule-zoom-disabled) | Medium | 8 pts |
| `landmarks` | [Missing landmark element(s): N](#rule-landmarks) | Medium | 7 pts |
| `decorative-alt` | [Likely decorative images have non-empty alt text](#rule-decorative-alt) | Low | 4 pts |

---

<a id="rule-labels"></a>
## `labels`

**N of N form fields have no associated label**

| Severity | Weight | Category |
|---|---|---|
| Medium–High | 8–12 pts (scales with how much of the page is affected — see source) | Accessibility |

**What triggers it & why it matters:** Inputs relying on placeholder text alone lose their hint on focus and are often skipped by screen readers.

**How to fix it & effect on score:** Add a `<label for="...">` element (or aria-label) tied to every input. Fixing this removes the 8–12 pts (scales with how much of the page is affected — see source) deduction from the **Accessibility** category score on the next scan.

**What a pass looks like:** Form fields have associated labels


---

<a id="rule-button-names"></a>
## `button-names`

**N button(s) with no accessible name**

| Severity | Weight | Category |
|---|---|---|
| High | 9 pts | Accessibility |

**What triggers it & why it matters:** Buttons that show only an icon and expose no text or aria-label are announced as "button" with no purpose to screen reader users.

**How to fix it & effect on score:** Add an aria-label describing the action each icon-only button performs. Fixing this removes the 9 pts deduction from the **Accessibility** category score on the next scan.


---

<a id="rule-lang"></a>
## `lang`

**Missing lang attribute on `<html>`**

| Severity | Weight | Category |
|---|---|---|
| Medium | 8 pts | Accessibility |

**What triggers it & why it matters:** Screen readers use this attribute to choose the correct pronunciation and voice; without it they default to guessing.

**How to fix it & effect on score:** Add a lang attribute, e.g. `<html lang="en">`. Fixing this removes the 8 pts deduction from the **Accessibility** category score on the next scan.

**What a pass looks like:** Page declares a language


---

<a id="rule-zoom-disabled"></a>
## `zoom-disabled`

**Pinch-to-zoom is disabled**

| Severity | Weight | Category |
|---|---|---|
| Medium | 8 pts | Accessibility |

**What triggers it & why it matters:** The viewport meta tag blocks zooming, which many low-vision users rely on to read content.

**How to fix it & effect on score:** Remove user-scalable=no and maximum-scale restrictions from the viewport meta tag. Fixing this removes the 8 pts deduction from the **Accessibility** category score on the next scan.


---

<a id="rule-landmarks"></a>
## `landmarks`

**Missing landmark element(s): N**

| Severity | Weight | Category |
|---|---|---|
| Medium | 7 pts | Accessibility |

**What triggers it & why it matters:** Landmark regions let screen reader users jump directly to the main content, navigation, or footer instead of tabbing through everything.

**How to fix it & effect on score:** Wrap key regions in `<main>`, `<nav>`, and `<footer>` elements. Fixing this removes the 7 pts deduction from the **Accessibility** category score on the next scan.

**What a pass looks like:** Page uses main/nav/footer landmarks


---

<a id="rule-decorative-alt"></a>
## `decorative-alt`

**Likely decorative images have non-empty alt text**

| Severity | Weight | Category |
|---|---|---|
| Low | 4 pts | Accessibility |

**What triggers it & why it matters:** Purely decorative images should have alt="" so screen readers skip them instead of reading a meaningless description.

**How to fix it & effect on score:** Set alt="" on purely decorative images. Fixing this removes the 4 pts deduction from the **Accessibility** category score on the next scan.


---