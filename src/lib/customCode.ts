/**
 * Applies the "Advanced / Custom code" settings: raw CSS injected into the
 * page, and an optional raw JS snippet that runs in this browser tab.
 *
 * SECURITY NOTES — read before touching how customJS runs:
 *  - OptiQra has no server and no accounts (see README): everything here
 *    only ever affects the person's own browser tab, not other users. That's
 *    what makes offering this at all reasonable.
 *  - It still runs with the same privileges as the rest of the page, in the
 *    same origin — a script pasted in here can read anything else this
 *    origin can reach, including the AI provider API key OptiqRA keeps in
 *    sessionStorage (see useAIProvider.ts) and everything in the settings
 *    IndexedDB. That's why the UI gates it behind an explicit "I understand
 *    the risk" acknowledgement and a manual "Run" action rather than
 *    executing on every keystroke.
 *  - Do not change this to run automatically as the user types, and do not
 *    remove the acknowledgement gate — both exist specifically so a person
 *    can't have code silently executed just by pasting it into the textarea.
 *  - runCustomRule() below is lower-stakes (it only reads an already-finished
 *    scan's JSON, it doesn't touch the live page or the network) but still
 *    executes arbitrary JS, so the same "your own browser, your own risk"
 *    framing applies — see customRulesStore.ts.
 */

const CUSTOM_STYLE_ID = "optiqra-custom-css";

export function applyCustomCSS(css: string) {
	if (typeof document === "undefined") return;
	let tag = document.getElementById(CUSTOM_STYLE_ID) as HTMLStyleElement | null;
	if (!css || !css.trim()) {
		tag?.remove();
		return;
	}
	if (!tag) {
		tag = document.createElement("style");
		tag.id = CUSTOM_STYLE_ID;
		document.head.appendChild(tag);
	}
	tag.textContent = css;
}

export type CustomJSResult = { ok: true } | { ok: false; error: string };

/** Runs `code` in the page's own scope. Only ever call this from an explicit
 *  user action (a "Run" button click, or once on load for previously-saved +
 *  acknowledged code) — never from a per-keystroke effect. */
export function runCustomJS(code: string): CustomJSResult {
	if (typeof window === "undefined") return { ok: true };
	if (!code || !code.trim()) return { ok: true };
	try {
		// eslint-disable-next-line no-new-func -- intentional, opt-in user code execution; see SECURITY NOTES above.
		const fn = new Function(code);
		fn();
		return { ok: true };
	} catch (err) {
		return { ok: false, error: err instanceof Error ? err.message : String(err) };
	}
}

export type CustomRuleFinding = {
	severity?: "critical" | "high" | "medium" | "low" | "info" | string;
	title: string;
	detail?: string;
};

export type CustomRuleResult =
	| { ok: true; findings: CustomRuleFinding[] }
	| { ok: false; error: string };

/** Runs a custom analyzer rule against an already-finished scan's data.
 *  This is the client-side equivalent of adding a check to htmlAudit.ts /
 *  crawlAudit.ts etc. — it never touches the server, so it's safe to run
 *  automatically once a rule is enabled and its code hasn't changed (unlike
 *  runCustomJS, which affects the whole page and is gated behind a manual
 *  "Run" action). Scoped to a plain function so a rule can't reach outside
 *  the `scan` object it's given except via normal same-origin JS privileges
 *  (see SECURITY NOTES above — this is a convenience sandbox, not a security
 *  boundary against a determined attacker; it protects against mistakes in
 *  a rule you wrote yourself, not against code you don't trust). */
export function runCustomRule(code: string, scan: unknown): CustomRuleResult {
	if (!code || !code.trim()) return { ok: true, findings: [] };
	try {
		// eslint-disable-next-line no-new-func -- intentional, opt-in user code execution; see SECURITY NOTES above.
		const fn = new Function("scan", code);
		const result = fn(scan);
		if (!Array.isArray(result)) {
			return { ok: false, error: "Rule must `return` an array of findings." };
		}
		return {
			ok: true,
			findings: result.map((f) => ({
				severity: typeof f?.severity === "string" ? f.severity : "info",
				title: typeof f?.title === "string" ? f.title : "Untitled finding",
				detail: typeof f?.detail === "string" ? f.detail : undefined,
			})),
		};
	} catch (err) {
		return { ok: false, error: err instanceof Error ? err.message : String(err) };
	}
}
