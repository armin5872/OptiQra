import { issue, pass, type Issue } from "@/lib/auditUtils";

export interface SecurityHeaderResult {
	issues: Issue[];
	passed: Issue[];
	headers: Record<string, string>;
}

const SECURITY_HEADERS = {
	"Strict-Transport-Security": {
		weight: 15,
		description: "Forces HTTPS connections",
		recommendation:
			"Add header: Strict-Transport-Security: max-age=31536000; includeSubDomains; preload",
	},
	"Content-Security-Policy": {
		weight: 12,
		description: "Prevents XSS attacks",
		recommendation: "Add header: Content-Security-Policy: default-src 'self'",
	},
	"X-Frame-Options": {
		weight: 10,
		description: "Prevents clickjacking attacks",
		recommendation: "Add header: X-Frame-Options: DENY or SAMEORIGIN",
	},
	"X-Content-Type-Options": {
		weight: 8,
		description: "Prevents MIME-type sniffing",
		recommendation: "Add header: X-Content-Type-Options: nosniff",
	},
	"Referrer-Policy": {
		weight: 6,
		description: "Controls referrer information",
		recommendation:
			"Add header: Referrer-Policy: strict-origin-when-cross-origin",
	},
	"Permissions-Policy": {
		weight: 5,
		description: "Controls browser features and APIs",
		recommendation:
			"Add header: Permissions-Policy: geolocation=(), microphone=(), camera=()",
	},
	"Cross-Origin-Opener-Policy": {
		weight: 7,
		description: "Isolates browsing context",
		recommendation: "Add header: Cross-Origin-Opener-Policy: same-origin",
	},
	"Cross-Origin-Embedder-Policy": {
		weight: 6,
		description: "Prevents cross-origin resource embedding",
		recommendation: "Add header: Cross-Origin-Embedder-Policy: require-corp",
	},
};

async function fetchHeaders(
	targetUrl: string,
): Promise<Record<string, string>> {
	try {
		const response = await fetch(targetUrl, {
			redirect: "follow",
			headers: { "User-Agent": "SiteVitalsBot/1.0 (+https://example.com/bot)" },
			next: { revalidate: 3600 },
		});

		const headers: Record<string, string> = {};
		response.headers.forEach((value, key) => {
			headers[key.toLowerCase()] = value;
		});

		return headers;
	} catch (error) {
		console.error("Failed to fetch headers:", error);
		return {};
	}
}

export async function analyzeSecurityHeaders(
	targetUrl: string,
): Promise<SecurityHeaderResult> {
	const issues: Issue[] = [];
	const passed: Issue[] = [];

	let headers: Record<string, string> = {};
	try {
		headers = await fetchHeaders(targetUrl);
	} catch (error) {
		issues.push(
			issue(
				"header-fetch-error",
				"Could not fetch security headers",
				"Failed to establish connection to analyze headers",
				"Ensure the URL is accessible and not blocked by CORS policies",
				8,
				"warn",
			),
		);
		return { issues, passed, headers };
	}

	// Check each security header
	Object.entries(SECURITY_HEADERS).forEach(([headerName, config]) => {
		const headerKey = headerName.toLowerCase();
		const headerValue = headers[headerKey];

		if (!headerValue) {
			issues.push(
				issue(
					`missing-${headerName.toLowerCase().replace(/[^a-z0-9]/g, "-")}`,
					`Missing ${headerName}`,
					config.description,
					config.recommendation,
					config.weight,
					"warn",
				),
			);
		} else {
			passed.push(
				pass(
					`present-${headerName.toLowerCase().replace(/[^a-z0-9]/g, "-")}`,
					`${headerName}: ${headerValue.substring(0, 50)}${headerValue.length > 50 ? "..." : ""}`,
				),
			);

			// Additional validations
			if (headerName === "Strict-Transport-Security") {
				if (!headerValue.includes("max-age")) {
					issues.push(
						issue(
							"hsts-no-max-age",
							"HSTS missing max-age",
							"The Strict-Transport-Security header should include max-age directive",
							"Ensure max-age is set to at least 31536000 (1 year)",
							5,
							"warn",
						),
					);
				}
			}

			if (headerName === "Content-Security-Policy") {
				if (headerValue.includes("'unsafe-inline'")) {
					issues.push(
						issue(
							"csp-unsafe-inline",
							"CSP allows unsafe-inline",
							"Content-Security-Policy includes unsafe-inline which reduces XSS protection",
							"Remove unsafe-inline and use nonces or hashes for inline scripts",
							8,
							"warn",
						),
					);
				}
				if (headerValue.includes("*")) {
					issues.push(
						issue(
							"csp-wildcard",
							"CSP uses wildcards",
							"Content-Security-Policy contains overly permissive wildcards",
							"Use specific domains instead of * in directives",
							6,
							"warn",
						),
					);
				}
			}
		}
	});

	// Additional security checks
	const hasHTTPS = (url: string) => url.startsWith("https://");
	if (!hasHTTPS(targetUrl)) {
		issues.push(
			issue(
				"no-https",
				"Site not using HTTPS",
				"The website is not served over HTTPS",
				"Migrate to HTTPS and redirect HTTP traffic to HTTPS",
				15,
				"critical",
			),
		);
	}

	// Check for X-Powered-By header exposure
	if (headers["x-powered-by"]) {
		issues.push(
			issue(
				"x-powered-by-exposed",
				"X-Powered-By header exposes technology stack",
				`The X-Powered-By header reveals: ${headers["x-powered-by"]}`,
				"Remove or obscure the X-Powered-By header to reduce information disclosure",
				3,
				"warn",
			),
		);
	}

	// Check for Server header exposure
	if (headers["server"]) {
		const serverValue = headers["server"];
		if (serverValue.length > 20) {
			issues.push(
				issue(
					"server-header-exposed",
					"Server header reveals too much information",
					`The Server header reveals: ${serverValue}`,
					"Remove or minimize the Server header to reduce information disclosure",
					3,
					"warn",
				),
			);
		}
	}

	issues.sort((a, b) => b.weight - a.weight);
	return { issues: issues.slice(0, 12), passed: passed.slice(0, 8), headers };
}
