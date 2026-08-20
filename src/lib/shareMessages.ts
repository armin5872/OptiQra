/**
 * Per-engine share/badge copy for the standalone tool pages
 * (src/app/tools/_components/*).
 *
 * The full site-wide scan (src/app/page.tsx) has its own share message
 * built inline, since it's talking about a whole report rather than a
 * single tool run. Everything here exists so each of the four tool
 * "engines" (audit / generator / pagespeed / ai) shares something that
 * actually describes what the person just did, instead of one line
 * copy-pasted across every tool page.
 */

import { SITE_URL } from "@/app/components/ShareReport";

function greet(name?: string) {
	return name?.trim() ? `Hi ${name.trim()}! ` : "";
}

export function auditShareCopy(opts: { toolName: string; url: string; score: number; issueCount: number }) {
	const { toolName, url, score, issueCount } = opts;
	return {
		subject: `${toolName} report — ${url} scored ${score}/100`,
		buildMessage: (name?: string) =>
			`${greet(name)}I just ran the ${toolName} on ${url} with OptiQra and it scored ${score}/100 (${issueCount} issue${issueCount === 1 ? "" : "s"} found). It's a free tool with no signup — try it: ${SITE_URL}`,
	};
}

export function generatorShareCopy(opts: { toolName: string }) {
	const { toolName } = opts;
	return {
		subject: `Free ${toolName} — OptiQra`,
		buildMessage: (name?: string) =>
			`${greet(name)}I just used OptiQra's ${toolName} to generate ready-to-paste markup for my site — free, no signup, no API key needed for this one: ${SITE_URL}`,
	};
}

export function pagespeedShareCopy(opts: { url: string }) {
	const { url } = opts;
	return {
		subject: `Core Web Vitals for ${url} — OptiQra`,
		buildMessage: (name?: string) =>
			`${greet(name)}I just checked Core Web Vitals (LCP, CLS, INP) for ${url} using OptiQra's free PageSpeed tool: ${SITE_URL}`,
	};
}

export function aiLlmsTxtShareCopy(opts: { url: string }) {
	const { url } = opts;
	return {
		subject: `llms.txt generated for ${url} — OptiQra`,
		buildMessage: (name?: string) =>
			`${greet(name)}I just generated an llms.txt file for ${url} with OptiQra's free AI-powered generator (bring-your-own API key, nothing sent to OptiQra's servers): ${SITE_URL}`,
	};
}

export function aiSeoFixShareCopy(opts: { issueTitle: string }) {
	const { issueTitle } = opts;
	return {
		subject: `AI-generated fix for "${issueTitle}" — OptiQra`,
		buildMessage: (name?: string) =>
			`${greet(name)}I just got an AI-generated fix for "${issueTitle}" from OptiQra's free AI SEO Fix Generator: ${SITE_URL}`,
	};
}

/** Short, tool-specific "why this badge" line for GetBadge on each tool page. */
export function toolBadgeIntro(toolShortName: string) {
	return `Ran the ${toolShortName} and liked what you saw? Show visitors your site is optimized — drop this badge in your footer, README, or about page. It links back to OptiQra.`;
}
