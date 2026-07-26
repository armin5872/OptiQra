/**
 * Shared reader for the app's "one JSON object per line" (NDJSON) streaming
 * responses — used by every endpoint that streams progress/results back to
 * the browser (ai-fix, ai-insights, ai-engine-test, auto-fix-project,
 * scheduled /api/analyze runs).
 *
 * This used to be hand-rolled at each call site. Every copy had the same
 * bug: the read loop did `if (done) break` *before* handling whatever was
 * still sitting in `buffer`. A ReadableStream has no obligation to end on a
 * line boundary, so if the final chunk (often the `done` or `error` event —
 * the one callers most need) arrived without a trailing "\n" before the
 * connection closed, it was silently discarded and the UI could be left
 * spinning forever. This version flushes the remainder after the stream
 * ends. It also skips unparseable lines instead of throwing, so one
 * malformed keep-alive line can't abort an otherwise-fine stream.
 */
/** Shape shared by the three simple "stream text deltas, or bail with an
 *  error" endpoints (ai-fix, ai-insights, ai-engine-test). */
export type DeltaStreamEvent = { type: "delta"; text: string } | { type: "error"; message: string };

export async function* readNDJSONStream<T = unknown>(
	body: ReadableStream<Uint8Array>,
): AsyncGenerator<T> {
	const reader = body.getReader();
	const decoder = new TextDecoder();
	let buffer = "";

	function* drainLines(): Generator<T> {
		let newlineIdx: number;
		while ((newlineIdx = buffer.indexOf("\n")) >= 0) {
			const line = buffer.slice(0, newlineIdx).trim();
			buffer = buffer.slice(newlineIdx + 1);
			if (!line) continue;
			try {
				yield JSON.parse(line) as T;
			} catch {
				// malformed/keep-alive line — skip it, don't kill the stream
			}
		}
	}

	try {
		while (true) {
			const { value, done } = await reader.read();
			if (value) buffer += decoder.decode(value, { stream: true });
			yield* drainLines();
			if (done) break;
		}

		// Flush anything left in the decoder plus a final line with no
		// trailing newline — this is the part every previous copy dropped.
		buffer += decoder.decode();
		yield* drainLines();
		const last = buffer.trim();
		if (last) {
			try {
				yield JSON.parse(last) as T;
			} catch {
				// malformed trailing line — nothing more we can do with it
			}
		}
	} finally {
		reader.releaseLock();
	}
}
