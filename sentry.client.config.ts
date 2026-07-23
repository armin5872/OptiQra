// This file configures the initialization of Sentry on the client.
// The config you add here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

Sentry.init({
	dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

	// Only send events when a DSN is actually configured (keeps local dev
	// and forks that haven't set one up quiet instead of erroring).
	enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,

	// Adjust this value in production, or use tracesSampler for greater control
	tracesSampleRate: process.env.NODE_ENV === "production" ? 0.2 : 1,

	// Capture Replay for a fraction of all sessions, plus for sessions with an error
	replaysSessionSampleRate: 0.05,
	replaysOnErrorSampleRate: 1,

	integrations: [Sentry.replayIntegration()],

	// Setting this option to true will print useful information to the console while you're setting up Sentry.
	debug: false,
});
