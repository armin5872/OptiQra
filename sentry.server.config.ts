// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
	dsn,
	enabled: !!dsn,
	tracesSampleRate: process.env.NODE_ENV === "production" ? 0.2 : 1,
	debug: false,
	// The LocalVariables/Anr integrations call require('inspector') at init
	// time, unconditionally, even when Sentry is disabled. @yao-pkg/pkg strips
	// the built-in `inspector` module out of the packaged Windows sidecar
	// binary, so that require throws synchronously and crashes the server
	// before it can bind to a port (ERR_INSPECTOR_NOT_AVAILABLE). Dropping
	// these two integrations keeps normal error/tracing reporting intact for
	// the Vercel deployment while letting the desktop sidecar boot.
	integrations: (integrations) =>
		integrations.filter((i) => i.name !== "LocalVariables" && i.name !== "Anr"),
});
