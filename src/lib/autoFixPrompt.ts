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
- The JSON shape is exactly: {"fixes": [{"id": "<id>", "value": "<the fix content>", "confidence": "high"|"low"}, ...]} — one entry per target below.
- "value" is the raw content to insert (e.g. the title text itself, the alt text itself, the label text itself) — never HTML tags, never a code block, never a description of the fix.
- "confidence": say "low" whenever the context given doesn't clearly point to one specific answer — a dynamic/hashed image src with no filename clue, an icon button with no distinguishing class or nearby text, generic boilerplate you're inventing from scratch rather than grounding in something in the context. Say "high" when the context (filename, href, surrounding copy, page topic) clearly supports the value you produced. Still give your best real guess either way — never leave "value" empty or refuse — "low" just tells the caller to have a human double-check that one value rather than skipping it.
- Titles: 50-60 characters, specific to the page. Meta descriptions: 140-160 characters, written as compelling ad copy, not a restatement of the title. Alt text: describe what's actually likely in the image based on the context given, concise (under 125 characters). Labels/aria-labels: short (2-6 words) and describe the control's purpose. CTA text: 2-4 words describing the action/outcome, not generic ("Submit", "Click here").
- Every value must be plain text only — no quotation marks wrapping it, no trailing punctuation unless natural.
- Ground every value in the specific context given for that id — the filename, href, surrounding markup, or page topic. Don't invent unrelated content, and don't let one target's context bleed into another's answer.
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
	/** The model's own per-value confidence self-assessment — see the system
	 *  prompt above. Only ever contains "low" entries the caller needs to act
	 *  on; "high" and anything the model omitted are treated identically
	 *  (normal "fixed" status), so there's no need to carry "high" through. */
	confidence: Record<string, "low">;
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
	const confidence: Record<string, "low"> = {};
	try {
		const parsed = JSON.parse(cleaned);
		const fixes = Array.isArray(parsed?.fixes) ? parsed.fixes : [];
		for (const f of fixes) {
			if (f && typeof f.id === "string" && typeof f.value === "string" && f.value.trim()) {
				values[f.id] = f.value.trim();
				if (typeof f.confidence === "string" && f.confidence.toLowerCase() === "low") {
					confidence[f.id] = "low";
				}
			}
		}
	} catch {
		// Malformed JSON from the model — caller treats missing ids as
		// "couldn't fix", falling back to the duplicate bank or skipping.
	}
	return { values, confidence };
}
