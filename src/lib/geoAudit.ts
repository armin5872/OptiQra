import type { CheerioAPI } from "cheerio";
import { issue, pass, type Issue } from "@/lib/auditUtils";
import { collectJsonLdNodes, nodeTypes, sameAsList, type JsonLdNode } from "@/lib/jsonLd";

interface AuditResult {
	issues: Issue[];
	passed: Issue[];
}

// Well-known authoritative/entity-grounding profiles. A sameAs link to any of
// these gives generative engines (and the knowledge graphs many of them lean
// on) a disambiguated entity to anchor citations to. Wikipedia/Wikidata carry
// the most weight since they feed directly into most LLM pretraining/RAG corpora.
const AUTHORITATIVE_SAMEAS_HOSTS = [
	"wikipedia.org",
	"wikidata.org",
	"crunchbase.com",
	"linkedin.com",
	"github.com",
];

const STRONG_SAMEAS_HOSTS = ["wikipedia.org", "wikidata.org"];

// Markers of a client-rendered app shell. Generative-engine crawlers
// (GPTBot, ClaudeBot, PerplexityBot, etc.) generally fetch raw HTML and do
// not execute JavaScript, so content that only appears after hydration is
// invisible to them even if a human visitor sees it fine.
const APP_SHELL_MARKERS = [
	"__next_data__",
	"__nuxt",
	"id=\"root\"",
	"id=\"app\"",
	"ng-version",
	"data-reactroot",
];

const ATTRIBUTION_VERBS =
	/\b(said|says|according to|explains?|explained|noted|notes|argues?|argued|writes|wrote|states?|stated|told)\b/i;

// collectJsonLdNodes, nodeTypes, and sameAsList now live in @/lib/jsonLd
// (shared with aeoAudit.ts, which reasons about the same JSON-LD nodes).


/** Checks whether the page's visible text is likely present in the raw HTML
 *  a non-executing crawler would fetch, as opposed to being injected client-side.
 *
 *  When `renderedText` is supplied (from actually executing the page's
 *  JavaScript via lib/jsRenderer), this upgrades from a heuristic guess to a
 *  measurement: it compares real rendered word count against raw word count
 *  instead of only inferring from script-tag count and app-shell markers. */
function analyzeRenderability(
	$: CheerioAPI,
	html: string,
	renderedText?: string,
): AuditResult {
	const issues: Issue[] = [];
	const passed: Issue[] = [];

	const bodyText = $("body").text().replace(/\s+/g, " ").trim();
	const wordCount = bodyText ? bodyText.split(" ").length : 0;
	const externalScripts = $("script[src]").length;
	const lowerHtml = html.toLowerCase();
	const hasAppShellMarker = APP_SHELL_MARKERS.some((m) =>
		lowerHtml.includes(m),
	);

	if (renderedText !== undefined) {
		const renderedWordCount = renderedText ? renderedText.split(" ").length : 0;
		// A page that gains a lot of words only after JS runs is confirmed
		// (not just suspected) to depend on client-side rendering for its
		// primary content.
		const gainedSubstantialContent =
			renderedWordCount >= 40 &&
			renderedWordCount > wordCount * 2 &&
			renderedWordCount - wordCount >= 30;

		if (gainedSubstantialContent) {
			issues.push(
				issue(
					"geo-js-rendered-content",
					"Page content requires JavaScript to render",
					`Confirmed by actually rendering the page: the raw HTML has about ${wordCount} word${wordCount === 1 ? "" : "s"} of text, but ${renderedWordCount} words are present after JavaScript runs. Most generative-engine crawlers (GPTBot, ClaudeBot, PerplexityBot, Google-Extended) fetch raw HTML and do not execute JavaScript, so the content that only appears after hydration is effectively invisible to them, even though a browser visitor sees it fine.`,
					"Server-render (or statically generate/prerender) the primary content so it's present in the initial HTML response, not just after client-side JavaScript runs.",
					10,
				),
			);
		} else {
			passed.push(
				pass(
					"geo-js-rendered-content",
					`Page's main content is present without relying on client-side JavaScript (confirmed by rendering: ${wordCount} words raw vs ${renderedWordCount} rendered)`,
				),
			);
		}

		return { issues, passed };
	}

	if (wordCount < 40 && (externalScripts >= 3 || hasAppShellMarker)) {
		issues.push(
			issue(
				"geo-js-rendered-content",
				"Page content appears to require JavaScript to render",
				`Only about ${wordCount} word${wordCount === 1 ? "" : "s"} of text are present in the raw HTML, alongside ${externalScripts} external script tag${externalScripts === 1 ? "" : "s"}${hasAppShellMarker ? " and a client-rendered app-shell marker" : ""}. Most generative-engine crawlers (GPTBot, ClaudeBot, PerplexityBot, Google-Extended) fetch raw HTML and do not execute JavaScript, so content that only appears after hydration is effectively invisible to them, even though a browser visitor sees it fine. Turn on "Render JavaScript" in scan options to confirm this rather than estimate it.`,
				"Server-render (or statically generate/prerender) the primary content so it's present in the initial HTML response, not just after client-side JavaScript runs.",
				10,
			),
		);
	} else {
		passed.push(
			pass(
				"geo-js-rendered-content",
				"Page's main content is present in the raw HTML, not dependent on client-side JavaScript",
			),
		);
	}

	return { issues, passed };
}

/** Quantifiable facts (stats, percentages, figures) are one of the
 *  highest-leverage additions for getting quoted by generative engines per
 *  published GEO research (statistics/citation addition outperforms most
 *  other content changes). */
function analyzeStatisticalDensity($: CheerioAPI): AuditResult {
	const issues: Issue[] = [];
	const passed: Issue[] = [];

	const bodyText = $("body").text().replace(/\s+/g, " ").trim();
	const wordCount = bodyText ? bodyText.split(" ").length : 0;
	if (wordCount < 150) return { issues, passed };

	const statMatches =
		bodyText.match(
			/\b\d+(\.\d+)?\s?%|\$\s?\d[\d,.]*|\b\d+(\.\d+)?\s?(percent|million|billion|thousand|times)\b/gi,
		) ?? [];

	if (statMatches.length === 0) {
		issues.push(
			issue(
				"geo-statistics-density",
				"No statistics, percentages, or figures found in the content",
				`The page has roughly ${wordCount.toLocaleString()} words of body text but no detectable numeric statistics, percentages, or dollar figures. Generative engines disproportionately lift and cite pages that back claims with concrete, quotable numbers rather than purely qualitative statements.`,
				"Where relevant, back key claims with specific figures (percentages, counts, dates, dollar amounts) rather than vague qualifiers like \"many\" or \"significant\".",
				5,
			),
		);
	} else {
		passed.push(
			pass(
				"geo-statistics-density",
				`Content includes ${statMatches.length} quotable statistic${statMatches.length === 1 ? "" : "s"}/figure${statMatches.length === 1 ? "" : "s"}`,
			),
		);
	}

	return { issues, passed };
}

/** Directly-attributed quotes ("...", said X) are another content pattern
 *  generative engines favor when selecting what to cite verbatim. */
function analyzeAttributedQuotes($: CheerioAPI): AuditResult {
	const issues: Issue[] = [];
	const passed: Issue[] = [];

	const bodyText = $("body").text().replace(/\s+/g, " ").trim();
	const wordCount = bodyText ? bodyText.split(" ").length : 0;
	if (wordCount < 200) return { issues, passed };

	const quoteSpans = bodyText.match(/["\u201C][^"\u201D]{15,200}["\u201D]/g) ?? [];
	const attributedQuotes = quoteSpans.filter((q) => {
		const idx = bodyText.indexOf(q);
		const window = bodyText.slice(
			Math.max(0, idx - 60),
			idx + q.length + 60,
		);
		return ATTRIBUTION_VERBS.test(window);
	});

	if (attributedQuotes.length > 0) {
		passed.push(
			pass(
				"geo-attributed-quotes",
				`Content includes ${attributedQuotes.length} directly attributed quote${attributedQuotes.length === 1 ? "" : "s"}`,
			),
		);
	} else {
		issues.push(
			issue(
				"geo-attributed-quotes-missing",
				"No directly attributed quotations found",
				"No quoted statements tied to a named source (e.g. '\"...\", said/according to ...') were found in the body text. Attributed quotes give generative engines a low-risk, verifiable snippet to reproduce, which increases the odds a page gets cited rather than paraphrased or skipped.",
				"Where you're citing an expert, customer, study author, or spokesperson, quote them directly and attribute the quote by name.",
				3,
			),
		);
	}

	return { issues, passed };
}

/** Entity grounding: does structured data link this Organization/Person to
 *  an external authoritative profile (Wikipedia, Wikidata, LinkedIn, etc.)
 *  so generative engines can disambiguate who/what the page is about? */
function analyzeEntityGrounding(jsonLdNodes: JsonLdNode[]): AuditResult {
	const issues: Issue[] = [];
	const passed: Issue[] = [];

	const entityNode = jsonLdNodes.find((n) =>
		nodeTypes(n).some((t) =>
			["Organization", "Person", "LocalBusiness", "Corporation"].includes(
				String(t),
			),
		),
	);

	// No entity-type schema on this page at all — nothing to evaluate here;
	// general structured-data presence is already covered by the SEO audit.
	if (!entityNode) return { issues, passed };

	const links = sameAsList(entityNode).map((l) => l.toLowerCase());
	const hasStrong = links.some((l) =>
		STRONG_SAMEAS_HOSTS.some((h) => l.includes(h)),
	);
	const hasAny = links.some((l) =>
		AUTHORITATIVE_SAMEAS_HOSTS.some((h) => l.includes(h)),
	);

	if (hasStrong) {
		passed.push(
			pass(
				"geo-entity-grounding",
				"Organization/Person schema links to Wikipedia or Wikidata for entity disambiguation",
			),
		);
	} else if (hasAny) {
		passed.push(
			pass(
				"geo-entity-grounding",
				"Organization/Person schema includes sameAs links to authoritative external profiles",
			),
		);
	} else {
		issues.push(
			issue(
				"geo-entity-grounding-missing",
				"Entity schema has no sameAs links to authoritative profiles",
				"The page's Organization/Person structured data doesn't include a sameAs property pointing to an external authoritative profile (Wikipedia, Wikidata, LinkedIn, Crunchbase, GitHub, etc.). Generative engines rely heavily on entity grounding to disambiguate brands and people before deciding what to say about them; without it, an AI answer engine may confuse this entity with a similarly named one or simply have less confidence citing it.",
				"Add a sameAs array to your Organization/Person JSON-LD listing this entity's Wikipedia/Wikidata page (if one exists) and other authoritative profiles.",
				6,
			),
		);
	}

	return { issues, passed };
}

/** Tables that lack header cells force a generative engine to guess which
 *  number belongs to which column/row, so they're far less reliable to
 *  extract into a generated answer than properly headed tables. */
function analyzeTableStructure($: CheerioAPI): AuditResult {
	const issues: Issue[] = [];
	const passed: Issue[] = [];

	const tables = $("table");
	if (tables.length === 0) return { issues, passed };

	let unheaded = 0;
	tables.each((_, el) => {
		const $t = $(el);
		const hasHeaderCells =
			$t.find("thead th").length > 0 || $t.find("tr").first().find("th").length > 0;
		if (!hasHeaderCells) unheaded++;
	});

	if (unheaded > 0) {
		issues.push(
			issue(
				"geo-table-headers",
				`${unheaded} of ${tables.length} table${tables.length === 1 ? "" : "s"} on the page ${unheaded === 1 ? "has" : "have"} no header cells`,
				"Tables without <th> header cells (in a <thead> or the first row) don't tell an extraction pipeline what each column or row represents, so generative engines are far less likely to lift the data accurately into a generated answer or comparison.",
				"Add <th scope=\"col\"> (or scope=\"row\") header cells to every data table so each value's meaning is unambiguous without visual layout.",
				4,
			),
		);
	} else {
		passed.push(
			pass(
				"geo-table-headers",
				"Data tables use proper header cells, making them reliable for generative engines to extract",
			),
		);
	}

	return { issues, passed };
}

/** Page-level GEO (Generative Engine Optimization) signals: content patterns
 *  that influence whether generative AI tools (ChatGPT, Gemini, Perplexity,
 *  Google AI Overviews, etc.) can reliably parse, trust, and quote a page's
 *  content when synthesizing an answer. This is deliberately scoped to avoid
 *  overlap with the AEO audit (crawler access, llms.txt, FAQ schema, question
 *  headings, bylines, freshness): GEO here focuses on renderability, factual
 *  density, attribution, entity grounding, and structured-data extractability. */
export function analyzeGEO(
	$: CheerioAPI,
	html: string,
	_targetUrl: string,
	options?: { renderedText?: string },
): { issues: Issue[]; passed: Issue[] } {
	const issues: Issue[] = [];
	const passed: Issue[] = [];

	const jsonLdNodes = collectJsonLdNodes($);

	const results = [
		analyzeRenderability($, html, options?.renderedText),
		analyzeStatisticalDensity($),
		analyzeAttributedQuotes($),
		analyzeEntityGrounding(jsonLdNodes),
		analyzeTableStructure($),
	];

	for (const r of results) {
		issues.push(...r.issues);
		passed.push(...r.passed);
	}

	return { issues, passed };
}
