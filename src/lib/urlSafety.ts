import { promises as dns } from "node:dns";
import { isIP } from "node:net";

/**
 * Blocks the classic SSRF targets: non-http(s) schemes, loopback, private/
 * reserved IP ranges, link-local addresses (incl. the 169.254.169.254 cloud
 * metadata endpoint), and obviously-internal hostnames. Every hostname is
 * also resolved via DNS so that a public-looking domain that actually
 * resolves to an internal address (DNS rebinding) is caught too.
 */

const BLOCKED_HOSTNAMES = new Set([
	"localhost",
	"localhost.localdomain",
	"metadata.google.internal",
]);

function isPrivateIPv4(ip: string): boolean {
	const parts = ip.split(".").map(Number);
	if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
	const [a, b] = parts;

	if (a === 127) return true; // loopback
	if (a === 10) return true; // private
	if (a === 172 && b >= 16 && b <= 31) return true; // private
	if (a === 192 && b === 168) return true; // private
	if (a === 169 && b === 254) return true; // link-local (incl. cloud metadata)
	if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
	if (a === 0) return true; // "this network"
	if (a >= 224) return true; // multicast / reserved / broadcast

	return false;
}

function isPrivateIPv6(ip: string): boolean {
	const normalized = ip.toLowerCase();
	if (normalized === "::1") return true; // loopback
	if (normalized === "::") return true;
	if (normalized.startsWith("::ffff:")) {
		// IPv4-mapped IPv6 address — check the embedded IPv4 part too.
		const embedded = normalized.slice("::ffff:".length);
		if (isIP(embedded) === 4) return isPrivateIPv4(embedded);
	}
	if (normalized.startsWith("fe80:")) return true; // link-local
	if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true; // unique local

	return false;
}

function isPrivateIP(ip: string): boolean {
	const version = isIP(ip);
	if (version === 4) return isPrivateIPv4(ip);
	if (version === 6) return isPrivateIPv6(ip);
	return true; // couldn't parse — treat as unsafe
}

export class UnsafeUrlError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "UnsafeUrlError";
	}
}

/**
 * Validates that a user-supplied URL is safe to fetch server-side.
 * Throws UnsafeUrlError if it isn't. Returns the normalized URL string
 * (with the original hostname, not a resolved IP — DNS can still change
 * between this check and the actual fetch, so callers doing highly
 * sensitive fetching should re-check, but this closes the common case).
 */
export async function assertSafeUrl(rawUrl: string): Promise<string> {
	let parsed: URL;
	try {
		parsed = new URL(rawUrl);
	} catch {
		throw new UnsafeUrlError("Invalid URL.");
	}

	if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
		throw new UnsafeUrlError("Only http and https URLs are allowed.");
	}

	const hostname = parsed.hostname.toLowerCase();

	if (BLOCKED_HOSTNAMES.has(hostname)) {
		throw new UnsafeUrlError("This host cannot be scanned.");
	}
	if (hostname.endsWith(".local") || hostname.endsWith(".internal")) {
		throw new UnsafeUrlError("This host cannot be scanned.");
	}

	// If the hostname is already a literal IP, check it directly.
	if (isIP(hostname)) {
		if (isPrivateIP(hostname)) {
			throw new UnsafeUrlError("This host cannot be scanned.");
		}
		return parsed.toString();
	}

	// Otherwise resolve it and make sure none of the resolved addresses
	// point somewhere internal (guards against DNS rebinding).
	let addresses: string[];
	try {
		const records = await dns.lookup(hostname, { all: true, verbatim: true });
		addresses = records.map((r) => r.address);
	} catch {
		throw new UnsafeUrlError("Could not resolve host.");
	}

	if (addresses.length === 0 || addresses.some(isPrivateIP)) {
		throw new UnsafeUrlError("This host cannot be scanned.");
	}

	return parsed.toString();
}

export interface SafeFetchOptions extends RequestInit {
	/** Max redirect hops to follow before giving up. Each hop is re-validated
	 *  through assertSafeUrl, so a redirect to an internal address (or one
	 *  that only resolves to one via DNS rebinding) is rejected instead of
	 *  followed — this is what a plain `fetch(url, { redirect: "follow" })`
	 *  would miss. */
	maxRedirects?: number;
}

/**
 * SSRF-safe replacement for `fetch()` when the URL (or anything it might
 * redirect to) isn't fully trusted — i.e. any URL discovered while crawling
 * or checking links on a page, not just the one the user typed in directly.
 * Validates the initial URL, then follows redirects manually, validating
 * every hop before requesting it.
 */
export async function safeFetch(rawUrl: string, options: SafeFetchOptions = {}): Promise<Response> {
	const { maxRedirects = 5, ...init } = options;
	let currentUrl = await assertSafeUrl(rawUrl);

	for (let hop = 0; hop <= maxRedirects; hop++) {
		const res = await fetch(currentUrl, { ...init, redirect: "manual" });

		const isRedirect = res.status >= 300 && res.status < 400;
		if (!isRedirect) return res;

		const location = res.headers.get("location");
		if (!location) return res; // redirect status with no Location — nothing to follow

		let nextUrl: string;
		try {
			nextUrl = new URL(location, currentUrl).toString();
		} catch {
			throw new UnsafeUrlError("Redirected to an invalid URL.");
		}

		// Re-validates scheme, private/loopback/link-local ranges, and DNS
		// resolution for the redirect target — this is the step a bare
		// `redirect: "follow"` fetch skips entirely.
		currentUrl = await assertSafeUrl(nextUrl);
	}

	throw new UnsafeUrlError("Too many redirects.");
}
