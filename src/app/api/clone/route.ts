import { NextRequest, NextResponse } from "next/server";
import { fetchPage } from "@/lib/htmlAudit";
import { renderPageJs } from "@/lib/jsRenderer";
import { assertSafeUrl, UnsafeUrlError } from "@/lib/urlSafety";
import { buildAnnotatedClone } from "@/lib/siteClone";
import { getErrorMessage, isAbortError } from "@/lib/errorUtils";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Builds a sanitized, issue-annotated clone of a single page for the
 * "view site with issues highlighted" viewer. Reuses the same fetch/render
 * pipeline as /api/analyze so what's shown here matches what the report
 * actually scored.
 */
export async function POST(req: NextRequest) {
	let body: { url?: unknown; renderJs?: unknown };
	try {
		body = await req.json();
	} catch {
		return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
	}

	if (!body.url || typeof body.url !== "string") {
		return NextResponse.json({ error: "URL is required" }, { status: 400 });
	}

	let targetUrl: string;
	try {
		targetUrl = await assertSafeUrl(body.url);
	} catch (err) {
		const message =
			err instanceof UnsafeUrlError ? err.message : "Invalid URL format";
		return NextResponse.json({ error: message }, { status: 400 });
	}

	try {
		const { html: rawHtml } = await fetchPage(targetUrl, { signal: req.signal });

		let activeHtml = rawHtml;
		let renderJsApplied = false;
		if (body.renderJs === true) {
			try {
				const rendered = await renderPageJs(targetUrl, rawHtml, {
					signal: req.signal,
				});
				activeHtml = rendered.html;
				renderJsApplied = true;
			} catch (err) {
				console.warn(
					"Clone viewer: JS render failed, falling back to raw HTML:",
					err,
				);
			}
		}

		const { html, elementIssues, pageIssues } = buildAnnotatedClone(
			activeHtml,
			targetUrl,
		);

		return NextResponse.json({
			url: targetUrl,
			html,
			elementIssues,
			pageIssues,
			renderJsApplied,
		});
	} catch (err) {
		if (isAbortError(err)) {
			return NextResponse.json({ error: "Request cancelled." }, { status: 499 });
		}
		return NextResponse.json(
			{ error: getErrorMessage(err, "Failed to build the highlighted clone") },
			{ status: 500 },
		);
	}
}
