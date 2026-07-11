import { NextRequest } from "next/server";
import { AI_PROVIDERS, type GenerateFixRequest } from "@/lib/aiFix";
import { buildFixPrompt } from "@/lib/aiFixPrompt";
import { streamFix } from "@/lib/aiProviders";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
	let body: GenerateFixRequest;
	try {
		body = await req.json();
	} catch {
		return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400 });
	}

	const { provider, apiKey, model, issue, pageUrl, category } = body;

	if (!provider || !apiKey || !issue || !pageUrl) {
		return new Response(
			JSON.stringify({ error: "Missing provider, apiKey, issue, or pageUrl" }),
			{ status: 400 },
		);
	}

	if (!AI_PROVIDERS[provider]) {
		return new Response(JSON.stringify({ error: "Unknown provider" }), { status: 400 });
	}

	const resolvedModel = model || AI_PROVIDERS[provider].defaultModel;
	const { system, user } = buildFixPrompt({ provider, apiKey, model, issue, pageUrl, category });

	const encoder = new TextEncoder();

	const stream = new ReadableStream({
		async start(controller) {
			const send = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));

			try {
				for await (const chunk of streamFix(provider, { apiKey, model: resolvedModel, system, user })) {
					send({ type: "delta", text: chunk });
				}
				send({ type: "done" });
			} catch (err: any) {
				send({ type: "error", message: err?.message ?? "Unknown error generating fix" });
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
