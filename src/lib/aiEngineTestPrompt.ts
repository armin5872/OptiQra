import type { EngineTestMode, PageSnapshot } from "@/lib/aiEngineTest";

const SHARED_RULES = `Your very first line of output must be exactly one of: "VERDICT: Likely", "VERDICT: Possible", or "VERDICT: Unlikely" — nothing else on that line. Leave a blank line after it.
After the verdict, explain your reasoning in 3-5 sentences grounded specifically in the content you were given below — never generic textbook SEO advice divorced from this page.
End with one concrete, specific change to this page that would most improve your verdict.
Format the rest as clean markdown: "## " for at most one short heading if it helps, "- " for bullets, **bold** around key terms. No tables, no code blocks, no backticks.`;

const AEO_SYSTEM = `You are simulating an AI answer engine — the kind of system behind ChatGPT's browsing/search mode, Perplexity, or Google's AI Overviews — right after it has crawled one real webpage and is deciding how to use it.

You're given a structured snapshot of that page's actual content (title, headings, intro paragraph, schema types, and an excerpt of the visible text) rather than the fully rendered page.

Imagine the single most natural, realistic question a real user might type that this page seems written to answer. Then decide, exactly as that answer engine genuinely would, whether you'd cite or directly quote this page in your generated answer, use it only as weak supporting context, or skip it entirely in favor of a page that's easier to lift a direct answer from.

${SHARED_RULES}`;

const GEO_SYSTEM = `You are simulating a generative engine — the retrieval-and-synthesis system behind Google's AI Overviews, Perplexity, or an LLM doing retrieval-augmented generation — deciding whether to pull facts from one real webpage into a longer, multi-source synthesized answer.

You're given a structured snapshot of that page's actual content (title, headings, schema types, entity/authorship/freshness signals, and an excerpt of the visible text) rather than the fully rendered page.

Judge this the way that system actually would: can it even see this content, or does it look JS-only/unrendered; can it extract clean, quotable facts and figures from it; can it trust and attribute the claims; is the entity behind the page clearly disambiguated. Decide whether you'd pull facts from this page into a synthesized answer, use it as weak supporting context, or skip it.

${SHARED_RULES}`;

function formatSnapshot(url: string, s: PageSnapshot): string {
	const lines: string[] = [
		`URL: ${url}`,
		`Title: ${s.title || "(none found)"}`,
		`Meta description: ${s.metaDescription || "(none found)"}`,
		`H1: ${s.h1 || "(none found)"}`,
		`Subheadings: ${s.headings.length ? s.headings.join(" | ") : "(none found)"}`,
		`Opening paragraph: ${s.introParagraph || "(none found)"}`,
		`Structured data types present: ${s.jsonLdTypes.length ? s.jsonLdTypes.join(", ") : "(none)"}`,
		`Approx. word count: ${s.wordCount.toLocaleString()}`,
		`Has FAQ/QAPage/HowTo schema: ${s.hasFaqSchema ? "yes" : "no"}`,
		`Has a visible author/byline signal: ${s.hasAuthor ? "yes" : "no"}`,
		`Has a publish/last-updated date signal: ${s.hasFreshnessDate ? "yes" : "no"}`,
		`Contains quotable statistics/figures: ${s.hasStats ? "yes" : "no"}`,
		`Outbound links to external sources: ${s.outboundLinks}`,
		"",
		"Visible text excerpt (may be truncated):",
		s.bodyExcerpt || "(no extractable body text found)",
	];
	return lines.join("\n");
}

export function buildEngineTestPrompt(
	mode: EngineTestMode,
	url: string,
	snapshot: PageSnapshot,
): { system: string; user: string } {
	const system = mode === "geo" ? GEO_SYSTEM : AEO_SYSTEM;
	const user = `${formatSnapshot(url, snapshot)}\n\nGive your verdict now, following the rules in the system prompt.`;
	return { system, user };
}
