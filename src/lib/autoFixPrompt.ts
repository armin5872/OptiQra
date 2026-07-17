// lib/autoFixPrompt.ts
//
// Builds the system/user prompt for the batched auto-fix AI call: unlike
// aiFixPrompt.ts (which asks for a prose explanation + snippet a human
// copy-pastes), this asks for strict JSON — {id: value} — because the
// caller splices the result straight into the DOM with no human in the loop.

import type { AITarget } from "@/lib/autoFixEngine";
import type { StackPromptContext } from "@/lib/stackDetector";

export function buildAutoFixBatchPrompt(
	targets: AITarget[],
	pageUrl: string,
	stack?: StackPromptContext,
): { system: string; user: string } {
	const system = `You are fixing content gaps on a live website automatically, with no human reviewing your output before it's applied.

Rules:
- Respond with ONLY a single JSON object, no prose, no markdown fences, no explanation.
- The JSON shape is exactly: {"fixes": [{"id": "<id>", "value": "<the fix content>"}, ...]} — one entry per target below.
- "value" is the raw content to insert (e.g. the title text itself, the alt text itself, the label text itself) — never HTML tags, never a code block, never a description of the fix.
- Titles: 50-60 characters, specific to the page. Meta descriptions: 140-160 characters, written as compelling ad copy, not a restatement of the title. Alt text: describe what's actually likely in the image based on the context given, concise (under 125 characters). Labels/aria-labels: short (2-6 words) and describe the control's purpose. CTA text: 2-4 words describing the action/outcome, not generic ("Submit", "Click here").
- Every value must be plain text only — no quotation marks wrapping it, no trailing punctuation unless natural.
${stack ? `- Detected stack: ${stack.summary}. ${stack.guidance} (This only affects tone/terminology if relevant — the output is still plain content, not code.)` : ""}`;

	const lines = [`Page URL: ${pageUrl}`, "", "Targets:"];
	for (const t of targets) {
		lines.push(`- id="${t.id}" kind="${t.kind}" issue="${t.title}" context: ${t.context}`);
	}
	lines.push("", `Return JSON with exactly ${targets.length} entries in "fixes", one per id above.`);

	return { system, user: lines.join("\n") };
}

export interface ParsedAutoFixResponse {
	values: Record<string, string>;
}

/** Parses the model's JSON response, tolerating stray markdown fences some
 *  providers add despite instructions not to. */
export function parseAutoFixResponse(raw: string): ParsedAutoFixResponse {
	const cleaned = raw
		.trim()
		.replace(/^```(?:json)?/i, "")
		.replace(/```$/, "")
		.trim();

	const values: Record<string, string> = {};
	try {
		const parsed = JSON.parse(cleaned);
		const fixes = Array.isArray(parsed?.fixes) ? parsed.fixes : [];
		for (const f of fixes) {
			if (f && typeof f.id === "string" && typeof f.value === "string" && f.value.trim()) {
				values[f.id] = f.value.trim();
			}
		}
	} catch {
		// Malformed JSON from the model — caller treats missing ids as
		// "couldn't fix", falling back to the duplicate bank or skipping.
	}
	return { values };
}
