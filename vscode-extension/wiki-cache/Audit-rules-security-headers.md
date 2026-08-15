# Security Headers

[← Back to Home](https://github.com/armin5872/OptiQra/wiki/Home)

Checks the HTTP response headers a server sends back, comparing them against the standard hardening headers browsers use to prevent XSS, clickjacking, MIME sniffing, and downgrade attacks. Source: `src/lib/securityHeadersAudit.ts` (`analyzeSecurityHeaders`).

**23 rules in this category.**

| ID | Rule | Severity | Weight |
|---|---|---|---|
| `missing-strict-transport-security` | [Missing Strict-Transport-Security](#rule-missing-strict-transport-security) | Critical | 15 pts |
| `no-https` | [Site not using HTTPS](#rule-no-https) | Critical | 15 pts |
| `missing-content-security-policy` | [Missing Content-Security-Policy](#rule-missing-content-security-policy) | High | 12 pts |
| `missing-x-frame-options` | [Missing X-Frame-Options](#rule-missing-x-frame-options) | High | 10 pts |
| `csp-unsafe-inline` | [CSP allows unsafe-inline](#rule-csp-unsafe-inline) | Medium | 8 pts |
| `header-fetch-error` | [Could not fetch security headers](#rule-header-fetch-error) | Medium | 8 pts |
| `missing-x-content-type-options` | [Missing X-Content-Type-Options](#rule-missing-x-content-type-options) | Medium | 8 pts |
| `missing-cross-origin-opener-policy` | [Missing Cross-Origin-Opener-Policy](#rule-missing-cross-origin-opener-policy) | Medium | 7 pts |
| `csp-wildcard` | [CSP uses wildcards](#rule-csp-wildcard) | Medium | 6 pts |
| `missing-cross-origin-embedder-policy` | [Missing Cross-Origin-Embedder-Policy](#rule-missing-cross-origin-embedder-policy) | Medium | 6 pts |
| `missing-referrer-policy` | [Missing Referrer-Policy](#rule-missing-referrer-policy) | Medium | 6 pts |
| `hsts-no-max-age` | [HSTS missing max-age](#rule-hsts-no-max-age) | Medium | 5 pts |
| `missing-permissions-policy` | [Missing Permissions-Policy](#rule-missing-permissions-policy) | Medium | 5 pts |
| `server-header-exposed` | [Server header reveals too much information](#rule-server-header-exposed) | Low | 3 pts |
| `x-powered-by-exposed` | [X-Powered-By header exposes technology stack](#rule-x-powered-by-exposed) | Low | 3 pts |
| `present-content-security-policy` | [Content-Security-Policy header is present and echoed back (truncated to 50 chars) in the report.](#rule-present-content-security-policy) | Positive signal | 0 pts |
| `present-cross-origin-embedder-policy` | [Cross-Origin-Embedder-Policy header is present and echoed back (truncated to 50 chars) in the report.](#rule-present-cross-origin-embedder-policy) | Positive signal | 0 pts |
| `present-cross-origin-opener-policy` | [Cross-Origin-Opener-Policy header is present and echoed back (truncated to 50 chars) in the report.](#rule-present-cross-origin-opener-policy) | Positive signal | 0 pts |
| `present-permissions-policy` | [Permissions-Policy header is present and echoed back (truncated to 50 chars) in the report.](#rule-present-permissions-policy) | Positive signal | 0 pts |
| `present-referrer-policy` | [Referrer-Policy header is present and echoed back (truncated to 50 chars) in the report.](#rule-present-referrer-policy) | Positive signal | 0 pts |
| `present-strict-transport-security` | [Strict-Transport-Security header is present and echoed back (truncated to 50 chars) in the report.](#rule-present-strict-transport-security) | Positive signal | 0 pts |
| `present-x-content-type-options` | [X-Content-Type-Options header is present and echoed back (truncated to 50 chars) in the report.](#rule-present-x-content-type-options) | Positive signal | 0 pts |
| `present-x-frame-options` | [X-Frame-Options header is present and echoed back (truncated to 50 chars) in the report.](#rule-present-x-frame-options) | Positive signal | 0 pts |

---

<a id="rule-missing-strict-transport-security"></a>
## `missing-strict-transport-security`

**Missing Strict-Transport-Security**

| Severity | Weight | Category |
|---|---|---|
| Critical | 15 pts | Security Headers |

**What triggers it & why it matters:** Forces HTTPS connections. This header was not present on the response.

**How to fix it & effect on score:** Add header: Strict-Transport-Security: max-age=31536000; includeSubDomains; preload Fixing this removes the 15 pts deduction from the **Security Headers** category score on the next scan.

**What a pass looks like:** Strict-Transport-Security header is present


---

<a id="rule-no-https"></a>
## `no-https`

**Site not using HTTPS**

| Severity | Weight | Category |
|---|---|---|
| Critical | 15 pts | Security Headers |

**What triggers it & why it matters:** The website is not served over HTTPS

**How to fix it & effect on score:** Migrate to HTTPS and redirect HTTP traffic to HTTPS Fixing this removes the 15 pts deduction from the **Security Headers** category score on the next scan.


---

<a id="rule-missing-content-security-policy"></a>
## `missing-content-security-policy`

**Missing Content-Security-Policy**

| Severity | Weight | Category |
|---|---|---|
| High | 12 pts | Security Headers |

**What triggers it & why it matters:** Prevents XSS attacks. This header was not present on the response.

**How to fix it & effect on score:** Add header: Content-Security-Policy: default-src 'self' Fixing this removes the 12 pts deduction from the **Security Headers** category score on the next scan.

**What a pass looks like:** Content-Security-Policy header is present


---

<a id="rule-missing-x-frame-options"></a>
## `missing-x-frame-options`

**Missing X-Frame-Options**

| Severity | Weight | Category |
|---|---|---|
| High | 10 pts | Security Headers |

**What triggers it & why it matters:** Prevents clickjacking attacks. This header was not present on the response.

**How to fix it & effect on score:** Add header: X-Frame-Options: DENY or SAMEORIGIN Fixing this removes the 10 pts deduction from the **Security Headers** category score on the next scan.

**What a pass looks like:** X-Frame-Options header is present


---

<a id="rule-csp-unsafe-inline"></a>
## `csp-unsafe-inline`

**CSP allows unsafe-inline**

| Severity | Weight | Category |
|---|---|---|
| Medium | 8 pts | Security Headers |

**What triggers it & why it matters:** Content-Security-Policy includes unsafe-inline which reduces XSS protection

**How to fix it & effect on score:** Remove unsafe-inline and use nonces or hashes for inline scripts Fixing this removes the 8 pts deduction from the **Security Headers** category score on the next scan.


---

<a id="rule-header-fetch-error"></a>
## `header-fetch-error`

**Could not fetch security headers**

| Severity | Weight | Category |
|---|---|---|
| Medium | 8 pts | Security Headers |

**What triggers it & why it matters:** Failed to establish connection to analyze headers

**How to fix it & effect on score:** Ensure the URL is accessible and not blocked by CORS policies Fixing this removes the 8 pts deduction from the **Security Headers** category score on the next scan.


---

<a id="rule-missing-x-content-type-options"></a>
## `missing-x-content-type-options`

**Missing X-Content-Type-Options**

| Severity | Weight | Category |
|---|---|---|
| Medium | 8 pts | Security Headers |

**What triggers it & why it matters:** Prevents MIME-type sniffing. This header was not present on the response.

**How to fix it & effect on score:** Add header: X-Content-Type-Options: nosniff Fixing this removes the 8 pts deduction from the **Security Headers** category score on the next scan.

**What a pass looks like:** X-Content-Type-Options header is present


---

<a id="rule-missing-cross-origin-opener-policy"></a>
## `missing-cross-origin-opener-policy`

**Missing Cross-Origin-Opener-Policy**

| Severity | Weight | Category |
|---|---|---|
| Medium | 7 pts | Security Headers |

**What triggers it & why it matters:** Isolates browsing context. This header was not present on the response.

**How to fix it & effect on score:** Add header: Cross-Origin-Opener-Policy: same-origin Fixing this removes the 7 pts deduction from the **Security Headers** category score on the next scan.

**What a pass looks like:** Cross-Origin-Opener-Policy header is present


---

<a id="rule-csp-wildcard"></a>
## `csp-wildcard`

**CSP uses wildcards**

| Severity | Weight | Category |
|---|---|---|
| Medium | 6 pts | Security Headers |

**What triggers it & why it matters:** Content-Security-Policy contains overly permissive wildcards

**How to fix it & effect on score:** Use specific domains instead of * in directives Fixing this removes the 6 pts deduction from the **Security Headers** category score on the next scan.


---

<a id="rule-missing-cross-origin-embedder-policy"></a>
## `missing-cross-origin-embedder-policy`

**Missing Cross-Origin-Embedder-Policy**

| Severity | Weight | Category |
|---|---|---|
| Medium | 6 pts | Security Headers |

**What triggers it & why it matters:** Prevents cross-origin resource embedding. This header was not present on the response.

**How to fix it & effect on score:** Add header: Cross-Origin-Embedder-Policy: require-corp Fixing this removes the 6 pts deduction from the **Security Headers** category score on the next scan.

**What a pass looks like:** Cross-Origin-Embedder-Policy header is present


---

<a id="rule-missing-referrer-policy"></a>
## `missing-referrer-policy`

**Missing Referrer-Policy**

| Severity | Weight | Category |
|---|---|---|
| Medium | 6 pts | Security Headers |

**What triggers it & why it matters:** Controls referrer information. This header was not present on the response.

**How to fix it & effect on score:** Add header: Referrer-Policy: strict-origin-when-cross-origin Fixing this removes the 6 pts deduction from the **Security Headers** category score on the next scan.

**What a pass looks like:** Referrer-Policy header is present


---

<a id="rule-hsts-no-max-age"></a>
## `hsts-no-max-age`

**HSTS missing max-age**

| Severity | Weight | Category |
|---|---|---|
| Medium | 5 pts | Security Headers |

**What triggers it & why it matters:** The Strict-Transport-Security header should include max-age directive

**How to fix it & effect on score:** Ensure max-age is set to at least 31536000 (1 year) Fixing this removes the 5 pts deduction from the **Security Headers** category score on the next scan.


---

<a id="rule-missing-permissions-policy"></a>
## `missing-permissions-policy`

**Missing Permissions-Policy**

| Severity | Weight | Category |
|---|---|---|
| Medium | 5 pts | Security Headers |

**What triggers it & why it matters:** Controls browser features and APIs. This header was not present on the response.

**How to fix it & effect on score:** Add header: Permissions-Policy: geolocation=(), microphone=(), camera=() Fixing this removes the 5 pts deduction from the **Security Headers** category score on the next scan.

**What a pass looks like:** Permissions-Policy header is present


---

<a id="rule-server-header-exposed"></a>
## `server-header-exposed`

**Server header reveals too much information**

| Severity | Weight | Category |
|---|---|---|
| Low | 3 pts | Security Headers |

**What triggers it & why it matters:** The Server header reveals: *(actual value)*

**How to fix it & effect on score:** Remove or minimize the Server header to reduce information disclosure Fixing this removes the 3 pts deduction from the **Security Headers** category score on the next scan.


---

<a id="rule-x-powered-by-exposed"></a>
## `x-powered-by-exposed`

**X-Powered-By header exposes technology stack**

| Severity | Weight | Category |
|---|---|---|
| Low | 3 pts | Security Headers |

**What triggers it & why it matters:** The X-Powered-By header reveals: *(actual value)*

**How to fix it & effect on score:** Remove or obscure the X-Powered-By header to reduce information disclosure Fixing this removes the 3 pts deduction from the **Security Headers** category score on the next scan.


---

<a id="rule-present-content-security-policy"></a>
## `present-content-security-policy`

**Content-Security-Policy header is present**

| Severity | Weight | Category |
|---|---|---|
| Positive signal | 0 pts | Security Headers |

**What triggers it & why it matters:** This rule only ever surfaces as a passing signal in the current source — it fires (as a pass) when: *Content-Security-Policy header is present and echoed back (truncated to 50 chars) in the report.*. There is no separate failing `issue()` call under this exact id; the failure condition is the logical negation of the pass condition, and in most cases is covered by a related rule id documented elsewhere in this category (see the table above for a sibling rule on the same feature).

**Effect on score:** Meeting this condition costs nothing and confirms a positive signal. Missing it doesn't directly deduct points under *this* id — it typically shows up as a deduction under the related failing rule instead.


---

<a id="rule-present-cross-origin-embedder-policy"></a>
## `present-cross-origin-embedder-policy`

**Cross-Origin-Embedder-Policy header is present**

| Severity | Weight | Category |
|---|---|---|
| Positive signal | 0 pts | Security Headers |

**What triggers it & why it matters:** This rule only ever surfaces as a passing signal in the current source — it fires (as a pass) when: *Cross-Origin-Embedder-Policy header is present and echoed back (truncated to 50 chars) in the report.*. There is no separate failing `issue()` call under this exact id; the failure condition is the logical negation of the pass condition, and in most cases is covered by a related rule id documented elsewhere in this category (see the table above for a sibling rule on the same feature).

**Effect on score:** Meeting this condition costs nothing and confirms a positive signal. Missing it doesn't directly deduct points under *this* id — it typically shows up as a deduction under the related failing rule instead.


---

<a id="rule-present-cross-origin-opener-policy"></a>
## `present-cross-origin-opener-policy`

**Cross-Origin-Opener-Policy header is present**

| Severity | Weight | Category |
|---|---|---|
| Positive signal | 0 pts | Security Headers |

**What triggers it & why it matters:** This rule only ever surfaces as a passing signal in the current source — it fires (as a pass) when: *Cross-Origin-Opener-Policy header is present and echoed back (truncated to 50 chars) in the report.*. There is no separate failing `issue()` call under this exact id; the failure condition is the logical negation of the pass condition, and in most cases is covered by a related rule id documented elsewhere in this category (see the table above for a sibling rule on the same feature).

**Effect on score:** Meeting this condition costs nothing and confirms a positive signal. Missing it doesn't directly deduct points under *this* id — it typically shows up as a deduction under the related failing rule instead.


---

<a id="rule-present-permissions-policy"></a>
## `present-permissions-policy`

**Permissions-Policy header is present**

| Severity | Weight | Category |
|---|---|---|
| Positive signal | 0 pts | Security Headers |

**What triggers it & why it matters:** This rule only ever surfaces as a passing signal in the current source — it fires (as a pass) when: *Permissions-Policy header is present and echoed back (truncated to 50 chars) in the report.*. There is no separate failing `issue()` call under this exact id; the failure condition is the logical negation of the pass condition, and in most cases is covered by a related rule id documented elsewhere in this category (see the table above for a sibling rule on the same feature).

**Effect on score:** Meeting this condition costs nothing and confirms a positive signal. Missing it doesn't directly deduct points under *this* id — it typically shows up as a deduction under the related failing rule instead.


---

<a id="rule-present-referrer-policy"></a>
## `present-referrer-policy`

**Referrer-Policy header is present**

| Severity | Weight | Category |
|---|---|---|
| Positive signal | 0 pts | Security Headers |

**What triggers it & why it matters:** This rule only ever surfaces as a passing signal in the current source — it fires (as a pass) when: *Referrer-Policy header is present and echoed back (truncated to 50 chars) in the report.*. There is no separate failing `issue()` call under this exact id; the failure condition is the logical negation of the pass condition, and in most cases is covered by a related rule id documented elsewhere in this category (see the table above for a sibling rule on the same feature).

**Effect on score:** Meeting this condition costs nothing and confirms a positive signal. Missing it doesn't directly deduct points under *this* id — it typically shows up as a deduction under the related failing rule instead.


---

<a id="rule-present-strict-transport-security"></a>
## `present-strict-transport-security`

**Strict-Transport-Security header is present**

| Severity | Weight | Category |
|---|---|---|
| Positive signal | 0 pts | Security Headers |

**What triggers it & why it matters:** This rule only ever surfaces as a passing signal in the current source — it fires (as a pass) when: *Strict-Transport-Security header is present and echoed back (truncated to 50 chars) in the report.*. There is no separate failing `issue()` call under this exact id; the failure condition is the logical negation of the pass condition, and in most cases is covered by a related rule id documented elsewhere in this category (see the table above for a sibling rule on the same feature).

**Effect on score:** Meeting this condition costs nothing and confirms a positive signal. Missing it doesn't directly deduct points under *this* id — it typically shows up as a deduction under the related failing rule instead.


---

<a id="rule-present-x-content-type-options"></a>
## `present-x-content-type-options`

**X-Content-Type-Options header is present**

| Severity | Weight | Category |
|---|---|---|
| Positive signal | 0 pts | Security Headers |

**What triggers it & why it matters:** This rule only ever surfaces as a passing signal in the current source — it fires (as a pass) when: *X-Content-Type-Options header is present and echoed back (truncated to 50 chars) in the report.*. There is no separate failing `issue()` call under this exact id; the failure condition is the logical negation of the pass condition, and in most cases is covered by a related rule id documented elsewhere in this category (see the table above for a sibling rule on the same feature).

**Effect on score:** Meeting this condition costs nothing and confirms a positive signal. Missing it doesn't directly deduct points under *this* id — it typically shows up as a deduction under the related failing rule instead.


---

<a id="rule-present-x-frame-options"></a>
## `present-x-frame-options`

**X-Frame-Options header is present**

| Severity | Weight | Category |
|---|---|---|
| Positive signal | 0 pts | Security Headers |

**What triggers it & why it matters:** This rule only ever surfaces as a passing signal in the current source — it fires (as a pass) when: *X-Frame-Options header is present and echoed back (truncated to 50 chars) in the report.*. There is no separate failing `issue()` call under this exact id; the failure condition is the logical negation of the pass condition, and in most cases is covered by a related rule id documented elsewhere in this category (see the table above for a sibling rule on the same feature).

**Effect on score:** Meeting this condition costs nothing and confirms a positive signal. Missing it doesn't directly deduct points under *this* id — it typically shows up as a deduction under the related failing rule instead.


---