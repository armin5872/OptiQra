"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.readNDJSONStream = readNDJSONStream;
async function* readNDJSONStream(body) {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    function* drainLines() {
        let newlineIdx;
        while ((newlineIdx = buffer.indexOf("\n")) >= 0) {
            const line = buffer.slice(0, newlineIdx).trim();
            buffer = buffer.slice(newlineIdx + 1);
            if (!line)
                continue;
            try {
                yield JSON.parse(line);
            }
            catch {
                // malformed/keep-alive line — skip it, don't kill the stream
            }
        }
    }
    try {
        while (true) {
            const { value, done } = await reader.read();
            if (value)
                buffer += decoder.decode(value, { stream: true });
            yield* drainLines();
            if (done)
                break;
        }
        // Flush anything left in the decoder plus a final line with no
        // trailing newline — this is the part every previous copy dropped.
        buffer += decoder.decode();
        yield* drainLines();
        const last = buffer.trim();
        if (last) {
            try {
                yield JSON.parse(last);
            }
            catch {
                // malformed trailing line — nothing more we can do with it
            }
        }
    }
    finally {
        reader.releaseLock();
    }
}
