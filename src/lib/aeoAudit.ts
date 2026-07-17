import type { CheerioAPI } from "cheerio";
import { issue, pass, type Issue } from "@/lib/auditUtils";
import { collectJsonLdNodes, nodeTypes, type JsonLdNode } from "@/lib/jsonLd";

interface AuditResult {
	issues: Issue[];
	passed: Issue[];
}

const FETCH_HEADERS = {
	"User-Agent": "SiteVitalsBot/1.0 (+https://example.com/bot)",
};

// User-agent tokens used by the major AI answer/assistant crawlers. Robots.txt
// rules that explicitly disallow these keep a site out of ChatGPT, Perplexity,
// Google's AI Overviews, Claude, and similar answer engines even if the site
// is otherwise fully open to traditional search crawlers.
const AI_CRAWLER_AGENTS = [
	{ token: "gptbot", label: "GPTBot (OpenAI)" },
	{ token: "chatgpt-user", label: "ChatGPT-User (OpenAI)" },
	{ token: "oai-searchbot", label: "OAI-SearchBot (OpenAI)" },
	{ token: "google-extended", label: "Google-Extended (Gemini / AI Overviews)" },
	{ token: "perplexitybot", label: "PerplexityBot" },
	{ token: "perplexity-user", label: "Perplexity-User" },
	{ token: "claudebot", label: "ClaudeBot (Anthropic)" },
	{ token: "claude-web", label: "Claude-Web (Anthropic)" },
	{ token: "anthropic-ai", label: "anthropic-ai" },
	{ token: "ccbot", label: "CCBot (Common Crawl)" },
	{ token: "bytespider", label: "Bytespider (ByteDance)" },
	{ token: "amazonbot", label: "Amazonbot" },
	{ token: "applebot-extended", label: "Applebot-Extended (Apple Intelligence)" },
	{ token: "meta-externalagent", label: "Meta-ExternalAgent" },
];

const QUESTION_STARTERS =
	/^(what|why|how|when|where|who|which|can|does|do|is|are|will|should)\b/i;

interface RobotsGroup {
	userAgents: string[];
	rules: { directive: string; value: string }[];
}

function parseRobotsGroups(text: string): RobotsGroup[] {
	const groups: RobotsGroup[] = [];
	let current: RobotsGroup | null = null;

	for (const raw of text.split(/\r?\n/)) {
		const line = raw.split("#")[0].trim();
		if (!line) continue;
		const colon = line.indexOf(":");
		if (colon === -1) continue;

		const directive = line.slice(0, colon).trim().toLowerCase();
		const value = line.slice(colon + 1).trim();
		if (!directive) continue;

		if (directive === "user-agent") {
			if (!current || current.rules.length > 0) {
				current = { userAgents: [value.toLowerCase()], rules: [] };
				groups.push(current);
			} else {
				current.userAgents.push(value.toLowerCase());
			}
		} else if (current) {
			current.rules.push({ directive, value });
		}
	}

	return groups;
}

function isBlocked(groups: RobotsGroup[], agentToken: string): boolean {
	const group = groups.find((g) => g.userAgents.includes(agentToken));
	if (!group) return false;
	return group.rules.some(
		(r) => r.directive === "disallow" && (r.value === "/" || r.value === "/*"),
	);
}

async function analyzeAiCrawlerAccess(targetUrl: string): Promise<AuditResult> {
	const issues: Issue[] = [];
	const passed: Issue[] = [];
	const robotsUrl = new URL("/robots.txt", targetUrl).toString();

	let text: string;
	try {
		const response = await fetch(robotsUrl, {
			redirect: "follow",
			headers: FETCH_HEADERS,
			next: { revalidate: 3600 },
		});
		if (!response.ok) {
			// robots.txt itself is already audited elsewhere (crawlAudit); nothing
			// AEO-specific to add if it's missing or erroring.
			return { issues, passed };
		}
		text = await response.text();
	} catch {
		return { issues, passed };
	}

	const groups = parseRobotsGroups(text);
	if (groups.length === 0) {
		passed.push(
			pass(
				"aeo-ai-crawlers",
				"robots.txt has no rules blocking AI answer-engine crawlers",
			),
		);
		return { issues, passed };
	}

	const blocked = AI_CRAWLER_AGENTS.filter((agent) =>
		isBlocked(groups, agent.token),
	);

	if (blocked.length > 0) {
		issues.push(
			issue(
				"aeo-ai-crawlers-blocked",
				`robots.txt blocks ${blocked.length} AI answer-engine crawler${blocked.length === 1 ? "" : "s"}`,
				`${blocked.map((b) => b.label).join(", ")} ${blocked.length === 1 ? "is" : "are"} disallowed in robots.txt, so this content can't be crawled, cited, or surfaced by that assistant's answers, even if it ranks well in traditional search.`,
				"If you want this content eligible for AI answer engines, remove the Disallow rule for the relevant user-agent(s), or add an explicit Allow group for them.",
				12,
			),
		);
	} else {
		passed.push(
			pass(
				"aeo-ai-crawlers",
				"AI answer-engine crawlers (GPTBot, ClaudeBot, PerplexityBot, Google-Extended, etc.) are not blocked",
			),
		);
	}

	return { issues, passed };
}

// A real browser-style UA so the "normal" request isn't itself mistaken for
// a bot by the bot-management layer we're trying to test against.
const NORMAL_UA =
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const AI_BOT_UA =
	"Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.1; +https://openai.com/gptbot";

/** robots.txt only controls well-behaved crawlers. Many sites additionally
 *  sit behind a CDN/WAF (Cloudflare, etc.) with bot-management rules that
 *  block known AI-crawler user-agents at the network level regardless of
 *  what robots.txt says. This actually issues both requests and compares
 *  status codes, so it catches that class of block, which the robots.txt
 *  parse above cannot see. */
async function analyzeAiCrawlerFirewall(targetUrl: string): Promise<AuditResult> {
	const issues: Issue[] = [];
	const passed: Issue[] = [];

	let normalStatus: number | null = null;
	try {
		const normalRes = await fetch(targetUrl, {
			redirect: "follow",
			headers: { "User-Agent": NORMAL_UA },
			next: { revalidate: 3600 },
		});
		normalStatus = normalRes.status;
	} catch {
		// If we can't even reach the page normally, that's out of scope here
		// (fetchPage/analyzeSEO already surfaces general fetch failures).
		return { issues, passed };
	}

	let botStatus: number | null = null;
	try {
		const botRes = await fetch(targetUrl, {
			redirect: "follow",
			headers: { "User-Agent": AI_BOT_UA },
			next: { revalidate: 3600 },
		});
		botStatus = botRes.status;
	} catch {
		issues.push(
			issue(
				"aeo-ai-crawler-network-block",
				"A request identifying as an AI crawler failed outright",
				"A request sent with GPTBot's user-agent could not complete at all (connection-level failure), while the same request under a normal browser user-agent succeeded. This points to a firewall, CDN, or bot-management rule blocking AI crawlers below the level robots.txt can express.",
				"Check your CDN/WAF (Cloudflare, etc.) bot-management rules for entries blocking GPTBot or AI crawlers generally, and allow the ones you want eligible for AI answers.",
				10,
			),
		);
		return { issues, passed };
	}

	if (normalStatus !== null && botStatus !== null && normalStatus < 400 && botStatus >= 400) {
		issues.push(
			issue(
				"aeo-ai-crawler-firewall-block",
				`Requests with an AI crawler user-agent get HTTP ${botStatus}`,
				`A request using GPTBot's user-agent returned HTTP ${botStatus}, while the identical request with a normal browser user-agent returned ${normalStatus}. robots.txt may allow this crawler, but a firewall, bot-protection service, or CDN rule is blocking it at the network level, which fully excludes this page from that engine's answers regardless of robots.txt.`,
				'Check your CDN/WAF bot-management settings (e.g. Cloudflare "Verified Bots") for rules blocking AI crawlers by user-agent or ASN, and allow the ones you want indexed.',
				10,
			),
		);
	} else {
		passed.push(
			pass(
				"aeo-ai-crawler-firewall",
				"Requests with an AI crawler user-agent (GPTBot) aren't blocked at the network level",
			),
		);
	}

	return { issues, passed };
}

async function analyzeLlmsTxt(targetUrl: string): Promise<AuditResult> {
	const issues: Issue[] = [];
	const passed: Issue[] = [];
	const llmsUrl = new URL("/llms.txt", targetUrl).toString();

	try {
		const response = await fetch(llmsUrl, {
			redirect: "follow",
			headers: FETCH_HEADERS,
			next: { revalidate: 3600 },
		});
		if (response.ok) {
			const text = (await response.text()).trim();
			if (text.length > 0) {
				passed.push(
					pass("aeo-llms-txt", "llms.txt is present with content"),
				);
				return { issues, passed };
			}
		}
	} catch {
		// treat fetch failures the same as "not found" below
	}

	issues.push(
		issue(
			"aeo-llms-txt-missing",
			"No llms.txt file found",
			"llms.txt is an emerging convention that gives AI assistants a concise, curated Markdown map of a site's key pages, similar in spirit to robots.txt for crawl rules. Its absence isn't penalized by search engines, but it's a low-cost signal several answer engines are starting to look for.",
			"Add a plain-text /llms.txt with an H1 site name, a one-line summary, and a linked list of your most important pages.",
			3,
		),
	);

	return { issues, passed };
}

// collectJsonLdNodes and nodeTypes now live in @/lib/jsonLd (shared with
// geoAudit.ts, which reasons about the same JSON-LD nodes).

export function analyzeAEO(
	$: CheerioAPI,
	html: string,
	targetUrl: string,
): { issues: Issue[]; passed: Issue[] } {
	const issues: Issue[] = [];
	const passed: Issue[] = [];

	// --- Direct-answer schema (FAQPage / QAPage / HowTo) ---
	const jsonLdNodes = collectJsonLdNodes($);
	const hasAnswerSchema = jsonLdNodes.some((n) =>
		nodeTypes(n).some((t) =>
			["FAQPage", "QAPage", "HowTo"].includes(String(t)),
		),
	);

	const headingTexts = $("h2, h3")
		.map((_, el) => $(el).text().trim())
		.get()
		.filter(Boolean);
	const questionHeadings = headingTexts.filter(
		(t) => t.endsWith("?") || QUESTION_STARTERS.test(t),
	);

	if (hasAnswerSchema) {
		passed.push(
			pass(
				"aeo-answer-schema",
				"Page uses FAQPage/QAPage/HowTo structured data that answer engines can lift directly",
			),
		);
	} else if (questionHeadings.length > 0) {
		issues.push(
			issue(
				"aeo-answer-schema-missing",
				"Q&A-style content isn't marked up as FAQPage/QAPage",
				`Found ${questionHeadings.length} question-style heading${questionHeadings.length === 1 ? "" : "s"} (e.g. "${questionHeadings[0].slice(0, 70)}") but no matching FAQPage, QAPage, or HowTo structured data. Answer engines strongly favor content that's explicitly marked up this way when choosing what to quote or cite.`,
				"Wrap existing question/answer content in FAQPage (or HowTo for step-by-step content) JSON-LD so each question and its answer are machine-readable.",
				7,
			),
		);
	} else {
		issues.push(
			issue(
				"aeo-no-qa-content",
				"No question-and-answer content or schema found",
				"Answer engines (ChatGPT, Perplexity, Google AI Overviews) disproportionately cite pages that explicitly answer a question near the top of the content. This page has neither Q&A-phrased headings nor FAQPage/HowTo schema.",
				"Add a short FAQ or Q&A section covering the questions people actually ask about this topic, marked up with FAQPage structured data.",
				4,
			),
		);
	}

	// --- Question-phrased subheadings (independent of schema) ---
	if (headingTexts.length >= 3) {
		if (questionHeadings.length === 0) {
			issues.push(
				issue(
					"aeo-question-headings",
					"No subheadings are phrased as questions",
					"None of the page's H2/H3 headings are phrased as direct questions. Answer engines tend to extract a heading and the paragraph beneath it verbatim when the heading itself matches how people phrase queries.",
					'Rephrase a few section headings as the questions they answer, e.g. "How much does it cost?" instead of "Pricing".',
					5,
				),
			);
		} else {
			passed.push(
				pass(
					"aeo-question-headings",
					`${questionHeadings.length} of ${headingTexts.length} subheadings are phrased as questions`,
				),
			);
		}
	}

	// --- Clear intro/direct-answer paragraph ---
	const introParagraph = $("main p, article p, [role='main'] p, body p")
		.first()
		.text()
		.trim();
	if (!introParagraph) {
		issues.push(
			issue(
				"aeo-intro-paragraph",
				"No clear introductory paragraph found",
				"There's no <p> element near the top of the page. Answer engines look for a short, self-contained paragraph early in the content that directly states the answer or topic before pulling in supporting detail.",
				"Open the main content with a concise paragraph (2–3 sentences) that directly answers the page's core question before going into detail.",
				6,
			),
		);
	} else if (introParagraph.length < 20) {
		issues.push(
			issue(
				"aeo-intro-paragraph-thin",
				"Opening paragraph is too short to serve as a direct answer",
				`The first paragraph is only ${introParagraph.length} characters ("${introParagraph}"), too short to give an answer engine a self-contained statement to quote.`,
				"Expand the opening paragraph to 2–3 sentences that fully answer the page's main question in plain language.",
				4,
			),
		);
	} else {
		passed.push(
			pass(
				"aeo-intro-paragraph",
				"Page opens with a substantive paragraph an answer engine can quote",
			),
		);
	}

	// --- Scannable structure: lists and tables ---
	const bodyText = $("body").text().replace(/\s+/g, " ").trim();
	const wordCount = bodyText ? bodyText.split(" ").length : 0;
	const listAndTableItems = $("ul li, ol li, table").length;
	if (wordCount > 300 && listAndTableItems === 0) {
		issues.push(
			issue(
				"aeo-scannable-structure",
				"No lists or tables found in substantial content",
				`The page has roughly ${wordCount.toLocaleString()} words but no <ul>/<ol> lists or <table> elements. Answer engines preferentially extract and summarize list- and table-formatted content over long unbroken paragraphs.`,
				"Break out steps, features, comparisons, or specs into bulleted/numbered lists or a table where it makes sense.",
				5,
			),
		);
	} else if (listAndTableItems > 0) {
		passed.push(
			pass(
				"aeo-scannable-structure",
				"Page includes list or table structure that's easy for answer engines to extract",
			),
		);
	}

	// --- Table of contents for long-form content ---
	// RAG/answer-engine extraction and human scanning both benefit from being
	// able to jump straight to a subsection instead of scanning a long page;
	// only worth flagging once a page is long enough to actually need one.
	const h2h3Count = $("h2, h3").length;
	if (wordCount > 1200 && h2h3Count >= 4) {
		const headingIds = $("h2[id], h3[id]").length;
		const anchorLinks = $('a[href^="#"]').length;
		if (headingIds === 0 || anchorLinks === 0) {
			issues.push(
				issue(
					"aeo-toc-missing",
					"Long page has no jump-to-section navigation",
					`The page has roughly ${wordCount.toLocaleString()} words across ${h2h3Count} sections but no linked table of contents (anchor links pointing at heading ids). Answer engines and readers both benefit from being able to jump straight to a relevant subsection instead of scanning the whole page.`,
					"Add id attributes to your H2/H3 headings and a short linked table of contents near the top of long-form content.",
					3,
				),
			);
		} else {
			passed.push(
				pass(
					"aeo-toc",
					"Long-form content includes a jump-to-section table of contents",
				),
			);
		}
	}

	// --- Speakable schema (voice assistants / Google Assistant) ---
	// Optional enhancement, so it's only surfaced (and at low weight) when the
	// page has already invested in direct-answer schema, where it's most
	// relevant rather than a generic nag on every page.
	const hasSpeakable = jsonLdNodes.some((n) => {
		const s = n["speakable"];
		return !!s && (typeof s === "object" || typeof s === "string");
	});
	if (hasAnswerSchema && !hasSpeakable) {
		issues.push(
			issue(
				"aeo-speakable-missing",
				"No Speakable schema for voice assistants",
				'The page has FAQ/QA/HowTo schema but no SpeakableSpecification marking which sections are suitable for text-to-speech playback by voice assistants. This is an optional enhancement, not a ranking requirement.',
				'Add a "speakable": { "@type": "SpeakableSpecification", "cssSelector": [...] } property to your WebPage/Article JSON-LD pointing at the summary or answer sections.',
				2,
			),
		);
	} else if (hasSpeakable) {
		passed.push(
			pass("aeo-speakable", "Page marks speakable sections for voice assistants"),
		);
	}

	// --- Author / byline signal ---
	const metaAuthor = $('meta[name="author"]').attr("content")?.trim();
	const articleAuthor = $('meta[property="article:author"]')
		.attr("content")
		?.trim();
	const jsonLdAuthor = jsonLdNodes.some((n) => {
		const a = n["author"];
		if (!a) return false;
		if (typeof a === "string") return a.trim().length > 0;
		const hasName = (v: unknown): boolean =>
			!!v && typeof v === "object" && "name" in v && !!(v as { name?: unknown }).name;
		if (Array.isArray(a)) return a.some(hasName);
		return hasName(a);
	});
	const relAuthorLink = $('a[rel~="author"], [itemprop="author"]').length > 0;

	if (metaAuthor || articleAuthor || jsonLdAuthor || relAuthorLink) {
		passed.push(
			pass("aeo-author", "Page identifies an author or byline"),
		);
	} else {
		issues.push(
			issue(
				"aeo-author-missing",
				"No author or byline found",
				"No author meta tag, article:author, rel=author link, or JSON-LD author property was found. Answer engines weigh clear authorship as part of judging whether content is trustworthy enough to cite.",
				"Add a visible byline plus matching author markup (meta author, or an author property in your Article/BlogPosting JSON-LD).",
				5,
			),
		);
	}

	// --- Freshness / last-updated signal ---
	const metaModified =
		$('meta[property="article:modified_time"]').attr("content")?.trim() ||
		$('meta[name="last-modified"]').attr("content")?.trim();
	const jsonLdDate = jsonLdNodes.some((n) => n["dateModified"] || n["datePublished"]);
	const timeElement = $("time[datetime]").length > 0;

	if (metaModified || jsonLdDate || timeElement) {
		passed.push(
			pass(
				"aeo-freshness",
				"Page exposes a publish or last-updated date",
			),
		);
	} else {
		issues.push(
			issue(
				"aeo-freshness-missing",
				"No publish or last-updated date found",
				"No article:modified_time meta tag, <time datetime> element, or dateModified/datePublished in structured data was found. Answer engines favor demonstrably current content, especially for anything time-sensitive.",
				"Add a visible last-updated date wrapped in a <time datetime=\"...\"> element, and set dateModified in your JSON-LD.",
				6,
			),
		);
	}

	// --- Semantic content container ---
	const hasSemanticContainer =
		$("main").length > 0 ||
		$("article").length > 0 ||
		$('[role="main"]').length > 0;
	if (!hasSemanticContainer) {
		issues.push(
			issue(
				"aeo-semantic-container",
				"No <main> or <article> element wraps the content",
				"Without a <main>, <article>, or role=\"main\" landmark, crawlers have to guess where navigation/boilerplate ends and the actual answerable content begins.",
				'Wrap the primary content in a single <main> (or <article> for individual posts) element.',
				6,
			),
		);
	} else {
		passed.push(
			pass(
				"aeo-semantic-container",
				"Content is wrapped in a semantic main/article landmark",
			),
		);
	}

	// --- Outbound citations ---
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

	if (wordCount > 300 && outboundLinks === 0) {
		issues.push(
			issue(
				"aeo-citations",
				"No outbound links to external sources",
				"The page makes claims without linking out to any external source, study, or reference. Citing sources is one of the signals answer engines use to gauge whether a page is safe to quote as an authority.",
				"Where relevant, link to the original sources, studies, or documentation backing up factual claims.",
				3,
			),
		);
	} else if (outboundLinks > 0) {
		passed.push(
			pass("aeo-citations", "Page links out to external sources"),
		);
	}

	return { issues, passed };
}

/** Site-wide AEO signals (robots.txt AI-crawler rules, llms.txt) that only
 *  need checking once per site rather than once per crawled page. */
export async function analyzeAEOSiteSignals(
	targetUrl: string,
): Promise<AuditResult> {
	const issues: Issue[] = [];
	const passed: Issue[] = [];

	const [crawlerAudit, llmsAudit, firewallAudit] = await Promise.all([
		analyzeAiCrawlerAccess(targetUrl),
		analyzeLlmsTxt(targetUrl),
		analyzeAiCrawlerFirewall(targetUrl),
	]);

	issues.push(...crawlerAudit.issues, ...llmsAudit.issues, ...firewallAudit.issues);
	passed.push(...crawlerAudit.passed, ...llmsAudit.passed, ...firewallAudit.passed);

	return { issues, passed };
}
