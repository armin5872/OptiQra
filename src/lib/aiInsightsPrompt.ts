import type { GenerateInsightsRequest } from "@/lib/aiInsights";

const BASE_SYSTEM_PROMPT = `You are a senior SEO & web performance consultant giving a client a spoken-style executive readout of an automated site audit.

Rules:
- You're given aggregated, site-wide findings across categories (SEO, Performance, Accessibility, Conversions, Security, etc). Each issue already states how many of the scanned pages it affects — use that to distinguish sitewide/systemic problems (templates, headers, robots.txt) from one-off page problems.
- Open with a short 2-3 sentence overview of overall site health and the single biggest theme you see.
- Then give a prioritized action plan: the highest-impact fixes first, grouped by theme where multiple issues share a root cause (e.g. many pages missing meta descriptions is one fix, not many).
- Call out quick wins separately if any exist: low-effort, high-value fixes.
- Be specific and reference actual numbers/scores/page counts given below — never generic textbook advice divorced from this data.
- Format the response as clean, simple markdown so it renders nicely: "## " for each section heading (e.g. "## Overview", "## Priority Fixes", "## Quick Wins"), "- " for bullet points, and **bold** around key numbers, scores, and page counts so they stand out. Do not use backticks or code blocks — this is a narrative readout, not code. No markdown tables.`;

const DEFAULT_STACK_RULE =
	"- The site's exact platform/framework isn't known, so phrase fixes generically (e.g. \"add X to your page templates\") rather than naming specific files, hooks, or admin panels.";

const TONE_INSTRUCTIONS: Record<"concise" | "detailed", string> = {
	concise:
		" Keep it short: aim for roughly 90-150 words total, favoring tight bullets over prose. Skip minor caveats and background — just overview + prioritized fixes.",
	detailed:
		" Aim for roughly 200-350 words total. Do not repeat the raw data back verbatim, synthesize it.",
};

export function buildInsightsPrompt(req: GenerateInsightsRequest): {
	system: string;
	user: string;
} {
	const { siteUrl, mode, pagesScanned, overallScore, categories, tone, stack } = req;
	const stackRule = stack
		? `- Detected stack: ${stack.summary}. When recommending how to implement a fix, phrase it for this stack specifically (${stack.guidance})`
		: DEFAULT_STACK_RULE;
	const SYSTEM_PROMPT = `${BASE_SYSTEM_PROMPT}\n${stackRule}` + TONE_INSTRUCTIONS[tone ?? "detailed"];

	const lines: string[] = [
		`Site: ${siteUrl}`,
		`Scan type: ${mode === "site" ? `Full site crawl (${pagesScanned ?? "?"} pages scanned)` : "Single page scan"}`,
		`Overall score: ${overallScore}/100`,
	];
	if (stack) {
		lines.push(`Detected tech stack: ${stack.summary}`);
	}
	lines.push("", "Category breakdown:");

	for (const cat of categories) {
		lines.push(
			`\n${cat.label} — score ${cat.score}/100${cat.pagesAnalyzed ? ` (${cat.pagesAnalyzed} pages analyzed)` : ""}, ${cat.totalIssues} distinct issue${cat.totalIssues === 1 ? "" : "s"} found`,
		);

		if (cat.topIssues.length === 0) {
			lines.push("- No open issues in this category.");
			continue;
		}

		for (const iss of cat.topIssues) {
			lines.push(`- [${iss.severity}] ${iss.title}: ${iss.detail}`);
		}

		const remaining = cat.totalIssues - cat.topIssues.length;
		if (remaining > 0) {
			lines.push(`- (+${remaining} more lower-priority issue${remaining === 1 ? "" : "s"} in this category, not listed)`);
		}
	}

	lines.push(
		"",
		"Write the executive readout now, following the rules given in the system prompt.",
	);

	return { system: SYSTEM_PROMPT, user: lines.join("\n") };
}
