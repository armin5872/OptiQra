import { NextRequest } from "next/server";
import { runPageSpeed, buildCoreWebVitalsIssues, PageSpeedError, type PageSpeedStrategy } from "@/lib/pagespeed";
import { assertSafeUrl, UnsafeUrlError } from "@/lib/urlSafety";
import { getErrorMessage } from "@/lib/errorUtils";

export const runtime = "nodejs";
export const maxDuration = 30;

interface PageSpeedRequest {
	url: string;
	apiKey: string;
	strategy?: PageSpeedStrategy;
}

export async function POST(req: NextRequest) {
	let body: PageSpeedRequest;
	try {
		body = await req.json();
	} catch {
		return Response.json({ ok: false, message: "Invalid JSON body" }, { status: 400 });
	}

	const { url, apiKey, strategy } = body;

	if (!url || !apiKey) {
		return Response.json({ ok: false, message: "Missing url or apiKey" }, { status: 400 });
	}

	let safeUrl: string;
	try {
		safeUrl = await assertSafeUrl(url);
	} catch (err) {
		if (err instanceof UnsafeUrlError) {
			return Response.json({ ok: false, message: err.message }, { status: 400 });
		}
		return Response.json({ ok: false, message: "Invalid URL" }, { status: 400 });
	}

	try {
		// apiKey is used only for this single upstream call to Google — never
		// logged, persisted, or echoed back in the response below.
		const result = await runPageSpeed(safeUrl, apiKey, strategy === "desktop" ? "desktop" : "mobile", {
			signal: req.signal,
		});
		const { issues, passed } = buildCoreWebVitalsIssues(result);
		return Response.json({ ok: true, result, issues, passed });
	} catch (err) {
		if (err instanceof PageSpeedError) {
			return Response.json({ ok: false, message: err.message }, { status: err.status || 502 });
		}
		return Response.json(
			{ ok: false, message: getErrorMessage(err, "Couldn't reach PageSpeed Insights") },
			{ status: 502 },
		);
	}
}
