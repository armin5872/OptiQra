import * as Sentry from "@sentry/nextjs";

/** Next.js instrumentation hook — runs once when the server/edge runtime
 *  boots, before any request is handled. Loads the matching Sentry config
 *  for whichever runtime this process actually is. */
export async function register() {
	if (process.env.NEXT_RUNTIME === "nodejs") {
		await import("../sentry.server.config");
	}
	if (process.env.NEXT_RUNTIME === "edge") {
		await import("../sentry.edge.config");
	}
}

/** Reports errors thrown during rendering (server components, route
 *  handlers, etc.) to Sentry with the request that triggered them attached. */
export const onRequestError = Sentry.captureRequestError;
