import type { GenerateInsightsRequest } from "@/lib/aiInsights";
import type { InsightsMood } from "@/lib/settingsStore";

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

// Separate axis from TONE_INSTRUCTIONS: tone controls length/depth, mood
// controls voice/personality. The two combine freely — e.g. "concise" +
// "quirky" is a short, sweary roast; "detailed" + "professional" is a long,
// boardroom-ready readout.
const MOOD_INSTRUCTIONS: Record<InsightsMood, string> = {
	normal:
		" Voice: plain and neutral. No persona, no catchphrases — just a clear, matter-of-fact consultant stating what's true.",
	professional:
		" Voice: formal and polished, like a written report to executives. No contractions, no slang, no jokes. Precise, composed, boardroom-ready language throughout.",
	friendly:
		" Voice: warm and encouraging, like a supportive colleague talking you through it. Use \"we\"/\"let's\", acknowledge what's already working before the fixes, and frame problems as solvable rather than alarming.",
	energetic:
		" Voice: high-energy and enthusiastic. Treat every fix like a win waiting to happen. Short punchy sentences, occasional exclamation points, genuine hype about the opportunity — but never lose the actual substance under the enthusiasm.",
	quirky:
		" Voice: a foul-mouthed, no-filter dev buddy roasting this site to your face. Casual profanity is expected and encouraged (e.g. \"who let this slow-ass homepage ship\"), sarcastic jabs at the worst offenders, zero corporate polish — but every roast has to be backed by a real number or issue from the data, never profanity for its own sake.",
	sarcastic:
		" Voice: dry, deadpan, backhanded-compliment energy. Understated wit, eye-rolling at the obvious stuff, delivered completely straight-faced. Still fully accurate — the sarcasm is garnish, not a replacement for the substance.",
	fullDev:
		" Voice: dev-to-dev, technical and dense. Reference the actual mechanics behind each issue (headers, DOM APIs, render-blocking resources, build-time vs runtime, caching layers, etc.) and assume the reader is comfortable with that vocabulary — don't dumb anything down.",
	nonDev:
		" Voice: zero jargon, ever. Explain every finding in plain, everyday language and in terms of real-world impact (visitors, sales, trust) rather than technical mechanism. If a technical term is unavoidable, define it in the same sentence in plain words.",
	experimental:
		" Voice: unhinged — energetic hype and foul-mouthed roasting mashed together and turned up past what's reasonable. Genuinely furious about bad scores, gleefully hyped about good ones, swearing and ALL-CAPS used for emphasis when a number is bad enough to deserve it. Still every single claim must be real and traceable to the data — the chaos is stylistic, the substance underneath stays completely accurate.",
};

export function buildInsightsPrompt(req: GenerateInsightsRequest): {
	system: string;
	user: string;
} {
	const { siteUrl, mode, pagesScanned, overallScore, categories, tone, mood, stack } = req;
	const stackRule = stack
		? `- Detected stack: ${stack.summary}. When recommending how to implement a fix, phrase it for this stack specifically (${stack.guidance})`
		: DEFAULT_STACK_RULE;
	const SYSTEM_PROMPT =
		`${BASE_SYSTEM_PROMPT}\n${stackRule}` +
		TONE_INSTRUCTIONS[tone ?? "detailed"] +
		MOOD_INSTRUCTIONS[mood ?? "normal"];

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
