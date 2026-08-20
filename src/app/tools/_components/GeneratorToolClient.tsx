"use client";

import { useState, type ReactNode } from "react";
import type { ToolDef } from "@/lib/toolsRegistry";
import {
	generateMetaTags,
	metaTagWarnings,
	SCHEMA_TYPES,
	generateSchema,
	type SchemaType,
	generateRobotsTxt,
	AI_BOT_NAMES,
	generateSitemapXml,
	generateHreflangTags,
	generateSlug,
	generateCSP,
	generatePermissionsPolicy,
	generateReferrerPolicy,
	generateSecurityTxt,
} from "@/lib/toolGenerators";
import ShareReport from "@/app/components/ShareReport";
import GetBadge from "@/app/components/GetBadge";
import { generatorShareCopy, toolBadgeIntro } from "@/lib/shareMessages";

function GeneratorShareBar({ toolName }: { toolName: string }) {
	return (
		<div className="tool-share-bar">
			<ShareReport
				{...generatorShareCopy({ toolName })}
				buttonLabel="Share this tool"
				shareTitle={toolName}
			/>
			<GetBadge intro={toolBadgeIntro(toolName)} />
		</div>
	);
}

function OutputBlock({ code, language }: { code: string; language?: string }) {
	const [copied, setCopied] = useState(false);
	const copy = async () => {
		try {
			await navigator.clipboard.writeText(code);
			setCopied(true);
			setTimeout(() => setCopied(false), 1500);
		} catch {
			// ignore
		}
	};
	return (
		<div className="tool-output-block">
			<div className="tool-output-bar">
				<span>{language || "Output"}</span>
				<button type="button" className="link-btn" onClick={copy} disabled={!code.trim()}>
					{copied ? "Copied!" : "Copy"}
				</button>
			</div>
			<pre className="tool-output-code">
				<code>{code || "…"}</code>
			</pre>
		</div>
	);
}

function Field({ label, children }: { label: string; children: ReactNode }) {
	return (
		<label className="tool-field">
			<span>{label}</span>
			{children}
		</label>
	);
}

export default function GeneratorToolClient({ tool }: { tool: ToolDef }) {
	switch (tool.generatorKind) {
		case "meta":
			return <MetaGenerator toolName={tool.shortName} />;
		case "schema":
			return <SchemaGenerator toolName={tool.shortName} />;
		case "robots":
			return <RobotsGenerator toolName={tool.shortName} />;
		case "sitemap":
			return <SitemapGenerator toolName={tool.shortName} />;
		case "hreflang":
			return <HreflangGenerator toolName={tool.shortName} />;
		case "slug":
			return <SlugGenerator toolName={tool.shortName} />;
		case "security-headers":
			return <SecurityHeadersGenerator toolName={tool.shortName} />;
		default:
			return null;
	}
}

function MetaGenerator({ toolName }: { toolName: string }) {
	const [title, setTitle] = useState("");
	const [description, setDescription] = useState("");
	const [url, setUrl] = useState("");
	const [siteName, setSiteName] = useState("");
	const [imageUrl, setImageUrl] = useState("");
	const [twitterHandle, setTwitterHandle] = useState("");

	const input = { title, description, url, siteName, imageUrl, twitterHandle };
	const output = generateMetaTags(input);
	const warnings = metaTagWarnings(input);

	return (
		<div className="tool-panel">
			<div className="tool-form-grid">
				<Field label="Page title">
					<input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Your Page Title — Brand" />
				</Field>
				<Field label="Meta description">
					<textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="A concise, compelling summary of the page (120–160 characters)." />
				</Field>
				<Field label="Page URL">
					<input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/page" />
				</Field>
				<Field label="Site name">
					<input value={siteName} onChange={(e) => setSiteName(e.target.value)} placeholder="Your Site" />
				</Field>
				<Field label="Social share image URL">
					<input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://example.com/og-image.png" />
				</Field>
				<Field label="Twitter/X handle">
					<input value={twitterHandle} onChange={(e) => setTwitterHandle(e.target.value)} placeholder="@yourhandle" />
				</Field>
			</div>

			{title && (
				<div className="serp-preview">
					<div className="serp-url">{url || "https://example.com"}</div>
					<div className="serp-title">{title}</div>
					<div className="serp-desc">{description || "A meta description will appear here once you add one."}</div>
				</div>
			)}

			{warnings.length > 0 && (title || description) && (
				<ul className="tool-warnings">
					{warnings.map((w, i) => (
						<li key={i}>{w}</li>
					))}
				</ul>
			)}

			<OutputBlock code={output} language="html" />
			{title && <GeneratorShareBar toolName={toolName} />}
		</div>
	);
}

function SchemaGenerator({ toolName }: { toolName: string }) {
	const [type, setType] = useState<SchemaType>("Organization");
	const [fields, setFields] = useState<Record<string, string>>({});
	const def = SCHEMA_TYPES.find((s) => s.value === type)!;
	const output = generateSchema(type, fields);

	return (
		<div className="tool-panel">
			<Field label="Schema type">
				<select
					value={type}
					onChange={(e) => {
						setType(e.target.value as SchemaType);
						setFields({});
					}}
				>
					{SCHEMA_TYPES.map((s) => (
						<option key={s.value} value={s.value}>
							{s.label}
						</option>
					))}
				</select>
			</Field>
			<div className="tool-form-grid">
				{def.fields.map((f) => (
					<Field key={f.key} label={f.label}>
						{f.type === "textarea" || f.type === "list" ? (
							<textarea rows={f.type === "list" ? 4 : 3} value={fields[f.key] || ""} onChange={(e) => setFields((p) => ({ ...p, [f.key]: e.target.value }))} />
						) : (
							<input value={fields[f.key] || ""} onChange={(e) => setFields((p) => ({ ...p, [f.key]: e.target.value }))} />
						)}
					</Field>
				))}
			</div>
			<OutputBlock code={output} language="json-ld" />
			{Object.values(fields).some((v) => v.trim()) && <GeneratorShareBar toolName={toolName} />}
		</div>
	);
}

function RobotsGenerator({ toolName }: { toolName: string }) {
	const [disallow, setDisallow] = useState("/admin\n/cart");
	const [sitemapUrl, setSitemapUrl] = useState("");
	const [allowSearchBots, setAllowSearchBots] = useState(true);
	const [allowedAiBots, setAllowedAiBots] = useState<string[]>(AI_BOT_NAMES);

	const output = generateRobotsTxt({
		disallowPaths: disallow.split("\n").map((s) => s.trim()).filter(Boolean),
		sitemapUrl: sitemapUrl.trim() || undefined,
		allowSearchBots,
		allowedAiBots,
	});

	const toggleBot = (bot: string) => {
		setAllowedAiBots((prev) => (prev.includes(bot) ? prev.filter((b) => b !== bot) : [...prev, bot]));
	};

	return (
		<div className="tool-panel">
			<div className="tool-form-grid">
				<Field label="Disallow paths (one per line)">
					<textarea rows={4} value={disallow} onChange={(e) => setDisallow(e.target.value)} />
				</Field>
				<Field label="Sitemap URL (optional)">
					<input value={sitemapUrl} onChange={(e) => setSitemapUrl(e.target.value)} placeholder="https://example.com/sitemap.xml" />
				</Field>
			</div>
			<label className="tool-checkbox-row">
				<input type="checkbox" checked={allowSearchBots} onChange={(e) => setAllowSearchBots(e.target.checked)} />
				Allow standard search engines (Googlebot, Bingbot, etc.)
			</label>
			<div className="tool-extra-title" style={{ marginTop: 12 }}>
				AI crawlers — toggle which ones may access the site
			</div>
			<div className="bot-grid">
				{AI_BOT_NAMES.map((bot) => (
					<button type="button" key={bot} className={`bot-pill toggle ${allowedAiBots.includes(bot) ? "allowed" : "blocked"}`} onClick={() => toggleBot(bot)}>
						{bot}: {allowedAiBots.includes(bot) ? "Allowed" : "Blocked"}
					</button>
				))}
			</div>
			<OutputBlock code={output} language="robots.txt" />
			<GeneratorShareBar toolName={toolName} />
		</div>
	);
}

function SitemapGenerator({ toolName }: { toolName: string }) {
	const [urls, setUrls] = useState("");
	const output = generateSitemapXml(urls.split("\n"));
	return (
		<div className="tool-panel">
			<Field label="URLs (one per line)">
				<textarea rows={8} value={urls} onChange={(e) => setUrls(e.target.value)} placeholder={"https://example.com/\nhttps://example.com/about\nhttps://example.com/blog"} />
			</Field>
			<OutputBlock code={output} language="xml" />
			{urls.trim() && <GeneratorShareBar toolName={toolName} />}
		</div>
	);
}

function HreflangGenerator({ toolName }: { toolName: string }) {
	const [rows, setRows] = useState([{ lang: "en", url: "" }, { lang: "es", url: "" }]);
	const [includeXDefault, setIncludeXDefault] = useState(true);
	const output = generateHreflangTags(rows, includeXDefault);

	const updateRow = (i: number, key: "lang" | "url", value: string) => {
		setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, [key]: value } : r)));
	};

	return (
		<div className="tool-panel">
			{rows.map((r, i) => (
				<div className="tool-input-row" key={i}>
					<input style={{ maxWidth: 120 }} value={r.lang} onChange={(e) => updateRow(i, "lang", e.target.value)} placeholder="en" />
					<input value={r.url} onChange={(e) => updateRow(i, "url", e.target.value)} placeholder="https://example.com/en/page" />
				</div>
			))}
			<button type="button" className="link-btn" onClick={() => setRows((p) => [...p, { lang: "", url: "" }])}>
				+ Add another locale
			</button>
			<label className="tool-checkbox-row" style={{ marginTop: 12 }}>
				<input type="checkbox" checked={includeXDefault} onChange={(e) => setIncludeXDefault(e.target.checked)} />
				Include x-default
			</label>
			<OutputBlock code={output} language="html" />
			{rows.some((r) => r.url.trim()) && <GeneratorShareBar toolName={toolName} />}
		</div>
	);
}

function SlugGenerator({ toolName }: { toolName: string }) {
	const [title, setTitle] = useState("");
	const { slug, warnings } = generateSlug(title);
	return (
		<div className="tool-panel">
			<Field label="Title or phrase">
				<input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="10 Best Practices for On-Page SEO in 2026" />
			</Field>
			{warnings.length > 0 && (
				<ul className="tool-warnings">
					{warnings.map((w, i) => (
						<li key={i}>{w}</li>
					))}
				</ul>
			)}
			<OutputBlock code={slug} language="slug" />
			{title.trim() && <GeneratorShareBar toolName={toolName} />}
		</div>
	);
}

function SecurityHeadersGenerator({ toolName }: { toolName: string }) {
	const [scriptSrc, setScriptSrc] = useState("");
	const [imageSrc, setImageSrc] = useState("");
	const [allowFrames, setAllowFrames] = useState(false);
	const [contact, setContact] = useState("");

	const input = {
		allowedScriptSrc: scriptSrc.split(",").map((s) => s.trim()).filter(Boolean),
		allowedImageSrc: imageSrc.split(",").map((s) => s.trim()).filter(Boolean),
		allowFrames,
		securityContact: contact,
	};

	return (
		<div className="tool-panel">
			<div className="tool-form-grid">
				<Field label="Additional allowed script sources (comma-separated)">
					<input value={scriptSrc} onChange={(e) => setScriptSrc(e.target.value)} placeholder="https://cdn.example.com" />
				</Field>
				<Field label="Additional allowed image sources (comma-separated)">
					<input value={imageSrc} onChange={(e) => setImageSrc(e.target.value)} placeholder="https://images.example.com" />
				</Field>
				<Field label="Security contact (for security.txt)">
					<input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="mailto:security@example.com" />
				</Field>
			</div>
			<label className="tool-checkbox-row">
				<input type="checkbox" checked={allowFrames} onChange={(e) => setAllowFrames(e.target.checked)} />
				Allow this site to be framed by itself
			</label>
			<OutputBlock code={generateCSP(input)} language="Content-Security-Policy" />
			<OutputBlock code={generatePermissionsPolicy()} language="Permissions-Policy" />
			<OutputBlock code={generateReferrerPolicy()} language="Referrer-Policy" />
			<OutputBlock code={generateSecurityTxt(input)} language="security.txt" />
			<GeneratorShareBar toolName={toolName} />
		</div>
	);
}
