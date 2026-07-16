import { NextRequest } from "next/server";
import { load } from "cheerio";
import { AI_PROVIDERS, type AIProviderId } from "@/lib/aiFix";
import { streamFix } from "@/lib/aiProviders";
import { fetchPage } from "@/lib/htmlAudit";
import { assertSafeUrl, UnsafeUrlError } from "@/lib/urlSafety";
import { buildPageSnapshot, type EngineTestMode } from "@/lib/aiEngineTest";
import { buildEngineTestPrompt } from "@/lib/aiEngineTestPrompt";
import { getErrorMessage } from "@/lib/errorUtils";

export const runtime = "nodejs";
export const maxDuration = 60;

interface EngineTestRequestBody {
	provider: AIProviderId;
	apiKey: string;
	model?: string;
	url: string;
	mode: EngineTestMode;
}

export async function POST(req: NextRequest) {
	let body: EngineTestRequestBody;
	try {
		body = await req.json();
	} catch {
		return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400 });
	}

	const { provider, apiKey, model, url, mode } = body;

	if (!provider || !apiKey || !url || (mode !== "aeo" && mode !== "geo")) {
		return new Response(
			JSON.stringify({ error: "Missing provider, apiKey, url, or mode" }),
			{ status: 400 },
		);
	}

	if (!AI_PROVIDERS[provider]) {
		return new Response(JSON.stringify({ error: "Unknown provider" }), { status: 400 });
	}

	// This hits an arbitrary user-supplied URL server-side, so it goes through
	// the same SSRF guard as the main scan (blocks loopback/private/link-local
	// targets and re-resolves DNS).
	let safeUrl: string;
	try {
		safeUrl = await assertSafeUrl(url);
	} catch (err) {
		const message = err instanceof UnsafeUrlError ? err.message : "Could not validate that URL";
		return new Response(JSON.stringify({ error: message }), { status: 400 });
	}

	let html: string;
	try {
		const fetched = await fetchPage(safeUrl);
		if (!fetched.response.ok) {
			return new Response(
				JSON.stringify({ error: `The page returned HTTP ${fetched.response.status}` }),
				{ status: 400 },
			);
		}
		html = fetched.html;
	} catch (err: unknown) {
		return new Response(
			JSON.stringify({ error: getErrorMessage(err, "Could not fetch the page") }),
			{ status: 400 },
		);
	}

	const $ = load(html);
	const snapshot = buildPageSnapshot($, html, safeUrl);
	const resolvedModel = model || AI_PROVIDERS[provider].defaultModel;
	const { system, user } = buildEngineTestPrompt(mode, safeUrl, snapshot);

	const encoder = new TextEncoder();

	const stream = new ReadableStream({
		async start(controller) {
			const send = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));

			try {
				for await (const chunk of streamFix(provider, { apiKey, model: resolvedModel, system, user })) {
					send({ type: "delta", text: chunk });
				}
				send({ type: "done" });
			} catch (err: unknown) {
				send({ type: "error", message: getErrorMessage(err, "Unknown error running the live test") });
			} finally {
				controller.close();
			}
		},
	});

	// apiKey is used only for the single upstream call above — never logged, persisted, or echoed back.
	return new Response(stream, {
		headers: { "Content-Type": "application/x-ndjson; charset=utf-8" },
	});
}
