import type { CheerioAPI } from "cheerio";
import { issue, pass, type Issue } from "@/lib/auditUtils";

interface AuditResult {
	issues: Issue[];
	passed: Issue[];
}

// A reasonably broad list of common schema.org types. Anything outside this
// list isn't necessarily wrong, but it's worth flagging so an author can
// double check it's an intentional/real schema.org type rather than a typo.
const KNOWN_SCHEMA_TYPES = new Set([
	"Thing",
	"Organization",
	"Corporation",
	"LocalBusiness",
	"WebSite",
	"WebPage",
	"WebApplication",
	"BreadcrumbList",
	"ListItem",
	"ItemList",
	"FAQPage",
	"Question",
	"Answer",
	"Article",
	"NewsArticle",
	"BlogPosting",
	"TechArticle",
	"Report",
	"Product",
	"Offer",
	"AggregateOffer",
	"AggregateRating",
	"Review",
	"Rating",
	"Person",
	"Event",
	"MusicEvent",
	"SportsEvent",
	"BusinessEvent",
	"Place",
	"PostalAddress",
	"GeoCoordinates",
	"ImageObject",
	"VideoObject",
	"SearchAction",
	"EntryPoint",
	"ContactPoint",
	"Brand",
	"Recipe",
	"HowTo",
	"HowToStep",
	"HowToSection",
	"JobPosting",
	"Course",
	"Book",
	"Movie",
	"MusicRecording",
	"SoftwareApplication",
	"Service",
	"Restaurant",
	"Store",
	"Hotel",
	"MedicalOrganization",
	"EducationalOrganization",
	"GovernmentOrganization",
	"SiteNavigationElement",
	"CollectionPage",
	"ProfilePage",
	"QAPage",
	"ItemPage",
	"AboutPage",
	"ContactPage",
	"VideoGame",
	"CreativeWork",
	"DataFeed",
	"Dataset",
	"Comment",
	"DiscussionForumPosting",
]);

const REQUIRED_PROPS: Record<
	string,
	{ required: string[]; recommended?: string[] }
> = {
	Organization: { required: ["name", "url"], recommended: ["logo", "sameAs"] },
	Corporation: { required: ["name", "url"], recommended: ["logo", "sameAs"] },
	WebSite: { required: ["name", "url"] },
	BreadcrumbList: { required: ["itemListElement"] },
	FAQPage: { required: ["mainEntity"] },
	Article: {
		required: ["headline", "author", "datePublished"],
		recommended: ["image", "publisher"],
	},
	NewsArticle: {
		required: ["headline", "author", "datePublished"],
		recommended: ["image", "publisher"],
	},
	BlogPosting: {
		required: ["headline", "author", "datePublished"],
		recommended: ["image", "publisher"],
	},
	Product: {
		required: ["name"],
		recommended: ["image", "description", "offers"],
	},
	LocalBusiness: {
		required: ["name", "address"],
		recommended: ["telephone", "openingHoursSpecification", "geo"],
	},
	Person: { required: ["name"] },
	Event: { required: ["name", "startDate", "location"] },
};

const ARTICLE_TYPES = ["Article", "NewsArticle", "BlogPosting"];

function asArray<T>(value: T | T[] | undefined | null): T[] {
	if (value === undefined || value === null) return [];
	return Array.isArray(value) ? value : [value];
}

function getTypes(node: any): string[] {
	return asArray(node?.["@type"]).filter((t) => typeof t === "string");
}

function hasProp(node: any, prop: string): boolean {
	const val = node?.[prop];
	if (val === undefined || val === null) return false;
	if (typeof val === "string") return val.trim().length > 0;
	if (Array.isArray(val)) return val.length > 0;
	return true;
}

function collectNodes(parsed: any, out: any[]) {
	if (parsed === null || typeof parsed !== "object") return;
	if (Array.isArray(parsed)) {
		parsed.forEach((item) => collectNodes(item, out));
		return;
	}
	if (Array.isArray(parsed["@graph"])) {
		parsed["@graph"].forEach((item: unknown) => collectNodes(item, out));
	}
	if (parsed["@type"] || parsed["@id"]) {
		out.push(parsed);
	}
}

function validateOffers(offers: any): boolean {
	const list = asArray(offers);
	if (list.length === 0) return false;
	return list.every((o) => hasProp(o, "price") && hasProp(o, "priceCurrency"));
}

function validateSearchAction(node: any): { valid: boolean; reason?: string } {
	const actions = asArray(node?.potentialAction).filter((a) =>
		getTypes(a).includes("SearchAction"),
	);
	if (actions.length === 0) return { valid: false, reason: "missing" };
	const action = actions[0];
	const target = action?.target;
	const targetUrl = typeof target === "string" ? target : target?.urlTemplate;
	const queryInput = action?.["query-input"];
	if (!targetUrl || !/\{.*search_term_string.*\}/.test(String(targetUrl))) {
		return { valid: false, reason: "target" };
	}
	if (!queryInput || !/search_term_string/.test(String(queryInput))) {
		return { valid: false, reason: "query-input" };
	}
	return { valid: true };
}

function validateBreadcrumb(node: any): string[] {
	const problems: string[] = [];
	const items = asArray(node.itemListElement);
	if (items.length === 0) {
		problems.push("itemListElement is empty");
		return problems;
	}
	items.forEach((item: any, idx: number) => {
		if (item?.position === undefined)
			problems.push(`item ${idx + 1} is missing "position"`);
		const hasName = hasProp(item, "name") || hasProp(item?.item, "name");
		if (!hasName) problems.push(`item ${idx + 1} is missing "name"`);
		if (!hasProp(item, "item") && typeof item?.item !== "string")
			problems.push(`item ${idx + 1} is missing "item" URL`);
	});
	return problems;
}

function validateFaqPage(node: any): string[] {
	const problems: string[] = [];
	const questions = asArray(node.mainEntity);
	if (questions.length === 0) {
		problems.push("mainEntity has no Question entries");
		return problems;
	}
	questions.forEach((q: any, idx: number) => {
		if (!getTypes(q).includes("Question"))
			problems.push(`entry ${idx + 1} is not typed as "Question"`);
		if (!hasProp(q, "name"))
			problems.push(`question ${idx + 1} is missing "name"`);
		const answer = q?.acceptedAnswer;
		if (!answer || !hasProp(answer, "text"))
			problems.push(`question ${idx + 1} is missing acceptedAnswer.text`);
	});
	return problems;
}

export function analyzeStructuredData(
	$: CheerioAPI,
	html: string,
): AuditResult {
	const issues: Issue[] = [];
	const passed: Issue[] = [];

	// ---------- JSON-LD ----------
	const ldJsonScripts = $('script[type="application/ld+json"]');
	const nodes: any[] = [];
	let parseErrors = 0;
	let emptyScripts = 0;

	ldJsonScripts.each((_, el) => {
		const raw = $(el).contents().text().trim();
		if (!raw) {
			emptyScripts++;
			return;
		}
		try {
			const parsed = JSON.parse(raw);
			collectNodes(parsed, nodes);
		} catch {
			parseErrors++;
		}
	});

	if (ldJsonScripts.length === 0) {
		issues.push(
			issue(
				"jsonld-missing",
				"No JSON-LD structured data found",
				'No <script type="application/ld+json"> blocks were found on the page. JSON-LD is the format Google recommends for rich results (Organization, WebSite, Breadcrumbs, FAQs, Articles, Products, etc.).',
				"Add JSON-LD structured data describing the page, e.g. Organization/WebSite on the homepage, Article on blog posts, or Product on product pages.",
				8,
			),
		);
	} else {
		passed.push(
			pass(
				"jsonld-present",
				`${ldJsonScripts.length} JSON-LD block${ldJsonScripts.length === 1 ? "" : "s"} found`,
			),
		);
	}

	if (parseErrors > 0) {
		issues.push(
			issue(
				"jsonld-parse-error",
				`${parseErrors} JSON-LD block${parseErrors === 1 ? "" : "s"} failed to parse`,
				'One or more <script type="application/ld+json"> tags contain invalid JSON, so search engines will silently ignore them.',
				"Validate JSON-LD with a linter (or the Rich Results Test) and fix syntax errors like trailing commas or unescaped quotes.",
				10,
				"critical",
			),
		);
	}

	if (emptyScripts > 0) {
		issues.push(
			issue(
				"jsonld-empty",
				`${emptyScripts} empty JSON-LD script tag${emptyScripts === 1 ? "" : "s"}`,
				'A <script type="application/ld+json"> tag exists but contains no content.',
				"Remove empty JSON-LD script tags or populate them with valid structured data.",
				3,
			),
		);
	}

	// ---------- @context / @type sanity ----------
	let missingContext = 0;
	let missingType = 0;
	const invalidTypeNames = new Set<string>();
	const foundTypes = new Set<string>();

	nodes.forEach((node) => {
		const context = node["@context"];
		const contextStr =
			Array.isArray(context) ? context.join(" ") : String(context || "");
		if (!/schema\.org/i.test(contextStr) && !node["@graph"]) {
			// Only flag top-level-ish nodes with a @type but no schema.org context
			if (node["@type"]) missingContext++;
		}

		const types = getTypes(node);
		if (types.length === 0) {
			missingType++;
			return;
		}
		types.forEach((t) => {
			foundTypes.add(t);
			const bare = t.replace(/^https?:\/\/schema\.org\//i, "");
			if (!/^[A-Z][A-Za-z0-9]*$/.test(bare) || !KNOWN_SCHEMA_TYPES.has(bare)) {
				invalidTypeNames.add(t);
			}
		});
	});

	if (missingType > 0) {
		issues.push(
			issue(
				"schema-missing-type",
				`${missingType} JSON-LD node${missingType === 1 ? "" : "s"} missing "@type"`,
				'Every JSON-LD node needs an "@type" so search engines know which schema.org vocabulary applies.',
				'Add an appropriate "@type" (e.g. "Organization", "Article", "Product") to each JSON-LD node.',
				8,
				"critical",
			),
		);
	}

	if (missingContext > 0) {
		issues.push(
			issue(
				"schema-missing-context",
				`${missingContext} JSON-LD node${missingContext === 1 ? "" : "s"} missing a schema.org "@context"`,
				'Without "@context": "https://schema.org", the "@type" values are ambiguous and may be ignored by search engines.',
				'Add "@context": "https://schema.org" to each top-level JSON-LD object.',
				6,
			),
		);
	}

	if (invalidTypeNames.size > 0) {
		issues.push(
			issue(
				"schema-invalid-type",
				`Unrecognized schema type${invalidTypeNames.size === 1 ? "" : "s"}: ${[...invalidTypeNames].slice(0, 3).join(", ")}`,
				"These \"@type\" values don't match standard schema.org type names (case-sensitive), which likely means a typo or an invalid/custom type that rich results won't recognize.",
				'Check spelling/casing against schema.org and use a valid registered type (e.g. "LocalBusiness", not "localbusiness" or "Local_Business").',
				7,
			),
		);
	}

	// ---------- Per-type required property checks ----------
	const checkedTypes = new Set<string>();

	nodes.forEach((node) => {
		const types = getTypes(node);

		types.forEach((type) => {
			if (ARTICLE_TYPES.includes(type)) {
				const req = REQUIRED_PROPS[type];
				const missing = req.required.filter((p) => !hasProp(node, p));
				checkedTypes.add("Article");
				if (missing.length > 0) {
					issues.push(
						issue(
							`schema-article-required-${type}`,
							`${type} schema is missing required propert${missing.length === 1 ? "y" : "ies"}: ${missing.join(", ")}`,
							`Article-family rich results require ${req.required.join(", ")}. Missing fields can prevent the article rich result from showing.`,
							`Add ${missing.join(", ")} to the ${type} JSON-LD block.`,
							missing.length > 1 ? 9 : 6,
						),
					);
				} else {
					passed.push(
						pass(
							`schema-article-${type}`,
							`${type} schema has all required properties`,
						),
					);
				}
				return;
			}

			if (type === "Organization" || type === "Corporation") {
				checkedTypes.add("Organization");
				const req = REQUIRED_PROPS.Organization;
				const missing = req.required.filter((p) => !hasProp(node, p));
				if (missing.length > 0) {
					issues.push(
						issue(
							"schema-org-required",
							`Organization schema is missing required propert${missing.length === 1 ? "y" : "ies"}: ${missing.join(", ")}`,
							'Organization schema needs at least "name" and "url" to be usable for knowledge panel / logo rich results.',
							`Add ${missing.join(", ")} to the Organization JSON-LD block.`,
							missing.length > 1 ? 8 : 5,
						),
					);
				} else {
					passed.push(
						pass("schema-org", "Organization schema has required properties"),
					);
					if (!hasProp(node, "logo")) {
						issues.push(
							issue(
								"schema-org-logo",
								'Organization schema is missing "logo"',
								"Google uses the Organization logo for knowledge panels and search result branding.",
								'Add a "logo" property with an absolute image URL to the Organization schema.',
								3,
							),
						);
					}
				}
				return;
			}

			if (type === "WebSite") {
				checkedTypes.add("WebSite");
				const req = REQUIRED_PROPS.WebSite;
				const missing = req.required.filter((p) => !hasProp(node, p));
				if (missing.length > 0) {
					issues.push(
						issue(
							"schema-website-required",
							`WebSite schema is missing required propert${missing.length === 1 ? "y" : "ies"}: ${missing.join(", ")}`,
							'WebSite schema needs "name" and "url" at minimum.',
							`Add ${missing.join(", ")} to the WebSite JSON-LD block.`,
							6,
						),
					);
				} else {
					passed.push(
						pass("schema-website", "WebSite schema has required properties"),
					);
				}

				const searchAction = validateSearchAction(node);
				checkedTypes.add("SearchAction");
				if (!searchAction.valid) {
					if (searchAction.reason === "missing") {
						issues.push(
							issue(
								"schema-searchaction-missing",
								"WebSite schema has no SearchAction (sitelinks search box)",
								"Without a potentialAction/SearchAction, Google cannot show a sitelinks search box for your site in search results.",
								'Add a potentialAction with @type "SearchAction", a target urlTemplate containing "{search_term_string}", and query-input "required name=search_term_string".',
								4,
							),
						);
					} else {
						issues.push(
							issue(
								"schema-searchaction-invalid",
								`SearchAction is malformed (${searchAction.reason === "target" ? "invalid target/urlTemplate" : "invalid query-input"})`,
								'The SearchAction target must contain "{search_term_string}" as a placeholder and query-input must reference "search_term_string".',
								'Set target.urlTemplate to something like "https://example.com/search?q={search_term_string}" and query-input to "required name=search_term_string".',
								5,
							),
						);
					}
				} else {
					passed.push(
						pass(
							"schema-searchaction",
							"SearchAction is present and correctly configured",
						),
					);
				}
				return;
			}

			if (type === "BreadcrumbList") {
				checkedTypes.add("BreadcrumbList");
				const problems = validateBreadcrumb(node);
				if (problems.length > 0) {
					issues.push(
						issue(
							"schema-breadcrumb-invalid",
							`BreadcrumbList schema has ${problems.length} issue${problems.length === 1 ? "" : "s"}`,
							`Breadcrumb rich results require each itemListElement to have position, name, and item: ${problems.slice(0, 3).join("; ")}.`,
							'Ensure every itemListElement has "position" (integer), "name", and an absolute "item" URL.',
							problems.length > 1 ? 8 : 5,
						),
					);
				} else {
					passed.push(
						pass("schema-breadcrumb", "BreadcrumbList schema is valid"),
					);
				}
				return;
			}

			if (type === "FAQPage") {
				checkedTypes.add("FAQPage");
				const problems = validateFaqPage(node);
				if (problems.length > 0) {
					issues.push(
						issue(
							"schema-faq-invalid",
							`FAQPage schema has ${problems.length} issue${problems.length === 1 ? "" : "s"}`,
							`FAQ rich results require each mainEntity Question to have a name and an acceptedAnswer.text: ${problems.slice(0, 3).join("; ")}.`,
							'Ensure every Question has "name" and an acceptedAnswer with "text".',
							problems.length > 1 ? 8 : 5,
						),
					);
				} else {
					passed.push(pass("schema-faq", "FAQPage schema is valid"));
				}
				return;
			}

			if (type === "Product") {
				checkedTypes.add("Product");
				const req = REQUIRED_PROPS.Product;
				const missing = req.required.filter((p) => !hasProp(node, p));
				if (missing.length > 0) {
					issues.push(
						issue(
							"schema-product-required",
							`Product schema is missing required propert${missing.length === 1 ? "y" : "ies"}: ${missing.join(", ")}`,
							'Product schema needs at least a "name" to be valid.',
							`Add ${missing.join(", ")} to the Product JSON-LD block.`,
							6,
						),
					);
				}
				const recMissing = (req.recommended || []).filter(
					(p) => !hasProp(node, p),
				);
				if (
					recMissing.includes("offers") ||
					(hasProp(node, "offers") && !validateOffers(node.offers))
				) {
					issues.push(
						issue(
							"schema-product-offers",
							'Product schema is missing a valid "offers" with price/priceCurrency',
							'Google requires Product rich results to include an offers object with "price" and "priceCurrency" (or an aggregateOffer) to show pricing.',
							'Add an "offers" object with "price", "priceCurrency", and "availability".',
							6,
						),
					);
				}
				if (recMissing.includes("image")) {
					issues.push(
						issue(
							"schema-product-image",
							'Product schema is missing "image"',
							"Product rich results display an image; without it, the listing looks incomplete.",
							'Add an "image" property with one or more absolute image URLs.',
							3,
						),
					);
				}
				if (missing.length === 0) {
					passed.push(
						pass("schema-product", "Product schema has required properties"),
					);
				}
				return;
			}

			if (
				type === "LocalBusiness" ||
				(KNOWN_SCHEMA_TYPES.has(type) && type.endsWith("Business"))
			) {
				checkedTypes.add("LocalBusiness");
				const req = REQUIRED_PROPS.LocalBusiness;
				const missing = req.required.filter((p) => !hasProp(node, p));
				if (missing.length > 0) {
					issues.push(
						issue(
							"schema-localbusiness-required",
							`LocalBusiness schema is missing required propert${missing.length === 1 ? "y" : "ies"}: ${missing.join(", ")}`,
							'LocalBusiness schema needs "name" and "address" for local search / map pack eligibility.',
							`Add ${missing.join(", ")} to the LocalBusiness JSON-LD block.`,
							7,
						),
					);
				} else {
					passed.push(
						pass(
							"schema-localbusiness",
							"LocalBusiness schema has required properties",
						),
					);
				}
				if (!hasProp(node, "telephone")) {
					issues.push(
						issue(
							"schema-localbusiness-phone",
							'LocalBusiness schema is missing "telephone"',
							"A phone number helps LocalBusiness listings qualify for click-to-call rich results.",
							'Add a "telephone" property in E.164 or national format.',
							3,
						),
					);
				}
				return;
			}

			if (type === "Person") {
				checkedTypes.add("Person");
				const req = REQUIRED_PROPS.Person;
				const missing = req.required.filter((p) => !hasProp(node, p));
				if (missing.length > 0) {
					issues.push(
						issue(
							"schema-person-required",
							"Person schema is missing required property: name",
							'Person schema is not useful to search engines without at least a "name".',
							'Add a "name" property to the Person JSON-LD block.',
							5,
						),
					);
				} else {
					passed.push(
						pass("schema-person", "Person schema has required properties"),
					);
				}
				return;
			}

			if (type === "Event") {
				checkedTypes.add("Event");
				const req = REQUIRED_PROPS.Event;
				const missing = req.required.filter((p) => !hasProp(node, p));
				if (missing.length > 0) {
					issues.push(
						issue(
							"schema-event-required",
							`Event schema is missing required propert${missing.length === 1 ? "y" : "ies"}: ${missing.join(", ")}`,
							'Event rich results require "name", "startDate", and "location" at minimum.',
							`Add ${missing.join(", ")} to the Event JSON-LD block.`,
							missing.length > 1 ? 8 : 5,
						),
					);
				} else {
					passed.push(
						pass("schema-event", "Event schema has required properties"),
					);
				}
				return;
			}
		});
	});

	// ---------- Microdata ----------
	const itemscopeEls = $("[itemscope]");
	if (itemscopeEls.length > 0) {
		let missingItemtype = 0;
		let invalidItemtype = 0;
		itemscopeEls.each((_, el) => {
			const itemtype = $(el).attr("itemtype");
			if (!itemtype) {
				missingItemtype++;
				return;
			}
			if (!/^https?:\/\/schema\.org\//i.test(itemtype)) invalidItemtype++;
		});

		if (missingItemtype > 0) {
			issues.push(
				issue(
					"microdata-missing-itemtype",
					`${missingItemtype} microdata element${missingItemtype === 1 ? "" : "s"} missing "itemtype"`,
					"Elements using itemscope without a matching itemtype have no defined vocabulary, so parsers can't interpret the properties inside them.",
					'Add an itemtype attribute (e.g. itemtype="https://schema.org/Product") to every itemscope element.',
					5,
				),
			);
		}
		if (invalidItemtype > 0) {
			issues.push(
				issue(
					"microdata-invalid-itemtype",
					`${invalidItemtype} microdata element${invalidItemtype === 1 ? "" : "s"} use a non-schema.org itemtype`,
					"itemtype values should be absolute schema.org URLs (https://schema.org/Type) for search engines to recognize them.",
					"Point itemtype attributes at https://schema.org/ type URLs.",
					4,
				),
			);
		}
		if (missingItemtype === 0 && invalidItemtype === 0) {
			passed.push(
				pass(
					"microdata",
					`Microdata found on ${itemscopeEls.length} element${itemscopeEls.length === 1 ? "" : "s"} and looks well-formed`,
				),
			);
		}
	}

	// ---------- RDFa ----------
	const rdfaTypeofEls = $("[typeof]");
	if (rdfaTypeofEls.length > 0) {
		const hasVocab = $("html[vocab], body[vocab], [vocab]").length > 0;
		if (!hasVocab) {
			issues.push(
				issue(
					"rdfa-missing-vocab",
					'RDFa "typeof" attributes found without a "vocab" declaration',
					'RDFa typeof values are ambiguous without a vocab attribute (typically vocab="https://schema.org/") establishing which vocabulary the types come from.',
					'Add vocab="https://schema.org/" to the <html> or a wrapping element that contains the RDFa markup.',
					4,
				),
			);
		} else {
			passed.push(
				pass(
					"rdfa",
					`RDFa markup found on ${rdfaTypeofEls.length} element${rdfaTypeofEls.length === 1 ? "" : "s"} with a vocab declared`,
				),
			);
		}
	}

	// ---------- Overall summary ----------
	if (
		nodes.length === 0 &&
		itemscopeEls.length === 0 &&
		rdfaTypeofEls.length === 0
	) {
		issues.push(
			issue(
				"structured-data-none",
				"No structured data detected on the page (JSON-LD, Microdata, or RDFa)",
				"Without any structured data, this page is not eligible for rich results like sitelinks search boxes, breadcrumbs, FAQs, product pricing, or article cards.",
				"Add JSON-LD structured data appropriate to the page type (Organization/WebSite on the homepage, Article on posts, Product on product pages, etc.).",
				8,
			),
		);
	}

	if (!checkedTypes.has("WebSite") && foundTypes.size === 0) {
		// Already covered by structured-data-none above; avoid duplicate noise.
	}

	return { issues, passed };
}
