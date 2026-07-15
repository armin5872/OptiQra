import { openDB, type DBSchema, type IDBPDatabase } from "idb";

/**
 * User-authored "custom rules" — small JS snippets that post-process a
 * finished scan's results to surface additional findings.
 *
 * These run ENTIRELY client-side, over data already returned to the browser
 * by /api/analyze and stored in scanStore. That's a deliberate boundary:
 * the real crawler/analyzer (siteCrawler.ts, htmlAudit.ts, etc.) runs
 * server-side in the Next.js API route, and there is no safe way to let
 * arbitrary site visitors inject code that executes there — that would be
 * remote code execution against your own server, reachable by anyone who
 * loads the page, not a "feature". So custom rules operate on the client,
 * same trust boundary as the Advanced > Custom code tab.
 *
 * To turn a rule into a real scanner feature (running for every user,
 * server-side, benefiting from the same review the rest of the codebase
 * gets), use the "Propose to upstream repo" button — see githubContribute.ts.
 */

export type CustomRule = {
	id: string;
	name: string;
	description: string;
	code: string;
	enabled: boolean;
	createdAt: number;
	updatedAt: number;
};

const DB_NAME = "optiqra-custom-rules";
const DB_VERSION = 1;
const STORE_NAME = "rules";

interface RulesDB extends DBSchema {
	rules: {
		key: string;
		value: CustomRule;
		indexes: { "by-createdAt": number };
	};
}

let dbPromise: Promise<IDBPDatabase<RulesDB>> | null = null;

function getDB() {
	if (typeof indexedDB === "undefined") {
		return Promise.reject(new Error("IndexedDB is only available in the browser"));
	}
	if (!dbPromise) {
		dbPromise = openDB<RulesDB>(DB_NAME, DB_VERSION, {
			upgrade(db) {
				if (!db.objectStoreNames.contains(STORE_NAME)) {
					const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
					store.createIndex("by-createdAt", "createdAt");
				}
			},
		});
	}
	return dbPromise;
}

export const EXAMPLE_RULE_CODE = `// "scan" is the full report object from your last scan.
// Return an array of findings — each becomes a row under the "Custom rules" category.
const findings = [];

for (const page of scan.pages ?? []) {
  if ((page.title ?? "").length > 60) {
    findings.push({
      severity: "medium",
      title: "Title tag is long",
      detail: \`\${page.url} has a \${page.title.length}-character title\`,
    });
  }
}

return findings;`;

export async function getAllRules(): Promise<CustomRule[]> {
	try {
		const db = await getDB();
		const all = await db.getAllFromIndex(STORE_NAME, "by-createdAt");
		return all.reverse();
	} catch {
		return [];
	}
}

export async function saveRule(
	rule: Omit<CustomRule, "id" | "createdAt" | "updatedAt"> & { id?: string },
): Promise<CustomRule> {
	const db = await getDB();
	const existing = rule.id ? await db.get(STORE_NAME, rule.id) : undefined;
	const now = Date.now();
	const record: CustomRule = {
		id: rule.id ?? crypto.randomUUID(),
		name: rule.name,
		description: rule.description,
		code: rule.code,
		enabled: rule.enabled,
		createdAt: existing?.createdAt ?? now,
		updatedAt: now,
	};
	await db.put(STORE_NAME, record);
	return record;
}

export async function deleteRule(id: string): Promise<void> {
	const db = await getDB();
	await db.delete(STORE_NAME, id);
}
