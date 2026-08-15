// Ambient augmentation matching Next.js's own extended fetch() typing
// (normally supplied by next-env.d.ts in the main app). The extension
// imports several src/lib modules verbatim rather than forking them, and
// a few of their (unused-by-us) live-fetch code paths pass Next's
// cache-control `next: { revalidate }` option, which only type-checks
// inside a Next.js project. This restores that typing here without
// touching the original source.
export {};
declare global {
	interface RequestInit {
		next?: { revalidate?: number | false; tags?: string[] };
	}
}
