declare module "next-pwa" {
	import type { NextConfig } from "next";

	interface RuntimeCachingOptions {
		cacheName?: string;
		expiration?: { maxEntries?: number; maxAgeSeconds?: number };
		cacheableResponse?: { statuses?: number[]; headers?: Record<string, string> };
		networkTimeoutSeconds?: number;
		[key: string]: unknown;
	}

	interface RuntimeCachingEntry {
		urlPattern: RegExp | string | ((args: { url: URL }) => boolean);
		handler:
			| "CacheFirst"
			| "CacheOnly"
			| "NetworkFirst"
			| "NetworkOnly"
			| "StaleWhileRevalidate";
		method?: string;
		options?: RuntimeCachingOptions;
	}

	interface PWAConfig {
		dest?: string;
		disable?: boolean;
		register?: boolean;
		skipWaiting?: boolean;
		scope?: string;
		sw?: string;
		runtimeCaching?: RuntimeCachingEntry[];
		buildExcludes?: (string | RegExp)[];
		publicExcludes?: string[];
		fallbacks?: Record<string, string>;
		cacheOnFrontEndNav?: boolean;
		reloadOnOnline?: boolean;
		[key: string]: unknown;
	}

	export default function withPWAInit(
		config?: PWAConfig,
	): (nextConfig: NextConfig) => NextConfig;
}
