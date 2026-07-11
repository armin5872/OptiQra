import type { GenerateInsightsRequest } from "@/lib/aiInsights";

const SYSTEM_PROMPT = `You are a senior SEO & web performance consultant giving a client a spoken-style executive readout of an automated site audit.

Rules:
- You're given aggregated, site-wide findings across categories (SEO, Performance, Accessibility, Conversions, Security, etc). Each issue already states how many of the scanned pages it affects — use that to distinguish sitewide/systemic problems (templates, headers, robots.txt) from one-off page problems.
- Open with a short 2-3 sentence overview of overall site health and the single biggest theme you see.
- Then give a prioritized action plan: the highest-impact fixes first, grouped by theme where multiple issues share a root cause (e.g. many pages missing meta descriptions is one fix, not many).
- Call out quick wins separately if any exist: low-effort, high-value fixes.
- Be specific and reference actual numbers/scores/page counts given below — never generic textbook advice divorced from this data.
- Do not use markdown formatting symbols (no #, *, **, backticks, or markdown tables) since this is rendered as plain text. Use plain section labels in capital letters (e.g. "OVERVIEW", "PRIORITY FIXES", "QUICK WINS") and hyphen "-" for bullet points.
- Keep it tight: aim for roughly 200-350 words total. Do not repeat the raw data back verbatim, synthesize it.`;

export function buildInsightsPrompt(req: GenerateInsightsRequest): {
	system: string;
	user: string;
} {
	const { siteUrl, mode, pagesScanned, overallScore, categories } = req;

	const lines: string[] = [
		`Site: ${siteUrl}`,
		`Scan type: ${mode === "site" ? `Full site crawl (${pagesScanned ?? "?"} pages scanned)` : "Single page scan"}`,
		`Overall score: ${overallScore}/100`,
		"",
		"Category breakdown:",
	];

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
