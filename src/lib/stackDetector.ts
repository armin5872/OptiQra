// lib/stackDetector.ts
// Fingerprints the tech stack (CMS, framework, ecommerce platform, page
// builder, server/language, notable libraries) of a scanned page from its
// HTML and response headers. This lets AI-generated fixes be written in the
// site's actual stack (Liquid for Shopify, PHP/hooks for WordPress, TSX for
// Next.js, builder-panel instructions for Wix/Squarespace/Webflow, etc.)
// instead of generic framework-agnostic HTML, which is often unusable as-is.

export type StackCategory =
	| "cms"
	| "ecommerce"
	| "framework"
	| "builder"
	| "language"
	| "server"
	| "hosting"
	| "library";

export interface StackSignal {
	name: string;
	category: StackCategory;
	confidence: "high" | "medium" | "low";
	evidence: string;
}

export interface DetectedStack {
	/** Best-guess primary platform, e.g. "WordPress", "Shopify", "Next.js", "Static HTML". */
	primary: string;
	category: StackCategory | "unknown";
	/** Everything else detected alongside the primary platform (libraries, server, etc). */
	signals: StackSignal[];
	/** One-line human summary, e.g. "WordPress (PHP) · Elementor · jQuery". */
	summary: string;
	/** Instructions for how AI-generated fixes should be delivered for this stack —
	 *  fed straight into the AI fix/insights system prompts. */
	guidance: string;
}

type Headerish = Headers | Record<string, string> | null | undefined;

function getHeader(headers: Headerish, key: string): string {
	if (!headers) return "";
	if (typeof (headers as Headers).get === "function") {
		return (headers as Headers).get(key) || "";
	}
	const rec = headers as Record<string, string>;
	const found = Object.keys(rec).find((k) => k.toLowerCase() === key.toLowerCase());
	return found ? rec[found] : "";
}

interface Rule {
	name: string;
	category: StackCategory;
	confidence: "high" | "medium" | "low";
	test: (html: string, headers: Headerish, poweredBy: string, server: string, generator: string) => string | null; // returns evidence string, or null
}

const RULES: Rule[] = [
	// --- CMS ---
	{
		name: "WordPress",
		category: "cms",
		confidence: "high",
		test: (html, _h, _p, _s, generator) => {
			if (/wp-content|wp-includes|wp-json/i.test(html)) return "wp-content/wp-includes path found in HTML";
			if (/wordpress/i.test(generator)) return `generator meta tag: "${generator}"`;
			return null;
		},
	},
	{
		name: "Drupal",
		category: "cms",
		confidence: "high",
		test: (html, headers) => {
			if (/Drupal\.settings|drupal\.js|\/sites\/default\/files/i.test(html)) return "Drupal.settings / sites/default/files found in HTML";
			const gen = getHeader(headers, "x-generator");
			if (/drupal/i.test(gen)) return `X-Generator header: "${gen}"`;
			return null;
		},
	},
	{
		name: "Joomla",
		category: "cms",
		confidence: "high",
		test: (html) => {
			if (/\/media\/jui\/|Joomla!/i.test(html)) return "Joomla! marker / media/jui path found in HTML";
			return null;
		},
	},
	{
		name: "Wix",
		category: "builder",
		confidence: "high",
		test: (html, headers) => {
			if (/static\.wixstatic\.com|wix-code|X-Wix-/i.test(html)) return "wixstatic.com / X-Wix marker found in HTML";
			if (getHeader(headers, "x-wix-request-id")) return "X-Wix-Request-Id response header present";
			return null;
		},
	},
	{
		name: "Squarespace",
		category: "builder",
		confidence: "high",
		test: (html) => {
			if (/static1\.squarespace\.com|squarespace-cdn\.com|Squarespace\.SQUARESPACE_ROLLUPS/i.test(html)) return "squarespace.com asset domain found in HTML";
			return null;
		},
	},
	{
		name: "Webflow",
		category: "builder",
		confidence: "high",
		test: (html) => {
			if (/data-wf-site|data-wf-page|webflow\.com/i.test(html)) return "data-wf-site/data-wf-page attribute found in HTML";
			return null;
		},
	},
	{
		name: "Shopify",
		category: "ecommerce",
		confidence: "high",
		test: (html, headers) => {
			if (/cdn\.shopify\.com|Shopify\.theme|\/cdn\/shop\//i.test(html)) return "cdn.shopify.com / Shopify.theme found in HTML";
			if (getHeader(headers, "x-shopid") || /shopify/i.test(getHeader(headers, "x-sorting-hat-podid"))) return "Shopify response header present";
			return null;
		},
	},
	{
		name: "BigCommerce",
		category: "ecommerce",
		confidence: "high",
		test: (html) => {
			if (/cdn\d*\.bigcommerce\.com|bigcommerce\.com\/s-/i.test(html)) return "bigcommerce.com asset domain found in HTML";
			return null;
		},
	},
	{
		name: "Magento",
		category: "ecommerce",
		confidence: "high",
		test: (html) => {
			if (/Mage\.Cookies|\/skin\/frontend\/|Magento_/i.test(html)) return "Mage.Cookies / Magento_ marker found in HTML";
			return null;
		},
	},
	{
		name: "WooCommerce",
		category: "ecommerce",
		confidence: "medium",
		test: (html) => {
			if (/woocommerce/i.test(html)) return "woocommerce marker found in HTML";
			return null;
		},
	},

	// --- JS frameworks / meta-frameworks ---
	{
		name: "Next.js",
		category: "framework",
		confidence: "high",
		test: (html) => {
			if (/__NEXT_DATA__|\/_next\/static\//i.test(html)) return "__NEXT_DATA__ / _next/static path found in HTML";
			return null;
		},
	},
	{
		name: "Nuxt",
		category: "framework",
		confidence: "high",
		test: (html) => {
			if (/__NUXT__|\/_nuxt\//i.test(html)) return "__NUXT__ / _nuxt/ path found in HTML";
			return null;
		},
	},
	{
		name: "Gatsby",
		category: "framework",
		confidence: "high",
		test: (html) => {
			if (/___gatsby|\/page-data\//i.test(html)) return "___gatsby / page-data path found in HTML";
			return null;
		},
	},
	{
		name: "SvelteKit",
		category: "framework",
		confidence: "high",
		test: (html) => {
			if (/__sveltekit|\/_app\/immutable\//i.test(html)) return "__sveltekit / _app/immutable path found in HTML";
			return null;
		},
	},
	{
		name: "Angular",
		category: "framework",
		confidence: "high",
		test: (html) => {
			if (/\sng-version="/i.test(html)) return "ng-version attribute found in HTML";
			return null;
		},
	},
	{
		name: "Astro",
		category: "framework",
		confidence: "medium",
		test: (html) => {
			if (/astro-island|data-astro-cid/i.test(html)) return "astro-island / data-astro-cid found in HTML";
			return null;
		},
	},
	{
		name: "Remix",
		category: "framework",
		confidence: "medium",
		test: (html) => {
			if (/__remixContext|\/build\/entry\.client/i.test(html)) return "__remixContext found in HTML";
			return null;
		},
	},
	{
		name: "React",
		category: "library",
		confidence: "low",
		test: (html) => {
			if (/data-reactroot|data-reactid|react-dom/i.test(html)) return "React root/bundle marker found in HTML";
			return null;
		},
	},
	{
		name: "Vue",
		category: "library",
		confidence: "low",
		test: (html) => {
			if (/data-v-[0-9a-f]{6,}|__VUE__|vue\.global\.js/i.test(html)) return "Vue scoped-style attribute / bundle found in HTML";
			return null;
		},
	},

	// --- Server / language ---
	{
		name: "PHP",
		category: "language",
		confidence: "medium",
		test: (_h, _hd, poweredBy) => {
			if (/php/i.test(poweredBy)) return `X-Powered-By header: "${poweredBy}"`;
			return null;
		},
	},
	{
		name: "ASP.NET",
		category: "language",
		confidence: "high",
		test: (html, headers, poweredBy) => {
			if (getHeader(headers, "x-aspnet-version") || /aspnet/i.test(poweredBy)) return "X-AspNet-Version / X-Powered-By: ASP.NET header present";
			if (/__VIEWSTATE/i.test(html)) return "__VIEWSTATE hidden field found in HTML";
			return null;
		},
	},
	{
		name: "Ruby on Rails",
		category: "language",
		confidence: "medium",
		test: (_h, headers) => {
			const cookie = getHeader(headers, "set-cookie");
			if (/_session_id|csrf-param.*rails/i.test(cookie)) return "Rails-style session cookie present";
			return null;
		},
	},
	{
		name: "Laravel",
		category: "language",
		confidence: "medium",
		test: (_h, headers) => {
			const cookie = getHeader(headers, "set-cookie");
			if (/laravel_session|XSRF-TOKEN/i.test(cookie)) return "laravel_session / XSRF-TOKEN cookie present";
			return null;
		},
	},

	// --- Libraries (site-wide, not the primary platform) ---
	{
		name: "jQuery",
		category: "library",
		confidence: "low",
		test: (html) => (/jquery(?:\.min)?\.js/i.test(html) ? "jquery.js script found in HTML" : null),
	},
	{
		name: "Bootstrap",
		category: "library",
		confidence: "low",
		test: (html) => (/bootstrap(?:\.min)?\.(css|js)/i.test(html) ? "bootstrap.css/js reference found in HTML" : null),
	},
	{
		name: "Tailwind CSS",
		category: "library",
		confidence: "low",
		test: (html) => (/tailwindcss|tailwind\.min\.css/i.test(html) ? "Tailwind CSS reference found in HTML" : null),
	},
	{
		name: "Elementor",
		category: "builder",
		confidence: "medium",
		test: (html) => (/elementor/i.test(html) ? "elementor marker found in HTML (WordPress page builder)" : null),
	},

	// --- Hosting ---
	{
		name: "Vercel",
		category: "hosting",
		confidence: "medium",
		test: (_h, headers, _p, server) => {
			if (getHeader(headers, "x-vercel-id") || /vercel/i.test(server)) return "x-vercel-id / Server: Vercel header present";
			return null;
		},
	},
	{
		name: "Netlify",
		category: "hosting",
		confidence: "medium",
		test: (_h, headers, _p, server) => {
			if (getHeader(headers, "x-nf-request-id") || /netlify/i.test(server)) return "x-nf-request-id / Server: Netlify header present";
			return null;
		},
	},
	{
		name: "Cloudflare Pages",
		category: "hosting",
		confidence: "low",
		test: (_h, headers, _p, server) => (/cloudflare/i.test(server) && !getHeader(headers, "x-vercel-id") ? "Server: cloudflare header present" : null),
	},
];

/** Platforms hosted site builders / SaaS CMS's where the user typically has no
 *  direct access to source templates — fixes need to be phrased as panel
 *  settings or custom-code embeds, not raw file edits. */
const NO_CODE_ACCESS_PLATFORMS = new Set(["Wix", "Squarespace", "Webflow", "Shopify", "BigCommerce"]);

const GUIDANCE_BY_PLATFORM: Record<string, string> = {
	WordPress:
		"This site runs on WordPress (PHP). Give fixes as PHP snippets for the active theme's functions.php or template files, using the correct WordPress hook/filter (e.g. wp_head, the_title filter) where relevant. If a well-known plugin (Yoast SEO, Rank Math, WP Rocket, etc.) commonly handles this, mention the plugin setting as a faster alternative to hand-written PHP.",
	Drupal:
		"This site runs on Drupal (PHP). Give fixes as Twig template edits or PHP in a custom module, referencing Drupal's hook system and the specific .html.twig file that would need editing.",
	Joomla:
		"This site runs on Joomla (PHP). Give fixes as edits to the active template's PHP files or as guidance for the relevant Joomla extension/component settings.",
	Wix:
		"This site is built on Wix, a hosted site builder with no direct access to server templates. Give the fix as steps inside the Wix Editor (SEO panel, Custom Code / embed HTML element, page settings) — never as raw HTML/server file edits the user can't reach.",
	Squarespace:
		"This site is built on Squarespace, a hosted site builder with no direct access to server templates. Give the fix as steps inside the Squarespace editor (Page/SEO settings, Code Injection panel) — never as raw server file edits the user can't reach.",
	Webflow:
		"This site is built on Webflow. Give the fix as steps inside the Webflow Designer (Element Settings panel, custom code embed, or site-wide custom code in Project Settings) rather than raw HTML file edits, since most users publish through the Designer, not by editing exported files.",
	Shopify:
		"This site runs on Shopify. Give the fix as a Liquid snippet for the relevant theme file (e.g. theme.liquid, product.liquid, a snippet in /snippets), using Shopify's Liquid objects/filters — not plain framework-agnostic HTML.",
	BigCommerce:
		"This site runs on BigCommerce. Give the fix as a Stencil/Handlebars template edit for the relevant theme file, referencing BigCommerce's template objects/helpers.",
	Magento:
		"This site runs on Magento. Give the fix as a .phtml template edit or layout XML change in the active theme, referencing Magento's block/layout conventions.",
	"Next.js":
		"This site is built with Next.js. Give the fix as a TSX/JSX edit appropriate for the Next.js App Router where possible (e.g. metadata via generateMetadata/the Metadata API in layout.tsx or page.tsx, next/image, next/link) instead of plain HTML, and call out the specific file it likely belongs in.",
	Nuxt:
		"This site is built with Nuxt (Vue). Give the fix as a Vue SFC edit (<script setup>, useHead/useSeoMeta composables, etc.) instead of plain HTML.",
	Gatsby:
		"This site is built with Gatsby (React). Give the fix as a JSX edit using Gatsby conventions (e.g. gatsby-plugin-react-helmet or the Head API) instead of plain HTML.",
	SvelteKit:
		"This site is built with SvelteKit. Give the fix as a Svelte component edit (<svelte:head>, +page.svelte, load functions) instead of plain HTML.",
	Angular:
		"This site is built with Angular. Give the fix as a TypeScript/component edit using Angular's Meta/Title services or template syntax instead of plain HTML.",
	Astro:
		"This site is built with Astro. Give the fix as an .astro component edit instead of plain HTML.",
	Remix:
		"This site is built with Remix. Give the fix as a route module edit (meta export, loader, JSX) instead of plain HTML.",
};

const DEFAULT_GUIDANCE =
	"The exact framework/templating wasn't confidently detected. Give the fix in plain HTML and add a one-line note only if a common framework (React/Next.js) would need different syntax (e.g. className vs class).";

/** Detects the primary platform/stack of a page from its raw HTML and
 *  response headers. Best-effort static fingerprinting — false negatives
 *  (falling back to "Static HTML / unknown") are expected and fine; the
 *  caller should treat that as "give a generic fix" rather than an error. */
export function detectStack(html: string, headers?: Headerish, _url?: string): DetectedStack {
	const poweredBy = getHeader(headers, "x-powered-by");
	const server = getHeader(headers, "server");
	const generatorMatch = /<meta[^>]+name=["']generator["'][^>]+content=["']([^"']+)["']/i.exec(html);
	const generator = generatorMatch?.[1] ?? "";

	const signals: StackSignal[] = [];
	for (const rule of RULES) {
		const evidence = rule.test(html, headers, poweredBy, server, generator);
		if (evidence) {
			signals.push({ name: rule.name, category: rule.category, confidence: rule.confidence, evidence });
		}
	}

	// Primary platform = highest-priority category among what was found:
	// ecommerce/cms/builder/framework beat generic libraries/hosting, since
	// those are what actually determine how a fix should be authored.
	const PRIORITY: StackCategory[] = ["ecommerce", "cms", "builder", "framework", "language", "server", "library", "hosting"];
	let primarySignal: StackSignal | null = null;
	for (const cat of PRIORITY) {
		const candidates = signals.filter((s) => s.category === cat);
		if (candidates.length > 0) {
			// Prefer high confidence, otherwise first match.
			primarySignal = candidates.find((s) => s.confidence === "high") ?? candidates[0];
			break;
		}
	}

	const primary = primarySignal?.name ?? "Static HTML / unknown";
	const category = primarySignal?.category ?? "unknown";

	const others = signals.filter((s) => s !== primarySignal).map((s) => s.name);
	const summary = others.length > 0 ? `${primary} · ${others.slice(0, 4).join(" · ")}` : primary;

	let guidance = GUIDANCE_BY_PLATFORM[primary] ?? DEFAULT_GUIDANCE;
	if (NO_CODE_ACCESS_PLATFORMS.has(primary) === false && (poweredBy || server) && primarySignal == null) {
		// No confident platform, but we do know something about the server —
		// fold it into the default guidance so it's not wasted.
		const hint = [poweredBy && `X-Powered-By: ${poweredBy}`, server && `Server: ${server}`].filter(Boolean).join(", ");
		if (hint) guidance = `${DEFAULT_GUIDANCE} (Server info: ${hint}.)`;
	}

	return { primary, category, signals, summary, guidance };
}

/** Compact shape safe to send client → server and embed in prompts. */
export interface StackPromptContext {
	primary: string;
	summary: string;
	guidance: string;
}

export function toPromptContext(stack: DetectedStack): StackPromptContext {
	return { primary: stack.primary, summary: stack.summary, guidance: stack.guidance };
}
