import { NextRequest, NextResponse } from "next/server";
import { load } from "cheerio";
import { fetchPage } from "@/lib/htmlAudit";
import { renderPageJs } from "@/lib/jsRenderer";
import { assertSafeUrl, UnsafeUrlError } from "@/lib/urlSafety";
import { detectStack, toPromptContext } from "@/lib/stackDetector";
import {
	runAutoFix,
	applyAITargetValues,
	duplicateBankKey,
	type AutoFixResult,
} from "@/lib/autoFixEngine";
import { buildAutoFixBatchPrompt, parseAutoFixResponse } from "@/lib/autoFixPrompt";
import { AI_PROVIDERS, type AIProviderId } from "@/lib/aiFix";
import { completeFix } from "@/lib/aiProviders";
import { getErrorMessage, isAbortError } from "@/lib/errorUtils";

export const runtime = "nodejs";
export const maxDuration = 60;

interface AutoFixRequestBody {
	url?: unknown;
	renderJs?: unknown;
	provider?: unknown;
	apiKey?: unknown;
	model?: unknown;
	/** Client-held cache of previously AI-generated values, keyed by
	 *  `${kind}:${category}` — reused verbatim when no AI key is available
	 *  for this page, instead of leaving the issue unfixed. */
	duplicateBank?: unknown;
}

export async function POST(req: NextRequest) {
	let body: AutoFixRequestBody;
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
		const message = err instanceof UnsafeUrlError ? err.message : "Invalid URL format";
		return NextResponse.json({ error: message }, { status: 400 });
	}

	const provider = typeof body.provider === "string" ? (body.provider as AIProviderId) : undefined;
	const apiKey = typeof body.apiKey === "string" ? body.apiKey : "";
	const model = typeof body.model === "string" && body.model ? body.model : undefined;
	const hasAI = !!provider && !!apiKey && !!AI_PROVIDERS[provider];
	const duplicateBank: Record<string, string> =
		body.duplicateBank && typeof body.duplicateBank === "object" ? (body.duplicateBank as Record<string, string>) : {};

	try {
		const { html: rawHtml, response } = await fetchPage(targetUrl, { signal: req.signal });

		let activeHtml = rawHtml;
		if (body.renderJs === true) {
			try {
				const rendered = await renderPageJs(targetUrl, rawHtml, { signal: req.signal });
				activeHtml = rendered.html;
			} catch (err) {
				console.warn("Auto-fix: JS render failed, falling back to raw HTML:", err);
			}
		}

		const stack = detectStack(activeHtml, response.headers, targetUrl);
		const stackContext = toPromptContext(stack);

		const $ = load(activeHtml);
		const { results, aiTargets } = runAutoFix($, targetUrl);

		let aiResults: AutoFixResult[] = [];
		const newDuplicateBankEntries: Record<string, string> = {};

		if (aiTargets.length > 0) {
			if (hasAI) {
				const resolvedModel = model || AI_PROVIDERS[provider!].defaultModel;
				const { system, user } = buildAutoFixBatchPrompt(aiTargets, targetUrl, stackContext);
				try {
					const raw = await completeFix(provider!, { apiKey, model: resolvedModel, system, user });
					const { values } = parseAutoFixResponse(raw);

					// Anything the model returned goes toward the applied fixes;
					// anything it silently dropped falls back to the duplicate
					// bank, then to "skipped" — never left half-applied.
					const missing = aiTargets.filter((t) => !values[t.id]);
					aiResults = applyAITargetValues($, aiTargets, values, "ai");

					if (missing.length > 0) {
						const fallbackValues: Record<string, string> = {};
						for (const t of missing) {
							const bankValue = duplicateBank[duplicateBankKey(t.kind, t.category)];
							if (bankValue) fallbackValues[t.id] = bankValue;
						}
						const fallbackResults = applyAITargetValues($, missing, fallbackValues, "duplicate");
						aiResults = aiResults.concat(fallbackResults);
					}

					for (const t of aiTargets) {
						if (values[t.id]) newDuplicateBankEntries[duplicateBankKey(t.kind, t.category)] = values[t.id];
					}
				} catch (err) {
					// AI call itself failed (bad key, network, rate limit) — fall
					// through to the duplicate bank for every target instead of
					// erroring the whole auto-fix out.
					const fallbackValues: Record<string, string> = {};
					for (const t of aiTargets) {
						const bankValue = duplicateBank[duplicateBankKey(t.kind, t.category)];
						if (bankValue) fallbackValues[t.id] = bankValue;
					}
					aiResults = applyAITargetValues($, aiTargets, fallbackValues, "duplicate");
					aiResults.forEach((r) => {
						if (r.status === "skipped") r.note = `AI call failed (${getErrorMessage(err, "unknown error")}) — ${r.note}`;
					});
				}
			} else {
				const fallbackValues: Record<string, string> = {};
				for (const t of aiTargets) {
					const bankValue = duplicateBank[duplicateBankKey(t.kind, t.category)];
					if (bankValue) fallbackValues[t.id] = bankValue;
				}
				aiResults = applyAITargetValues($, aiTargets, fallbackValues, "duplicate");
			}
		}

		const allResults = [...results, ...aiResults];
		const summary = {
			fixed: allResults.filter((r) => r.status === "fixed").length,
			duplicated: allResults.filter((r) => r.status === "duplicated").length,
			skipped: allResults.filter((r) => r.status === "skipped").length,
		};

		return NextResponse.json({
			url: targetUrl,
			html: $.html(),
			results: allResults,
			summary,
			stack: stackContext,
			duplicateBankUpdates: newDuplicateBankEntries,
		});
	} catch (err) {
		if (isAbortError(err)) {
			return NextResponse.json({ error: "Request cancelled." }, { status: 499 });
		}
		return NextResponse.json({ error: getErrorMessage(err, "Failed to auto-fix the page") }, { status: 500 });
	}
}
