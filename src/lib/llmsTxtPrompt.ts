import type { AIProviderId } from "@/lib/aiFix";
import type { StackPromptContext } from "@/lib/stackDetector";

export interface GenerateLlmsTxtRequest {
	provider: AIProviderId;
	apiKey: string;
	model?: string;
	siteUrl: string;
	pagesScanned?: string[];
	/** Page <title>/meta description of the seed page, if we have them —
	 *  gives the model something concrete to summarize instead of guessing
	 *  purely from the URL and path names. */
	pageTitle?: string;
	pageDescription?: string;
	stack?: StackPromptContext;
}

const SYSTEM_PROMPT = `You write llms.txt files: a proposed convention (see https://llmstxt.org) for giving AI assistants and LLM crawlers a concise, structured Markdown map of a website, so they can answer questions about it accurately without having to crawl the whole site.

Format rules — follow these exactly:
- Start with a single "# " H1 with the site or product name.
- Immediately follow with a "> " blockquote of one or two sentences: a crisp summary of what the site/product is and who it's for.
- Optionally a short paragraph of extra context (no heading needed) — only include this if there's something genuinely useful to add beyond the summary.
- Then one or more "## " sections grouping links by purpose (e.g. "## Docs", "## Pages", "## API"). Use whatever section names fit the actual pages given — don't force categories that don't apply.
- Each link is a Markdown list item: "- [Short Label](url): optional one-line note on what's there".
- Do not invent pages, URLs, or facts that weren't given to you. Only use the pages listed below.
- Do not wrap the whole output in a code block or add any preamble/commentary before or after — output ONLY the llms.txt content itself, starting directly with the "# " line.`;

export function buildLlmsTxtPrompt(req: GenerateLlmsTxtRequest): {
	system: string;
	user: string;
} {
	const { siteUrl, pagesScanned, pageTitle, pageDescription, stack } = req;

	const pages = pagesScanned && pagesScanned.length > 0 ? pagesScanned.slice(0, 40) : [siteUrl];
	const pageList = pages.map((u) => `- ${u}`).join("\n");

	const contextLines = [
		`Site URL: ${siteUrl}`,
		pageTitle ? `Seed page title: ${pageTitle}` : null,
		pageDescription ? `Seed page meta description: ${pageDescription}` : null,
		stack ? `Detected stack: ${stack.summary}` : null,
	].filter(Boolean);

	const user = `${contextLines.join("\n")}\n\nPages discovered during the scan (use these, and only these, as link targets):\n${pageList}\n\nWrite the llms.txt file now.`;

	return { system: SYSTEM_PROMPT, user };
}
