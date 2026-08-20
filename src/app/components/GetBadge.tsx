"use client";

// Save this file as components/GetBadge.tsx (flattened here alongside the
// rest of the uploaded files). Imported from page.tsx as
// `@/components/GetBadge`.
//
// Renders a "Get badge" button with a dropdown showing a live preview of the
// "SEO by OptiQra" badge plus copyable HTML / Markdown embed snippets. The
// badge itself is served as a static file at /badge.svg (see
// public/badge.svg), so it's just as fast and cacheable as any other static
// asset on the OptiQra deployment — no third-party CDN required.

import { useEffect, useRef, useState } from "react";

const SITE_URL = "https://optiqra.vercel.app";
const BADGE_SVG_URL = `${SITE_URL}/badge.svg`;

type Snippet = "html" | "markdown" | "url";

const DEFAULT_INTRO =
	"Show visitors your site is optimized. Drop this badge in your footer, README, or about page — it links back to OptiQra.";

export default function GetBadge({ intro }: { intro?: string }) {
	const [open, setOpen] = useState(false);
	const [copied, setCopied] = useState<Snippet | null>(null);
	const menuRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!open) return;
		const onClick = (e: MouseEvent) => {
			if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
				setOpen(false);
			}
		};
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") setOpen(false);
		};
		document.addEventListener("mousedown", onClick);
		document.addEventListener("keydown", onKey);
		return () => {
			document.removeEventListener("mousedown", onClick);
			document.removeEventListener("keydown", onKey);
		};
	}, [open]);

	const htmlSnippet = `<a href="${SITE_URL}" target="_blank" rel="noopener noreferrer">\n  <img src="${BADGE_SVG_URL}" alt="SEO by OptiQra" width="176" height="36" />\n</a>`;
	const markdownSnippet = `[![SEO by OptiQra](${BADGE_SVG_URL})](${SITE_URL})`;

	const copy = async (kind: Snippet, text: string) => {
		try {
			await navigator.clipboard.writeText(text);
			setCopied(kind);
			setTimeout(() => setCopied(null), 2000);
		} catch {
			// clipboard unavailable — silently ignore
		}
	};

	return (
		<div className="report-download get-badge" ref={menuRef}>
			<button
				className="report-download-btn get-badge-btn"
				onClick={() => setOpen((v) => !v)}
				aria-haspopup="menu"
				aria-expanded={open}
			>
				Get badge
				<span className="report-download-caret">{open ? "▲" : "▼"}</span>
			</button>

			{open && (
				<div className="report-download-menu get-badge-menu" role="menu">
					<p className="get-badge-intro">{intro || DEFAULT_INTRO}</p>
					{/* eslint-disable-next-line @next/next/no-img-element */}
					<img
						className="get-badge-preview"
						src="/badge.svg"
						alt="SEO by OptiQra badge preview"
						width={176}
						height={36}
					/>

					<div className="get-badge-block">
						<div className="get-badge-block-head">
							<span>HTML</span>
							<button type="button" onClick={() => copy("html", htmlSnippet)}>
								{copied === "html" ? "Copied!" : "Copy"}
							</button>
						</div>
						<pre className="get-badge-code">{htmlSnippet}</pre>
					</div>

					<div className="get-badge-block">
						<div className="get-badge-block-head">
							<span>Markdown</span>
							<button type="button" onClick={() => copy("markdown", markdownSnippet)}>
								{copied === "markdown" ? "Copied!" : "Copy"}
							</button>
						</div>
						<pre className="get-badge-code">{markdownSnippet}</pre>
					</div>

					<div className="get-badge-block">
						<div className="get-badge-block-head">
							<span>Direct image URL</span>
							<button type="button" onClick={() => copy("url", BADGE_SVG_URL)}>
								{copied === "url" ? "Copied!" : "Copy"}
							</button>
						</div>
						<pre className="get-badge-code">{BADGE_SVG_URL}</pre>
					</div>
				</div>
			)}
		</div>
	);
}
