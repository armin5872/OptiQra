/**
 * "Propose to upstream repo" — lets a visitor draft a real pull request
 * against the OptiQra GitHub repo for a custom rule or a settings preset
 * they built, without OptiqRA ever touching a GitHub token.
 *
 * How it works: GitHub's own "create new file" web UI
 * (https://github.com/OWNER/REPO/new/BRANCH) accepts `filename` and `value`
 * query params to prefill a new file. If the visitor doesn't have push
 * access — true for virtually everyone — GitHub automatically forks the
 * repo for them and walks them through opening a PR, all under their own
 * account. There is no server here, no embedded credential, and no way for
 * this button to merge anything by itself: the repo owner still reviews
 * and merges every PR exactly like any other GitHub contribution.
 *
 * Do not "upgrade" this to call the GitHub API with a stored token instead —
 * that would mean embedding a repo-write credential in client-side code
 * shipped to every visitor, which anyone could extract from the JS bundle
 * and use to push to the repo directly. The URL-based flow is the only
 * version of this feature that's safe to ship.
 */

const REPO_OWNER = "armin5872";
const REPO_NAME = "OptiQra";
const REPO_BRANCH = "main";

function slugify(name: string): string {
	const slug = name
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
	return slug || "custom-rule";
}

export type ContributableRule = {
	name: string;
	description: string;
	code: string;
};

/** Builds the GitHub URL that opens a prefilled "propose new file" draft for
 *  a custom analyzer rule, under community-rules/. */
export function buildRuleContributeUrl(rule: ContributableRule): string {
	const filename = `community-rules/${slugify(rule.name)}.js`;
	const value = [
		`// ${rule.name}`,
		rule.description ? `// ${rule.description}` : null,
		"//",
		"// Submitted via OptiQra's \"Propose to upstream repo\" button.",
		"// Runs client-side against a finished scan's JSON — see",
		"// src/lib/customRulesStore.ts and src/lib/customCode.ts for how",
		"// these execute today, and consider whether this should become a",
		"// real server-side check in htmlAudit.ts / crawlAudit.ts instead.",
		"",
		rule.code,
		"",
	]
		.filter((line) => line !== null)
		.join("\n");

	const params = new URLSearchParams({
		filename,
		value,
		message: `Add community rule: ${rule.name}`,
		description:
			rule.description || "Proposed via the OptiQra app's \"Propose to upstream repo\" button.",
	});

	return `https://github.com/${REPO_OWNER}/${REPO_NAME}/new/${REPO_BRANCH}?${params.toString()}`;
}

/** Builds the same kind of URL for a general appearance/layout/typography
 *  settings preset someone wants to suggest as a built-in theme. */
export function buildPresetContributeUrl(name: string, settingsJSON: string): string {
	const filename = `community-presets/${slugify(name)}.json`;
	const params = new URLSearchParams({
		filename,
		value: settingsJSON,
		message: `Add community preset: ${name}`,
		description: "Proposed via the OptiQra app's \"Propose to upstream repo\" button.",
	});
	return `https://github.com/${REPO_OWNER}/${REPO_NAME}/new/${REPO_BRANCH}?${params.toString()}`;
}
