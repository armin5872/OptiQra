"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CATEGORIES, TOOLS, toolsByCategory } from "@/lib/toolsRegistry";

const REPO_URL = "https://github.com/armin5872/OptiQra";

const CATEGORY_GLYPH: Record<string, string> = {
	"Meta & Social": "◐",
	"Structured Data": "▤",
	"Robots, Sitemap & Crawling": "◈",
	"Content & Structure": "≡",
	"International SEO": "◔",
	Performance: "▲",
	"Security & Trust": "◆",
	Accessibility: "◉",
	"Tech & Metadata": "◇",
	"AI / GEO / AEO": "✦",
};

export default function ToolsIndexClient() {
	const [query, setQuery] = useState("");
	const grouped = useMemo(() => toolsByCategory(), []);

	const q = query.trim().toLowerCase();
	const filteredGrouped = useMemo(() => {
		if (!q) return grouped;
		const out: typeof grouped = {} as typeof grouped;
		for (const cat of CATEGORIES) {
			const matches = grouped[cat].filter(
				(t) => t.name.toLowerCase().includes(q) || t.tagline.toLowerCase().includes(q) || t.shortName.toLowerCase().includes(q),
			);
			if (matches.length > 0) out[cat] = matches;
		}
		return out;
	}, [q, grouped]);

	const totalShown = Object.values(filteredGrouped).reduce((sum, arr) => sum + arr.length, 0);

	return (
		<div className="tool-page">
			<header className="tool-header">
				<Link href="/" className="tool-brand">
					<span className="brand-mark">
						<svg width="14" height="14" viewBox="0 0 14 14">
							<path
								d="M1 7 L4 7 L5.5 2 L8 12 L9.5 7 L13 7"
								stroke="#fff"
								strokeWidth="1.4"
								fill="none"
								strokeLinecap="round"
								strokeLinejoin="round"
							/>
						</svg>
					</span>
					OptiQra
				</Link>
				<nav className="tool-header-actions">
					<a href={REPO_URL} target="_blank" rel="noreferrer" className="github-header-btn">
						<svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
							<path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
						</svg>
						<span>GitHub</span>
					</a>
				</nav>
			</header>

			<div className="tool-body tools-index-body">
				<div className="tools-index-hero">
					<div className="tool-crumb">
						<span className="tool-crumb-glyph">✦</span>
						<span className="tool-crumb-cat">{TOOLS.length} free tools</span>
					</div>
					<h1 className="tool-title">All OptiQra tools</h1>
					<p className="tool-tagline">
						Every tool below is also part of OptiQra&apos;s full site-wide scan.{" "}
						<Link href="/">Run the full scan</Link> for everything at once, or use any tool here on its
						own — no signup, free forever, and{" "}
						<a href={REPO_URL} target="_blank" rel="noreferrer">
							open source
						</a>
						.
					</p>
				</div>

				<input
					className="tools-search"
					type="text"
					placeholder="Search tools — e.g. “robots”, “schema”, “core web vitals”…"
					value={query}
					onChange={(e) => setQuery(e.target.value)}
				/>

				{totalShown === 0 ? (
					<div className="tools-empty-state">No tools match &ldquo;{query}&rdquo;.</div>
				) : (
					CATEGORIES.map((cat) => {
						const tools = filteredGrouped[cat];
						if (!tools || tools.length === 0) return null;
						return (
							<div className="tools-category" key={cat}>
								<div className="tools-category-head">
									<span className="tools-category-glyph">{CATEGORY_GLYPH[cat]}</span>
									<span className="tools-category-title">{cat}</span>
									<span className="tools-category-count">({tools.length})</span>
								</div>
								<div className="tools-grid">
									{tools.map((t) => (
										<Link key={t.slug} href={`/tools/${t.slug}`} className="tool-card">
											<div className="tool-card-name">{t.shortName}</div>
											<div className="tool-card-tagline">{t.tagline}</div>
											{t.byok && (
												<span className="tool-card-byok">{t.byok === "ai" ? "Bring your own AI key" : "Bring your own API key"}</span>
											)}
										</Link>
									))}
								</div>
							</div>
						);
					})
				)}
			</div>

			<div className="tool-footer-note">
				<p>
					These are individual tools pulled from <strong>OptiQra</strong> — a full-site SEO,
					performance, accessibility, security, and AI-visibility auditor. <Link href="/">Try the whole thing</Link>,
					no signup required, free forever, and{" "}
					<a href={REPO_URL} target="_blank" rel="noreferrer">
						open source
					</a>
					.
				</p>
			</div>
		</div>
	);
}
