// lib/fullAiFixEngine.ts
//
// The "Full AI Fix" pass: unlike autoFixPrompt.ts (which only ever asks the
// model to fill in one short string per missing-content target — a title,
// an alt text, a label), this hands the model the *entire file* plus the
// list of issues detected in it, and asks for the entire file back, fixed.
//
// This is deliberately a separate, opt-in pass that runs AFTER the
// deterministic engine (autoFixEngine.ts / jsxAutoFix.ts) and the batched
// content-fill pass (autoFixPrompt.ts) have already done their safer, more
// constrained work — so a full rewrite is only ever asked to clean up
// whatever's left (issues the mechanical engine couldn't touch, content
// slots the batched pass didn't resolve, or anything else it can spot by
// reading the file directly), not to redo everything from scratch.
//
// Because there's no narrow slot to validate an inserted value against here
// (the model can rewrite anything), the safety net is different in kind
// from fixIntegrityGuard.ts: instead of "did this specific splice stay
// balanced", it's coarser structural checks intended to catch wholesale
// corruption or truncation — a much blunter net, which is why this pass
// stays opt-in and every file it touches is still shipped inside the
// downloadable zip for the person to review, never silently trusted.

export interface RewriteIssue {
	title: string;
	category: string;
	severity: string;
	detail: string;
}

export function buildFullRewritePrompt(
	path: string,
	content: string,
	issues: RewriteIssue[],
	pageUrl: string,
	stackGuidance: string,
): { system: string; user: string } {
	const system = `You are fixing every listed issue directly in a project's source file, with no human reviewing your output before it's applied. You will be given one complete file and a list of issues found in it.

Rules:
- Respond with ONLY the complete, corrected file content — no prose before or after, no markdown code fences, no explanation, no "Here is the fixed file".
- Fix every issue in the list that applies to this file. If an issue needs authored content (a title, description, alt text, label), write real, specific content grounded in the file's own context (filenames, existing copy, surrounding code) — never a placeholder like "TODO" or "Lorem ipsum".
- Change ONLY what's needed to address the listed issues. Preserve the file's existing structure, imports, component/function names, logic, and formatting style everywhere else. Do not refactor, rename, reformat, or "improve" anything unrelated.
- Never remove functionality, delete existing content, or shorten the file by stripping things out — only add or correct what the issues call for.
- Return the ENTIRE file, from the first character to the last, not a diff or a snippet.
- ${stackGuidance}`;

	const issueLines = issues.length
		? issues.map((i) => `- [${i.category}/${i.severity}] ${i.title}: ${i.detail}`).join("\n")
		: "- No specific issues were pre-detected for this file, but check it for accessibility, SEO, and semantic-HTML problems and fix anything real you find.";

	const user = `File: ${path}\nPage URL: ${pageUrl}\n\nIssues to fix:\n${issueLines}\n\nFile content:\n${content}`;

	return { system, user };
}

/** Strips stray markdown fences some providers add despite instructions not
 *  to. The main defense against a chatty response is still the safety check
 *  below rejecting the result if it looks nothing like the original file. */
export function parseFullRewriteResponse(raw: string): string {
	let cleaned = raw.trim();
	const fenced = cleaned.match(/^```[a-zA-Z0-9]*\n([\s\S]*)\n```$/);
	if (fenced) cleaned = fenced[1];
	return cleaned;
}

export interface RewriteSafetyResult {
	ok: boolean;
	reason?: string;
}

function balanced(s: string, openChar: string, closeChar: string): number {
	let open = 0;
	let close = 0;
	for (const ch of s) {
		if (ch === openChar) open++;
		else if (ch === closeChar) close++;
	}
	return open - close;
}

/** Coarse, cheap structural sanity checks on a full-file AI rewrite. Not a
 *  real parser — just enough to catch the failure modes a chatty or
 *  confused model actually produces: an empty/near-empty response, a
 *  response that's mostly prose instead of code, truncation mid-file, or a
 *  dropped component export. Anything that fails this gets thrown away and
 *  the file falls back to whatever the deterministic + batched passes had
 *  already produced. */
export function checkFullRewriteSafety(original: string, modified: string, path: string): RewriteSafetyResult {
	const trimmed = modified.trim();
	if (!trimmed) {
		return { ok: false, reason: `AI full-fix rewrite of ${path} came back empty — discarded.` };
	}

	// A real rewrite of a non-trivial file shouldn't collapse to a fraction
	// of its original size (truncated response, or the model returned a
	// summary/explanation instead of the file) or balloon wildly (the model
	// padded the response with commentary it was told not to include).
	if (original.length > 200) {
		if (trimmed.length < original.length * 0.4) {
			return {
				ok: false,
				reason: `AI full-fix rewrite of ${path} came back ${Math.round((trimmed.length / original.length) * 100)}% of the original size — looks truncated or replaced with a summary. Discarded.`,
			};
		}
		if (trimmed.length > original.length * 3) {
			return {
				ok: false,
				reason: `AI full-fix rewrite of ${path} came back over 3x the original size — likely includes commentary or duplicated content it was told not to add. Discarded.`,
			};
		}
	}

	// Braces/brackets/parens should be internally balanced in the *result
	// itself* (not necessarily matching the original's counts, since a
	// legitimate rewrite can restructure things) — an imbalance here means
	// the returned file is syntactically broken.
	for (const [open, close, label] of [
		["{", "}", "curly braces"],
		["(", ")", "parentheses"],
		["[", "]", "square brackets"],
	] as const) {
		if (balanced(trimmed, open, close) !== 0) {
			return { ok: false, reason: `AI full-fix rewrite of ${path} has unbalanced ${label} — discarded rather than ship broken source.` };
		}
	}

	// Component/module files that exported something before must still
	// export something after — a dropped `export default` means the model
	// regenerated the file's guts but lost the piece that made it a usable
	// module.
	if (/\.(tsx|jsx)$/.test(path) && /export\s+default/.test(original) && !/export\s+default/.test(trimmed)) {
		return { ok: false, reason: `AI full-fix rewrite of ${path} dropped the file's \`export default\` — discarded.` };
	}

	// Full HTML documents must still be full HTML documents afterward.
	if (/<html[\s>]/i.test(original) && !/<html[\s>]/i.test(trimmed)) {
		return { ok: false, reason: `AI full-fix rewrite of ${path} no longer looks like a complete HTML document (lost the <html> tag) — discarded.` };
	}

	return { ok: true };
}
