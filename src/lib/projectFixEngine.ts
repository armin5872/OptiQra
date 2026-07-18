// lib/projectFixEngine.ts
//
// Handles the class of issues that CAN'T be fixed by editing a single HTML
// document — response headers, compression, sitemap/robots — because in
// project-upload mode we have something autoFixEngine.ts never has when
// working off a live URL: the actual project files, including config files
// it can patch or create.
//
// Kept deliberately conservative: it only ever *adds* a new file, or patches
// an existing config file by inserting an additive block it can point to
// explicitly in the result note — never rewrites a config file wholesale,
// since that risks breaking something it can't see (a custom webpack setup,
// a different headers() already returning something specific, etc).

import type { AutoFixResult } from "@/lib/autoFixEngine";

export interface ProjectFile {
	path: string; // relative path, forward-slash separated
	content: string;
}

export type ProjectStackKind = "next" | "vite-react" | "static" | "unknown";

export function detectProjectStack(files: ProjectFile[]): { kind: ProjectStackKind; summary: string } {
	const pkgFile = files.find((f) => /(^|\/)package\.json$/.test(f.path));
	if (pkgFile) {
		try {
			const pkg = JSON.parse(pkgFile.content);
			const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
			if (deps.next) return { kind: "next", summary: `Next.js ${deps.next}` };
			if (deps.vite && (deps.react || deps.vue)) return { kind: "vite-react", summary: "Vite + " + (deps.react ? "React" : "Vue") };
		} catch {
			// malformed package.json — fall through to static
		}
	}
	if (files.some((f) => /\.html?$/i.test(f.path))) return { kind: "static", summary: "Static HTML" };
	return { kind: "unknown", summary: "Unrecognized project layout" };
}

/**
 * Runs every project-wide (non-per-page) fix: generates robots.txt/sitemap.xml
 * if missing, and patches/creates a server-config file with baseline security
 * + caching headers appropriate to the detected stack.
 *
 * Mutates `files` in place (pushes new entries, edits existing ones' `content`)
 * and returns a result list in the same shape as the per-page engine so the
 * UI can show one combined list.
 */
export function runProjectFix(
	files: ProjectFile[],
	siteUrl: string,
	/** Relative page paths to list in sitemap.xml — either real .html file
	 *  paths (static sites) or statically-derivable route strings (e.g.
	 *  Next.js App Router page.tsx locations, which have no rendered HTML). */
	routePaths: string[],
): AutoFixResult[] {
	const results: AutoFixResult[] = [];
	const stack = detectProjectStack(files);
	const findFile = (pattern: RegExp) => files.find((f) => pattern.test(f.path));

	// --- robots.txt ---
	if (!findFile(/(^|\/)robots\.txt$/i)) {
		const body = `User-agent: *\nAllow: /\n${siteUrl ? `\nSitemap: ${siteUrl.replace(/\/$/, "")}/sitemap.xml\n` : ""}`;
		files.push({ path: "robots.txt", content: body });
		results.push({
			id: "proj-robots",
			title: "Missing robots.txt",
			category: "SEO",
			severity: "medium",
			status: "fixed",
			note: "Created a permissive robots.txt at the project root, pointing at sitemap.xml.",
		});
	}

	// --- sitemap.xml — best-effort, listing every HTML file found. ---
	if (!findFile(/(^|\/)sitemap\.xml$/i) && routePaths.length > 0 && siteUrl) {
		const base = siteUrl.replace(/\/$/, "");
		const urls = routePaths
			.map((p) => {
				const clean = p.replace(/(^|\/)index\.html?$/i, "").replace(/\.html?$/i, "");
				const loc = `${base}/${clean}`.replace(/\/{2,}/g, "/").replace(/:\//, "://");
				return `  <url><loc>${escapeXml(loc)}</loc></url>`;
			})
			.join("\n");
		const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
		files.push({ path: "sitemap.xml", content: xml });
		results.push({
			id: "proj-sitemap",
			title: "Missing sitemap.xml",
			category: "SEO",
			severity: "medium",
			status: "fixed",
			note: `Generated a sitemap.xml listing ${routePaths.length} page${routePaths.length === 1 ? "" : "s"} found in the project.`,
		});
	}

	// --- Security + caching headers: stack-aware, additive only. ---
	if (stack.kind === "next") {
		const configFile = findFile(/(^|\/)next\.config\.(js|mjs|ts)$/);
		const headerBlock = `  async headers() {\n    return [\n      {\n        source: "/(.*)",\n        headers: [\n          { key: "X-Content-Type-Options", value: "nosniff" },\n          { key: "X-Frame-Options", value: "SAMEORIGIN" },\n          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },\n          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },\n        ],\n      },\n    ];\n  },\n`;
		if (!configFile) {
			files.push({
				path: "next.config.js",
				content: `/** @type {import('next').NextConfig} */\nconst nextConfig = {\n  poweredByHeader: false,\n${headerBlock}};\n\nmodule.exports = nextConfig;\n`,
			});
			results.push({
				id: "proj-headers-next",
				title: "Missing security headers",
				category: "Security",
				severity: "high",
				status: "fixed",
				note: "Created next.config.js with poweredByHeader disabled and baseline security headers (X-Frame-Options, HSTS, etc).",
			});
		} else if (!/headers\s*\(/.test(configFile.content)) {
			// Additive only: don't attempt to merge into an existing headers()
			// function we can't safely parse — that's a real risk of breaking
			// whatever it already returns. Only act when there's none at all.
			configFile.content = configFile.content.replace(
				/module\.exports\s*=\s*([a-zA-Z_$][\w$]*|\{)/,
				(m) => (configFile.content.includes("poweredByHeader") ? m : m),
			);
			if (!/poweredByHeader/.test(configFile.content) && /const\s+nextConfig\s*=\s*\{/.test(configFile.content)) {
				configFile.content = configFile.content.replace(
					/const\s+nextConfig\s*=\s*\{/,
					`const nextConfig = {\n  poweredByHeader: false,\n${headerBlock}`,
				);
				results.push({
					id: "proj-headers-next",
					title: "Missing security headers",
					category: "Security",
					severity: "high",
					status: "fixed",
					note: "Patched next.config.js: added poweredByHeader: false and a headers() block with baseline security headers.",
				});
			} else {
				results.push({
					id: "proj-headers-next",
					title: "Missing security headers",
					category: "Security",
					severity: "high",
					status: "skipped",
					note: "next.config.js has a shape this tool doesn't recognize (no `const nextConfig = {...}` to patch) — add the headers() function by hand to avoid breaking your existing config.",
				});
			}
		} else {
			results.push({
				id: "proj-headers-next",
				title: "Security headers",
				category: "Security",
				severity: "high",
				status: "skipped",
				note: "next.config.js already defines headers() — left untouched rather than risk overwriting your existing rules. Double check it sets X-Frame-Options, HSTS, and nosniff.",
			});
		}
	} else {
		// Static site (or anything without a Next.js config to patch): add a
		// Netlify-style _headers file, which several other hosts (and some
		// reverse proxies) also understand, plus a conservative .htaccess
		// fallback for Apache.
		if (!findFile(/(^|\/)_headers$/)) {
			files.push({
				path: "_headers",
				content:
					"/*\n  X-Content-Type-Options: nosniff\n  X-Frame-Options: SAMEORIGIN\n  Referrer-Policy: strict-origin-when-cross-origin\n  Strict-Transport-Security: max-age=63072000; includeSubDomains; preload\n",
			});
			results.push({
				id: "proj-headers-static",
				title: "Missing security headers",
				category: "Security",
				severity: "high",
				status: "fixed",
				note: "Added a _headers file (Netlify/Cloudflare Pages format) with baseline security headers. If you're on Apache/Nginx, apply the equivalent directives in your server config instead — this file alone won't take effect there.",
			});
		}
	}

	return results;
}

function escapeXml(s: string): string {
	return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c] as string);
}
