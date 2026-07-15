// lib/jsRenderer.ts
//
// Executes a fetched page's JavaScript in a sandboxed jsdom environment and
// returns the resulting (post-hydration) DOM, so audits can see what a real
// browser visitor — or a JS-executing crawler like Googlebot — would see,
// instead of only the raw server response cheerio normally works from.
//
// This closes a real gap in the existing audits: geoAudit's renderability
// check previously only *guessed* whether a page needed JavaScript to render
// (few words + several <script> tags + an app-shell marker like id="root").
// That heuristic can't tell a genuinely broken SPA from a page that's simply
// short, or a heavy-script page that still server-renders its content fine.
// Actually running the scripts turns that guess into a measurement.
//
// SECURITY NOTE: this executes arbitrary third-party JavaScript from
// whatever URL the caller passes in. jsdom's sandbox is not a hard security
// boundary — there is no OS/process-level isolation here, just a vm context
// — so this carries meaningfully more risk than the rest of this auditor
// (which only ever parses HTML text with cheerio, never executes it). Treat
// "render JavaScript" as an explicit opt-in for sites the person running the
// scan already has reason to trust, the same assumption assertSafeUrl's SSRF
// guard already leans on for fetching in the first place. It is bounded by
// hard wall-clock timeouts below so a malicious or broken page can't hang a
// scan indefinitely, but that bounds *time*, not everything a script could
// attempt inside the sandbox.

import { JSDOM, VirtualConsole } from "jsdom";
import { issue, pass, type Issue } from "@/lib/auditUtils";

export interface RenderResult {
	/** Serialized HTML of the DOM after scripts ran and the render budget elapsed. */
	html: string;
	/** Rendered page's visible body text, whitespace-collapsed. */
	text: string;
	renderTimeMs: number;
	/** True if we hit the hard timeout before the render budget finished naturally. */
	timedOut: boolean;
	/** Errors thrown by the page's own scripts (uncaught exceptions, failed resource loads). */
	scriptErrors: string[];
	/** console.error() calls made by the page's scripts. */
	consoleErrors: string[];
}

export interface RenderOptions {
	/** How long to let the page's JS run (timers, fetches, hydration) before snapshotting the DOM. */
	renderBudgetMs?: number;
	/** Absolute ceiling on the whole render, regardless of renderBudgetMs. */
	hardTimeoutMs?: number;
	signal?: AbortSignal;
}

const DEFAULT_RENDER_BUDGET_MS = 4000;
const DEFAULT_HARD_TIMEOUT_MS = 9000;

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
	return new Promise((resolve) => {
		const timer = setTimeout(resolve, ms);
		if (signal) {
			const onAbort = () => {
				clearTimeout(timer);
				resolve();
			};
			if (signal.aborted) onAbort();
			else signal.addEventListener("abort", onAbort, { once: true });
		}
	});
}

/**
 * Loads `html` as if it had been served from `url`, executes its scripts
 * inside jsdom (including external <script src> resources, since
 * `resources: "usable"` is set), waits `renderBudgetMs` for hydration /
 * fetch-driven content to settle, then returns a snapshot of the resulting
 * DOM. Always resolves — render failures are reported in `scriptErrors`
 * rather than thrown, so a broken page never blocks the rest of a scan.
 */
export async function renderPageJs(
	url: string,
	html: string,
	options: RenderOptions = {},
): Promise<RenderResult> {
	const renderBudgetMs = Math.max(0, options.renderBudgetMs ?? DEFAULT_RENDER_BUDGET_MS);
	const hardTimeoutMs = Math.max(
		renderBudgetMs,
		options.hardTimeoutMs ?? DEFAULT_HARD_TIMEOUT_MS,
	);

	const scriptErrors: string[] = [];
	const consoleErrors: string[] = [];

	const virtualConsole = new VirtualConsole();
	// jsdom's own internal errors (script exceptions, failed resource loads,
	// "Not implemented" for unsupported browser APIs) surface here rather
	// than as thrown exceptions, since scripts run asynchronously.
	virtualConsole.on("jsdomError", (err: any) => {
		scriptErrors.push(err?.message ?? String(err));
	});
	virtualConsole.on("error", (...args: unknown[]) => {
		consoleErrors.push(args.map(String).join(" "));
	});
	// Deliberately not forwarding console.log/warn/info — those are page
	// noise we don't need for an audit and would just clutter results.

	const started = Date.now();
	let dom: JSDOM | undefined;
	let timedOut = false;

	try {
		dom = new JSDOM(html, {
			url,
			runScripts: "dangerously",
			resources: "usable",
			pretendToBeVisual: true,
			virtualConsole,
		});

		const elapsed = () => Date.now() - started;
		const remainingBudget = Math.max(0, renderBudgetMs - elapsed());
		const remainingHardCap = Math.max(0, hardTimeoutMs - elapsed());
		const waitMs = Math.min(remainingBudget, remainingHardCap);

		if (remainingHardCap <= 0) {
			timedOut = true;
		} else {
			await sleep(waitMs, options.signal);
			if (elapsed() >= hardTimeoutMs) timedOut = true;
		}
	} catch (err: any) {
		scriptErrors.push(err?.message ?? String(err));
	}

	const renderTimeMs = Date.now() - started;

	if (!dom) {
		return {
			html,
			text: "",
			renderTimeMs,
			timedOut,
			scriptErrors,
			consoleErrors,
		};
	}

	let renderedHtml = html;
	let renderedText = "";
	try {
		renderedHtml = dom.serialize();
		renderedText =
			dom.window.document.body?.textContent?.replace(/\s+/g, " ").trim() ?? "";
	} catch (err: any) {
		scriptErrors.push(err?.message ?? String(err));
	} finally {
		// Stop any timers/intervals/pending fetches the page scheduled so they
		// don't keep running (or keep the Node process alive) after we've
		// already taken our snapshot.
		try {
			dom.window.close();
		} catch {
			// already closed — nothing to clean up
		}
	}

	return {
		html: renderedHtml,
		text: renderedText,
		renderTimeMs,
		timedOut,
		scriptErrors,
		consoleErrors,
	};
}

/** Turns a RenderResult into an audit category so the renderer's own health
 *  (did it time out, did the page's scripts error) is visible in the report
 *  rather than silently affecting other categories' scores. */
export function analyzeJsRendering(result: RenderResult): {
	issues: Issue[];
	passed: Issue[];
} {
	const issues: Issue[] = [];
	const passed: Issue[] = [];

	if (result.timedOut) {
		issues.push(
			issue(
				"js-render-timeout",
				"JavaScript rendering timed out",
				`The page's scripts were still running after ${Math.round(result.renderTimeMs)}ms, so this scan snapshotted whatever had rendered by then. Content that only appears after a slow fetch or long-running script may be missing from this scan.`,
				"If the page depends on slow client-side data fetching, consider server-rendering or statically generating the initial content instead.",
				4,
			),
		);
	} else {
		passed.push(pass("js-render-timeout", "JavaScript finished rendering within the time budget"));
	}

	if (result.scriptErrors.length > 0) {
		const sample = result.scriptErrors.slice(0, 3).join(" | ");
		issues.push(
			issue(
				"js-render-errors",
				`${result.scriptErrors.length} script error${result.scriptErrors.length === 1 ? "" : "s"} during rendering`,
				`The page's own JavaScript threw errors while this scan rendered it: ${sample}${result.scriptErrors.length > 3 ? ` (+${result.scriptErrors.length - 3} more)` : ""}. Errors like these can also break rendering for real visitors and JS-executing crawlers.`,
				"Open the page in a browser devtools console to reproduce and fix the underlying script error.",
				3,
			),
		);
	} else {
		passed.push(pass("js-render-errors", "No script errors during rendering"));
	}

	return { issues, passed };
}
