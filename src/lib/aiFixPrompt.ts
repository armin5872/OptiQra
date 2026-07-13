import type { GenerateFixRequest } from "@/lib/aiFix";

const SYSTEM_PROMPT = `You are a senior web engineer fixing a specific, real issue found on a live website during an SEO/performance/accessibility/conversion audit.

Rules:
- Be specific to the actual page and finding given below, never generic textbook advice.
- The "detail" field already contains site-specific facts pulled from the live page (actual title text, actual counts, actual lengths, etc). Use them — don't restate generic best practice that ignores them.
- Output a short explanation (2-4 sentences) of why this specifically hurts this page, then a code fix.
- The code fix must be a minimal, copy-pasteable snippet (HTML/CSS/JS as appropriate) — not a full file rewrite.
- The exact framework/templating isn't known, so give the fix in plain HTML and add a one-line note only if a common framework (React/Next.js) needs different syntax (e.g. className vs class).
- Do not repeat the issue description back verbatim. Do not pad with disclaimers. Do not echo back or restate the generic guidance that was already shown to the user.
- Format: short prose explanation (use **bold** sparingly for the one key term that matters, and inline \`code\` for tag/attribute/selector names), then a fenced code block with a language tag (e.g. \`\`\`html).`;

export function buildFixPrompt({ issue, pageUrl, category }: GenerateFixRequest): {
	system: string;
	user: string;
} {
	const lines: string[] = [
		`Category: ${category}`,
		`Severity: ${issue.severity}`,
		`Page URL: ${pageUrl}`,
		`Finding: ${issue.title}`,
		`Detail (site-specific): ${issue.detail}`,
	];

	if (issue.fix) {
		lines.push(`Generic guidance already shown to the user: ${issue.fix}`);
	}

	lines.push(
		"",
		"Give a fix targeted specifically at this page and this finding, building on the specific facts in the detail line above — not a generic restatement of the guidance.",
	);

	return { system: SYSTEM_PROMPT, user: lines.join("\n") };
}
