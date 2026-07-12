import type { NextConfig } from "next";
import withPWAInit from "next-pwa";

const withPWA = withPWAInit({
	dest: "public",
	register: true,
	skipWaiting: true,
	// Don't try to run the SW during `next dev` — it just gets in the way
	// (stale caches, weird HMR behavior). It's built and active in prod.
	disable: process.env.NODE_ENV === "development",
	// The analyze endpoint is a POST/NDJSON stream — never cache it, and
	// Workbox only caches GETs anyway, so this is mostly documentation.
	buildExcludes: [/middleware-manifest\.json$/],
	fallbacks: {
		document: "/offline.html",
	},
	runtimeCaching: [
		{
			// Google Fonts stylesheets
			urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
			handler: "StaleWhileRevalidate",
			options: { cacheName: "google-fonts-stylesheets" },
		},
		{
			// Google Fonts font files
			urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
			handler: "CacheFirst",
			options: {
				cacheName: "google-fonts-webfonts",
				expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
				cacheableResponse: { statuses: [0, 200] },
			},
		},
		{
			// App's own images/icons
			urlPattern: /\/(?:icons|.*\.(?:png|jpg|jpeg|svg|gif|webp|ico))$/i,
			handler: "CacheFirst",
			options: {
				cacheName: "static-images",
				expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 30 },
			},
		},
		{
			// Next.js static build assets (JS/CSS chunks) — these are
			// content-hashed, so it's safe to cache aggressively.
			urlPattern: /\/_next\/static\/.*/i,
			handler: "CacheFirst",
			options: {
				cacheName: "next-static-assets",
				expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
			},
		},
		{
			// Never let the SW cache API calls — scans must always hit the
			// network. Registered mainly so it's explicit, not implicit.
			urlPattern: /\/api\/.*/i,
			handler: "NetworkOnly",
		},
		{
			// Everything else (HTML pages/navigations): try the network
			// first so content stays fresh, fall back to cache offline.
			urlPattern: /.*/i,
			handler: "NetworkFirst",
			options: {
				cacheName: "pages",
				expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 },
				networkTimeoutSeconds: 10,
			},
		},
	],
});

const nextConfig: NextConfig = {
	/* config options here */
	// next-pwa uses webpack; Next.js 16 defaults to Turbopack. Adding an empty
	// turbopack config tells Next.js we're aware of this and it's intentional.
	turbopack: {},
	// next-pwa's webpack config will be used for service-worker generation.
	webpack: (config) => config,
	// Optimize for production and Docker
	output: process.env.DOCKER_BUILD ? "standalone" : undefined,
	compress: true,
	poweredByHeader: false,
	reactStrictMode: true,

	// Security headers
	async headers() {
		return [
			{
				source: "/(.*)",
				headers: [
					{
						key: "X-Content-Type-Options",
						value: "nosniff",
					},
					{
						key: "X-Frame-Options",
						value: "DENY",
					},
					{
						key: "Referrer-Policy",
						value: "strict-origin-when-cross-origin",
					},
				],
			},
		];
	},
};

export default withPWA(nextConfig);
