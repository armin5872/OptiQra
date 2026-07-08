# Site Vitals – Comprehensive Website Diagnostic Tool

A powerful, open-source diagnostic tool for analyzing and improving website health across multiple dimensions: **SEO**, **Performance**, **Accessibility**, **Security Headers**, **Conversions**, and more.

## 🚀 Live Demo

The application is currently deployed at https://optiqra.vercel.app/.
![OptiqRA Logo](/optiqra.png)

## 🛠️ Features

### Comprehensive Auditing

- **Security Headers Analysis** - Validates critical security HTTP headers for optimal protection
- **SEO Auditing** - Checks title tags, meta descriptions, canonical links, heading hierarchy, structured data, robots.txt, sitemaps
- **Performance Analysis** - Evaluates HTML size, TTFB (Time To First Byte), compression, caching, render-blocking resources
- **Accessibility Audit** - Detects accessibility issues including color contrast, ARIA attributes, form labeling
- **Conversion Optimization** - Analyzes CTAs, trust signals, and conversion path optimization
- **Google Lighthouse Integration** - Optional deep-dive performance, accessibility, and SEO insights via PageSpeed Insights API

### Security Headers Coverage

The tool scans and validates the following critical security headers:

| Header                           | Purpose                                  | Importance                                                |
| -------------------------------- | ---------------------------------------- | --------------------------------------------------------- |
| **Strict-Transport-Security**    | Enforces HTTPS connections               | Critical - Prevents man-in-the-middle attacks             |
| **Content-Security-Policy**      | Prevents XSS attacks                     | Critical - Controls script and resource loading           |
| **X-Frame-Options**              | Prevents clickjacking                    | High - Protects against framing attacks                   |
| **X-Content-Type-Options**       | Prevents MIME-type sniffing              | High - Forces correct content interpretation              |
| **Referrer-Policy**              | Controls referrer information            | Medium - Privacy and security optimization                |
| **Permissions-Policy**           | Controls browser feature access          | Medium - Restricts API access (geolocation, camera, etc.) |
| **Cross-Origin-Opener-Policy**   | Isolates browsing context                | Medium - Protects from cross-origin attacks               |
| **Cross-Origin-Embedder-Policy** | Prevents cross-origin resource embedding | Medium - Enables cross-origin isolation                   |

### Additional Security Checks

- **HTTPS Enforcement** - Verifies secure protocol usage
- **Information Disclosure** - Detects exposed technology stack via headers
- **CSP Validation** - Identifies overly permissive or unsafe-inline directives

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ or Docker
- npm/yarn/pnpm package manager (for local development)

### Local Development

```bash
# Clone or navigate to the project
cd site-vitals-next

# Install dependencies
npm install

# Set environment variables (optional)
export PSI_API_KEY=your_google_pagespeed_insights_api_key

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Docker Deployment

#### Quick Start with Docker Compose

```bash
# Build and start the application
docker-compose up --build

# The app will be available at http://localhost:3000
```

#### Standalone Docker

```bash
# Build the image
docker build -t site-vitals:latest .

# Run the container
docker run -p 3000:3000 \
  -e NODE_ENV=production \
  -e NEXT_TELEMETRY_DISABLED=1 \
  site-vitals:latest
```

#### With Environment Variables

```bash
docker-compose up --build \
  -e PSI_API_KEY=your_api_key_here
```

## 📋 Building & Running

### Production Build

```bash
npm run build    # Compile Next.js application
npm start        # Start production server
```

### Development

```bash
npm run dev      # Start dev server with hot reload
npm run lint     # Run ESLint checks
```

## 🔌 API Endpoint

### POST `/api/analyze`

Analyzes a website and returns comprehensive audit results.

> Note: the API route is centralized in `src/app/api/analyze/route.ts`, including the audit logic previously split into image and link analysis helpers.

**Request:**

```json
{
	"url": "https://example.com"
}
```

**Response:**

```json
{
  "url": "https://example.com",
  "categories": {
    "security": {
      "label": "Security Headers",
      "score": 75,
      "issues": [...],
      "passed": [...],
      "source": "security-headers-audit"
    },
    "seo": {
      "label": "SEO",
      "score": 85,
      "issues": [...],
      "passed": [...],
      "source": "html-audit"
    },
    "speed": {
      "label": "Performance",
      "score": 72,
      "issues": [...],
      "passed": [...],
      "source": "html-audit"
    },
    "a11y": {
      "label": "Accessibility",
      "score": 90,
      "issues": [...],
      "passed": [...],
      "source": "html-audit"
    },
    "conversions": {
      "label": "Conversions",
      "score": 68,
      "issues": [...],
      "passed": [...],
      "source": "html-audit"
    }
  },
  "lighthouseAvailable": true,
  "timestamp": "2024-01-15T10:30:00Z"
}
```

## 🔐 Security Headers Explained

### Strict-Transport-Security (HSTS)

**Recommended Header:**

```
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
```

**What it does:** Forces browsers to always connect via HTTPS, preventing protocol downgrade attacks.

**Implementation (Express):**

```javascript
app.use((req, res, next) => {
	res.setHeader(
		"Strict-Transport-Security",
		"max-age=31536000; includeSubDomains; preload",
	);
	next();
});
```

**Implementation (Next.js):**

```typescript
// next.config.ts
export default {
	async headers() {
		return [
			{
				source: "/(.*)",
				headers: [
					{
						key: "Strict-Transport-Security",
						value: "max-age=31536000; includeSubDomains; preload",
					},
				],
			},
		];
	},
};
```

---

### Content-Security-Policy (CSP)

**Recommended Header:**

```
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; connect-src 'self'
```

**What it does:** Restricts which scripts, styles, and resources can be loaded, preventing XSS attacks.

**Implementation (Next.js):**

```typescript
// next.config.ts
export default {
	async headers() {
		return [
			{
				source: "/(.*)",
				headers: [
					{
						key: "Content-Security-Policy",
						value:
							"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'",
					},
				],
			},
		];
	},
};
```

---

### X-Frame-Options

**Recommended Header:**

```
X-Frame-Options: DENY
```

**Options:**

- `DENY` - Page cannot be displayed in a frame (most secure)
- `SAMEORIGIN` - Page can only be framed by pages from the same origin
- `ALLOW-FROM uri` - Page can only be framed by specific origins (deprecated)

**What it does:** Prevents clickjacking attacks by controlling whether the page can be embedded in iframes.

---

### X-Content-Type-Options

**Recommended Header:**

```
X-Content-Type-Options: nosniff
```

**What it does:** Forces browsers to respect the Content-Type header and prevents MIME-type sniffing.

---

### Referrer-Policy

**Recommended Header:**

```
Referrer-Policy: strict-origin-when-cross-origin
```

**Options:**

- `no-referrer` - Never send referrer information
- `same-origin` - Only send for same-origin requests
- `strict-origin-when-cross-origin` - Send full URL for same-origin, only origin for cross-origin
- `no-referrer-when-downgrade` - Don't send referrer when downgrading from HTTPS to HTTP

**What it does:** Controls how much referrer information is shared with linked websites.

---

### Permissions-Policy

**Recommended Header:**

```
Permissions-Policy: geolocation=(), microphone=(), camera=(), payment=(), usb=()
```

**What it does:** Controls which browser features and APIs can be used (geolocation, microphone, camera, payment APIs, etc.).

---

### Cross-Origin-Opener-Policy (COOP)

**Recommended Header:**

```
Cross-Origin-Opener-Policy: same-origin
```

**Options:**

- `same-origin` - Only allow same-origin windows to access the browsing context
- `same-origin-allow-popups` - Allow popups but no other cross-origin access
- `unsafe-none` - Allow cross-origin access (default)

**What it does:** Isolates the browsing context from cross-origin windows.

---

### Cross-Origin-Embedder-Policy (COEP)

**Recommended Header:**

```
Cross-Origin-Embedder-Policy: require-corp
```

**What it does:** Requires all cross-origin resources to explicitly grant permission to be embedded.

---

## 📊 Audit Categories Explained

### Security Headers

Validates HTTP security headers that protect against common web vulnerabilities.

### SEO

Checks for:

- Title tags and meta descriptions
- Heading hierarchy
- Structured data (Schema.org, JSON-LD)
- Robots.txt and sitemaps
- Canonical tags
- Open Graph meta tags

### Performance

Analyzes:

- HTML payload size
- Server response time (TTFB)
- Content compression (gzip/Brotli)
- Cache-Control headers
- Render-blocking resources (JavaScript, CSS)
- Web fonts optimization

### Accessibility

Detects:

- Missing alt text on images
- Color contrast issues
- ARIA labels and attributes
- Form input labeling
- Heading structure

### Conversions

Evaluates:

- Call-to-action clarity
- Trust signals (testimonials, reviews, guarantees)
- Form optimization
- Page structure for user engagement

## 🌐 Environment Variables

| Variable                  | Description                                  | Example      |
| ------------------------- | -------------------------------------------- | ------------ |
| `PSI_API_KEY`             | Google PageSpeed Insights API key (optional) | `AIzaSyD...` |
| `NODE_ENV`                | Environment mode                             | `production` |
| `NEXT_TELEMETRY_DISABLED` | Disable Next.js telemetry                    | `1`          |
| `PORT`                    | Server port (Docker)                         | `3000`       |

To use PageSpeed Insights integration:

1. Get an API key from [Google Cloud Console](https://console.cloud.google.com/)
2. Set it as `PSI_API_KEY` environment variable

## 🛠️ Tech Stack

- **Framework:** Next.js 16
- **Language:** TypeScript
- **Frontend:** React 19
- **Styling:** Tailwind CSS 4
- **HTML Parsing:** Cheerio
- **Linting:** ESLint

## 📁 Project Structure

```
site-vitals-next/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   └── analyze/
│   │   │       └── route.ts          # Main analysis endpoint
│   │   ├── page.tsx                  # Main UI component
│   │   ├── layout.tsx                # Root layout
│   │   └── globals.css               # Global styles
│   └── lib/
│       ├── auditUtils.ts             # Shared audit utilities
│       ├── htmlAudit.ts              # HTML-based audits (SEO, Speed, A11y)
│       ├── crawlAudit.ts             # Robots.txt & sitemap analysis
│       ├── structuredDataAudit.ts    # JSON-LD & Schema.org validation
│       ├── pagespeed.ts              # Google Lighthouse integration
│       └── securityHeadersAudit.ts   # Security headers analyzer
├── Dockerfile                         # Production Docker image
├── docker-compose.yml                # Docker Compose configuration
├── next.config.ts                    # Next.js configuration
├── tsconfig.json                     # TypeScript configuration
├── postcss.config.mjs                # PostCSS configuration
├── eslint.config.mjs                 # ESLint configuration
└── package.json                      # Dependencies

```

## 🚢 Deployment

### Deploy to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel
```

### Deploy to Docker Hub

```bash
# Build image
docker build -t yourusername/site-vitals:latest .

# Push to Docker Hub
docker push yourusername/site-vitals:latest

# Deploy to any Docker host
docker pull yourusername/site-vitals:latest
docker run -p 3000:3000 yourusername/site-vitals:latest
```

### Deploy to AWS ECS, GCP Cloud Run, or Azure Container Instances

The Docker image can be deployed to any container service. Push to your registry of choice and configure the service to run the image.

## 🔍 Usage Examples

### Scanning a Website

1. Open the application at `http://localhost:3000`
2. Enter your website URL (e.g., `https://example.com`)
3. Click "Run diagnostic"
4. Review results across all categories
5. Mark issues as resolved as you fix them

### Programmatic Access

```bash
curl -X POST http://localhost:3000/api/analyze \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com"}'
```

## 📈 Performance Optimization Tips

Based on common audit findings:

### Security

- Implement all recommended security headers
- Use CSP nonces/hashes instead of unsafe-inline
- Remove X-Powered-By and minimize Server header

### SEO

- Write unique, 50-60 character titles
- Add 140-160 character meta descriptions
- Structure content with proper heading hierarchy
- Include structured data for rich snippets

### Performance

- Compress responses with gzip or Brotli
- Set appropriate Cache-Control headers
- Defer or async non-critical JavaScript
- Optimize image sizes and formats

### Accessibility

- Add descriptive alt text to all images
- Ensure sufficient color contrast (WCAG AA: 4.5:1)
- Label all form inputs
- Use semantic HTML

## 🐛 Troubleshooting

### "Failed to fetch page" Error

- Ensure the URL is accessible from your network
- Check if the domain has proper DNS resolution
- Verify the site doesn't block bot requests (User-Agent)

### PageSpeed Insights Returns No Results

- Ensure `PSI_API_KEY` environment variable is set
- Verify the API key is valid
- Check Google Cloud quota limits

### Container Won't Start

```bash
# Check logs
docker-compose logs -f site-vitals

# Rebuild from scratch
docker-compose down
docker-compose up --build
```

## 📝 License

This project is open source and available under the MIT License.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit pull requests or open issues for bugs and feature requests.

## 📚 Further Reading

- [OWASP Top 10 Web Security Risks](https://owasp.org/www-project-top-ten/)
- [Mozilla HTTP Security Headers](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers)
- [Google Lighthouse Documentation](https://developers.google.com/web/tools/lighthouse)
- [W3C Web Content Accessibility Guidelines (WCAG)](https://www.w3.org/WAI/WCAG21/quickref/)

## 💡 Tips for Best Results

1. **Regular Scanning** - Scan your site weekly or after major updates
2. **Fix Progressively** - Address critical issues first, then optimization
3. **Mobile Testing** - Test mobile versions separately for responsive design issues
4. **Production URLs** - Scan production URLs for accurate performance metrics
5. **API Integration** - Use the `/api/analyze` endpoint to integrate into your CI/CD pipeline

---

**Made with ❤️ for better web security and accessibility**
