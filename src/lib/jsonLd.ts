import type { CheerioAPI } from "cheerio";

/**
 * A parsed JSON-LD node — i.e. one object out of a `<script
 * type="application/ld+json">` block (or one item flattened out of an
 * `@graph`). JSON-LD nodes are arbitrary, schema.org-shaped JSON, so this
 * is intentionally a loose `Record<string, unknown>` rather than a fully
 * modeled schema.org type; callers narrow individual fields (`@type`,
 * `sameAs`, etc.) as needed.
 */
export type JsonLdNode = Record<string, unknown>;

/**
 * Walks every `<script type="application/ld+json">` block on the page,
 * parses it, and flattens any `@graph` arrays, returning every node that
 * declares an `@type`. Shared by geoAudit and aeoAudit, which both reason
 * about the same structured-data nodes from different angles.
 */
export function collectJsonLdNodes($: CheerioAPI): JsonLdNode[] {
	const nodes: JsonLdNode[] = [];
	$('script[type="application/ld+json"]').each((_, el) => {
		const raw = $(el).contents().text().trim();
		if (!raw) return;
		try {
			const parsed: unknown = JSON.parse(raw);
			const stack: unknown[] = Array.isArray(parsed) ? [...parsed] : [parsed];
			while (stack.length) {
				const node = stack.pop();
				if (!node || typeof node !== "object") continue;
				const record = node as JsonLdNode;
				if (Array.isArray(record["@graph"])) stack.push(...(record["@graph"] as unknown[]));
				if (record["@type"]) nodes.push(record);
			}
		} catch {
			// malformed JSON-LD is already flagged by the structured-data audit
		}
	});
	return nodes;
}

/** Returns a JSON-LD node's `@type` value(s) as a string array, regardless
 *  of whether the source declared a single type or an array of types. */
export function nodeTypes(node: JsonLdNode): string[] {
	const t = node["@type"];
	if (!t) return [];
	if (Array.isArray(t)) return t.filter((x): x is string => typeof x === "string");
	return typeof t === "string" ? [t] : [];
}

/** Returns a JSON-LD node's `sameAs` value(s) as a string array. */
export function sameAsList(node: JsonLdNode): string[] {
	const s = node["sameAs"];
	if (!s) return [];
	if (Array.isArray(s)) return s.filter((x): x is string => typeof x === "string");
	return typeof s === "string" ? [s] : [String(s)];
}
