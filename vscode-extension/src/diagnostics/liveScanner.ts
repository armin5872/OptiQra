// Lightweight, position-aware scanner used for live "as you type" squiggles
// and hovers — the "SEO Intelligence" feature. The deeper ported engine
// (jsxAutoFix/markupFixes) tells you *that* a file has an issue and can
// rewrite it, but its callback API (fixed/skipped/needsAI) doesn't carry a
// string offset back for a single match, so live diagnostics use their own
// compact, purpose-built pattern set instead — same rule *substance*
// (mirrors the categories documented in the OptiQra wiki), same category/
// severity vocabulary, but self-contained so every finding carries an exact
// range for VS Code to underline. The heavier ported engine still does the
// actual content-writing work when the user clicks Fix (see fix/fixController.ts).
import type { Severity } from "../../../src/lib/auditUtils";

export interface LiveFinding {
	ruleId: string;
	title: string;
	detail: string;
	category: string;
	severity: Severity;
	start: number; // character offset into the document text
	end: number;
	quickFixAvailable: boolean;
}

interface Rule {
	id: string;
	title: (m: RegExpExecArray) => string;
	detail: (m: RegExpExecArray) => string;
	category: string;
	severity: Severity;
	pattern: RegExp;
	/** Return the [start,end) offset within the match to underline — defaults to the whole match. */
	range?: (m: RegExpExecArray) => [number, number];
	quickFix?: boolean;
	/** Only run this rule for files matching this test (defaults to always). */
	fileTest?: (path: string) => boolean;
}

const IMG_NO_ALT = /<(img|Image|NuxtImg|nuxt-img)\b(?![^>]*\balt=)[^>]*>/g;
const A_TARGET_BLANK_NO_NOOPENER = /<a\b(?=[^>]*target=["']_blank["'])(?![^>]*\brel=["'][^"']*noopener)[^>]*>/g;
const GENERIC_CTA = /<(a|button)\b[^>]*>\s*(Click here|Submit|Learn more|Read more|Here|Go)\s*<\/\1>/gi;
const CLICKABLE_DIV = /<div\b(?=[^>]*\b(onClick|onclick|@click)\s*=)(?![^>]*\brole=)[^>]*>/g;
const CONSOLE_DEBUGGER = /\b(console\.(log|debug|warn)|debugger)\b\s*[;(]/g;
const HARDCODED_SECRET = /\b(?:api[_-]?key|secret|token|password)\s*[:=]\s*["'][A-Za-z0-9_\-./+]{12,}["']/gi;
const AUTOPLAY_NO_MUTE = /<video\b(?=[^>]*\bautoplay)(?![^>]*\bmuted)[^>]*>/g;
const IMG_NO_LAZY = /<(img|Image)\b(?![^>]*\bloading=)[^>]*>/g;
const MISSING_FORM_LABEL = /<input\b(?![^>]*\btype=["'](hidden|submit|button)["'])(?![^>]*\baria-label)(?![^>]*\bid=)[^>]*>/g;
const HASH_ONLY_LINK = /<a\b[^>]*href=["']#["'][^>]*>/g;
const TITLE_MISSING = /<title>\s*<\/title>/g;
const META_DESC_MISSING_ATTR = /<meta\s+name=["']description["']\s+content=["']\s*["']/gi;
const MISSING_LIST_KEY = /\.map\(\s*\([^)]*\)\s*=>\s*<[A-Za-z][\w.]*(?![^>]*\bkey=)/g;
const XSS_RISKY_BINDING = /dangerouslySetInnerHTML|v-html\s*=/g;
const MIXED_CONTENT = /src=["']http:\/\/[^"']+["']/g;

const RULES: Rule[] = [
	{ id: "img-missing-alt", title: () => "Image missing alt text", detail: () => "Screen readers and AI crawlers can't describe this image without alt text.", category: "Accessibility", severity: "high", pattern: IMG_NO_ALT, quickFix: true },
	{ id: "a-target-blank-noopener", title: () => "target=\"_blank\" without rel=\"noopener\"", detail: () => "Opens a reverse-tabnabbing security hole and hurts performance (the new tab can access window.opener).", category: "Security", severity: "medium", pattern: A_TARGET_BLANK_NO_NOOPENER, quickFix: true },
	{ id: "generic-cta-text", title: (m) => `Generic CTA text: "${m[2]}"`, detail: () => "Generic link/button text ('Click here', 'Submit') is bad for SEO anchor-text signal and for screen-reader users navigating by link list.", category: "SEO", severity: "low", pattern: GENERIC_CTA, quickFix: true },
	{ id: "clickable-div-no-role", title: () => "Clickable <div> missing role/keyboard support", detail: () => "A div with an onClick handler isn't focusable or announced to assistive tech without role and tabIndex.", category: "Accessibility", severity: "high", pattern: CLICKABLE_DIV, quickFix: true },
	{ id: "console-debugger-statement", title: (m) => `Leftover ${m[1]}`, detail: () => "Debug statements shouldn't ship to production.", category: "Best Practices", severity: "low", pattern: CONSOLE_DEBUGGER, quickFix: true },
	{ id: "hardcoded-secret", title: () => "Possible hardcoded secret", detail: () => "A string shaped like an API key/token/password is hardcoded in source — this ships to the client bundle or gets committed to git history.", category: "Security", severity: "critical", pattern: HARDCODED_SECRET, quickFix: false },
	{ id: "autoplay-video-not-muted", title: () => "Autoplaying <video> without muted", detail: () => "Most browsers block autoplay with sound anyway, but leaving muted off also breaks accessibility expectations.", category: "Best Practices", severity: "low", pattern: AUTOPLAY_NO_MUTE, quickFix: true },
	{ id: "img-no-lazy-loading", title: () => "Image missing loading=\"lazy\"", detail: () => "Below-the-fold images without lazy loading hurt LCP/initial page weight.", category: "Performance", severity: "low", pattern: IMG_NO_LAZY, quickFix: true },
	{ id: "form-field-missing-label", title: () => "Form field has no accessible label", detail: () => "An <input> with no id (for a <label for>) and no aria-label is invisible to screen-reader users.", category: "Accessibility", severity: "high", pattern: MISSING_FORM_LABEL, quickFix: false },
	{ id: "hash-only-link", title: () => "Link with href=\"#\" only", detail: () => "A bare '#' href does nothing for keyboard/AT users and pollutes the page's link graph for crawlers.", category: "SEO", severity: "low", pattern: HASH_ONLY_LINK, quickFix: false },
	{ id: "title-empty", title: () => "Empty <title> tag", detail: () => "Search results fall back to a generic/unreadable title.", category: "SEO", severity: "critical", pattern: TITLE_MISSING, quickFix: false, fileTest: (p) => /\.html?$/i.test(p) },
	{ id: "meta-description-empty", title: () => "Empty meta description", detail: () => "Search engines will auto-generate a snippet instead of the one you control.", category: "SEO", severity: "high", pattern: META_DESC_MISSING_ATTR, quickFix: false, fileTest: (p) => /\.html?$/i.test(p) },
	{ id: "missing-list-key", title: () => "Missing key prop in list render", detail: () => "React needs a stable 'key' on elements produced inside .map() to diff lists correctly.", category: "Best Practices", severity: "low", pattern: MISSING_LIST_KEY, quickFix: false, fileTest: (p) => /\.(jsx|tsx)$/i.test(p) },
	{ id: "xss-risky-binding", title: () => "XSS-risk binding (raw HTML injection)", detail: () => "dangerouslySetInnerHTML / v-html render raw HTML — safe only if the source is fully trusted/sanitized.", category: "Security", severity: "high", pattern: XSS_RISKY_BINDING, quickFix: false },
	{ id: "mixed-content-http", title: () => "Mixed content: http:// resource on an https page", detail: () => "Browsers block or warn on http:// subresources loaded from an https page.", category: "Security", severity: "medium", pattern: MIXED_CONTENT, quickFix: false },
];

export function scanTextForFindings(path: string, text: string): LiveFinding[] {
	const findings: LiveFinding[] = [];
	for (const rule of RULES) {
		if (rule.fileTest && !rule.fileTest(path)) continue;
		rule.pattern.lastIndex = 0;
		let m: RegExpExecArray | null;
		let guard = 0;
		while ((m = rule.pattern.exec(text)) && guard < 4000) {
			guard++;
			const [start, end] = rule.range ? rule.range(m) : [m.index, m.index + m[0].length];
			findings.push({
				ruleId: rule.id,
				title: rule.title(m),
				detail: rule.detail(m),
				category: rule.category,
				severity: rule.severity,
				start,
				end,
				quickFixAvailable: !!rule.quickFix,
			});
			if (!rule.pattern.global) break;
		}
	}
	return findings;
}
