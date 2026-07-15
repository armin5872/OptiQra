import type { CheerioAPI } from "cheerio";

export type EngineTestMode = "aeo" | "geo";

/** Compact, prompt-ready snapshot of one real page's content — just enough
 *  for a model to genuinely judge citability without shipping the full raw
 *  HTML (cost, noise, boilerplate, script/style tags it doesn't need). */
export interface PageSnapshot {
	title: string;
	metaDescription: string;
	h1: string;
	headings: string[];
	introParagraph: string;
	jsonLdTypes: string[];
	wordCount: number;
	hasFaqSchema: boolean;
	hasAuthor: boolean;
	hasFreshnessDate: boolean;
	hasStats: boolean;
	outboundLinks: number;
	/** Truncated visible body text — the closest thing to "what the engine
	 *  actually read" without sending the whole page. */
	bodyExcerpt: string;
}

const MAX_EXCERPT_CHARS = 2500;
const MAX_HEADINGS = 12;

const STAT_PATTERN =
	/\b\d+(\.\d+)?\s?%|\$\s?\d[\d,.]*|\b\d+(\.\d+)?\s?(percent|million|billion|thousand|times)\b/i;

function collectJsonLdTypes($: CheerioAPI): string[] {
	const types = new Set<string>();
	$('script[type="application/ld+json"]').each((_, el) => {
		const raw = $(el).contents().text().trim();
		if (!raw) return;
		try {
			const parsed = JSON.parse(raw);
			const stack = Array.isArray(parsed) ? [...parsed] : [parsed];
			while (stack.length) {
				const node = stack.pop();
				if (!node || typeof node !== "object") continue;
				if (Array.isArray(node["@graph"])) stack.push(...node["@graph"]);
				const t = node["@type"];
				if (t) (Array.isArray(t) ? t : [t]).forEach((x) => types.add(String(x)));
			}
		} catch {
			// malformed JSON-LD — already flagged elsewhere, just skip it here
		}
	});
	return [...types];
}

export function buildPageSnapshot(
	$: CheerioAPI,
	_html: string,
	targetUrl: string,
): PageSnapshot {
	const title = $("title").first().text().trim();
	const metaDescription = $('meta[name="description"]').attr("content")?.trim() ?? "";
	const h1 = $("h1").first().text().trim();

	const headings = $("h2, h3")
		.map((_, el) => $(el).text().trim())
		.get()
		.filter(Boolean)
		.slice(0, MAX_HEADINGS);

	const introParagraph = $("main p, article p, [role='main'] p, body p")
		.first()
		.text()
		.trim()
		.slice(0, 500);

	const jsonLdTypes = collectJsonLdTypes($);
	const hasFaqSchema = jsonLdTypes.some((t) =>
		["FAQPage", "QAPage", "HowTo"].includes(t),
	);

	const bodyText = $("body").text().replace(/\s+/g, " ").trim();
	const wordCount = bodyText ? bodyText.split(" ").length : 0;

	const hasAuthor =
		Boolean($('meta[name="author"]').attr("content")?.trim()) ||
		Boolean($('meta[property="article:author"]').attr("content")?.trim()) ||
		$('a[rel~="author"], [itemprop="author"]').length > 0;

	const hasFreshnessDate =
		Boolean($('meta[property="article:modified_time"]').attr("content")?.trim()) ||
		Boolean($('meta[name="last-modified"]').attr("content")?.trim()) ||
		$("time[datetime]").length > 0;

	const hasStats = STAT_PATTERN.test(bodyText);

	let origin: string | null = null;
	try {
		origin = new URL(targetUrl).origin;
	} catch {
		origin = null;
	}
	const outboundLinks = $("a[href]").filter((_, el) => {
		const href = $(el).attr("href") || "";
		if (!/^https?:\/\//i.test(href)) return false;
		if (!origin) return true;
		try {
			return new URL(href).origin !== origin;
		} catch {
			return false;
		}
	}).length;

	return {
		title,
		metaDescription,
		h1,
		headings,
		introParagraph,
		jsonLdTypes,
		wordCount,
		hasFaqSchema,
		hasAuthor,
		hasFreshnessDate,
		hasStats,
		outboundLinks,
		bodyExcerpt: bodyText.slice(0, MAX_EXCERPT_CHARS),
	};
}
