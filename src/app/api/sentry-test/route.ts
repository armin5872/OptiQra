import * as Sentry from "@sentry/nextjs";

export async function GET(req: Request) {
	try {
		throw new Error("🧪 Sentry test error — check your Sentry dashboard");
	} catch (error) {
		Sentry.captureException(error, {
			tags: {
				test: "true",
				endpoint: "sentry-test",
			},
			contexts: {
				test: {
					message: "This is a test error to verify Sentry integration",
					url: req.url,
					timestamp: new Date().toISOString(),
				},
			},
		});
	}

	Sentry.captureMessage("✅ Sentry integration test — message event", "info");

	Sentry.addBreadcrumb({
		level: "info",
		message: "Test endpoint called",
		data: {
			timestamp: new Date().toISOString(),
		},
	});

	return Response.json(
		{
			status: "success",
			message: "Test events sent to Sentry",
			note: "Check your Sentry dashboard in the next 5-10 seconds for events",
			dashboardUrl: "https://sentry.io/organizations/optiqra-v1-6-ssrf-fixes/issues/",
			dsnConfigured: !!process.env.NEXT_PUBLIC_SENTRY_DSN || !!process.env.SENTRY_DSN,
			environment: process.env.NODE_ENV,
		},
		{ status: 200 }
	);
}

export async function POST(req: Request) {
	throw new Error(
		"🧪 Intentional POST error for Sentry error boundary testing"
	);
}
