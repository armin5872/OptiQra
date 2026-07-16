/**
 * Safely extracts a human-readable message from a value caught in a
 * `catch` block. Catch bindings are `unknown` (not `any`) by design —
 * this helper narrows them without needing `any` at every call site.
 */
export function getErrorMessage(err: unknown, fallback = "Unknown error"): string {
	if (err instanceof Error) return err.message;
	if (typeof err === "string") return err;
	if (err && typeof err === "object" && "message" in err) {
		const msg = (err as { message?: unknown }).message;
		if (typeof msg === "string") return msg;
	}
	return fallback;
}

/**
 * True if the caught value is (or looks like) a DOMException/Error raised
 * by an aborted fetch/AbortController — i.e. `err.name === "AbortError"`.
 */
export function isAbortError(err: unknown): boolean {
	return (
		(err instanceof Error && err.name === "AbortError") ||
		(!!err && typeof err === "object" && "name" in err && (err as { name?: unknown }).name === "AbortError")
	);
}
