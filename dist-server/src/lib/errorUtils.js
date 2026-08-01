"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getErrorMessage = getErrorMessage;
exports.isAbortError = isAbortError;
/**
 * Safely extracts a human-readable message from a value caught in a
 * `catch` block. Catch bindings are `unknown` (not `any`) by design —
 * this helper narrows them without needing `any` at every call site.
 */
function getErrorMessage(err, fallback = "Unknown error") {
    if (err instanceof Error)
        return err.message;
    if (typeof err === "string")
        return err;
    if (err && typeof err === "object" && "message" in err) {
        const msg = err.message;
        if (typeof msg === "string")
            return msg;
    }
    return fallback;
}
/**
 * True if the caught value is (or looks like) a DOMException/Error raised
 * by an aborted fetch/AbortController — i.e. `err.name === "AbortError"`.
 */
function isAbortError(err) {
    return ((err instanceof Error && err.name === "AbortError") ||
        (!!err && typeof err === "object" && "name" in err && err.name === "AbortError"));
}
