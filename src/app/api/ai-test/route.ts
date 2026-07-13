import { NextRequest } from "next/server";
import { AI_PROVIDERS, type AIProviderId } from "@/lib/aiFix";
import { testProviderKey } from "@/lib/aiProviders";

export const runtime = "nodejs";
export const maxDuration = 20;

interface TestRequest {
	provider: AIProviderId;
	apiKey: string;
	model: string;
}

export async function POST(req: NextRequest) {
	let body: TestRequest;
	try {
		body = await req.json();
	} catch {
		return Response.json({ ok: false, message: "Invalid JSON body" }, { status: 400 });
	}

	const { provider, apiKey, model } = body;

	if (!provider || !apiKey || !model) {
		return Response.json({ ok: false, message: "Missing provider, apiKey, or model" }, { status: 400 });
	}

	if (!AI_PROVIDERS[provider]) {
		return Response.json({ ok: false, message: "Unknown provider" }, { status: 400 });
	}

	// apiKey is used only for this single upstream ping — never logged, persisted, or echoed back.
	const result = await testProviderKey(provider, apiKey, model);
	return Response.json(result);
}
